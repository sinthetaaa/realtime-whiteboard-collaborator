import {
  Redis,
} from '@upstash/redis';


export const PRESENCE_HEARTBEAT_INTERVAL_MS =
  10_000;

export const PRESENCE_STALE_AFTER_MS =
  30_000;

const PRESENCE_KEY_TTL_SECONDS =
  120;

const PRESENCE_KEY_PREFIX =
  'sayantika:whiteboard:v1:presence:';


let redis:
  | Redis
  | null = null;


const getRedis =
  () => {
    if (redis) {
      return redis;
    }

    const url =
      process.env
        .UPSTASH_REDIS_REST_URL
        ?.trim();

    const token =
      process.env
        .UPSTASH_REDIS_REST_TOKEN
        ?.trim();

    if (
      !url ||
      !token
    ) {
      throw new Error(
        'BOARD_PRESENCE_STORAGE_UNAVAILABLE',
      );
    }

    redis =
      new Redis({
        url,
        token,
      });

    return redis;
  };


const presenceKeyOf =
  (
    roomId: string,
  ) =>
    `${PRESENCE_KEY_PREFIX}${roomId}`;


/*
 * Keep writes for one room ordered.
 *
 * This matters when a heartbeat and the final socket close
 * happen at nearly the same time. A final removal queued
 * after an in-flight heartbeat must win rather than allowing
 * the older heartbeat to recreate the user afterward.
 */
const roomWriteChains =
  new Map<
    string,
    Promise<void>
  >();


const serializeRoomWrite =
  async (
    roomId: string,
    operation:
      () => Promise<void>,
  ) => {
    const previous =
      roomWriteChains.get(
        roomId,
      ) ??
      Promise.resolve();

    const current =
      previous
        .catch(
          () => {
            /*
             * One failed presence write must not poison
             * future writes for the room.
             */
          },
        )
        .then(
          operation,
        );

    roomWriteChains.set(
      roomId,
      current,
    );

    try {
      await current;
    } finally {
      if (
        roomWriteChains.get(
          roomId,
        ) === current
      ) {
        roomWriteChains.delete(
          roomId,
        );
      }
    }
  };


export const refreshBoardPresence =
  async (
    roomId: string,
    userIds: readonly string[],
    seenAt = Date.now(),
  ) => {
    const uniqueUserIds =
      Array.from(
        new Set(
          userIds
            .map(
              (userId) =>
                userId.trim(),
            )
            .filter(Boolean),
        ),
      );

    if (
      uniqueUserIds.length === 0
    ) {
      return;
    }

    await serializeRoomWrite(
      roomId,
      async () => {
        /*
         * One Redis operation per room heartbeat:
         *
         * - user ID is the sorted-set member
         * - last-seen epoch milliseconds is the score
         * - the whole presence key receives a short TTL
         *
         * A server crash therefore cannot leave presence
         * storage alive indefinitely.
         */
        await getRedis()
          .eval(
            `
              local key =
                KEYS[1]

              local score =
                tonumber(ARGV[1])

              local ttl =
                tonumber(ARGV[2])

              for i = 3, #ARGV do
                redis.call(
                  'ZADD',
                  key,
                  score,
                  ARGV[i]
                )
              end

              redis.call(
                'EXPIRE',
                key,
                ttl
              )

              return
                #ARGV - 2
            `,
            [
              presenceKeyOf(
                roomId,
              ),
            ],
            [
              String(
                seenAt,
              ),
              String(
                PRESENCE_KEY_TTL_SECONDS,
              ),
              ...uniqueUserIds,
            ],
          );
      },
    );
  };


export const removeBoardPresence =
  async (
    roomId: string,
    userId: string,
  ) => {
    const normalizedUserId =
      userId.trim();

    if (!normalizedUserId) {
      return;
    }

    await serializeRoomWrite(
      roomId,
      async () => {
        await getRedis()
          .zrem(
            presenceKeyOf(
              roomId,
            ),
            normalizedUserId,
          );
      },
    );
  };

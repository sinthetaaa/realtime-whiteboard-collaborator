import {
  redis,
} from './redis';


export const BOARD_PRESENCE_STALE_AFTER_MS =
  30_000;

export const BOARD_PRESENCE_MAX_ROOMS =
  30;


const PRESENCE_KEY_PREFIX =
  'sayantika:whiteboard:v1:presence:';


const presenceKeyOf =
  (
    roomId: string,
  ) =>
    `${PRESENCE_KEY_PREFIX}${roomId}`;


export type BoardPresenceState = {
  roomId: string;
  online: boolean;
  activeCount: number;
  activeUserIds: string[];
};


const parseMemberList =
  (
    value: unknown,
  ): string[] => {
    if (!Array.isArray(value)) {
      throw new Error(
        'BOARD_PRESENCE_RESULT_INVALID',
      );
    }

    return Array.from(
      new Set(
        value
          .map(
            (member) =>
              String(
                member ?? '',
              ).trim(),
          )
          .filter(Boolean),
      ),
    );
  };


export const readBoardPresenceBatch =
  async (
    roomIds: readonly string[],
    now = Date.now(),
  ): Promise<BoardPresenceState[]> => {
    if (
      roomIds.length === 0
    ) {
      return [];
    }

    if (!redis) {
      throw new Error(
        'BOARD_PRESENCE_STORAGE_UNAVAILABLE',
      );
    }

    /*
     * Presence is authoritative only while the realtime
     * server has refreshed a user's score recently.
     *
     * One Lua call handles the entire homepage batch:
     *
     * 1. remove scores at or before the stale cutoff
     * 2. return only currently active authenticated users
     *
     * The realtime server separately gives each room's
     * presence key a short TTL, so an entirely inactive
     * room also disappears without a reader.
     */
    const cutoff =
      now -
      BOARD_PRESENCE_STALE_AFTER_MS;

    const raw =
      await redis.eval(
        `
          local cutoff =
            tonumber(ARGV[1])

          local output = {}

          for i, key in ipairs(KEYS) do
            redis.call(
              'ZREMRANGEBYSCORE',
              key,
              '-inf',
              cutoff
            )

            local members =
              redis.call(
                'ZRANGEBYSCORE',
                key,
                cutoff + 1,
                '+inf'
              )

            output[i] =
              members
          end

          return output
        `,
        roomIds.map(
          presenceKeyOf,
        ),
        [
          String(
            cutoff,
          ),
        ],
      );

    if (
      !Array.isArray(raw) ||
      raw.length !==
        roomIds.length
    ) {
      throw new Error(
        'BOARD_PRESENCE_RESULT_INVALID',
      );
    }

    return roomIds.map(
      (
        roomId,
        index,
      ) => {
        const activeUserIds =
          parseMemberList(
            raw[index],
          );

        return {
          roomId,

          online:
            activeUserIds.length >
            0,

          activeCount:
            activeUserIds.length,

          activeUserIds,
        };
      },
    );
  };

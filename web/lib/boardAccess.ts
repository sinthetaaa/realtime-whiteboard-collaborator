import {
  redis,
} from './redis';


const ACCESS_TTL_SECONDS =
  60 * 60 * 24 * 7;


const hostKeyOf = (
  roomId: string,
) =>
  `sayantika:whiteboard:v1:access:${roomId}:host`;


const removedKeyOf = (
  roomId: string,
) =>
  `sayantika:whiteboard:v1:access:${roomId}:removed`;


const requireRedis = () => {
  if (!redis) {
    throw new Error(
      'BOARD_ACCESS_STORAGE_UNAVAILABLE',
    );
  }

  return redis;
};


const parseScriptResult = (
  value: unknown,
): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(
      'BOARD_ACCESS_SCRIPT_RESULT_INVALID',
    );
  }

  return value.map(
    (item) =>
      String(item ?? ''),
  );
};


export type BoardAccessState = {
  hostUserId: string | null;
  removed: boolean;
  isHost: boolean;
};


export const getBoardAccess =
  async (
    roomId: string,
    userId: string,
  ): Promise<BoardAccessState> => {
    const client =
      requireRedis();

    const [
      hostUserId,
      removedValue,
    ] =
      await Promise.all([
        client.get<string>(
          hostKeyOf(roomId),
        ),
        client.sismember(
          removedKeyOf(roomId),
          userId,
        ),
      ]);

    const removed =
      removedValue === 1;

    return {
      hostUserId:
        typeof hostUserId ===
          'string' &&
        hostUserId.trim()
          ? hostUserId.trim()
          : null,

      removed,

      isHost:
        hostUserId ===
        userId,
    };
  };


export const claimBoardHost =
  async (
    roomId: string,
    userId: string,
  ) => {
    const client =
      requireRedis();

    const result =
      parseScriptResult(
        await client.eval(
          `
          local hostKey = KEYS[1]
          local removedKey = KEYS[2]

          local userId = ARGV[1]
          local ttl = tonumber(ARGV[2])

          if redis.call(
            'SISMEMBER',
            removedKey,
            userId
          ) == 1 then
            return {
              'REMOVED',
              ''
            }
          end

          local host =
            redis.call(
              'GET',
              hostKey
            )

          if not host then
            redis.call(
              'SET',
              hostKey,
              userId,
              'EX',
              ttl,
              'NX'
            )

            host =
              redis.call(
                'GET',
                hostKey
              )
          end

          if host then
            redis.call(
              'EXPIRE',
              hostKey,
              ttl
            )
          end

          return {
            'OK',
            host or ''
          }
          `,
          [
            hostKeyOf(roomId),
            removedKeyOf(roomId),
          ],
          [
            userId,
            String(
              ACCESS_TTL_SECONDS,
            ),
          ],
        ),
      );

    return {
      status:
        result[0],
      hostUserId:
        result[1] ||
        null,
    };
  };


export const transferBoardHost =
  async (
    roomId: string,
    actorUserId: string,
    targetUserId: string,
  ) => {
    const client =
      requireRedis();

    const result =
      parseScriptResult(
        await client.eval(
          `
          local hostKey = KEYS[1]
          local removedKey = KEYS[2]

          local actor = ARGV[1]
          local target = ARGV[2]
          local ttl = tonumber(ARGV[3])

          local host =
            redis.call(
              'GET',
              hostKey
            )

          if host ~= actor then
            return {
              'NOT_HOST',
              host or ''
            }
          end

          if redis.call(
            'SISMEMBER',
            removedKey,
            target
          ) == 1 then
            return {
              'TARGET_REMOVED',
              host
            }
          end

          redis.call(
            'SET',
            hostKey,
            target,
            'EX',
            ttl
          )

          return {
            'OK',
            target
          }
          `,
          [
            hostKeyOf(roomId),
            removedKeyOf(roomId),
          ],
          [
            actorUserId,
            targetUserId,
            String(
              ACCESS_TTL_SECONDS,
            ),
          ],
        ),
      );

    return {
      status:
        result[0],
      hostUserId:
        result[1] ||
        null,
    };
  };


export const removeBoardUser =
  async (
    roomId: string,
    actorUserId: string,
    targetUserId: string,
  ) => {
    const client =
      requireRedis();

    const result =
      parseScriptResult(
        await client.eval(
          `
          local hostKey = KEYS[1]
          local removedKey = KEYS[2]

          local actor = ARGV[1]
          local target = ARGV[2]
          local ttl = tonumber(ARGV[3])

          local host =
            redis.call(
              'GET',
              hostKey
            )

          if host ~= actor then
            return {
              'NOT_HOST',
              host or ''
            }
          end

          if actor == target then
            return {
              'SELF_REMOVE',
              host
            }
          end

          redis.call(
            'SADD',
            removedKey,
            target
          )

          redis.call(
            'EXPIRE',
            removedKey,
            ttl
          )

          redis.call(
            'EXPIRE',
            hostKey,
            ttl
          )

          return {
            'OK',
            host
          }
          `,
          [
            hostKeyOf(roomId),
            removedKeyOf(roomId),
          ],
          [
            actorUserId,
            targetUserId,
            String(
              ACCESS_TTL_SECONDS,
            ),
          ],
        ),
      );

    return {
      status:
        result[0],
      hostUserId:
        result[1] ||
        null,
    };
  };

export const createBoardWithOwner =
  async (
    roomId: string,
    ownerUserId: string,
    metadataJson: string,
  ): Promise<{
    status:
      | 'CREATED'
      | 'COLLISION';
  }> => {
    const client =
      requireRedis();

    const metadataKey =
      `sayantika:whiteboard:v1:meta:${roomId}`;

    const boardKey =
      `sayantika:whiteboard:v1:board:${roomId}`;

    const result =
      parseScriptResult(
        await client.eval(
          `
          local hostKey = KEYS[1]
          local removedKey = KEYS[2]
          local metadataKey = KEYS[3]
          local boardKey = KEYS[4]

          local owner = ARGV[1]
          local metadata = ARGV[2]
          local ttl = tonumber(ARGV[3])

          if
            redis.call(
              'EXISTS',
              hostKey
            ) == 1 or
            redis.call(
              'EXISTS',
              removedKey
            ) == 1 or
            redis.call(
              'EXISTS',
              metadataKey
            ) == 1 or
            redis.call(
              'EXISTS',
              boardKey
            ) == 1
          then
            return {
              'COLLISION'
            }
          end

          redis.call(
            'SET',
            hostKey,
            owner,
            'EX',
            ttl
          )

          redis.call(
            'SET',
            metadataKey,
            metadata,
            'EX',
            ttl
          )

          return {
            'CREATED'
          }
          `,
          [
            hostKeyOf(roomId),
            removedKeyOf(roomId),
            metadataKey,
            boardKey,
          ],
          [
            ownerUserId,
            metadataJson,
            String(
              ACCESS_TTL_SECONDS,
            ),
          ],
        ),
      );

    const status =
      result[0];

    if (
      status !== 'CREATED' &&
      status !== 'COLLISION'
    ) {
      throw new Error(
        'BOARD_CREATE_INVALID_RESULT',
      );
    }

    return {
      status,
    };
  };

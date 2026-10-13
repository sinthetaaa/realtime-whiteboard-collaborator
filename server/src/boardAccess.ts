import {
  Redis,
} from '@upstash/redis';


let redis:
  | Redis
  | null = null;


const removedKeyOf = (
  roomId: string,
) =>
  `sayantika:whiteboard:v1:access:${roomId}:removed`;


const getRedis = () => {
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
      'BOARD_ACCESS_STORAGE_UNAVAILABLE',
    );
  }

  redis =
    new Redis({
      url,
      token,
    });

  return redis;
};


export const isBoardUserRemoved =
  async (
    roomId: string,
    userId: string,
  ) => {
    const value =
      await getRedis()
        .sismember(
          removedKeyOf(roomId),
          userId,
        );

    return (
      value === 1
    );
  };


export const getRemovedBoardUserIds =
  async (
    roomId: string,
  ): Promise<Set<string>> => {
    const values =
      await getRedis()
        .smembers(
          removedKeyOf(roomId),
        );

    return new Set(
      values
        .map(
          (value) =>
            String(value).trim(),
        )
        .filter(Boolean),
    );
  };

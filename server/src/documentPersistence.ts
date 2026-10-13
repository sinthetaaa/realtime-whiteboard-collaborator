import {
  Redis,
} from '@upstash/redis';

import {
  applyUpdate,
  encodeStateAsUpdate,
  Doc,
} from 'yjs';


const YJS_DOCUMENT_TTL_SECONDS =
  60 * 60 * 24 * 7;

const YJS_DOCUMENT_KEY_PREFIX =
  'sayantika:whiteboard:v1:yjs:';


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
        'YJS_PERSISTENCE_STORAGE_UNAVAILABLE',
      );
    }

    redis =
      new Redis({
        url,
        token,
      });

    return redis;
  };


const documentKeyOf =
  (
    roomId: string,
  ) =>
    `${YJS_DOCUMENT_KEY_PREFIX}${roomId}`;


const decodeStoredUpdate =
  (
    encoded: string,
  ) => {
    const buffer =
      Buffer.from(
        encoded,
        'base64',
      );

    if (
      buffer.byteLength === 0
    ) {
      throw new Error(
        'YJS_PERSISTENCE_EMPTY_UPDATE',
      );
    }

    return new Uint8Array(
      buffer,
    );
  };


export const loadPersistedYjsDocument =
  async (
    roomId: string,
  ): Promise<{
    document: Doc | null;
    bytes: number;
  }> => {
    const encoded =
      await getRedis()
        .get<string>(
          documentKeyOf(
            roomId,
          ),
        );

    if (!encoded) {
      return {
        document:
          null,
        bytes:
          0,
      };
    }

    if (
      typeof encoded !==
      'string'
    ) {
      throw new Error(
        'YJS_PERSISTENCE_INVALID_PAYLOAD',
      );
    }

    const update =
      decodeStoredUpdate(
        encoded,
      );

    const document =
      new Doc();

    /*
     * Redis contains a complete Yjs document update.
     * Hocuspocus 3.2.4 accepts a returned Y.Doc from
     * onLoadDocument and merges it into its own
     * server-managed Document before client sync.
     */
    applyUpdate(
      document,
      update,
    );

    return {
      document,
      bytes:
        update.byteLength,
    };
  };


const storeChains =
  new Map<
    string,
    Promise<void>
  >();


export const storePersistedYjsDocument =
  async (
    roomId: string,
    document: Doc,
  ): Promise<{
    bytes: number;
  }> => {
    let storedBytes =
      0;

    const previous =
      storeChains.get(
        roomId,
      ) ??
      Promise.resolve();

    /*
     * Serialize writes per room.
     *
     * Even though Hocuspocus debounces document stores,
     * network writes can otherwise overlap. Serializing
     * them prevents an older Redis SET from completing
     * after a newer one and replacing newer state.
     */
    const current =
      previous
        .catch(
          () => {
            /*
             * A failed previous persistence attempt must
             * not permanently poison the room's queue.
             */
          },
        )
        .then(
          async () => {
            const update =
              encodeStateAsUpdate(
                document,
              );

            if (
              update.byteLength === 0
            ) {
              throw new Error(
                'YJS_PERSISTENCE_EMPTY_DOCUMENT_UPDATE',
              );
            }

            storedBytes =
              update.byteLength;

            const encoded =
              Buffer
                .from(
                  update,
                )
                .toString(
                  'base64',
                );

            await getRedis()
              .set(
                documentKeyOf(
                  roomId,
                ),
                encoded,
                {
                  ex:
                    YJS_DOCUMENT_TTL_SECONDS,
                },
              );
          },
        );

    storeChains.set(
      roomId,
      current,
    );

    try {
      await current;
    } finally {
      if (
        storeChains.get(
          roomId,
        ) === current
      ) {
        storeChains.delete(
          roomId,
        );
      }
    }

    return {
      bytes:
        storedBytes,
    };
  };

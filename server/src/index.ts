import {
  loadEnvFile,
} from 'node:process';

import {
  Server,
} from '@hocuspocus/server';

import {
  getRemovedBoardUserIds,
  isBoardUserRemoved,
} from './boardAccess';

import {
  verifyRealtimeToken,
} from './realtimeAuth';

import {
  loadPersistedYjsDocument,
  storePersistedYjsDocument,
} from './documentPersistence';

import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  refreshBoardPresence,
  removeBoardPresence,
} from './presence';


try {
  loadEnvFile(
    '.env.local',
  );
} catch {
  // Production environments provide secrets directly.
}


const port =
  Number(
    process.env.PORT ??
    process.env.WS_PORT ??
    4000,
  );

const address =
  process.env.HOST ??
  '0.0.0.0';


type TrackedConnection = {
  socketId: string;
  close: () => void;
};


const activeConnections =
  new Map<
    string,
    Map<
      string,
      Map<
        string,
        TrackedConnection
      >
    >
  >();


const addActiveConnection = (
  roomId: string,
  userId: string,
  connection: TrackedConnection,
) => {
  let roomConnections =
    activeConnections.get(
      roomId,
    );

  if (!roomConnections) {
    roomConnections =
      new Map();

    activeConnections.set(
      roomId,
      roomConnections,
    );
  }

  let userConnections =
    roomConnections.get(
      userId,
    );

  if (!userConnections) {
    userConnections =
      new Map();

    roomConnections.set(
      userId,
      userConnections,
    );
  }

  userConnections.set(
    connection.socketId,
    connection,
  );
};


const removeActiveConnection = (
  roomId: string,
  userId: string,
  socketId: string,
) => {
  const roomConnections =
    activeConnections.get(
      roomId,
    );

  if (!roomConnections) {
    return;
  }

  const userConnections =
    roomConnections.get(
      userId,
    );

  if (!userConnections) {
    return;
  }

  userConnections.delete(
    socketId,
  );

  if (
    userConnections.size === 0
  ) {
    roomConnections.delete(
      userId,
    );
  }

  if (
    roomConnections.size === 0
  ) {
    activeConnections.delete(
      roomId,
    );
  }
};


const hasActiveUserConnections = (
  roomId: string,
  userId: string,
) => {
  const roomConnections =
    activeConnections.get(
      roomId,
    );

  const userConnections =
    roomConnections?.get(
      userId,
    );

  return Boolean(
    userConnections &&
    userConnections.size > 0,
  );
};


let presenceHeartbeatRunning =
  false;


const refreshActivePresence =
  async () => {
    if (presenceHeartbeatRunning) {
      return;
    }

    presenceHeartbeatRunning =
      true;

    try {
      const seenAt =
        Date.now();

      const rooms =
        Array.from(
          activeConnections.entries(),
        );

      await Promise.all(
        rooms.map(
          async ([
            roomId,
            roomConnections,
          ]) => {
            const userIds =
              Array.from(
                roomConnections.keys(),
              );

            if (
              userIds.length === 0
            ) {
              return;
            }

            await refreshBoardPresence(
              roomId,
              userIds,
              seenAt,
            );
          },
        ),
      );
    } catch (error: unknown) {
      /*
       * Presence should never take collaboration down.
       * Redis/API availability is handled separately by
       * the homepage presence read path.
       */
      console.error(
        '[presence] heartbeat failed',
        error,
      );
    } finally {
      presenceHeartbeatRunning =
        false;
    }
  };


let enforcementRunning =
  false;


const enforceRemovedConnections =
  async () => {
    if (enforcementRunning) {
      return;
    }

    enforcementRunning =
      true;

    try {
      const rooms =
        Array.from(
          activeConnections.keys(),
        );

      for (
        const roomId
        of rooms
      ) {
        const roomConnections =
          activeConnections.get(
            roomId,
          );

        if (
          !roomConnections ||
          roomConnections.size === 0
        ) {
          continue;
        }

        const removedUserIds =
          await getRemovedBoardUserIds(
            roomId,
          );

        if (
          removedUserIds.size === 0
        ) {
          continue;
        }

        for (
          const userId
          of removedUserIds
        ) {
          const userConnections =
            roomConnections.get(
              userId,
            );

          if (!userConnections) {
            continue;
          }

          const connections =
            Array.from(
              userConnections.values(),
            );

          for (
            const connection
            of connections
          ) {
            console.log(
              `[authz] revoking realtime connection room=${roomId} user=${userId} socket=${connection.socketId}`,
            );

            connection.close();
          }
        }
      }
    } catch (error: unknown) {
      console.error(
        '[authz] removal enforcement failed',
        error,
      );
    } finally {
      enforcementRunning =
        false;
    }
  };


const server =
  new Server({
    port,
    address,

    /*
     * Hocuspocus 3.2.4 defaults:
     *   debounce: 2000 ms
     *   maxDebounce: 10000 ms
     *   unloadImmediately: true
     *
     * Keep these explicit because they are now part
     * of the persistence/durability contract.
     */
    debounce:
      2000,

    maxDebounce:
      10000,

    unloadImmediately:
      true,

    onLoadDocument:
      async ({
        documentName,
      }) => {
        const result =
          await loadPersistedYjsDocument(
            documentName,
          );

        if (!result.document) {
          console.log(
            `[persistence] load-miss room=${documentName}`,
          );

          return null;
        }

        console.log(
          `[persistence] loaded room=${documentName} bytes=${result.bytes}`,
        );

        return result.document;
      },

    onStoreDocument:
      async ({
        documentName,
        document,
      }) => {
        const result =
          await storePersistedYjsDocument(
            documentName,
            document,
          );

        console.log(
          `[persistence] stored room=${documentName} bytes=${result.bytes}`,
        );
      },

    onAuthenticate:
      async ({
        token,
        documentName,
      }) => {
        const identity =
          await verifyRealtimeToken(
            token,
            documentName,
          );

        const removed =
          await isBoardUserRemoved(
            identity.roomId,
            identity.userId,
          );

        if (removed) {
          throw new Error(
            'REMOVED_FROM_BOARD',
          );
        }

        return {
          userId:
            identity.userId,
          roomId:
            identity.roomId,
        };
      },

    connected:
      async ({
        context,
        documentName,
        connection,
      }) => {
        const userId =
          typeof context?.userId ===
            'string'
            ? context.userId.trim()
            : '';

        if (!userId) {
          connection.close();
          return;
        }

        /*
         * Close the race where the user is removed
         * after token verification but before the
         * document connection is fully established.
         */
        const removed =
          await isBoardUserRemoved(
            documentName,
            userId,
          );

        if (removed) {
          connection.close();
          return;
        }

        addActiveConnection(
          documentName,
          userId,
          connection,
        );

        /*
         * Authentication has already established the
         * trusted room/user identity at this point.
         * Presence is therefore written only by the
         * realtime server, never by browser input.
         */
        void refreshBoardPresence(
          documentName,
          [
            userId,
          ],
        ).catch(
          (error: unknown) => {
            console.error(
              `[presence] connect refresh failed room=${documentName} user=${userId}`,
              error,
            );
          },
        );

        connection.onClose(
          () => {
            removeActiveConnection(
              documentName,
              userId,
              connection.socketId,
            );

            /*
             * A browser can have several realtime sockets
             * for the same authenticated user. Remove the
             * Redis member only after the final local
             * connection has closed.
             *
             * Production currently uses one realtime
             * replica. A multi-replica topology would need
             * replica-aware presence before retaining this
             * eager removal behavior.
             */
            if (
              !hasActiveUserConnections(
                documentName,
                userId,
              )
            ) {
              void removeBoardPresence(
                documentName,
                userId,
              ).catch(
                (error: unknown) => {
                  console.error(
                    `[presence] disconnect removal failed room=${documentName} user=${userId}`,
                    error,
                  );
                },
              );
            }
          },
        );
      },
  });


const enforcementTimer =
  setInterval(
    () => {
      void enforceRemovedConnections();
    },
    1000,
  );

enforcementTimer.unref();


const presenceHeartbeatTimer =
  setInterval(
    () => {
      void refreshActivePresence();
    },
    PRESENCE_HEARTBEAT_INTERVAL_MS,
  );

presenceHeartbeatTimer.unref();


server
  .listen()
  .then(() => {
    const displayHost =
      address === '0.0.0.0'
        ? 'localhost'
        : address;

    console.log(
      `✅ Hocuspocus running at ws://${displayHost}:${port}`,
    );
  })
  .catch((error: unknown) => {
    clearInterval(
      enforcementTimer,
    );

    clearInterval(
      presenceHeartbeatTimer,
    );

    console.error(
      '❌ Failed to start Hocuspocus server',
      error,
    );

    process.exitCode = 1;
  });

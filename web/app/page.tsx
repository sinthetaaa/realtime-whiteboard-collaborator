'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Link2,
  Play,
  Plus,
} from 'lucide-react';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  type BoardRegistryEntry,
  extractRoomId,
  readBoardRegistry,
} from '../lib/boardRegistry';

import styles from './home.module.css';

const initialsFor = (
  name: string,
) => {
  const parts =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
};

const formatUpdated = (
  timestamp: number,
  now: number,
) => {
  if (!timestamp || !now) {
    return 'Recently';
  }

  const delta =
    Math.max(
      0,
      now - timestamp,
    );

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (delta < minute) {
    return 'Just now';
  }

  if (delta < hour) {
    const minutes =
      Math.floor(delta / minute);

    return `${minutes}m ago`;
  }

  if (delta < day) {
    const hours =
      Math.floor(delta / hour);

    return `${hours}h ago`;
  }

  if (delta < 2 * day) {
    return 'Yesterday';
  }

  if (delta < 7 * day) {
    const days =
      Math.floor(delta / day);

    return `${days}d ago`;
  }

  return new Intl.DateTimeFormat(
    'en',
    {
      month: 'short',
      day: 'numeric',
    },
  ).format(new Date(timestamp));
};

export default function Home() {
  const router = useRouter();

  const [boards, setBoards] =
    useState<BoardRegistryEntry[]>([]);

  const [joinValue, setJoinValue] =
    useState('');

  const [joinError, setJoinError] =
    useState('');

  const [now, setNow] =
    useState(0);

  useEffect(() => {
    const loadBoards = () => {
      setBoards(
        readBoardRegistry()
          .sort(
            (a, b) =>
              b.lastOpenedAt -
              a.lastOpenedAt,
          )
          .slice(0, 12),
      );

      setNow(Date.now());
    };

    loadBoards();

    const timer =
      window.setInterval(
        () => {
          setNow(Date.now());
        },
        5000,
      );

    window.addEventListener(
      'focus',
      loadBoards,
    );

    window.addEventListener(
      'storage',
      loadBoards,
    );

    window.addEventListener(
      'wb-boards-updated',
      loadBoards,
    );

    return () => {
      window.clearInterval(timer);

      window.removeEventListener(
        'focus',
        loadBoards,
      );

      window.removeEventListener(
        'storage',
        loadBoards,
      );

      window.removeEventListener(
        'wb-boards-updated',
        loadBoards,
      );
    };
  }, []);

  const sortedBoards =
    useMemo(
      () =>
        [...boards].sort(
          (a, b) =>
            b.lastOpenedAt -
            a.lastOpenedAt,
        ),
      [boards],
    );

  const [

    creatingBoard,

    setCreatingBoard,

  ] = useState(false);



  const createBoard =

    async () => {

      if (creatingBoard) {

        return;

      }


      setCreatingBoard(

        true,

      );


      try {

        const sessionResponse =

          await fetch(

            '/api/auth/session',

            {

              method:

                'POST',

              cache:

                'no-store',

            },

          );


        if (

          !sessionResponse.ok

        ) {

          throw new Error(

            `Session bootstrap failed: ${sessionResponse.status}`,

          );

        }


        const createResponse =

          await fetch(

            '/api/boards',

            {

              method:

                'POST',

              cache:

                'no-store',

            },

          );


        const payload =

          (await createResponse.json()) as {

            ok?: boolean;

            roomId?: string;

          };


        const roomId =

          typeof payload.roomId ===

            'string'

            ? payload.roomId.trim()

            : '';


        if (

          !createResponse.ok ||

          !payload.ok ||

          !roomId

        ) {

          throw new Error(

            `Board creation failed: ${createResponse.status}`,

          );

        }


        window.location.assign(

          `/r/${encodeURIComponent(

            roomId,

          )}?created=1`,

        );

      } catch (error) {

        console.error(

          'Board creation failed',

          error,

        );


        setCreatingBoard(

          false,

        );

      }

    };



  const joinBoard = (
    event: FormEvent,
  ) => {
    event.preventDefault();

    const roomId =
      extractRoomId(joinValue);

    if (!roomId) {
      setJoinError(
        'Paste a valid board link or room ID.',
      );
      return;
    }

    setJoinError('');

    router.push(
      `/r/${encodeURIComponent(roomId)}`,
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link
            href="/"
            className={styles.brand}
          >
            <span
              aria-hidden="true"
              className={styles.monogram}
            >
              W
            </span>

            <span className={styles.brandName}>
              Whiteboard
            </span>
          </Link>

          <span className={styles.headerNote}>
            Private collaborative canvas
          </span>
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.intro}>
          <div className={styles.eyebrow}>
            <span
              aria-hidden="true"
              className={styles.eyebrowLine}
            />

            Collaborative workspace
          </div>

          <h1 className={styles.title}>
            An elegant space for ideas.
          </h1>

          <p className={styles.subtitle}>
            Create a board, invite your people,
            and return to the conversations
            that are still taking shape.
          </p>

          <div className={styles.actions}>
            <Link
              href="/new"
              className={styles.primaryAction}
              onClick={(event) => {
                event.preventDefault();

                void createBoard();
              }}
              aria-disabled={creatingBoard}
              aria-busy={creatingBoard}
            >
              <Plus
                aria-hidden="true"
                width={15}
                height={15}
                strokeWidth={1.9}
              />

              New board
            </Link>

            <Link
              href="/r/demo"
              className={styles.secondaryAction}
            >
              <Play
                aria-hidden="true"
                width={13}
                height={13}
                strokeWidth={1.9}
              />

              Demo board
            </Link>
          </div>

          <div className={styles.joinSection}>
            <form
              className={styles.joinForm}
              onSubmit={joinBoard}
            >
              <span
                aria-hidden="true"
                className={styles.joinIcon}
              >
                <Link2
                  width={15}
                  height={15}
                  strokeWidth={1.8}
                />
              </span>

              <input
                value={joinValue}
                onChange={(event) => {
                  setJoinValue(
                    event.target.value,
                  );

                  if (joinError) {
                    setJoinError('');
                  }
                }}
                className={styles.joinInput}
                placeholder="Paste a board link or room ID"
                aria-label="Board link or room ID"
                spellCheck={false}
              />

              <button
                type="submit"
                className={styles.joinButton}
              >
                Join

                <ArrowRight
                  aria-hidden="true"
                  width={14}
                  height={14}
                  strokeWidth={1.9}
                />
              </button>
            </form>

            {joinError && (
              <p
                role="alert"
                className={styles.joinError}
              >
                {joinError}
              </p>
            )}
          </div>
        </section>

        <section className={styles.boards}>
          <div className={styles.boardsHeading}>
            <h2 className={styles.boardsTitle}>
              Your boards
            </h2>

            {sortedBoards.length > 0 && (
              <span className={styles.boardsCount}>
                {sortedBoards.length}{' '}
                {sortedBoards.length === 1
                  ? 'board'
                  : 'boards'}
              </span>
            )}
          </div>

          {sortedBoards.length === 0 ? (
            <div className={styles.empty}>
              <h3 className={styles.emptyTitle}>
                Nothing here yet.
              </h3>

              <p className={styles.emptyCopy}>
                Boards you create or join will
                appear here so you can return to
                them without searching for the
                link again.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.boardHeader}>
                      Board
                    </th>

                    <th className={styles.statusHeader}>
                      Status
                    </th>

                    <th className={styles.peopleHeader}>
                      People
                    </th>

                    <th className={styles.updatedHeader}>
                      Updated
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedBoards.map(
                    (board) => {
                      const online =
                        Boolean(
                          now &&
                          now -
                            board.lastActiveAt <
                            15000,
                        );

                      const people =
                        board.people.slice(0, 3);

                      const extraPeople =
                        Math.max(
                          0,
                          board.people.length -
                            people.length,
                        );

                      return (
                        <tr
                          key={board.roomId}
                          className={styles.row}
                        >
                          <td className={styles.boardCell}>
                            <button
                              type="button"
                              className={styles.boardLink}
                              onClick={() =>
                                router.push(
                                  `/r/${encodeURIComponent(
                                    board.roomId,
                                  )}`,
                                )
                              }
                            >
                              <span
                                className={styles.boardName}
                              >
                                {board.title ||
                                  'Untitled board'}
                              </span>

                              <ArrowRight
                                aria-hidden="true"
                                className={styles.boardArrow}
                                width={13}
                                height={13}
                                strokeWidth={1.8}
                              />
                            </button>
                          </td>

                          <td>
                            <span className={styles.status}>
                              <span
                                aria-hidden="true"
                                className={`
                                  ${styles.statusDot}
                                  ${
                                    online
                                      ? styles.online
                                      : styles.offline
                                  }
                                `}
                              />

                              {online
                                ? 'Online'
                                : 'Offline'}
                            </span>
                          </td>

                          <td>
                            <div className={styles.people}>
                              {people.length === 0 ? (
                                <span
                                  className={styles.noPeople}
                                >
                                  —
                                </span>
                              ) : (
                                <>
                                  {people.map((person) => (
                                    <span
                                      key={person.userId}
                                      title={person.name}
                                      className={styles.avatar}
                                      style={{
                                        backgroundColor:
                                          person.color,
                                      }}
                                    >
                                      {initialsFor(
                                        person.name,
                                      )}
                                    </span>
                                  ))}

                                  {extraPeople > 0 && (
                                    <span
                                      className={`
                                        ${styles.avatar}
                                        ${styles.moreAvatar}
                                      `}
                                    >
                                      +{extraPeople}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          <td className={styles.updated}>
                            {formatUpdated(
                              board.lastOpenedAt,
                              now,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <hr className={styles.footerRule} />

        <footer className={styles.footer}>
          <span>
            Collaborative whiteboard
          </span>

          <span>
            Create · Invite · Return
          </span>
        </footer>
      </div>
    </main>
  );
}

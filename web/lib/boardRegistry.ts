export type BoardRegistryPerson = {
  userId: string;
  name: string;
  color: string;
};

export type BoardRegistryEntry = {
  roomId: string;
  title: string;
  createdAt: number;
  lastOpenedAt: number;
  lastActiveAt: number;
  people: BoardRegistryPerson[];
  role: 'host' | 'participant';
};

const BOARD_REGISTRY_KEY = 'wb_boards';
const BOARD_REGISTRY_LIMIT = 30;

const isPerson = (
  value: unknown,
): value is BoardRegistryPerson => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const person =
    value as Partial<BoardRegistryPerson>;

  return (
    typeof person.userId === 'string' &&
    typeof person.name === 'string' &&
    typeof person.color === 'string'
  );
};

const isBoardEntry = (
  value: unknown,
): value is BoardRegistryEntry => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const board =
    value as Partial<BoardRegistryEntry>;

  return (
    typeof board.roomId === 'string' &&
    typeof board.title === 'string' &&
    typeof board.createdAt === 'number' &&
    typeof board.lastOpenedAt === 'number' &&
    typeof board.lastActiveAt === 'number' &&
    Array.isArray(board.people) &&
    board.people.every(isPerson) &&
    (
      board.role === 'host' ||
      board.role === 'participant'
    )
  );
};

export const readBoardRegistry =
  (): BoardRegistryEntry[] => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw =
        window.localStorage.getItem(
          BOARD_REGISTRY_KEY,
        );

      if (!raw) return [];

      const parsed: unknown =
        JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(isBoardEntry);
    } catch {
      return [];
    }
  };

const writeBoardRegistry = (
  boards: BoardRegistryEntry[],
) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    BOARD_REGISTRY_KEY,
    JSON.stringify(
      boards.slice(0, BOARD_REGISTRY_LIMIT),
    ),
  );

  window.dispatchEvent(
    new Event('wb-boards-updated'),
  );
};

export const upsertBoardRegistryEntry = (
  next: Omit<
    BoardRegistryEntry,
    'createdAt'
  > & {
    createdAt?: number;
  },
) => {
  if (typeof window === 'undefined') {
    return;
  }

  const boards =
    readBoardRegistry();

  const existing =
    boards.find(
      (board) =>
        board.roomId === next.roomId,
    );

  const entry: BoardRegistryEntry = {
    ...next,
    createdAt:
      existing?.createdAt ??
      next.createdAt ??
      Date.now(),
  };

  const remaining =
    boards.filter(
      (board) =>
        board.roomId !== next.roomId,
    );

  writeBoardRegistry(
    [entry, ...remaining].sort(
      (a, b) =>
        b.lastOpenedAt -
        a.lastOpenedAt,
    ),
  );
};

export const extractRoomId = (
  input: string,
): string | null => {
  const trimmed = input.trim();

  if (!trimmed) return null;

  let candidate = trimmed;

  try {
    const url =
      new URL(trimmed);

    const parts =
      url.pathname
        .split('/')
        .filter(Boolean);

    const roomIndex =
      parts.indexOf('r');

    if (
      roomIndex >= 0 &&
      parts[roomIndex + 1]
    ) {
      candidate =
        parts[roomIndex + 1];
    } else {
      return null;
    }
  } catch {
    candidate =
      candidate
        .replace(/^\/+/, '')
        .replace(/^r\//, '')
        .split(/[?#]/)[0];
  }

  const decoded =
    decodeURIComponent(candidate);

  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(
      decoded,
    )
  ) {
    return null;
  }

  return decoded;
};

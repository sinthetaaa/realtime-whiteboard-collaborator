'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';

import {
  Arrow,
  Circle,
  Ellipse,
  Label,
  Layer,
  Line,
  Rect,
  Stage,
  Tag,
  Text as KText,
  Transformer,
} from 'react-konva';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  MessageCircle,
  MoreHorizontal,
  Moon,
  Send,
  Share2,
  Sun,
  X,
} from 'lucide-react';

import { nanoid } from 'nanoid';
import type Konva from 'konva';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

import Toolbar from './Toolbar';
import { useUI } from '../store/ui';
import type {
  ShapeItem,
  ShapeItemKind,
  ShapeKind,
  Stroke,
} from '../types/whiteboard';
import { upsertBoardRegistryEntry } from '../lib/boardRegistry';

type CursorState = {
  x: number | null;
  y: number | null;
  color: string;
  name: string;
};

type CollaboratorSummary = {
  id: string;
  userId: string;
  name: string;
  color: string;
};

type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected';

type WorkspaceTheme = 'dark' | 'light';

type WhiteboardYMap = Y.Map<unknown>;

type WhiteboardAwarenessState = {
  name?: unknown;
  color?: unknown;
  userId?: unknown;
  avatarColor?: unknown;
  cursor?: unknown;
};

const SHAPE_ITEM_KINDS: readonly ShapeItemKind[] = [
  'rect',
  'ellipse',
  'line',
  'arrow',
  'triangle',
  'diamond',
  'star',
  'hexagon',
  'pentagon',
  'text',
];

const STROKE_MODES = [
  'draw',
  'erase',
] as const;

const FONT_STYLES = [
  'normal',
  'bold',
  'italic',
  'bold italic',
] as const;

const TEXT_DECORATIONS = [
  'none',
  'underline',
] as const;

const TEXT_ALIGNS = [
  'left',
  'center',
  'right',
] as const;

const readYString = (
  value: unknown,
  fallback = '',
): string =>
  typeof value === 'string'
    ? value
    : fallback;

const readYNumber = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === 'number'
    ? value
    : fallback;

const readYOptionalNumber = (
  value: unknown,
): number | undefined =>
  typeof value === 'number'
    ? value
    : undefined;

const readYNumberArray = (
  value: unknown,
): number[] => {
  if (!(value instanceof Y.Array)) {
    return [];
  }

  return value
    .toArray()
    .filter(
      (item): item is number =>
        typeof item === 'number',
    );
};

const readYEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }

  return fallback;
};

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null;

const getPresenceAvatarColor = (
  identity: string,
) => {
  let hash = 2166136261;

  for (
    let index = 0;
    index < identity.length;
    index += 1
  ) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const hue = Math.abs(hash) % 360;

  return `hsl(${hue} 58% 56%)`;
};


function getClosedShapePoints(
  kind: ShapeKind,
  width: number,
  height: number,
): number[] {
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  if (kind === 'triangle') {
    return [
      w / 2, 0,
      w, h,
      0, h,
    ];
  }

  if (kind === 'diamond') {
    return [
      w / 2, 0,
      w, h / 2,
      w / 2, h,
      0, h / 2,
    ];
  }

  if (kind === 'hexagon') {
    return [
      w * 0.25, 0,
      w * 0.75, 0,
      w, h / 2,
      w * 0.75, h,
      w * 0.25, h,
      0, h / 2,
    ];
  }

  if (kind === 'pentagon') {
    return [
      w / 2, 0,
      w, h * 0.38,
      w * 0.81, h,
      w * 0.19, h,
      0, h * 0.38,
    ];
  }

  if (kind === 'star') {
    const points: number[] = [];
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;

    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + i * (Math.PI / 5);
      const scale = i % 2 === 0 ? 1 : 0.45;

      points.push(
        cx + Math.cos(angle) * rx * scale,
        cy + Math.sin(angle) * ry * scale,
      );
    }

    return points;
  }

  return [];
}

type ChatMsg = {
  id: string;
  user: string;
  text: string;
  color: string;
  ts: number;
};

export default function Whiteboard({ roomId }: { roomId: string }) {
  const {
    tool,
    color,
    width,
    textSize,
    textFontFamily,
    textBold,
    textItalic,
    textUnderline,
    shapeKind,
    pushUndo,
    popUndo,
    pushRedo,
    popRedo,
    clearRedo,
  } = useUI();

  const stageRef = useRef<Konva.Stage | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

  const [size, setSize] = useState({ w: 1200, h: 800 });

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState<Stroke | null>(null);

  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [draftShape, setDraftShape] = useState<ShapeItem | null>(null);

  // selection
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // live cursors
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const [localCursor, setLocalCursor] = useState<{
    x: number | null;
    y: number | null;
  }>({
    x: null,
    y: null,
  });

  const [collaborators, setCollaborators] =
    useState<CollaboratorSummary[]>([]);

  const [peopleOpen, setPeopleOpen] =
    useState(false);

  const [
    openPeopleMenuUserId,
    setOpenPeopleMenuUserId,
  ] = useState<string | null>(null);

  const [localUserId, setLocalUserId] =
    useState('');

  const [hostUserId, setHostUserId] =
    useState('');

  const [removedFromBoard, setRemovedFromBoard] =
    useState(false);


  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');

  const [documentSynced, setDocumentSynced] =
    useState(false);

  const realtimeReady =
    connectionStatus === 'connected' &&
    documentSynced;

  const canMutateBoard =
    realtimeReady &&
    !removedFromBoard;

  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const [workspaceTheme, setWorkspaceTheme] =
    useState<WorkspaceTheme>('dark');

  const [boardTitle, setBoardTitle] =
    useState('Untitled board');

  const [boardTitleDraft, setBoardTitleDraft] =
    useState('Untitled board');

  const [boardCreatedAt, setBoardCreatedAt] =
    useState<number | null>(null);

  const boardOpenedAtRef =
    useRef(Date.now());

  const [isEditingBoardTitle, setIsEditingBoardTitle] =
    useState(false);

  const boardTitleInputRef =
    useRef<HTMLInputElement | null>(null);

  const isEditingBoardTitleRef =
    useRef(false);

  useEffect(() => {
    if (!localUserId) {
      return;
    }

    let cancelled = false;

    setBoardCreatedAt(null);
    boardOpenedAtRef.current =
      Date.now();

    const storageKey =
      `wb_board_title_${roomId}`;

    const legacyTitle =
      window.localStorage
        .getItem(storageKey)
        ?.trim();

    const fallbackTitle =
      legacyTitle ||
      'Untitled board';

    const applyCanonicalMetadata = (
      title: string,
      createdAt: unknown,
    ) => {
      if (cancelled) {
        return;
      }

      const nextTitle =
        title.trim() ||
        'Untitled board';

      const nextCreatedAt =
        typeof createdAt === 'number' &&
        Number.isFinite(createdAt) &&
        createdAt > 0
          ? createdAt
          : null;

      setBoardCreatedAt(
        nextCreatedAt,
      );

      setBoardTitle(nextTitle);
      setBoardTitleDraft(nextTitle);

      window.localStorage.setItem(
        storageKey,
        nextTitle,
      );
    };

    void (async () => {
      try {
        const metadataUrl =
          `/api/boards/${encodeURIComponent(
            roomId,
          )}/metadata`;

        const response =
          await fetch(
            metadataUrl,
            {
              cache: 'no-store',
            },
          );

        if (!response.ok) {
          throw new Error(
            `Metadata load failed: ${response.status}`,
          );
        }

        const payload =
          (await response.json()) as {
            ok?: boolean;
            exists?: boolean;
            metadata?: {
              title?: string;
              createdAt?: number;
            } | null;
          };

        const canonicalTitle =
          payload.metadata?.title?.trim();

        if (
          payload.ok &&
          payload.exists &&
          canonicalTitle
        ) {
          applyCanonicalMetadata(
            canonicalTitle,
            payload.metadata?.createdAt,
          );

          return;
        }

        const createResponse =
          await fetch(
            metadataUrl,
            {
              method: 'PUT',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                title:
                  fallbackTitle,
              }),
            },
          );

        if (!createResponse.ok) {
          throw new Error(
            `Metadata create failed: ${createResponse.status}`,
          );
        }

        const createPayload =
          (await createResponse.json()) as {
            ok?: boolean;
            metadata?: {
              title?: string;
              createdAt?: number;
            } | null;
          };

        const migratedTitle =
          createPayload.metadata?.title?.trim() ||
          fallbackTitle;

        applyCanonicalMetadata(
          migratedTitle,
          createPayload.metadata?.createdAt,
        );
      } catch (error) {
        console.warn(
          'Board metadata bootstrap failed',
          error,
        );

        applyCanonicalMetadata(
          fallbackTitle,
          null,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    roomId,
    localUserId,
  ]);

  useEffect(() => {
    if (!isEditingBoardTitle) return;

    const frame = window.requestAnimationFrame(() => {
      boardTitleInputRef.current?.focus();
      boardTitleInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isEditingBoardTitle]);

  const beginBoardTitleEdit = () => {
    if (!canMutateBoard) {
      return;
    }

    isEditingBoardTitleRef.current =
      true;

    setBoardTitleDraft(boardTitle);
    setIsEditingBoardTitle(true);
  };

  const commitBoardTitle = () => {
    if (!canMutateBoard) {
      isEditingBoardTitleRef.current =
        false;

      setBoardTitleDraft(
        boardTitle,
      );

      setIsEditingBoardTitle(
        false,
      );

      return;
    }

    const nextTitle =
      (
        boardTitleDraft.trim() ||
        'Untitled board'
      ).slice(0, 120);

    isEditingBoardTitleRef.current =
      false;

    setBoardTitle(nextTitle);
    setBoardTitleDraft(nextTitle);
    setIsEditingBoardTitle(false);

    window.localStorage.setItem(
      `wb_board_title_${roomId}`,
      nextTitle,
    );

    void (async () => {
      try {
        const response =
          await fetch(
            `/api/boards/${encodeURIComponent(
              roomId,
            )}/metadata`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                title:
                  nextTitle,
              }),
            },
          );

        if (!response.ok) {
          throw new Error(
            `Metadata title update failed: ${response.status}`,
          );
        }

        const yMeta =
          yRef.current?.yMeta;

        if (
          yMeta &&
          yMeta.get('title') !== nextTitle
        ) {
          yMeta.set(
            'title',
            nextTitle,
          );
        }
      } catch (error) {
        console.warn(
          'Board title save failed',
          error,
        );
      }
    })();
  };

  const cancelBoardTitleEdit = () => {
    isEditingBoardTitleRef.current =
      false;

    setBoardTitleDraft(boardTitle);
    setIsEditingBoardTitle(false);
  };



  const shareRef = useRef<HTMLDivElement | null>(null);

  // name + modal
  const [name, setName] = useState<string>('');
  const [askName, setAskName] = useState<boolean>(false);
  const [onboardingShareOpen, setOnboardingShareOpen] =
    useState<boolean>(false);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const createdBoardRef = useRef<boolean>(false);

  useEffect(() => {
    if (
      roomId === 'demo' ||
      boardCreatedAt == null ||
      !localUserId ||
      removedFromBoard
    ) {
      return;
    }

    const syncBoardRegistry = () => {
      const peopleByUserId =
        new Map<
          string,
          {
            userId: string;
            name: string;
            color: string;
          }
        >();

      peopleByUserId.set(
        localUserId,
        {
          userId: localUserId,
          name:
            name.trim() ||
            'You',
          color:
            getPresenceAvatarColor(
              localUserId,
            ),
        },
      );

      collaborators.forEach(
        (person) => {
          if (!person.userId) {
            return;
          }

          peopleByUserId.set(
            person.userId,
            {
              userId:
                person.userId,
              name:
                person.name,
              color:
                person.color,
            },
          );
        },
      );

      const now =
        Date.now();

      upsertBoardRegistryEntry({
        roomId,
        title:
          boardTitle.trim() ||
          'Untitled board',
        createdAt:
          boardCreatedAt,
        lastOpenedAt:
          boardOpenedAtRef.current,
        lastActiveAt: now,
        people:
          Array.from(
            peopleByUserId.values(),
          ),
        role:
          localUserId === hostUserId
            ? 'host'
            : 'participant',
      });
    };

    syncBoardRegistry();

    const interval =
      window.setInterval(
        syncBoardRegistry,
        5000,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    roomId,
    boardTitle,
    boardCreatedAt,
    localUserId,
    hostUserId,
    removedFromBoard,
    name,
    collaborators,
  ]);


  const localUserIdRef = useRef('');


  useEffect(() => {
    let cancelled = false;

    const controller =
      new AbortController();

    void (async () => {
      try {
        const response =
          await fetch(
            '/api/auth/session',
            {
              method: 'POST',
              cache: 'no-store',
              signal:
                controller.signal,
            },
          );

        if (!response.ok) {
          throw new Error(
            `Session bootstrap failed: ${response.status}`,
          );
        }

        const payload =
          (await response.json()) as {
            ok?: boolean;
            userId?: string;
          };

        const authenticatedUserId =
          payload.userId?.trim() ||
          '';

        if (
          !payload.ok ||
          !authenticatedUserId
        ) {
          throw new Error(
            'Session bootstrap returned an invalid identity.',
          );
        }

        if (cancelled) {
          return;
        }

        localUserIdRef.current =
          authenticatedUserId;

        setLocalUserId(
          authenticatedUserId,
        );

        /*
         * Compatibility cache only.
         * Authentication authority is the signed
         * HttpOnly session cookie, never localStorage.
         */
        try {
          window.localStorage.setItem(
            'wb_user_id',
            authenticatedUserId,
          );
        } catch {}
      } catch (error) {
        if (
          cancelled ||
          (
            error instanceof DOMException &&
            error.name === 'AbortError'
          )
        ) {
          return;
        }

        console.error(
          'Anonymous session bootstrap failed',
          error,
        );

        setConnectionStatus(
          'disconnected',
        );
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);


  /** Chat state */
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [unread, setUnread] = useState<number>(0);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  const yRef = useRef<{
    doc: Y.Doc;
    yStrokes: Y.Array<WhiteboardYMap>;
    provider: HocuspocusProvider;
    yMessages: Y.Array<WhiteboardYMap>;
    yMeta: Y.Map<string>;
  } | null>(null);


  const applyCanonicalBoardAccess =
    useCallback(
      (
        payload: {
          hostUserId?: unknown;
          removed?: unknown;
        },
      ) => {
        const canonicalHostUserId =
          typeof payload.hostUserId ===
            'string'
            ? payload.hostUserId.trim()
            : '';

        const removed =
          payload.removed === true;

        setHostUserId(
          canonicalHostUserId,
        );

        setRemovedFromBoard(
          removed,
        );

        if (removed) {
          try {
            yRef.current
              ?.provider
              .disconnect();
          } catch {}
        }
      },
      [],
    );


  const refreshBoardAccess =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        if (!localUserId) {
          return;
        }

        const endpoint =
          `/api/boards/${encodeURIComponent(
            roomId,
          )}/access`;

        const response =
          await fetch(
            endpoint,
            {
              cache:
                'no-store',
              signal,
            },
          );

        if (!response.ok) {
          throw new Error(
            `Board access request failed: ${response.status}`,
          );
        }

        const payload =
          (await response.json()) as {
            ok?: boolean;
            userId?: string;
            hostUserId?: string | null;
            removed?: boolean;
            isHost?: boolean;
          };

        if (
          !payload.ok ||
          payload.userId !==
            localUserId
        ) {
          throw new Error(
            'Board access response was invalid.',
          );
        }

        if (
          payload.removed
        ) {
          applyCanonicalBoardAccess(
            payload,
          );

          return;
        }

        /*
         * Fresh rooms and pre-ACL development rooms
         * have no trusted historical host record.
         * First authenticated claimant wins atomically
         * in Redis; subsequent claimants cannot steal it.
         */
        if (
          !payload.hostUserId
        ) {
          const claimResponse =
            await fetch(
              endpoint,
              {
                method:
                  'POST',

                cache:
                  'no-store',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    action:
                      'claim-host',
                  }),

                signal,
              },
            );

          const claimPayload =
            (await claimResponse.json()) as {
              ok?: boolean;
              userId?: string;
              hostUserId?: string | null;
              removed?: boolean;
              isHost?: boolean;
              error?: string;
            };

          if (
            claimResponse.status ===
              403 &&
            claimPayload.error ===
              'REMOVED_FROM_BOARD'
          ) {
            applyCanonicalBoardAccess({
              hostUserId:
                claimPayload.hostUserId,
              removed:
                true,
            });

            return;
          }

          if (
            !claimResponse.ok ||
            !claimPayload.ok
          ) {
            throw new Error(
              `Board host claim failed: ${claimResponse.status}`,
            );
          }

          applyCanonicalBoardAccess(
            claimPayload,
          );

          return;
        }

        applyCanonicalBoardAccess(
          payload,
        );
      },
      [
        roomId,
        localUserId,
        applyCanonicalBoardAccess,
      ],
    );


  useEffect(() => {
    if (!localUserId) {
      setHostUserId('');
      setRemovedFromBoard(false);

      return;
    }

    const controller =
      new AbortController();

    let stopped =
      false;

    const syncAccess =
      async () => {
        try {
          await refreshBoardAccess(
            controller.signal,
          );
        } catch (error) {
          if (
            stopped ||
            (
              error instanceof DOMException &&
              error.name ===
                'AbortError'
            )
          ) {
            return;
          }

          console.error(
            'Board access refresh failed',
            error,
          );
        }
      };

    void syncAccess();

    const interval =
      window.setInterval(
        () => {
          void syncAccess();
        },
        2000,
      );

    return () => {
      stopped = true;

      controller.abort();

      window.clearInterval(
        interval,
      );
    };
  }, [
    localUserId,
    refreshBoardAccess,
  ]);


  const [
    persistenceReadyRoomId,
    setPersistenceReadyRoomId,
  ] = useState<string | null>(null);


  const getPresentPeople = () => {
    const byUserId =
      new Map<string, CollaboratorSummary>();

    if (localUserId) {
      byUserId.set(
        localUserId,
        {
          id: 'local',
          userId: localUserId,
          name: name.trim() || 'You',
          color:
            getPresenceAvatarColor(localUserId),
        },
      );
    }

    collaborators.forEach((person) => {
      if (!person.userId) return;

      byUserId.set(
        person.userId,
        person,
      );
    });

    return Array.from(
      byUserId.values(),
    ).sort((a, b) => {
      const aIsHost =
        a.userId === hostUserId;

      const bIsHost =
        b.userId === hostUserId;

      if (aIsHost && !bIsHost) return -1;
      if (!aIsHost && bIsHost) return 1;

      return a.name.localeCompare(b.name);
    });
  };

  const canManagePeople =
    Boolean(
      localUserId &&
      hostUserId &&
      localUserId === hostUserId,
    );

  const makePersonHost =
    async (
      nextHostUserId: string,
    ) => {
      if (!canManagePeople) return;
      if (!nextHostUserId) return;

      const response =
        await fetch(
          `/api/boards/${encodeURIComponent(
            roomId,
          )}/access`,
          {
            method:
              'POST',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                action:
                  'transfer-host',

                targetUserId:
                  nextHostUserId,
              }),
          },
        );

      const payload =
        (await response.json()) as {
          ok?: boolean;
          hostUserId?: string | null;
          error?: string;
        };

      if (
        !response.ok ||
        !payload.ok
      ) {
        /*
         * A stale client may have lost host authority
         * since rendering the People menu.
         */
        try {
          await refreshBoardAccess();
        } catch {}

        return;
      }

      setHostUserId(
        payload.hostUserId?.trim() ||
        '',
      );

      setOpenPeopleMenuUserId(
        null,
      );
    };

  const removePersonFromBoard =
    async (
      userId: string,
    ) => {
      if (!canManagePeople) return;
      if (!userId) return;

      /*
       * The current host cannot remove themselves.
       * Transfer host first if ownership needs to move.
       */
      if (
        userId ===
        localUserId
      ) {
        return;
      }

      const response =
        await fetch(
          `/api/boards/${encodeURIComponent(
            roomId,
          )}/access`,
          {
            method:
              'POST',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                action:
                  'remove-user',

                targetUserId:
                  userId,
              }),
          },
        );

      const payload =
        (await response.json()) as {
          ok?: boolean;
          hostUserId?: string | null;
          error?: string;
        };

      if (
        !response.ok ||
        !payload.ok
      ) {
        try {
          await refreshBoardAccess();
        } catch {}

        return;
      }

      if (
        typeof payload.hostUserId ===
          'string'
      ) {
        setHostUserId(
          payload.hostUserId.trim(),
        );
      }

      setOpenPeopleMenuUserId(
        null,
      );
    };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** Export chooser state */
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [exportTab, setExportTab] =
    useState<'download' | 'share'>('download');

  // wb-export-escape-handler
  useEffect(() => {
    if (!exportOpen) {
      setExportTab('download');
      return;
    }

    const handleExportKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setExportOpen(false);
      }
    };

    window.addEventListener(
      'keydown',
      handleExportKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleExportKeyDown,
      );
    };
  }, [exportOpen]);


  useEffect(() => {
    if (!peopleOpen) {
      setOpenPeopleMenuUserId(null);
      return;
    }

    const handlePeopleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setPeopleOpen(false);
        setOpenPeopleMenuUserId(null);
      }
    };

    window.addEventListener(
      'keydown',
      handlePeopleKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handlePeopleKeyDown,
      );
    };
  }, [peopleOpen]);



  // --------- persistence helpers (NEW) ----------
  const decode = (ab: ArrayBuffer) =>
    JSON.parse(new TextDecoder().decode(new Uint8Array(ab)));
  // ---------------------------------------------

  // stable snapshot
  const snapshot = useCallback(() => ({ strokes, shapes }), [strokes, shapes]);

  // Fit canvas
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Yjs + presence + chat setup
  useEffect(() => {
    if (!localUserId) {
      return;
    }

    /*
     * WebSocket transport readiness and Yjs document
     * readiness are separate states. Never treat a
     * connected socket as an already synchronized board.
     */
    setDocumentSynced(false);

    const stableUserId =
      localUserId;

    localUserIdRef.current =
      stableUserId;

    const doc = new Y.Doc();

    const provider =
      new HocuspocusProvider({
        url:
          process.env.NEXT_PUBLIC_WS_URL ||
          'ws://localhost:4000',
        name: roomId,
        document: doc,

        token: async () => {
          const response =
            await fetch(
              `/api/auth/realtime-token?roomId=${encodeURIComponent(
                roomId,
              )}`,
              {
                cache:
                  'no-store',
              },
            );

          if (!response.ok) {
            throw new Error(
              `Realtime token request failed: ${response.status}`,
            );
          }

          const payload =
            (await response.json()) as {
              ok?: boolean;
              token?: string;
              userId?: string;
            };

          const token =
            payload.token?.trim() ||
            '';

          const tokenUserId =
            payload.userId?.trim() ||
            '';

          if (
            !payload.ok ||
            !token ||
            !tokenUserId
          ) {
            throw new Error(
              'Realtime token response was invalid.',
            );
          }

          /*
           * Self-heal if the signed cookie identity
           * changed between session bootstrap and a
           * reconnect/token refresh.
           */
          if (
            tokenUserId !==
            stableUserId
          ) {
            localUserIdRef.current =
              tokenUserId;

            setLocalUserId(
              tokenUserId,
            );

            try {
              window.localStorage.setItem(
                'wb_user_id',
                tokenUserId,
              );
            } catch {}

            throw new Error(
              'Realtime identity changed; reconnecting with the authoritative session.',
            );
          }

          return token;
        },

        onAuthenticationFailed:
          () => {
            setDocumentSynced(
              false,
            );

            setConnectionStatus(
              'disconnected',
            );
          },

        onStatus: ({ status }) => {
          if (
            status === 'connecting' ||
            status === 'connected' ||
            status === 'disconnected'
          ) {
            setConnectionStatus(
              status,
            );

            if (
              status !== 'connected'
            ) {
              setDocumentSynced(
                false,
              );
            }
          }
        },

        onSynced: ({ state }) => {
          setDocumentSynced(
            state,
          );
        },
      });

    const yStrokes = doc.getArray<WhiteboardYMap>('strokes');
    const yShapes  = doc.getArray<WhiteboardYMap>('shapes');
    const yMessages = doc.getArray<WhiteboardYMap>('chat');
    const yMeta = doc.getMap<string>('board-meta');

    const syncStrokes = () => {
      const list: Stroke[] = [];

      yStrokes.forEach((m) => {
        list.push({
          id: readYString(m.get('id')),
          color: readYString(
            m.get('color'),
            '#22d3ee',
          ),
          width: readYNumber(
            m.get('width'),
            3,
          ),
          points: readYNumberArray(
            m.get('points'),
          ),
          mode: readYEnum(
            m.get('mode'),
            STROKE_MODES,
            'draw',
          ),
        });
      });

      setStrokes(list);
    };

    const syncShapes = () => {
      const list: ShapeItem[] = [];

      yShapes.forEach((m) => {
        const kind = readYEnum(
          m.get('kind'),
          SHAPE_ITEM_KINDS,
          'rect',
        );

        if (kind === 'arrow') {
          list.push({
            id: readYString(m.get('id')),
            kind,
            x: 0,
            y: 0,
            points: readYNumberArray(
              m.get('points'),
            ),
            color: readYString(
              m.get('color'),
              '#22d3ee',
            ),
          });

          return;
        }

        if (kind === 'text') {
          list.push({
            id: readYString(m.get('id')),
            kind,
            x: readYNumber(
              m.get('x'),
              0,
            ),
            y: readYNumber(
              m.get('y'),
              0,
            ),
            w: readYNumber(
              m.get('w'),
              200,
            ),
            color: readYString(
              m.get('color'),
              '#22d3ee',
            ),
            text: readYString(
              m.get('text'),
              'Text',
            ),
            fontSize: readYNumber(
              m.get('fontSize'),
              18,
            ),
            fontFamily: readYString(
              m.get('fontFamily'),
              'Inter, system-ui, sans-serif',
            ),
            fontStyle: readYEnum(
              m.get('fontStyle'),
              FONT_STYLES,
              'normal',
            ),
            textDecoration: readYEnum(
              m.get('textDecoration'),
              TEXT_DECORATIONS,
              'none',
            ),
            align: readYEnum(
              m.get('align'),
              TEXT_ALIGNS,
              'left',
            ),
          });

          return;
        }

        list.push({
          id: readYString(m.get('id')),
          kind,
          x: readYNumber(
            m.get('x'),
            0,
          ),
          y: readYNumber(
            m.get('y'),
            0,
          ),
          w: readYOptionalNumber(
            m.get('w'),
          ),
          h: readYOptionalNumber(
            m.get('h'),
          ),
          color: readYString(
            m.get('color'),
            '#22d3ee',
          ),
        });
      });

      setShapes(list);
    };

    const syncMessages = () => {
      const list: ChatMsg[] = [];

      yMessages.forEach((m) => {
        list.push({
          id: readYString(m.get('id')),
          user: readYString(
            m.get('user'),
            'Guest',
          ),
          text: readYString(m.get('text')),
          color: readYString(
            m.get('color'),
            '#64748b',
          ),
          ts: readYNumber(
            m.get('ts'),
            0,
          ),
        });
      });

      setMessages(list.slice(-200));
    };

    syncStrokes(); syncShapes(); syncMessages();
    yStrokes.observeDeep(syncStrokes);
    yShapes.observeDeep(syncShapes);
    yMessages.observeDeep(syncMessages);

    let stored = '';

    try {
      stored =
        localStorage.getItem('wb_name')?.trim() || '';
    } catch {}

    const createdBoard =
      new URLSearchParams(
        window.location.search,
      ).get('created') === '1';

    createdBoardRef.current = createdBoard;

    setName(stored);

    // A newly created room always confirms the name.
    // A joined room asks only on the first visit in this browser.
    setAskName(createdBoard || !stored);

    /*
     * Mirror the authenticated identity for legacy
     * browser-local consumers only.
     */
    try {
      localStorage.setItem(
        'wb_user_id',
        stableUserId,
      );
    } catch {}

    const localAvatarColor =
      getPresenceAvatarColor(stableUserId);


    provider.awareness?.setLocalStateField(
      'cursor',
      { x: null, y: null },
    );

    provider.awareness?.setLocalStateField(
      'name',
      stored || 'Guest',
    );
    provider.awareness?.setLocalStateField(
      'color',
      useUI.getState().color,
    );

    provider.awareness?.setLocalStateField(
      'userId',
      stableUserId,
    );

    provider.awareness?.setLocalStateField(
      'avatarColor',
      localAvatarColor,
    );

    const syncBoardMeta = () => {
      const nextBoardTitle =
        yMeta
          .get('title')
          ?.trim()
          .slice(0, 120) ||
        '';

      if (nextBoardTitle) {
        setBoardTitle(
          nextBoardTitle,
        );

        if (
          !isEditingBoardTitleRef.current
        ) {
          setBoardTitleDraft(
            nextBoardTitle,
          );
        }

        window.localStorage.setItem(
          `wb_board_title_${roomId}`,
          nextBoardTitle,
        );
      }

    };

    syncBoardMeta();
    yMeta.observe(syncBoardMeta);

    const handleAwarenessUpdate = () => {
      const map: Record<string, CursorState> = {};
      const people: CollaboratorSummary[] = [];

      const states =
        provider.awareness?.getStates() as
          | Map<number, WhiteboardAwarenessState>
          | undefined;

      states?.forEach((st, id) => {
        if (id === doc.clientID) return;

        const rawName =
          typeof st?.name === 'string'
            ? st.name.trim()
            : '';

        const collaboratorName =
          !rawName || /^#\d+$/.test(rawName)
            ? 'Guest'
            : rawName;

        const collaboratorColor =
          typeof st.color === 'string' &&
          st.color.trim()
            ? st.color
            : '#64748b';


        const collaboratorUserId =
          typeof st?.userId === 'string' &&
          st.userId.trim()
            ? st.userId.trim()
            : `legacy-${id}`;

        const collaboratorAvatarColor =
          typeof st?.avatarColor === 'string' &&
          st.avatarColor.trim()
            ? st.avatarColor.trim()
            : getPresenceAvatarColor(
                collaboratorUserId,
              );

        people.push({
          id: String(id),
          userId: collaboratorUserId,
          name: collaboratorName,
          color: collaboratorAvatarColor,
        });

        const cursor = st.cursor;

        if (!isRecord(cursor)) {
          return;
        }

        const cursorX = cursor.x;
        const cursorY = cursor.y;

        if (
          typeof cursorX !== 'number' ||
          typeof cursorY !== 'number'
        ) {
          return;
        }

        map[String(id)] = {
          x: cursorX,
          y: cursorY,
          color: collaboratorColor,
          name: collaboratorName,
        };
      });

      setCursors(map);
      setCollaborators(people);
    };

    provider.awareness?.on('update', handleAwarenessUpdate);
    handleAwarenessUpdate();
    yRef.current = {
      doc,
      yStrokes,
      provider,
      yMessages,
      yMeta,
    };

    return () => {
      try { provider.awareness?.setLocalStateField('cursor', { x: null, y: null }); } catch {}
      yStrokes.unobserveDeep(syncStrokes);
      yShapes.unobserveDeep(syncShapes);
      yMessages.unobserveDeep(syncMessages);
      yMeta.unobserve(syncBoardMeta);
      provider.awareness?.off('update', handleAwarenessUpdate);
      provider.destroy();
      doc.destroy();

      setConnectionStatus('disconnected');
      setCollaborators([]);
      setCursors({});

      yRef.current = null;
    };
  }, [
    roomId,
    localUserId,
  ]);

  // focus name modal input
  useEffect(() => {
    if (!askName) return;
    const id = requestAnimationFrame(() => {
      const el = nameInputRef.current;
      if (el) { el.focus(); el.select(); }
    });
    return () => cancelAnimationFrame(id);
  }, [askName]);

  // keep presence color/name
  useEffect(() => {
    const prov = yRef.current?.provider;
    if (prov) prov.awareness?.setLocalStateField('color', color);
  }, [color]);
  useEffect(() => {
    const prov = yRef.current?.provider;
    if (prov && name) prov.awareness?.setLocalStateField('name', name);
  }, [name]);

  const saveName = () => {
    const finalName = name.trim();

    if (!finalName) return;

    try {
      localStorage.setItem(
        'wb_name',
        finalName,
      );
    } catch {}

    setName(finalName);

    yRef.current?.provider?.awareness?.setLocalStateField(
      'name',
      finalName,
    );

    setAskName(false);

    if (createdBoardRef.current) {
      createdBoardRef.current = false;

      const canonicalPath = `/r/${roomId}`;

      window.history.replaceState(
        window.history.state,
        '',
        canonicalPath,
      );

      setOnboardingShareOpen(true);
    }
  };

  // --- Y writers ---
  const commitStrokeToY = (s: Stroke) => {
    const ys = yRef.current?.yStrokes;
    if (!ys) return;
    const m = new Y.Map<unknown>();
    m.set('id', s.id);
    m.set('color', s.color);
    m.set('width', s.width);
    const pts = new Y.Array<number>(); pts.push(s.points);
    m.set('points', pts);
    m.set('mode', s.mode || 'draw');
    ys.push([m]);
  };

  const commitShapeToY = (s: ShapeItem) => {
    const doc = yRef.current?.doc;
    if (!doc) return;
    const yShapes = doc.getArray<WhiteboardYMap>('shapes');
    const m = new Y.Map<unknown>();
    m.set('id', s.id);
    m.set('kind', s.kind);
    if (s.kind === 'arrow') {
      const arr = new Y.Array<number>(); arr.push(s.points || []);
      m.set('points', arr);
    } else if (s.kind === 'text') {
      m.set('x', s.x); m.set('y', s.y);
      m.set('w', s.w ?? 200);
      m.set('text', s.text ?? 'Text');
      m.set('fontSize', s.fontSize ?? 18);
      m.set('fontFamily', s.fontFamily ?? 'Inter, system-ui, sans-serif');
      m.set('fontStyle', s.fontStyle ?? 'normal');
      m.set('textDecoration', s.textDecoration ?? 'none');
      m.set('align', s.align ?? 'left');
    } else {
      m.set('x', s.x); m.set('y', s.y);
      m.set('w', s.w); m.set('h', s.h);
    }
    m.set('color', s.color);
    yShapes.push([m]);
  };

  const writeAllToY = (next: { strokes: Stroke[]; shapes: ShapeItem[] }) => {
    const doc = yRef.current?.doc;
    if (!doc) return;
    const yStrokes = doc.getArray<WhiteboardYMap>('strokes');
    const yShapes  = doc.getArray<WhiteboardYMap>('shapes');

    doc.transact(() => {
      yStrokes.delete(0, yStrokes.length);
      yStrokes.push(next.strokes.map(s => {
        const m = new Y.Map<unknown>();
        m.set('id', s.id);
        m.set('color', s.color);
        m.set('width', s.width);
        const pts = new Y.Array<number>(); pts.push(s.points);
        m.set('points', pts);
        m.set('mode', s.mode || 'draw');
        return m;
      }));

      yShapes.delete(0, yShapes.length);
      yShapes.push(next.shapes.map(s => {
        const m = new Y.Map<unknown>();
        m.set('id', s.id);
        m.set('kind', s.kind);
        if (s.kind === 'arrow') {
          const arr = new Y.Array<number>(); arr.push(s.points || []);
          m.set('points', arr);
        } else if (s.kind === 'text') {
          m.set('x', s.x); m.set('y', s.y);
          m.set('w', s.w ?? 200);
          m.set('text', s.text ?? 'Text');
          m.set('fontSize', s.fontSize ?? 18);
          m.set('fontFamily', s.fontFamily ?? 'Inter, system-ui, sans-serif');
          m.set('fontStyle', s.fontStyle ?? 'normal');
          m.set('textDecoration', s.textDecoration ?? 'none');
          m.set('align', s.align ?? 'left');
        } else {
          m.set('x', s.x); m.set('y', s.y);
          m.set('w', s.w); m.set('h', s.h);
        }
        m.set('color', s.color);
        return m;
      }));
    });
  };

  // --- helpers for selection actions (toolbar + keyboard) ---
  const deleteSelected = useCallback(() => {
    if (
      !canMutateBoard ||
      !selectedShapeId
    ) {
      return;
    }
    const exists = shapes.some(s => s.id === selectedShapeId);
    if (!exists) return;

    pushUndo(snapshot()); clearRedo();
    const nextShapes = shapes.filter(s => s.id !== selectedShapeId);
    setShapes(nextShapes);
    setSelectedShapeId(null);
    writeAllToY({ strokes, shapes: nextShapes });
  }, [
    canMutateBoard,
    selectedShapeId,
    shapes,
    strokes,
    pushUndo,
    clearRedo,
    snapshot,
  ]);

  const duplicateSelected = useCallback(() => {
    if (
      !canMutateBoard ||
      !selectedShapeId
    ) {
      return;
    }
    const original = shapes.find(s => s.id === selectedShapeId);
    if (!original) return;

    const OFFSET = 12;
    const clone: ShapeItem = original.kind === 'arrow'
      ? { ...original, id: nanoid(), points: (original.points || []).map((p, i) => p + (i % 2 === 0 ? OFFSET : OFFSET)) }
      : { ...original, id: nanoid(), x: original.x + OFFSET, y: original.y + OFFSET };

    pushUndo(snapshot()); clearRedo();
    const nextShapes = [...shapes, clone];
    setShapes(nextShapes);
    setSelectedShapeId(clone.id);
    writeAllToY({ strokes, shapes: nextShapes });
  }, [
    canMutateBoard,
    selectedShapeId,
    shapes,
    strokes,
    pushUndo,
    clearRedo,
    snapshot,
  ]);

  // --- interactions ---
  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!canMutateBoard) return;
    if (e?.evt?.button === 2) return;

    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) setSelectedShapeId(null);

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (tool === 'text') {
      pushUndo(snapshot());
      clearRedo();

      const t: ShapeItem = {
        id: nanoid(),
        kind: 'text',
        x: pos.x,
        y: pos.y,
        w: 220,
        color,
        text: 'Text',
        fontSize: textSize,
        fontFamily: textFontFamily,
        fontStyle:
          textBold && textItalic
            ? 'bold italic'
            : textBold
              ? 'bold'
              : textItalic
                ? 'italic'
                : 'normal',
        textDecoration: textUnderline ? 'underline' : 'none',
        align: 'left',
      };

      setShapes(prev => [...prev, t]);
      setSelectedShapeId(t.id);
      commitShapeToY(t);

      requestAnimationFrame(() => startEditingText(t.id));
      return;
    }

    if (tool === 'shape') {
      if (shapeKind === 'arrow') {
        setDraftShape({
          id: nanoid(),
          kind: 'arrow',
          x: 0,
          y: 0,
          points: [pos.x, pos.y, pos.x, pos.y],
          color,
        });
      } else {
        setDraftShape({
          id: nanoid(),
          kind: shapeKind,
          x: pos.x,
          y: pos.y,
          w: 0,
          h: 0,
          color,
        });
      }

      return;
    }

    if (tool === 'pen' || tool === 'eraser') {
      pushUndo(snapshot()); clearRedo();
      const stroke: Stroke = {
        id: nanoid(),
        color,
        width,
        points: [pos.x, pos.y],
        mode: tool === 'eraser' ? 'erase' : 'draw',
      };
      setDrawing(stroke);
      setStrokes(prev => [...prev, stroke]);
    }
  };

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();

    if (!pos) return;

    setLocalCursor({
      x: pos.x,
      y: pos.y,
    });

    const prov = yRef.current?.provider;
    if (prov) {
      prov.awareness?.setLocalStateField('cursor', {
        x: pos.x,
        y: pos.y,
      });
    }

    if (draftShape) {
      if (draftShape.kind === 'arrow') {
        setDraftShape({ ...draftShape, points: [draftShape.points![0], draftShape.points![1], pos.x, pos.y] });
      } else {
        setDraftShape({ ...draftShape, w: pos.x - draftShape.x, h: pos.y - draftShape.y });
      }
      return;
    }

    if (!drawing) return;
    const next = { ...drawing, points: [...drawing.points, pos.x, pos.y] };
    setDrawing(next);
    setStrokes(prev => prev.map(s => (s.id === next.id ? next : s)));
  };

  const onMouseUp = () => {
    if (!canMutateBoard) {
      setDrawing(null);
      setDraftShape(null);
      return;
    }

    if (draftShape) {
      pushUndo(snapshot()); clearRedo();
      let finalShape = draftShape;
      if (
        draftShape.kind !== 'arrow' &&
        draftShape.kind !== 'text' &&
        draftShape.kind !== 'line'
      ) {
        const x = Math.min(draftShape.x, draftShape.x + (draftShape.w ?? 0));
        const y = Math.min(draftShape.y, draftShape.y + (draftShape.h ?? 0));
        const w = Math.abs(draftShape.w ?? 0);
        const h = Math.abs(draftShape.h ?? 0);
        finalShape = { ...draftShape, x, y, w, h };
      }
      setDraftShape(null);
      setShapes(prev => [...prev, finalShape]);
      commitShapeToY(finalShape);
      return;
    }

    if (!drawing) return;
    commitStrokeToY(drawing);
    setDrawing(null);
  };

  const onMouseLeave = () => {
    setLocalCursor({
      x: null,
      y: null,
    });

    const prov = yRef.current?.provider;

    if (prov) {
      prov.awareness?.setLocalStateField('cursor', {
        x: null,
        y: null,
      });
    }
  };

  // --- keyboard: Undo/Redo + Delete + Duplicate + Nudge ---
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (!canMutateBoard) {
        return;
      }

      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      // Undo
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = popUndo();
        if (prev) {
          pushRedo(snapshot());
          setStrokes(prev.strokes);
          setShapes(prev.shapes);
          writeAllToY(prev);
        }
        return;
      }

      // Redo
      if (mod && key === 'z' && e.shiftKey) {
        e.preventDefault();
        const next = popRedo();
        if (next) {
          pushUndo(snapshot());
          setStrokes(next.strokes);
          setShapes(next.shapes);
          writeAllToY(next);
        }
        return;
      }

      // Delete shape
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // Duplicate shape (Cmd/Ctrl + D)
      if (mod && key === 'd' && selectedShapeId) {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Nudge with arrow keys
      if (selectedShapeId && ['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;

        const nextShapes = shapes.map(s => {
          if (s.id !== selectedShapeId) return s;
          if (s.kind === 'arrow') {
            const pts = (s.points || []).map((p, i) => p + (i % 2 === 0 ? dx : dy));
            return { ...s, points: pts };
          }
          return { ...s, x: s.x + dx, y: s.y + dy };
        });

        pushUndo(snapshot()); clearRedo();
        setShapes(nextShapes);
        writeAllToY({ strokes, shapes: nextShapes });
      }
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [
    shapes,
    strokes,
    selectedShapeId,
    popUndo,
    pushRedo,
    popRedo,
    pushUndo,
    snapshot,
    deleteSelected,
    duplicateSelected,
    clearRedo,
    canMutateBoard,
  ]);

  // Toolbar Undo/Redo + Duplicate/Delete events
  useEffect(() => {
    const doUndo = () => {
      if (!canMutateBoard) {
        return;
      }

      const prev = popUndo();
      if (prev) {
        pushRedo(snapshot());
        setStrokes(prev.strokes);
        setShapes(prev.shapes);
        writeAllToY(prev);
      }
    };
    const doRedo = () => {
      if (!canMutateBoard) {
        return;
      }

      const next = popRedo();
      if (next) {
        pushUndo(snapshot());
        setStrokes(next.strokes);
        setShapes(next.shapes);
        writeAllToY(next);
      }
    };

    const onUndo = () => doUndo();
    const onRedo = () => doRedo();

    const onDuplicate = () => duplicateSelected();
    const onDelete = () => deleteSelected();

    window.addEventListener('wb-undo', onUndo);
    window.addEventListener('wb-redo', onRedo);
    window.addEventListener('wb-duplicate', onDuplicate);
    window.addEventListener('wb-delete', onDelete);

    return () => {
      window.removeEventListener('wb-undo', onUndo);
      window.removeEventListener('wb-redo', onRedo);
      window.removeEventListener('wb-duplicate', onDuplicate);
      window.removeEventListener('wb-delete', onDelete);
    };
  }, [
    snapshot,
    popUndo,
    pushRedo,
    popRedo,
    pushUndo,
    duplicateSelected,
    deleteSelected,
    canMutateBoard,
  ]);

  // Clear + Export
  useEffect(() => {
    const onClear = () => {
      if (!canMutateBoard) {
        return;
      }

      pushUndo(snapshot());
      clearRedo();

      setStrokes([]); setShapes([]);
      setDraftShape(null);
      setSelectedShapeId(null);

      const doc = yRef.current?.doc;
      if (!doc) return;
      const yStrokes = doc.getArray<WhiteboardYMap>('strokes');
      const yShapes  = doc.getArray<WhiteboardYMap>('shapes');
      doc.transact(() => {
        yStrokes.delete(0, yStrokes.length);
        yShapes.delete(0, yShapes.length);
      });
    };

    const onExport = () => {
      setExportOpen(true);
    };

    const hClear = () => onClear();
    const hExport = () => onExport();

    window.addEventListener('wb-clear', hClear);
    window.addEventListener('wb-export', hExport);
    return () => {
      window.removeEventListener('wb-clear', hClear);
      window.removeEventListener('wb-export', hExport);
    };
  }, [
    roomId,
    snapshot,
    pushUndo,
    clearRedo,
    canMutateBoard,
  ]);

  // Attach transformer to selected (rect/ellipse/text)
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (!selectedShapeId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const node = stage.findOne(`#shape-${selectedShapeId}`);
    if (node) {
      const cls = node.getClassName();
      const selectedShape =
        shapes.find(
          (shape) =>
            shape.id === selectedShapeId,
        );

      const polygonCanTransform =
        cls === 'Line' &&
        selectedShape != null &&
        (
          selectedShape.kind === 'triangle' ||
          selectedShape.kind === 'diamond' ||
          selectedShape.kind === 'star' ||
          selectedShape.kind === 'hexagon' ||
          selectedShape.kind === 'pentagon'
        );

      if (
        cls === 'Rect' ||
        cls === 'Ellipse' ||
        cls === 'Text' ||
        polygonCanTransform
      ) {
        tr.nodes([node]);
      } else {
        tr.nodes([]);
      }
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedShapeId, shapes]);

  // Broadcast selection changes so Toolbar can show/hide buttons
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('wb-selection-changed', { detail: { id: selectedShapeId } }));
  }, [selectedShapeId]);

  // Helper: click handler to select a shape without starting a new one
  const selectShape = (e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true;
    setSelectedShapeId(id);
  };

  // Drag handlers
  const onRectEllipseDragEnd = (id: string, pos: { x: number; y: number }) => {
    pushUndo(snapshot()); clearRedo();
    const next = shapes.map(s => (s.id === id ? { ...s, x: pos.x, y: pos.y } : s));
    setShapes(next); writeAllToY({ strokes, shapes: next });
  };

  const onArrowDragEnd = (id: string, dx: number, dy: number) => {
    pushUndo(snapshot()); clearRedo();
    const next = shapes.map(s => {
      if (s.id !== id) return s;
      const pts = (s.points || []).map((p, i) => p + (i % 2 === 0 ? dx : dy));
      return { ...s, points: pts };
    });
    setShapes(next); writeAllToY({ strokes, shapes: next });
  };

  // Arrow endpoint drag (handles)
  const onArrowHandleDrag = (id: string, handle: 'start' | 'end', x: number, y: number) => {
    setShapes(prev => prev.map(s => {
      if (s.id !== id) return s;
      const pts = [...(s.points || [])];
      if (handle === 'start') {
        pts[0] = x; pts[1] = y;
      } else {
        pts[2] = x; pts[3] = y;
      }
      return { ...s, points: pts };
    }));
  };
  const onArrowHandleDragEnd = () => {
    pushUndo(snapshot()); clearRedo();
    writeAllToY({ strokes, shapes });
  };

  /** Chat: auto-scroll & unread when collapsed */
  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
    if (!chatOpen && messages.length > 0) {
      const last = messages[messages.length - 1];
      if ((name || 'Guest') !== last.user) setUnread(u => u + 1);
    }
  }, [messages, chatOpen, name]);

  const sendChat = () => {
    if (!canMutateBoard) {
      return;
    }

    const text = chatInput.trim();
    if (!text) return;
    const yMessages = yRef.current?.yMessages;
    if (!yMessages) return;
    const m = new Y.Map<unknown>();
    m.set('id', nanoid());
    m.set('user', name || 'Guest');
    m.set('text', text);
    m.set('color', color);
    m.set('ts', Date.now());
    yMessages.push([m]);
    setChatInput('');
  };

  // Text editing helpers
  const startEditingText = (id: string) => {
    setSelectedShapeId(id);
    setEditingTextId(id);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const v = ta.value || '';
      try { ta.setSelectionRange(v.length, v.length); } catch {}
    });
  };

  const stopEditingText = (commit: boolean) => {
    const id = editingTextId;
    setEditingTextId(null);

    if (
      !commit ||
      !id ||
      !canMutateBoard
    ) {
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const val = (ta.value ?? '').trimEnd();
    const target = shapes.find(s => s.id === id && s.kind === 'text');
    if (!target) return;
    if (val === (target.text ?? '')) return;

    pushUndo(snapshot()); clearRedo();
    const next = shapes.map(s => s.id === id ? { ...s, text: val || 'Text' } : s);
    setShapes(next); writeAllToY({ strokes, shapes: next });
  };

  /** Export helpers (download) */
  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const exportPNG = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', quality: 1, pixelRatio: 2 });
    downloadDataUrl(dataUrl, `whiteboard-${roomId}.png`);
    setExportOpen(false);
  };

  const exportJPEG = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/jpeg', quality: 1, pixelRatio: 2 });
    downloadDataUrl(dataUrl, `whiteboard-${roomId}.jpg`);
    setExportOpen(false);
  };

  const exportJSON = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const json = stage.toJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${roomId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  /** Upload/share helpers (to /api/boards/[roomId]) */
  const uploadBytes = async (bytes: ArrayBuffer, mime: string, filename: string) => {
    const res = await fetch(`/api/boards/${roomId}`, {
      method: 'POST',
      headers: {
        'Content-Type': mime,
        'X-Filename': filename,
      },
      body: bytes,
    });
    if (!res.ok) throw new Error('Upload failed');
    const link = `${location.origin}/api/boards/${roomId}`;
    alert(`Uploaded! Share this link:\n${link}`);
    setExportOpen(false);
  };

  const uploadPNG = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', quality: 1, pixelRatio: 2 });
    const buf = await (await fetch(dataUrl)).arrayBuffer();
    await uploadBytes(buf, 'image/png', `whiteboard-${roomId}.png`);
  };

  const uploadJPEG = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/jpeg', quality: 1, pixelRatio: 2 });
    const buf = await (await fetch(dataUrl)).arrayBuffer();
    await uploadBytes(buf, 'image/jpeg', `whiteboard-${roomId}.jpg`);
  };

  const uploadJSON = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    const json = stage.toJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const buf = await blob.arrayBuffer();
    await uploadBytes(buf, 'application/json', `whiteboard-${roomId}.json`);
  };

  // --------- PERSISTENCE: save + restore (NEW) ----------

  // Save the logical board (strokes + shapes) to API
  const saveBoard = useCallback(async () => {
    if (
      !localUserId ||
      removedFromBoard
    ) {
      return;
    }

    try {
      const data = {
        version: 1,
        ...snapshot(),
      };

      const bytes = new TextEncoder().encode(
        JSON.stringify(data),
      );

      await fetch(
        `/api/boards/${roomId}`,
        {
          method: 'POST',
          body: bytes,
        },
      );

      // no UI toast; silent autosave
    } catch (e) {
      console.warn('Save failed', e);
    }
  }, [
    roomId,
    snapshot,
    localUserId,
    removedFromBoard,
  ]);

  // Debounced autosave whenever content changes
  useEffect(() => {
    if (
      persistenceReadyRoomId !== roomId
    ) {
      return;
    }

    const id = setTimeout(
      () => {
        void saveBoard();
      },
      800,
    );

    return () => clearTimeout(id);
  }, [
    persistenceReadyRoomId,
    roomId,
    saveBoard,
  ]);

  // Restore board on mount if exists
  useEffect(() => {
    let cancelled = false;

    setPersistenceReadyRoomId(null);

    (async () => {
      try {
        const meta = await fetch(
          `/api/boards/${roomId}?format=json`,
        ).then((response) => response.json());

        if (!meta?.exists) return;

        const buf = await fetch(
          `/api/boards/${roomId}`,
        ).then((response) => response.arrayBuffer());

        if (cancelled) return;

        const saved = decode(buf) as {
          version: number;
          strokes: Stroke[];
          shapes: ShapeItem[];
        };

        if (
          saved?.version === 1 &&
          Array.isArray(saved.strokes) &&
          Array.isArray(saved.shapes)
        ) {
          setStrokes(saved.strokes);
          setShapes(saved.shapes);
        }
      } catch (e) {
        console.warn('Load failed', e);
      } finally {
        if (!cancelled) {
          setPersistenceReadyRoomId(
            roomId,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId]);
  // ------------------------------------------------------

  // (Optional) manual save trigger from Toolbar
  useEffect(() => {
    const onSave = () => {
      void saveBoard();
    };

    window.addEventListener(
      'wb-save',
      onSave,
    );

    return () => {
      window.removeEventListener(
        'wb-save',
        onSave,
      );
    };
  }, [saveBoard]);

  const normalizeChatUser = (raw?: string) => {
    const value = raw?.trim();

    if (!value) return 'Guest';
    if (/^#\d+$/.test(value)) return 'Guest';

    return value;
  };

  const getChatInitials = (label: string) => {
    const parts = label
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) return 'G';

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  };

  useEffect(() => {
    setShareLink(
      `${window.location.origin}/r/${roomId}`,
    );
  }, [roomId]);

  useEffect(() => {
    if (!shareOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;

      if (!shareRef.current?.contains(event.target)) {
        setShareOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShareOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [shareOpen]);

  const copyRoomLink = async () => {
    const link =
      `${window.location.origin}/r/${roomId}`;

    try {
      await navigator.clipboard.writeText(link);
      setShareLink(link);
      setCopiedShareLink(true);

      window.setTimeout(() => {
        setCopiedShareLink(false);
      }, 1600);
    } catch {
      setCopiedShareLink(false);
    }
  };

  useEffect(() => {
    try {
      const storedTheme =
        localStorage.getItem('wb_theme');

      if (
        storedTheme === 'dark' ||
        storedTheme === 'light'
      ) {
        setWorkspaceTheme(storedTheme);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'wb_theme',
        workspaceTheme,
      );
    } catch {}

    document.documentElement.style.colorScheme =
      workspaceTheme;
  }, [workspaceTheme]);

  const toggleWorkspaceTheme = () => {
    setWorkspaceTheme((current) =>
      current === 'dark'
        ? 'light'
        : 'dark',
    );
  };

  return (
    <div
      className={`wb-workspace h-screen w-screen overflow-hidden ${
        workspaceTheme === 'dark'
          ? 'wb-dark bg-[#18191b] text-neutral-100'
          : 'wb-light bg-[#f7f8fa] text-[#20242a]'
      }`}
    >
      <Toolbar />

      {/* Workspace identity */}
      <div
        className="
          fixed left-5 top-4 z-[55]
          flex h-9 items-center gap-3
        "
      >
        <Link
          href="/"
          aria-label="Back to home"
          title="Back to home"
          className="
            wb-back wb-surface flex h-8 w-8 items-center justify-center
            rounded-[6px]
            border border-[#303238]
            bg-[#202124]
            text-[#9ca3af]
            transition-colors duration-150
            hover:bg-[#292b2f]
            hover:text-white
          "
        >
          <ArrowLeft
            aria-hidden="true"
            width={15}
            height={15}
            strokeWidth={1.8}
          />
        </Link>

        <div
          className="
            wb-board-title wb-surface flex h-8 max-w-[180px]
            items-center rounded-[6px]
            border border-[#303238]
            bg-[#202124]
            px-2.5
          "
        >
          {isEditingBoardTitle ? (
            <input
              ref={boardTitleInputRef}
              value={boardTitleDraft}
              onChange={(event) =>
                setBoardTitleDraft(event.target.value)
              }
              onBlur={commitBoardTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitBoardTitle();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelBoardTitleEdit();
                }
              }}
              aria-label="Board name"
              maxLength={80}
              className="
                h-6 min-w-0 flex-1
                bg-transparent
                px-0
                text-sm font-medium
                text-inherit
                outline-none
                selection:bg-[#9db4ff]
                selection:text-[#111827]
              "
            />
          ) : (
            <button
              type="button"
              onClick={beginBoardTitleEdit}
              title="Rename board"
              className="
                min-w-0 max-w-full
                cursor-text truncate
                bg-transparent p-0
                text-left text-sm
                font-medium text-inherit
                outline-none
              "
            >
              {boardTitle}
            </button>
          )}
        </div>
      </div>

      {/* Collaboration + sharing */}
      <div
        ref={shareRef}
        className="
          fixed right-5 top-4 z-[55]
          flex h-9 items-center gap-3.5
        "
      >
        <div
          title={
            realtimeReady
              ? 'Connected and synced'
              : connectionStatus === 'connected'
                ? 'Connected, syncing board'
                : connectionStatus === 'connecting'
                  ? 'Connecting'
                  : 'Disconnected'
          }
          className="
            wb-live wb-surface flex h-8 items-center gap-1.5
            rounded-[6px]
            border border-[#303238]
            bg-[#202124]
            px-2
          "
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              realtimeReady
                ? 'bg-[#22c55e]'
                : connectionStatus === 'connecting' ||
                    connectionStatus === 'connected'
                  ? 'bg-[#f59e0b]'
                  : 'bg-[#ef4444]'
            }`}
          />

          <span
            className="
              hidden text-[10px]
              text-[#8f96a1]
              xl:inline
            "
          >
            {realtimeReady
              ? 'Live'
              : connectionStatus === 'connected'
                ? 'Syncing'
                : connectionStatus === 'connecting'
                  ? 'Connecting'
                  : 'Offline'}
          </span>
        </div>

        <div className="flex items-center -space-x-1.5">
          <div
            title={name || 'You'}
            data-people-trigger="true"
            role="button"
            tabIndex={0}
            aria-label="Open people in this board"
            onClick={() => setPeopleOpen(true)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' ||
                event.key === ' '
              ) {
                event.preventDefault();
                setPeopleOpen(true);
              }
            }}
            className="
              relative z-[3]
              flex h-7 w-7
              items-center justify-center
              rounded-full
              border-2 border-[#18191b]
              bg-[#3b82f6]
              text-[9px] font-semibold
              text-white
            "
          >
            {getChatInitials(name || 'You')}
          </div>

          {collaborators
            .slice(0, 3)
            .map((person, index) => (
              <div
                key={person.id}
                title={person.name}
                data-people-trigger="true"
                role="button"
                tabIndex={0}
                aria-label="Open people in this board"
                onClick={() => setPeopleOpen(true)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' ||
                    event.key === ' '
                  ) {
                    event.preventDefault();
                    setPeopleOpen(true);
                  }
                }}
                className="
                  flex h-7 w-7
                  items-center justify-center
                  rounded-full
                  border-2 border-[#18191b]
                  text-[9px] font-semibold
                  text-white
                "
                style={{
                  backgroundColor: person.color,
                  zIndex: 2 - index,
                }}
              >
                {getChatInitials(person.name)}
              </div>
            ))}

          {collaborators.length > 3 && (
            <div
              title={`${collaborators.length - 3} more collaborators`}
              data-people-trigger="true"
              role="button"
              tabIndex={0}
              aria-label="Open all people in this board"
              onClick={() => setPeopleOpen(true)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' ||
                  event.key === ' '
                ) {
                  event.preventDefault();
                  setPeopleOpen(true);
                }
              }}
              className="
                flex h-7 min-w-7
                items-center justify-center
                rounded-full
                border-2 border-[#18191b]
                bg-[#303238]
                px-1
                text-[8px] font-semibold
                text-[#d1d5db]
              "
            >
              +{collaborators.length - 3}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Share board"
          aria-expanded={shareOpen}
          onClick={() =>
            setShareOpen((open) => !open)
          }
          className="
            wb-share wb-surface flex h-8 items-center gap-1.5
            rounded-[6px]
            border border-[#303238]
            bg-[#202124]
            px-2.5
            text-[11px] font-medium
            text-[#d1d5db]
            transition-colors duration-150
            hover:bg-[#292b2f]
            hover:text-white
          "
        >
          <Share2
            aria-hidden="true"
            width={14}
            height={14}
            strokeWidth={1.8}
          />

          <span className="hidden sm:inline">
            Share
          </span>
        </button>

        {shareOpen && (
          <div
            className="
              wb-panel absolute right-0 top-[calc(100%+6px)]
              w-[292px]
              rounded-[9px]
              border border-[#34363b]
              bg-[#202124]
              p-3
              shadow-[0_8px_24px_rgba(0,0,0,0.24)]
            "
          >
            <div
              className="
                text-[12px] font-medium
                text-[#f3f4f6]
              "
            >
              Share board
            </div>

            <p
              className="
                mt-1 text-[10px]
                leading-[1.45]
                text-[#8f96a1]
              "
            >
              Anyone with this link can join the
              same collaborative workspace.
            </p>

            <div
              className="
                mt-3 flex items-center gap-1.5
                rounded-[7px]
                border border-[#3b3e43]
                bg-[#292b2f]
                p-1
              "
            >
              <div
                className="
                  min-w-0 flex-1 truncate
                  px-1.5
                  font-mono text-[9px]
                  text-[#aeb4bd]
                "
                title={shareLink}
              >
                {shareLink}
              </div>

              <button
                type="button"
                onClick={() => {
                  void copyRoomLink();
                }}
                className="
                  flex h-7 w-7 shrink-0
                  items-center justify-center
                  rounded-[5px]
                  bg-[#f3f4f6]
                  text-[#202124]
                  transition-colors duration-150
                  hover:bg-white
                "
                aria-label="Copy board link"
                title={
                  copiedShareLink
                    ? 'Copied'
                    : 'Copy link'
                }
              >
                {copiedShareLink ? (
                  <Check
                    aria-hidden="true"
                    width={13}
                    height={13}
                    strokeWidth={2}
                  />
                ) : (
                  <Copy
                    aria-hidden="true"
                    width={13}
                    height={13}
                    strokeWidth={1.8}
                  />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* People currently in this board */}
      {peopleOpen && (
        <div
          className="
            wb-people-backdrop
            fixed inset-0 z-[95]
            flex items-center justify-center
            bg-black/50 px-4
          "
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setPeopleOpen(false);
              setOpenPeopleMenuUserId(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="people-board-title"
            className="
              wb-people-modal
              w-[min(94vw,500px)]
              min-h-[360px]
              overflow-visible
              rounded-[12px]
              border p-5
            "
          >
            <div
              className="
                flex items-start
                justify-between gap-4
              "
            >
              <div>
                <h2
                  id="people-board-title"
                  className="
                    wb-people-title
                    text-[16px] font-semibold
                    tracking-[-0.01em]
                  "
                >
                  People in this board
                </h2>

                <p
                  className="
                    wb-people-subtitle
                    mt-1 text-[12px]
                  "
                >
                  {getPresentPeople().length}{' '}
                  {getPresentPeople().length === 1
                    ? 'person'
                    : 'people'}{' '}
                  currently here
                </p>
              </div>

              <button
                type="button"
                aria-label="Close people dialog"
                title="Close"
                onClick={() => {
                  setPeopleOpen(false);
                  setOpenPeopleMenuUserId(null);
                }}
                className="
                  wb-people-close
                  flex h-7 w-7
                  items-center justify-center
                  rounded-[7px]
                "
              >
                <X
                  aria-hidden="true"
                  width={15}
                  height={15}
                  strokeWidth={1.9}
                />
              </button>
            </div>

            <div
              className="
                wb-people-list
                mt-5 grid
                min-h-[210px]
                max-h-[420px]
                gap-1
                overflow-visible
                pr-1
              "
            >
              {getPresentPeople().map(
                (person) => {
                  const isHost =
                    person.userId === hostUserId;

                  const isYou =
                    person.userId === localUserId;

                  const menuOpen =
                    openPeopleMenuUserId ===
                    person.userId;

                  return (
                    <div
                      key={person.userId}
                      className="
                        wb-person-row
                        relative flex min-h-[52px]
                        items-center gap-3
                        rounded-[9px]
                        px-2.5 py-2
                      "
                    >
                      <div
                        className="
                          wb-person-avatar
                          flex h-8 w-8
                          shrink-0 items-center
                          justify-center
                          rounded-full
                          text-[10px]
                          font-semibold text-white
                        "
                        style={{
                          backgroundColor:
                            person.color,
                        }}
                      >
                        {getChatInitials(
                          person.name,
                        )}
                      </div>

                      <div
                        className="
                          min-w-0 flex-1
                        "
                      >
                        <div
                          className="
                            flex min-w-0
                            items-center gap-1.5
                          "
                        >
                          <span
                            className="
                              wb-person-name
                              truncate text-[12px]
                              font-medium
                            "
                          >
                            {person.name}
                          </span>

                          {isYou && (
                            <span
                              className="
                                wb-person-you
                                shrink-0 text-[10px]
                              "
                            >
                              (You)
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`
                          wb-person-role
                          shrink-0 text-[10px]
                          ${
                            isHost
                              ? 'wb-person-role--host font-semibold'
                              : 'font-medium'
                          }
                        `}
                      >
                        {isHost
                          ? 'Host'
                          : 'Contributor'}
                      </span>

                      <div
                        className="
                          relative shrink-0
                        "
                      >
                        <button
                          type="button"
                          aria-label={`Options for ${person.name}`}
                          aria-expanded={menuOpen}
                          onClick={() => {
                            setOpenPeopleMenuUserId(
                              menuOpen
                                ? null
                                : person.userId,
                            );
                          }}
                          className="
                            wb-person-menu-trigger
                            flex h-7 w-7
                            items-center justify-center
                            rounded-[7px]
                          "
                        >
                          <MoreHorizontal
                            aria-hidden="true"
                            width={16}
                            height={16}
                            strokeWidth={1.9}
                          />
                        </button>

                        {menuOpen && (
                          <div
                            className="
                              wb-person-menu
                              absolute right-0 top-8
                              z-[110] w-[132px]
                              overflow-hidden
                              rounded-[8px]
                              border p-[3px]
                            "
                          >
                            <button
                              type="button"
                              disabled={
                                !canManagePeople ||
                                isHost
                              }
                              onClick={() =>
                                makePersonHost(
                                  person.userId,
                                )
                              }
                              className="
                                wb-person-menu-item
                                flex w-full
                                items-center
                                rounded-[5px]
                                px-2 py-1.5
                                text-left text-[9px]
                                font-medium
                              "
                            >
                              Make host
                            </button>

                            <button
                              type="button"
                              disabled={
                                !canManagePeople ||
                                isYou
                              }
                              onClick={() =>
                                removePersonFromBoard(
                                  person.userId,
                                )
                              }
                              className="
                                wb-person-menu-item
                                wb-person-menu-item--danger
                                mt-0.5 flex w-full
                                items-center
                                rounded-[5px]
                                px-2 py-1.5
                                text-left text-[9px]
                                font-medium
                              "
                            >
                              Remove from board
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            {!canManagePeople && (
              <p
                className="
                  wb-people-note
                  mt-3 text-[10px]
                  leading-[15px]
                "
              >
                Only the current host can change
                roles or remove people.
              </p>
            )}
          </section>
        </div>
      )}

      {/* Removed participant state */}
      {removedFromBoard && (
        <div
          className="
            wb-removed-screen
            fixed inset-0 z-[200]
            flex items-center justify-center
            px-4
          "
        >
          <div
            className="
              wb-removed-card
              w-[min(92vw,380px)]
              rounded-[12px]
              border p-5 text-center
            "
          >
            <h2
              className="
                text-[16px] font-semibold
              "
            >
              You were removed from this board
            </h2>

            <p
              className="
                wb-removed-copy
                mt-2 text-[12px]
                leading-[18px]
              "
            >
              Your live connection to this
              whiteboard has been closed.
            </p>

            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="
                wb-removed-home
                mt-4 rounded-[8px]
                px-3 py-2
                text-[11px] font-medium
              "
            >
              Return home
            </button>
          </div>
        </div>
      )}

      {/* Display-name onboarding */}
      {askName && (
        <div
          className="
            fixed inset-0 z-[110]
            flex items-center justify-center
            bg-black/60 px-4
          "
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-name-title"
            className="
              wb-modal w-[min(400px,100%)]
              rounded-[10px]
              border border-[#373a3f]
              bg-[#202124]
              p-4
              text-[#f3f4f6]
              shadow-[0_12px_32px_rgba(0,0,0,0.30)]
            "
          >
            <h2
              id="display-name-title"
              className="
                text-[15px] font-semibold
                tracking-[-0.01em]
              "
            >
              Pick a display name
            </h2>

            <p
              className="
                mt-1.5 text-[11px]
                leading-[1.5]
                text-[#969ca6]
              "
            >
              Collaborators will see this name beside
              your cursor.
            </p>

            <input
              ref={nameInputRef}
              autoFocus
              autoComplete="name"
              maxLength={32}
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  name.trim()
                ) {
                  event.preventDefault();
                  saveName();
                }
              }}
              placeholder="Your name"
              aria-label="Display name"
              className="
                mt-4 h-9 w-full
                rounded-[7px]
                border border-[#41444a]
                bg-[#292b2f]
                px-3
                text-[12px]
                text-[#f3f4f6]
                outline-none
                transition-colors duration-150
                placeholder:text-[#747a84]
                focus:border-[#666c76]
                focus:outline-none
                focus-visible:outline-none
              "
              style={{
                outline: 'none',
                boxShadow: 'none',
              }}
            />

            <div
              className="
                mt-4 flex items-center
                justify-end
              "
            >
              <button
                type="button"
                disabled={!name.trim()}
                onClick={saveName}
                className="
                  flex h-8 items-center
                  justify-center rounded-[6px]
                  bg-[#f3f4f6]
                  px-3
                  text-[11px] font-medium
                  text-[#202124]
                  transition-colors duration-150
                  hover:bg-white
                  disabled:cursor-default
                  disabled:opacity-35
                "
              >
                Save
              </button>
            </div>
          </section>
        </div>
      )}

      {/* New-board share onboarding */}
      {onboardingShareOpen && (
        <div
          className="
            fixed inset-0 z-[105]
            flex items-center justify-center
            bg-black/60 px-4
          "
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-onboarding-title"
            className="
              wb-modal w-[min(430px,100%)]
              rounded-[10px]
              border border-[#373a3f]
              bg-[#202124]
              p-4
              text-[#f3f4f6]
              shadow-[0_12px_32px_rgba(0,0,0,0.30)]
            "
          >
            <h2
              id="share-onboarding-title"
              className="
                text-[15px] font-semibold
                tracking-[-0.01em]
              "
            >
              Share this board
            </h2>

            <p
              className="
                mt-1.5 text-[11px]
                leading-[1.5]
                text-[#969ca6]
              "
            >
              Copy this link and send it to anyone you
              want to collaborate with.
            </p>

            <div
              className="
                mt-4 flex items-center gap-1.5
                rounded-[7px]
                border border-[#41444a]
                bg-[#292b2f]
                p-1
              "
            >
              <div
                title={shareLink}
                className="
                  min-w-0 flex-1 truncate
                  px-2
                  font-mono text-[10px]
                  text-[#b7bcc5]
                "
              >
                {shareLink}
              </div>

              <button
                type="button"
                onClick={() => {
                  void copyRoomLink();
                }}
                className="
                  flex h-8 shrink-0
                  items-center gap-1.5
                  rounded-[9px]
                  bg-[#f3f4f6]
                  px-2.5
                  text-[10px] font-medium
                  text-[#202124]
                  transition-colors duration-150
                  hover:bg-white
                "
              >
                {copiedShareLink ? (
                  <>
                    <Check
                      aria-hidden="true"
                      width={13}
                      height={13}
                      strokeWidth={2}
                    />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy
                      aria-hidden="true"
                      width={13}
                      height={13}
                      strokeWidth={1.8}
                    />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div
              className="
                mt-4 flex justify-end
              "
            >
              <button
                type="button"
                onClick={() =>
                  setOnboardingShareOpen(false)
                }
                className="
                  flex h-7 items-center
                  justify-center gap-1.5
                  rounded-[9px]
                  border border-[#274c92]
                  bg-[#1e3a8a]
                  px-2.5
                  text-[10px] font-medium
                  text-[#f8fafc]
                  transition-colors duration-150
                  hover:bg-[#1e40af]
                "
              >
                <span>Start drawing</span>

                <ArrowRight
                  aria-hidden="true"
                  width={12}
                  height={12}
                  strokeWidth={2}
                />
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Export chooser modal */}
      {exportOpen && (
        <div
          className="
            wb-export-backdrop
            fixed inset-0 z-[90]
            flex items-center justify-center
            bg-black/50 px-4
          "
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setExportOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-board-title"
            className="
              wb-export-modal
              w-[min(92vw,430px)]
              rounded-[12px]
              border p-4
            "
          >
            {/* Header */}
            <div
              className="
                flex items-start
                justify-between gap-4
              "
            >
              <div className="min-w-0">
                <h2
                  id="export-board-title"
                  className="
                    wb-export-title
                    text-[16px] font-semibold
                    tracking-[-0.01em]
                  "
                >
                  Export board
                </h2>

                <p
                  className="
                    wb-export-subtitle
                    mt-1 text-[12px]
                    leading-[18px]
                  "
                >
                  Download a file or create a shareable export.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setExportOpen(false)}
                aria-label="Close export dialog"
                title="Close"
                className="
                  wb-export-close
                  flex h-7 w-7
                  shrink-0 items-center
                  justify-center rounded-[7px]
                "
              >
                <X
                  aria-hidden="true"
                  width={15}
                  height={15}
                  strokeWidth={1.9}
                />
              </button>
            </div>

            {/* Download / Share tabs */}
            <div
              className="
                wb-export-tabs
                mt-4 grid grid-cols-2
                gap-1 rounded-[8px] p-1
              "
              role="tablist"
              aria-label="Export type"
            >
              <button
                type="button"
                role="tab"
                aria-selected={exportTab === 'download'}
                onClick={() => setExportTab('download')}
                className={`
                  wb-export-tab
                  rounded-[6px] px-3 py-1.5
                  text-[12px] font-medium
                  ${
                    exportTab === 'download'
                      ? 'wb-export-tab--active'
                      : ''
                  }
                `}
              >
                Download
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={exportTab === 'share'}
                onClick={() => setExportTab('share')}
                className={`
                  wb-export-tab
                  rounded-[6px] px-3 py-1.5
                  text-[12px] font-medium
                  ${
                    exportTab === 'share'
                      ? 'wb-export-tab--active'
                      : ''
                  }
                `}
              >
                Share
              </button>
            </div>

            {/* Format rows */}
            <div
              className="
                mt-3 grid gap-2
              "
            >
              {exportTab === 'download' ? (
                <>
                  <button
                    type="button"
                    onClick={exportPNG}
                    className="wb-export-row"
                  >
                    <span
                      className="
                        wb-export-format
                        wb-export-format--image
                      "
                    >
                      PNG
                    </span>

                    <span
                      className="
                        min-w-0 flex-1
                        text-left
                      "
                    >
                      <span
                        className="
                          flex items-center
                          gap-2
                        "
                      >
                        <span
                          className="
                            wb-export-row-title
                          "
                        >
                          PNG
                        </span>

                        <span
                          className="
                            wb-export-recommended
                          "
                        >
                          Recommended
                        </span>
                      </span>

                      <span
                        className="
                          wb-export-row-copy
                        "
                      >
                        High quality image
                      </span>
                    </span>

                    <ArrowRight
                      aria-hidden="true"
                      className="
                        wb-export-row-icon
                      "
                      width={15}
                      height={15}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={exportJPEG}
                    className="wb-export-row"
                  >
                    <span
                      className="
                        wb-export-format
                        wb-export-format--image
                      "
                    >
                      JPG
                    </span>

                    <span
                      className="
                        min-w-0 flex-1
                        text-left
                      "
                    >
                      <span
                        className="
                          wb-export-row-title
                        "
                      >
                        JPEG
                      </span>

                      <span
                        className="
                          wb-export-row-copy
                        "
                      >
                        Smaller image file
                      </span>
                    </span>

                    <ArrowRight
                      aria-hidden="true"
                      className="
                        wb-export-row-icon
                      "
                      width={15}
                      height={15}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={exportJSON}
                    className="wb-export-row"
                  >
                    <span
                      className="
                        wb-export-format
                        wb-export-format--json
                      "
                    >
                      {'{ }'}
                    </span>

                    <span
                      className="
                        min-w-0 flex-1
                        text-left
                      "
                    >
                      <span
                        className="
                          wb-export-row-title
                        "
                      >
                        JSON
                      </span>

                      <span
                        className="
                          wb-export-row-copy
                        "
                      >
                        Editable, re-importable backup
                      </span>
                    </span>

                    <ArrowRight
                      aria-hidden="true"
                      className="
                        wb-export-row-icon
                      "
                      width={15}
                      height={15}
                    />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={uploadPNG}
                    className="wb-export-row"
                  >
                    <span
                      className="
                        wb-export-format
                        wb-export-format--image
                      "
                    >
                      PNG
                    </span>

                    <span
                      className="
                        min-w-0 flex-1
                        text-left
                      "
                    >
                      <span
                        className="
                          flex items-center
                          gap-2
                        "
                      >
                        <span
                          className="
                            wb-export-row-title
                          "
                        >
                          PNG
                        </span>

                        <span
                          className="
                            wb-export-recommended
                          "
                        >
                          Recommended
                        </span>
                      </span>

                      <span
                        className="
                          wb-export-row-copy
                        "
                      >
                        Upload high quality image
                      </span>
                    </span>

                    <span
                      className="
                        wb-export-create-link
                      "
                    >
                      Create link
                      <Share2
                        aria-hidden="true"
                        width={13}
                        height={13}
                      />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={uploadJPEG}
                    className="wb-export-row"
                  >
                    <span
                      className="
                        wb-export-format
                        wb-export-format--image
                      "
                    >
                      JPG
                    </span>

                    <span
                      className="
                        min-w-0 flex-1
                        text-left
                      "
                    >
                      <span
                        className="
                          wb-export-row-title
                        "
                      >
                        JPEG
                      </span>

                      <span
                        className="
                          wb-export-row-copy
                        "
                      >
                        Upload smaller image file
                      </span>
                    </span>

                    <span
                      className="
                        wb-export-create-link
                      "
                    >
                      Create link
                      <Share2
                        aria-hidden="true"
                        width={13}
                        height={13}
                      />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={uploadJSON}
                    className="wb-export-row"
                  >
                    <span
                      className="
                        wb-export-format
                        wb-export-format--json
                      "
                    >
                      {'{ }'}
                    </span>

                    <span
                      className="
                        min-w-0 flex-1
                        text-left
                      "
                    >
                      <span
                        className="
                          wb-export-row-title
                        "
                      >
                        JSON
                      </span>

                      <span
                        className="
                          wb-export-row-copy
                        "
                      >
                        Upload editable board backup
                      </span>
                    </span>

                    <span
                      className="
                        wb-export-create-link
                      "
                    >
                      Create link
                      <Share2
                        aria-hidden="true"
                        width={13}
                        height={13}
                      />
                    </span>
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Board area wrapper */}
      <div
        ref={containerRef}
        className="wb-canvas relative h-full w-full"
        style={{
          backgroundColor: '#18191b',
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0',
        }}
      >
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          listening={canMutateBoard}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          style={{
            cursor:
              !canMutateBoard
                ? connectionStatus === 'disconnected'
                  ? 'not-allowed'
                  : 'wait'
                : tool === 'shape'
                  ? 'crosshair'
                  : tool === 'text'
                    ? 'text'
                    : 'default',
          }}
        >
          {/* strokes */}
          <Layer>
            {strokes.map((s) => (
              <Line
                key={s.id}
                points={s.points}
                stroke={s.color}
                strokeWidth={s.width}
                lineCap="round"
                lineJoin="round"
                tension={0.4}
                globalCompositeOperation={s.mode === 'erase' ? 'destination-out' : 'source-over'}
              />
            ))}
          </Layer>

          {/* shapes (committed) + draft preview */}
          <Layer>
            {shapes.map((s) => {
              const isSel = selectedShapeId === s.id;

              if (s.kind === 'rect') {
                const x = Math.min(s.x, s.x + (s.w ?? 0));
                const y = Math.min(s.y, s.y + (s.h ?? 0));
                const w = Math.abs(s.w ?? 0);
                const h = Math.abs(s.h ?? 0);
                return (
                  <Rect
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={s.color}
                    cornerRadius={6}
                    stroke={isSel ? '#60a5fa' : undefined}
                    strokeWidth={isSel ? 1.5 : 0}
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={tool === 'select' && isSel}
                    onDragEnd={(e) => onRectEllipseDragEnd(s.id, e.target.position())}
                  />
                );
              }

              if (s.kind === 'ellipse') {
                const cx = s.x + (s.w! / 2);
                const cy = s.y + (s.h! / 2);
                const rx = Math.abs(s.w! / 2);
                const ry = Math.abs(s.h! / 2);
                return (
                  <Ellipse
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={cx}
                    y={cy}
                    radiusX={rx}
                    radiusY={ry}
                    fill={s.color}
                    stroke={isSel ? '#60a5fa' : undefined}
                    strokeWidth={isSel ? 1.5 : 0}
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={tool === 'select' && isSel}
                    onDragEnd={(e) => {
                      const pos = e.target.position();
                      const newX = pos.x - rx;
                      const newY = pos.y - ry;
                      onRectEllipseDragEnd(s.id, { x: newX, y: newY });
                    }}
                  />
                );
              }

              if (s.kind === 'line') {
                const isDraggable = tool === 'select' && isSel;

                return (
                  <Line
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={s.x}
                    y={s.y}
                    points={[0, 0, s.w ?? 0, s.h ?? 0]}
                    stroke={s.color}
                    strokeWidth={Math.max(2, width)}
                    lineCap="round"
                    dash={isSel ? [6, 4] : undefined}
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={isDraggable}
                    onDragEnd={(e) =>
                      onRectEllipseDragEnd(s.id, e.target.position())
                    }
                  />
                );
              }

              if (
                s.kind === 'triangle' ||
                s.kind === 'diamond' ||
                s.kind === 'star' ||
                s.kind === 'hexagon' ||
                s.kind === 'pentagon'
              ) {
                const w = Math.abs(s.w ?? 0);
                const h = Math.abs(s.h ?? 0);

                return (
                  <Line
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={s.x}
                    y={s.y}
                    points={getClosedShapePoints(s.kind, w, h)}
                    closed
                    fill={s.color}
                    stroke={isSel ? '#60a5fa' : undefined}
                    strokeWidth={isSel ? 1.5 : 0}
                    lineJoin="round"
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={tool === 'select' && isSel}
                    onDragEnd={(e) =>
                      onRectEllipseDragEnd(s.id, e.target.position())
                    }
                  />
                );
              }

              if (s.kind === 'text') {
                return (
                  <KText
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={s.x}
                    y={s.y}
                    width={s.w ?? 220}
                    text={s.text ?? 'Text'}
                    fontSize={s.fontSize ?? 18}
                    fontFamily={s.fontFamily ?? 'Inter, system-ui, sans-serif'}
                    fontStyle={s.fontStyle ?? 'normal'}
                    textDecoration={
                      s.textDecoration === 'underline'
                        ? 'underline'
                        : ''
                    }
                    fill={s.color}
                    align={s.align ?? 'left'}
                    listening
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={tool === 'select' && selectedShapeId === s.id}
                    onDblClick={() => startEditingText(s.id)}
                    onDblTap={() => startEditingText(s.id)}
                    onDragEnd={(e) => {
                      pushUndo(snapshot()); clearRedo();
                      const pos = e.target.position();
                      const next = shapes.map(sh => sh.id === s.id ? { ...sh, x: pos.x, y: pos.y } : sh);
                      setShapes(next); writeAllToY({ strokes, shapes: next });
                    }}
                  />
                );
              }

              // arrow
              const pts = s.points!;
              const isDraggable = tool === 'select' && isSel;
              return (
                <>
                  <Arrow
                    id={`shape-${s.id}`}
                    key={s.id}
                    points={pts}
                    stroke={s.color}
                    strokeWidth={Math.max(2, width)}
                    pointerLength={10}
                    pointerWidth={10}
                    dash={isSel ? [6, 4] : undefined}
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={isDraggable}
                    onDragEnd={(e) => {
                      const { x: dx, y: dy } = e.target._lastPos || { x: 0, y: 0 };
                      onArrowDragEnd(s.id, dx, dy);
                    }}
                    onDragMove={(e) => {
                      const { x: dx, y: dy } = e.target.position();
                      setShapes(prev => prev.map(sh => {
                        if (sh.id !== s.id) return sh;
                        const moved = (sh.points || []).map((p, i) => p + (i % 2 === 0 ? dx : dy));
                        return { ...sh, points: moved };
                      }));
                      e.target.position({ x: 0, y: 0 });
                    }}
                  />
                  {isSel && tool === 'select' && (
                    <>
                      {/* start handle */}
                      <Circle
                        x={pts[0]}
                        y={pts[1]}
                        radius={5}
                        fill="#ffffff"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        draggable
                        onDragMove={(e) => onArrowHandleDrag(s.id, 'start', e.target.x(), e.target.y())}
                        onDragEnd={onArrowHandleDragEnd}
                      />
                      {/* end handle */}
                      <Circle
                        x={pts[2]}
                        y={pts[3]}
                        radius={5}
                        fill="#ffffff"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        draggable
                        onDragMove={(e) => onArrowHandleDrag(s.id, 'end', e.target.x(), e.target.y())}
                        onDragEnd={onArrowHandleDragEnd}
                      />
                    </>
                  )}
                </>
              );
            })}

            {draftShape && (
              draftShape.kind === 'rect' ? (
                (() => {
                  const x = Math.min(draftShape.x, draftShape.x + (draftShape.w ?? 0));
                  const y = Math.min(draftShape.y, draftShape.y + (draftShape.h ?? 0));
                  const w = Math.abs(draftShape.w ?? 0);
                  const h = Math.abs(draftShape.h ?? 0);
                  return <Rect x={x} y={y} width={w} height={h} fill={draftShape.color} opacity={0.5} cornerRadius={6} />;
                })()
              ) : draftShape.kind === 'ellipse' ? (
                <Ellipse
                  x={draftShape.x + (draftShape.w! / 2)}
                  y={draftShape.y + (draftShape.h! / 2)}
                  radiusX={Math.abs(draftShape.w! / 2)}
                  radiusY={Math.abs(draftShape.h! / 2)}
                  fill={draftShape.color}
                  opacity={0.5}
                />
              ) : draftShape.kind === 'line' ? (
                <Line
                  x={draftShape.x}
                  y={draftShape.y}
                  points={[0, 0, draftShape.w ?? 0, draftShape.h ?? 0]}
                  stroke={draftShape.color}
                  strokeWidth={Math.max(2, width)}
                  lineCap="round"
                  opacity={0.6}
                />
              ) : (
                draftShape.kind === 'triangle' ||
                draftShape.kind === 'diamond' ||
                draftShape.kind === 'star' ||
                draftShape.kind === 'hexagon' ||
                draftShape.kind === 'pentagon'
              ) ? (
                (() => {
                  const x = Math.min(
                    draftShape.x,
                    draftShape.x + (draftShape.w ?? 0),
                  );
                  const y = Math.min(
                    draftShape.y,
                    draftShape.y + (draftShape.h ?? 0),
                  );
                  const w = Math.abs(draftShape.w ?? 0);
                  const h = Math.abs(draftShape.h ?? 0);

                  return (
                    <Line
                      x={x}
                      y={y}
                      points={getClosedShapePoints(draftShape.kind, w, h)}
                      closed
                      fill={draftShape.color}
                      lineJoin="round"
                      opacity={0.5}
                    />
                  );
                })()
              ) : (
                <Arrow
                  points={draftShape.points!}
                  stroke={draftShape.color}
                  strokeWidth={Math.max(2, width)}
                  opacity={0.6}
                  pointerLength={10}
                  pointerWidth={10}
                />
              )
            )}

            {/* Transformer for rect/ellipse/text selection */}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              borderStroke="#60a5fa"
              borderStrokeWidth={1}
              anchorFill="#ffffff"
              anchorStroke="#3b82f6"
              anchorStrokeWidth={1.5}
              anchorSize={7}
              anchorCornerRadius={2}
              enabledAnchors={['top-left','top-right','bottom-left','bottom-right','left','right','top','bottom']}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 4 || newBox.height < 4) return oldBox;
                return newBox;
              }}
              onTransformEnd={() => {
                const tr = trRef.current;
                const node = tr?.nodes?.()[0];
                if (!node) return;
                const id = node.id().replace('shape-','');

                if (node.getClassName() === 'Rect') {
                  const nextX = node.x();
                  const nextY = node.y();
                  const nextW = node.width() * node.scaleX();
                  const nextH = node.height() * node.scaleY();
                  node.scaleX(1); node.scaleY(1);

                  pushUndo(snapshot()); clearRedo();
                  const next = shapes.map(s => s.id === id ? { ...s, x: nextX, y: nextY, w: nextW, h: nextH } : s);
                  setShapes(next); writeAllToY({ strokes, shapes: next });
                }

                if (node.getClassName() === 'Ellipse') {
                  const cx = node.x();
                  const cy = node.y();
                  const ellipseNode = node as Konva.Ellipse;
                  const rx =
                    ellipseNode.radiusX() *
                    ellipseNode.scaleX();
                  const ry =
                    ellipseNode.radiusY() *
                    ellipseNode.scaleY();

                  ellipseNode.scaleX(1);
                  ellipseNode.scaleY(1);

                  const nextX = cx - rx;
                  const nextY = cy - ry;
                  const nextW = rx * 2;
                  const nextH = ry * 2;

                  pushUndo(snapshot()); clearRedo();
                  const next = shapes.map(s => s.id === id ? { ...s, x: nextX, y: nextY, w: nextW, h: nextH } : s);
                  setShapes(next); writeAllToY({ strokes, shapes: next });
                }

                if (node.getClassName() === 'Line') {
                  const target =
                    shapes.find(
                      (shape) => shape.id === id,
                    );

                  if (
                    target &&
                    (
                      target.kind === 'triangle' ||
                      target.kind === 'diamond' ||
                      target.kind === 'star' ||
                      target.kind === 'hexagon' ||
                      target.kind === 'pentagon'
                    )
                  ) {
                    const nextX = node.x();
                    const nextY = node.y();

                    const nextW =
                      Math.max(
                        4,
                        Math.abs(
                          (target.w ?? node.width()) *
                          node.scaleX(),
                        ),
                      );

                    const nextH =
                      Math.max(
                        4,
                        Math.abs(
                          (target.h ?? node.height()) *
                          node.scaleY(),
                        ),
                      );

                    node.scaleX(1);
                    node.scaleY(1);

                    pushUndo(snapshot());
                    clearRedo();

                    const next =
                      shapes.map((shape) =>
                        shape.id === id
                          ? {
                              ...shape,
                              x: nextX,
                              y: nextY,
                              w: nextW,
                              h: nextH,
                            }
                          : shape,
                      );

                    setShapes(next);

                    writeAllToY({
                      strokes,
                      shapes: next,
                    });
                  }
                }

                // Convert Text scale to width
                if (node.getClassName() === 'Text') {
                  const newWidth = Math.max(40, node.width() * node.scaleX());
                  node.scaleX(1); node.scaleY(1);

                  pushUndo(snapshot()); clearRedo();
                  const next = shapes.map(s => s.id === id ? { ...s, w: newWidth } : s);
                  setShapes(next); writeAllToY({ strokes, shapes: next });
                }
              }}
            />
          </Layer>

          {/* live collaborator cursors */}
          <Layer listening={false}>
            {localCursor.x != null && localCursor.y != null && (
              <Label
                x={localCursor.x + 13}
                y={localCursor.y + 13}
              >
                <Tag
                  fill="#f3f4f6"
                  cornerRadius={4}
                  opacity={0.94}
                />

                <KText
                  text="You"
                  fontSize={9}
                  fontFamily="Inter, system-ui, sans-serif"
                  fontStyle="bold"
                  padding={4}
                  fill="#20242a"
                />
              </Label>
            )}

            {Object.entries(cursors).map(([id, c]) => {
              if (c.x == null || c.y == null) return null;

              const displayName =
                c.name.length > 14
                  ? `${c.name.slice(0, 13)}…`
                  : c.name;

              return (
                <React.Fragment key={id}>
                  <Line
                    x={c.x}
                    y={c.y}
                    points={[
                      0, 0,
                      0, 17,
                      4.5, 13,
                      8.5, 20,
                      11, 18.5,
                      7, 12,
                      14, 12,
                    ]}
                    closed
                    fill={c.color}
                    stroke="#ffffff"
                    strokeWidth={1}
                    lineJoin="round"
                    shadowColor="rgba(0,0,0,0.22)"
                    shadowBlur={2}
                    shadowOffset={{ x: 0, y: 1 }}
                  />

                  <Label
                    x={c.x + 12}
                    y={c.y + 16}
                  >
                    <Tag
                      fill={c.color}
                      cornerRadius={5}
                      lineJoin="round"
                      opacity={0.94}
                    />

                    <KText
                      text={displayName}
                      fontSize={10}
                      fontFamily="Inter, system-ui, sans-serif"
                      fontStyle="bold"
                      padding={5}
                      fill="#ffffff"
                    />
                  </Label>
                </React.Fragment>
              );
            })}
          </Layer>
        </Stage>

        {strokes.length === 0 &&
          shapes.length === 0 &&
          !editingTextId && (
            <div
              className="
                wb-muted pointer-events-none
                absolute left-1/2 top-[62%]
                -translate-x-1/2
                text-center text-[11px]
                text-[#55595f]
              "
            >
              Draw, add a shape, or invite someone.
            </div>
          )}

        {/* Text editor overlay */}
        {editingTextId && (() => {
          const s = shapes.find(x => x.id === editingTextId && x.kind === 'text');
          if (!s) return null;
          const left = s.x;
          const top = s.y;
          const width = s.w ?? 220;
          return (
            <textarea
              key={editingTextId}
              ref={textareaRef}
              defaultValue={s.text ?? ''}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                minHeight: '28px',
                color: s.color,
                background: 'transparent',
                outline: 'none',
                border: '1px dashed rgba(255,255,255,0.35)',
                padding: '4px 6px',
                fontSize: (s.fontSize ?? 18) + 'px',
                fontFamily: s.fontFamily ?? 'Inter, system-ui, sans-serif',
                fontWeight:
                  (s.fontStyle ?? '').includes('bold') ? 700 : 400,
                fontStyle:
                  (s.fontStyle ?? '').includes('italic')
                    ? 'italic'
                    : 'normal',
                textDecoration:
                  s.textDecoration === 'underline'
                    ? 'underline'
                    : 'none',
                lineHeight: '1.2',
                whiteSpace: 'pre-wrap',
                overflow: 'hidden',
                resize: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  stopEditingText(false);
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  stopEditingText(true);
                }
              }}
              onBlur={() => stopEditingText(true)}
              autoFocus
            />
          );
        })()}

        {/* Workspace theme switch */}
        <div
          className="
            fixed bottom-6 left-[2.75rem] z-[80]
          "
        >
          <div
            className={`
              wb-daynight
              ${
                workspaceTheme === 'dark'
                  ? 'wb-daynight--dark'
                  : 'wb-daynight--light'
              }
            `}
          >
            {/* DAY SCENE */}
            <span
              aria-hidden="true"
              className="wb-daynight__day"
            >
              <span className="wb-daynight__cloud wb-daynight__cloud--1" />
              <span className="wb-daynight__cloud wb-daynight__cloud--2" />
              <span className="wb-daynight__cloud wb-daynight__cloud--3" />

              <span className="wb-daynight__mountain wb-daynight__mountain--1" />
              <span className="wb-daynight__mountain wb-daynight__mountain--2" />
            </span>

            {/* NIGHT SCENE */}
            <span
              aria-hidden="true"
              className="wb-daynight__night"
            >
              <span className="wb-daynight__star wb-daynight__star--1" />
              <span className="wb-daynight__star wb-daynight__star--2" />
              <span className="wb-daynight__star wb-daynight__star--3" />
              <span className="wb-daynight__star wb-daynight__star--4" />
              <span className="wb-daynight__star wb-daynight__star--5" />
            </span>

            {/* ONLY INTERACTIVE PART */}
            <button
              type="button"
              role="switch"
              aria-checked={
                workspaceTheme === 'dark'
              }
              aria-label={
                workspaceTheme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              title={
                workspaceTheme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              onClick={toggleWorkspaceTheme}
              className="wb-daynight__celestial"
            >
              {workspaceTheme === 'light' ? (
                <Sun
                  aria-hidden="true"
                  width={18}
                  height={18}
                  strokeWidth={2.1}
                  className="wb-daynight__sun-icon"
                />
              ) : (
                <Moon
                  aria-hidden="true"
                  width={18}
                  height={18}
                  strokeWidth={1.9}
                  className="wb-daynight__moon-icon"
                />
              )}
            </button>
          </div>
        </div>

        {/* Chat dock */}
        <div className="fixed bottom-5 right-5 z-[70]">
          {!chatOpen && (
            <button
              type="button"
              aria-label="Open chat"
              onClick={() => {
                setChatOpen(true);
                setUnread(0);
              }}
              className="
                wb-chat-launcher wb-surface relative flex h-9 w-9 items-center justify-center
                rounded-[8px] border border-[#36383c]
                bg-[#202124] text-[#d1d5db]
                shadow-[0_1px_3px_rgba(0,0,0,0.24)]
                transition-colors duration-150
                hover:bg-[#292b2f] hover:text-white
              "
            >
              <MessageCircle
                aria-hidden="true"
                width={17}
                height={17}
                strokeWidth={1.8}
              />

              {unread > 0 && (
                <span
                  className="
                    absolute -right-1.5 -top-1.5
                    flex min-h-4 min-w-4 items-center justify-center
                    rounded-full bg-[#dc2626]
                    px-1 text-[9px] font-semibold
                    leading-none text-white
                  "
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          )}

          {chatOpen && (
            <section
              aria-label="Room chat"
              className="
                wb-chat-panel flex h-[360px]
                w-[min(320px,calc(100vw-24px))]
                flex-col overflow-hidden
                rounded-[10px]
                border border-[#36383c]
                bg-[#202124]
                text-[#f3f4f6]
                shadow-[0_4px_16px_rgba(0,0,0,0.24)]
              "
            >
              <header
                className="
                  wb-chat-divider flex h-11 shrink-0 items-center
                  justify-between
                  border-b border-[#34363a]
                  px-3
                "
              >
                <span className="text-[13px] font-medium">
                  Chat
                </span>

                <button
                  type="button"
                  aria-label="Close chat"
                  title="Close chat"
                  onClick={() => {
                    setChatOpen(false);
                    setUnread(0);
                  }}
                  className="
                    flex h-7 w-7 items-center justify-center
                    rounded-[6px]
                    text-[#9ca3af]
                    transition-colors duration-150
                    hover:bg-[#2b2d31]
                    hover:text-white
                  "
                >
                  <X
                    aria-hidden="true"
                    width={15}
                    height={15}
                    strokeWidth={1.8}
                  />
                </button>
              </header>

              <div
                ref={chatListRef}
                className="
                  flex-1 space-y-2
                  overflow-y-auto px-3 py-3
                "
              >
                {messages.map((m) => {
                  const mine = (name || 'Guest') === m.user;
                  const resolvedName = normalizeChatUser(m.user);
                  const displayName =
                    mine
                      ? 'You'
                      : resolvedName;

                  const initials = mine
                    ? getChatInitials(name || 'You')
                    : getChatInitials(displayName);
                  const avatarColor = mine
                    ? '#3b82f6'
                    : m.color || '#6b7280';

                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        mine
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >
                      <div
                        className={`flex max-w-[88%] items-end gap-2 ${
                          mine ? 'flex-row-reverse' : ''
                        }`}
                        title={new Date(m.ts).toLocaleString()}
                      >
                        <div
                          className="
                            flex h-7 w-7 shrink-0
                            items-center justify-center
                            rounded-full
                            text-[10px] font-semibold
                            text-white
                          "
                          style={{
                            backgroundColor: avatarColor,
                          }}
                        >
                          {initials}
                        </div>

                        <div
                          className={`flex min-w-0 flex-col ${
                            mine ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`
                              max-w-[210px]
                              border
                              px-2.5 py-1.5
                              text-[11.5px]
                              leading-[1.42]
                              whitespace-pre-wrap
                              break-words
                              ${
                                mine
                                  ? 'rounded-[9px] rounded-br-[3px] border-[#405579] text-[#f8fafc]'
                                  : 'rounded-[9px] rounded-bl-[3px] border-[#393c41] text-[#e7e9ec]'
                              }
                            `}
                            style={{
                              background: mine
                                ? 'linear-gradient(145deg, #31486f 0%, #293b60 100%)'
                                : 'linear-gradient(145deg, #303236 0%, #282a2e 100%)',
                              boxShadow: mine
                                ? '0 1px 3px rgba(13, 28, 54, 0.22)'
                                : '0 1px 3px rgba(0, 0, 0, 0.18)',
                            }}
                          >
                            {m.text}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {messages.length === 0 && (
                  <div
                    className="
                      flex h-full items-center
                      justify-center
                      px-6 text-center
                      text-[11px]
                      text-[#8b919b]
                    "
                  >
                    No messages yet.
                  </div>
                )}
              </div>

              <div
                className="
                  wb-chat-divider shrink-0 border-t
                  border-[#34363a]
                  p-2
                "
              >
                <div
                  className="
                    wb-chat-composer flex items-end gap-1.5
                    rounded-[8px]
                    border border-[#3d4045]
                    bg-[#292b2f]
                    p-1.5
                    focus-within:border-[#5b616b]
                  "
                >
                  <textarea
                    value={chatInput}
                    disabled={!canMutateBoard}
                    onChange={(e) =>
                      setChatInput(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey
                      ) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    placeholder="Message"
                    aria-label="Chat message"
                    rows={1}
                    className="
                      wb-chat-input max-h-24 min-h-7
                      flex-1 resize-none
                      bg-transparent
                      px-1.5 py-1
                      text-[12px]
                      leading-[1.4]
                      text-[#f3f4f6]
                      outline-none
                      focus:outline-none
                      focus-visible:outline-none
                      placeholder:text-[#7d838d]
                    "
                    style={{
                      outline: 'none',
                      boxShadow: 'none',
                    }}
                  />

                  <button
                    type="button"
                    aria-label="Send message"
                    title="Send"
                    onClick={sendChat}
                    disabled={
                      !canMutateBoard ||
                      !chatInput.trim()
                    }
                    className="
                      flex h-7 w-7 shrink-0
                      items-center justify-center
                      rounded-[6px]
                      bg-[#f3f4f6]
                      text-[#202124]
                      transition-colors duration-150
                      hover:bg-white
                      disabled:cursor-default
                      disabled:opacity-30
                    "
                  >
                    <Send
                      aria-hidden="true"
                      width={14}
                      height={14}
                      strokeWidth={1.9}
                    />
                  </button>
                </div>

                <div
                  className="
                    wb-chat-hint mt-1.5 px-1
                    text-[9px]
                    text-[#737982]
                  "
                >
                  Enter to send · Shift+Enter for a new line
                </div>
              </div>
            </section>
          )}
        </div>
        {/* End chat dock */}
      </div>
    </div>
  );
}

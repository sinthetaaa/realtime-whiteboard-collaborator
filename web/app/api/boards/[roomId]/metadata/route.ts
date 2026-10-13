import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  authorizeBoardMutation,
  isSameOriginMutation,
} from '../../../../../lib/httpSecurity';

import {
  redis,
} from '../../../../../lib/redis';

import type {
  BoardMetadata,
} from '../../../../../types/boardMetadata';


const memory =
  new Map<
    string,
    BoardMetadata
  >();

const hasRedis =
  Boolean(redis);

const METADATA_TTL_SECONDS =
  60 * 60 * 24 * 7;

const DEFAULT_TITLE =
  'Untitled board';

const MAX_TITLE_LENGTH =
  120;

const noStoreHeaders = {
  'Cache-Control':
    'no-store',
};


const metadataKeyOf = (
  roomId: string,
) =>
  `sayantika:whiteboard:v1:meta:${roomId}`;


const normalizeTitle = (
  value: unknown,
) => {
  if (
    typeof value !==
    'string'
  ) {
    return DEFAULT_TITLE;
  }

  const trimmed =
    value.trim();

  if (!trimmed) {
    return DEFAULT_TITLE;
  }

  return trimmed.slice(
    0,
    MAX_TITLE_LENGTH,
  );
};


const isRecord = (
  value: unknown,
): value is Record<
  string,
  unknown
> =>
  typeof value ===
    'object' &&
  value !== null &&
  !Array.isArray(value);


const parseMetadata = (
  raw: unknown,
): BoardMetadata | null => {
  let value =
    raw;

  if (
    typeof value ===
    'string'
  ) {
    try {
      value =
        JSON.parse(
          value,
        );
    } catch {
      return null;
    }
  }

  if (!isRecord(value)) {
    return null;
  }

  if (
    value.version !== 1 ||
    typeof value.roomId !==
      'string' ||
    typeof value.title !==
      'string' ||
    typeof value.createdAt !==
      'number' ||
    typeof value.updatedAt !==
      'number'
  ) {
    return null;
  }

  return {
    version: 1,
    roomId:
      value.roomId,
    title:
      value.title,
    createdAt:
      value.createdAt,
    updatedAt:
      value.updatedAt,
  };
};


const loadMetadata =
  async (
    roomId: string,
  ): Promise<
    BoardMetadata | null
  > => {
    if (hasRedis) {
      const raw =
        await redis!.get<
          unknown
        >(
          metadataKeyOf(
            roomId,
          ),
        );

      return parseMetadata(
        raw,
      );
    }

    return (
      memory.get(roomId) ??
      null
    );
  };


const createMetadataIfMissing =
  async (
    roomId: string,
    title: string,
  ): Promise<{
    metadata:
      BoardMetadata;
    created:
      boolean;
  }> => {
    const now =
      Date.now();

    const candidate:
      BoardMetadata = {
        version: 1,
        roomId,
        title,
        createdAt:
          now,
        updatedAt:
          now,
      };

    if (hasRedis) {
      const created =
        await redis!.set(
          metadataKeyOf(
            roomId,
          ),
          JSON.stringify(
            candidate,
          ),
          {
            nx: true,
            ex:
              METADATA_TTL_SECONDS,
          },
        );

      if (
        created ===
        'OK'
      ) {
        return {
          metadata:
            candidate,
          created:
            true,
        };
      }

      const existing =
        await loadMetadata(
          roomId,
        );

      if (!existing) {
        throw new Error(
          'METADATA_CREATE_RACE',
        );
      }

      return {
        metadata:
          existing,
        created:
          false,
      };
    }

    const existing =
      memory.get(
        roomId,
      );

    if (existing) {
      return {
        metadata:
          existing,
        created:
          false,
      };
    }

    memory.set(
      roomId,
      candidate,
    );

    return {
      metadata:
        candidate,
      created:
        true,
    };
  };


const updateMetadataTitle =
  async (
    roomId: string,
    title: string,
  ): Promise<{
    metadata:
      BoardMetadata;
    created:
      boolean;
  }> => {
    const existing =
      await loadMetadata(
        roomId,
      );

    const now =
      Date.now();

    const next:
      BoardMetadata = {
        version: 1,
        roomId,
        title,

        createdAt:
          existing?.createdAt ??
          now,

        updatedAt:
          now,
      };

    if (hasRedis) {
      await redis!.set(
        metadataKeyOf(
          roomId,
        ),
        JSON.stringify(
          next,
        ),
        {
          ex:
            METADATA_TTL_SECONDS,
        },
      );
    } else {
      memory.set(
        roomId,
        next,
      );
    }

    return {
      metadata:
        next,

      created:
        existing == null,
    };
  };


const deleteMetadata =
  async (
    roomId: string,
  ) => {
    if (hasRedis) {
      await redis!.del(
        metadataKeyOf(
          roomId,
        ),
      );

      return;
    }

    memory.delete(
      roomId,
    );
  };


const readRequestTitle =
  async (
    request: NextRequest,
  ) => {
    const body: unknown =
      await request.json();

    if (!isRecord(body)) {
      return DEFAULT_TITLE;
    }

    return normalizeTitle(
      body.title,
    );
  };


const invalidOrigin =
  () =>
    NextResponse.json(
      {
        ok: false,
        error:
          'INVALID_ORIGIN',
      },
      {
        status: 403,
        headers:
          noStoreHeaders,
      },
    );


const authorizationFailure =
  (
    status:
      Exclude<
        Awaited<
          ReturnType<
            typeof authorizeBoardMutation
          >
        >['status'],
        'OK'
      >,
  ) => {
    if (
      status ===
      'UNAUTHENTICATED'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'UNAUTHENTICATED',
        },
        {
          status: 401,
          headers:
            noStoreHeaders,
        },
      );
    }

    if (
      status ===
      'REMOVED'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'REMOVED_FROM_BOARD',
        },
        {
          status: 403,
          headers:
            noStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          'HOST_REQUIRED',
      },
      {
        status: 403,
        headers:
          noStoreHeaders,
      },
    );
  };


export async function GET(
  _request: NextRequest,
  context: {
    params:
      Promise<{
        roomId: string;
      }>;
  },
) {
  try {
    const {
      roomId,
    } =
      await context.params;

    const decoded =
      decodeURIComponent(
        roomId,
      );

    const metadata =
      await loadMetadata(
        decoded,
      );

    return NextResponse.json(
      {
        ok: true,

        exists:
          metadata != null,

        metadata,

        storage:
          hasRedis
            ? 'redis'
            : 'memory',
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error: unknown) {
    console.error(
      'GET board metadata error',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'SERVER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
        headers:
          noStoreHeaders,
      },
    );
  }
}


export async function PUT(
  request: NextRequest,
  context: {
    params:
      Promise<{
        roomId: string;
      }>;
  },
) {
  try {
    if (
      !isSameOriginMutation(
        request,
      )
    ) {
      return invalidOrigin();
    }

    const {
      roomId,
    } =
      await context.params;

    const decoded =
      decodeURIComponent(
        roomId,
      );

    const authorization =
      await authorizeBoardMutation(
        decoded,
      );

    if (
      authorization.status !==
      'OK'
    ) {
      return authorizationFailure(
        authorization.status,
      );
    }

    const title =
      await readRequestTitle(
        request,
      );

    const result =
      await createMetadataIfMissing(
        decoded,
        title,
      );

    return NextResponse.json(
      {
        ok: true,
        ...result,

        storage:
          hasRedis
            ? 'redis'
            : 'memory',
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error: unknown) {
    console.error(
      'PUT board metadata error',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'SERVER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
        headers:
          noStoreHeaders,
      },
    );
  }
}


export async function PATCH(
  request: NextRequest,
  context: {
    params:
      Promise<{
        roomId: string;
      }>;
  },
) {
  try {
    if (
      !isSameOriginMutation(
        request,
      )
    ) {
      return invalidOrigin();
    }

    const {
      roomId,
    } =
      await context.params;

    const decoded =
      decodeURIComponent(
        roomId,
      );

    const authorization =
      await authorizeBoardMutation(
        decoded,
      );

    if (
      authorization.status !==
      'OK'
    ) {
      return authorizationFailure(
        authorization.status,
      );
    }

    const title =
      await readRequestTitle(
        request,
      );

    const result =
      await updateMetadataTitle(
        decoded,
        title,
      );

    return NextResponse.json(
      {
        ok: true,
        ...result,

        storage:
          hasRedis
            ? 'redis'
            : 'memory',
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error: unknown) {
    console.error(
      'PATCH board metadata error',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'SERVER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
        headers:
          noStoreHeaders,
      },
    );
  }
}


export async function DELETE(
  request: NextRequest,
  context: {
    params:
      Promise<{
        roomId: string;
      }>;
  },
) {
  try {
    if (
      !isSameOriginMutation(
        request,
      )
    ) {
      return invalidOrigin();
    }

    const {
      roomId,
    } =
      await context.params;

    const decoded =
      decodeURIComponent(
        roomId,
      );

    const authorization =
      await authorizeBoardMutation(
        decoded,
        {
          requireHost:
            true,
        },
      );

    if (
      authorization.status !==
      'OK'
    ) {
      return authorizationFailure(
        authorization.status,
      );
    }

    await deleteMetadata(
      decoded,
    );

    return NextResponse.json(
      {
        ok: true,
        roomId:
          decoded,
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error: unknown) {
    console.error(
      'DELETE board metadata error',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'SERVER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
        headers:
          noStoreHeaders,
      },
    );
  }
}

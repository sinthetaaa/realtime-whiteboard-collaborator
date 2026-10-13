import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  authorizeBoardMutation,
  isSameOriginMutation,
} from '../../../../lib/httpSecurity';

import {
  redis,
} from '../../../../lib/redis';


const memory =
  new Map<
    string,
    Uint8Array
  >();

const hasRedis =
  Boolean(redis);

const BOARD_TTL_SECONDS =
  60 * 60 * 24 * 7;

const noStoreHeaders = {
  'Cache-Control':
    'no-store',
};


const keyOf = (
  roomId: string,
) =>
  `sayantika:whiteboard:v1:board:${roomId}`;


async function loadBoard(
  roomId: string,
): Promise<
  Uint8Array | null
> {
  if (hasRedis) {
    const b64 =
      await redis!.get<string>(
        keyOf(roomId),
      );

    if (!b64) {
      return null;
    }

    const bin =
      Uint8Array.from(
        atob(b64),
        (character) =>
          character.charCodeAt(
            0,
          ),
      );

    return bin;
  }

  return (
    memory.get(roomId) ??
    null
  );
}


async function saveBoard(
  roomId: string,
  bytes: Uint8Array,
): Promise<void> {
  if (hasRedis) {
    const b64 =
      btoa(
        String.fromCharCode(
          ...bytes,
        ),
      );

    await redis!.set(
      keyOf(roomId),
      b64,
      {
        ex:
          BOARD_TTL_SECONDS,
      },
    );

    return;
  }

  memory.set(
    roomId,
    bytes,
  );
}


async function deleteBoard(
  roomId: string,
) {
  if (hasRedis) {
    await redis!.del(
      keyOf(roomId),
    );

    return;
  }

  memory.delete(
    roomId,
  );
}


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
  request: NextRequest,
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

    const format =
      request.nextUrl
        .searchParams
        .get(
          'format',
        );

    const bytes =
      await loadBoard(
        decoded,
      );

    const exists =
      Boolean(bytes);

    const size =
      bytes?.byteLength ??
      0;

    if (
      format ===
      'json'
    ) {
      return NextResponse.json(
        {
          ok: true,
          roomId:
            decoded,
          exists,
          size,
        },
        {
          headers:
            noStoreHeaders,
        },
      );
    }

    if (!bytes) {
      return new NextResponse(
        'Not found',
        {
          status: 404,
          headers:
            noStoreHeaders,
        },
      );
    }

    return new NextResponse(
      Buffer.from(
        bytes,
      ),
      {
        headers: {
          'Content-Type':
            'application/octet-stream',

          'Content-Disposition':
            `attachment; filename="${decoded}"`,

          'Content-Length':
            String(size),

          ...noStoreHeaders,
        },
      },
    );
  } catch (error: unknown) {
    console.error(
      'GET /boards error',
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


export async function POST(
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

    const arrayBuffer =
      await request.arrayBuffer();

    const bytes =
      new Uint8Array(
        arrayBuffer,
      );

    if (
      !bytes.byteLength
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'EMPTY_BODY',
        },
        {
          status: 400,
          headers:
            noStoreHeaders,
        },
      );
    }

    await saveBoard(
      decoded,
      bytes,
    );

    return NextResponse.json(
      {
        ok: true,
        roomId:
          decoded,
        size:
          bytes.byteLength,
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
      'POST /boards error',
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

    await deleteBoard(
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
      'DELETE /boards error',
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


/*
 * Node-safe base64 helpers.
 */
function atob(
  b64: string,
) {
  return Buffer
    .from(
      b64,
      'base64',
    )
    .toString(
      'binary',
    );
}


function btoa(
  binary: string,
) {
  return Buffer
    .from(
      binary,
      'binary',
    )
    .toString(
      'base64',
    );
}

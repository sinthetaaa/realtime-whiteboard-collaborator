import {
  cookies,
} from 'next/headers';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  claimBoardHost,
  getBoardAccess,
  removeBoardUser,
  transferBoardHost,
} from '../../../../../lib/boardAccess';

import {
  isSameOriginMutation,
} from '../../../../../lib/httpSecurity';

import {
  normalizeAnonymousUserId,
  normalizeRoomId,
  verifySessionToken,
} from '../../../../../lib/realtimeAuth';


const SESSION_COOKIE =
  'wb_session';


type AccessAction =
  | 'claim-host'
  | 'transfer-host'
  | 'remove-user';


const noStoreHeaders = {
  'Cache-Control':
    'no-store',
};


const readAuthenticatedUserId =
  async () => {
    const cookieStore =
      await cookies();

    const token =
      cookieStore.get(
        SESSION_COOKIE,
      )?.value;

    if (!token) {
      return null;
    }

    return verifySessionToken(
      token,
    );
  };


const readRoomId =
  async (
    context: {
      params:
        Promise<{
          roomId: string;
        }>;
    },
  ) => {
    const {
      roomId,
    } =
      await context.params;

    let decoded =
      roomId;

    try {
      decoded =
        decodeURIComponent(
          roomId,
        );
    } catch {
      return null;
    }

    return normalizeRoomId(
      decoded,
    );
  };


const readBody =
  async (
    request: NextRequest,
  ): Promise<{
    action: AccessAction | null;
    targetUserId: string | null;
  }> => {
    try {
      const body: unknown =
        await request.json();

      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        return {
          action: null,
          targetUserId: null,
        };
      }

      const record =
        body as Record<
          string,
          unknown
        >;

      const action =
        record.action ===
          'claim-host' ||
        record.action ===
          'transfer-host' ||
        record.action ===
          'remove-user'
          ? record.action
          : null;

      return {
        action,
        targetUserId:
          normalizeAnonymousUserId(
            record.targetUserId,
          ),
      };
    } catch {
      return {
        action: null,
        targetUserId: null,
      };
    }
  };


const unauthorized =
  () =>
    NextResponse.json(
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


const invalidRoom =
  () =>
    NextResponse.json(
      {
        ok: false,
        error:
          'INVALID_ROOM_ID',
      },
      {
        status: 400,
        headers:
          noStoreHeaders,
      },
    );


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
    const [
      roomId,
      userId,
    ] =
      await Promise.all([
        readRoomId(
          context,
        ),
        readAuthenticatedUserId(),
      ]);

    if (!roomId) {
      return invalidRoom();
    }

    if (!userId) {
      return unauthorized();
    }

    const access =
      await getBoardAccess(
        roomId,
        userId,
      );

    return NextResponse.json(
      {
        ok: true,
        roomId,
        userId,
        ...access,
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error: unknown) {
    console.error(
      'GET board access error',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'SERVER_ERROR',
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
      return NextResponse.json(
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
    }

    const [
      roomId,
      userId,
    ] =
      await Promise.all([
        readRoomId(
          context,
        ),
        readAuthenticatedUserId(),
      ]);

    if (!roomId) {
      return invalidRoom();
    }

    if (!userId) {
      return unauthorized();
    }

    const {
      action,
      targetUserId,
    } =
      await readBody(
        request,
      );

    if (!action) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'INVALID_ACTION',
        },
        {
          status: 400,
          headers:
            noStoreHeaders,
        },
      );
    }


    if (
      action ===
      'claim-host'
    ) {
      const result =
        await claimBoardHost(
          roomId,
          userId,
        );

      if (
        result.status ===
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

      const access =
        await getBoardAccess(
          roomId,
          userId,
        );

      return NextResponse.json(
        {
          ok: true,
          action,
          roomId,
          userId,
          ...access,
        },
        {
          headers:
            noStoreHeaders,
        },
      );
    }


    if (!targetUserId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'INVALID_TARGET_USER',
        },
        {
          status: 400,
          headers:
            noStoreHeaders,
        },
      );
    }


    if (
      action ===
      'transfer-host'
    ) {
      const result =
        await transferBoardHost(
          roomId,
          userId,
          targetUserId,
        );

      if (
        result.status ===
        'NOT_HOST'
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'HOST_REQUIRED',
            hostUserId:
              result.hostUserId,
          },
          {
            status: 403,
            headers:
              noStoreHeaders,
          },
        );
      }

      if (
        result.status ===
        'TARGET_REMOVED'
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'TARGET_REMOVED',
          },
          {
            status: 409,
            headers:
              noStoreHeaders,
          },
        );
      }

      return NextResponse.json(
        {
          ok: true,
          action,
          roomId,
          userId,
          hostUserId:
            result.hostUserId,
        },
        {
          headers:
            noStoreHeaders,
        },
      );
    }


    const result =
      await removeBoardUser(
        roomId,
        userId,
        targetUserId,
      );

    if (
      result.status ===
      'NOT_HOST'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'HOST_REQUIRED',
          hostUserId:
            result.hostUserId,
        },
        {
          status: 403,
          headers:
            noStoreHeaders,
        },
      );
    }

    if (
      result.status ===
      'SELF_REMOVE'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'HOST_CANNOT_REMOVE_SELF',
        },
        {
          status: 409,
          headers:
            noStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        action,
        roomId,
        userId,
        targetUserId,
        hostUserId:
          result.hostUserId,
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error: unknown) {
    console.error(
      'POST board access error',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'SERVER_ERROR',
      },
      {
        status: 500,
        headers:
          noStoreHeaders,
      },
    );
  }
}

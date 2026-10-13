import {
  cookies,
} from 'next/headers';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  normalizeRoomId,
  signRealtimeToken,
  verifySessionToken,
} from '../../../../lib/realtimeAuth';


const SESSION_COOKIE =
  'wb_session';


export async function GET(
  request: NextRequest,
) {
  const roomId =
    normalizeRoomId(
      request.nextUrl.searchParams.get(
        'roomId',
      ),
    );

  if (!roomId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'INVALID_ROOM_ID',
      },
      {
        status: 400,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }

  const cookieStore =
    await cookies();

  const sessionToken =
    cookieStore.get(
      SESSION_COOKIE,
    )?.value;

  if (!sessionToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'UNAUTHENTICATED',
      },
      {
        status: 401,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }

  const userId =
    await verifySessionToken(
      sessionToken,
    );

  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'INVALID_SESSION',
      },
      {
        status: 401,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }

  const token =
    await signRealtimeToken(
      userId,
      roomId,
    );

  return NextResponse.json(
    {
      ok: true,
      token,
      userId,
      expiresInSeconds:
        300,
    },
    {
      headers: {
        'Cache-Control':
          'no-store',
      },
    },
  );
}

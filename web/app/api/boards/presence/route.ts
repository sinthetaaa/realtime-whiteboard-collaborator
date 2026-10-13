import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  BOARD_PRESENCE_MAX_ROOMS,
  BOARD_PRESENCE_STALE_AFTER_MS,
  readBoardPresenceBatch,
} from '../../../../lib/boardPresence';

import {
  isSameOriginMutation,
  readAuthenticatedUserId,
} from '../../../../lib/httpSecurity';


const noStoreHeaders = {
  'Cache-Control':
    'no-store',
};


const ROOM_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,128}$/;


const isRecord = (
  value: unknown,
): value is Record<
  string,
  unknown
> =>
  typeof value ===
    'object' &&
  value !== null &&
  !Array.isArray(
    value,
  );


const readRoomIds =
  async (
    request: NextRequest,
  ): Promise<
    string[] | null
  > => {
    let body:
      unknown;

    try {
      body =
        await request.json();
    } catch {
      return null;
    }

    if (
      !isRecord(
        body,
      ) ||
      !Array.isArray(
        body.roomIds,
      ) ||
      body.roomIds.length >
        BOARD_PRESENCE_MAX_ROOMS
    ) {
      return null;
    }

    const roomIds:
      string[] = [];

    const seen =
      new Set<string>();


    for (
      const value
      of body.roomIds
    ) {
      if (
        typeof value !==
        'string'
      ) {
        return null;
      }

      const roomId =
        value.trim();

      if (
        !ROOM_ID_PATTERN.test(
          roomId,
        )
      ) {
        return null;
      }

      if (
        seen.has(
          roomId,
        )
      ) {
        continue;
      }

      seen.add(
        roomId,
      );

      roomIds.push(
        roomId,
      );
    }

    return roomIds;
  };


export async function POST(
  request: NextRequest,
) {
  /*
   * Although this endpoint only reads presence, it accepts
   * a POST body and authenticated cookie. Requiring exact
   * same-origin requests prevents another site from using
   * the browser's session to probe room presence.
   */
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
        status:
          403,
        headers:
          noStoreHeaders,
      },
    );
  }

  const userId =
    await readAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'UNAUTHORIZED',
      },
      {
        status:
          401,
        headers:
          noStoreHeaders,
      },
    );
  }

  const roomIds =
    await readRoomIds(
      request,
    );

  if (!roomIds) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'INVALID_ROOM_IDS',
      },
      {
        status:
          400,
        headers:
          noStoreHeaders,
      },
    );
  }

  try {
    const requestedAt =
      Date.now();

    const rooms =
      await readBoardPresenceBatch(
        roomIds,
        requestedAt,
      );

    return NextResponse.json(
      {
        ok: true,
        userId,
        requestedAt,
        staleAfterMs:
          BOARD_PRESENCE_STALE_AFTER_MS,
        rooms,
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (
    error: unknown
  ) {
    console.error(
      '[presence-api] lookup failed',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'PRESENCE_UNAVAILABLE',
      },
      {
        status:
          503,
        headers:
          noStoreHeaders,
      },
    );
  }
}

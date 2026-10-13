import {
  randomUUID,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createBoardWithOwner,
} from '../../../lib/boardAccess';

import {
  isSameOriginMutation,
  readAuthenticatedUserId,
} from '../../../lib/httpSecurity';

import type {
  BoardMetadata,
} from '../../../types/boardMetadata';


const DEFAULT_TITLE =
  'Untitled board';

const MAX_CREATE_ATTEMPTS =
  8;

const noStoreHeaders = {
  'Cache-Control':
    'no-store',
};


const createRoomId =
  () =>
    randomUUID()
      .replace(
        /-/g,
        '',
      )
      .slice(
        0,
        24,
      );


export async function POST(
  request: NextRequest,
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

    const userId =
      await readAuthenticatedUserId();

    if (!userId) {
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

    for (
      let attempt = 0;
      attempt <
        MAX_CREATE_ATTEMPTS;
      attempt += 1
    ) {
      const roomId =
        createRoomId();

      const now =
        Date.now();

      const metadata:
        BoardMetadata = {
          version: 1,
          roomId,
          title:
            DEFAULT_TITLE,
          createdAt:
            now,
          updatedAt:
            now,
        };

      const result =
        await createBoardWithOwner(
          roomId,
          userId,
          JSON.stringify(
            metadata,
          ),
        );

      if (
        result.status ===
          'COLLISION'
      ) {
        continue;
      }

      return NextResponse.json(
        {
          ok: true,
          roomId,
          userId,
          metadata,
        },
        {
          status: 201,
          headers:
            noStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          'ROOM_ID_ALLOCATION_FAILED',
      },
      {
        status: 503,
        headers:
          noStoreHeaders,
      },
    );
  } catch (error: unknown) {
    console.error(
      'POST create board error',
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

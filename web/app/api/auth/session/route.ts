import {
  cookies,
} from 'next/headers';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isSameOriginMutation,
} from '../../../../lib/httpSecurity';

import {
  createAnonymousUserId,
  signSessionToken,
  verifySessionToken,
} from '../../../../lib/realtimeAuth';


const SESSION_COOKIE =
  'wb_session';

const SESSION_MAX_AGE_SECONDS =
  60 * 60 * 24 * 30;

const noStoreHeaders = {
  'Cache-Control':
    'no-store',
};


export async function POST(
  request: NextRequest,
) {
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

  const cookieStore =
    await cookies();

  const existingToken =
    cookieStore.get(
      SESSION_COOKIE,
    )?.value;

  let userId =
    existingToken
      ? await verifySessionToken(
          existingToken,
        )
      : null;

  let created =
    false;

  if (!userId) {
    userId =
      createAnonymousUserId();

    const sessionToken =
      await signSessionToken(
        userId,
      );

    cookieStore.set(
      SESSION_COOKIE,
      sessionToken,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          'production',

        sameSite:
          'lax',

        path:
          '/',

        maxAge:
          SESSION_MAX_AGE_SECONDS,
      },
    );

    created =
      true;
  }

  return NextResponse.json(
    {
      ok: true,
      userId,
      created,
    },
    {
      headers:
        noStoreHeaders,
    },
  );
}

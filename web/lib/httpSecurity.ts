import {
  cookies,
} from 'next/headers';

import type {
  NextRequest,
} from 'next/server';

import {
  getBoardAccess,
} from './boardAccess';

import {
  verifySessionToken,
} from './realtimeAuth';


const SESSION_COOKIE =
  'wb_session';


export const isSameOriginMutation =
  (
    request: NextRequest,
  ) => {
    const originHeader =
      request.headers.get(
        'origin',
      );

    if (!originHeader) {
      return false;
    }

    let requestOrigin:
      string;

    try {
      requestOrigin =
        new URL(
          originHeader,
        ).origin;
    } catch {
      return false;
    }

    return (
      requestOrigin ===
      request.nextUrl.origin
    );
  };


export const readAuthenticatedUserId =
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


export type BoardMutationAuthorization =
  | {
      status: 'OK';
      userId: string;
      hostUserId: string | null;
      isHost: boolean;
    }
  | {
      status: 'UNAUTHENTICATED';
    }
  | {
      status: 'REMOVED';
      userId: string;
      hostUserId: string | null;
    }
  | {
      status: 'HOST_REQUIRED';
      userId: string;
      hostUserId: string | null;
    };


export const authorizeBoardMutation =
  async (
    roomId: string,
    options?: {
      requireHost?: boolean;
    },
  ): Promise<
    BoardMutationAuthorization
  > => {
    const userId =
      await readAuthenticatedUserId();

    if (!userId) {
      return {
        status:
          'UNAUTHENTICATED',
      };
    }

    const access =
      await getBoardAccess(
        roomId,
        userId,
      );

    if (access.removed) {
      return {
        status:
          'REMOVED',
        userId,
        hostUserId:
          access.hostUserId,
      };
    }

    if (
      options?.requireHost &&
      !access.isHost
    ) {
      return {
        status:
          'HOST_REQUIRED',
        userId,
        hostUserId:
          access.hostUserId,
      };
    }

    return {
      status:
        'OK',
      userId,
      hostUserId:
        access.hostUserId,
      isHost:
        access.isHost,
    };
  };

import {
  randomUUID,
} from 'node:crypto';

import {
  SignJWT,
  jwtVerify,
} from 'jose';


const AUTH_ISSUER =
  'sayantika-whiteboard';

const SESSION_AUDIENCE =
  'whiteboard-session';

const REALTIME_AUDIENCE =
  'whiteboard-realtime';

const USER_ID_PATTERN =
  /^[A-Za-z0-9_-]{16,128}$/;

const ROOM_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,128}$/;


const getAuthKey = () => {
  const secret =
    process.env
      .WHITEBOARD_AUTH_SECRET
      ?.trim();

  if (
    !secret ||
    secret.length < 32
  ) {
    throw new Error(
      'WHITEBOARD_AUTH_SECRET must contain at least 32 characters.',
    );
  }

  return new TextEncoder().encode(
    secret,
  );
};


export const normalizeAnonymousUserId = (
  value: unknown,
): string | null => {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const candidate =
    value.trim();

  if (
    !USER_ID_PATTERN.test(
      candidate,
    )
  ) {
    return null;
  }

  return candidate;
};


export const normalizeRoomId = (
  value: unknown,
): string | null => {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const candidate =
    value.trim();

  if (
    !ROOM_ID_PATTERN.test(
      candidate,
    )
  ) {
    return null;
  }

  return candidate;
};


export const createAnonymousUserId =
  () =>
    randomUUID();


export const signSessionToken =
  async (
    userId: string,
  ) => {
    return new SignJWT({
      type: 'session',
    })
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
      })
      .setIssuer(
        AUTH_ISSUER,
      )
      .setAudience(
        SESSION_AUDIENCE,
      )
      .setSubject(
        userId,
      )
      .setIssuedAt()
      .setExpirationTime(
        '30d',
      )
      .sign(
        getAuthKey(),
      );
  };


export const verifySessionToken =
  async (
    token: string,
  ): Promise<string | null> => {
    try {
      const {
        payload,
      } = await jwtVerify(
        token,
        getAuthKey(),
        {
          algorithms: [
            'HS256',
          ],
          issuer:
            AUTH_ISSUER,
          audience:
            SESSION_AUDIENCE,
        },
      );

      if (
        payload.type !==
        'session'
      ) {
        return null;
      }

      return normalizeAnonymousUserId(
        payload.sub,
      );
    } catch {
      return null;
    }
  };


export const signRealtimeToken =
  async (
    userId: string,
    roomId: string,
  ) => {
    return new SignJWT({
      type:
        'realtime',
      roomId,
    })
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
      })
      .setIssuer(
        AUTH_ISSUER,
      )
      .setAudience(
        REALTIME_AUDIENCE,
      )
      .setSubject(
        userId,
      )
      .setIssuedAt()
      .setExpirationTime(
        '5m',
      )
      .sign(
        getAuthKey(),
      );
  };

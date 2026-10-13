import {
  jwtVerify,
} from 'jose';


const AUTH_ISSUER =
  'sayantika-whiteboard';

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


export type RealtimeIdentity = {
  userId: string;
  roomId: string;
};


export const verifyRealtimeToken =
  async (
    token: string,
    documentName: string,
  ): Promise<RealtimeIdentity> => {
    if (!token.trim()) {
      throw new Error(
        'REALTIME_TOKEN_MISSING',
      );
    }

    if (
      !ROOM_ID_PATTERN.test(
        documentName,
      )
    ) {
      throw new Error(
        'INVALID_DOCUMENT_NAME',
      );
    }

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
          REALTIME_AUDIENCE,
      },
    );

    if (
      payload.type !==
      'realtime'
    ) {
      throw new Error(
        'INVALID_TOKEN_TYPE',
      );
    }

    const userId =
      typeof payload.sub ===
        'string' &&
      USER_ID_PATTERN.test(
        payload.sub,
      )
        ? payload.sub
        : null;

    const roomId =
      typeof payload.roomId ===
        'string' &&
      ROOM_ID_PATTERN.test(
        payload.roomId,
      )
        ? payload.roomId
        : null;

    if (!userId) {
      throw new Error(
        'INVALID_TOKEN_USER',
      );
    }

    if (
      !roomId ||
      roomId !==
        documentName
    ) {
      throw new Error(
        'TOKEN_ROOM_MISMATCH',
      );
    }

    return {
      userId,
      roomId,
    };
  };

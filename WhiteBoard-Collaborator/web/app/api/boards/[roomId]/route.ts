// web/app/api/boards/[roomId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';

const memory = new Map<string, Uint8Array>();
const hasRedis = !!redis;

const keyOf = (roomId: string) => `wb:board:${roomId}`;

async function loadBoard(roomId: string): Promise<Uint8Array | null> {
  if (hasRedis) {
    const b64 = await redis!.get<string>(keyOf(roomId));
    if (!b64) return null;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return bin;
  }
  return memory.get(roomId) ?? null;
}

async function saveBoard(roomId: string, bytes: Uint8Array): Promise<void> {
  if (hasRedis) {
    const b64 = btoa(String.fromCharCode(...bytes));
    await redis!.set(keyOf(roomId), b64, { ex: 60 * 60 * 24 * 7 });
    return;
  }
  memory.set(roomId, bytes);
}

async function deleteBoard(roomId: string) {
  if (hasRedis) {
    await redis!.del(keyOf(roomId));
  } else {
    memory.delete(roomId);
  }
}

/** ---------- Handlers (await ctx.params) ---------- */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }   // <- params is a Promise
) {
  try {
    const { roomId } = await ctx.params;          // <- await it
    const decoded = decodeURIComponent(roomId);
    const format = req.nextUrl.searchParams.get('format');

    const bytes = await loadBoard(decoded);
    const exists = !!bytes;
    const size = bytes?.byteLength ?? 0;

    if (format === 'json') {
      return NextResponse.json({ ok: true, roomId: decoded, exists, size });
    }

    if (!exists) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${decoded}"`,
        'Content-Length': String(size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('GET /boards error', err);
    return NextResponse.json(
      { ok: false, error: 'SERVER_ERROR', message: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }   // <- params is a Promise
) {
  try {
    const { roomId } = await ctx.params;          // <- await it
    const decoded = decodeURIComponent(roomId);

    const ab = await req.arrayBuffer();
    const bytes = new Uint8Array(ab);

    if (!bytes.byteLength) {
      return NextResponse.json({ ok: false, error: 'EMPTY_BODY' }, { status: 400 });
    }

    await saveBoard(decoded, bytes);
    return NextResponse.json({
      ok: true,
      roomId: decoded,
      size: bytes.byteLength,
      storage: hasRedis ? 'redis' : 'memory',
    });
  } catch (err: any) {
    console.error('POST /boards error', err);
    return NextResponse.json(
      { ok: false, error: 'SERVER_ERROR', message: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }   // <- params is a Promise
) {
  try {
    const { roomId } = await ctx.params;          // <- await it
    const decoded = decodeURIComponent(roomId);
    await deleteBoard(decoded);
    return NextResponse.json({ ok: true, roomId: decoded });
  } catch (err: any) {
    console.error('DELETE /boards error', err);
    return NextResponse.json(
      { ok: false, error: 'SERVER_ERROR', message: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

/** Node-safe base64 helpers (since atob/btoa aren't in Node) */
function atob(b64: string) {
  return Buffer.from(b64, 'base64').toString('binary');
}
function btoa(bin: string) {
  return Buffer.from(bin, 'binary').toString('base64');
}

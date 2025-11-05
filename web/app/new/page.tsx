// web/app/new/page.tsx
import { redirect } from 'next/navigation';

function makeId() {
  const raw =
    (globalThis.crypto as any)?.randomUUID?.().replace(/-/g, '') ||
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return raw.slice(0, 10); 
}

export default function NewPage() {
  const id = makeId();
  redirect(`/r/${id}`);
}

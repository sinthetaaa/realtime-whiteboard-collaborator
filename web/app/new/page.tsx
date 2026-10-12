import { redirect } from 'next/navigation';

function makeId() {
  const raw =
    globalThis.crypto?.randomUUID?.().replace(/-/g, '') ||
    Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2);

  return raw.slice(0, 10);
}

export default function NewPage() {
  const id = makeId();

  redirect(`/r/${id}?created=1`);
}

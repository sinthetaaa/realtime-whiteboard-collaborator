import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="mx-auto flex h-16 max-w-5xl items-center border-b border-[var(--border)] px-6">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-strong)] bg-white text-base"
          >
            W
          </span>
          Whiteboard
        </Link>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center px-6 py-16">
        <div className="w-full max-w-lg">
          <p className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
            Collaborative workspace
          </p>

          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            A shared space for your ideas.
          </h1>

          <p className="mt-4 max-w-md text-base leading-7 text-[var(--text-secondary)]">
            Create a whiteboard, draw together, and share the same workspace
            with your team in real time.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/new"
              className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[var(--accent)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-offset-4"
            >
              New board
            </Link>

            <Link
              href="/r/demo"
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--border-strong)] bg-white px-5 text-sm font-medium transition-colors hover:bg-[var(--surface-muted)]"
            >
              Open demo board
            </Link>
          </div>

          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            Anyone with a board link can join the same workspace.
          </p>
        </div>
      </section>
    </main>
  );
}

import { Link } from "@tanstack/react-router";
import { Mark } from "@/lib/logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link to="/llc" className="flex items-center gap-2 text-fg">
            <Mark className="size-7" />
            <span className="font-display text-lg tracking-tight">
              Pathway Formation
            </span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted">
            <Link to="/llc" className="hover:text-fg">
              Packets
            </Link>
            <Link to="/clients" className="hover:text-fg">
              Desk
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

export function AuthSkeleton() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-sm text-muted">Loading…</div>
  );
}

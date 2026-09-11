import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Mark } from "@/lib/logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 text-fg">
          <Mark className="size-8" />
          <span className="font-display text-2xl tracking-tight">
            LLC Formation
          </span>
        </Link>
        <h1 className="mt-8 font-display text-4xl tracking-tight">Sign in</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your filings stay on this account.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                variant="secondary"
                onClick={() =>
                  signIn(p.providerId, { callbackURL: "/llc" })
                }
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
      </div>
    </main>
  );
}

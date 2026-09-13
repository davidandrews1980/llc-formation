import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, AuthSkeleton } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { legalName } from "@/lib/packet";
import { createFiling, deleteFiling, listFilings } from "@/lib/server/llc";
import { stateByCode } from "@/lib/states";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/llc")({ component: LlcIndex });

function LlcIndex() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <AppShell>
        <AuthSkeleton />
      </AppShell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return (
    <AppShell>
      <LlcInner />
    </AppShell>
  );
}

function LlcInner() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const filings = useQuery({ queryKey: ["filings"], queryFn: () => listFilings() });

  const create = useMutation({
    mutationFn: () => createFiling(),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["filings"] });
      await navigate({ to: "/llc/$id", params: { id: String(res.id) } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteFiling({ data: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filings"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Formation
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">Packets</h1>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="size-4" />
          New LLC packet
        </Button>
      </div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Pick a state, name the company, seat the members, and print a packet:
        articles, operating agreement, EIN checklist, and the filing office
        you actually have to visit.
      </p>
      <div className="mt-8 space-y-3">
        {filings.data && filings.data.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border px-5 py-10 text-sm text-muted">
            No packets yet. Michigan is the default because that is where most
            of our first filings live — change it on step one.
          </p>
        ) : null}
        {filings.data?.map((f) => {
          const st = stateByCode(f.stateCode);
          return (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3"
            >
              <Link
                to="/llc/$id"
                params={{ id: String(f.id) }}
                className="min-w-0 flex-1"
              >
                <p className="truncate font-medium text-fg">{legalName(f)}</p>
                <p className="text-xs text-muted">
                  {st?.name ?? f.stateCode} · step {f.step} of 9
                  {f.payments.length
                    ? ` · ${f.payments.length} paid`
                    : ""}
                </p>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete packet"
                onClick={() => remove.mutate(f.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

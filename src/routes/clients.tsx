import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, AuthSkeleton } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  listClients,
  updateOrder,
  type ClientRow,
  SERVICE_STATUSES,
} from "@/lib/server/llc";
import { FORMATION_ADDONS } from "@/lib/stripe";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/clients")({ component: ClientsPage });

const FILTERS = ["all", ...SERVICE_STATUSES] as const;

function ClientsPage() {
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
      <DeskInner />
    </AppShell>
  );
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function addonTitle(key: string) {
  return FORMATION_ADDONS.find((a) => a.key === key)?.title ?? key;
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function DeskInner() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["clients"], queryFn: () => listClients() });
  const [qtext, setQtext] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const save = useMutation({
    mutationFn: (input: { filingId: number; status?: string; notes?: string }) =>
      updateOrder({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = q.data?.clients ?? [];
  const shown = useMemo(() => {
    const needle = qtext.trim().toLowerCase();
    return rows.filter((c) => {
      if (filter !== "all" && c.serviceStatus !== filter) return false;
      if (!needle) return true;
      const blob = [
        c.entityName,
        c.nameEnding,
        c.organizerName,
        c.organizerEmail,
        c.email,
        c.stateCode,
        ...c.items.map((i) => addonTitle(i.addonKey)),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, qtext, filter]);

  const totalCents = shown.reduce((s, c) => s + c.totalCents, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        Admin
      </p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Desk</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Every paid order. Name, email, what they bought, what they paid, and
        where you are on the work. This is who you serve.
      </p>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm tabular-nums text-muted">
          {shown.length} order{shown.length === 1 ? "" : "s"} · {money(totalCents)}
        </p>
        <Input
          value={qtext}
          onChange={(e) => setQtext(e.target.value)}
          placeholder="Search name, email, company"
          className="max-w-xs"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.12em]",
              filter === f
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-fg",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {q.data && !q.data.operator ? (
        <p className="mt-4 text-sm text-muted">
          Showing your own paid packets. Sign in as the operator to see every
          order.
        </p>
      ) : null}

      <div className="mt-8 space-y-3">
        {q.isPending ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border px-5 py-10 text-sm text-muted">
            No orders yet. When someone pays, they land here with the packet
            and the line items.
          </p>
        ) : (
          shown.map((c) => (
            <OrderCard
              key={c.filingId}
              c={c}
              operator={!!q.data?.operator}
              busy={save.isPending}
              onStatus={(status) =>
                save.mutate({ filingId: c.filingId, status })
              }
              onNotes={(notes) => save.mutate({ filingId: c.filingId, notes })}
            />
          ))
        )}
      </div>
    </main>
  );
}

function OrderCard({
  c,
  operator,
  busy,
  onStatus,
  onNotes,
}: {
  c: ClientRow;
  operator: boolean;
  busy: boolean;
  onStatus: (s: string) => void;
  onNotes: (n: string) => void;
}) {
  const contact = c.organizerName || "No name";
  const mail = c.organizerEmail || c.email || "no email";
  return (
    <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/llc/$id"
            params={{ id: String(c.filingId) }}
            className="font-medium text-fg hover:underline"
          >
            {c.entityName || "Untitled"} {c.nameEnding}
          </Link>
          <p className="mt-1 text-sm text-muted">
            {contact} · {mail} · {c.stateCode}
          </p>
          <p className="mt-1 text-xs text-subtle">{when(c.paidAt)}</p>
        </div>
        <p className="text-lg tabular-nums text-fg">{money(c.totalCents)}</p>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-muted">
        {c.items.map((i) => (
          <li key={i.addonKey} className="flex justify-between gap-4">
            <span>
              {addonTitle(i.addonKey)}
              {i.status && i.status !== "paid" ? (
                <span className="ml-2 text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                  {i.status}
                </span>
              ) : null}
            </span>
            <span className="tabular-nums text-fg">{money(i.amountCents)}</span>
          </li>
        ))}
      </ul>

      {operator ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {SERVICE_STATUSES.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={c.serviceStatus === s ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => onStatus(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">
          {c.serviceStatus}
        </p>
      )}

      {operator ? (
        <textarea
          defaultValue={c.serviceNotes}
          placeholder="Notes for this job"
          className="mt-3 min-h-16 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2 text-sm"
          onBlur={(e) => {
            if (e.target.value !== c.serviceNotes) onNotes(e.target.value);
          }}
        />
      ) : c.serviceNotes ? (
        <p className="mt-3 text-sm text-muted">{c.serviceNotes}</p>
      ) : null}
    </article>
  );
}

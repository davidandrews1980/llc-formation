import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell, AuthSkeleton } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { emptyMember, type Member } from "@/lib/members";
import {
  articlesText,
  complianceCalendar,
  einChecklist,
  filingInstructions,
  legalName,
  operatingAgreementText,
} from "@/lib/packet";
import {
  draftOperatingAgreement,
  getFiling,
  saveFiling,
  type Filing,
  type FilingPatch,
} from "@/lib/server/llc";
import { NAME_ENDINGS, US_STATES, stateByCode } from "@/lib/states";
import { FORMATION_ADDONS } from "@/lib/stripe";
import { startCheckout } from "@/lib/server/checkout";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, ExternalLink, Printer } from "lucide-react";

export const Route = createFileRoute("/llc/$id")({ component: FilingPage });

const STEPS = [
  "State",
  "Name",
  "Purpose",
  "Office",
  "Agent",
  "Members",
  "Management",
  "Packet",
  "Pay",
] as const;

function FilingPage() {
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
      <FilingInner />
    </AppShell>
  );
}

function FilingInner() {
  const { id } = Route.useParams();
  const filingId = Number(id);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["filing", filingId],
    queryFn: () => getFiling({ data: filingId }),
    enabled: Number.isFinite(filingId),
  });
  const [local, setLocal] = useState<Filing | null>(null);
  const [tab, setTab] = useState<
    "articles" | "oa" | "ein" | "file" | "year"
  >("articles");
  const latest = useRef<Filing | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (q.data) {
      setLocal(q.data);
      latest.current = q.data;
    }
  }, [q.data]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("paid")) {
      toast.success("Paid. This packet is a client now.");
      void qc.invalidateQueries({ queryKey: ["filing", filingId] });
      void qc.invalidateQueries({ queryKey: ["filings"] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
    }
  }, [filingId, qc]);

  const save = useMutation({
    mutationFn: (patch: FilingPatch) =>
      saveFiling({ data: { id: filingId, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filings"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const draft = useMutation({
    mutationFn: () => draftOperatingAgreement({ data: filingId }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Addendum drafted");
      setLocal((c) => (c ? { ...c, packetNotes: res.text } : c));
      if (latest.current) {
        latest.current = { ...latest.current, packetNotes: res.text };
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const persist = (patch: FilingPatch) => {
    setLocal((cur) => {
      if (!cur) return cur;
      const next: Filing = {
        ...cur,
        ...patch,
        members: patch.members ?? cur.members,
      };
      latest.current = next;
      return next;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const cur = latest.current;
      if (!cur) return;
      save.mutate({
        stateCode: cur.stateCode,
        entityName: cur.entityName,
        nameEnding: cur.nameEnding,
        purpose: cur.purpose,
        management: cur.management,
        duration: cur.duration,
        effective: cur.effective,
        principalStreet: cur.principalStreet,
        principalCity: cur.principalCity,
        principalState: cur.principalState,
        principalZip: cur.principalZip,
        agentName: cur.agentName,
        agentStreet: cur.agentStreet,
        agentCity: cur.agentCity,
        agentState: cur.agentState,
        agentZip: cur.agentZip,
        organizerName: cur.organizerName,
        organizerEmail: cur.organizerEmail,
        members: cur.members,
        step: cur.step,
        packetNotes: cur.packetNotes,
      });
    }, patch.step !== undefined ? 0 : 400);
  };

  if (q.isPending || !local) {
    return q.data === null ? (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="text-muted">That packet is gone.</p>
      </main>
    ) : (
      <AuthSkeleton />
    );
  }

  const f = local;
  const step = Math.min(9, Math.max(1, f.step));
  const st = stateByCode(f.stateCode);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link
        to="/llc"
        className="no-print inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        Packets
      </Link>
      <div className="no-print mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Formation · {st?.name ?? f.stateCode}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            {legalName(f)}
          </h1>
        </div>
        {step === 8 ? (
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print packet
          </Button>
        ) : null}
      </div>

      <ol className="no-print mt-8 flex gap-1 overflow-x-auto pb-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => persist({ step: n })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.12em]",
                  n === step
                    ? "bg-accent text-accent-fg"
                    : "text-muted hover:text-fg",
                )}
              >
                {n} {label}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="no-print mt-8 rounded-[var(--radius-xl)] border border-border bg-surface p-5 sm:p-8">
        {step === 1 ? (
          <StateStep f={f} persist={persist} />
        ) : null}
        {step === 2 ? <NameStep f={f} persist={persist} /> : null}
        {step === 3 ? <PurposeStep f={f} persist={persist} /> : null}
        {step === 4 ? <OfficeStep f={f} persist={persist} /> : null}
        {step === 5 ? <AgentStep f={f} persist={persist} /> : null}
        {step === 6 ? <MembersStep f={f} persist={persist} /> : null}
        {step === 7 ? <ManagementStep f={f} persist={persist} /> : null}
        {step === 8 ? (
          <PacketStep
            f={f}
            tab={tab}
            setTab={setTab}
            onDraft={() => draft.mutate()}
            drafting={draft.isPending}
          />
        ) : null}
        {step === 9 ? <PayStep f={f} typicalFee={st?.fee} /> : null}
      </div>

      {step < 9 ? (
        <div className="no-print mt-6 flex justify-between">
          <Button
            variant="ghost"
            disabled={step === 1}
            onClick={() => persist({ step: step - 1 })}
          >
            Back
          </Button>
          <Button onClick={() => persist({ step: step + 1 })}>Continue</Button>
        </div>
      ) : (
        <div className="no-print mt-6">
          <Button variant="ghost" onClick={() => persist({ step: 8 })}>
            Back
          </Button>
        </div>
      )}

      {step === 8 ? <PrintBundle f={f} /> : null}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StateStep({
  f,
  persist,
}: {
  f: Filing;
  persist: (p: FilingPatch) => void;
}) {
  const st = stateByCode(f.stateCode);
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl tracking-tight">Where does it live?</h2>
      <p className="text-sm leading-relaxed text-muted">
        Home state is where you file the articles. Delaware is for investors.
        Your own state is for a shop you actually run. Michigan is the default.
      </p>
      <Field label="State">
        <select
          className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 text-sm"
          value={f.stateCode}
          onChange={(e) =>
            persist({
              stateCode: e.target.value,
              principalState: e.target.value,
              agentState: e.target.value,
            })
          }
        >
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {st ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Filing office</dt>
            <dd>{st.agency}</dd>
          </div>
          <div>
            <dt className="text-muted">Typical articles fee</dt>
            <dd>${st.fee}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Note</dt>
            <dd className="leading-relaxed">{st.notes}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function NameStep({
  f,
  persist,
}: {
  f: Filing;
  persist: (p: FilingPatch) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl tracking-tight">Name the company</h2>
      <p className="text-sm leading-relaxed text-muted">
        Must be distinguishable on the state database and must include LLC,
        L.L.C., or Limited Liability Company. Search the portal before you
        file — we cannot reserve the name from here.
      </p>
      <Field label="Company name">
        <Input
          value={f.entityName}
          onChange={(e) => persist({ entityName: e.target.value })}
          placeholder="Pathway Devs"
        />
      </Field>
      <Field label="Ending">
        <select
          className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 text-sm"
          value={f.nameEnding}
          onChange={(e) => persist({ nameEnding: e.target.value })}
        >
          {NAME_ENDINGS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <p className="font-display text-2xl text-fg">{legalName(f)}</p>
    </div>
  );
}

function PurposeStep({
  f,
  persist,
}: {
  f: Filing;
  persist: (p: FilingPatch) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl tracking-tight">Purpose</h2>
      <p className="text-sm text-muted">
        Most states accept a broad purpose. Be specific if you want the
        operating agreement to mean something.
      </p>
      <Field label="Purpose clause">
        <Textarea
          value={f.purpose}
          onChange={(e) => persist({ purpose: e.target.value })}
          placeholder="To provide software, automation, and related services."
        />
      </Field>
      <Field label="Organizer name">
        <Input
          value={f.organizerName}
          onChange={(e) => persist({ organizerName: e.target.value })}
        />
      </Field>
      <Field label="Organizer email">
        <Input
          type="email"
          value={f.organizerEmail}
          onChange={(e) => persist({ organizerEmail: e.target.value })}
        />
      </Field>
    </div>
  );
}

function OfficeStep({
  f,
  persist,
}: {
  f: Filing;
  persist: (p: FilingPatch) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl tracking-tight">Principal office</h2>
      <p className="text-sm text-muted">
        A street address. P.O. boxes fail in most filing offices.
      </p>
      <Field label="Street">
        <Input
          value={f.principalStreet}
          onChange={(e) => persist({ principalStreet: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City">
          <Input
            value={f.principalCity}
            onChange={(e) => persist({ principalCity: e.target.value })}
          />
        </Field>
        <Field label="State">
          <Input
            value={f.principalState}
            onChange={(e) => persist({ principalState: e.target.value })}
          />
        </Field>
        <Field label="ZIP">
          <Input
            value={f.principalZip}
            onChange={(e) => persist({ principalZip: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function AgentStep({
  f,
  persist,
}: {
  f: Filing;
  persist: (p: FilingPatch) => void;
}) {
  const st = stateByCode(f.stateCode);
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl tracking-tight">Registered agent</h2>
      <p className="text-sm leading-relaxed text-muted">
        Someone (or a company) with a physical street address in{" "}
        {st?.name ?? "the state"} who agrees to receive service of process. You
        can be your own agent if you live there.
      </p>
      <Field label="Agent name">
        <Input
          value={f.agentName}
          onChange={(e) => persist({ agentName: e.target.value })}
        />
      </Field>
      <Field label="Street">
        <Input
          value={f.agentStreet}
          onChange={(e) => persist({ agentStreet: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City">
          <Input
            value={f.agentCity}
            onChange={(e) => persist({ agentCity: e.target.value })}
          />
        </Field>
        <Field label="State">
          <Input
            value={f.agentState}
            onChange={(e) => persist({ agentState: e.target.value })}
          />
        </Field>
        <Field label="ZIP">
          <Input
            value={f.agentZip}
            onChange={(e) => persist({ agentZip: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function MembersStep({
  f,
  persist,
}: {
  f: Filing;
  persist: (p: FilingPatch) => void;
}) {
  const members = f.members.length ? f.members : [emptyMember()];
  const setMembers = (next: Member[]) => persist({ members: next });
  const total = members.reduce((s, m) => s + (Number(m.ownership) || 0), 0);

  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl tracking-tight">Members</h2>
      <p className="text-sm text-muted">
        Ownership should add to 100. Single-member LLCs are fine — still write
        an operating agreement.
      </p>
      <div className="space-y-4">
        {members.map((m, i) => (
          <div
            key={i}
            className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-elevated p-4"
          >
            <Input
              placeholder="Name"
              value={m.name}
              onChange={(e) => {
                const next = members.map((x, idx) =>
                  idx === i ? { ...x, name: e.target.value } : x,
                );
                setMembers(next);
              }}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Title (Member / Manager)"
                value={m.title}
                onChange={(e) => {
                  const next = members.map((x, idx) =>
                    idx === i ? { ...x, title: e.target.value } : x,
                  );
                  setMembers(next);
                }}
              />
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="Ownership %"
                value={m.ownership}
                onChange={(e) => {
                  const next = members.map((x, idx) =>
                    idx === i
                      ? { ...x, ownership: Number(e.target.value) }
                      : x,
                  );
                  setMembers(next);
                }}
              />
            </div>
            <Input
              placeholder="Address"
              value={m.address}
              onChange={(e) => {
                const next = members.map((x, idx) =>
                  idx === i ? { ...x, address: e.target.value } : x,
                );
                setMembers(next);
              }}
            />
            {members.length > 1 ? (
              <button
                type="button"
                className="text-left text-xs text-muted hover:text-fg"
                onClick={() => setMembers(members.filter((_, idx) => idx !== i))}
              >
                Remove member
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          type="button"
          onClick={() =>
            setMembers([...members, { ...emptyMember(), ownership: 0 }])
          }
        >
          Add member
        </Button>
        <p className={cn("text-sm tabular-nums", total === 100 ? "text-ok" : "text-muted")}>
          {total}% allocated
        </p>
      </div>
    </div>
  );
}

function ManagementStep({
  f,
  persist,
}: {
  f: Filing;
  persist: (p: FilingPatch) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl tracking-tight">Management</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["member", "Member-managed", "The owners run it. Default for a shop you operate yourself."],
            ["manager", "Manager-managed", "A named manager (who may or may not be a member) binds the company."],
          ] as const
        ).map(([id, label, body]) => (
          <button
            key={id}
            type="button"
            onClick={() => persist({ management: id })}
            className={cn(
              "rounded-[var(--radius-md)] border p-4 text-left",
              f.management === id ? "border-accent bg-elevated" : "border-border",
            )}
          >
            <p className="font-medium">{label}</p>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </button>
        ))}
      </div>
      <Field label="Duration">
        <select
          className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 text-sm"
          value={f.duration}
          onChange={(e) => persist({ duration: e.target.value })}
        >
          <option value="perpetual">Perpetual</option>
          <option value="term">A set term (state in the articles)</option>
        </select>
      </Field>
      <Field label="Effective">
        <select
          className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 text-sm"
          value={f.effective}
          onChange={(e) => persist({ effective: e.target.value })}
        >
          <option value="upon_filing">Upon filing</option>
          <option value="delayed">Delayed (set the date on the state form)</option>
        </select>
      </Field>
    </div>
  );
}

function PacketStep({
  f,
  tab,
  setTab,
  onDraft,
  drafting,
}: {
  f: Filing;
  tab: "articles" | "oa" | "ein" | "file" | "year";
  setTab: (t: "articles" | "oa" | "ein" | "file" | "year") => void;
  onDraft: () => void;
  drafting: boolean;
}) {
  const docs = useMemo(
    () => ({
      articles: articlesText(f),
      oa: operatingAgreementText(f),
      ein: einChecklist(f),
      file: filingInstructions(f),
      year: complianceCalendar(f),
    }),
    [f],
  );
  const labels = {
    articles: "Articles",
    oa: "Operating agreement",
    ein: "EIN",
    file: "How to file",
    year: "Year one",
  } as const;

  return (
    <div>
      <h2 className="font-display text-3xl tracking-tight">The packet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This is a working draft, not a filing and not legal advice. Confirm
        fees and forms on the state portal. Print the whole set when you are
        ready.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.12em]",
              tab === k ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            {labels[k]}
          </button>
        ))}
      </div>
      {tab === "oa" ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onDraft} disabled={drafting}>
            {drafting ? "Drafting…" : "Draft an addendum"}
          </Button>
        </div>
      ) : null}
      <pre className="mt-5 max-h-[28rem] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-fg">
        {docs[tab]}
      </pre>
    </div>
  );
}

function PrintBundle({ f }: { f: Filing }) {
  const blocks = [
    articlesText(f),
    operatingAgreementText(f),
    einChecklist(f),
    filingInstructions(f),
    complianceCalendar(f),
  ];
  return (
    <div className="print-only hidden">
      {blocks.map((b, i) => (
        <section
          key={i}
          className="mb-10 whitespace-pre-wrap break-inside-avoid text-sm leading-relaxed text-black"
        >
          {b}
        </section>
      ))}
    </div>
  );
}

function PayStep({
  f,
  typicalFee,
}: {
  f: Filing;
  typicalFee?: number;
}) {
  const paid = new Set(
    f.payments
      .filter((p) => p.status === "paid" || p.status === "active")
      .map((p) => p.addonKey),
  );
  const pay = useMutation({
    mutationFn: (addon: (typeof FORMATION_ADDONS)[number]["key"]) =>
      startCheckout({
        data: {
          filingId: f.id,
          addon,
          origin: window.location.origin,
        },
      }),
    onSuccess: (res) => {
      window.location.assign(res.url);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-tight">Pay what you use</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The packet is free. When they pay, this packet is marked paid and they
          show up on Clients — that is who you serve. Stripe takes the card.
          John Gault & Sons on the statement.
        </p>
        {typicalFee ? (
          <p className="mt-3 text-sm text-muted">
            Typical {f.stateCode} articles fee is about ${typicalFee}. Confirm
            the live amount on the state portal before you pay.
          </p>
        ) : null}
      </div>
      <ul className="space-y-3">
        {FORMATION_ADDONS.map((addon) => {
          const isPaid = paid.has(addon.key);
          return (
            <li
              key={addon.key}
              className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-elevated p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {addon.title}
                  {addon.required ? (
                    <span className="ml-2 text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                      Pass-through
                    </span>
                  ) : null}
                  {isPaid ? (
                    <span className="ml-2 text-[0.65rem] uppercase tracking-[0.14em] text-ok">
                      Paid
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{addon.blurb}</p>
                <p className="mt-1 text-sm tabular-nums text-fg">{addon.price}</p>
              </div>
              {isPaid ? (
                <Button variant="secondary" disabled>
                  <Check className="size-4" />
                  Paid
                </Button>
              ) : (
                <Button
                  variant={addon.required ? "primary" : "secondary"}
                  disabled={pay.isPending}
                  onClick={() => pay.mutate(addon.key)}
                >
                  Pay
                  <ExternalLink className="size-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}


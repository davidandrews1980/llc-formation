import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { parseMembers, type Member } from "@/lib/members";
import { US_STATES } from "@/lib/states";

export type Filing = {
  id: number;
  stateCode: string;
  entityName: string;
  nameEnding: string;
  purpose: string;
  management: string;
  duration: string;
  effective: string;
  principalStreet: string;
  principalCity: string;
  principalState: string;
  principalZip: string;
  agentName: string;
  agentStreet: string;
  agentCity: string;
  agentState: string;
  agentZip: string;
  organizerName: string;
  organizerEmail: string;
  members: Member[];
  step: number;
  packetNotes: string;
  createdAt: string;
  updatedAt: string;
};

type FilingRow = {
  id: number;
  state_code: string;
  entity_name: string;
  name_ending: string;
  purpose: string;
  management: string;
  duration: string;
  effective: string;
  principal_street: string;
  principal_city: string;
  principal_state: string;
  principal_zip: string;
  agent_name: string;
  agent_street: string;
  agent_city: string;
  agent_state: string;
  agent_zip: string;
  organizer_name: string;
  organizer_email: string;
  members_json: string;
  step: number;
  packet_notes: string;
  created_at: string;
  updated_at: string;
};

function mapFiling(r: FilingRow): Filing {
  return {
    id: r.id,
    stateCode: r.state_code,
    entityName: r.entity_name,
    nameEnding: r.name_ending,
    purpose: r.purpose,
    management: r.management,
    duration: r.duration,
    effective: r.effective,
    principalStreet: r.principal_street,
    principalCity: r.principal_city,
    principalState: r.principal_state,
    principalZip: r.principal_zip,
    agentName: r.agent_name,
    agentStreet: r.agent_street,
    agentCity: r.agent_city,
    agentState: r.agent_state,
    agentZip: r.agent_zip,
    organizerName: r.organizer_name,
    organizerEmail: r.organizer_email,
    members: parseMembers(r.members_json),
    step: r.step,
    packetNotes: r.packet_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type FilingPatch = Partial<
  Omit<Filing, "id" | "createdAt" | "updatedAt" | "members">
> & { members?: Member[] };

export const listFilings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<FilingRow>`
      select * from filings where user_id = ${context.userId} order by updated_at desc
    `;
    return rows.map(mapFiling);
  });

export const createFiling = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into filings (user_id, state_code, principal_state, agent_state)
      values (${context.userId}, ${"MI"}, ${"MI"}, ${"MI"})
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Could not start a filing");
    return { id };
  });

export const getFiling = createServerFn({ method: "GET" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql<FilingRow>`
      select * from filings where id = ${id} and user_id = ${context.userId}
    `;
    return rows[0] ? mapFiling(rows[0]) : null;
  });

export const saveFiling = createServerFn({ method: "POST" })
  .validator((input: { id: number; patch: FilingPatch }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<FilingRow>`
      select * from filings where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!existing[0]) throw new Error("Filing not found");
    const cur = mapFiling(existing[0]);
    const next: Filing = {
      ...cur,
      ...data.patch,
      members: data.patch.members ?? cur.members,
    };
    if (next.stateCode && !US_STATES.some((s) => s.code === next.stateCode)) {
      throw new Error("Unknown state");
    }
    const membersJson = JSON.stringify(next.members);
    await sql`
      update filings set
        state_code = ${next.stateCode},
        entity_name = ${next.entityName},
        name_ending = ${next.nameEnding},
        purpose = ${next.purpose},
        management = ${next.management},
        duration = ${next.duration},
        effective = ${next.effective},
        principal_street = ${next.principalStreet},
        principal_city = ${next.principalCity},
        principal_state = ${next.principalState},
        principal_zip = ${next.principalZip},
        agent_name = ${next.agentName},
        agent_street = ${next.agentStreet},
        agent_city = ${next.agentCity},
        agent_state = ${next.agentState},
        agent_zip = ${next.agentZip},
        organizer_name = ${next.organizerName},
        organizer_email = ${next.organizerEmail},
        members_json = ${membersJson},
        step = ${next.step},
        packet_notes = ${next.packetNotes},
        updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const deleteFiling = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from filings where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const draftOperatingAgreement = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql<FilingRow>`
      select * from filings where id = ${id} and user_id = ${context.userId}
    `;
    const filing = rows[0] ? mapFiling(rows[0]) : null;
    if (!filing) throw new Error("Filing not found");

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Drafting is not available in this environment",
      };
    }

    const members = filing.members
      .filter((m) => m.name.trim())
      .map((m) => `${m.name} (${m.title}, ${m.ownership}%)`)
      .join("; ");

    const prompt = `Draft a concise, plain-English operating agreement addendum (not a full 40-page OA) for:

Legal name: ${filing.entityName} ${filing.nameEnding}
State: ${filing.stateCode}
Management: ${filing.management === "manager" ? "manager-managed" : "member-managed"}
Purpose: ${filing.purpose || "any lawful business"}
Members: ${members || "to be named"}
Duration: ${filing.duration}

Write 6–10 short numbered sections covering: formation, purpose, members and units, management, capital, distributions, transfers, dissolution, books, governing law (${filing.stateCode}). No legalese theater. No promises this is a substitute for counsel. Do not invent EIN, bank, or registered-agent facts that were not provided.`;

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      return { ok: false as const, error: `Drafting failed (${res.status})` };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false as const, error: "Empty draft" };
    await sql`
      update filings set packet_notes = ${text}, updated_at = now()
      where id = ${id} and user_id = ${context.userId}
    `;
    return { ok: true as const, text };
  });

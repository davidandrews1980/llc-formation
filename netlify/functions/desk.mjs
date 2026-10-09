// Pathway Formation desk. One Netlify function.
// Orders and the filing queue live here, not in the browser.

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

// Queue (work) statuses an operator can set.
const STATUSES = new Set(["received", "in_progress", "filed", "cancelled"]);
// Order (money) statuses. Only an operator (or, later, a verified Stripe webhook) can set "paid".
const ORDER_STATUSES = new Set(["due", "awaiting_payment", "paid"]);
const MAX_ORDERS = 400;

// Browsers may only call this function from these origins (plus the site's own host, see originAllowed).
const ALLOWED_ORIGINS = new Set([
  "https://pathwaydevs.software",
  "https://www.pathwaydevs.software",
]);

function corsHeaders(origin) {
  const h = {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}

function json(statusCode, data, origin) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin),
    },
    body: JSON.stringify(data),
  };
}

function readBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function header(event, name) {
  const headers = event.headers || {};
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return "";
}

function blobCtx(event) {
  if (event.blobs) {
    try {
      const data = JSON.parse(Buffer.from(event.blobs, "base64").toString("utf8"));
      const siteID = header(event, "x-nf-site-id");
      if (data && data.token && data.url && siteID) {
        return { token: data.token, edgeURL: data.url, siteID };
      }
    } catch {
      /* fall through */
    }
  }
  const encoded = globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT;
  if (typeof encoded === "string" && encoded) {
    try {
      const data = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      if (data.token && data.siteID && (data.edgeURL || data.url)) {
        return {
          token: data.token,
          siteID: data.siteID,
          edgeURL: data.edgeURL || data.url,
        };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function blobGet(ctx, key) {
  const url = new URL(`/${ctx.siteID}/site:pathway-formation/${key}`, ctx.edgeURL);
  const res = await fetch(url, { headers: { authorization: `Bearer ${ctx.token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`read ${res.status} ${text.slice(0, 180)}`);
  }
  return res.json();
}

async function blobPut(ctx, key, value) {
  const path = `/${ctx.siteID}/site:pathway-formation/${key}`;
  const edge = new URL(path, ctx.edgeURL);
  const body = JSON.stringify(value);
  const put = await fetch(edge, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${ctx.token}`,
      "content-type": "application/json",
      "cache-control": "max-age=0, stale-while-revalidate=60",
    },
    body,
  });
  if (put.ok) return;
  const detail = await put.text();
  const sign = await fetch(new URL(`/api/v1/blobs${path}`, "https://api.netlify.com"), {
    method: "PUT",
    headers: {
      authorization: `Bearer ${ctx.token}`,
      accept: "application/json;type=signed-url",
    },
  });
  if (!sign.ok) {
    throw new Error(`write ${put.status} ${detail.slice(0, 120)}`);
  }
  const signed = await sign.json();
  const again = await fetch(signed.url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!again.ok) throw new Error(`signed write ${again.status}`);
}

// ---- Operator (admin) check -------------------------------------------------
// Admin access is decided ONLY by OPERATOR_KEY. Any "role" the browser sends is ignored.
// Fails CLOSED: if OPERATOR_KEY is not set on the site, every admin action is refused.
export function adminEnabled() {
  return typeof process.env.OPERATOR_KEY === "string" && process.env.OPERATOR_KEY.length > 0;
}

export function operatorOk(key) {
  if (!adminEnabled()) return false;
  const a = createHash("sha256").update(String(process.env.OPERATOR_KEY)).digest();
  const b = createHash("sha256").update(String(key || "")).digest();
  return timingSafeEqual(a, b);
}

function asList(v) {
  return Array.isArray(v) ? v : [];
}

function trimStr(v, n) {
  return String(v ?? "").slice(0, n);
}

// The client id is a random UUID the browser keeps. It works as a bearer capability for that
// customer's own orders, so refuse short / guessable ids.
function validClientId(id) {
  return /^[A-Za-z0-9-]{20,80}$/.test(id);
}

function validEmail(v) {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(v);
}

function newId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function cleanOrder(input, clientId, id) {
  let draft = input && typeof input.draft === "object" && input.draft ? input.draft : {};
  try {
    if (JSON.stringify(draft).length > 80_000) draft = { truncated: true };
  } catch {
    draft = {};
  }
  return {
    id, // always server-generated; a caller cannot overwrite someone else's order by reusing an id
    clientId: trimStr(clientId, 80),
    llcName: trimStr(input.llcName, 160),
    email: trimStr(input.email, 254).trim(),
    stateCode: trimStr(input.stateCode, 8),
    stateName: trimStr(input.stateName, 40),
    document: trimStr(input.document, 80),
    agency: trimStr(input.agency, 120),
    // NOTE: "due" is the browser's quote. It is display-only. Any real charge must recompute
    // the amount server-side (see the Stripe hook below) and never trust this number.
    due: Math.max(0, Math.round(Number(input.due) || 0)),
    status: "due", // never trust a status from the browser
    created: new Date().toISOString(),
    organizer: trimStr(input.organizer, 160),
    draft,
  };
}

function cleanItem(input, orderId, clientId) {
  const kind = trimStr(input.kind, 40) || "filing";
  return {
    id: kind === "filing" ? orderId : `${orderId}-${kind.replace(/[^a-z0-9_]/gi, "").slice(0, 20)}`,
    orderId,
    llcName: trimStr(input.llcName, 160),
    kind,
    stateName: trimStr(input.stateName, 40),
    status: "received",
    clientId: trimStr(clientId, 80),
  };
}

// ---- Stripe hook (NOT ACTIVE) ------------------------------------------------
// TODO(stripe): Formation has no Stripe Checkout wired in this static desk yet.
// When ready:
//   1. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the Netlify site env (never in git).
//   2. In createCheckoutForOrder(), recompute the amount server-side from the state fee table
//      and selected add-ons (do not trust order.due), create a Checkout Session with
//      client_reference_id = order.id, and return session.url to the browser.
//   3. Add a webhook function that verifies the Stripe-Signature header with
//      STRIPE_WEBHOOK_SECRET and, on checkout.session.completed, sets that order to "paid".
//   Price ids already exist in src/lib/stripe.ts (server app) and may be reusable.
// Until then this returns null and the desk only marks the order "awaiting_payment".
// eslint-disable-next-line no-unused-vars
async function createCheckoutForOrder(_order) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return null; // intentionally not implemented yet
}

export function reduce(state, body) {
  const orders = asList(state.orders).map((o) => ({ ...o }));
  const queue = asList(state.queue).map((q) => ({ ...q }));
  const action = trimStr(body.action, 30);
  const clientId = trimStr(body.clientId, 80);
  const enabled = adminEnabled();
  const same = { orders, queue };
  const out = (status, response, next = same) => ({ state: next, status, response: { adminEnabled: enabled, ...response } });

  const requireOperator = () => {
    if (!enabled) return out(503, { ok: false, error: "admin is disabled until OPERATOR_KEY is set on the site" });
    if (!operatorOk(body.key)) return out(403, { ok: false, error: "operator key refused" });
    return null;
  };
  const mine = (o = orders, q = queue) => ({
    ok: true,
    operator: false,
    orders: o.filter((x) => x.clientId === clientId),
    queue: q.filter((x) => x.clientId === clientId),
  });
  const all = () => ({ ok: true, operator: true, orders, queue });

  // ---- customer actions (scoped to the caller's own clientId) ----
  if (action === "bootstrap") {
    if (!validClientId(clientId)) return out(200, { ok: true, operator: false, orders: [], queue: [] });
    return out(200, mine());
  }

  if (action === "place") {
    if (!validClientId(clientId)) return out(400, { ok: false, error: "missing client" });
    const id = newId();
    const order = cleanOrder(body.order || {}, clientId, id);
    if (order.llcName.trim().length < 3) return out(400, { ok: false, error: "name the company" });
    if (!validEmail(order.email)) return out(400, { ok: false, error: "add a contact email" });
    const items = asList(body.items)
      .slice(0, 6)
      .map((item) => cleanItem({ ...item, llcName: order.llcName, stateName: order.stateName }, id, clientId));
    if (!items.some((i) => i.kind === "filing")) items.unshift(cleanItem({ kind: "filing", llcName: order.llcName, stateName: order.stateName }, id, clientId));
    const ids = new Set(items.map((i) => i.id));
    const nextOrders = [order, ...orders].slice(0, MAX_ORDERS);
    const nextQueue = [...items, ...queue.filter((q) => !ids.has(q.id))].slice(0, MAX_ORDERS * 3);
    return out(200, { ...mine(nextOrders, nextQueue), orderId: id }, { orders: nextOrders, queue: nextQueue });
  }

  if (action === "request_payment") {
    // Customer pressed Pay. The page can NOT mark itself paid; it only flags the order.
    const id = trimStr(body.orderId, 40);
    const hit = orders.find((o) => o.id === id && o.clientId === clientId && validClientId(clientId));
    if (!hit) return out(404, { ok: false, error: "order not on this desk" });
    if (hit.status !== "paid") hit.status = "awaiting_payment";
    return out(200, { ...mine(), message: "Payment coming soon: we'll email you a secure payment link." });
  }

  // ---- operator actions (OPERATOR_KEY required; fail closed) ----
  if (action === "admin_bootstrap") {
    return requireOperator() || out(200, all());
  }

  if (action === "pay") {
    // Operator marks an order paid after confirming payment (manual until the Stripe webhook exists).
    const denied = requireOperator();
    if (denied) return denied;
    const id = trimStr(body.orderId, 40);
    const status = body.status ? trimStr(body.status, 20) : "paid";
    if (!ORDER_STATUSES.has(status)) return out(400, { ok: false, error: "bad status" });
    const hit = orders.find((o) => o.id === id);
    if (!hit) return out(404, { ok: false, error: "order not found" });
    hit.status = status;
    return out(200, all());
  }

  if (action === "status") {
    const denied = requireOperator();
    if (denied) return denied;
    const id = trimStr(body.queueId, 48);
    const status = trimStr(body.status, 20);
    if (!STATUSES.has(status)) return out(400, { ok: false, error: "bad status" });
    const hit = queue.find((q) => q.id === id);
    if (!hit) return out(404, { ok: false, error: "not in the queue" });
    hit.status = status;
    return out(200, all());
  }

  return out(400, { ok: false, error: "unknown action" });
}

async function loadState(ctx) {
  const [orders, queue] = await Promise.all([blobGet(ctx, "orders"), blobGet(ctx, "queue")]);
  return { orders: asList(orders), queue: asList(queue) };
}

function originAllowed(event) {
  const origin = header(event, "origin");
  if (!origin) return true; // non-browser caller; data access is still gated by clientId / OPERATOR_KEY
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Same-origin calls (e.g. a deploy preview or local `netlify dev`) are allowed; nothing else.
  try {
    return new URL(origin).host === header(event, "host");
  } catch {
    return false;
  }
}

export async function handler(event) {
  const origin = header(event, "origin");
  if (!originAllowed(event)) return json(403, { ok: false, error: "origin not allowed" }, "");
  if (event.httpMethod === "OPTIONS") return json(204, {}, origin);
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" }, origin);
  const ctx = blobCtx(event);
  if (!ctx) return json(503, { ok: false, error: "desk store is not attached to this function" }, origin);
  try {
    const before = await loadState(ctx);
    const result = reduce(before, readBody(event));
    const changed = JSON.stringify(result.state) !== JSON.stringify(before);
    if (result.status < 300 && changed) {
      await Promise.all([
        blobPut(ctx, "orders", result.state.orders),
        blobPut(ctx, "queue", result.state.queue),
      ]);
    }
    return json(result.status, result.response, origin);
  } catch (err) {
    console.error("desk failed", err);
    return json(500, { ok: false, error: "desk failed" }, origin);
  }
}

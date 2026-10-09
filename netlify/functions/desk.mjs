// Pathway Formation desk. One Netlify function.
// Orders and the filing queue live here, not in the browser.

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { blobCtx, blobGet, blobPut } from "../lib/blobs.mjs";
import { serverQuote } from "../lib/pricing.mjs";
import { createCheckoutSession, stripeConfigured } from "../lib/stripe.mjs";

// Queue (work) statuses an operator can set.
const STATUSES = new Set(["received", "in_progress", "filed", "cancelled"]);
// Order (money) statuses. Only an operator (OPERATOR_KEY) or the signed Stripe webhook can set "paid".
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
    // "due" is computed HERE from the order's choices (netlify/lib/pricing.mjs). Any amount the
    // browser sends (input.due) is ignored. Checkout recomputes it again before charging.
    due: 0,
    quote: null,
    status: "due", // never trust a status from the browser
    created: new Date().toISOString(),
    organizer: trimStr(input.organizer, 160),
    draft,
  };
}

function priceOrder(order) {
  const q = serverQuote({ ...order.draft, stateCode: order.stateCode });
  order.quote = q;
  order.due = q ? q.total : 0;
  if (q) order.stateName = q.stateName;
  return order;
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
    const order = priceOrder(cleanOrder(body.order || {}, clientId, id));
    if (order.llcName.trim().length < 3) return out(400, { ok: false, error: "name the company" });
    if (!validEmail(order.email)) return out(400, { ok: false, error: "add a contact email" });
    if (!order.quote) return out(400, { ok: false, error: "pick a supported state" });
    const items = asList(body.items)
      .slice(0, 6)
      .map((item) => cleanItem({ ...item, llcName: order.llcName, stateName: order.stateName }, id, clientId));
    if (!items.some((i) => i.kind === "filing")) items.unshift(cleanItem({ kind: "filing", llcName: order.llcName, stateName: order.stateName }, id, clientId));
    const ids = new Set(items.map((i) => i.id));
    const nextOrders = [order, ...orders].slice(0, MAX_ORDERS);
    const nextQueue = [...items, ...queue.filter((q) => !ids.has(q.id))].slice(0, MAX_ORDERS * 3);
    return out(200, { ...mine(nextOrders, nextQueue), orderId: id }, { orders: nextOrders, queue: nextQueue });
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

export function paidKey(orderId) {
  return `paid-${String(orderId).replace(/[^A-Za-z0-9]/g, "")}`;
}

async function loadState(ctx) {
  const [orders, queue] = await Promise.all([blobGet(ctx, "orders"), blobGet(ctx, "queue")]);
  const list = asList(orders);
  // The Stripe webhook also writes a per-order "paid-<id>" marker. Overlay it so a desk write that
  // raced the webhook can never flip a paid order back. Only orders that went to Checkout are checked.
  const pending = list.filter((o) => o.status !== "paid" && o.checkout && o.checkout.sessionId);
  const marks = await Promise.all(pending.map((o) => blobGet(ctx, paidKey(o.id))));
  pending.forEach((o, i) => {
    const m = marks[i];
    if (m && m.orderId === o.id) {
      o.status = "paid";
      o.paidAt = m.paidAt;
      o.payment = { via: "stripe", sessionId: m.sessionId, amountTotal: m.amountTotal };
    }
  });
  return { orders: list, queue: asList(queue) };
}

// Where Stripe sends the customer back. Only our own origins are accepted.
function returnBase(event) {
  const origin = header(event, "origin");
  if (origin && (ALLOWED_ORIGINS.has(origin) || sameHost(origin, event))) return origin.replace(/\/$/, "");
  const site = process.env.URL;
  if (typeof site === "string" && /^https:\/\//.test(site)) return site.replace(/\/$/, "");
  return "https://pathwaydevs.software";
}

function sameHost(origin, event) {
  try {
    return new URL(origin).host === header(event, "host");
  } catch {
    return false;
  }
}

// Customer pressed Pay: create a Stripe Checkout Session for THEIR order with a server-computed
// amount and return its URL. This never marks anything paid; only the signed webhook does.
async function createCheckout(event, ctx, body) {
  const clientId = trimStr(body.clientId, 80);
  const orderId = trimStr(body.orderId, 40);
  if (!stripeConfigured()) {
    return { status: 503, response: { ok: false, error: "payments are not configured on the server yet (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET). Nothing was charged." } };
  }
  if (!validClientId(clientId)) return { status: 400, response: { ok: false, error: "missing client" } };
  const state = await loadState(ctx);
  const order = state.orders.find((o) => o.id === orderId && o.clientId === clientId);
  if (!order) return { status: 404, response: { ok: false, error: "order not on this desk" } };
  if (order.status === "paid") return { status: 409, response: { ok: false, error: "already paid" } };
  const quote = serverQuote({ ...order.draft, stateCode: order.stateCode });
  if (!quote || quote.total < 50) return { status: 400, response: { ok: false, error: "this order has nothing to charge" } };
  let session;
  try {
    session = await createCheckoutSession({ order, quote, baseUrl: returnBase(event) });
  } catch (err) {
    console.error("checkout failed", err && err.message);
    return { status: 502, response: { ok: false, error: "could not start Stripe Checkout. Nothing was charged; please try again." } };
  }
  order.due = quote.total;
  order.quote = quote;
  order.status = "awaiting_payment";
  order.checkout = { sessionId: session.id, amountTotal: quote.total, currency: quote.currency, created: new Date().toISOString() };
  await blobPut(ctx, "orders", state.orders);
  return { status: 200, response: { ok: true, url: session.url, orderId: order.id, amount: quote.total } };
}

function originAllowed(event) {
  const origin = header(event, "origin");
  if (!origin) return true; // non-browser caller; data access is still gated by clientId / OPERATOR_KEY
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Same-origin calls (e.g. a deploy preview or local `netlify dev`) are allowed; nothing else.
  return sameHost(origin, event);
}

export async function handler(event) {
  const origin = header(event, "origin");
  if (!originAllowed(event)) return json(403, { ok: false, error: "origin not allowed" }, "");
  if (event.httpMethod === "OPTIONS") return json(204, {}, origin);
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" }, origin);
  const ctx = blobCtx(event);
  if (!ctx) return json(503, { ok: false, error: "desk store is not attached to this function" }, origin);
  try {
    const body = readBody(event);
    if (body.action === "create_checkout") {
      const r = await createCheckout(event, ctx, body);
      return json(r.status, { adminEnabled: adminEnabled(), ...r.response }, origin);
    }
    const before = await loadState(ctx);
    const result = reduce(before, body);
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

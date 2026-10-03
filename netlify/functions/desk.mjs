// Pathway Formation desk. One Netlify function.
// Orders and the filing queue live here, not in the browser.

const STATUSES = new Set(["received", "in_progress", "filed", "cancelled"]);
const MAX_ORDERS = 400;

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
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

function operatorOpen() {
  return !process.env.OPERATOR_KEY;
}

function operatorOk(key) {
  const expected = process.env.OPERATOR_KEY || "";
  if (!expected) return true;
  const got = String(key || "");
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  }
  return diff === 0;
}

function asList(v) {
  return Array.isArray(v) ? v : [];
}

function trimStr(v, n) {
  return String(v ?? "").slice(0, n);
}

function cleanOrder(input, clientId) {
  let draft = input && typeof input.draft === "object" && input.draft ? input.draft : {};
  try {
    if (JSON.stringify(draft).length > 80_000) draft = { truncated: true };
  } catch {
    draft = {};
  }
  return {
    id: trimStr(input.id, 40) || Math.random().toString(36).slice(2, 10),
    clientId: trimStr(clientId, 80),
    llcName: trimStr(input.llcName, 160),
    stateCode: trimStr(input.stateCode, 8),
    stateName: trimStr(input.stateName, 40),
    document: trimStr(input.document, 80),
    agency: trimStr(input.agency, 120),
    due: Number(input.due) || 0,
    status: input.status === "paid" ? "paid" : "due",
    created: trimStr(input.created, 40) || new Date().toISOString(),
    organizer: trimStr(input.organizer, 160),
    draft,
  };
}

function cleanItem(input) {
  const status = STATUSES.has(input.status) ? input.status : "received";
  return {
    id: trimStr(input.id, 48),
    llcName: trimStr(input.llcName, 160),
    kind: trimStr(input.kind, 40) || "filing",
    stateName: trimStr(input.stateName, 40),
    status,
    clientId: trimStr(input.clientId, 80),
  };
}

export function reduce(state, body) {
  const orders = asList(state.orders).slice();
  const queue = asList(state.queue).slice();
  const action = trimStr(body.action, 20);
  const clientId = trimStr(body.clientId, 80);
  const locked = !operatorOpen();
  const isOp = operatorOk(body.key);

  const mine = () => ({
    ok: true,
    locked,
    operator: false,
    orders: orders.filter((o) => o.clientId === clientId),
    queue: queue.filter((q) => q.clientId === clientId),
  });

  if (action === "bootstrap") {
    if (body.role === "admin") {
      if (!isOp) return { state: { orders, queue }, status: 403, response: { ok: false, error: "operator key refused" } };
      return {
        state: { orders, queue },
        status: 200,
        response: { ok: true, locked, operator: true, orders, queue },
      };
    }
    return { state: { orders, queue }, status: 200, response: mine() };
  }

  if (action === "place") {
    if (!clientId) {
      return { state: { orders, queue }, status: 400, response: { ok: false, error: "missing client" } };
    }
    const order = cleanOrder(body.order || {}, clientId);
    if (order.llcName.trim().length < 3) {
      return { state: { orders, queue }, status: 400, response: { ok: false, error: "name the company" } };
    }
    const items = asList(body.items).map((item) => cleanItem({ ...item, clientId })).filter((item) => item.id);
    const nextOrders = [order, ...orders.filter((o) => o.id !== order.id)].slice(0, MAX_ORDERS);
    const ids = new Set(items.map((item) => item.id));
    const nextQueue = [...items, ...queue.filter((q) => !ids.has(q.id))].slice(0, MAX_ORDERS * 3);
    return {
      state: { orders: nextOrders, queue: nextQueue },
      status: 200,
      response: {
        ok: true,
        locked,
        operator: false,
        orderId: order.id,
        orders: nextOrders.filter((o) => o.clientId === clientId),
        queue: nextQueue.filter((q) => q.clientId === clientId),
      },
    };
  }

  if (action === "pay") {
    const id = trimStr(body.orderId, 40);
    const hit = orders.find((o) => o.id === id && o.clientId === clientId);
    if (!hit) return { state: { orders, queue }, status: 404, response: { ok: false, error: "order not on this desk" } };
    hit.status = "paid";
    return { state: { orders, queue }, status: 200, response: mine() };
  }

  if (action === "status") {
    if (!isOp) return { state: { orders, queue }, status: 403, response: { ok: false, error: "operator key refused" } };
    const id = trimStr(body.queueId, 48);
    const status = trimStr(body.status, 20);
    if (!STATUSES.has(status)) {
      return { state: { orders, queue }, status: 400, response: { ok: false, error: "bad status" } };
    }
    const hit = queue.find((q) => q.id === id);
    if (!hit) return { state: { orders, queue }, status: 404, response: { ok: false, error: "not in the queue" } };
    hit.status = status;
    return {
      state: { orders, queue },
      status: 200,
      response: { ok: true, locked, operator: true, orders, queue },
    };
  }

  return { state: { orders, queue }, status: 400, response: { ok: false, error: "unknown action" } };
}

async function loadState(ctx) {
  const [orders, queue] = await Promise.all([blobGet(ctx, "orders"), blobGet(ctx, "queue")]);
  return { orders: asList(orders), queue: asList(queue) };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });
  const ctx = blobCtx(event);
  if (!ctx) return json(503, { ok: false, error: "desk store is not attached to this function" });
  try {
    const before = await loadState(ctx);
    const result = reduce(before, readBody(event));
    const changed = result.state !== before && JSON.stringify(result.state) !== JSON.stringify(before);
    if (result.status < 300 && changed) {
      await Promise.all([
        blobPut(ctx, "orders", result.state.orders),
        blobPut(ctx, "queue", result.state.queue),
      ]);
    }
    return json(result.status, result.response);
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "desk failed" });
  }
}

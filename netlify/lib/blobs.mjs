// Netlify Blobs access shared by the desk and stripe-webhook functions (store "pathway-formation").

function header(event, name) {
  const headers = event.headers || {};
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return "";
}

export function blobCtx(event) {
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

export async function blobGet(ctx, key) {
  const url = new URL(`/${ctx.siteID}/site:pathway-formation/${key}`, ctx.edgeURL);
  const res = await fetch(url, { headers: { authorization: `Bearer ${ctx.token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`read ${res.status} ${text.slice(0, 180)}`);
  }
  return res.json();
}

export async function blobPut(ctx, key, value) {
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


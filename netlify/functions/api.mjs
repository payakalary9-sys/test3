import { createClient } from "@libsql/client";
import { getStore } from "@netlify/blobs";
import { createApp } from "../lib/app.mjs";

let handle;
function build() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL دانەنراوە");
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  const blobs = getStore("uploads");
  const store = {
    set: (id, buf) => blobs.set(id, new Uint8Array(buf)),
    get: async (id) => { const ab = await blobs.get(id, { type: "arrayBuffer" }); return ab ? Buffer.from(ab) : null; },
    del: (id) => blobs.delete(id),
  };
  return createApp({ db, store, env: process.env });
}

export default async (req) => {
  try { handle ||= build(); } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  return handle(req);
};

export const config = { path: ["/api/*", "/uploads/*"] };

// گواستنەوەی data.json ی کۆن بۆ Turso:  node scripts/import-json.mjs ./data.json
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { SCHEMA } from "../netlify/lib/app.mjs";

const file = process.argv[2] || "data.json";
const d = JSON.parse(fs.readFileSync(file, "utf8"));
const users = Array.isArray(d) ? [] : d.users || [], posts = Array.isArray(d) ? d : d.posts || [];
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
for (const s of SCHEMA) await db.execute(s);
const ids = new Set(users.map((u) => u.id));
const stmts = [
  ...users.map((u) => ({ sql: "INSERT OR IGNORE INTO users (id,name,login,role,banned,ts,salt,hash) VALUES (?,?,?,?,?,?,?,?)",
    args: [u.id, u.name, u.login ?? null, u.role === "admin" ? "admin" : "user", u.banned ? 1 : 0, u.ts || Date.now(), u.salt ?? null, u.hash ?? null] })),
  ...posts.map((p) => ({ sql: "INSERT OR IGNORE INTO posts (id,uid,type,title,place,city,phone,description,cat,img,date,ts,done) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    args: [p.id, ids.has(p.uid) ? p.uid : null, p.type === "found" ? "found" : "lost", p.title || "", p.place || "", p.city ?? null, p.phone || "",
      p.desc ?? null, p.cat ?? null, "", p.date ?? null, p.ts || Date.now(), p.done ? 1 : 0] })),
];
await db.batch(stmts, "write");
console.log(`✅ ${users.length} بەکارهێنەر و ${posts.length} پۆست گوازرایەوە (وێنەکان ناگوازرێنەوە)`);

// لۆجیکی سۆراغ بۆ Netlify Functions
// createApp({ db, store, env }) -> async (Request) => Response
//   db    : کلایێنتی libSQL/Turso  ( .execute({sql,args}) )
//   store : { set(id, Buffer), get(id) -> Buffer|null, del(id) }  (وێنەکان)
import crypto from "node:crypto";

const DAY7 = 7 * 24 * 3600 * 1000;
const PHONE = /^[0-9+]{7,20}$/;
const SEC = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" };

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, login TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    banned INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, salt TEXT, hash TEXT)`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, uid TEXT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('lost','found')),
    title TEXT NOT NULL, place TEXT NOT NULL, city TEXT, phone TEXT NOT NULL,
    description TEXT, cat TEXT, img TEXT NOT NULL DEFAULT '', date TEXT,
    ts INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_uid ON posts(uid)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_ts ON posts(ts)`,
  `CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_hits_k ON hits(k)`,
];

export function createApp({ db, store, env = {} }) {
  const adminUser = env.ADMIN_USER || "admin";
  const adminPass = env.ADMIN_PASS || "";
  const secret = env.SESSION_SECRET || "";

  // ---------- داتابەیس ----------
  async function all(sql, ...args) {
    const r = await db.execute({ sql, args });
    return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  }
  const get = async (sql, ...args) => (await all(sql, ...args))[0];
  const run = (sql, ...args) => db.execute({ sql, args });

  // ---------- یاریدەدەر ----------
  const rid = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
  const newPw = (pw) => { const salt = crypto.randomBytes(16).toString("hex"); return [salt, hashPw(pw, salt)]; };
  function checkPw(u, pw) {
    if (!u.salt || !u.hash) return false;
    const a = Buffer.from(hashPw(pw, u.salt), "hex"), b = Buffer.from(u.hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const clean = (s, n) => String(s == null ? "" : s).replace(/[<>]/g, "").trim().slice(0, n);
  const pubPost = (p, me) => ({ id: p.id, type: p.type, title: p.title, place: p.place, city: p.city, phone: p.phone,
    desc: p.description, cat: p.cat, img: p.img || "", date: p.date, ts: p.ts, done: !!p.done,
    can: !!me && (me.role === "admin" || p.uid === me.id) });
  const pubUser = (u) => (u ? { id: u.id, name: u.name, role: u.role, login: u.login } : null);

  function send(code, body, type, extra) {
    const headers = Object.assign({ "Content-Type": type || "application/json; charset=utf-8" }, SEC, extra || {});
    const payload = typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body);
    return new Response(payload, { status: code, headers });
  }
  async function readBody(req, max) {
    const t = await req.text();
    if (t.length > (max || 10000)) throw new Error("big");
    return JSON.parse(t || "{}");
  }

  // ---------- سێشن (واژۆکراو، بێ هەڵگرتن لە سێرڤەر) ----------
  const sign = (p) => crypto.createHmac("sha256", secret).update(p).digest("hex");
  const makeToken = (uid) => { const p = uid + "." + (Date.now() + DAY7); return p + "." + sign(p); };
  function readToken(t) {
    const parts = String(t || "").split(".");
    if (parts.length !== 3) return null;
    const p = parts[0] + "." + parts[1], a = Buffer.from(parts[2]), b = Buffer.from(sign(p));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || +parts[1] < Date.now()) return null;
    return parts[0];
  }
  function cookie(req, n) {
    const m = (req.headers.get("cookie") || "").split(";").map((s) => s.trim()).find((s) => s.startsWith(n + "="));
    return m ? m.slice(n.length + 1) : null;
  }
  async function getUser(req) {
    const uid = readToken(cookie(req, "sid"));
    if (!uid) return null;
    const u = await get("SELECT * FROM users WHERE id=?", uid);
    return u && !u.banned ? u : null;
  }
  const secure = (req) => (new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "");
  const sessionCookie = (req, uid) => "sid=" + makeToken(uid) + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800" + secure(req);
  const clientIp = (req) => req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

  async function limited(key, max) {
    const now = Date.now();
    await run("DELETE FROM hits WHERE ts < ?", now - 60000);
    const c = await get("SELECT COUNT(*) AS n FROM hits WHERE k=?", key);
    if (c.n >= max) return true;
    await run("INSERT INTO hits (k, ts) VALUES (?, ?)", key, now);
    return false;
  }

  // ---------- ئامادەکردن (یەکجار لە هەر cold start) ----------
  let ready;
  function init() {
    return (ready ||= (async () => {
      if (secret.length < 16) throw new Error("SESSION_SECRET دانەنراوە (لانیکەم ١٦ پیت)");
      if (adminPass.length < 8) throw new Error("ADMIN_PASS دانەنراوە (لانیکەم ٨ پیت)");
      for (const s of SCHEMA) await run(s);
      const a = await get("SELECT * FROM users WHERE role='admin' ORDER BY ts LIMIT 1");
      if (!a) {
        const [salt, hash] = newPw(adminPass);
        await run("INSERT INTO users (id,name,login,role,banned,ts,salt,hash) VALUES (?,?,?,?,?,?,?,?)",
          rid("u"), "بەڕێوەبەر", adminUser, "admin", 0, Date.now(), salt, hash);
      } else if (a.login !== adminUser || !checkPw(a, adminPass)) {
        const [salt, hash] = newPw(adminPass);
        await run("UPDATE users SET login=?, salt=?, hash=? WHERE id=?", adminUser, salt, hash, a.id);
      }
    })().catch((e) => { ready = null; throw e; }));
  }

  function saveImgBuf(data) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(String(data || ""));
    if (!m) return null;
    const buf = Buffer.from(m[1], "base64");
    if (buf.length > 400000 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
    return buf;
  }

  // ---------- ڕێکخەری سەرەکی ----------
  return async function handle(req) {
    try {
      await init();
      const u = new URL(req.url), url = u.pathname, method = req.method, ip = clientIp(req);

      const um = method === "GET" && /^\/uploads\/(p[a-z0-9]+\.jpg)$/.exec(url);
      if (um) {
        const buf = await store.get(um[1]);
        return buf ? send(200, new Uint8Array(buf), "image/jpeg", { "Cache-Control": "public, max-age=86400" })
                   : send(404, { error: "نەدۆزرایەوە" });
      }
      if (!url.startsWith("/api/")) return send(404, { error: "نەدۆزرایەوە" });

      if (method !== "GET" && req.headers.get("origin")) {
        let h; try { h = new URL(req.headers.get("origin")).host; } catch (e) {}
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
        if (h !== host) return send(403, { error: "ڕێگەپێدان نییە" });
      }
      const me = await getUser(req);

      if (url === "/api/me") return send(200, { user: pubUser(me) });
      if (url === "/api/stats") return send(200, await get(`SELECT
        (SELECT COUNT(*) FROM posts WHERE type='lost' AND done=0)  AS lost,
        (SELECT COUNT(*) FROM posts WHERE type='found' AND done=0) AS found,
        (SELECT COUNT(*) FROM posts WHERE done=1)                  AS done,
        (SELECT COUNT(*) FROM users)                               AS users`));
      if (method === "GET" && url === "/api/posts")
        return send(200, (await all("SELECT * FROM posts ORDER BY ts, rowid")).map((p) => pubPost(p, me)));

      if (method === "POST" && url === "/api/register") {
        if (await limited("reg" + ip, 5)) return send(429, { error: "زۆر داواکاری، کەمێک چاوەڕێ بکە" });
        const b = await readBody(req), name = clean(b.name, 40), phone = String(b.phone || "").replace(/[\s-]/g, ""), pw = String(b.password || "");
        if (name.length < 2 || !PHONE.test(phone) || pw.length < 8 || pw.length > 100)
          return send(400, { error: "ناو، ژمارەی مۆبایلی دروست و وشەی نهێنی (٨ پیت لانیکەم) پێویستن" });
        if (await get("SELECT 1 AS x FROM users WHERE login=?", phone)) return send(409, { error: "ئەم ژمارەیە پێشتر تۆمارکراوە" });
        const nu = { id: rid("u"), name, login: phone, role: "user" }, [salt, hash] = newPw(pw);
        await run("INSERT INTO users (id,name,login,role,banned,ts,salt,hash) VALUES (?,?,?,?,?,?,?,?)",
          nu.id, name, phone, "user", 0, Date.now(), salt, hash);
        return send(201, { user: pubUser(nu) }, null, { "Set-Cookie": sessionCookie(req, nu.id) });
      }
      if (method === "POST" && url === "/api/login") {
        if (await limited("log" + ip, 10)) return send(429, { error: "زۆر هەوڵدان، دواتر دووبارە بکەوە" });
        const b = await readBody(req), login = String(b.login || "").replace(/[\s-]/g, ""), usr = await get("SELECT * FROM users WHERE login=?", login);
        if (!usr || !checkPw(usr, String(b.password || ""))) return send(401, { error: "زانیارییەکان هەڵەن" });
        if (usr.banned) return send(403, { error: "ئەم هەژمارە ڕاگیراوە" });
        return send(200, { user: pubUser(usr) }, null, { "Set-Cookie": sessionCookie(req, usr.id) });
      }
      if (method === "POST" && url === "/api/logout")
        return send(200, { ok: true }, null, { "Set-Cookie": "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + secure(req) });

      if (method === "POST" && url === "/api/posts") {
        if (!me) return send(401, { error: "سەرەتا بچۆ ژوورەوە" });
        if (await limited("post" + me.id, 5)) return send(429, { error: "تکایە کەمێک چاوەڕێ بکە" });
        const b = await readBody(req, 600000);
        const p = { id: rid("p"), uid: me.id, type: b.type === "found" ? "found" : "lost",
          title: clean(b.title, 60), place: clean(b.place, 60), city: clean(b.city, 30), phone: String(b.phone || "").replace(/[\s-]/g, ""),
          description: clean(b.desc, 300), cat: clean(b.cat, 30),
          date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10), ts: Date.now(), done: 0, img: "" };
        if (!p.title || !p.place || !PHONE.test(p.phone)) return send(400, { error: "زانیاری دروست نییە" });
        const buf = saveImgBuf(b.img);
        if (buf) { await store.set(p.id + ".jpg", buf); p.img = "/uploads/" + p.id + ".jpg"; }
        await run("INSERT INTO posts (id,uid,type,title,place,city,phone,description,cat,img,date,ts,done) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)",
          p.id, p.uid, p.type, p.title, p.place, p.city, p.phone, p.description, p.cat, p.img, p.date, p.ts);
        return send(201, pubPost(p, me));
      }
      const m = url.match(/^\/api\/posts\/(p[a-z0-9]+)$/);
      if (m && (method === "PATCH" || method === "DELETE")) {
        if (!me) return send(401, { error: "سەرەتا بچۆ ژوورەوە" });
        const p = await get("SELECT * FROM posts WHERE id=?", m[1]);
        if (!p) return send(404, { error: "نەدۆزرایەوە" });
        if (p.uid !== me.id && me.role !== "admin") return send(403, { error: "ڕێگەپێدان نییە" });
        if (method === "DELETE") {
          if (p.img) await store.del(p.id + ".jpg").catch(() => {});
          await run("DELETE FROM posts WHERE id=?", p.id);
        } else await run("UPDATE posts SET done=1 WHERE id=?", p.id);
        return send(200, { ok: true });
      }

      if (url.startsWith("/api/admin/")) {
        if (!me || me.role !== "admin") return send(403, { error: "تەنها بەڕێوەبەر" });
        if (method === "GET" && url === "/api/admin/users")
          return send(200, (await all(`SELECT u.id, u.name, u.login, u.role, u.banned, COUNT(p.id) AS posts
            FROM users u LEFT JOIN posts p ON p.uid = u.id GROUP BY u.id ORDER BY u.ts, u.rowid`))
            .map((x) => Object.assign({}, x, { banned: !!x.banned })));
        const a = url.match(/^\/api\/admin\/users\/(u[a-z0-9]+)\/ban$/);
        if (method === "POST" && a) {
          const usr = await get("SELECT * FROM users WHERE id=?", a[1]), b = await readBody(req);
          if (!usr || usr.role === "admin") return send(400, { error: "نەگونجاوە" });
          await run("UPDATE users SET banned=? WHERE id=?", b.banned ? 1 : 0, usr.id);
          return send(200, { ok: true });
        }
      }
      return send(404, { error: "نەدۆزرایەوە" });
    } catch (e) {
      console.error(e);
      return send(/SESSION_SECRET|ADMIN_PASS|TURSO/.test(String(e && e.message)) ? 500 : 400,
        { error: /SESSION_SECRET|ADMIN_PASS|TURSO/.test(String(e && e.message)) ? e.message : "داواکاری هەڵەیە" });
    }
  };
}

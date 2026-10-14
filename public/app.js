(function () {
  var $ = function (i) { return document.getElementById(i); };
  var CITIES = ["هەولێر", "سلێمانی", "دهۆک", "هەڵەبجە", "کەرکووک", "زاخۆ", "ڕانیە", "کۆیە", "چەمچەماڵ", "کەلار", "شارێکی تر"];
  var CATS = ["مۆبایل", "جزدان / کارت", "کلیل", "جانتا", "بەڵگەنامە", "ئاژەڵ", "جلوبەرگ", "تر"];
  var img = "", me = null, posts = [], type = "lost", mode = "login";

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, cls, fn) { var b = el("button", cls, txt); b.type = "button"; b.onclick = fn; return b; }
  function toast(t) { var m = $("msg"); m.textContent = t; m.style.display = "block"; setTimeout(function () { m.style.display = "none"; }, 3000); }
  function clean(s) { return String(s || "").replace(/[<>]/g, "").trim(); }
  function field(id, label, tag, attrs) {
    var w = el("div"); w.appendChild(el("label", null, label));
    var i = el(tag); i.id = id; for (var k in attrs || {}) i.setAttribute(k, attrs[k]); w.appendChild(i); return w;
  }
  function select(id, label, opts) {
    var w = field(id, label, "select"), s = w.querySelector("select");
    opts.forEach(function (o) { s.appendChild(el("option", null, o)); }); return w;
  }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "هەڵە"); return j; });
    });
  }

  // ---- هێمای خۆر ----
  (function () {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "-50 -50 100 100"); s.setAttribute("width", "54"); s.setAttribute("height", "54");
    for (var i = 0; i < 21; i++) {
      var a = (i * 360 / 21) * Math.PI / 180, l = document.createElementNS(ns, "line");
      l.setAttribute("x1", Math.sin(a) * 26); l.setAttribute("y1", -Math.cos(a) * 26);
      l.setAttribute("x2", Math.sin(a) * 46); l.setAttribute("y2", -Math.cos(a) * 46);
      l.setAttribute("stroke", "#f4b183"); l.setAttribute("stroke-width", "5"); l.setAttribute("stroke-linecap", "round"); s.appendChild(l);
    }
    var c = document.createElementNS(ns, "circle"); c.setAttribute("r", "19"); c.setAttribute("fill", "#f4b183"); s.appendChild(c);
    $("sun").appendChild(s);
  })();

  // ---- ناڤبار و ئامار ----
  function renderNav() {
    var n = $("nav"); n.textContent = "";
    if (me) {
      n.appendChild(el("span", null, "👤 " + me.name));
      if (me.role === "admin") n.appendChild(btn("⚙️ بەڕێوەبەر", "btn ghost", toggleAdmin));
      n.appendChild(btn("دەرچوون", "btn ghost", function () { api("POST", "/api/logout").then(function () { me = null; boot(); }); }));
    } else {
      n.appendChild(btn("چوونەژوورەوە", "btn ghost", function () { openAuth("login"); }));
      n.appendChild(btn("خۆتۆمارکردن", "btn", function () { openAuth("register"); }));
    }
  }
  function loadStats() {
    api("GET", "/api/stats").then(function (s) {
      var b = $("stats"); b.textContent = "";
      [["ونبوو", s.lost], ["دۆزراوە", s.found], ["چارەسەرکراو", s.done]].forEach(function (x) {
        var d = el("div", null, x[0]); var v = el("b", null, String(x[1])); d.insertBefore(v, d.firstChild); b.appendChild(d);
      });
    }).catch(function () {});
  }

  // ---- فۆرمی پۆست ----
  function renderForm() {
    var b = $("formBox"); b.textContent = "";
    if (!me) {
      b.appendChild(el("h2", null, "شتێکت ونکردووە یان دۆزیوتەوە؟"));
      b.appendChild(el("p", "note", "بۆ بڵاوکردنەوەی پۆست پێویستە هەژمارت هەبێت، ئەمەش بۆ پاراستنی ئاسایشی هەموو لایەکە."));
      b.appendChild(btn("چوونەژوورەوە / خۆتۆمارکردن", "btn dark", function () { openAuth("login"); }));
      return;
    }
    var t = el("div", "tabs"), tl = btn("😟 شتێکم ونکردووە", type === "lost" ? "on" : "", function () { type = "lost"; renderForm(); }),
      tf = btn("😊 شتێکم دۆزیوەتەوە", type === "found" ? "on" : "", function () { type = "found"; renderForm(); });
    t.appendChild(tl); t.appendChild(tf); b.appendChild(t);
    b.appendChild(field("title", "ناونیشانی شتەکە *", "input", { maxlength: 60, placeholder: "نموونە: جزدانی ڕەش" }));
    var r1 = el("div", "row"); r1.appendChild(select("city", "شار", CITIES)); r1.appendChild(select("cat", "جۆر", CATS)); b.appendChild(r1);
    var r2 = el("div", "row"); r2.appendChild(field("place", "شوێن / گەڕەک *", "input", { maxlength: 60 }));
    r2.appendChild(field("date", "بەروار", "input", { type: "date" })); b.appendChild(r2);
    b.appendChild(field("desc", "وەسف", "textarea", { rows: 3, maxlength: 300, placeholder: "ڕەنگ، نیشانەی تایبەت..." }));
    b.appendChild(field("phone", "ژمارەی پەیوەندی *", "input", { inputmode: "tel", maxlength: 20, dir: "ltr" }));
    var iw = el("div"); iw.appendChild(el("label", null, "وێنە (ئارەزوومەندانە)"));
    var fi = el("input"); fi.type = "file"; fi.accept = "image/*"; fi.id = "photo"; iw.appendChild(fi);
    var pv = el("img", "pv"); pv.hidden = true; iw.appendChild(pv); b.appendChild(iw);
    fi.onchange = function () { pickImg(fi.files[0], pv); };
    $("date").value = new Date().toISOString().slice(0, 10);
    if (/^[0-9+]{7,20}$/.test(me.login || "")) $("phone").value = me.login;
    var s = btn("بڵاوکردنەوە", "btn dark full", submit); s.id = "send"; b.appendChild(s);
    b.appendChild(el("p", "note", "🔒 زانیاری هەستیار (ژمارەی کارتی بانک، پاسۆرد، ناونیشانی ماڵ) مەنووسە. بۆ دڵنیابوونەوە، وردەکارییەک بپرسە کە تەنها خاوەنەکەی بزانێت."));
  }
  function pickImg(file, pv) {
    img = ""; pv.hidden = true; if (!file || !/^image\//.test(file.type)) return;
    var r = new FileReader();
    r.onload = function () {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 800 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        img = c.toDataURL("image/jpeg", 0.7); pv.src = img; pv.hidden = false;
      };
      im.onerror = function () { toast("ئەم وێنەیە ناخوێنرێتەوە"); };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  }
  function submit() {
    var v = { type: type, title: clean($("title").value), city: $("city").value, cat: $("cat").value, place: clean($("place").value),
      date: $("date").value, desc: clean($("desc").value), phone: clean($("phone").value), img: img };
    if (!v.title || !v.place || !/^[0-9+\s-]{7,20}$/.test(v.phone)) return toast("ناونیشان، شوێن و ژمارەی دروست پێویستن");
    $("send").disabled = true;
    api("POST", "/api/posts", v).then(function () { toast("بڵاوکرایەوە ✔"); img = ""; renderForm(); loadPosts(); loadStats(); })
      .catch(function (e) { toast(e.message); $("send").disabled = false; });
  }

  // ---- پۆستەکان ----
  function render() {
    var q = clean($("q").value).toLowerCase(), f = $("f").value, c = $("fc").value, box = $("list"); box.textContent = "";
    var shown = posts.filter(function (p) {
      return (!f || p.type == f) && (!c || p.city == c) && (!q || (p.title + " " + p.place + " " + p.desc + " " + p.cat).toLowerCase().indexOf(q) > -1);
    }).sort(function (a, b) { return b.ts - a.ts; });
    if (!shown.length) return box.appendChild(el("div", "empty", "هیچ پۆستێک نەدۆزرایەوە"));
    shown.forEach(function (p) {
      var card = el("article", "card post");
      card.appendChild(el("span", "tag " + (p.done ? "done" : p.type), p.done ? "✔ چارەسەرکرا" : p.type == "lost" ? "ونبوو" : "دۆزراوە"));
      card.appendChild(el("h3", null, p.title));
      if (p.img) { var im = el("img", "ph"); im.src = p.img; im.alt = p.title; im.loading = "lazy"; card.appendChild(im); }
      card.appendChild(el("div", "meta", "📍 " + (p.city ? p.city + " - " : "") + p.place + " · 📅 " + p.date + " · " + p.cat));
      if (p.desc) card.appendChild(el("p", null, p.desc));
      var a = el("div", "acts");
      if (!p.done) { var l = el("a", "call", "📞 پەیوەندی"); l.href = "tel:" + p.phone.replace(/[^0-9+]/g, ""); a.appendChild(l); }
      if (p.can) {
        if (!p.done) a.appendChild(btn("✔ چارەسەر بوو", "", function () { act("PATCH", p); }));
        a.appendChild(btn("🗑 سڕینەوە", "", function () { if (confirm("دڵنیایت؟")) act("DELETE", p); }));
      }
      card.appendChild(a); box.appendChild(card);
    });
  }
  function act(m, p) { api(m, "/api/posts/" + p.id).then(function () { loadPosts(); loadStats(); }).catch(function (e) { toast(e.message); }); }
  function loadPosts() { api("GET", "/api/posts").then(function (p) { posts = p; render(); }).catch(function () { toast("پەیوەندی بە سێرڤەرەوە نییە"); }); }

  // ---- چوونەژوورەوە / خۆتۆمارکردن ----
  function openAuth(m) {
    mode = m; var b = $("mbox"); b.textContent = ""; $("modal").hidden = false;
    b.appendChild(el("h2", null, m == "login" ? "چوونەژوورەوە" : "خۆتۆمارکردن"));
    if (m == "register") b.appendChild(field("an", "ناو", "input", { maxlength: 40 }));
    b.appendChild(field("al", "ژمارەی مۆبایل" + (m == "login" ? " (یان ناوی بەکارهێنەر)" : ""), "input", { dir: "ltr", autocomplete: "username" }));
    b.appendChild(field("ap", "وشەی نهێنی" + (m == "register" ? " (٨ پیت لانیکەم)" : ""), "input", { type: "password", autocomplete: m == "login" ? "current-password" : "new-password" }));
    b.appendChild(btn(m == "login" ? "چوونەژوورەوە" : "تۆمارکردن", "btn dark full", doAuth));
    b.appendChild(btn(m == "login" ? "هەژمارت نییە؟ خۆت تۆمار بکە" : "هەژمارت هەیە؟ بچۆ ژوورەوە", "sm", function () { openAuth(m == "login" ? "register" : "login"); }));
    b.appendChild(btn("داخستن", "sm", function () { $("modal").hidden = true; }));
  }
  function doAuth() {
    var body = mode == "login" ? { login: $("al").value, password: $("ap").value } : { name: clean($("an").value), phone: $("al").value, password: $("ap").value };
    api("POST", mode == "login" ? "/api/login" : "/api/register", body).then(function () { $("modal").hidden = true; boot(); })
      .catch(function (e) { toast(e.message); });
  }

  // ---- بەشی بەڕێوەبەر ----
  function toggleAdmin() {
    var b = $("adminBox"); if (!b.hidden) { b.hidden = true; return; }
    api("GET", "/api/admin/users").then(function (users) {
      b.textContent = ""; b.hidden = false; b.appendChild(el("h2", null, "⚙️ پانێڵی بەڕێوەبەر · بەکارهێنەران"));
      var w = el("div", "tw"), t = el("table"), h = el("tr");
      ["ناو", "ژمارە", "پۆست", "دۆخ", ""].forEach(function (x) { h.appendChild(el("th", null, x)); }); t.appendChild(h);
      users.forEach(function (u) {
        var r = el("tr"); [u.name, u.login, String(u.posts), u.role == "admin" ? "بەڕێوەبەر" : u.banned ? "ڕاگیراو" : "چالاک"].forEach(function (x) { r.appendChild(el("td", null, x)); });
        var td = el("td"); if (u.role != "admin") td.appendChild(btn(u.banned ? "کردنەوە" : "ڕاگرتن", "sm", function () {
          api("POST", "/api/admin/users/" + u.id + "/ban", { banned: !u.banned }).then(function () { b.hidden = true; toggleAdmin(); }).catch(function (e) { toast(e.message); });
        })); r.appendChild(td); t.appendChild(r);
      });
      w.appendChild(t); b.appendChild(w); b.appendChild(el("p", "note", "وەک بەڕێوەبەر دەتوانیت هەر پۆستێک لە خوارەوە بسڕیتەوە."));
    }).catch(function (e) { toast(e.message); });
  }

  // ---- دەستپێکردن ----
  function boot() {
    api("GET", "/api/me").then(function (r) {
      me = r.user; if (me) me.login = me.role == "admin" ? "" : (me.login || "");
      $("adminBox").hidden = true; renderNav(); renderForm(); loadPosts(); loadStats();
    });
  }
  var fc = $("fc"); fc.appendChild(el("option", null, "هەموو شارەکان")).value = "";
  CITIES.forEach(function (c) { fc.appendChild(el("option", null, c)); });
  $("q").oninput = render; $("f").onchange = render; fc.onchange = render;
  $("modal").onclick = function (e) { if (e.target === $("modal")) $("modal").hidden = true; };
  boot(); setInterval(loadPosts, 30000);
})();

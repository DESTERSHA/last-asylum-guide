/* Перевод RU⇄EN для постов и чата.
   Порядок: память браузера → общие переводы в базе (tr_shared: текст переводится один раз на всех) →
   встроенный переводчик Chrome (компьютер, бесплатно, без лимита) → бесплатный переводчик Google → MyMemory (запасной).
   window.LATr.translate(text, "en"|"ru", "chat"|"news") → Promise<перевод | null, если перевод не нужен или недоступен>; LATr.needs(text, dst). */
(function () {
  "use strict";
  var KEY = "la_tr_cache", cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { cache = {}; }
  Object.keys(cache).forEach(function (k) { if (/MYMEMORY WARNING/i.test(cache[k])) delete cache[k]; });
  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      var k = Object.keys(cache); if (k.length > 1500) k.slice(0, k.length - 1500).forEach(function (x) { delete cache[x]; });
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { console.warn("перевод: память браузера не сохранить", e); }
    }, 500);
  }
  function langOf(t) {
    var c = (String(t).match(/[А-Яа-яЁё]/g) || []).length, l = (String(t).match(/[A-Za-z]/g) || []).length;
    return c >= l ? "ru" : "en";
  }
  // нужен ли перевод: на английский — если есть русские буквы (в планах КвК много тегов латиницей); на русский — если русских нет, а латиница есть
  function needs(text, dst) { text = String(text || ""); return dst === "en" ? /[А-Яа-яЁё]/.test(text) : !/[А-Яа-яЁё]/.test(text) && /[A-Za-z]{2}/.test(text); }

  async function sha(text) {
    var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [].map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }
  function db() { return window.LAAuth && window.LAAuth.client; }
  async function fromShared(id) {
    var sb = db(); if (!sb) return null;
    try { var r = await sb.from("tr_shared").select("tr").eq("id", id).maybeSingle(); return r.data ? r.data.tr : null; }
    catch (e) { console.warn("перевод: общие переводы", e); return null; }
  }
  function toShared(id, kind, dst, tr) {
    var sb = db(); if (!sb || !(window.LAAuth.state && window.LAAuth.state.user)) return;
    sb.from("tr_shared").upsert({ id: id, kind: kind, dst: dst, tr: tr }, { onConflict: "id", ignoreDuplicates: true })
      .then(function (r) { if (r.error) console.warn("перевод: не сохранить в общие", r.error.message); });
  }

  var chromeTr = {}, chromeLoading = {};
  async function viaChrome(text, src, dst) {
    if (!("Translator" in self)) return null;
    var key = src + ">" + dst;
    if (!chromeTr[key]) {
      var av = await self.Translator.availability({ sourceLanguage: src, targetLanguage: dst });
      if (av === "unavailable") return null;
      if (av !== "available") {
        if (!chromeLoading[key]) chromeLoading[key] = self.Translator.create({ sourceLanguage: src, targetLanguage: dst }).then(function (t) { chromeTr[key] = t; }).catch(function (e) { console.warn("перевод: модель Chrome", e && e.message); });
        return null;
      }
      chromeTr[key] = await self.Translator.create({ sourceLanguage: src, targetLanguage: dst });
    }
    return await chromeTr[key].translate(text);
  }
  function chunks(text) {  // куски до ~1500 символов по строкам (длина адреса запроса)
    var out = [], cur = "";
    text.split("\n").forEach(function (l) {
      while (l.length > 1500) { if (cur) { out.push(cur); cur = ""; } out.push(l.slice(0, 1500)); l = l.slice(1500); }
      if (cur && (cur + "\n" + l).length > 1500) { out.push(cur); cur = l; } else cur = cur ? cur + "\n" + l : l;
    });
    out.push(cur);
    return out;
  }
  var googleDead = 0;
  async function viaGoogle(text, src, dst) {
    if (Date.now() < googleDead) return null;
    var parts = chunks(text), res = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i].trim()) { res.push(parts[i]); continue; }
      var r = await fetch("https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=" + src + "&tl=" + dst + "&q=" + encodeURIComponent(parts[i]));
      if (!r.ok) { googleDead = Date.now() + 10 * 60e3; throw new Error("Google " + r.status); }  // отказал — 10 мин не трогаем
      var j = await r.json(), t = Array.isArray(j) ? (Array.isArray(j[0]) ? j[0][0] : j[0]) : null;
      if (typeof t !== "string") throw new Error("Google: непонятный ответ");
      res.push(t);
    }
    return res.join("\n");
  }
  var mmDead = false;
  async function viaMyMemory(text, src, dst) {
    if (mmDead) return null;
    var out = [], lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!/[A-Za-zА-Яа-яЁё]/.test(l)) { out.push(l); continue; }
      var r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(l.slice(0, 480)) + "&langpair=" + src + "|" + dst);
      var j = await r.json(), tt = j.responseData && j.responseData.translatedText || "";
      if (+j.responseStatus !== 200 || /MYMEMORY WARNING|USED ALL AVAILABLE/i.test(tt)) { mmDead = true; throw new Error(j.responseDetails || "MyMemory: лимит"); }
      out.push(tt);
    }
    return out.join("\n");
  }
  var running = 0, waiting = [];
  function slot(fn) {  // не больше 3 переводов одновременно
    return new Promise(function (ok, bad) {
      var go = function () { running++; Promise.resolve().then(fn).then(ok, bad).then(function () { running--; if (waiting.length) waiting.shift()(); }); };
      if (running < 3) go(); else waiting.push(go);
    });
  }
  var inflight = {};
  async function translate(text, dst, kind) {
    text = String(text || "");
    if (!text.trim() || !needs(text, dst)) return null;
    var lk = dst + "|" + text;
    if (cache[lk] != null) return cache[lk];
    if (inflight[lk]) return inflight[lk];
    inflight[lk] = (async function () {
      var src = dst === "en" ? "ru" : "en";
      var id = dst + ":" + (await sha(text));
      var res = await fromShared(id), fresh = false;
      if (res == null) {
        fresh = true;
        try { res = await Promise.race([viaChrome(text, src, dst), new Promise(function (ok) { setTimeout(function () { ok(null); }, 3000); })]); }
        catch (e) { console.warn("перевод: Chrome", e && e.message); }
        if (res == null) try { res = await slot(function () { return viaGoogle(text, src, dst); }); } catch (e) { console.warn("перевод: Google", e && e.message); }
        if (res == null) try { res = await slot(function () { return viaMyMemory(text, src, dst); }); } catch (e) { console.warn("перевод: MyMemory", e && e.message); }
      }
      if (res == null) return null;  // переводчики недоступны — остаётся оригинал
      cache[lk] = res; save();
      if (fresh) toShared(id, kind === "news" ? "news" : "chat", dst, res);
      return res;
    })();
    try { return await inflight[lk]; } finally { delete inflight[lk]; }
  }
  window.LATr = { langOf: langOf, needs: needs, translate: translate };
})();

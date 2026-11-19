/* Перевод RU⇄EN для постов и чата: встроенный переводчик Chrome (бесплатно, на устройстве), иначе бесплатный сервис MyMemory.
   window.LATr.langOf(text) → "ru"|"en"; window.LATr.translate(text, "en"|"ru") → Promise<перевод | null, если уже на этом языке>.
   Переносы строк сохраняются (переводится построчно), готовые переводы запоминаются в браузере. */
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
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { console.warn("перевод: кэш не сохранить", e); }
    }, 500);
  }
  function langOf(t) {
    var c = (String(t).match(/[А-Яа-яЁё]/g) || []).length, l = (String(t).match(/[A-Za-z]/g) || []).length;
    return c >= l ? "ru" : "en";
  }
  var chromeTr = {}, chromeLoading = {};
  async function viaChrome(text, src, dst) {
    if (!("Translator" in self)) return null;
    var key = src + ">" + dst;
    if (!chromeTr[key]) {
      var av = await self.Translator.availability({ sourceLanguage: src, targetLanguage: dst });
      if (av === "unavailable") return null;
      if (av !== "available") {  // модель ещё качается — пока MyMemory
        if (!chromeLoading[key]) chromeLoading[key] = self.Translator.create({ sourceLanguage: src, targetLanguage: dst }).then(function (t) { chromeTr[key] = t; }).catch(function (e) { console.warn("перевод: модель Chrome", e && e.message); });
        return null;
      }
      chromeTr[key] = await self.Translator.create({ sourceLanguage: src, targetLanguage: dst });
    }
    return await chromeTr[key].translate(text);
  }
  var dead = false;  // дневной лимит исчерпан — не пробуем до перезагрузки
  async function viaMyMemory(text, src, dst) {
    if (dead) throw new Error("лимит переводчика на сегодня исчерпан");
    var parts = [], cur = "";
    text.split(/(?<=[.!?])\s+/).forEach(function (s) {
      while (s.length > 450) { if (cur) { parts.push(cur); cur = ""; } parts.push(s.slice(0, 450)); s = s.slice(450); }
      if ((cur + " " + s).length > 450) { parts.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
    });
    if (cur) parts.push(cur);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(parts[i]) + "&langpair=" + src + "|" + dst);
      var j = await r.json();
      var tt = j.responseData && j.responseData.translatedText || "";
      if (+j.responseStatus !== 200 || /MYMEMORY WARNING|USED ALL AVAILABLE/i.test(tt)) { if (/USED ALL AVAILABLE|QUOTA/i.test((j.responseDetails || "") + tt)) dead = true; throw new Error(j.responseDetails || "перевод не удался"); }
      out.push(j.responseData.translatedText);
    }
    return out.join(" ");
  }
  var running = 0, waiting = [];
  function slot(fn) {  // не больше 3 запросов перевода одновременно
    return new Promise(function (ok, bad) {
      var go = function () { running++; Promise.resolve().then(fn).then(ok, bad).then(function () { running--; if (waiting.length) waiting.shift()(); }); };
      if (running < 3) go(); else waiting.push(go);
    });
  }
  // строка «русская», если в ней есть хоть одна русская буква (в планах КвК много тегов латиницей: «План kvk FaZe»)
  function srcOf(t) { return /[А-Яа-яЁё]/.test(t) ? "ru" : "en"; }
  async function line(t, dst) {
    if (!/[A-Za-zА-Яа-яЁё]/.test(t)) return t;
    var src = srcOf(t);
    if (src === dst) return t;
    var k = dst + "|" + t;
    if (cache[k] != null) return cache[k];
    var res = null;
    try { res = await Promise.race([viaChrome(t, src, dst), new Promise(function (ok) { setTimeout(function () { ok(null); }, 3000); })]); }
    catch (e) { console.warn("перевод: Chrome не сработал, беру MyMemory:", e && e.message); }
    if (res == null) {
      try { res = await slot(function () { return viaMyMemory(t, src, dst); }); }
      catch (e) { console.warn("перевод: строка не перевелась, оставляю как есть:", e && e.message); return t; }
    }
    cache[k] = res; save();
    return res;
  }
  async function translate(text, dst) {
    text = String(text || "");
    if (!text.trim() || (dst === "en" ? !/[А-Яа-яЁё]/.test(text) : /[А-Яа-яЁё]/.test(text) || !/[A-Za-z]/.test(text))) return null;
    var lines = text.split("\n");
    var out = await Promise.all(lines.map(function (l) { return l.trim() ? line(l, dst) : Promise.resolve(l); }));
    return out.join("\n");
  }
  // нужен ли перевод на язык dst: на английский — если есть русские буквы; на русский — если русских нет, а латиница есть
  function needs(text, dst) { text = String(text || ""); return dst === "en" ? /[А-Яа-яЁё]/.test(text) : !/[А-Яа-яЁё]/.test(text) && /[A-Za-z]{2}/.test(text); }
  window.LATr = { langOf: langOf, translate: translate, needs: needs };
})();

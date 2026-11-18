/* Избранное: звёздочка у разделов и событий, список — в «Кабинете». Пока хранится в браузере (localStorage);
   после подключения аккаунтов будет храниться в аккаунте. API для других скриптов: window.LAFav. */
(function () {
  "use strict";
  var KEY = "la397_fav";
  var subs = [];
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
  function write(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* приватный режим: избранное не запомнится */ } subs.forEach(function (f) { f(l); }); count(); }
  function has(url) { return read().some(function (x) { return x.url === url; }); }
  function toggle(item) {
    var l = read(), i = l.findIndex(function (x) { return x.url === item.url; });
    var added = i < 0;
    if (i >= 0) l.splice(i, 1); else l.unshift(Object.assign({ t: Date.now() }, item));
    write(l);
    if (window.LAAuth) { if (added) window.LAAuth.favAdd(l[0]); else window.LAAuth.favDel(item.url); }
    return i < 0;
  }
  function remove(url) { write(read().filter(function (x) { return x.url !== url; })); if (window.LAAuth) window.LAAuth.favDel(url); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
  var page = (location.pathname.split("/").pop() || "index.html");
  var pageName = (document.querySelector('nav.main a.on') || {}).textContent || document.title.split("|")[0].trim();
  function star(el, item) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "fav-star";
    function upd() { var on = has(item.url); b.classList.toggle("on", on); b.textContent = on ? "★ В избранном" : "☆ В избранное"; b.title = on ? "Убрать из избранного" : "Добавить в избранное — появится в «Кабинете»"; }
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggle(item); upd(); });
    subs.push(upd);
    upd();
    el.appendChild(b);
    return b;
  }
  function count() {
    var n = read().length;
    document.querySelectorAll("[data-fav-count]").forEach(function (e) { e.textContent = n ? n : ""; e.style.display = n ? "" : "none"; });
  }
  window.LAFav = { list: read, has: has, toggle: toggle, remove: remove, star: star, onchange: function (f) { subs.push(f); }, _replace: function (l) { write(l); } };

  if (page !== "cabinet.html" && page !== "server.html") {
    /* разделы страницы */
    document.querySelectorAll("section").forEach(function (sec) {
      var h = sec.querySelector("h2");
      if (!h) return;
      if (!sec.id) sec.id = slug(h.textContent);
      var wrap = document.createElement("div");
      wrap.className = "fav-row";
      sec.classList.add("has-fav");
      sec.insertBefore(wrap, sec.firstChild);
      star(wrap, { url: page + "#" + sec.id, title: h.textContent.trim(), page: pageName, kind: "Раздел" });
    });
    /* отдельные события (страница «События») */
    document.querySelectorAll(".evc").forEach(function (c) {
      var n = c.querySelector(".evn");
      if (!n) return;
      if (!c.id) c.id = "ev-" + slug(n.textContent);
      var icon = c.querySelector("img");
      var b = star(c, { url: page + "#" + c.id, title: (n.firstChild && n.firstChild.nodeType === 3 ? n.firstChild.textContent : n.textContent).trim(), page: pageName, kind: "Событие", icon: icon ? icon.getAttribute("src") : "", icon_only: true });
      b.classList.add("corner");
    });
    /* переход по ссылке из избранного к нужному месту (якоря появились после загрузки) */
    if (location.hash.length > 1) { var t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) setTimeout(function () { t.scrollIntoView({ behavior: "smooth", block: "start" }); }, 150); }
  }
  count();
})();

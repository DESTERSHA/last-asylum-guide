/* Плашка «Срочно» на всех страницах: свежие срочные посты из «Важных новостей» (за 7 дней).
   Закрыл крестиком — больше не показывается в этом браузере (помним номера постов). */
(function () {
  "use strict";
  var A = window.LAAuth, sb = A && A.client;
  if (!sb || /[?&]embed=1/.test(location.search) || document.getElementById("newsFeed")) return;  // на самой странице новостей посты и так видны
  var T = function (s) { return window.T ? window.T(s) : s; };
  var EN = document.documentElement.lang === "en";
  var KEY = "la_notice_closed";
  var closed = {};
  try { closed = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { closed = {}; }
  var since = new Date(Date.now() - 7 * 864e5).toISOString();
  sb.from("posts").select("id,title,created_at").eq("urgent", true).gte("created_at", since).order("created_at", { ascending: false }).limit(3).then(function (r) {
    if (r.error) { console.warn("Плашка новостей:", r.error.message); return; }
    var list = (r.data || []).filter(function (p) { return !closed[p.id]; });
    if (!list.length) return;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var box = document.createElement("div");
    box.className = "news-notice";
    box.innerHTML = list.map(function (p) {
      return '<div class="nn-row"><span class="nn-tag">' + T("Срочно") + '</span><a href="' + (EN ? "news.en.html" : "news.html") + "#post-" + p.id + '">' + esc(p.title) + '</a><button type="button" data-close="' + p.id + '" aria-label="' + esc(T("Закрыть")) + '">✕</button></div>';
    }).join("");
    var head = document.querySelector(".site-head");
    if (head && head.nextSibling) head.parentNode.insertBefore(box, head.nextSibling); else document.body.insertBefore(box, document.body.firstChild);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-close]"); if (!b) return;
      closed[b.dataset.close] = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(closed)); } catch (err) { console.warn("Плашка новостей: не запомнить закрытие", err); }
      b.closest(".nn-row").remove();
      if (!box.children.length) box.remove();
    });
  });
})();

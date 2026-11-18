/* Быстрый просмотр: ссылка в тексте открывает нужный раздел окном поверх страницы (не уводит со страницы).
   В окне — страница сайта в режиме ?embed=1: без шапки и подвала, показан только раздел по якорю. */
(function () {
  var T = function (s) { return window.T ? window.T(s) : s; };
  "use strict";
  var embed = /[?&]embed=1/.test(location.search);
  if (embed) {
    /* режим «внутри окна»: показываем только раздел, на который ссылаются */
    var show = function () {
      var id = decodeURIComponent(location.hash.slice(1));
      var t = id && document.getElementById(id);
      if (!t) return;
      var sec = t.closest("main > *") || t;
      [].forEach.call(document.querySelectorAll("main > *"), function (el) { el.style.display = el === sec ? "" : "none"; });
      window.scrollTo(0, 0);
      if (t !== sec) setTimeout(function () { window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 8); }, 50);  // scrollIntoView двигал бы и страницу под окном
    };
    show();
    document.addEventListener("DOMContentLoaded", show);
    /* ссылки внутри окна открываем в самом окне */
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (!a || a.target) return;
      var u = new URL(a.getAttribute("href"), location.href);
      if (u.origin !== location.origin) return;
      e.preventDefault();
      u.searchParams.set("embed", "1");
      location.href = u.href;
    });
    return;
  }

  var page = location.pathname.split("/").pop() || "index.html";
  function isPeek(a) {
    if (a.target || a.hasAttribute("download") || a.closest("nav, .btns, .card.link, .cab-it, .ap-chips, .tabbar, header, footer, .m3d, .gc, #view, .design-sw")) return false;
    if (!a.closest("p, li, td, .note, .sub, .lead, .fact, .card, .step, .evc, .cap, h3, span, b")) return false;
    var href = a.getAttribute("href") || "";
    if (/^(https?:|mailto:|tel:|javascript:)/i.test(href) && !href.startsWith(location.origin)) return false;
    var u = new URL(href, location.href);
    if (u.origin !== location.origin) return false;
    var p = u.pathname.split("/").pop() || "index.html";
    if (!/\.html$/.test(p)) return false;
    if (!u.hash) return false;  // ссылка на всю страницу — обычный переход
    if (p === page && !u.hash) return false;
    if (/^(server|cabinet)(\.en)?\.html$/.test(p)) return false; // живые страницы — открываем как обычно
    return true;
  }
  var box, frame, title, full, keepY = 0;
  function hold() { if (box && box.classList.contains("on") && Math.abs(window.scrollY - keepY) > 1) window.scrollTo(0, keepY); }
  function build() {
    box = document.createElement("div");
    box.className = "peek";
    box.innerHTML = '<div class="peek-bg"></div><div class="peek-win" role="dialog" aria-modal="true"><div class="peek-bar"><button type="button" class="peek-x" aria-label="' + T("Закрыть") + '">✕<span> ' + T("Назад") + '</span></button><b class="peek-t"></b><a class="peek-full" href="#">' + T("Открыть страницу целиком ↗") + '</a></div><iframe class="peek-f" title="' + T("Быстрый просмотр") + '"></iframe></div>';
    document.body.appendChild(box);
    frame = box.querySelector("iframe"); title = box.querySelector(".peek-t"); full = box.querySelector(".peek-full");
    box.querySelector(".peek-bg").addEventListener("click", close);
    box.querySelector(".peek-x").addEventListener("click", close);
    window.addEventListener("scroll", hold, { passive: true });
    frame.addEventListener("load", function () {
      hold();
      try { var d = frame.contentDocument, id = decodeURIComponent((frame.contentWindow.location.hash || "").slice(1)), t = id && d.getElementById(id);
        var h = t && (t.matches("h2,h3") ? t : t.querySelector("h2,h3") || (t.closest("section") || t).querySelector("h2"));
        title.textContent = h ? h.textContent.trim() : (d.title.split("|")[0].trim());
      } catch (e) { title.textContent = ""; }
    });
  }
  function open(href) {
    if (!box) build();
    var u = new URL(href, location.href);
    full.href = u.pathname.split("/").pop() + u.hash;
    u.searchParams.set("embed", "1");
    keepY = window.scrollY;
    title.textContent = T("Загружаю…");
    frame.src = u.href;
    box.classList.add("on");
    document.documentElement.classList.add("peek-open");
  }
  function close() {
    if (!box) return;
    box.classList.remove("on");
    document.documentElement.classList.remove("peek-open");
    window.scrollTo(0, keepY);
    setTimeout(function () { if (!box.classList.contains("on")) frame.src = "about:blank"; }, 250);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("main a[href]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    if (!isPeek(a)) return;
    e.preventDefault();
    open(a.getAttribute("href"));
  });
  /* отметка у таких ссылок: значок «окно» */
  document.querySelectorAll("main a[href]").forEach(function (a) { if (isPeek(a)) a.classList.add("peek-link"); });
})();

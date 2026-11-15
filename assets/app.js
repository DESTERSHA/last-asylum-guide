/* Last Asylum: Plague — гайд. Мелкая интерактивность без библиотек. */
(function () {
  "use strict";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим: просто не запоминаем */ } }
  };

  /* --- тема --- */
  var root = document.documentElement;
  var saved = store.get("lap-theme");
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  var themeBtn = document.getElementById("themeBtn");
  function isDark() {
    var t = root.getAttribute("data-theme");
    if (t) return t === "dark";
    return !window.matchMedia("(prefers-color-scheme: light)").matches;
  }
  function paintThemeBtn() { if (themeBtn) themeBtn.textContent = isDark() ? "☀️" : "🌙"; }
  if (themeBtn) {
    paintThemeBtn();
    themeBtn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store.set("lap-theme", next);
      paintThemeBtn();
    });
  }

  /* --- мобильное меню --- */
  var menuBtn = document.getElementById("menuBtn");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".sidenav a").forEach(function (a) {
      a.addEventListener("click", function () { document.body.classList.remove("nav-open"); });
    });
  }

  /* --- оглавление страницы в боковом меню --- */
  var active = document.querySelector(".sidenav a.active");
  var heads = document.querySelectorAll("main h2[id]");
  if (active && heads.length > 1) {
    var toc = document.createElement("div");
    toc.className = "toc";
    heads.forEach(function (h) {
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.getAttribute("data-short") || h.textContent;
      toc.appendChild(a);
    });
    active.insertAdjacentElement("afterend", toc);
  }

  /* --- вкладки --- */
  document.querySelectorAll(".tabs-ui").forEach(function (box) {
    var btns = box.querySelectorAll(".tabbar button");
    var panels = box.querySelectorAll(".tabpanel");
    function show(i) {
      btns.forEach(function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
      panels.forEach(function (p, j) { p.classList.toggle("on", i === j); });
    }
    btns.forEach(function (b, i) { b.addEventListener("click", function () { show(i); }); });
    // дни дуэли: подсветить сегодняшний (по UTC — дуэль обнуляется в 00:00 UTC)
    var todayIdx = -1;
    if (box.hasAttribute("data-utc-days")) {
      var d = new Date().getUTCDay(); // 0 = воскресенье
      btns.forEach(function (b, i) {
        if (Number(b.getAttribute("data-day")) === d) {
          todayIdx = i;
          var tag = document.createElement("span");
          tag.className = "today"; tag.textContent = "сегодня";
          b.appendChild(tag);
        }
      });
    }
    show(todayIdx >= 0 ? todayIdx : 0);
  });

  /* --- чек-листы с запоминанием --- */
  document.querySelectorAll(".checklist[data-key]").forEach(function (list) {
    var key = "lap-check-" + list.getAttribute("data-key");
    var state = {};
    try { state = JSON.parse(store.get(key) || "{}"); } catch (e) { state = {}; }
    var boxes = list.querySelectorAll("input[type=checkbox]");
    boxes.forEach(function (cb, i) {
      cb.checked = !!state[i];
      cb.addEventListener("change", function () { state[i] = cb.checked; store.set(key, JSON.stringify(state)); });
    });
    var reset = document.querySelector('.check-reset[data-for="' + list.getAttribute("data-key") + '"]');
    if (reset) reset.addEventListener("click", function () {
      state = {}; store.set(key, "{}"); boxes.forEach(function (cb) { cb.checked = false; });
    });
  });

  /* --- увеличение скриншотов --- */
  var lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = '<img alt="">';
  document.body.appendChild(lb);
  lb.addEventListener("click", function () { lb.classList.remove("on"); });
  document.querySelectorAll("figure.shot img").forEach(function (img) {
    img.addEventListener("click", function () {
      lb.querySelector("img").src = img.currentSrc || img.src;
      lb.querySelector("img").alt = img.alt;
      lb.classList.add("on");
    });
    img.addEventListener("error", function () {
      var f = img.closest("figure");
      if (f) f.insertAdjacentHTML("afterbegin", '<p class="muted" style="margin:6px 4px">Картинка не загрузилась (сайт-источник недоступен). Подпись ниже всё объясняет.</p>');
      img.style.display = "none";
    });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") lb.classList.remove("on"); });

  /* --- поиск по терминам --- */
  var q = document.getElementById("glossSearch");
  if (q) {
    var terms = document.querySelectorAll(".gloss .term");
    var letters = document.querySelectorAll(".gloss .letter");
    var empty = document.getElementById("glossEmpty");
    q.addEventListener("input", function () {
      var v = q.value.trim().toLowerCase();
      var shown = 0;
      terms.forEach(function (t) {
        var hit = !v || t.textContent.toLowerCase().indexOf(v) !== -1;
        t.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      letters.forEach(function (l) { l.style.display = v ? "none" : ""; });
      if (empty) empty.style.display = shown ? "none" : "";
    });
  }

  /* --- карточка «что сегодня» на главной --- */
  var tc = document.getElementById("todayCard");
  if (tc) {
    var days = [
      ["Воскресенье", "Отдых в Дуэли альянсов. Ничего не трать — копи на неделю. Начни сбор ресурсов вечером, чтобы отряды вернулись уже в понедельник.", "Короля демонов сегодня нет. Начинается новая неделя Войны королевств: с сегодня копим очки королевства."],
      ["Понедельник", "Дуэль, день 1 — «Ворон»: задания сокола, плоды и эссенция Ворона, выносливость, сбор ресурсов весь день.", "Король демонов — Колдун скверны: бей Воинами (+50% урона), 10 ударов."],
      ["Вторник", "Дуэль, день 2 — «Развитие территории»: стройка, ускорения строительства, UR-караван, UR тайная операция, найм выживших.", "Король демонов — Рейнджер скверны: бей Колдунами (+50%), 10 ударов."],
      ["Среда", "Дуэль, день 3 — «Исследования»: ускорения исследований, свитки, сундуки снаряжения Ворона, задания сокола.", "Король демонов — Воин скверны: бей Рейнджерами (+50%), 10 ударов."],
      ["Четверг", "Дуэль, день 4 — «Рост героев»: антитоксин, звёзды, навыки, найм героев.", "Король демонов — Колдун скверны: бей Воинами (+50%), 10 ударов."],
      ["Пятница", "Дуэль, день 5 — «Подготовка к войне»: тренировка и повышение войск, ускорения тренировки, задания сокола.", "Король демонов — Рейнджер скверны: Колдуны +50%. Вечером подсчёт очков Войны королевств: решается, кто нападает в субботу."],
      ["Суббота", "Дуэль, день 6 — «Набег на врага» (после начала КвК). Щит, вывести сборщиков, убрать отряд из стены.", "ВОЙНА КОРОЛЕВСТВ: бой за трон 12:00–16:00 по времени сервера. Открой раздел «КвК» и действуй по шагам."]
    ];
    var d = new Date().getUTCDay();
    tc.innerHTML = '<div class="kicker">Сегодня по UTC</div><div class="big">' + days[d][0] + "</div><p>" + days[d][1] + "</p><p class=\"muted\" style=\"margin-bottom:0\">" + days[d][2] + "</p>";
  }

  /* --- кнопка «наверх» --- */
  var top = document.getElementById("toTop");
  if (top) {
    window.addEventListener("scroll", function () { top.classList.toggle("on", window.scrollY > 900); }, { passive: true });
    top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }
})();

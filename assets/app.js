/* Last Asylum: Plague — гайд альянса 397. Часы, отсчёт, «сегодня», вкладки, чек-листы, увеличение картинок. */
(function () {
  "use strict";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим: галочки просто не запомнятся */ } }
  };
  var SRV = -2, MSK = 3; // время в игре = UTC−2, Москва = UTC+3
  function at(off) { return new Date(Date.now() + off * 36e5); }
  function hhmm(d) { return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
  function srvDay() { return at(SRV).getUTCDay(); } // 0 = воскресенье, по игровому времени

  /* отсчёт до субботы 12:00 по игре (= 17:00 МСК = 14:00 UTC) */
  function untilKvk() {
    var now = new Date();
    var t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0, 0));
    t.setUTCDate(t.getUTCDate() + (6 - now.getUTCDay() + 7) % 7);
    if (t - now < -4 * 36e5) t.setUTCDate(t.getUTCDate() + 7); // бой идёт 4 часа
    var s = (t - now) / 1e3;
    if (s <= 0) return "бой идёт!";
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return "через " + (d ? d + " д " : "") + h + " ч " + m + " м";
  }

  var DAYS = [
    { n: "Воскресенье", duel: "Отдых. Ничего не трать — копи.", boss: "Короля демонов нет" },
    { n: "Понедельник", duel: "День 1 — Ворон: задания сокола, плоды и эссенция Ворона, энергия, сбор ресурсов", boss: "Колдун скверны — бей Воинами" },
    { n: "Вторник", duel: "День 2 — Стройка: молотки, ускорения стройки, золотые караваны и секретные операции, выжившие", boss: "Рейнджер скверны — бей Колдунами" },
    { n: "Среда", duel: "День 3 — Наука: ускорения исследований, свитки, сундуки снаряжения Ворона, сокол", boss: "Воин скверны — бей Рейнджерами" },
    { n: "Четверг", duel: "День 4 — Герои: противоядие, фрагменты, значки навыков, найм", boss: "Колдун скверны — бей Воинами" },
    { n: "Пятница", duel: "День 5 — Войска: обучение и повышение солдат, сокол", boss: "Рейнджер скверны — бей Колдунами" },
    { n: "Суббота", duel: "День 6 — Набег: щит, убрать отряд со стены. Бой КвК в 17:00 МСК", boss: "Воин скверны — бей Рейнджерами" }
  ];

  function tick() {
    document.querySelectorAll("[data-clock=srv]").forEach(function (e) { e.textContent = hhmm(at(SRV)); });
    document.querySelectorAll("[data-clock=msk]").forEach(function (e) { e.textContent = hhmm(at(MSK)); });
    document.querySelectorAll("[data-cd=kvk]").forEach(function (e) { e.textContent = untilKvk(); });
    var d = DAYS[srvDay()];
    document.querySelectorAll("[data-today=name]").forEach(function (e) { e.textContent = d.n; });
    document.querySelectorAll("[data-today=duel]").forEach(function (e) { e.textContent = d.duel; });
    document.querySelectorAll("[data-today=boss]").forEach(function (e) { e.textContent = d.boss; });
  }
  tick(); setInterval(tick, 20000);

  /* подсветить сегодняшний день недели в полосе «неделя» */
  document.querySelectorAll(".day[data-dow]").forEach(function (el) {
    if (Number(el.getAttribute("data-dow")) === srvDay()) el.classList.add("today");
  });

  /* вкладки (у дней Дуэли — открыть сегодняшний день по игровому времени) */
  document.querySelectorAll(".tabs-ui").forEach(function (box) {
    var btns = box.querySelectorAll(".tabbar button"), panels = box.querySelectorAll(".tabpanel");
    function show(i) {
      btns.forEach(function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
      panels.forEach(function (p, j) { p.classList.toggle("on", i === j); });
    }
    btns.forEach(function (b, i) { b.addEventListener("click", function () { show(i); }); });
    var start = 0;
    if (box.hasAttribute("data-days")) {
      btns.forEach(function (b, i) {
        if (Number(b.getAttribute("data-dow")) === srvDay()) {
          start = i;
          var t = document.createElement("span"); t.className = "td"; t.textContent = "сегодня"; b.appendChild(t);
        }
      });
    }
    show(start);
  });

  /* чек-листы с запоминанием на этом устройстве */
  document.querySelectorAll(".checklist[data-key]").forEach(function (list) {
    var key = "lap-check-" + list.getAttribute("data-key"), state = {};
    try { state = JSON.parse(store.get(key) || "{}"); } catch (e) { state = {}; }
    var boxes = list.querySelectorAll("input[type=checkbox]");
    boxes.forEach(function (cb, i) {
      cb.checked = !!state[i];
      cb.addEventListener("change", function () { state[i] = cb.checked; store.set(key, JSON.stringify(state)); });
    });
    var reset = document.querySelector('.check-reset[data-for="' + list.getAttribute("data-key") + '"]');
    if (reset) reset.addEventListener("click", function () { state = {}; store.set(key, "{}"); boxes.forEach(function (cb) { cb.checked = false; }); });
  });

  /* увеличение скриншотов по нажатию */
  var lb = document.createElement("div");
  lb.className = "lightbox";
  var lbImg = document.createElement("img");
  lb.appendChild(lbImg);
  document.body.appendChild(lb);
  lb.addEventListener("click", function () { lb.classList.remove("on"); });
  document.querySelectorAll(".shots img, .shot img").forEach(function (img) {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", function () { lbImg.src = img.currentSrc || img.src; lbImg.alt = img.alt; lb.classList.add("on"); });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") lb.classList.remove("on"); });

  /* поиск по словам */
  var q = document.getElementById("glossSearch");
  if (q) {
    var terms = document.querySelectorAll(".gloss .term"), empty = document.getElementById("glossEmpty");
    q.addEventListener("input", function () {
      var v = q.value.trim().toLowerCase(), shown = 0;
      terms.forEach(function (t) { var hit = !v || t.textContent.toLowerCase().indexOf(v) !== -1; t.style.display = hit ? "" : "none"; if (hit) shown++; });
      if (empty) empty.style.display = shown ? "none" : "";
    });
  }

  /* скрин рядом с текстом — ровно по высоте текстовой колонки (не выше и не ниже), но не меньше 240 px */
  function fitSide() {
    document.querySelectorAll(".grid2>.shot,.grid3>.shot").forEach(function (s) {
      var other = Array.prototype.filter.call(s.parentElement.children, function (c) { return c !== s; })[0];
      var img = s.querySelector("img");
      if (!other || !img) return;
      img.style.maxHeight = "";
      var cap = s.querySelector(".cap"), capH = cap ? cap.getBoundingClientRect().height : 0;
      var h = Math.max(240, other.getBoundingClientRect().height - capH);
      img.style.maxHeight = h + "px";
    });
  }
  /* скрин слева от текста — по высоте текстовой колонки (от 240 до 520 px) */
  function fitSideShot() {
    document.querySelectorAll(".grid2>.side-shot").forEach(function (f) {
      var other = Array.prototype.filter.call(f.parentElement.children, function (c) { return c !== f; })[0];
      if (!other || window.innerWidth <= 800) { f.style.removeProperty("--side-h"); return; }
      var cap = f.querySelector(".cap"), capH = cap ? cap.getBoundingClientRect().height + 6 : 0;
      var mn = +(f.dataset.min || 400), mx = +(f.dataset.max || 560);  /* data-min / data-max — свои пределы высоты снимка */
      var h = Math.min(mx, Math.max(mn, other.getBoundingClientRect().height - capH));
      f.style.setProperty("--side-h", h + "px");
    });
  }
  window.addEventListener("load", fitSideShot);
  window.addEventListener("resize", fitSideShot);
  window.addEventListener("load", fitSide);
  window.addEventListener("resize", fitSide);
  document.addEventListener("click", function () { setTimeout(fitSide, 30); });

  /* кнопка «наверх» */
  var top = document.getElementById("toTop");
  if (top) {
    window.addEventListener("scroll", function () { top.classList.toggle("on", window.scrollY > 900); }, { passive: true });
    top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }
})();

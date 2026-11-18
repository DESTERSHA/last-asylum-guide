/* Калькулятор снаряжения: цифры — из таблиц игры (data/gear.json). */
(function () {
  "use strict";
  var box = document.getElementById("gcalc");
  if (!box) return;
  var ICON = { "Трава": "herb.png", "Камень снаряжения": "gearstone.png", "Закаленная сталь": "mat-steel.png", "Латунь": "mat-brass.png",
    "Чертеж снаряжения (UR)": "blueprint-ur.png", "Чертеж снаряжения (MR)": "blueprint-mr.png" };
  var G = "assets/game/";
  function fmt(n) {
    n = Number(n) || 0;
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return Math.round(n).toLocaleString("ru-RU");
  }
  function full(n) { return Math.round(Number(n) || 0).toLocaleString("ru-RU"); }
  function stat(v) { return Math.abs(v) < 1 && v !== 0 ? (v * 100).toFixed(2).replace(/\.?0+$/, "") + "%" : full(v); }
  function time(s) { var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + " д " : "") + (h ? h + " ч " : "") + (m ? m + " мин" : "") || "—"; }
  function res(name, n) { return '<div class="gc-res">' + (ICON[name] ? '<img src="' + G + ICON[name] + '" alt="">' : "") + "<span>" + name + "</span><b>" + fmt(n) + '</b><small>' + full(n) + "</small></div>"; }
  function add(acc, list, k) { (list || []).forEach(function (c) { acc[c[0]] = (acc[c[0]] || 0) + c[1] * (k || 1); }); }

  fetch("data/gear.json").then(function (r) { return r.json(); }).then(function (D) {
    var S = { q: "UR", slot: "Оружие", lf: 0, lt: 60, pf: 0, pt: 0, all: false };
    var QS = ["UR", "SSR", "SR", "R"], SLOTS = ["Оружие", "Броня", "Наручи", "Сапоги"];
    function item() { return D.items.filter(function (i) { return i.q === S.q && i.slot === S.slot; })[0]; }
    function opts(n, sel, lab) { var o = ""; for (var i = 0; i < n; i++) o += '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + (lab ? lab(i) : i) + "</option>"; return o; }
    function draw() {
      var it = item(); if (!it) return;
      var maxL = it.levels.length - 1, P = it.promotion, hasP = P.length > 0;
      S.lt = Math.min(S.lt, maxL); S.lf = Math.min(S.lf, S.lt);
      if (!hasP) { S.pf = S.pt = 0; } else { S.pt = Math.min(S.pt, P.length); S.pf = Math.min(S.pf, S.pt); }
      var plab = function (i) {
        if (i === 0) return "нет звёзд";
        var t = P[i - 1].to.split("."), st = Number(t[0]), sub = Number(t[1]);
        if (st === 5) return "5★ — вещь становится MR";
        return sub ? (st ? st + "★ + " : "") + "шаг " + sub + " из 4" + (st ? "" : " к 1★") : st + "★";
      };
      var llab = function (i) { return "ур. " + i; };
      var k = S.all ? 4 : 1, tot = {};
      for (var l = S.lf + 1; l <= S.lt; l++) add(tot, it.levels[l].cost, k);
      for (var p = S.pf + 1; p <= S.pt; p++) add(tot, P[p - 1].cost, k);
      var powA = it.levels[S.lf].power + (S.pf ? P[S.pf - 1].power : 0), powB = it.levels[S.lt].power + (S.pt ? P[S.pt - 1].power : 0);
      var sA = {}, sB = {};
      it.levels[S.lf].stats.forEach(function (x) { sA[x[0]] = (sA[x[0]] || 0) + x[1]; });
      it.levels[S.lt].stats.forEach(function (x) { sB[x[0]] = (sB[x[0]] || 0) + x[1]; });
      if (S.pf) P[S.pf - 1].stats.forEach(function (x) { sA[x[0]] = (sA[x[0]] || 0) + x[1]; });
      if (S.pt) P[S.pt - 1].stats.forEach(function (x) { sB[x[0]] = (sB[x[0]] || 0) + x[1]; });
      if (S.pf) (P[S.pf - 1].extra || []).forEach(function (x) { sA[x[0]] = (sA[x[0]] || 0) + x[1]; });
      if (S.pt) (P[S.pt - 1].extra || []).forEach(function (x) { sB[x[0]] = (sB[x[0]] || 0) + x[1]; });
      var names = Object.keys(sB);
      box.querySelector(".gc-body").innerHTML =
        '<div class="gc-item"><img src="' + G + "gear/" + it.icon + '.webp" alt=""><div><b>' + it.name + "</b><span>Создаётся в Мастерской снаряжения ур. " + (it.craft.building || "—") + " · " +
        it.craft.cost.map(function (c) { return fmt(c[1]) + " " + c[0]; }).join(" · ") + (it.craft.time ? " · " + time(it.craft.time) : "") + "</span></div></div>" +
        '<div class="gc-quick"><span>Быстро:</span><button type="button" data-q="max">С нуля до максимума</button><button type="button" data-q="lv">Только уровень 0 → ' + maxL + "</button>" + (hasP ? '<button type="button" data-q="star">Только звёзды до MR</button>' : "") + "</div>" +
        '<div class="gc-two"><div class="gc-sel"><div class="gc-step"><b>Уровень вещи</b><small>кнопка «Улучшить» в окне вещи · число уровня видно на иконке</small><span>сейчас <select data-k="lf">' + opts(maxL + 1, S.lf, llab) + '</select> хочу <select data-k="lt">' + opts(maxL + 1, S.lt, llab) + "</select></span></div>" +
        (hasP ? '<div class="gc-step"><b>Звёзды вещи</b><small>кнопка «Повысить» · без звёзд вещь не поднимется выше ур. 20, 30, 40 · 5★ превращает UR в MR</small><span>сейчас <select data-k="pf">' + opts(P.length + 1, S.pf, plab) + '</select> хочу <select data-k="pt">' + opts(P.length + 1, S.pt, plab) + "</select></span></div>" : "") +
        '<label class="gc-chk"><input type="checkbox" data-k="all"' + (S.all ? " checked" : "") + "> считать сразу на 4 вещи (меч, броню, наручи, сапоги)</label></div>" +
        '<div class="gc-out"><h4>Сколько ресурсов нужно ' + (S.all ? "на 4 вещи" : "на одну вещь") + "</h4>" + (Object.keys(tot).length ? '<div class="gc-ress">' + Object.keys(tot).map(function (n) { return res(n, tot[n]); }).join("") + "</div>" : '<p class="gc-mut">Ничего не нужно — выбери в поле «хочу» больше, чем в поле «сейчас».</p>') +
        '<div class="gc-pow"><span>Мощь вещи</span><b>' + full(powA) + " → " + full(powB) + '</b><em>+' + full((powB - powA) * k) + (S.all ? " на 4 вещи" : "") + "</em></div>" +
        '<table class="gc-st"><tr><th>Характеристика</th><th>Было</th><th>Станет</th></tr>' + names.map(function (n) { return "<tr><td>" + n + "</td><td>" + stat(sA[n] || 0) + "</td><td><b>" + stat(sB[n]) + "</b></td></tr>"; }).join("") + "</table></div>" +
        '</div><details class="gc-tbl"><summary>Таблица: цена и характеристики на каждом уровне</summary><div class="gc-lv"></div></details>';
      // таблица уровней — со страницами
      var lvBox = box.querySelector(".gc-lv"), page = 0, size = 15, rows = it.levels;
      var head = rows[0].stats.map(function (x) { return "<th>" + x[0] + "</th>"; }).join("");
      function lv() {
        var part = rows.slice(page * size, page * size + size), pages = Math.ceil(rows.length / size);
        lvBox.innerHTML = '<div class="gc-scroll"><table><tr><th>Ур.</th><th>Цена этого уровня</th>' + head + "<th>Мощь</th></tr>" + part.map(function (r) {
          return "<tr><td>" + r.lv + "</td><td>" + (r.cost.length ? r.cost.map(function (c) { return fmt(c[1]) + " " + c[0]; }).join(" · ") : "—") + "</td>" + r.stats.map(function (x) { return "<td>" + stat(x[1]) + "</td>"; }).join("") + "<td>" + full(r.power) + "</td></tr>";
        }).join("") + "</table></div>" + '<div class="gc-pg"><button type="button" data-d="-1"' + (page ? "" : " disabled") + '>‹ Назад</button><span>Уровни ' + (page * size) + "–" + Math.min(rows.length - 1, page * size + size - 1) + " из " + (rows.length - 1) + '</span><button type="button" data-d="1"' + (page < pages - 1 ? "" : " disabled") + ">Дальше ›</button></div>";
      }
      lvBox.onclick = function (e) { var b = e.target.closest("button[data-d]"); if (b) { page += Number(b.dataset.d); lv(); } };
      lv();
    }
    box.innerHTML = '<div class="gc-pills" data-g="q">' + QS.map(function (q) { return '<button type="button" data-v="' + q + '"' + (q === S.q ? ' class="on"' : "") + ">" + q + "</button>"; }).join("") + "</div>" +
      '<div class="gc-slots" data-g="slot"></div><div class="gc-body"></div>';
    function slots() {
      box.querySelector(".gc-slots").innerHTML = SLOTS.map(function (s) {
        var it = D.items.filter(function (i) { return i.q === S.q && i.slot === s; })[0];
        return it ? '<button type="button" data-v="' + s + '"' + (s === S.slot ? ' class="on"' : "") + '><img src="' + G + "gear/" + it.icon + '.webp" alt=""><span>' + it.name + "</span></button>" : "";
      }).join("");
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-g] button"); if (!b) return;
      var g = b.parentNode.dataset.g; S[g] = b.dataset.v;
      [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle("on", x === b); });
      if (g === "q") slots();
      draw();
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-q]"); if (!b) return;
      var it = item(), maxL = it.levels.length - 1, np = it.promotion.length;
      if (b.dataset.q === "max") { S.lf = 0; S.lt = maxL; S.pf = 0; S.pt = np; }
      if (b.dataset.q === "lv") { S.lf = 0; S.lt = maxL; S.pf = S.pt = 0; }
      if (b.dataset.q === "star") { S.lf = S.lt = 0; S.pf = 0; S.pt = np; }
      draw();
    });
    box.addEventListener("change", function (e) {
      var t = e.target; if (!t.dataset.k) return;
      S[t.dataset.k] = t.type === "checkbox" ? t.checked : Number(t.value);
      if (t.dataset.k === "lf" && S.lf > S.lt) S.lt = S.lf;
      if (t.dataset.k === "lt" && S.lt < S.lf) S.lf = S.lt;
      if (t.dataset.k === "pf" && S.pf > S.pt) S.pt = S.pf;
      if (t.dataset.k === "pt" && S.pt < S.pf) S.pf = S.pt;
      draw();
    });
    slots(); draw();
  });
})();

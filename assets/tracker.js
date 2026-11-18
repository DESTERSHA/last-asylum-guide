/* Страница «Сервер 397»: список альянсов, карточка альянса, карточка игрока. Данные — data/tracker/*.json (робот обновляет раз в 3 часа). */
(function () {
  "use strict";
  var D = "data/tracker/";
  var S = { server: null, index: {}, players: {}, al: {}, rows: [], board: {}, heroes: {} };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var get = function (p) { return fetch(D + p + "?t=" + Math.floor(Date.now() / 600000)).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); };
  var G = "assets/game/";

  /* ---------- форматирование ---------- */
  function num(n) {
    n = Number(n) || 0;
    var a = Math.abs(n), s = n < 0 ? "−" : "";
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return s + (a / 1e3).toFixed(1) + "K";
    return s + a;
  }
  function full(n) { return (Number(n) || 0).toLocaleString("ru-RU"); }
  function signed(n, f) { n = Number(n) || 0; return (n > 0 ? "+" : n < 0 ? "−" : "±") + (f || num)(Math.abs(n)); }
  function ago(t) {
    var s = Date.now() / 1000 - t;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " мин назад";
    if (s < 86400) return Math.round(s / 3600) + " ч назад";
    return Math.round(s / 86400) + " дн назад";
  }
  /* время сервера = UTC−2 */
  function srvDay(t) { return Math.floor((t - 2 * 3600) / 86400); }
  function hmMsk(t) { var d = new Date((t + 3 * 3600) * 1000); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  function both(t) { return hm(t) + " по серверу · " + hmMsk(t) + " МСК"; }
  function hm(t) { var d = new Date((t - 2 * 3600) * 1000); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  function dayLabel(t) {
    var diff = srvDay(Date.now() / 1000) - srvDay(t);
    if (diff <= 0) return "Сегодня";
    if (diff === 1) return "Вчера";
    var d = new Date((t - 2 * 3600) * 1000);
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + ", " + WD[d.getUTCDay()];
  }
  function isoLabel(iso) { var p = iso.split("-"); return Number(p[2]) + " " + MONTHS[Number(p[1]) - 1]; }
  /* «сегодня в 16:28 по серверу · 21:28 МСК» */
  function atLabel(t) {
    var diff = srvDay(Date.now() / 1000) - srvDay(t), d = new Date((t - 2 * 3600) * 1000);
    return (diff <= 0 ? "сегодня" : diff === 1 ? "вчера" : d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]) + " в " + both(t);
  }
  function dateOf(t) { var d = new Date((t - 2 * 3600) * 1000); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }

  /* ---------- кирпичики ---------- */
  function pills(id, items, active) {
    return '<div class="ap-pills" id="' + id + '">' + items.map(function (n) { return '<button type="button" data-v="' + n[0] + '"' + (n[0] === active ? ' class="on"' : "") + ">" + n[1] + "</button>"; }).join("") + "</div>";
  }
  function bindPills(id, cb) {
    var el = $(id); if (!el) return;
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !el.contains(b)) return;
      [].forEach.call(el.children, function (x) { x.classList.toggle("on", x === b); });
      cb(b.dataset.v);
    });
  }
  function cell(label, value, sub, cls) {
    return '<div class="ap-cell' + (cls ? " " + cls : "") + '"><span class="l">' + label + '</span><b>' + value + "</b>" + (sub ? '<span class="s">' + sub + "</span>" : "") + "</div>";
  }
  function kv(label, value) { return '<div class="ap-kv"><span>' + label + "</span><b>" + value + "</b></div>"; }
  function rankBadge(r) { var k = (r || "").slice(0, 2); return '<span class="ap-rk r' + esc(k.slice(1)) + '">' + esc(r || "—") + "</span>"; }
  function delta(n, f) { if (n == null || isNaN(n)) return '<span class="mut">—</span>'; return '<span class="' + (n > 0 ? "up" : n < 0 ? "dn" : "mut") + '">' + signed(n, f) + "</span>"; }

  /* список со страницами: renderPage(items) → html */
  function paged(el, items, size, render, empty) {
    var page = 0, pages = Math.max(1, Math.ceil(items.length / size));
    var draw = function () {
      var from = page * size, part = items.slice(from, from + size);
      el.innerHTML = (items.length ? render(part, from) : '<p class="ap-empty">' + (empty || "Пусто.") + "</p>") +
        (items.length > size ? '<div class="ap-pager"><span>' + (from + 1) + "–" + Math.min(items.length, from + size) + " из " + items.length + '</span><span class="sp"></span><button type="button" data-d="-1"' + (page ? "" : " disabled") + '>‹ Назад</button><span class="pg">Страница ' + (page + 1) + " из " + pages + '</span><button type="button" data-d="1"' + (page < pages - 1 ? "" : " disabled") + ">Дальше ›</button></div>" : "");
      /* ширина таблицы: сумма заданных колонок + место под имя — на телефоне таблица листается вбок, имя не пропадает */
      [].forEach.call(el.querySelectorAll("table.ap-t"), function (t) {
        var w = 0; [].forEach.call(t.querySelectorAll("col"), function (c) { w += parseInt(c.style.width, 10) || 0; });
        t.style.minWidth = (w + 190) + "px";
      });
    };
    el.onclick = function (e) {
      var b = e.target.closest(".ap-pager button"); if (!b) return;
      page = Math.min(pages - 1, Math.max(0, page + Number(b.dataset.d))); draw();
      var top = el.getBoundingClientRect().top + window.scrollY - 90; if (window.scrollY > top) window.scrollTo({ top: top });
    };
    draw();
  }

  /* ---------- интерактивный график ---------- */
  function ddmm(t) { var d = new Date((t - 2 * 3600) * 1000); return ["", ("0" + (d.getUTCMonth() + 1)).slice(-2), ("0" + d.getUTCDate()).slice(-2)]; }
  function chartBox(id) { return '<div class="ap-chart" id="' + id + '"></div>'; }
  function drawChart(id, pts, opt) {
    var box = $(id); if (!box) return;
    opt = opt || {};
    var fmt = opt.fmt || num, title = opt.title || "";
    if (pts.length < 2) {
      box.innerHTML = '<div class="ap-ch-h"><div><span class="l">' + title + "</span><b>" + (pts.length ? fmt(pts[0][1]) : "—") + '</b></div></div><p class="ap-empty">График появится, когда наберётся хотя бы два дня.</p>';
      return;
    }
    var first = pts[0][1], last = pts[pts.length - 1][1], ts = typeof pts[0][0] === "number";
    var span = ts ? Math.max(1, Math.round((pts[pts.length - 1][0] - pts[0][0]) / 86400)) : pts.length;
    box.innerHTML = '<div class="ap-ch-h"><div><span class="l">' + title + '</span><b class="cur">' + fmt(last) + '</b><span class="chg">' + delta(last - first, fmt) + " за " + span + " дн.</span></div>" + (opt.right || "") + '</div><div class="ap-ch-body"><svg></svg><div class="ap-tip"></div></div>';
    var body = box.querySelector(".ap-ch-body"), svg = box.querySelector("svg"), tip = box.querySelector(".ap-tip");
    var W = Math.max(280, body.clientWidth), H = opt.h || 240, L = 54, R = 14, T = 14, B = 28;
    var v = pts.map(function (p) { return p[1]; }), mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    var pad = (mx - mn) * 0.12 || Math.max(1, mx * 0.02); mn -= pad; mx += pad;
    if (opt.zero && mn < 0) mn = 0;
    var x = function (i) { return L + i * (W - L - R) / (pts.length - 1); }, y = function (n) { return T + (mx - n) * (H - T - B) / (mx - mn); };
    var NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
    var g = "";
    for (var k = 0; k <= 3; k++) { var val = mn + (mx - mn) * k / 3; g += '<line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(val).toFixed(1) + '" y2="' + y(val).toFixed(1) + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y(val) + 4).toFixed(1) + '" text-anchor="end">' + fmt(val) + "</text>"; }
    var nx = Math.min(pts.length, Math.max(2, Math.floor((W - L - R) / 90)));
    for (var j = 0; j < nx; j++) { var i = Math.round(j * (pts.length - 1) / (nx - 1)), d = ts ? ddmm(pts[i][0]) : pts[i][0].split("-"); g += '<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (j === 0 ? "start" : j === nx - 1 ? "end" : "middle") + '">' + d[2] + "." + d[1] + "</text>"; }
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
    var gid = "gr" + id;
    svg.innerHTML = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ap-acc)" stop-opacity=".22"/><stop offset="1" stop-color="var(--ap-acc)" stop-opacity="0"/></linearGradient></defs>' + g +
      '<path d="' + line + " L" + x(pts.length - 1).toFixed(1) + " " + (H - B) + " L" + L + " " + (H - B) + 'Z" fill="url(#' + gid + ')"/><path class="ln" d="' + line + '"/>' +
      '<line class="vl" y1="' + T + '" y2="' + (H - B) + '" x1="-9" x2="-9"/><circle class="dot" r="5" cx="-9" cy="-9"/><rect class="hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '"/>';
    var vl = svg.querySelector(".vl"), dot = svg.querySelector(".dot");
    var show = function (i) {
      var p = pts[i], px = x(i), py = y(p[1]);
      vl.setAttribute("x1", px); vl.setAttribute("x2", px); dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      var prev = i ? p[1] - pts[i - 1][1] : null;
      tip.innerHTML = "<span>" + (ts ? dayLabel(p[0]) + ", " + hm(p[0]) : isoLabel(p[0])) + "</span><b>" + (opt.fullFmt || full)(p[1]) + "</b>" + (prev != null ? "<em>" + delta(prev, fmt) + (ts ? " к прошлой записи" : " за день") + "</em>" : "") + (opt.extra ? opt.extra(p) : "");
      tip.style.display = "block";
      var tw = tip.offsetWidth, left = px + 14; if (left + tw > W) left = px - tw - 14;
      tip.style.left = left + "px"; tip.style.top = Math.max(0, Math.min(H - tip.offsetHeight, py - tip.offsetHeight / 2)) + "px";
    };
    var move = function (e) {
      var r = svg.getBoundingClientRect(), mxp = (e.clientX - r.left) * W / r.width;
      show(Math.max(0, Math.min(pts.length - 1, Math.round((mxp - L) / ((W - L - R) / (pts.length - 1))))));
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", function () { tip.style.display = "none"; vl.setAttribute("x1", -9); vl.setAttribute("x2", -9); dot.setAttribute("cx", -9); });
    void NS;
  }

  /* ---------- график «Рост»: 1/7/30 дней, мощь + убийства + вторая величина ---------- */
  function whenTxt(t) { var d = new Date((t - 2 * 3600) * 1000); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()].slice(0, 4) + ".", ", " + hm(t); }
  function whenFull(t) { var d = new Date((t - 2 * 3600) * 1000); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()].slice(0, 4) + "., " + hm(t) + " (МСК " + hmMsk(t) + ")"; }
  function drawTrend(boxId, all, cfg) {
    var box = $(boxId); if (!box) return;
    var days = cfg.days || 7;
    var last = all[all.length - 1].t;
    var pts = all.filter(function (p) { return p.t >= last - days * 86400; });
    var DAYW = function (n) { return n === 1 ? "1 день" : n + " дней"; };
    var head = '<div class="ap-tr-top"><b class="ttl">Рост</b>' + pills(boxId + "-rng", [["1", "1 д."], ["7", "7 д."], ["30", "30 д."]], String(days)) + "</div>";
    if (pts.length < 2) { box.innerHTML = head + '<p class="ap-empty">За ' + DAYW(days) + " записей меньше двух — выберите период больше.</p>"; bindPills(boxId + "-rng", function (v) { cfg.days = Number(v); drawTrend(boxId, all, cfg); }); return; }
    var f = pts[0], l = pts[pts.length - 1], hasK = pts.some(function (p) { return p.k != null; }), hasS = pts.some(function (p) { return p.s != null; });
    box.innerHTML = head + '<div class="ap-tr-h"><span class="l">' + cfg.aName.toUpperCase() + " · " + DAYW(days).toUpperCase() + '</span><b class="cur">' + num(l.a) + "</b>" +
      '<span class="g ' + (l.a - f.a >= 0 ? "up" : "dn") + '">' + signed(l.a - f.a) + " за " + DAYW(days) + "</span>" +
      (hasK && cfg.kGain ? '<span class="g kc">' + signed((l.k || 0) - (f.k || 0)) + " " + cfg.kGain + " за " + DAYW(days) + "</span>" : "") + '<div class="chips"></div>' +
      '<div class="lg"><span class="a">' + cfg.aName + "</span>" + (hasK ? '<span class="k">' + cfg.kName + "</span>" : "") + (hasS ? '<span class="s">' + cfg.sName + "</span>" : "") + "</div></div>" +
      '<div class="ap-ch-body"><svg></svg></div><div class="ap-tr-rng">' + whenFull(f.t) + " → " + whenFull(l.t) + "</div>";
    bindPills(boxId + "-rng", function (v) { cfg.days = Number(v); drawTrend(boxId, all, cfg); });
    var body = box.querySelector(".ap-ch-body"), svg = box.querySelector("svg"), chips = box.querySelector(".chips");
    var W = Math.max(300, body.clientWidth), H = 230, L = 70, R = hasS ? 44 : 14, T = 12, B = 14;
    var t0 = f.t, t1 = l.t, X = function (t) { return L + (t - t0) * (W - L - R) / Math.max(1, t1 - t0); };
    var rng = function (key) { var v = pts.map(function (p) { return p[key]; }).filter(function (x) { return x != null; }); var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v); if (mx === mn) { mx += 1; mn -= 1; } return [mn, mx]; };
    var ra = rng("a"), rk = hasK ? rng("k") : null, rs = hasS ? rng("s") : null;
    var Y = function (v, r) { return T + (r[1] - v) * (H - T - B) / (r[1] - r[0]); };
    var path = function (key, r, step) {
      var out = "", prev = null;
      pts.forEach(function (p) { if (p[key] == null) return; var x = X(p.t), y = Y(p[key], r); if (prev === null) out += "M" + x.toFixed(1) + " " + y.toFixed(1); else { if (step) out += " L" + x.toFixed(1) + " " + prev.toFixed(1); out += " L" + x.toFixed(1) + " " + y.toFixed(1); } prev = y; });
      return out;
    };
    var la = path("a", ra), gid = "tg" + boxId;
    var g = '<line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + T + '" y2="' + T + '"/><line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + (H - T - B) / 2) + '" y2="' + (T + (H - T - B) / 2) + '"/><line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    g += '<text class="axa" x="' + (L - 8) + '" y="' + (T + 4) + '" text-anchor="end">' + num(ra[1]) + '</text><text class="axa" x="' + (L - 8) + '" y="' + (H - B + 4) + '" text-anchor="end">' + num(ra[0]) + "</text>";
    if (rk) g += '<text class="axk" x="' + (L - 8) + '" y="' + (T + 20) + '" text-anchor="end">' + num(rk[1]) + '</text><text class="axk" x="' + (L - 8) + '" y="' + (H - B - 12) + '" text-anchor="end">' + num(rk[0]) + "</text>";
    if (rs) g += '<text class="axs" x="' + (W - R + 8) + '" y="' + (T + 4) + '">' + rs[1] + '</text><text class="axs" x="' + (W - R + 8) + '" y="' + (H - B + 4) + '">' + rs[0] + "</text>";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.innerHTML = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7fd6" stop-opacity=".2"/><stop offset="1" stop-color="#2f7fd6" stop-opacity=".04"/></linearGradient></defs>' + g +
      '<path d="' + la + " L" + X(t1).toFixed(1) + " " + (H - B) + " L" + X(t0).toFixed(1) + " " + (H - B) + 'Z" fill="url(#' + gid + ')"/>' +
      (hasS ? '<path class="ls" d="' + path("s", rs, true) + '"/>' : "") + (hasK ? '<path class="lk" d="' + path("k", rk) + '"/>' : "") + '<path class="la" d="' + la + '"/>' +
      '<line class="vl" y1="' + T + '" y2="' + (H - B) + '" x1="-9" x2="-9"/><circle class="da" r="5" cx="-9" cy="-9"/>' + (hasK ? '<circle class="dk" r="4.5" cx="-9" cy="-9"/>' : "") + (hasS ? '<circle class="ds" r="5" cx="-9" cy="-9"/>' : "") +
      '<rect class="hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '"/>';
    var set = function (sel, x, y) { var c = svg.querySelector(sel); if (c) { c.setAttribute("cx", x); c.setAttribute("cy", y); } };
    var show = function (i) {
      var p = pts[i], x = X(p.t), prev = i ? pts[i - 1] : null, vl = svg.querySelector(".vl");
      vl.setAttribute("x1", x); vl.setAttribute("x2", x);
      set(".da", x, Y(p.a, ra)); if (hasK && p.k != null) set(".dk", x, Y(p.k, rk)); if (hasS && p.s != null) set(".ds", x, Y(p.s, rs));
      chips.innerHTML = "<span>" + whenFull(p.t) + "</span>" + (prev ? '<span class="' + (p.a - prev.a >= 0 ? "up" : "dn") + '">' + signed(p.a - prev.a) + " к предыдущему</span>" : "") +
        (p.k != null ? '<span class="kc">' + cfg.kName + " " + num(p.k) + "</span>" : "") + (p.s != null ? "<span>" + cfg.sFmt(p.s) + "</span>" : "");
    };
    var move = function (e) {
      var r = svg.getBoundingClientRect(), tx = t0 + ((e.clientX - r.left) * W / r.width - L) * (t1 - t0) / (W - L - R), bi = 0, bd = Infinity;
      pts.forEach(function (p, i) { var dd = Math.abs(p.t - tx); if (dd < bd) { bd = dd; bi = i; } });
      show(bi);
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
    show(pts.length - 1);
  }

  /* ---------- главная ---------- */
  function wk(ix) { /* изменение мощи альянса за 7 дней по истории */
    var h = ix.hist || {}, ds = Object.keys(h).sort();
    if (ds.length < 2) return null;
    var lastD = ds[ds.length - 1], base = ds.filter(function (d) { return d <= shift(lastD, -7); }).pop() || ds[0];
    return (h[lastD].power || 0) - (h[base].power || 0);
  }
  function shift(iso, days) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

  function homeView() {
    var s = S.server.server, rows = S.rows;
    var pulled = Math.max.apply(null, (S.server.boards || []).map(function (b) { return b.pulled_at || 0; }).concat([0]));
    $("view").innerHTML =
      '<div class="ap-wrap">' +
      '<div class="ap-card"><div class="ap-h"><div><h3>Сервер 397</h3><p>проверено ' + ago(S.server.updated) + " · робот спрашивает трекер раз в 30 минут" + (pulled ? " · рейтинги трекер обновляет раз в сутки, последние — " + atLabel(pulled) : "") + "</p></div></div>" +
      '<div class="ap-cells c5">' + cell("Игроков", full(s.players), (s.age_days || "—") + " дней серверу") + cell("Альянсов", full(s.alliances)) + cell("Общая мощь", num(s.power)) +
      cell("Король", esc(s.king_name || "—"), s.union_abbr ? "[" + esc(s.union_abbr) + "] " + esc(s.union_name) : "", "gold") + cell("Альянсов со свежим составом", Object.keys(S.al).filter(function (k) { return S.al[k].members.length; }).length + " из 30", "у остальных — состав по карте за 3 дня, без рангов") + "</div></div>" +
      '<div class="ap-card"><div class="ap-h"><div><h3>Поиск</h3><p>игроки альянсов топ-30 и альянсы топ-100</p></div>' + pills("skind", [["p", "Игроки"], ["a", "Альянсы"]], "p") + '</div><input id="sq" class="ap-in" type="search" placeholder="Ник игрока или тег альянса…" autocomplete="off"><div id="sres"></div></div>' +
      '<div class="ap-sec"><h3>Альянсы</h3>' + pills("atop", [["30", "Топ-30"], ["100", "Места 31–100"]], "30") + "</div>" +
      '<div class="ap-card flush"><div id="alist"></div></div>' +
      '<div class="ap-sec"><h3>Топ-100 игроков</h3>' + pills("ptop", [["power", "Мощь"], ["kills", "Убийства"], ["heroes", "Мощь героев"], ["castle", "Святилище"]], "power") + "</div>" +
      '<div class="ap-card flush"><div id="plist"></div></div></div>';

    var alRows = function (v) {
      var list = v === "30" ? rows.slice(0, 30) : rows.slice(30);
      paged($("alist"), list, 15, function (part) {
        return '<table class="ap-t"><colgroup><col style="width:56px"><col><col style="width:150px"><col style="width:120px"><col style="width:110px"></colgroup><thead><tr><th>#</th><th>Альянс</th><th>Участники</th><th class="r">Мощь</th><th class="r">За 7 дней</th></tr></thead><tbody>' +
          part.map(function (r) {
            var a = S.al[r.id], ix = S.index[r.id] || {}, cnt = a && a.members.length, cap = (a && a.capacity) || 100;
            return "<tr" + (a ? ' class="go" data-a="' + r.id + '"' : "") + '><td class="n">' + r.rank + '</td><td><div class="ap-who"><img src="' + G + 'alliance.png" alt=""><div><b><span class="tag">[' + esc(r.abbr) + "]</span> " + esc(r.name) + "</b><span>" + (ix.leader ? "лидер " + esc(ix.leader) : v === "30" ? "" : "вне топ-30 — без карточки") + "</span></div></div></td>" +
              "<td>" + (cnt ? '<div class="ap-bar"><span>' + cnt + "/" + cap + '</span><i><u style="width:' + Math.min(100, cnt / cap * 100) + '%"></u></i></div>' : '<span class="mut">' + (a ? "обновляется" : "—") + "</span>") + "</td>" +
              '<td class="r strong">' + num(r.score) + '</td><td class="r">' + delta(wk(ix)) + "</td></tr>";
          }).join("") + "</tbody></table>";
      });
    };
    alRows("30"); bindPills("atop", alRows);

    var NAMES = { power: "Мощь", kills: "Убийства", heroes: "Мощь героев", castle: "Святилище" };
    var renderTop = function (slug) {
      var b = S.server.boards.filter(function (x) { return x.slug === slug; })[0];
      paged($("plist"), b.rows, 20, function (part) {
        return '<table class="ap-t"><colgroup><col style="width:56px"><col><col style="width:150px"><col style="width:130px"></colgroup><thead><tr><th>#</th><th>Игрок</th><th>Альянс</th><th class="r">' + NAMES[slug] + "</th></tr></thead><tbody>" +
          part.map(function (r) {
            var known = S.players[r.id];
            return "<tr" + (known ? ' class="go" data-p="' + r.id + '"' : "") + '><td class="n">' + r.rank + '</td><td><div class="ap-who"><img class="av" src="' + G + 'doctor.png" alt=""><div><b>' + esc(r.name) + "</b>" + (known ? "<span>Святилище " + (known.lv || "—") + "</span>" : "") + "</div></div></td><td>" + (r.abbr ? '<span class="tag">[' + esc(r.abbr) + "]</span>" : '<span class="mut">без альянса</span>') + '</td><td class="r strong">' + (slug === "castle" ? r.score : num(r.score)) + "</td></tr>";
          }).join("") + "</tbody></table>";
      });
    };
    renderTop("power"); bindPills("ptop", renderTop);
    $("sq").addEventListener("input", search);
    bindPills("skind", search);
  }

  /* ---------- вступления и выходы ---------- */
  /* «Кто вступил и вышел, куда ушёл» — платная функция: на сайте показываем ДЕМО на вымышленных игроках */
  function demoMoves() {
    var nicks = ["Player1", "Player2", "Player3", "Player4", "Player5", "Player6", "Player7", "Player8", "Player9", "Player10"];
    var tags = ["ABC", "XYZ", "", "QWE", "", "ABC"];
    var now = Date.now() / 1000, out = [];
    for (var i = 0; i < 14; i++) {
      var join = i % 3 !== 1;
      out.push({ t: now - i * 4300 - (i > 6 ? 86400 : 0), kind: join ? "join" : "leave", nick: nicks[i % nicks.length], power: 3e6 + ((i * 7919) % 40) * 6e5,
        from: join ? tags[i % tags.length] : "", now: join ? "" : tags[(i + 2) % tags.length] });
    }
    return out;
  }
  var tagH = function (s) { return '<span class="tag">[' + esc(s) + "]</span>"; };
  /* list: [{t, kind, nick, power, from, now, al}] ; f.uid — лента одного игрока (тогда пишем, в какой альянс он вступил / из какого вышел) */
  function moveRows(list, note, f) {
    var out = note, last = "";
    list.forEach(function (e) {
      var dl = dayLabel(e.t);
      if (dl !== last) { out += '<div class="ap-day">' + dl + "</div>"; last = dl; }
      var join = e.kind === "join", where;
      if (f && f.uid && e.al) where = join ? "в " + tagH(e.al) + (e.from ? ", пришёл из " + tagH(e.from) : ", до этого без альянса") : "из " + tagH(e.al) + (e.now ? ", ушёл в " + tagH(e.now) : ", теперь без альянса");
      else where = join ? (e.from ? "пришёл из " + tagH(e.from) : "до этого без альянса") : (e.now ? "ушёл в " + tagH(e.now) : "теперь без альянса");
      var who = e.uid && !(f && f.uid) ? '<a href="#p=' + e.uid + '"><b>' + esc(e.nick) + "</b></a>" : "<b>" + esc(e.nick) + "</b>";
      out += '<div class="ap-mv"><div class="ap-who"><img class="av" src="' + G + 'doctor.png" alt=""><div>' + who + "<span>мощь " + num(e.power) + '</span></div></div>' +
        '<div class="ap-mv-r"><span class="ap-bd ' + (join ? "in" : "out") + '">' + (join ? "Вступил" : "Вышел") + '</span><span class="wh">' + where + '</span><span class="tm">' + both(e.t) + "</span></div></div>";
    });
    return '<div class="ap-list">' + out + "</div>";
  }
  /* настоящие данные — только подписчикам (база отдаёт их только при действующей подписке), остальным — демо */
  var mvCur = null, mvHooked = false;
  function moveList(el, f) {
    mvCur = { el: el, f: f || {} };
    if (!mvHooked && window.LAAuth) { mvHooked = true; LAAuth.on(drawMoves); } else drawMoves();
  }
  function drawMoves() {
    var c = mvCur, A = window.LAAuth;
    if (!c || !document.body.contains(c.el)) return;
    var paid = A && A.ready && A.state.user && (A.hasSub() || A.state.admin);
    if (!paid) {
      c.el.innerHTML = moveRows(demoMoves(), '<div class="ap-demo"><b>Демо-версия</b><span>Так выглядит платная функция «Кто вступил, кто вышел и куда ушёл». Игроки и альянсы здесь вымышленные — для примера. ' +
        '<a href="cabinet.html">' + (A && A.state && A.state.user ? "Как оформить подписку" : "Войти или зарегистрироваться") + "</a></span></div>", null);
      return;
    }
    c.el.innerHTML = '<p class="ap-empty">Загружаю…</p>';
    var q = A.client.from("moves").select("t,kind,uid,nick,power,from_abbr,now_abbr,al_abbr").order("t", { ascending: false }).limit(2000);
    q = c.f.uid ? q.eq("uid", c.f.uid) : q.eq("al_id", c.f.al);
    q.then(function (r) {
      if (mvCur !== c) return;
      if (r.error) { c.el.innerHTML = '<p class="ap-empty">Не удалось загрузить данные: ' + esc(r.error.message) + "</p>"; return; }
      var list = (r.data || []).map(function (x) { return { t: x.t, kind: x.kind, uid: x.uid, nick: x.nick, power: x.power, from: x.from_abbr, now: x.now_abbr, al: x.al_abbr }; });
      var note = '<div class="ap-demo"><b>Настоящие данные · подписка</b><span>Вступления и выходы по альянсам топ-30 с 27 октября 2026. Обновляются раз в 30 минут. Время — когда трекер заметил переход, поэтому у нескольких игроков оно может совпадать.</span></div>';
      c.el.innerHTML = list.length ? moveRows(list, note, c.f) : note + '<p class="ap-empty">' + (c.f.uid ? "Этот игрок за это время не менял альянс среди топ-30." : "Пока никто не вступал и не выходил.") + "</p>";
    });
  }

  /* ---------- карточка альянса ---------- */
  function allianceView(id) {
    var a = S.al[id], ix = S.index[id] || {}, r = S.rows.filter(function (x) { return String(x.id) === String(id); })[0] || {};
    if (!a) { $("view").innerHTML = '<div class="ap-wrap"><div class="ap-card"><p class="ap-empty">Этого альянса нет в топ-30.</p></div></div>'; return; }
    var cnt = a.members.length, cap = a.capacity || 100, now = Date.now() / 1000;
    var sm = a.summary || {}, w7 = sm.week, m30 = sm.month;
    if (!w7) { var ev7 = (a.events || []).filter(function (e) { return e.t >= now - 7 * 86400; }), j7 = ev7.filter(function (e) { return e.kind === "join"; }).length; w7 = { joined: j7, left: ev7.length - j7 }; }
    var lead = a.members.filter(function (m) { return (m.rank || "").slice(0, 2) === "R5"; })[0];
    $("view").innerHTML = '<div class="ap-wrap">' +
      '<div class="ap-card"><div class="ap-top"><a class="ap-back" href="#">‹ Все альянсы</a><span class="ap-upd">цифры участников от ' + atLabel(a.fresh_t || a.roster_t || a.updated) + " · проверено " + ago(a.updated) + "</span></div>" +
      '<div class="ap-hero"><img class="emb" src="' + G + 'alliance.png" alt=""><div><h2><span class="tag">[' + esc(a.abbr) + "]</span> " + esc(a.name) + '</h2><div class="ap-chips"><span>Сервер 397</span><span>место ' + (r.rank || "—") + " по мощи</span>" + (a.language ? "<span>язык: " + esc(a.language) + "</span>" : "") + (a.live ? "" : '<span class="warn">состав ещё не обновлялся</span>') + "</div></div></div>" +
      '<div class="ap-cells c5">' + cell("Мощь", num(r.score || a.power), delta(wk(ix)) + " за 7 дней") +
      cell("Участники", cnt ? cnt + '<small>/' + cap + "</small>" : "—", cnt ? '<i class="ap-mini"><u style="width:' + Math.min(100, cnt / cap * 100) + '%"></u></i>' : "") +
      cell("Лидер", esc(a.leader || "—"), lead ? "мощь " + num(lead.power) : "", "", lead ? lead.uid : null) +
      cell("Уровень альянса", a.level || "—") +
      cell("За 7 дней", '<span class="up">+' + w7.joined + '</span> <span class="dn">−' + w7.left + "</span>", m30 ? "за 30 дней: +" + m30.joined + " −" + m30.left : "вступили / вышли") + "</div></div>" +
      pills("atabs", [["m", "Участники · " + (cnt || "—")], ["h", "История"], ["e", "Вступления и выходы"]], "m") +
      '<div id="apane"></div></div>';
    if (window.LAFav) LAFav.star($("view").querySelector(".ap-top"), { url: "server.html#a=" + id, title: "[" + a.abbr + "] " + a.name, page: "Сервер 397", kind: "Альянс", icon: G + "alliance.png" }).classList.add("mini");
    if (lead) { var lc = $("view").querySelectorAll(".ap-cell")[2]; lc.classList.add("go"); lc.dataset.p = lead.uid; }

    var pane = function (v) {
      var P = $("apane");
      if (v === "m") {
        if (!cnt) { P.innerHTML = '<div class="ap-card"><p class="ap-empty">Свежего состава этого альянса пока нет — старую копию с ушедшими игроками и устаревшими цифрами не показываем. Состав появится с одним из ближайших обновлений.</p></div>'; return; }
        var order = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4 };
        var rk = function (m) { var k = (m.rank || "").slice(0, 2); return k in order ? order[k] : 9; };
        var by = {}; a.members.forEach(function (m) { var k = (m.rank || "").slice(0, 2); by[k] = (by[k] || 0) + 1; });
        var tot = a.members.reduce(function (s, m) { return s + (m.power || 0); }, 0);
        var hasRanks = a.members.some(function (m) { return m.rank; });
        var rosterNote = a.roster === "map" ? '<div class="ap-demo"><b>Состав по карте</b><span>Игроки с тегом альянса, которых видели на карте за последние 3 дня (последний раз — ' + ago(a.roster_t) + '). Ушедшие сюда не попадают. Ранги в таких данных не видны.</span></div>'
          : ((a.fresh_t || a.roster_t) && Date.now() / 1000 - (a.fresh_t || a.roster_t) > 3 * 86400 ? '<div class="ap-demo"><b>Состав от ' + ago(a.fresh_t || a.roster_t) + '</b><span>Свежее данных по этому альянсу пока нет.</span></div>' : "");
        P.innerHTML = rosterNote + (hasRanks ? '<div class="ap-card"><div class="ap-h"><div><h3>Ранги</h3><p>нажми ранг — в списке останутся только его участники</p></div></div><div class="ap-ranks">' +
          ["R5", "R4", "R3", "R2", "R1"].map(function (k) { return '<button type="button" class="ap-rt r' + k.slice(1) + '" data-r="' + k + '"><span class="l">' + k + "</span><b>" + (by[k] || 0) + '</b><span class="s">' + (k === "R5" ? "лидер" : k === "R4" ? "офицеры" : "участники") + "</span></button>"; }).join("") +
          '</div><div class="ap-kvs">' + kv("Средняя мощь участника", num(tot / cnt)) + kv("Святилище 25+", a.members.filter(function (m) { return m.lv >= 25; }).length + " чел.") + kv("Сильнейший", esc(a.members.slice().sort(function (x, y) { return y.power - x.power; })[0].nick)) + "</div></div>" : "") +
          '<div class="ap-card flush"><div class="ap-tools"><input id="mq" class="ap-in" type="search" placeholder="Ник участника…"><span id="mcount" class="mut"></span></div><div id="mlist"></div></div>';
        var st = { sort: "rank", dir: 1, rank: "", q: "" };
        var COLS = [["nick", "Игрок"], ["rank", "Ранг"], ["lv", "Святилище"], ["power", "Мощь"], ["kills", "Убийства"], ["active", "Недельная активность"], ["honor", "Честь за день"], ["tech", "Пожертвовано технологий"]];
        var draw = function () {
          var list = a.members.filter(function (m) { return (!st.rank || (m.rank || "").slice(0, 2) === st.rank) && (!st.q || (m.nick || "").toLowerCase().indexOf(st.q) >= 0); });
          list.sort(function (x, y) {
            var d;
            if (st.sort === "rank") d = (rk(x) - rk(y)) || (y.power - x.power);
            else if (st.sort === "nick") d = String(x.nick).localeCompare(String(y.nick));
            else d = (Number(y[st.sort]) || 0) - (Number(x[st.sort]) || 0);
            return d * st.dir;
          });
          $("mcount").textContent = list.length === cnt ? cnt + " участников" : list.length + " из " + cnt;
          paged($("mlist"), list, 20, function (part, from) {
            return '<table class="ap-t"><colgroup><col style="width:46px"><col><col style="width:80px"><col style="width:96px"><col style="width:100px"><col style="width:100px"><col style="width:104px"><col style="width:120px"><col style="width:130px"></colgroup><thead><tr><th>#</th>' +
              COLS.map(function (c) { return '<th class="s' + (c[0] !== "nick" && c[0] !== "rank" ? " r" : "") + (st.sort === c[0] ? " on" : "") + '" data-s="' + c[0] + '">' + c[1] + (st.sort === c[0] ? (st.dir > 0 ? " ↓" : " ↑") : "") + "</th>"; }).join("") + "</tr></thead><tbody>" +
              part.map(function (m, i) {
                return '<tr class="go" data-p="' + m.uid + '"><td class="n">' + (from + i + 1) + '</td><td><div class="ap-who"><img class="av" src="' + G + 'doctor.png" alt=""><div><b>' + esc(m.nick) + "</b></div></div></td><td>" + rankBadge(m.rank) + '</td><td class="r">' + (m.lv || "—") + '</td><td class="r strong">' + num(m.power) + '</td><td class="r">' + num(m.kills) + '</td><td class="r">' + (m.active != null ? full(m.active) : "—") + '</td><td class="r">' + (m.honor != null ? full(m.honor) : "—") + '</td><td class="r">' + (m.tech != null ? full(m.tech) : "—") + "</td></tr>";
              }).join("") + "</tbody></table>";
          }, "Никого не нашли.");
        };
        $("mlist").addEventListener("click", function (e) {
          var th = e.target.closest("th[data-s]"); if (!th) return;
          var k = th.dataset.s; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = 1; } draw();
        });
        if (P.querySelector(".ap-ranks")) P.querySelector(".ap-ranks").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          st.rank = st.rank === b.dataset.r ? "" : b.dataset.r;
          [].forEach.call(this.children, function (x) { x.classList.toggle("on", x.dataset.r === st.rank); });
          this.classList.toggle("pick", !!st.rank); draw();
        });
        $("mq").addEventListener("input", function () { st.q = this.value.trim().toLowerCase(); draw(); });
        draw();
      } else if (v === "h") {
        var h = ix.hist || {}, pw = {};
        Object.keys(h).forEach(function (d) { if (h[d].power) pw[d] = h[d].power; });
        Object.keys(ix.days || {}).forEach(function (d) { if (ix.days[d]) pw[d] = ix.days[d]; });
        var ds = Object.keys(pw).sort();
        P.innerHTML = '<div class="ap-card"><div id="ach"></div></div><div class="ap-sec"><h3>По дням</h3></div><div class="ap-card flush"><div id="hlist"></div></div>';
        var apts = ds.map(function (d) { return { t: Date.parse(d + "T14:00:00Z") / 1000, a: pw[d], s: h[d] && h[d].members ? h[d].members : null }; });
        if (apts.length >= 2) drawTrend("ach", apts, { aName: "Мощь альянса", sName: "Участники", sFmt: function (v) { return v + " участников"; }, days: 30 });
        else $("ach").innerHTML = '<p class="ap-empty">График появится, когда наберётся хотя бы два дня.</p>';
        var days = Object.keys(h).sort().reverse();
        paged($("hlist"), days, 15, function (part) {
          return '<table class="ap-t"><colgroup><col><col style="width:140px"><col style="width:120px"><col style="width:120px"><col style="width:110px"><col style="width:110px"></colgroup><thead><tr><th>День</th><th class="r">Мощь</th><th class="r">За день</th><th class="r">Участников</th><th class="r">Вступили</th><th class="r">Вышли</th></tr></thead><tbody>' +
            part.map(function (d) {
              var x = h[d], prev = h[shift(d, -1)];
              return "<tr><td>" + isoLabel(d) + '</td><td class="r strong">' + num(x.power) + '</td><td class="r">' + (prev ? delta(x.power - prev.power) : '<span class="mut">—</span>') + '</td><td class="r">' + (x.members || "—") + '</td><td class="r up">+' + (x.joined || 0) + '</td><td class="r dn">−' + (x.left || 0) + "</td></tr>";
            }).join("") + "</tbody></table>";
        });
      } else {
        P.innerHTML = '<div class="ap-card"><div class="ap-cells c4">' + cell("Вступили за 7 дней", '<span class="up">+' + w7.joined + "</span>") + cell("Вышли за 7 дней", '<span class="dn">−' + w7.left + "</span>") +
          cell("Итого за 7 дней", signed(w7.joined - w7.left, String)) + cell("За 30 дней", m30 ? '<span class="up">+' + m30.joined + '</span> <span class="dn">−' + m30.left + "</span>" : "—") + "</div></div>" +
          '<div class="ap-sec"><h3>Кто и когда</h3>' + "" + '</div><div class="ap-card flush"><div id="elist"></div></div>';
        moveList($("elist"), { al: id });
      }
    };
    pane("m"); bindPills("atabs", pane);
    scrollUp();
  }

  /* ---------- карточка игрока ---------- */
  function placeOf(slug, uid) {
    var b = S.board[slug]; return b ? b[uid] : null;
  }
  /* полный файл игрока p/<id>.json: ответы целиком → данные для карточки */
  function fromRaw(r) {
    var c = r.card || {}, a = (r.arena && r.arena.arena) || null;
    var d = { log: (r.history || []).map(function (h) { return { t: h.observed_at, f: h.change_flags || "", power: h.power, kills: h.kills, abbr: h.union_abbr || "", nick: h.nick, lv: h.level, vip: h.vip }; }) };
    d.squads = (c.squads || []).filter(function (q) { return q && q.squad >= 1 && q.squad <= 4; }).sort(function (x, y) { return x.squad - y.squad; }).map(function (q) {
      return { n: q.squad, power: q.power, soldiers: q.soldiers, load: q.soldier_load, seen: q.seen_at, heroes: (q.heroes || []).map(function (h) { return { id: h.id, lv: h.lv, star: h.star, q: h.q, aw: h.awaken, tier: h.tier }; }) };
    });
    if (a && a.teams && a.teams.length) {
      d.arena = { power: a.power, t: (r.arena && r.arena.fetched_at) || r.arena_t, teams: a.teams.map(function (tm) {
        return { power: tm.power, hp: tm.hero_power, troops: tm.troops, heroes: (tm.heroes || []).slice().sort(function (x, y) { return (x.seat || 0) - (y.seat || 0); }).map(function (h) { return { id: h.id, lv: h.lv, star: h.star, q: h.q, aw: h.awaken, power: h.power, skills: h.skills, gear: h.gear }; }) };
      }) };
      var rv = a.raven;
      if (rv && rv.level_id) d.arena.raven = { lv: rv.lv, stars: rv.stars, power: rv.power, skill_pct: rv.skill_pct, skin: rv.skin,
        gear: (rv.gear || []).map(function (g) { return [g.slot, g.lv, g.q]; }), sets: (rv.sets || []).map(function (g) { return [g.slot, g.lv, g.q]; }) };
    }
    return d;
  }
  function playerView(uid) {
    get("p/" + uid + ".json").catch(function () { return null; }).then(function (R) {
      var p = S.players[uid];
      if (R && R.card && p) {
        var c = R.card;
        ["vip", "likes", "gender"].forEach(function (k) { if (c[k] != null) p[k] = c[k]; });
        if (c.language) p.lang = c.language;
        if (c.online != null) p.online = c.online;
        if (c.last_seen_at) p.last = c.last_seen_at;
        if (c.first_seen_at) p.first = c.first_seen_at;
        p.card = R.t;
      }
      renderPlayer(uid, R);
    });
  }
  function renderPlayer(uid, R) {
    var p = S.players[uid];
    if (!p) { $("view").innerHTML = '<div class="ap-wrap"><div class="ap-card"><p class="ap-empty">Игрок не найден среди альянсов топ-30.</p></div></div>'; return; }
    var mv = [], seen = {};
    Object.keys(S.al).forEach(function (id) {
      (S.al[id].events || []).forEach(function (e) {
        if (String(e.uid) !== String(uid)) return;
        var k = e.t + e.kind; if (seen[k]) return; seen[k] = 1;
        var c = Object.assign({}, e); c.al = S.al[id].abbr; mv.push(c);
      });
    });
    mv.sort(function (x, y) { return y.t - x.t; });
    var place = function (slug) { var n = placeOf(slug, uid); return n ? n + " место на сервере" : ""; };
    /* «в сети» — только если трекер видел игрока в сети меньше 45 мин назад; иначе честно «был в сети N назад» */
    var onNow = p.online && p.last && Date.now() / 1000 - p.last < 45 * 60;
    var onl = onNow ? '<span class="on">в сети</span>' : p.last ? "был в сети " + ago(p.last) : null;
    var dt = p.dt || p.card || p.seen;
    var g = p.gender === "Female" ? "женский" : p.gender === "Male" ? "мужской" : null;
    var al = S.al[p.aid];
    var mm = al && al.members.filter(function (m) { return String(m.uid) === String(uid); })[0];
    if (mm) ["active", "honor", "tech"].forEach(function (k) { if (p[k] == null) p[k] = mm[k]; });
    $("view").innerHTML = '<div class="ap-wrap">' +
      '<div class="ap-card"><div class="ap-top"><a class="ap-back" href="#">‹ Назад</a><span class="ap-upd">цифры сняты ' + atLabel(dt) + (p.seen ? " · проверено " + ago(p.seen) : "") + "</span></div>" +
      '<div class="ap-hero"><img class="emb av" src="' + G + 'doctor.png" alt=""><div><h2>' + esc(p.nick) + '</h2><div class="ap-chips"><span>Сервер 397</span>' +
      (p.aid ? '<a href="#a=' + p.aid + '"><span class="tag">[' + esc(p.abbr) + "]</span> " + esc(al ? al.name : "") + " · " + esc(p.rank || "") + "</a>" : (p.abbr ? '<span><span class="tag">[' + esc(p.abbr) + "]</span> · альянс вне топ-30</span>" : "<span>без альянса</span>")) + (onl ? "<span>" + onl + "</span>" : "") + "</div></div></div>" +
      '<div class="ap-cells c4">' + cell("Мощь", num(p.power), place("power")) + cell("Убийства", num(p.kills), place("kills")) + cell("Святилище", p.lv || "—", place("castle")) + cell("VIP", p.vip != null ? p.vip : "—", p.vip == null && p.card ? "пока нет данных" : "") + "</div>" +
      '<div class="ap-kvs">' + kv("ID", uid) + kv("Пол", g || "—") + kv("Язык", p.lang === "ru" ? "русский" : p.lang ? esc(p.lang) : "—") + kv("Лайки", p.likes != null ? full(p.likes) : "—") +
      kv("Город на карте", p.x != null ? p.x + ", " + p.y : "—") + kv("Недельная активность", p.active != null ? full(p.active) : "—") + kv("Честь за день", p.honor != null ? full(p.honor) : "—") +
      kv("Пожертвовано технологий", p.tech != null ? full(p.tech) : "—") + kv("В сети", onNow ? '<span class="up">сейчас</span>' : p.last ? ago(p.last) : "—") + kv("Место по мощи героев", placeOf("heroes", uid) || "вне топ-100") + kv("Впервые замечен", p.first ? dateOf(p.first) : "—") + kv("Мощь точно", full(p.power)) + "</div>" +
      (!p.card ? '<p class="ap-note">Защитный состав, ворон и полная история этого игрока загрузятся с одним из ближайших обновлений.</p>' : "") +
      (p.card && p.vip == null ? '<p class="ap-note">VIP, пол, язык и лайки этого игрока пока не получены (проверено ' + ago(p.card) + '). Проверяем регулярно — появятся здесь сами.</p>' : "") + "</div>" +
      '<div id="pdef"></div>' +
      pills("ptabs", [["h", "Рост"], ["c", "История изменений"], ["a", "Альянсы"]], "h") + '<div id="ppane"></div></div>';

    if (window.LAFav) LAFav.star($("view").querySelector(".ap-top"), { url: "server.html#p=" + uid, title: p.nick, page: "Сервер 397" + (p.abbr ? " · [" + p.abbr + "]" : ""), kind: "Игрок", icon: G + "doctor.png" }).classList.add("mini");
    var X = { log: p.log || [] };
    var pane = function (v) {
      var P = $("ppane");
      if (v === "h") {
        P.innerHTML = '<div class="ap-card"><div id="pch"></div></div>';
        var lg = (X.log || []).filter(function (h) { return h.power != null; });
        if (lg.length >= 2) {
          drawTrend("pch", lg.map(function (h) { return { t: h.t, a: h.power, k: h.kills, s: h.lv }; }), { aName: "Мощь", kName: "Убийства", sName: "Святилище", sFmt: function (v) { return "Святилище " + v; }, kGain: "убийств" });
        } else {
          get("s/" + ("0" + (Number(uid) % 32)).slice(-2) + ".json").catch(function () { return {}; }).then(function (s2) {
            var ser = s2[uid] || {}, ds = Object.keys(ser).sort();
            $("pch").innerHTML = chartBox("pchart");
            drawChart("pchart", ds.map(function (d) { return [d, ser[d][0]]; }), { title: "Мощь по дням" });
          });
        }
      } else if (v === "c") {
        var NAMES = function (h) { return { union: "альянс: " + (h.abbr ? "[" + esc(h.abbr) + "]" : "без альянса"), vip: "VIP " + h.vip, nick: "ник: " + esc(h.nick), level: "Святилище " + h.lv }; };
        var log = (X.log || []).slice().reverse();
        P.innerHTML = '<div class="ap-card flush"><div id="clist"></div></div>';
        paged($("clist"), log, 20, function (part, from) {
          var out = "", last = "";
          part.forEach(function (h, i) {
            var dl = dayLabel(h.t), prev = log[from + i + 1];
            if (dl !== last) { out += '<div class="ap-day">' + dl + "</div>"; last = dl; }
            var nm = NAMES(h), other = (h.f || "").split(",").map(function (f) { return nm[f] || ""; }).filter(Boolean).join(" · ");
            var kd = prev && h.kills != null && prev.kills != null && h.kills !== prev.kills;
            out += '<div class="ap-row ap-log"><div><span class="k">Мощь</span> <b>' + num(h.power) + "</b> " + (prev ? delta(h.power - prev.power) : "") +
              (kd ? ' <span class="k sp">Убийства</span> <b>' + num(h.kills) + "</b> " + delta(h.kills - prev.kills) : "") + (other ? ' <span class="k sp">' + other + "</span>" : "") + '</div><span class="tm">' + both(h.t) + "</span></div>";
          });
          return '<div class="ap-list">' + out + "</div>";
        }, p.card ? "Изменений пока нет." : "История загрузится с ближайшими обновлениями.");
      } else {
        P.innerHTML = '<div class="ap-card flush"><div id="mvl"></div></div>';
        moveList($("mvl"), { uid: uid });
      }
    };
    var stars = function (h) { return Math.floor((Number(h.star) || 0) / 5); };
    var heroTile = function (h, big) {
      var info = S.heroes[h.id] || {}, st = stars(h);
      var tip = (info.n || "герой " + h.id) + " · уровень " + h.lv + " · звёзд " + st + (h.aw ? " · пробуждение " + h.aw : "") + (h.power ? " · мощь " + full(h.power) : "") +
        (h.skills ? " · навыки " + h.skills.map(function (x) { return x[1]; }).join("/") : "") + (h.gear && h.gear.length ? " · снаряжение " + h.gear.map(function (x) { return x[1]; }).join("/") : "");
      return '<div class="ap-hero-t q' + (h.q || 0) + (big ? " big" : "") + '" title="' + esc(tip) + '"><div class="pic">' + (info.i ? '<img src="' + G + "hero/" + info.i + '.png" alt="">' : "") + '<span class="lv">' + h.lv + "</span>" + (h.aw ? '<span class="aw">' + h.aw + "</span>" : "") + "</div>" +
        (big ? "" : "<b>" + esc(info.n || "?") + '</b><span class="st">' + (st ? "★" + st : "·") + "</span>") + "</div>";
    };
    var rank = function (h) { return (Number(h.q) || 0) * 1e8 + stars(h) * 1e6 + (Number(h.lv) || 0) * 100 + (Number(h.aw) || 0); };
    var squadsBlock = function (sq) {
      if (!sq || !sq.length) return "";
      var best = null, latest = 0;
      sq.forEach(function (q) { latest = Math.max(latest, q.seen || 0); (q.heroes || []).forEach(function (h) { if (!best || rank(h) > rank(best.h)) best = { h: h, n: q.n }; }); });
      var top = best ? '<div class="ap-top-hero">' + heroTile(best.h, true) + '<div><small>Лучший герой</small><b>' + esc((S.heroes[best.h.id] || {}).n || "?") + "</b><span>Уровень " + best.h.lv + " · звёзд: " + stars(best.h) + (best.h.aw ? " · пробуждение " + best.h.aw : "") + " · в отряде " + best.n + "</span></div></div>" : "";
      var cards = sq.map(function (q) {
        var pct = q.load ? Math.max(4, Math.min(100, Math.round(q.soldiers / q.load * 100))) : 0;
        return '<div class="ap-team"><div class="hd"><span class="no">' + q.n + '</span><b>Отряд ' + q.n + '</b><span class="pw"><small>мощь</small>' + num(q.power) + '</span></div><div class="hs">' + (q.heroes || []).map(function (h) { return heroTile(h); }).join("") +
          '</div><div class="ft col"><span class="tr">Войска ' + (q.load ? '<i class="bar"><u style="width:' + pct + '%"></u></i><b>' + full(q.soldiers) + " / " + full(q.load) + "</b>" : "<b>" + full(q.soldiers) + "</b>") + '</span><span class="mut">Последний раз замечен ' + (q.seen ? ago(q.seen) : "—") + "</span></div></div>";
      }).join("");
      return '<div class="ap-card"><div class="ap-h"><div><h3>Отряды</h3><p>замечены на карте · обновлено ' + (latest ? ago(latest) : "—") + "</p></div></div>" + top + '<div class="ap-teams">' + cards + "</div></div>";
    };
    var defenseBlock = function (ar) {
      if (!ar || !ar.teams || !ar.teams.length) return "";
      var teams = ar.teams.map(function (tm, i) {
        return '<div class="ap-team"><div class="hd"><span class="no">' + (i + 1) + '</span><b>Команда ' + (i + 1) + '</b><span class="pw"><small>мощь</small>' + num(tm.power) + '</span></div><div class="hs">' + tm.heroes.map(function (h) { return heroTile(h); }).join("") +
          '</div><div class="ft"><span>Мощь героев <b>' + num(tm.hp) + "</b></span><span>Войска <b>" + full(tm.troops) + "</b></span></div></div>";
      }).join("");
      return '<div class="ap-card"><div class="ap-h"><div><h3>Защитный состав</h3><p>обновлено ' + ago(ar.t) + '</p></div><span class="ap-tot">Мощь <b>' + num(ar.power) + '</b></span></div><div class="ap-teams">' + teams + "</div></div>";
    };
    var GEAR = ["Сердце мудрости", "Перо ночи", "Острый клюв", "Хвост ветра", "Атакующий коготь", "Глаз восприятия"], SETS = ["Маска ночного Ворона", "Плащ из перьев Ворона"];
    var STAR = ["Пораженные цели получают на 12% больше урона в течение 5 сек.", "Наносит на 18% больше урона.", "Пораженные цели получают на 15% больше урона в течение 5 сек.", "Дополнительный урон увеличивается до 36%.", "Пораженные цели получают на 15% больше урона в течение 7 сек."];
    var ravenBlock = function (rv) {
      if (!rv) return "";
      var R = G + "raven/";
      var piece = function (g, file, name) {
        var q = Math.max(0, Math.min(6, Number(g[2]) || 0)), t = Math.max(0, Math.min(file > 6 ? 4 : 6, q - 2));
        return '<div class="ap-rp" title="' + esc(name + " · ур. " + g[1]) + '"><span class="art" style="background-image:url(' + R + "f" + q + '.webp)"><img src="' + R + "p" + file + "_" + t + '.webp" alt=""></span><b>Ур.' + g[1] + "</b></div>";
      };
      var gear = {}; (rv.gear || []).forEach(function (g) { gear[g[0]] = g; });
      var side = function (slots) { return slots.filter(function (sl) { return gear[sl]; }).map(function (sl) { return piece(gear[sl], sl + 1, GEAR[sl]); }).join(""); };
      var sets = (rv.sets || []).map(function (g) { return piece(g, g[0] + 7, SETS[g[0]] || "Комплект"); }).join("");
      var skin = rv.skin ? ("0" + (Number(rv.skin) % 100)).slice(-2) : "01"; if (!/^0[1-6]$/.test(skin)) skin = "01";
      var st = Math.max(0, Math.min(5, Number(rv.stars) || 0));
      var pct = rv.skill_pct ? Number(rv.skill_pct).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : null;
      return '<div class="ap-card"><div class="ap-h"><div><h3>Ворон</h3></div><span class="ap-tot">Мощь <b>' + full(rv.power) + '</b></span></div><div class="ap-rv">' +
        '<div class="stage"><div class="col">' + side([0, 1, 2]) + '</div><div class="body"><img src="' + R + "skin" + skin + '.webp" alt=""><span class="lvl">Ур.' + rv.lv + '</span></div><div class="col">' + side([3, 4, 5]) + "</div>" + (sets ? '<div class="sets">' + sets + "</div>" : "") + "</div>" +
        '<div class="skill"><div class="top"><span class="ic"><img src="' + R + 'skill.webp" alt="">' + (st ? '<span class="s">' + "★".repeat(st) + "</span>" : "") + '</span><div><b>Салют ворона <small>Ур.' + rv.lv + "</small></b>" +
        (pct ? "<span>Наносит " + pct + "% атаки физич. урона 2 противникам с наибольшим здоровьем (перезарядка: 13 сек.)</span>" : "") + '</div></div><ul>' +
        STAR.map(function (t, i) { return "<li" + (i < st ? ' class="on"' : "") + '><span class="n">' + "★".repeat(i + 1) + "</span><span>" + t + "</span></li>"; }).join("") + "</ul></div></div></div>";
    };
    Promise.resolve({}).then(function (x) {
      var d = R ? fromRaw(R) : x[uid]; if (d) { if (d.log && d.log.length) X.log = d.log; $("pdef").innerHTML = squadsBlock(d.squads) + defenseBlock(d.arena) + ravenBlock(d.arena && d.arena.raven); }
      pane("h"); bindPills("ptabs", pane);
    });
    scrollUp();
  }

  function scrollUp() { var t = $("trk").getBoundingClientRect().top + window.scrollY - 70; if (Math.abs(window.scrollY - t) > 40) window.scrollTo({ top: t, behavior: "smooth" }); }

  /* ---------- поиск и переходы ---------- */
  function search() {
    var q = $("sq").value.trim().toLowerCase(), kind = $("skind").querySelector(".on").dataset.v, out;
    if (q.length < 2) { $("sres").innerHTML = ""; return; }
    if (kind === "p") {
      out = Object.keys(S.players).filter(function (u) { return (S.players[u].nick || "").toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return (S.players[b].power || 0) - (S.players[a].power || 0); }).slice(0, 10)
        .map(function (u) { var p = S.players[u]; return '<a class="ap-row go" href="#p=' + u + '"><div class="ap-who"><img class="av" src="' + G + 'doctor.png" alt=""><div><b>' + esc(p.nick) + "</b><span>" + (p.abbr ? '<span class="tag">[' + esc(p.abbr) + "]</span> · " : "") + "Святилище " + (p.lv || "—") + '</span></div></div><span class="wh"></span><b class="pw">' + num(p.power) + "</b></a>"; }).join("");
      $("sres").innerHTML = out ? '<div class="ap-list">' + out + "</div>" : '<p class="ap-empty">Не нашли. Ищутся игроки альянсов топ-30 со свежим составом.</p>';
    } else {
      out = S.rows.filter(function (r) { return (r.abbr + " " + r.name).toLowerCase().indexOf(q) >= 0; }).slice(0, 10).map(function (r) {
        return '<a class="ap-row go" href="' + (S.al[r.id] ? "#a=" + r.id : "#") + '"><div class="ap-who"><img src="' + G + 'alliance.png" alt=""><div><b><span class="tag">[' + esc(r.abbr) + "]</span> " + esc(r.name) + "</b><span>место " + r.rank + '</span></div></div><span class="wh"></span><b class="pw">' + num(r.score) + "</b></a>";
      }).join("");
      $("sres").innerHTML = out ? '<div class="ap-list">' + out + "</div>" : '<p class="ap-empty">Не нашли среди топ-100.</p>';
    }
  }
  function route() {
    var h = location.hash, m;
    if ((m = h.match(/^#a=(\d+)/))) allianceView(m[1]);
    else if ((m = h.match(/^#p=(\d+)/))) playerView(m[1]);
    else homeView();
  }

  Promise.all([get("server.json"), get("alliances.json"), get("players.json"), fetch("data/heroes.json").then(function (r) { return r.json(); }).catch(function () { return {}; })]).then(function (r) {
    S.heroes = r[3]; S.server = r[0]; S.index = r[1].alliances; S.players = r[2].players;
    S.rows = S.server.boards.filter(function (b) { return b.slug === "alliance_power"; })[0].rows;
    S.server.boards.forEach(function (b) { if (b.alliance) return; var m = {}; b.rows.forEach(function (x) { m[x.id] = x.rank; }); S.board[b.slug] = m; });
    return Promise.all(S.rows.slice(0, 30).map(function (row) { return get("a/" + row.id + ".json").then(function (a) { S.al[row.id] = a; }).catch(function () {}); }));
  }).then(function () {
    route();
    window.addEventListener("hashchange", route);
    document.addEventListener("click", function (e) {
      if (e.target.closest(".ap-back")) { e.preventDefault(); if (history.length > 1) history.back(); else location.hash = ""; return; }
      if (e.target.closest("th[data-s]") || e.target.closest("a")) return;
      var t = e.target.closest("[data-p],[data-a]"); if (!t) return;
      location.hash = t.dataset.p ? "p=" + t.dataset.p : "a=" + t.dataset.a;
    });
  }).catch(function (e) { $("view").innerHTML = '<div class="ap-wrap"><div class="ap-card"><p class="ap-empty">Не удалось загрузить данные сервера: ' + esc(e.message) + "</p></div></div>"; });
})();

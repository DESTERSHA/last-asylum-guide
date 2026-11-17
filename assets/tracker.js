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
    $("view").innerHTML =
      '<div class="ap-wrap">' +
      '<div class="ap-card"><div class="ap-h"><div><h3>Сервер 397</h3><p>обновлено ' + ago(S.server.updated) + " · данные обновляются каждые 3 часа</p></div></div>" +
      '<div class="ap-cells c5">' + cell("Игроков", full(s.players), (s.age_days || "—") + " дней серверу") + cell("Альянсов", full(s.alliances)) + cell("Общая мощь", num(s.power)) +
      cell("Король", esc(s.king_name || "—"), s.union_abbr ? "[" + esc(s.union_abbr) + "] " + esc(s.union_name) : "", "gold") + cell("Альянсов со свежим составом", Object.keys(S.al).filter(function (k) { return S.al[k].members.length; }).length + " из 30", "остальные — после обновления на трекере") + "</div></div>" +
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
              '<td class="r strong">' + num(a && a.live && a.power ? a.power : r.score) + '</td><td class="r">' + delta(wk(ix)) + "</td></tr>";
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
  function moveList(el, list) {
    paged(el, list, 25, function (part) {
      var out = "", last = "";
      part.forEach(function (e) {
        var dl = dayLabel(e.t);
        if (dl !== last) { out += '<div class="ap-day">' + dl + "</div>"; last = dl; }
        var join = e.kind === "join", known = S.players[e.uid];
        var where = join ? (e.from ? 'пришёл из <span class="tag">[' + esc(e.from) + "]</span>" : "до этого без альянса") : (e.now ? 'ушёл в <span class="tag">[' + esc(e.now) + "]</span>" : "теперь без альянса");
        out += '<div class="ap-row' + (known ? " go" : "") + '"' + (known ? ' data-p="' + e.uid + '"' : "") + '><div class="ap-who"><img class="av" src="' + G + 'doctor.png" alt=""><div><b>' + esc(e.nick) + "</b><span>мощь " + num(e.power) + (e.al ? " · " + '<span class="tag">[' + esc(e.al) + "]</span>" : "") + "</span></div></div>" +
          '<span class="ap-bd ' + (join ? "in" : "out") + '">' + (join ? "Вступил" : "Вышел") + '</span><span class="wh">' + where + '</span><span class="tm">' + hm(e.t) + " <small>по серверу</small></span></div>";
      });
      return '<div class="ap-list">' + out + "</div>";
    }, "Вступлений и выходов пока нет.");
  }

  /* ---------- карточка альянса ---------- */
  function allianceView(id) {
    var a = S.al[id], ix = S.index[id] || {}, r = S.rows.filter(function (x) { return String(x.id) === String(id); })[0] || {};
    if (!a) { $("view").innerHTML = '<div class="ap-wrap"><div class="ap-card"><p class="ap-empty">Этого альянса нет в топ-30.</p></div></div>'; return; }
    var cnt = a.members.length, cap = a.capacity || 100, now = Date.now() / 1000;
    var sm = a.summary || {}, w7 = sm.week, m30 = sm.month;
    if (!w7) { var ev7 = a.events.filter(function (e) { return e.t >= now - 7 * 86400; }), j7 = ev7.filter(function (e) { return e.kind === "join"; }).length; w7 = { joined: j7, left: ev7.length - j7 }; }
    var lead = a.members.filter(function (m) { return (m.rank || "").slice(0, 2) === "R5"; })[0];
    $("view").innerHTML = '<div class="ap-wrap">' +
      '<div class="ap-card"><div class="ap-top"><a class="ap-back" href="#">‹ Все альянсы</a><span class="ap-upd">обновлено ' + ago(a.updated) + "</span></div>" +
      '<div class="ap-hero"><img class="emb" src="' + G + 'alliance.png" alt=""><div><h2><span class="tag">[' + esc(a.abbr) + "]</span> " + esc(a.name) + '</h2><div class="ap-chips"><span>Сервер 397</span><span>место ' + (r.rank || "—") + " по мощи</span>" + (a.language ? "<span>язык: " + esc(a.language) + "</span>" : "") + (a.live ? "" : '<span class="warn">состав ещё не обновлялся</span>') + "</div></div></div>" +
      '<div class="ap-cells c5">' + cell("Мощь", num(a.power || r.score), delta(wk(ix)) + " за 7 дней") +
      cell("Участники", cnt ? cnt + '<small>/' + cap + "</small>" : "—", cnt ? '<i class="ap-mini"><u style="width:' + Math.min(100, cnt / cap * 100) + '%"></u></i>' : "") +
      cell("Лидер", esc(a.leader || "—"), lead ? "мощь " + num(lead.power) : "", "", lead ? lead.uid : null) +
      cell("Уровень альянса", a.level || "—") +
      cell("За 7 дней", '<span class="up">+' + w7.joined + '</span> <span class="dn">−' + w7.left + "</span>", m30 ? "за 30 дней: +" + m30.joined + " −" + m30.left : "вступили / вышли") + "</div></div>" +
      pills("atabs", [["m", "Участники · " + (cnt || "—")], ["h", "История"], ["e", "Вступления и выходы"]], "m") +
      '<div id="apane"></div></div>';
    if (lead) { var lc = $("view").querySelectorAll(".ap-cell")[2]; lc.classList.add("go"); lc.dataset.p = lead.uid; }

    var pane = function (v) {
      var P = $("apane");
      if (v === "m") {
        if (!cnt) { P.innerHTML = '<div class="ap-card"><p class="ap-empty">Свежего состава этого альянса у трекера пока нет — старую копию с ушедшими игроками и устаревшими цифрами не показываем. Состав появится, когда альянс обновят на трекере.</p></div>'; return; }
        var order = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4 };
        var rk = function (m) { var k = (m.rank || "").slice(0, 2); return k in order ? order[k] : 9; };
        var by = {}; a.members.forEach(function (m) { var k = (m.rank || "").slice(0, 2); by[k] = (by[k] || 0) + 1; });
        var tot = a.members.reduce(function (s, m) { return s + (m.power || 0); }, 0);
        P.innerHTML = '<div class="ap-card"><div class="ap-h"><div><h3>Ранги</h3><p>нажми ранг — в списке останутся только его участники</p></div></div><div class="ap-ranks">' +
          ["R5", "R4", "R3", "R2", "R1"].map(function (k) { return '<button type="button" class="ap-rt r' + k.slice(1) + '" data-r="' + k + '"><span class="l">' + k + "</span><b>" + (by[k] || 0) + '</b><span class="s">' + (k === "R5" ? "лидер" : k === "R4" ? "офицеры" : "участники") + "</span></button>"; }).join("") +
          '</div><div class="ap-kvs">' + kv("Средняя мощь участника", num(tot / cnt)) + kv("Святилище 25+", a.members.filter(function (m) { return m.lv >= 25; }).length + " чел.") + kv("Сильнейший", esc(a.members.slice().sort(function (x, y) { return y.power - x.power; })[0].nick)) + "</div></div>" +
          '<div class="ap-card flush"><div class="ap-tools"><input id="mq" class="ap-in" type="search" placeholder="Ник участника…"><span id="mcount" class="mut"></span></div><div id="mlist"></div></div>';
        var st = { sort: "rank", dir: 1, rank: "", q: "" };
        var COLS = [["nick", "Игрок"], ["rank", "Ранг"], ["lv", "Святилище"], ["power", "Мощь"], ["kills", "Убийства"], ["active", "Активность"], ["honor", "Честь за день"], ["tech", "Техника за день"]];
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
        P.querySelector(".ap-ranks").addEventListener("click", function (e) {
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
        P.innerHTML = '<div class="ap-card">' + chartBox("ach") + '</div><div class="ap-card">' + chartBox("ach2") + '</div><div class="ap-sec"><h3>По дням</h3></div><div class="ap-card flush"><div id="hlist"></div></div>';
        drawChart("ach", ds.map(function (d) { return [d, pw[d]]; }), { title: "Мощь альянса", extra: function (p) { var x = h[p[0]]; return x ? "<span>участников " + (x.members || "—") + " · +" + (x.joined || 0) + " −" + (x.left || 0) + "</span>" : ""; } });
        var hm2 = Object.keys(h).sort().filter(function (d) { return h[d].members; });
        drawChart("ach2", hm2.map(function (d) { return [d, h[d].members]; }), { title: "Участников", fmt: function (n) { return String(Math.round(n)); }, fullFmt: function (n) { return n + " чел."; }, h: 180 });
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
          '<div class="ap-sec"><h3>Кто и когда</h3>' + pills("ekind", [["", "Все"], ["join", "Вступил"], ["leave", "Вышел"]], "") + '</div><div class="ap-card flush"><div id="elist"></div></div>';
        var drawE = function (k) { moveList($("elist"), a.events.filter(function (e) { return !k || e.kind === k; })); };
        drawE(""); bindPills("ekind", drawE);
      }
    };
    pane("m"); bindPills("atabs", pane);
    scrollUp();
  }

  /* ---------- карточка игрока ---------- */
  function placeOf(slug, uid) {
    var b = S.board[slug]; return b ? b[uid] : null;
  }
  function playerView(uid) {
    var p = S.players[uid];
    if (!p) { $("view").innerHTML = '<div class="ap-wrap"><div class="ap-card"><p class="ap-empty">Игрок не найден среди альянсов топ-30.</p></div></div>'; return; }
    var mv = [], seen = {};
    Object.keys(S.al).forEach(function (id) {
      S.al[id].events.forEach(function (e) {
        if (String(e.uid) !== String(uid)) return;
        var k = e.t + e.kind; if (seen[k]) return; seen[k] = 1;
        var c = Object.assign({}, e); c.al = S.al[id].abbr; mv.push(c);
      });
    });
    mv.sort(function (x, y) { return y.t - x.t; });
    var place = function (slug) { var n = placeOf(slug, uid); return n ? n + " место на сервере" : ""; };
    var onl = p.online ? '<span class="on">в сети</span>' : p.last ? "был в сети " + ago(p.last) : null;
    var g = p.gender === "Female" ? "женский" : p.gender === "Male" ? "мужской" : null;
    var al = S.al[p.aid];
    var mm = al && al.members.filter(function (m) { return String(m.uid) === String(uid); })[0];
    if (mm) ["active", "honor", "tech"].forEach(function (k) { if (p[k] == null) p[k] = mm[k]; });
    $("view").innerHTML = '<div class="ap-wrap">' +
      '<div class="ap-card"><div class="ap-top"><a class="ap-back" href="#">‹ Назад</a><span class="ap-upd">обновлено ' + ago(p.card || p.seen) + "</span></div>" +
      '<div class="ap-hero"><img class="emb av" src="' + G + 'doctor.png" alt=""><div><h2>' + esc(p.nick) + '</h2><div class="ap-chips"><span>Сервер 397</span>' +
      (p.aid ? '<a href="#a=' + p.aid + '"><span class="tag">[' + esc(p.abbr) + "]</span> " + esc(al ? al.name : "") + " · " + esc(p.rank || "") + "</a>" : "<span>без альянса</span>") + (onl ? "<span>" + onl + "</span>" : "") + "</div></div></div>" +
      '<div class="ap-cells c4">' + cell("Мощь", num(p.power), place("power")) + cell("Убийства", num(p.kills), place("kills")) + cell("Святилище", p.lv || "—", place("castle")) + cell("VIP", p.vip != null ? p.vip : "—", p.vip == null && p.card ? "трекер не знает" : "") + "</div>" +
      '<div class="ap-kvs">' + kv("ID", uid) + kv("Пол", g || "—") + kv("Язык", p.lang === "ru" ? "русский" : p.lang ? esc(p.lang) : "—") + kv("Лайки", p.likes != null ? full(p.likes) : "—") +
      kv("Город на карте", p.x != null ? p.x + ", " + p.y : "—") + kv("Скин замка", p.skin ? esc(p.skin) : "—") + kv("Активность", p.active != null ? full(p.active) : "—") + kv("Честь за день", p.honor != null ? full(p.honor) : "—") +
      kv("Техника за день", p.tech != null ? full(p.tech) : "—") + kv("Место по мощи героев", placeOf("heroes", uid) || "вне топ-100") + kv("Впервые замечен", p.first ? dateOf(p.first) : "—") + kv("Мощь точно", full(p.power)) + "</div>" +
      (!p.card ? '<p class="ap-note">Защитный состав, ворон и полная история этого игрока загрузятся с одним из ближайших обновлений.</p>' : "") +
      (p.card && p.vip == null ? '<p class="ap-note">VIP, пол, язык и лайки трекер узнаёт из игры, только когда профиль игрока открывают на самом трекере. У этого игрока их у трекера пока нет.</p>' : "") + "</div>" +
      '<div id="pdef"></div>' +
      pills("ptabs", [["h", "Рост"], ["c", "История изменений"], ["a", "Альянсы"]], "h") + '<div id="ppane"></div></div>';

    var X = { log: p.log || [] };
    var pane = function (v) {
      var P = $("ppane");
      if (v === "h") {
        P.innerHTML = '<div class="ap-card"><div id="pch"></div></div>';
        get("s/" + ("0" + (Number(uid) % 32)).slice(-2) + ".json").catch(function () { return {}; }).then(function (s) {
          var ser = s[uid] || {}, ds = Object.keys(ser).sort();
          var lg = (X.log || []).filter(function (h) { return h.power != null; });
          var draw = function (k) {
            var idx = k === "kills" ? 1 : 0, pts;
            if (lg.length >= 2) pts = lg.filter(function (h) { return (k === "kills" ? h.kills : h.power) != null; }).map(function (h) { return [h.t, k === "kills" ? h.kills : h.power]; });
            else pts = ds.filter(function (d) { return ser[d][idx] != null; }).map(function (d) { return [d, ser[d][idx]]; });
            drawChart("pchart", pts, { title: k === "kills" ? "Убийства" : "Мощь", right: pills("pk", [["power", "Мощь"], ["kills", "Убийства"]], k),
              extra: function (pt) { if (typeof pt[0] !== "number") return ""; var h = lg.filter(function (x) { return x.t === pt[0]; })[0]; return h ? "<span>" + (k === "kills" ? "мощь " + num(h.power) : "убийства " + num(h.kills)) + " · Святилище " + (h.lv || "—") + "</span>" : ""; } });
            bindPills("pk", draw);
          };
          $("pch").innerHTML = chartBox("pchart"); draw("power");
        });
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
              (kd ? ' <span class="k sp">Убийства</span> <b>' + num(h.kills) + "</b> " + delta(h.kills - prev.kills) : "") + (other ? ' <span class="k sp">' + other + "</span>" : "") + '</div><span class="tm">' + hm(h.t) + "</span></div>";
          });
          return '<div class="ap-list">' + out + "</div>";
        }, p.card ? "Трекер изменений не записал." : "История загрузится с ближайшими обновлениями.");
      } else {
        P.innerHTML = '<div class="ap-card flush"><div id="mvl"></div></div>';
        moveList($("mvl"), mv);
      }
    };
    var defense = function (ar) {
      if (!ar || !ar.teams || !ar.teams.length) { $("pdef").innerHTML = ""; return; }
      var hero = function (h) {
        var info = S.heroes[h.id] || {}, st = Math.floor((Number(h.star) || 0) / 5);
        var tip = (info.n || "герой " + h.id) + " · ур. " + h.lv + " · ★" + st + (h.power ? " · мощь " + full(h.power) : "") + (h.skills ? " · навыки " + h.skills.map(function (x) { return x[1]; }).join("/") : "") + (h.gear && h.gear.length ? " · снаряжение " + h.gear.map(function (x) { return x[1]; }).join("/") : "");
        return '<div class="ap-hero-t q' + (h.q || 0) + '" title="' + esc(tip) + '"><div class="pic">' + (info.i ? '<img src="' + G + "hero/" + info.i + '.png" alt="">' : "") + '<span class="lv">' + h.lv + "</span>" + (h.aw ? '<span class="aw">' + h.aw + "</span>" : "") + '</div><b>' + esc(info.n || "?") + '</b><span class="st">★' + st + "</span></div>";
      };
      var teams = ar.teams.map(function (tm, i) {
        return '<div class="ap-team"><div class="hd"><span class="no">' + (i + 1) + '</span><b>Команда ' + (i + 1) + '</b><span class="pw"><small>мощь</small>' + num(tm.power) + '</span></div><div class="hs">' + tm.heroes.map(hero).join("") +
          '</div><div class="ft"><span>Мощь героев <b>' + num(tm.hp) + "</b></span><span>Войска <b>" + full(tm.troops) + "</b></span></div></div>";
      }).join("");
      var rv = ar.raven, raven = "";
      if (rv) {
        raven = '<div class="ap-card"><div class="ap-h"><div><h3>Ворон</h3><p>мощь ' + full(rv.power) + '</p></div></div><div class="ap-raven"><img src="' + G + 'raven.png" alt=""><div class="ap-cells c4">' +
          cell("Уровень", rv.lv) + cell("Звёзды", rv.stars ? "★".repeat(rv.stars) : "—") + cell("Мощь ворона", num(rv.power)) + cell("Урон навыка «Салют ворона»", rv.skill_pct != null ? full(rv.skill_pct) + "%" : "—", "от атаки") + "</div></div>" +
          (rv.gear && rv.gear.length ? '<div class="ap-gear">' + rv.gear.map(function (g2) { return '<span class="q' + (g2[2] || 0) + '">Снаряжение ' + (Number(g2[0]) + 1) + " · ур. " + g2[1] + "</span>"; }).join("") + "</div>" : "") + "</div>";
      }
      $("pdef").innerHTML = '<div class="ap-card"><div class="ap-h"><div><h3>Защитный состав</h3><p>мощь ' + num(ar.power) + " · обновлено " + ago(ar.t) + '</p></div></div><div class="ap-teams">' + teams + "</div></div>" + raven;
    };
    get("x/" + ("0" + (Number(uid) % 32)).slice(-2) + ".json").catch(function () { return {}; }).then(function (x) {
      var d = x[uid]; if (d) { if (d.log && d.log.length) X.log = d.log; defense(d.arena); }
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

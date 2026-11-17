/* Страница «Сервер 397»: список альянсов, карточка альянса, карточка игрока. Данные — data/tracker/*.json (робот обновляет раз в 3 часа). */
(function () {
  "use strict";
  var D = "data/tracker/";
  var S = { server: null, index: {}, players: {}, al: {}, rows: [] };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var get = function (p) { return fetch(D + p + "?t=" + Math.floor(Date.now() / 600000)).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); };
  var G = "assets/game/";

  function num(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }
  function full(n) { return (Number(n) || 0).toLocaleString("ru-RU"); }
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
  function dayLabel(t) {
    var diff = srvDay(Date.now() / 1000) - srvDay(t);
    if (diff <= 0) return "Сегодня";
    if (diff === 1) return "Вчера";
    var d = new Date((t - 2 * 3600) * 1000);
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }
  function tabs(id, names, active) {
    return '<div class="tk-tabs" id="' + id + '">' + names.map(function (n) { return '<button data-v="' + n[0] + '"' + (n[0] === active ? ' class="on"' : "") + ">" + n[1] + "</button>"; }).join("") + "</div>";
  }
  function bindTabs(id, cb) {
    var el = $(id); if (!el) return;
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      [].forEach.call(el.children, function (x) { x.classList.toggle("on", x === b); });
      cb(b.dataset.v);
    });
  }
  function tile(icon, label, value, sub) {
    return '<div class="tk-tile">' + (icon ? '<img src="' + G + icon + '" alt="">' : '<span class="ph"></span>') + '<span class="l">' + label + '</span><span class="v">' + value + (sub ? "<small>" + sub + "</small>" : "") + "</span></div>";
  }
  function chart(pts, title) {
    if (pts.length < 2) return '<p class="cap">' + title + ": появится, когда накопится несколько дней.</p>";
    var W = 760, H = 200, L = 62, R = 16, T = 14, B = 26, v = pts.map(function (p) { return p[1]; }), mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    if (mx === mn) { mx += 1; mn -= 1; }
    var x = function (i) { return L + i * (W - L - R) / (pts.length - 1); }, y = function (n) { return T + (mx - n) * (H - T - B) / (mx - mn); };
    var grid = [0, 0.5, 1].map(function (f) { var val = mn + (mx - mn) * f; return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(val).toFixed(1) + '" y2="' + y(val).toFixed(1) + '"/><text x="' + (L - 8) + '" y="' + (y(val) + 4).toFixed(1) + '" text-anchor="end">' + num(val) + "</text>"; }).join("");
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
    var area = line + " L" + x(pts.length - 1).toFixed(1) + " " + (H - B) + " L" + L + " " + (H - B) + "Z";
    var dots = pts.map(function (p, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p[1]).toFixed(1) + '" r="3.5"><title>' + p[0].split("-").reverse().join(".") + " — " + full(p[1]) + "</title></circle>"; }).join("");
    var lab = function (i) { var d = pts[i][0].split("-"); return d[2] + "." + d[1]; };
    return '<div class="tk-chart"><div class="tk-ch-h">' + title + '</div><svg viewBox="0 0 ' + W + " " + H + '"><g class="g">' + grid + '</g><path class="a" d="' + area + '"/><path class="ln" d="' + line + '"/>' + dots +
      '<text x="' + L + '" y="' + (H - 6) + '">' + lab(0) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + lab(pts.length - 1) + "</text></svg></div>";
  }

  /* ---------- шапка ---------- */
  function renderFacts() {
    var s = S.server.server;
    $("srvFacts").innerHTML =
      '<div class="fact"><div class="big">' + full(s.players) + '</div><h3>Игроков на сервере</h3><p>' + (s.age_days || "—") + " дней серверу</p></div>" +
      '<div class="fact"><div class="big">' + (s.alliances || "—") + '</div><h3>Альянсов</h3><p>общая мощь ' + num(s.power) + "</p></div>" +
      '<div class="fact gold"><img class="ic" src="' + G + 'ev-throne.png" alt=""><h3>Король: ' + esc(s.king_name) + "</h3><p>[" + esc(s.union_abbr) + "] " + esc(s.union_name) + "</p></div>";
    $("srvUpdated").textContent = "Обновлено " + ago(S.server.updated) + ". Обновляется каждые 3 часа.";
  }

  /* ---------- список альянсов ---------- */
  function homeView() {
    var rows = S.rows;
    var card = function (r) {
      var a = S.al[r.id], ix = S.index[r.id] || {};
      return '<a class="tk-acard" href="#a=' + r.id + '"><span class="rk">' + r.rank + '</span><img src="' + G + 'alliance.png" alt=""><span class="nm"><b>[' + esc(r.abbr) + "]</b> " + esc(r.name) + "<small>" + (a && a.members.length ? a.members.length + " участников" : "состав обновляется") + (ix.leader ? " · лидер " + esc(ix.leader) : "") + '</small></span><span class="pw">' + num(r.score) + "<small>мощь</small></span></a>";
    };
    $("view").innerHTML =
      '<div class="tk-head"><h2>Топ-30 альянсов</h2><p class="cap">Нажми на альянс — откроется его карточка: участники, история и вступления/выходы.</p></div>' +
      '<div class="tk-agrid">' + rows.slice(0, 30).map(card).join("") + "</div>" +
      '<details class="tk-more"><summary>Места с 31 по 100</summary><div class="tbl"><table class="trk-tbl"><tr><th>#</th><th>Альянс</th><th>Мощь</th></tr>' +
      rows.slice(30).map(function (r) { return '<tr><td class="n">' + r.rank + "</td><td><b>[" + esc(r.abbr) + "]</b> " + esc(r.name) + "</td><td>" + num(r.score) + "</td></tr>"; }).join("") + "</table></div></details>" +
      '<div class="tk-head"><h2>Топ-100 игроков сервера</h2></div>' + tabs("ptop", [["power", "Мощь"], ["kills", "Убийства"], ["heroes", "Мощь героев"], ["castle", "Святилище"]], "power") +
      '<div class="tbl"><table class="trk-tbl" id="ptopT"></table></div>';
    var renderTop = function (slug) {
      var b = S.server.boards.filter(function (x) { return x.slug === slug; })[0];
      $("ptopT").innerHTML = "<tr><th>#</th><th>Игрок</th><th>Альянс</th><th>" + { power: "Мощь", kills: "Убийства", heroes: "Мощь героев", castle: "Святилище" }[slug] + "</th></tr>" +
        b.rows.map(function (r) { var known = S.players[r.id]; return "<tr" + (known ? ' class="click" data-p="' + r.id + '"' : "") + '><td class="n">' + r.rank + "</td><td><b>" + esc(r.name) + "</b></td><td>" + (r.abbr ? "[" + esc(r.abbr) + "]" : "—") + "</td><td>" + (slug === "castle" ? r.score : num(r.score)) + "</td></tr>"; }).join("");
    };
    renderTop("power"); bindTabs("ptop", renderTop);
  }

  /* ---------- карточка альянса ---------- */
  function moveRows(list) {
    var out = "", last = "";
    list.forEach(function (e) {
      var dl = dayLabel(e.t);
      if (dl !== last) { out += '<div class="tk-day">' + dl + "</div>"; last = dl; }
      var join = e.kind === "join";
      var where = join ? (e.from ? 'из <b class="tag">[' + esc(e.from) + "]</b>" : "без альянса до этого") : (e.now ? 'в <b class="tag">[' + esc(e.now) + "]</b>" : "теперь без альянса");
      var known = S.players[e.uid];
      out += '<div class="tk-mv' + (known ? " click" : "") + '"' + (known ? ' data-p="' + e.uid + '"' : "") + '><img class="av" src="' + G + 'doctor.png" alt=""><div class="who"><b>' + esc(e.nick) + "</b><span>S397 · " + num(e.power) + "</span></div>" +
        (e.al ? '<span class="atag">[' + esc(e.al) + "]</span>" : "") + '<span class="badge ' + (join ? "in" : "out") + '">' + (join ? "Вступил" : "Вышел") + '</span><span class="wh">' + where + '</span><span class="tm" title="' + hm(e.t) + ' по серверу">' + ago(e.t) + "</span></div>";
    });
    return out || '<p class="cap">Пусто.</p>';
  }
  function allianceView(id) {
    var a = S.al[id], ix = S.index[id] || {}, r = S.rows.filter(function (x) { return String(x.id) === String(id); })[0] || {};
    if (!a) { $("view").innerHTML = '<p class="cap">Этого альянса нет в топ-30.</p>'; return; }
    var cnt = a.members.length, from7 = Date.now() / 1000 - 7 * 86400;
    var wk = a.events.filter(function (e) { return e.t >= from7; }), wj = wk.filter(function (e) { return e.kind === "join"; }).length, wl = wk.length - wj;
    var net = wj - wl;
    $("view").innerHTML = '<div class="tk-card">' +
      '<div class="tk-top"><a class="tk-back" href="#">←</a><span class="tk-upd">↻ ' + ago(a.updated) + "</span></div>" +
      '<div class="tk-hero"><img class="emb" src="' + G + 'alliance.png" alt=""><h2>[' + esc(a.abbr) + "] " + esc(a.name) + '</h2><span class="tk-pill"><img src="' + G + 'ev-throne.png" alt="">Сервер 397 · место ' + (r.rank || "—") + "</span></div>" +
      '<div class="tk-tiles c4">' + tile("power.png", "Мощь", num(a.power || r.score)) + tile("c-squad.png", "Участники", cnt ? cnt + (a.capacity ? "/" + a.capacity : "") : "—") +
      tile("r5.png", "Лидер", esc(a.leader || "—")) + tile("alliance-tech.png", "Уровень альянса", a.level || "—") + "</div>" +
      tabs("atabs", [["m", "Участники <i>" + (cnt || "—") + "</i>"], ["h", "История"], ["e", 'Вступления и выходы <i class="' + (net < 0 ? "neg" : "pos") + '">' + (net >= 0 ? "+" : "−") + Math.abs(net) + "</i>"]], "m") +
      '<div id="apane"></div></div>';
    var pane = function (v) {
      if (v === "m") {
        if (!cnt) { $("apane").innerHTML = '<p class="cap tk-pad">Свежего состава этого альянса пока нет — устаревшую копию со старыми цифрами и ушедшими игроками не показываем. Состав появится при следующих обновлениях.</p>'; return; }
        var order = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4 };
        var rk = function (m) { var k = (m.rank || "").slice(0, 2); return k in order ? order[k] : 9; };
        var mem = a.members.slice().sort(function (x, y) { return (rk(x) - rk(y)) || (y.power - x.power); });
        $("apane").innerHTML = '<div class="tk-mlist">' + mem.map(function (m) {
          return '<div class="tk-mv click" data-p="' + m.uid + '"><img class="av" src="' + G + 'doctor.png" alt=""><div class="who"><b>' + esc(m.nick) + "</b><span>S397 · Святилище " + m.lv + '</span></div><span class="rk r' + esc((m.rank || "").slice(1, 2)) + '">' + esc(m.rank || "—") + '</span><span class="wh">' + num(m.kills) + ' убийств</span><span class="pw">' + num(m.power) + "</span></div>";
        }).join("") + "</div>";
      } else if (v === "h") {
        var pts = {};
        Object.keys(ix.hist || {}).forEach(function (d) { if (ix.hist[d].power) pts[d] = ix.hist[d].power; });
        Object.keys(ix.days || {}).forEach(function (d) { if (ix.days[d]) pts[d] = ix.days[d]; });
        var ds = Object.keys(pts).sort();
        var rowsH = Object.keys(ix.hist || {}).sort().reverse().map(function (d) { var h = ix.hist[d]; return "<tr><td>" + d.split("-").reverse().join(".") + "</td><td>" + num(h.power) + "</td><td>" + (h.members || "—") + '</td><td class="pos">+' + (h.joined || 0) + '</td><td class="neg">−' + (h.left || 0) + "</td></tr>"; }).join("");
        $("apane").innerHTML = '<div class="tk-pad">' + chart(ds.map(function (d) { return [d, pts[d]]; }), "Мощь альянса по дням") +
          (rowsH ? '<div class="tbl"><table class="trk-tbl"><tr><th>День</th><th>Мощь</th><th>Участников</th><th>Вступили</th><th>Вышли</th></tr>' + rowsH + "</table></div>" : "") + "</div>";
      } else {
        var sm = a.summary || {}, m30 = sm.month || {}, w7 = sm.week || { joined: wj, left: wl };
        var n7 = w7.joined - w7.left;
        $("apane").innerHTML = '<div class="tk-pad"><div class="tk-sum"><div><b class="pos">+' + w7.joined + '</b>вступили</div><div><b class="neg">−' + w7.left + "</b>вышли</div><div><b>" + (n7 >= 0 ? "+" : "−") + Math.abs(n7) + "</b>итого</div></div>" +
          '<p class="cap">За 7 дней' + (m30.joined != null ? " · за 30 дней: вступили " + m30.joined + ", вышли " + m30.left : "") + "</p>" +
          tabs("ekind", [["", "Все"], ["join", "Вступил"], ["leave", "Вышел"]], "") + '<div class="tk-mlist" id="elist"></div></div>';
        var draw = function (k) { $("elist").innerHTML = moveRows(a.events.filter(function (e) { return !k || e.kind === k; }).slice(0, 300)); };
        draw(""); bindTabs("ekind", draw);
      }
    };
    pane("m"); bindTabs("atabs", pane);
    window.scrollTo({ top: $("trk").offsetTop - 70, behavior: "smooth" });
  }

  /* ---------- карточка игрока ---------- */
  function playerView(uid) {
    var p = S.players[uid];
    if (!p) { $("view").innerHTML = '<p class="cap">Игрок не найден среди альянсов топ-30.</p>'; return; }
    var mv = [], seen = {};
    Object.keys(S.al).forEach(function (id) {
      S.al[id].events.forEach(function (e) {
        if (String(e.uid) !== String(uid)) return;
        var k = e.t + e.kind; if (seen[k]) return; seen[k] = 1;
        var c = Object.assign({}, e); c.al = S.al[id].abbr; mv.push(c);
      });
    });
    mv.sort(function (x, y) { return y.t - x.t; });
    $("view").innerHTML = '<div class="tk-card">' +
      '<div class="tk-top"><a class="tk-back" href="#">←</a><span class="tk-upd">↻ ' + ago(p.card || p.seen) + "</span></div>" +
      '<div class="tk-hero"><img class="emb av" src="' + G + 'doctor.png" alt=""><h2>' + esc(p.nick) + '</h2><span class="tk-pill"><img src="' + G + 'ev-throne.png" alt="">Сервер 397</span></div>' +
      (p.aid ? '<a class="tk-arow" href="#a=' + p.aid + '"><img src="' + G + 'alliance.png" alt=""><span><b>[' + esc(p.abbr) + "] " + esc((S.al[p.aid] || {}).name || "") + "</b><small>ранг " + esc(p.rank || "—") + "</small></span></a>"
        : '<div class="tk-arow"><span class="ph">—</span><span><b>Без альянса</b><small>Не состоит в альянсе</small></span></div>') +
      tabs("ptabs", [["d", "Досье"], ["h", "История"], ["a", "Альянс"]], "d") + '<div id="ppane"></div></div>';
    var pane = function (v) {
      if (v === "d") {
        var g = p.gender === "Female" ? ["t-female.png", "Женский"] : p.gender === "Male" ? ["t-male.png", "Мужской"] : [null, "—"];
        $("ppane").innerHTML = '<div class="tk-pad"><div class="tk-sec">Сведения</div><div class="tk-tiles c4">' +
          tile(null, "ID", uid) + tile("power.png", "Мощь", num(p.power)) + tile("t-kills.png", "Убийства", num(p.kills)) + tile("sanctuary.png", "Святилище", p.lv || "—") +
          tile("t-vip.png", "VIP", p.vip != null ? p.vip : "—") + tile(g[0], "Пол", g[1]) + tile(null, "Язык", p.lang === "ru" ? "русский" : esc(p.lang || "—")) + tile("t-likes.png", "Лайки", p.likes != null ? p.likes : "—") +
          "</div>" + (p.x != null ? '<div class="tk-tiles c1">' + tile("t-pin.png", "Карта", '<span class="blue">' + p.x + ", " + p.y + "</span>") + "</div>" : "") +
          (p.vip == null ? '<p class="cap">VIP, лайки, пол и язык этого игрока появятся с одним из ближайших обновлений.</p>' : "") + "</div>";
      } else if (v === "h") {
        get("s/" + ("0" + (Number(uid) % 32)).slice(-2) + ".json").catch(function () { return {}; }).then(function (s) {
          var ser = s[uid] || {}, ds = Object.keys(ser).sort();
          var NAMES = function (h) { return { might: "мощь " + num(h.power), union: "альянс: " + (h.abbr ? "[" + esc(h.abbr) + "]" : "без альянса"), vip: "VIP " + h.vip, nick: "ник: " + esc(h.nick), level: "Святилище " + h.lv }; };
          var log = (p.log || []).slice().reverse().filter(function (h) { return h.f; }).map(function (h) {
            var nm = NAMES(h), what = h.f.split(",").map(function (f) { return nm[f] || ""; }).filter(Boolean).join(" · ");
            return '<div class="tk-mv"><span class="tk-dt">' + dayLabel(h.t) + " " + hm(h.t) + '</span><span class="wh">' + what + "</span></div>";
          }).join("");
          $("ppane").innerHTML = '<div class="tk-pad">' + chart(ds.map(function (d) { return [d, ser[d][0]]; }), "Мощь по дням") + (log ? '<div class="tk-sec">Изменения</div><div class="tk-mlist">' + log + "</div>" : "") + "</div>";
        });
      } else {
        $("ppane").innerHTML = '<div class="tk-pad">' + (mv.length ? '<div class="tk-mlist">' + moveRows(mv) + "</div>" : '<p class="cap">Вступлений и выходов в альянсах топ-30 не замечено.</p>') + "</div>";
      }
    };
    pane("d"); bindTabs("ptabs", pane);
    window.scrollTo({ top: $("trk").offsetTop - 70, behavior: "smooth" });
  }

  /* ---------- поиск и переходы ---------- */
  function search() {
    var q = $("sq").value.trim().toLowerCase(), kind = $("skind").querySelector(".on").dataset.v;
    if (q.length < 2) { $("sres").innerHTML = ""; return; }
    if (kind === "p") {
      var res = Object.keys(S.players).filter(function (u) { return (S.players[u].nick || "").toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return (S.players[b].power || 0) - (S.players[a].power || 0); });
      $("sres").innerHTML = res.slice(0, 12).map(function (u) { var p = S.players[u]; return '<a class="tk-mv click" href="#p=' + u + '"><img class="av" src="' + G + 'doctor.png" alt=""><div class="who"><b>' + (p.abbr ? '<span class="tag">[' + esc(p.abbr) + "]</span> " : "") + esc(p.nick) + "</b><span>S397 · Святилище " + p.lv + '</span></div><span class="pw">' + num(p.power) + "<small>мощь</small></span></a>"; }).join("") || '<p class="cap">Не нашли. Ищутся игроки альянсов топ-30 со свежим составом.</p>';
    } else {
      $("sres").innerHTML = S.rows.filter(function (r) { return (r.abbr + " " + r.name).toLowerCase().indexOf(q) >= 0; }).slice(0, 12).map(function (r) {
        return '<a class="tk-mv click" href="' + (S.al[r.id] ? "#a=" + r.id : "#") + '"><img class="av" src="' + G + 'alliance.png" alt=""><div class="who"><b><span class="tag">[' + esc(r.abbr) + "]</span> " + esc(r.name) + "</b><span>место " + r.rank + '</span></div><span class="pw">' + num(r.score) + "<small>мощь</small></span></a>";
      }).join("") || '<p class="cap">Не нашли среди топ-100.</p>';
    }
  }
  function route() {
    var h = location.hash, m;
    $("sres").innerHTML = "";
    if ((m = h.match(/^#a=(\d+)/))) allianceView(m[1]);
    else if ((m = h.match(/^#p=(\d+)/))) playerView(m[1]);
    else homeView();
  }

  Promise.all([get("server.json"), get("alliances.json"), get("players.json")]).then(function (r) {
    S.server = r[0]; S.index = r[1].alliances; S.players = r[2].players;
    S.rows = S.server.boards.filter(function (b) { return b.slug === "alliance_power"; })[0].rows;
    renderFacts();
    return Promise.all(S.rows.slice(0, 30).map(function (row) { return get("a/" + row.id + ".json").then(function (a) { S.al[row.id] = a; }).catch(function () {}); }));
  }).then(function () {
    route();
    window.addEventListener("hashchange", route);
    $("sq").addEventListener("input", search);
    bindTabs("skind", search);
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-p]"); if (t && t.tagName !== "A") location.hash = "p=" + t.dataset.p;
      if (e.target.closest(".tk-back")) { e.preventDefault(); if (history.length > 1) history.back(); else location.hash = ""; }
    });
  }).catch(function (e) { $("srvUpdated").textContent = "Не удалось загрузить данные сервера: " + e.message; });
})();

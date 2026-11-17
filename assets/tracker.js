/* Страница «Сервер 397»: читает data/tracker/*.json (их обновляет робот GitHub каждые 3 часа). */
(function () {
  "use strict";
  var D = "data/tracker/";
  var S = { server: null, index: null, players: null, al: {}, moves: [], shown: 40 };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var get = function (p) { return fetch(D + p + "?t=" + Math.floor(Date.now() / 600000)).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); };

  function num(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(".", ",") + " млрд";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " млн";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(".", ",") + " тыс.";
    return String(n);
  }
  function ago(t) {
    var s = Date.now() / 1000 - t;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " мин назад";
    if (s < 86400) return Math.round(s / 3600) + " ч назад";
    return Math.round(s / 86400) + " дн назад";
  }
  function when(t) {
    var d = new Date(t * 1000);
    var srv = new Date(d.getTime() - 2 * 3600e3); /* время сервера = UTC−2 */
    var msk = new Date(d.getTime() + 3 * 3600e3);
    var f = function (x) { return ("0" + x.getUTCDate()).slice(-2) + "." + ("0" + (x.getUTCMonth() + 1)).slice(-2) + " " + ("0" + x.getUTCHours()).slice(-2) + ":" + ("0" + x.getUTCMinutes()).slice(-2); };
    return f(srv) + " по серверу · " + f(msk) + " МСК";
  }
  function seg(id, cb) {
    $(id).addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      [].forEach.call($(id).children, function (x) { x.classList.toggle("on", x === b); });
      cb(b.dataset.v);
    });
  }
  function segVal(id) { var b = $(id).querySelector(".on"); return b ? b.dataset.v : ""; }

  /* ---------- шапка ---------- */
  function renderFacts() {
    var s = S.server.server;
    $("srvFacts").innerHTML =
      '<div class="fact"><div class="big">' + num(s.players) + '</div><h3>Игроков на сервере</h3><p>на всём сервере</p></div>' +
      '<div class="fact"><div class="big">' + (s.alliances || "—") + '</div><h3>Альянсов</h3><p>полностью следим за топ-30</p></div>' +
      '<div class="fact"><div class="big">' + (s.age_days || "—") + '</div><h3>Дней серверу</h3><p>общая мощь ' + num(s.power) + '</p></div>' +
      '<div class="fact gold"><img class="ic" src="assets/game/ev-throne.png" alt=""><h3>Король: ' + esc(s.king_name) + '</h3><p>альянс [' + esc(s.union_abbr) + '] ' + esc(s.union_name) + '</p></div>';
    $("srvUpdated").textContent = "Обновлено: " + when(S.server.updated) + ". Обновляется каждые 3 часа.";
  }

  /* ---------- вступления и выходы ---------- */
  function buildMoves() {
    var all = [];
    Object.keys(S.al).forEach(function (id) {
      var a = S.al[id];
      a.events.forEach(function (e) { all.push({ e: e, a: a }); });
    });
    all.sort(function (x, y) { return y.e.t - x.e.t; });
    S.moves = all;
    var sel = $("mvAlliance");
    S.index.sort(function (x, y) { return (x.rank || 999) - (y.rank || 999); }).forEach(function (a) {
      if (!S.al[a.id]) return;
      var o = document.createElement("option"); o.value = a.id; o.textContent = "#" + a.rank + " [" + a.abbr + "] " + a.name; sel.appendChild(o);
    });
  }
  function moveRow(m, withAl) {
    var e = m.e, a = m.a, join = e.kind === "join";
    var where = join ? (e.from ? 'из <b>[' + esc(e.from) + ']</b>' : "без альянса до этого") : (e.now ? 'в <b>[' + esc(e.now) + ']</b>' : "теперь без альянса");
    return '<div class="trk-row" data-uid="' + e.uid + '"><img class="av" src="assets/game/doctor.png" alt=""><div class="who"><b>' + esc(e.nick) + '</b><span>' + num(e.power) + ' мощи</span></div>' +
      '<div class="what"><span class="badge ' + (join ? "in" : "out") + '">' + (join ? "Вступил" : "Вышел") + '</span>' + (withAl ? ' <span class="al">[' + esc(a.abbr) + ']</span>' : "") + ' <span class="wh">' + where + '</span></div>' +
      '<div class="tm" title="' + esc(when(e.t)) + '">' + ago(e.t) + '</div></div>';
  }
  function renderMoves() {
    var aid = $("mvAlliance").value, kind = segVal("mvKind"), per = Number(segVal("mvPeriod")), nick = $("mvNick").value.trim().toLowerCase();
    var from = per ? Date.now() / 1000 - per * 86400 : 0;
    var list = S.moves.filter(function (m) {
      return (!aid || String(m.a.id) === aid) && (!kind || m.e.kind === kind) && m.e.t >= from && (!nick || (m.e.nick || "").toLowerCase().indexOf(nick) >= 0);
    });
    var j = list.filter(function (m) { return m.e.kind === "join"; }).length, l = list.length - j;
    $("mvSum").innerHTML = '<div class="s in"><b>+' + j + '</b>вступили</div><div class="s out"><b>−' + l + '</b>вышли</div><div class="s"><b>' + (j - l >= 0 ? "+" : "−") + Math.abs(j - l) + '</b>итого</div>';
    $("mvList").innerHTML = list.slice(0, S.shown).map(function (m) { return moveRow(m, !aid); }).join("") || '<p class="cap">За этот период никто не вступал и не выходил.</p>';
    $("mvMore").hidden = list.length <= S.shown;
  }

  /* ---------- альянсы ---------- */
  function weekMoves(id) {
    var a = S.al[id]; if (!a) return "";
    var from = Date.now() / 1000 - 7 * 86400, j = 0, l = 0;
    a.events.forEach(function (e) { if (e.t >= from) { if (e.kind === "join") j++; else l++; } });
    return '<span class="pos">+' + j + '</span> / <span class="neg">−' + l + '</span>';
  }
  function renderAlliances() {
    var rows = S.server.boards.filter(function (b) { return b.slug === "alliance_power"; })[0].rows;
    var head = '<tr><th>#</th><th>Альянс</th><th>Мощь</th><th>Участники</th><th>Лидер</th><th>За неделю вступили / вышли</th></tr>';
    var tr = function (r) {
      var a = S.al[r.id];
      return '<tr' + (a ? ' class="click" data-id="' + r.id + '"' : "") + '><td class="n">' + r.rank + '</td><td><b>[' + esc(r.abbr) + ']</b> ' + esc(r.name) + '</td><td>' + num(r.score) + '</td><td>' + (a ? (a.members_count || a.members.length) + (a.capacity ? "/" + a.capacity : "") : "—") + '</td><td>' + (a && a.leader ? esc(a.leader) : "—") + '</td><td>' + (a ? weekMoves(r.id) : "—") + '</td></tr>';
    };
    $("alTable").innerHTML = head + rows.slice(0, 30).map(tr).join("");
    $("alTable100").innerHTML = '<tr><th>#</th><th>Альянс</th><th>Мощь</th></tr>' + rows.slice(30).map(function (r) { return '<tr><td class="n">' + r.rank + '</td><td><b>[' + esc(r.abbr) + ']</b> ' + esc(r.name) + '</td><td>' + num(r.score) + '</td></tr>'; }).join("");
    $("alTable").addEventListener("click", function (e) { var t = e.target.closest("tr.click"); if (t) openAlliance(t.dataset.id); });
  }
  function rankScore(id) { var r = S.server.boards.filter(function (b) { return b.slug === "alliance_power"; })[0].rows.filter(function (x) { return String(x.id) === String(id); })[0]; return r ? r.score : 0; }
  function openAlliance(id) {
    var a = S.al[id]; if (!a) return;
    var ix = S.index.filter(function (x) { return String(x.id) === String(id); })[0] || {};
    var pts = {};
    Object.keys(ix.hist || {}).forEach(function (d) { if (ix.hist[d].power) pts[d] = ix.hist[d].power; });
    Object.keys(ix.days || {}).forEach(function (d) { if (ix.days[d]) pts[d] = ix.days[d]; });
    var days = Object.keys(pts).sort();
    var mem = a.members.map(function (m, i) {
      return '<tr><td class="n">' + (i + 1) + '</td><td><b>' + esc(m.nick) + '</b></td><td>' + (m.rank ? '<span class="rk r' + esc(m.rank.slice(1)) + '">' + esc(m.rank) + '</span>' : '—') + '</td><td>' + num(m.power) + '</td><td>' + m.lv + '</td><td>' + num(m.kills) + '</td><td>' + (m.honor == null ? "—" : num(m.honor)) + '</td><td>' + (m.tech == null ? "—" : num(m.tech)) + '</td></tr>';
    }).join("");
    var ev = a.events.slice(0, 60).map(function (e) { return moveRow({ e: e, a: a }, false); }).join("");
    $("alDetail").innerHTML = '<div class="block trk-al"><button class="trk-x" aria-label="Закрыть">×</button><h3>[' + esc(a.abbr) + '] ' + esc(a.name) + '</h3>' +
      '<p class="cap">' + (a.leader ? 'Лидер ' + esc(a.leader) + ' · ' : '') + 'участников ' + (a.members_count || a.members.length) + (a.capacity ? '/' + a.capacity : '') + ' · мощь ' + num(a.power || ix.power || rankScore(id)) + (a.level ? ' · уровень альянса ' + a.level : '') + (a.summary ? ' · за неделю +' + a.summary.week.joined + ' / −' + a.summary.week.left + ', за месяц +' + a.summary.month.joined + ' / −' + a.summary.month.left : "") + '</p>' +
      chart(days.map(function (d) { return [d, pts[d]]; }), "Мощь альянса по дням") +
      '<div class="grid2 trk-al2"><div><h3>Состав</h3>' + (a.members.length ? '<div class="tbl trk-scroll"><table class="trk-tbl"><tr><th>#</th><th>Ник</th><th>Ранг</th><th>Мощь</th><th>Св.</th><th>Убийства</th><th>Честь за день</th><th>Технологии за день</th></tr>' + mem + '</table></div>' : '<p class="cap">Свежего состава этого альянса пока нет: у источника данных только устаревшая копия, а с ней в списке оказываются уже ушедшие игроки и старые цифры. Состав появится сам, как только придёт свежая копия.</p>') + '</div>' +
      '<div><h3>Вступления и выходы</h3><div class="trk-list trk-scroll">' + (ev || '<p class="cap">Пока нет.</p>') + '</div></div></div></div>';
    $("alDetail").querySelector(".trk-x").onclick = function () { $("alDetail").innerHTML = ""; };
    $("alDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- игроки ---------- */
  function chart(pts, title) {
    if (pts.length < 2) return '<p class="cap">' + title + ': график появится, когда накопится несколько дней.</p>';
    var W = 640, H = 170, P = 34, v = pts.map(function (p) { return p[1]; }), mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    if (mx === mn) mx = mn + 1;
    var x = function (i) { return P + i * (W - 2 * P) / (pts.length - 1); }, y = function (n) { return H - 24 - (n - mn) * (H - 48) / (mx - mn); };
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
    var dots = pts.map(function (p, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p[1]).toFixed(1) + '" r="3.5"><title>' + p[0] + ": " + num(p[1]) + '</title></circle>'; }).join("");
    return '<div class="trk-chart"><div class="cap">' + title + '</div><svg viewBox="0 0 ' + W + " " + H + '" role="img"><path d="' + line + '" fill="none" stroke="var(--brand,#c67b2c)" stroke-width="3"/>' + dots +
      '<text x="' + P + '" y="' + (H - 6) + '">' + pts[0][0].slice(5) + '</text><text x="' + (W - P) + '" y="' + (H - 6) + '" text-anchor="end">' + pts[pts.length - 1][0].slice(5) + '</text>' +
      '<text x="4" y="' + (y(mx) + 4) + '">' + num(mx) + '</text><text x="4" y="' + (y(mn) + 4) + '">' + num(mn) + '</text></svg></div>';
  }
  function searchPlayers() {
    var q = $("plSearch").value.trim().toLowerCase();
    if (q.length < 2) { $("plResults").innerHTML = ""; return; }
    var res = [];
    Object.keys(S.players).forEach(function (uid) { var p = S.players[uid]; if ((p.nick || "").toLowerCase().indexOf(q) >= 0) res.push([uid, p]); });
    res.sort(function (a, b) { return (b[1].power || 0) - (a[1].power || 0); });
    $("plResults").innerHTML = res.slice(0, 15).map(function (r) {
      var p = r[1];
      return '<div class="trk-row click" data-uid="' + r[0] + '"><img class="av" src="assets/game/doctor.png" alt=""><div class="who"><b>' + esc(p.nick) + '</b><span>' + (p.abbr ? "[" + esc(p.abbr) + "]" : "без альянса") + " · " + num(p.power) + '</span></div><div class="what">' + esc(p.rank || "") + '</div></div>';
    }).join("") || '<p class="cap">Не нашли. Ищутся только игроки 30 сильнейших альянсов.</p>';
  }
  function openPlayer(uid) {
    var p = S.players[uid]; if (!p) return;
    get("s/" + ("0" + (Number(uid) % 32)).slice(-2) + ".json").catch(function () { return {}; }).then(function (s) {
      var ser = s[uid] || {}, days = Object.keys(ser).sort();
      var moves = S.moves.filter(function (m) { return String(m.e.uid) === String(uid); });
      $("plCard").innerHTML = '<div class="block trk-pl"><button class="trk-x" aria-label="Закрыть">×</button><div class="trk-plh"><img class="av big" src="assets/game/doctor.png" alt=""><div><h3>' + esc(p.nick) + '</h3><p class="cap">ID ' + uid + ' · ' + (p.abbr ? "альянс [" + esc(p.abbr) + "]" + (p.rank ? ", ранг " + esc(p.rank) : "") : "без альянса") + '</p></div></div>' +
        '<div class="trk-kv"><div><b>' + num(p.power) + '</b>мощь</div><div><b>' + p.lv + '</b>Святилище</div><div><b>' + num(p.kills) + '</b>убийства</div><div><b>' + ago(p.seen) + '</b>видели в альянсе</div></div>' +
        chart(days.map(function (d) { return [d, ser[d][0]]; }), "Мощь по дням") +
        (moves.length ? '<h3>Вступления и выходы</h3><div class="trk-list">' + moves.map(function (m) { return moveRow(m, true); }).join("") + '</div>' : "") +
        '</div>';
      $("plCard").querySelector(".trk-x").onclick = function () { $("plCard").innerHTML = ""; };
      $("plCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  function renderTop(slug) {
    var b = S.server.boards.filter(function (x) { return x.slug === slug; })[0]; if (!b) return;
    var label = { power: "Мощь", kills: "Убийства", heroes: "Мощь героев", castle: "Святилище" }[slug];
    $("plTop").innerHTML = '<tr><th>#</th><th>Игрок</th><th>Альянс</th><th>' + label + '</th></tr>' + b.rows.map(function (r) {
      return '<tr' + (S.players[r.id] ? ' class="click" data-uid="' + r.id + '"' : "") + '><td class="n">' + r.rank + '</td><td><b>' + esc(r.name) + '</b></td><td>' + (r.abbr ? "[" + esc(r.abbr) + "]" : "—") + '</td><td>' + (slug === "castle" ? r.score : num(r.score)) + '</td></tr>';
    }).join("");
  }

  /* ---------- запуск ---------- */
  Promise.all([get("server.json"), get("alliances.json"), get("players.json")]).then(function (r) {
    S.server = r[0]; S.players = r[2].players;
    S.index = Object.keys(r[1].alliances).map(function (k) { return r[1].alliances[k]; });
    renderFacts();
    var top = S.server.boards.filter(function (b) { return b.slug === "alliance_power"; })[0].rows.slice(0, 30);
    return Promise.all(top.map(function (row) { return get("a/" + row.id + ".json").then(function (a) { S.al[row.id] = a; }).catch(function () {}); }));
  }).then(function () {
    buildMoves(); renderMoves(); renderAlliances(); renderTop("power");
    $("mvAlliance").onchange = function () { S.shown = 40; renderMoves(); };
    $("mvNick").oninput = function () { S.shown = 40; renderMoves(); };
    seg("mvKind", function () { S.shown = 40; renderMoves(); });
    seg("mvPeriod", function () { S.shown = 40; renderMoves(); });
    seg("plBoard", renderTop);
    $("mvMore").onclick = function () { S.shown += 60; renderMoves(); };
    $("plSearch").oninput = searchPlayers;
    document.addEventListener("click", function (e) { var t = e.target.closest("[data-uid].click"); if (t) openPlayer(t.dataset.uid); });
  }).catch(function (e) {
    $("srvUpdated").textContent = "Не удалось загрузить данные сервера: " + e.message;
  });
})();

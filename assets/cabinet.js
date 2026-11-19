/* Кабинет: вход/регистрация, подписка, избранное по группам, выдача подписки (для админа). */
(function () {
  "use strict";
  var T = function (s) { return window.T ? window.T(s) : s; };  // перевод подписей на английской странице (assets/i18n.js)
  var box = document.getElementById("cabList"), acc = document.getElementById("cabAcc");
  if (!box || !window.LAFav) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var fdate = function (d) { return new Date(d).toLocaleDateString(window.LA_LANG === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", year: "numeric" }); };
  var GROUPS = [["Альянс", T("Альянсы")], ["Игрок", T("Игроки")], ["Событие", T("События")], ["Раздел", T("Разделы сайта")]];
  var A = window.LAAuth;

  function accountView(st) {
    if (!A || !A.ready) {
      acc.innerHTML = T('<div class="cab-note"><b>Вход и регистрация скоро заработают.</b> Пока избранное хранится в этом браузере на этом устройстве.</div>');
      return;
    }
    if (!st.user) {
      acc.innerHTML = T('<div class="cab-auth"><div class="cab-tabs"><button type="button" data-m="in" class="on">Вход</button><button type="button" data-m="up">Регистрация</button></div>') +
        T('<form id="authForm"><label>Почта<input type="email" name="e" required autocomplete="email"></label><label>Пароль<input type="password" name="p" required minlength="6" autocomplete="current-password"></label>') +
        T('<label class="nick-row" hidden>Игровой ник<input name="n" maxlength="40" autocomplete="nickname" placeholder="как в игре"></label>') +
        T('<button type="submit" class="btn pri">Войти</button><p class="cab-msg"></p></form>') +
        T('<p class="cab-hint">Без подтверждения почты: зарегистрировался — и сразу в кабинете. Избранное из этого браузера перенесётся в аккаунт и будет на всех устройствах.</p></div>');
      var mode = "in", form = acc.querySelector("#authForm"), msg = acc.querySelector(".cab-msg");
      acc.querySelector(".cab-tabs").onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return; mode = b.dataset.m;
        [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); });
        form.querySelector("button[type=submit]").textContent = mode === "in" ? T("Войти") : T("Зарегистрироваться");
        form.p.autocomplete = mode === "in" ? "current-password" : "new-password"; msg.textContent = "";
        var nr = form.querySelector(".nick-row"); nr.hidden = mode === "in"; form.n.required = mode !== "in";
      };
      form.onsubmit = async function (e) {
        e.preventDefault(); msg.className = "cab-msg"; msg.textContent = T("Секунду…");
        try {
          if (mode === "in") await A.signIn(form.e.value.trim(), form.p.value);
          else {
            if (!form.n.value.trim()) { msg.className = "cab-msg err"; msg.textContent = T("Укажите игровой ник."); return; }
            await A.signUp(form.e.value.trim(), form.p.value, form.n.value.trim());
            try { await A.signIn(form.e.value.trim(), form.p.value); } catch (x) { console.warn("вход после регистрации:", x && x.message); /* вход мог уже произойти сам */ }
          }
          msg.textContent = "";
        } catch (err) {
          var m = String(err && err.message || err);
          msg.className = "cab-msg err";
          msg.textContent = /Invalid login/i.test(m) ? T("Неверная почта или пароль.") : /already registered|exists/i.test(m) ? T("Такая почта уже зарегистрирована — войдите.") : /least 6/i.test(m) ? T("Пароль — не короче 6 символов.") : T("Не получилось: ") + m;
        }
      };
      return;
    }
    var sub = A.hasSub(), pr = st.profile || {};
    var roles = [pr.editor ? T("редактор новостей") : "", pr.leader ? T("лидер альянса") : ""].filter(Boolean).join(" · ");
    var nickLine = ("nick" in pr) ? '<span class="cab-nick">' + T("Игровой ник: ") + "<b>" + (pr.nick ? esc(pr.nick) : "—") + '</b>' + (pr.game_rank ? ' · ' + esc(pr.game_rank) : "") + (roles ? " · " + roles : "") + "</span>" : "";
    acc.innerHTML = '<div class="cab-me"><div><b>' + esc(st.user.email) + "</b>" + nickLine + "<span>" + (sub ? T('Подписка до <b>') + fdate(st.profile.sub_until) + "</b>" : T("Подписки нет")) + T('</span></div><button type="button" class="btn" id="outBtn">Выйти</button></div>') +
      profileHtml(pr) +
      (sub ? "" : T('<div class="cab-note"><b>Подписка</b> открывает «Кто вступил, кто вышел и куда ушёл» с настоящими игроками. Чтобы оформить — напишите лидеру альянса свою почту <b>') + esc(st.user.email) + "</b>.</div>") +
      (st.admin ? adminHtml() : "");
    acc.querySelector("#outBtn").onclick = function () { A.signOut(); };
    var nb = acc.querySelector("#nickBtn");
    if (nb) nb.onclick = async function () {
      var v = prompt(T("Игровой ник (как в игре). После смены администратор проверит его заново."), pr.nick || "");
      if (v == null || !v.trim()) return;
      try { await A.setNick(v); } catch (err) { alert(T("Не получилось: ") + (err.message || err)); }
    };
    bindProfile(pr);
    var mh = acc.querySelector("#myNickHist");
    if (mh) mh.onclick = function () { showNickHistory(st.user.id, pr.nick); };
    if (st.admin) bindAdmin();
  }
  /* ===== мой профиль: ник и ранг в игре ===== */
  function profileHtml(pr) {
    if (!("nick" in pr)) return "";
    var hasRank = "game_rank" in pr;
    return '<div class="cab-prof"><h3>' + T("Мой профиль") + "</h3>" +
      '<form class="cab-prof-row" id="profNick"><label>' + T("Игровой ник") + '<input name="n" maxlength="40" value="' + esc(pr.nick || "") + '" placeholder="' + esc(T("как в игре")) + '"></label>' +
      '<button type="submit" class="btn pri">' + T("Сохранить ник") + '</button><button type="button" class="linkbtn" id="profHist">' + T("история смен ника") + '</button><span class="cab-msg" id="profNickMsg"></span></form>' +
      (hasRank ? '<div class="cab-prof-row"><span class="cab-prof-l">' + T("Ваш ранг в альянсе") + '</span><div class="cab-ranks" id="profRank">' +
        ["R1", "R2", "R3", "R4", "R5"].map(function (r) { return '<button type="button" data-rank="' + r + '" class="' + (pr.game_rank === r ? "on" : "") + '">' + r + "</button>"; }).join("") +
        '</div><span class="cab-msg" id="profRankMsg"></span></div>' : "") + "</div>";
  }
  function bindProfile(pr) {
    var f = acc.querySelector("#profNick"); if (!f) return;
    f.onsubmit = async function (e) {
      e.preventDefault(); var m = acc.querySelector("#profNickMsg"); m.className = "cab-msg";
      var v = f.n.value.trim(); if (!v) { m.className = "cab-msg err"; m.textContent = T("Ник не может быть пустым."); return; }
      if (v === pr.nick) { m.textContent = T("Ник не изменился."); return; }
      m.textContent = T("Секунду…");
      try { await A.setNick(v); m.textContent = T("Сохранено."); } catch (err) { m.className = "cab-msg err"; m.textContent = T("Не получилось: ") + (err.message || err); }
    };
    acc.querySelector("#profHist").onclick = function () { showNickHistory(st.user.id, pr.nick); };
    var rk = acc.querySelector("#profRank");
    if (rk) rk.onclick = async function (e) {
      var b = e.target.closest("[data-rank]"); if (!b) return;
      var m = acc.querySelector("#profRankMsg"); m.className = "cab-msg"; m.textContent = T("Секунду…");
      var v = b.classList.contains("on") ? null : b.dataset.rank;  // повторное нажатие — снять ранг
      var r = await A.call(function () { return A.client.rpc("set_my_rank", { p_rank: v }); });
      if (r.error) { m.className = "cab-msg err"; m.textContent = r.error.message; return; }
      rk.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.dataset.rank === v); });
      if (st.profile) st.profile.game_rank = v;
      m.textContent = T("Сохранено.");
    };
  }
  /* история смены ника (таблица nick_history: человек видит свою, админ — всех) */
  async function showNickHistory(uid, nick) {
    var r = await A.client.from("nick_history").select("old_nick,new_nick,changed_by,changed_at").eq("user_id", uid).order("changed_at", { ascending: false });
    var rows = r.data || [];
    var w = document.createElement("div"); w.className = "nick-gate";
    w.innerHTML = '<div class="nick-box"><h3>' + T("История ника") + (nick ? " · " + esc(nick) : "") + "</h3>" +
      (r.error ? "<p>" + esc(r.error.message) + "</p>" : rows.length ? '<div class="nh-list">' + rows.map(function (h) {
        var by = h.changed_by && h.changed_by !== uid ? T("изменил админ") : T("сам");
        return '<div class="nh"><span>' + new Date(h.changed_at).toLocaleString(window.LA_LANG === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }) + " " + T("МСК") + "</span><b>" +
          (h.old_nick ? esc(h.old_nick) + " → " : T("при регистрации: ")) + esc(h.new_nick || "—") + "</b><em>" + by + "</em></div>";
      }).join("") + "</div>" : "<p>" + T("Смен ника пока не было.") + "</p>") +
      '<div class="nick-btns"><button type="button" class="btn" data-close>' + T("Закрыть") + "</button></div></div>";
    document.body.appendChild(w);
    w.addEventListener("click", function (e) { if (e.target === w || e.target.closest("[data-close]")) w.remove(); });
  }

  function adminHtml() {
    return T('<div class="cab-admin"><h3>Выдать подписку</h3><form id="grantForm"><input type="email" name="e" placeholder="почта пользователя" required>') +
      T('<select name="d"><option value="30">30 дней</option><option value="7">7 дней</option><option value="90">90 дней</option><option value="365">365 дней</option></select>') +
      T('<button type="submit" class="btn pri">Выдать</button><button type="button" class="btn" id="revBtn">Снять</button></form><p class="cab-msg" id="grantMsg"></p>') +
      T('<h3 class="cab-h-users">Пользователи</h3><p class="cab-hint">Отметки ставите только вы. «Редактор» — может публиковать в «Важных новостях». «Лидер» — голос идёт в столбец «Лидеры». «Запрет голосовать» — его голоса не считаются. «Модератор чата» — удаляет сообщения, закрепляет, запускает голосования в чате и запрещает писать. «Запрет в чате» — может читать, но не писать. Голос в конкретном голосовании можно снять на странице новостей.</p>') +
      '<p class="cab-hint" id="storeUsed"></p><div id="userList"></div></div>';
  }
  async function bindAdmin() {
    var f = acc.querySelector("#grantForm"), m = acc.querySelector("#grantMsg"), sb = A.client;
    var ul = acc.querySelector("#userList"), rowsAll = [], filt = "", hist = {};  // hist: id → сколько записей в истории ника
    var FLAGS = [["verified", T("Проверен")], ["editor", T("Редактор")], ["leader", T("Лидер")], ["vote_banned", T("Запрет голосовать")], ["moderator", T("Модератор чата")], ["chat_banned", T("Запрет в чате")]];
    function drawUsers() {
      var cnt = {};
      rowsAll.forEach(function (u) { var k = (u.nick || "").trim().toLowerCase(); if (k) cnt[k] = (cnt[k] || 0) + 1; });
      var q = filt.trim().toLowerCase();
      var rows = rowsAll.filter(function (u) { return !q || (u.email || "").toLowerCase().indexOf(q) !== -1 || (u.nick || "").toLowerCase().indexOf(q) !== -1; });
      var full = rowsAll.length && ("nick" in rowsAll[0]);
      var flags = FLAGS.filter(function (f) { return !rowsAll.length || (f[0] in rowsAll[0]); });  // база без полей чата — без этих столбцов
      ul.innerHTML = (full ? '<input type="search" id="userFilt" class="cab-filt" placeholder="' + esc(T("поиск по нику или почте")) + '" value="' + esc(filt) + '">' : "") +
        '<div class="cab-users-wrap"><table class="cab-users"><tr>' + (full ? "<th>" + T("Ник") + "</th>" : "") + T("<th>Почта</th><th>Подписка до</th><th>Зарегистрирован</th>") +
        (full ? flags.map(function (f) { return "<th>" + f[1] + "</th>"; }).join("") : "") + "</tr>" +
        rows.map(function (u) {
          var on = u.sub_until && new Date(u.sub_until) > new Date();
          var dup = u.nick && cnt[u.nick.trim().toLowerCase()] > 1;
          return "<tr>" + (full ? '<td class="nk"><b>' + (u.nick ? esc(u.nick) : "—") + "</b>" + (u.game_rank ? ' <em class="cm-tag ld">' + esc(u.game_rank) + "</em>" : "") + (dup ? ' <em class="dup" title="' + esc(T("этот ник указан у нескольких аккаунтов")) + '">' + T("двойник") + "</em>" : "") +
            ' <button type="button" class="linkbtn" data-nick="' + esc(u.id) + '" data-cur="' + esc(u.nick || "") + '">✎</button>' +
            (hist[u.id] > 1 ? ' <button type="button" class="linkbtn nh-btn" data-hist="' + esc(u.id) + '" data-hn="' + esc(u.nick || "") + '">' + T("история") + " (" + (hist[u.id] - 1) + ")</button>" : "") + "</td>" : "") +
            "<td>" + esc(u.email) + '</td><td class="' + (on ? "on" : "") + '">' + (u.sub_until ? fdate(u.sub_until) : "—") + "</td><td>" + fdate(u.created_at) + "</td>" +
            (full ? flags.map(function (f) { return '<td class="fl"><input type="checkbox" data-u="' + esc(u.id) + '" data-f="' + f[0] + '"' + (u[f[0]] ? " checked" : "") + "></td>"; }).join("") : "") + "</tr>";
        }).join("") + "</table></div>";
      var fi = ul.querySelector("#userFilt");
      if (fi) fi.oninput = function () { filt = fi.value; var pos = fi.selectionStart; drawUsers(); var n = ul.querySelector("#userFilt"); n.focus(); n.setSelectionRange(pos, pos); };
    }
    ul.addEventListener("change", async function (e) {
      var cb = e.target.closest("input[data-f]"); if (!cb) return;
      cb.disabled = true;
      var r = await sb.rpc("set_user_flag", { p_user: cb.dataset.u, p_flag: cb.dataset.f, p_on: cb.checked });
      cb.disabled = false;
      if (r.error) { cb.checked = !cb.checked; alert(r.error.message); return; }
      rowsAll.forEach(function (u) { if (u.id === cb.dataset.u) u[cb.dataset.f] = cb.checked; });
    });
    ul.addEventListener("click", async function (e) {
      var hb = e.target.closest("[data-hist]"); if (hb) return showNickHistory(hb.dataset.hist, hb.dataset.hn);
      var b = e.target.closest("[data-nick]"); if (!b) return;
      var v = prompt(T("Ник этого пользователя:"), b.dataset.cur);
      if (v == null) return;
      var r = await sb.rpc("admin_set_nick", { p_user: b.dataset.nick, p_nick: v });
      if (r.error) { alert(r.error.message); return; }
      list();
    });
    async function list() {
      var r = await sb.rpc("list_users4");
      if (r.error) r = await sb.rpc("list_users3");  // база без ранга
      if (r.error) r = await sb.rpc("list_users2");  // база без полей чата
      if (r.error) r = await sb.rpc("list_users");  // база ещё без полей «Важных новостей»
      rowsAll = r.data || [];
      var hr = await sb.from("nick_history").select("user_id");
      hist = {}; (hr.data || []).forEach(function (h) { hist[h.user_id] = (hist[h.user_id] || 0) + 1; });
      drawUsers();
      var s = await sb.rpc("news_storage_used");
      var se = acc.querySelector("#storeUsed");
      if (se && !s.error) se.textContent = T("Скрины новостей: занято ") + (s.data / 1048576).toFixed(1) + T(" МБ из 1024 МБ");
    }
    f.onsubmit = async function (e) {
      e.preventDefault(); m.className = "cab-msg"; m.textContent = "…";
      var r = await sb.rpc("grant_sub", { p_email: f.e.value.trim(), p_days: +f.d.value });
      if (r.error) { m.className = "cab-msg err"; m.textContent = r.error.message; } else { m.textContent = T("Готово: подписка до ") + fdate(r.data); list(); }
    };
    acc.querySelector("#revBtn").onclick = async function () {
      if (!f.e.value.trim()) return;
      var r = await sb.rpc("revoke_sub", { p_email: f.e.value.trim() });
      m.className = r.error ? "cab-msg err" : "cab-msg"; m.textContent = r.error ? r.error.message : T("Подписка снята."); list();
    };
    list();
  }

  function draw() {
    var l = LAFav.list();
    if (!l.length) {
      box.innerHTML = T('<div class="cab-empty"><b>Пока пусто.</b><span>Открой любую страницу — у разделов и событий есть кнопка «☆ В избранное», а на странице «Сервер 397» — у альянсов и игроков.</span><a class="btn pri" href="events.html">Например, события</a></div>');
      return;
    }
    box.innerHTML = GROUPS.map(function (g) {
      var items = l.filter(function (x) { return (x.kind || "Раздел") === g[0]; });
      if (!items.length) return "";
      return '<div class="cab-grp"><h3>' + g[1] + " <i>" + items.length + '</i></h3><div class="cab-items">' + items.map(function (x) {
        return '<div class="cab-it">' + (x.icon ? '<img src="' + esc(x.icon) + '" alt="">' : '<span class="ph">★</span>') + '<a href="' + esc(x.url) + '"><b>' + esc(x.title) + "</b><span>" + esc(x.page || "") + "</span></a>" +
          '<button type="button" data-rm="' + esc(x.url) + T('" title="Убрать из избранного">Убрать</button></div>');
      }).join("") + "</div></div>";
    }).join("");
  }
  box.addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) { LAFav.remove(b.dataset.rm); draw(); } });
  LAFav.onchange(draw);
  draw();
  if (A) A.on(accountView); else accountView({});
})();

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
        '<p class="cab-hint nick-found" id="nickFound" hidden></p>' +
        T('<button type="submit" class="btn pri">Войти</button><p class="cab-msg"></p></form>') +
        T('<p class="cab-hint">Без подтверждения почты: зарегистрировался — и сразу в кабинете. Избранное из этого браузера перенесётся в аккаунт и будет на всех устройствах.</p></div>');
      var mode = "in", form = acc.querySelector("#authForm"), msg = acc.querySelector(".cab-msg");
      acc.querySelector(".cab-tabs").onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return; mode = b.dataset.m;
        [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); });
        form.querySelector("button[type=submit]").textContent = mode === "in" ? T("Войти") : T("Зарегистрироваться");
        form.p.autocomplete = mode === "in" ? "current-password" : "new-password"; msg.textContent = "";
        var nr = form.querySelector(".nick-row"); nr.hidden = mode === "in"; form.n.required = mode !== "in";
        if (mode === "in") form.querySelector("#nickFound").hidden = true;
      };
      nickLookup(form.n, form.querySelector("#nickFound"));
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
    var nickLine = ("nick" in pr) ? '<span class="cab-nick">' + T("Игровой ник: ") + "<b>" + (pr.nick ? esc(pr.nick) : "—") + '</b>' + (pr.al_abbr ? " · [" + esc(pr.al_abbr) + "]" : "") + (pr.game_rank ? ' · ' + esc(pr.game_rank) : "") + (roles ? " · " + roles : "") + "</span>" : "";
    acc.innerHTML = '<div class="cab-me"><div><b>' + esc(st.user.email) + "</b>" + nickLine + "<span>" + (sub ? T('Подписка до <b>') + fdate(st.profile.sub_until) + "</b>" : T("Подписки нет")) + T('</span></div><button type="button" class="btn" id="outBtn">Выйти</button></div>') +
      profileHtml(pr) + allyHtml(pr, st) +
      (sub ? "" : T('<div class="cab-note"><b>Подписка</b> открывает «Кто вступил, кто вышел и куда ушёл» с настоящими игроками. Чтобы оформить — напишите лидеру альянса свою почту <b>') + esc(st.user.email) + "</b>.</div>") +
      (st.admin ? adminHtml() : "");
    acc.querySelector("#outBtn").onclick = function () { A.signOut(); };
    var nb = acc.querySelector("#nickBtn");
    if (nb) nb.onclick = async function () {
      var v = prompt(T("Игровой ник (как в игре). После смены администратор проверит его заново."), pr.nick || "");
      if (v == null || !v.trim()) return;
      try { await A.setNick(v); } catch (err) { alert(T("Не получилось: ") + (err.message || err)); }
    };
    bindProfile(pr, st);
    bindAlly(pr, st);
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
      '<p class="cab-hint nick-found" id="profFound" hidden></p>' +
      ("al_abbr" in pr ? allyStatusHtml(pr) :
      hasRank ? '<div class="cab-prof-row"><span class="cab-prof-l">' + T("Ваш ранг в альянсе") + '</span><div class="cab-ranks" id="profRank">' +
        ["R1", "R2", "R3", "R4", "R5"].map(function (r) { return '<button type="button" data-rank="' + r + '" class="' + (pr.game_rank === r ? "on" : "") + '">' + r + "</button>"; }).join("") +
        '</div><span class="cab-msg" id="profRankMsg"></span></div>' : "") + "</div>";
  }
  /* альянс и ранг — из трекера по нику; «обычный» ранг — после подтверждения лидером альянса */
  function allyStatusHtml(pr) {
    var body = pr.al_abbr
      ? "<b>[" + esc(pr.al_abbr) + "]" + (pr.game_rank ? " · " + esc(pr.game_rank) : "") + "</b> " +
        (pr.al_ok ? '<em class="al-ok">✓ ' + T("подтверждено лидером альянса") + "</em>"
                  : '<em class="al-wait">' + T("ждёт подтверждения лидера альянса — до этого ранг в чате серый") + "</em>")
      : '<em class="al-wait">' + T("ник не найден в составах топ-30 альянсов трекера — проверьте, что он написан точно как в игре") + "</em>";
    return '<div class="cab-prof-row"><span class="cab-prof-l">' + T("Альянс и ранг") + '</span><span class="cab-al">' + body + "</span></div>" +
      '<p class="cab-hint">' + T("Альянс и ранг берутся из игры через трекер по вашему нику и обновляются сами. У альянсов, где трекер рангов не знает, ранг ставит лидер альянса.") + "</p>";
  }
  /* подсказка под полем ника: нашёлся ли такой ник в составах альянсов трекера */
  function nickLookup(input, out) {
    if (!input || !out || !A.client) return;
    var tm = null, seq = 0;
    input.addEventListener("input", function () {
      clearTimeout(tm); var v = input.value.trim(), my = ++seq;
      if (!v) { out.hidden = true; return; }
      tm = setTimeout(async function () {
        var r = await A.client.rpc("roster_lookup", { p_nick: v });
        if (my !== seq) return;
        if (r.error) { out.hidden = true; console.warn("кабинет: поиск ника в трекере", r.error.message); return; }  // база без supabase_alliance.sql
        var x = (r.data || [])[0];
        out.hidden = false; out.className = "cab-hint nick-found " + (x ? "ok" : "no");
        out.innerHTML = x
          ? T("Найден в трекере: ") + "<b>[" + esc(x.al_abbr) + "]" + (x.rank ? " · " + esc(x.rank) : "") + "</b>" + (x.nick && x.nick !== v ? " (" + T("в игре: ") + esc(x.nick) + ")" : "") + ". " + T("Ранг станет обычным после подтверждения лидером альянса.")
          : T("В составах топ-30 альянсов трекера такой ник не найден. Проверьте, что ник написан точно как в игре.");
      }, 450);
    });
  }

  /* ===== «Мой альянс»: лидер подтверждает своих (админ — любой альянс) ===== */
  function allyHtml(pr, st) {
    if (!("leader_al" in pr)) return "";
    if (!st.admin && !(pr.leader && pr.leader_al)) {
      return pr.leader ? '<div class="cab-ally"><h3>' + T("Мой альянс") + '</h3><p class="cab-hint">' + T("Альянс лидера ещё не определён: ваш ник не найден в составах трекера. Администратор может указать альянс вручную.") + "</p></div>" : "";
    }
    return '<div class="cab-ally" id="allyBox"><h3>' + T("Мой альянс") + "</h3>" +
      '<p class="cab-hint">' + T("Здесь вы подтверждаете, что человек на сайте — действительно ваш участник: кнопка «✓ Это наш». Только после этого его ранг в чате становится обычным (не серым). Подтвердить можно только тех, кто есть в составе вашего альянса по трекеру.") + "</p>" +
      '<div class="ally-bar">' + (st.admin ? '<select id="allySel"><option value="">…</option></select>' : "") +
      '<label class="ally-all"><input type="checkbox" id="allyAll"> ' + T("показать весь состав (и тех, кого нет на сайте)") + "</label>" +
      '<button type="button" class="linkbtn" id="allyLog">' + T("журнал подтверждений") + "</button></div>" +
      '<p class="cab-msg" id="allyMsg"></p><div id="allyList">' + T("Загружаю…") + "</div></div>";
  }
  function bindAlly(pr, st) {
    var boxA = acc.querySelector("#allyBox"); if (!boxA) return;
    var sb = A.client, rows = [], showAll = false, cur = null;
    var list = boxA.querySelector("#allyList"), msg = boxA.querySelector("#allyMsg"), sel = boxA.querySelector("#allySel");
    var RANKS = st.admin ? ["R1", "R2", "R3", "R4", "R5"] : ["R1", "R2", "R3", "R4"];
    function draw() {
      if (!rows.length) { list.innerHTML = '<p class="cab-hint">' + T("Состав альянса ещё не пришёл от трекера — робот присылает его раз в 30 минут.") + "</p>"; return; }
      var a = rows[0], site = rows.filter(function (x) { return x.user_id; });
      var ok = site.filter(function (x) { return x.al_ok; }).length;
      var shown = showAll ? rows : site;
      list.innerHTML = '<p class="ally-sum"><b>[' + esc(a.al_abbr) + "]</b> · " + T("в составе по трекеру: ") + rows.filter(function (x, i, s) { return s.findIndex(function (y) { return y.uid === x.uid; }) === i; }).length +
        " · " + T("на сайте: ") + site.length + " · " + T("подтверждено: ") + ok + "</p>" +
        '<p class="cab-hint">' + (a.ranks_known ? T("Ранги — из игры (трекер), их никто не меняет; вы подтверждаете только, что это ваш человек.") : T("Трекер рангов этого альянса не знает — ранг выбираете вы при подтверждении (R5 ставит только администратор).")) + "</p>" +
        (shown.length ? '<div class="cab-users-wrap"><table class="cab-users ally-t"><tr><th>' + T("Ник в игре") + "</th><th>" + T("Ранг") + "</th><th>" + T("На сайте") + "</th><th>" + T("Статус") + "</th><th></th></tr>" +
        shown.map(function (x) {
          if (!x.user_id) return '<tr class="off"><td>' + esc(x.game_nick) + "</td><td>" + esc(x.tracker_rank || "—") + '</td><td colspan="3">' + T("нет на сайте") + "</td></tr>";
          var self = st.user && x.user_id === st.user.id && !st.admin;
          var dup = x.dup > 1 ? ' <em class="dup" title="' + esc(T("этот ник указан у нескольких аккаунтов — подтвердить может только администратор")) + '">' + T("двойник") + " ×" + x.dup + "</em>" : "";
          var rk = x.tracker_rank ? esc(x.tracker_rank)
            : self ? esc(x.game_rank || "—")
            : '<select data-rk="' + esc(x.user_id) + '"><option value="">—</option>' + RANKS.map(function (r) { return '<option' + (x.rank_src === "leader" && x.game_rank === r ? " selected" : "") + ">" + r + "</option>"; }).join("") +
              (!st.admin && x.game_rank === "R5" ? "<option selected>R5</option>" : "") + "</select>";
          var stt = x.al_ok ? '<em class="al-ok">✓ ' + T("подтверждён") + "</em>" : '<em class="al-wait">' + T("ждёт") + "</em>";
          var act = self ? '<span class="cab-hint">' + T("это вы") + "</span>"
            : x.al_ok ? '<button type="button" class="btn" data-ok="' + esc(x.user_id) + '" data-on="0">' + T("Снять") + "</button>"
            : '<button type="button" class="btn pri" data-ok="' + esc(x.user_id) + '" data-on="1">✓ ' + T("Это наш") + "</button>";
          return "<tr><td>" + esc(x.game_nick) + "</td><td>" + rk + "</td><td><b>" + esc(x.site_nick || "") + "</b>" + dup + "</td><td>" + stt + "</td><td>" + act + "</td></tr>";
        }).join("") + "</table></div>" : '<p class="cab-hint">' + T("Из этого альянса на сайте пока никого нет.") + "</p>");
    }
    async function load() {
      var r = await A.call(function () { return sb.rpc("alliance_members", cur ? { p_al: cur } : {}); });
      if (r.error) { list.innerHTML = '<p class="cab-msg err">' + esc(r.error.message) + "</p>"; return; }
      rows = r.data || [];
      if (rows.length && !cur) cur = rows[0].al_id;
      if (sel && cur) sel.value = String(cur);
      draw();
    }
    async function confirmRow(uid, on, rank) {
      msg.className = "cab-msg"; msg.textContent = T("Секунду…");
      var r = await A.call(function () { return sb.rpc("alliance_confirm", { p_user: uid, p_on: on, p_rank: rank || null }); });
      if (r.error) { msg.className = "cab-msg err"; msg.textContent = T("Не получилось: ") + r.error.message; return; }
      msg.textContent = on ? T("Подтверждено.") : T("Подтверждение снято.");
      load();
    }
    list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ok]"); if (!b) return;
      var on = b.dataset.on === "1", s = list.querySelector('select[data-rk="' + b.dataset.ok + '"]');
      if (!on && !confirm(T("Снять подтверждение? Ранг этого человека в чате снова станет серым."))) return;
      confirmRow(b.dataset.ok, on, on && s ? s.value : null);
    });
    list.addEventListener("change", function (e) {
      var s = e.target.closest("select[data-rk]"); if (!s) return;
      var x = rows.filter(function (y) { return y.user_id === s.dataset.rk; })[0];
      if (x && x.al_ok && s.value) confirmRow(x.user_id, true, s.value);  // уже подтверждён — ранг меняется сразу
    });
    boxA.querySelector("#allyAll").onchange = function () { showAll = this.checked; draw(); };
    boxA.querySelector("#allyLog").onclick = function () { showAllyLog(cur); };
    if (sel) {
      sb.rpc("roster_alliances").then(function (r) {
        if (r.error) { console.warn("кабинет: список альянсов", r.error.message); return; }
        sel.innerHTML = (r.data || []).map(function (a) { return '<option value="' + a.al_id + '">[' + esc(a.al_abbr) + "] · " + a.members + "</option>"; }).join("");
        if (cur) sel.value = String(cur);
      });
      sel.onchange = function () { cur = +sel.value || null; load(); };
    }
    load();
  }
  async function showAllyLog(al) {
    var q = A.client.from("alliance_log").select("nick,al_abbr,action,rank,by_nick,at").order("at", { ascending: false }).range(0, 999);
    if (al) q = q.eq("al_id", al);
    var r = await q, rows = r.data || [];
    var ACT = { confirm: T("подтвердил"), unconfirm: T("снял подтверждение"), auto_off: T("подтверждение снято само: сменил ник или ушёл из альянса") };
    var w = document.createElement("div"); w.className = "nick-gate";
    w.innerHTML = '<div class="nick-box"><h3>' + T("Журнал подтверждений") + "</h3>" +
      (r.error ? "<p>" + esc(r.error.message) + "</p>" : rows.length ? '<div class="nh-list">' + rows.map(function (h) {
        return '<div class="nh"><span>' + new Date(h.at).toLocaleString(window.LA_LANG === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }) + " " + T("МСК") + "</span><b>" +
          esc(h.nick || "?") + (h.rank ? " · " + esc(h.rank) : "") + " [" + esc(h.al_abbr || "") + "]</b><em>" + (h.by_nick ? esc(h.by_nick) + " — " : "") + (ACT[h.action] || esc(h.action)) + "</em></div>";
      }).join("") + "</div>" : "<p>" + T("Записей пока нет.") + "</p>") +
      '<div class="nick-btns"><button type="button" class="btn" data-close>' + T("Закрыть") + "</button></div></div>";
    document.body.appendChild(w);
    w.addEventListener("click", function (e) { if (e.target === w || e.target.closest("[data-close]")) w.remove(); });
  }
  function bindProfile(pr, st) {
    var f = acc.querySelector("#profNick"); if (!f) return;
    f.onsubmit = async function (e) {
      e.preventDefault(); var m = acc.querySelector("#profNickMsg"); m.className = "cab-msg";
      var v = f.n.value.trim(); if (!v) { m.className = "cab-msg err"; m.textContent = T("Ник не может быть пустым."); return; }
      if (v === pr.nick) { m.textContent = T("Ник не изменился."); return; }
      m.textContent = T("Секунду…");
      try { await A.setNick(v); m.textContent = T("Сохранено."); } catch (err) { m.className = "cab-msg err"; m.textContent = T("Не получилось: ") + (err.message || err); }
    };
    acc.querySelector("#profHist").onclick = function () { showNickHistory(st.user.id, pr.nick); };
    nickLookup(f.n, acc.querySelector("#profFound"));
    var rk = acc.querySelector("#profRank");
    if (rk) rk.onclick = async function (e) {
      var b = e.target.closest("[data-rank]"); if (!b) return;
      var m = acc.querySelector("#profRankMsg"); m.className = "cab-msg"; m.textContent = T("Секунду…");
      var v = b.classList.contains("on") ? null : b.dataset.rank;  // повторное нажатие — снять ранг
      try {
        var r = await A.call(function () { return A.client.rpc("set_my_rank", { p_rank: v }); });
        if (r.error) throw r.error;
        rk.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.dataset.rank === v); });
        if (st.profile) st.profile.game_rank = v;
        pr.game_rank = v;
        m.textContent = v ? T("Сохранено.") : T("Ранг снят.");
      } catch (err) { m.className = "cab-msg err"; m.textContent = T("Не получилось: ") + (err.message || err); }
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
      '<p class="cab-hint">' + T("Альянс и ранг рядом с ником берутся из трекера по нику; ✓ — человека подтвердил лидер его альянса (серый — ещё нет). «Лидер» подтверждает людей своего альянса в разделе «Мой альянс»; его альянс подставляется сам по нику, поменять — в списке рядом с ником.") + "</p>" +
      '<p class="cab-hint" id="storeUsed"></p><div id="userList"></div></div>';
  }
  async function bindAdmin() {
    var f = acc.querySelector("#grantForm"), m = acc.querySelector("#grantMsg"), sb = A.client;
    var ul = acc.querySelector("#userList"), rowsAll = [], filt = "", hist = {};  // hist: id → сколько записей в истории ника
    var allies = [];  // альянсы из составов трекера — для выбора альянса лидера
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
          return "<tr>" + (full ? '<td class="nk"><b>' + (u.nick ? esc(u.nick) : "—") + "</b>" + (u.al_abbr ? ' <em class="cm-tag rk' + (u.al_ok ? "" : " un") + '" title="' + esc(u.al_ok ? T("подтверждён лидером альянса") : T("не подтверждён лидером альянса")) + '">[' + esc(u.al_abbr) + "]" + (u.game_rank ? " " + esc(u.game_rank) : "") + (u.al_ok ? " ✓" : "") + "</em>"
              : u.game_rank ? ' <em class="cm-tag ld">' + esc(u.game_rank) + "</em>" : "") +
            (u.leader && ("leader_al" in u) ? ' <span class="ld-al">' + T("лидер альянса") + ' <select data-lal="' + esc(u.id) + '"><option value="">—</option>' +
              allies.map(function (a) { return '<option value="' + a.al_id + '"' + (+u.leader_al === +a.al_id ? " selected" : "") + ">[" + esc(a.al_abbr) + "]</option>"; }).join("") + "</select></span>" : "") + (dup ? ' <em class="dup" title="' + esc(T("этот ник указан у нескольких аккаунтов")) + '">' + T("двойник") + "</em>" : "") +
            ' <button type="button" class="linkbtn" data-nick="' + esc(u.id) + '" data-cur="' + esc(u.nick || "") + '">✎</button>' +
            (hist[u.id] > 1 ? ' <button type="button" class="linkbtn nh-btn" data-hist="' + esc(u.id) + '" data-hn="' + esc(u.nick || "") + '">' + T("история") + " (" + (hist[u.id] - 1) + ")</button>" : "") + "</td>" : "") +
            "<td>" + esc(u.email) + '</td><td class="' + (on ? "on" : "") + '">' + (u.sub_until ? fdate(u.sub_until) : "—") + "</td><td>" + fdate(u.created_at) + "</td>" +
            (full ? flags.map(function (f) { return '<td class="fl"><input type="checkbox" data-u="' + esc(u.id) + '" data-f="' + f[0] + '"' + (u[f[0]] ? " checked" : "") + "></td>"; }).join("") : "") + "</tr>";
        }).join("") + "</table></div>";
      var fi = ul.querySelector("#userFilt");
      if (fi) fi.oninput = function () { filt = fi.value; var pos = fi.selectionStart; drawUsers(); var n = ul.querySelector("#userFilt"); n.focus(); n.setSelectionRange(pos, pos); };
    }
    ul.addEventListener("change", async function (e) {
      var ls = e.target.closest("select[data-lal]");
      if (ls) {
        ls.disabled = true;
        var rl = await sb.rpc("set_leader_al", { p_user: ls.dataset.lal, p_al: ls.value ? +ls.value : null });
        ls.disabled = false;
        if (rl.error) alert(rl.error.message);
        return list();
      }
      var cb = e.target.closest("input[data-f]"); if (!cb) return;
      cb.disabled = true;
      var r = await sb.rpc("set_user_flag", { p_user: cb.dataset.u, p_flag: cb.dataset.f, p_on: cb.checked });
      cb.disabled = false;
      if (r.error) { cb.checked = !cb.checked; alert(r.error.message); return; }
      rowsAll.forEach(function (u) { if (u.id === cb.dataset.u) u[cb.dataset.f] = cb.checked; });
      if (cb.dataset.f === "leader") list();  // альянс лидера подставился сам — показать
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
      var r = await sb.rpc("list_users5");
      if (!r.error) { var ra = await sb.rpc("roster_alliances"); allies = ra.data || []; }
      if (r.error) r = await sb.rpc("list_users4");  // база без supabase_alliance.sql
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

/* Кабинет: вход/регистрация, подписка, избранное по группам, выдача подписки (для админа). */
(function () {
  "use strict";
  var T = window.T || function (s) { return s; };  // перевод подписей на английской странице (assets/i18n.js)
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
        T('<button type="submit" class="btn pri">Войти</button><p class="cab-msg"></p></form>') +
        T('<p class="cab-hint">Без подтверждения почты: зарегистрировался — и сразу в кабинете. Избранное из этого браузера перенесётся в аккаунт и будет на всех устройствах.</p></div>');
      var mode = "in", form = acc.querySelector("#authForm"), msg = acc.querySelector(".cab-msg");
      acc.querySelector(".cab-tabs").onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return; mode = b.dataset.m;
        [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); });
        form.querySelector("button[type=submit]").textContent = mode === "in" ? T("Войти") : T("Зарегистрироваться");
        form.p.autocomplete = mode === "in" ? "current-password" : "new-password"; msg.textContent = "";
      };
      form.onsubmit = async function (e) {
        e.preventDefault(); msg.className = "cab-msg"; msg.textContent = T("Секунду…");
        try {
          if (mode === "in") await A.signIn(form.e.value.trim(), form.p.value);
          else { await A.signUp(form.e.value.trim(), form.p.value); try { await A.signIn(form.e.value.trim(), form.p.value); } catch (x) { /* вход после регистрации может уже произойти сам */ } }
          msg.textContent = "";
        } catch (err) {
          var m = String(err && err.message || err);
          msg.className = "cab-msg err";
          msg.textContent = /Invalid login/i.test(m) ? T("Неверная почта или пароль.") : /already registered|exists/i.test(m) ? T("Такая почта уже зарегистрирована — войдите.") : /least 6/i.test(m) ? T("Пароль — не короче 6 символов.") : T("Не получилось: ") + m;
        }
      };
      return;
    }
    var sub = A.hasSub();
    acc.innerHTML = '<div class="cab-me"><div><b>' + esc(st.user.email) + '</b><span>' + (sub ? T('Подписка до <b>') + fdate(st.profile.sub_until) + "</b>" : T("Подписки нет")) + T('</span></div><button type="button" class="btn" id="outBtn">Выйти</button></div>') +
      (sub ? "" : T('<div class="cab-note"><b>Подписка</b> открывает «Кто вступил, кто вышел и куда ушёл» с настоящими игроками. Чтобы оформить — напишите лидеру альянса свою почту <b>') + esc(st.user.email) + "</b>.</div>") +
      (st.admin ? adminHtml() : "");
    acc.querySelector("#outBtn").onclick = function () { A.signOut(); };
    if (st.admin) bindAdmin();
  }

  function adminHtml() {
    return T('<div class="cab-admin"><h3>Выдать подписку</h3><form id="grantForm"><input type="email" name="e" placeholder="почта пользователя" required>') +
      T('<select name="d"><option value="30">30 дней</option><option value="7">7 дней</option><option value="90">90 дней</option><option value="365">365 дней</option></select>') +
      T('<button type="submit" class="btn pri">Выдать</button><button type="button" class="btn" id="revBtn">Снять</button></form><p class="cab-msg" id="grantMsg"></p><div id="userList"></div></div>');
  }
  async function bindAdmin() {
    var f = acc.querySelector("#grantForm"), m = acc.querySelector("#grantMsg"), sb = A.client;
    async function list() {
      var r = await sb.rpc("list_users");
      var rows = r.data || [];
      acc.querySelector("#userList").innerHTML = T('<table class="cab-users"><tr><th>Почта</th><th>Подписка до</th><th>Зарегистрирован</th></tr>') +
        rows.map(function (u) { var on = u.sub_until && new Date(u.sub_until) > new Date(); return "<tr><td>" + esc(u.email) + '</td><td class="' + (on ? "on" : "") + '">' + (u.sub_until ? fdate(u.sub_until) : "—") + "</td><td>" + fdate(u.created_at) + "</td></tr>"; }).join("") + "</table>";
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

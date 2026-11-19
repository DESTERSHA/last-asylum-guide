/* Аккаунты (Supabase): вход/регистрация по почте и паролю, избранное в аккаунте, подписка.
   Адрес и публичный ключ — в assets/auth-config.js (window.LA_SB = {url, key}). Пока их нет — всё работает как раньше, без входа. */
(function () {
  "use strict";
  var CFG = window.LA_SB || {};
  var ready = !!(CFG.url && CFG.key && window.supabase);
  var sb = ready ? window.supabase.createClient(CFG.url, CFG.key) : null;
  var state = { user: null, profile: null, admin: false };
  var subs = [];
  function emit() { subs.forEach(function (f) { try { f(state); } catch (e) { console.warn(e); } }); }
  async function loadProfile() {
    if (!sb || !state.user) { state.profile = null; state.admin = false; return; }
    var r = await sb.from("profiles").select("email,sub_until,created_at,nick,verified,editor,leader,vote_banned,moderator,chat_banned,chat_muted_until,chat_kicked,game_rank,al_abbr,al_ok,rank_src,leader_al,leader_al_abbr").eq("id", state.user.id).maybeSingle();
    if (r.error) r = await sb.from("profiles").select("email,sub_until,created_at,nick,verified,editor,leader,vote_banned,moderator,chat_banned,chat_muted_until,chat_kicked,game_rank").eq("id", state.user.id).maybeSingle();  // без supabase_alliance.sql
    if (r.error) r =await sb.from("profiles").select("email,sub_until,created_at,nick,verified,editor,leader,vote_banned,moderator,chat_banned,chat_muted_until,chat_kicked").eq("id", state.user.id).maybeSingle();  // без supabase_rank.sql
    if (r.error) r = await sb.from("profiles").select("email,sub_until,created_at,nick,verified,editor,leader,vote_banned,moderator,chat_banned").eq("id", state.user.id).maybeSingle();  // без supabase_chat2.sql
    if (r.error) {  // база ещё без полей чата (supabase_chat.sql не выполнен)
      r = await sb.from("profiles").select("email,sub_until,created_at,nick,verified,editor,leader,vote_banned").eq("id", state.user.id).maybeSingle();
    }
    if (r.error) {  // база ещё без полей «Важных новостей» (SQL не выполнен) — читаем как раньше
      console.warn("Кабинет: профиль без полей новостей", r.error.message);
      r = await sb.from("profiles").select("email,sub_until,created_at").eq("id", state.user.id).maybeSingle();
    }
    state.profile = r.data || null;
    var a = await sb.rpc("is_admin"); state.admin = !!a.data;
  }
  /* избранное: после входа — объединяем то, что было в браузере, с аккаунтом */
  async function syncFavs() {
    if (!sb || !state.user || !window.LAFav) return;
    var local = window.LAFav.list();
    var r = await sb.from("favorites").select("url,title,page,kind,icon,t");
    var server = r.data || [];
    var have = {}; server.forEach(function (x) { have[x.url] = 1; });
    var add = local.filter(function (x) { return !have[x.url]; }).map(function (x) { return { user_id: state.user.id, url: x.url, title: x.title, page: x.page, kind: x.kind, icon: x.icon || "", t: x.t || Date.now() }; });
    if (add.length) await sb.from("favorites").upsert(add);
    var all = server.concat(add.map(function (x) { return { url: x.url, title: x.title, page: x.page, kind: x.kind, icon: x.icon, t: x.t }; }));
    all.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    window.LAFav._replace(all);
  }
  function hasSub() { return !!(state.profile && state.profile.sub_until && new Date(state.profile.sub_until) > new Date()); }
  var T = function (s) { return window.T ? window.T(s) : s; };
  var escA = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  /* у аккаунта нет игрового ника (зарегистрирован до появления поля) — окно «укажите игровой ник» на любой странице */
  function nickGate() {
    var p = state.profile, old = document.getElementById("nickGate");
    var need = state.user && p && ("nick" in p) && !p.nick;
    if (!need) { if (old) old.remove(); return; }
    if (old) return;
    var w = document.createElement("div");
    w.id = "nickGate"; w.className = "nick-gate";
    w.innerHTML = '<form class="nick-box"><h3>' + T("Укажите игровой ник") + "</h3><p>" + T("Ник из игры, как он написан в игре. Без ника нельзя голосовать в «Важных новостях». Ник проверяет администратор сайта.") + "</p>" +
      '<input name="n" required maxlength="40" autocomplete="nickname" placeholder="' + escA(T("Игровой ник")) + '"><p class="cab-msg"></p>' +
      '<div class="nick-btns"><button type="submit" class="btn pri">' + T("Сохранить") + '</button><button type="button" class="btn" data-later>' + T("Позже") + "</button></div></form>";
    document.body.appendChild(w);
    var f = w.querySelector("form"), m = w.querySelector(".cab-msg");
    w.querySelector("[data-later]").onclick = function () { w.remove(); };
    f.onsubmit = async function (e) {
      e.preventDefault(); m.className = "cab-msg"; m.textContent = T("Секунду…");
      try { await window.LAAuth.setNick(f.n.value); } catch (err) { m.className = "cab-msg err"; m.textContent = T("Не получилось: ") + (err.message || err); }
    };
  }
  window.LAAuth = {
    ready: ready, state: state, hasSub: hasSub, client: sb,
    /* запрос к базе; если база ответила «нужно войти» (вход устарел, хотя человек в системе) — обновить вход и повторить один раз */
    call: async function (fn) {
      var r = await fn();
      if (r && r.error && /нужно войти|JWT|jwt|not authenticated/i.test(r.error.message || "")) {
        console.warn("вход устарел — обновляю:", r.error.message);
        var ref = await sb.auth.refreshSession();
        if (ref.error) console.warn("не удалось обновить вход:", ref.error.message); else r = await fn();
      }
      return r;
    },
    isEditor: function () { return !!(state.admin || (state.profile && state.profile.editor)); },  // админ публикует всегда (так же в базе: is_editor())
    isModerator: function () { return !!(state.admin || (state.profile && state.profile.moderator)); },  // модератор чата (так же в базе: is_moderator())
    on: function (f) { subs.push(f); f(state); },
    signUp: async function (email, pass, nick) { var r = await sb.auth.signUp({ email: email, password: pass, options: { data: { nick: nick || "" } } }); if (r.error) throw r.error; return r; },
    setNick: async function (nick) {
      var r = await sb.rpc("set_my_nick", { p_nick: String(nick || "").trim() }); if (r.error) throw r.error;
      await loadProfile(); emit(); nickGate();
    },
    signIn: async function (email, pass) { var r = await sb.auth.signInWithPassword({ email: email, password: pass }); if (r.error) throw r.error; return r; },
    signOut: async function () { await sb.auth.signOut(); },
    reload: async function () { await loadProfile(); emit(); },
    /* изменения избранного — сразу в аккаунт */
    favAdd: function (x) { if (sb && state.user) sb.from("favorites").upsert({ user_id: state.user.id, url: x.url, title: x.title, page: x.page, kind: x.kind, icon: x.icon || "", t: x.t || Date.now() }).then(function (r) { if (r.error) console.warn(r.error); }); },
    favDel: function (url) { if (sb && state.user) sb.from("favorites").delete().eq("user_id", state.user.id).eq("url", url).then(function (r) { if (r.error) console.warn(r.error); }); }
  };
  if (!sb) { emit(); return; }
  /* Внутри этого сигнала библиотека держит свой замок: запрос к базе прямо отсюда ждёт сам себя и виснет навсегда.
     Поэтому здесь только запоминаем пользователя, а запросы — следующим шагом (setTimeout). */
  var seq = 0;
  /* запасной путь: если сигнал о входе задержался (бывает на телефоне), берём вход напрямую через 4 с */
  setTimeout(async function () {
    if (state.authReady) return;
    try {
      var g = await sb.auth.getSession();
      if (state.authReady) return;
      state.user = g.data && g.data.session ? g.data.session.user : null;
      try { await loadProfile(); } catch (e) { console.warn("Кабинет: профиль (запасной путь)", e); }
      state.authReady = true; emit(); nickGate();
      document.querySelectorAll("[data-acc-name]").forEach(function (e) { e.textContent = (window.T || String)(state.user ? "Кабинет" : "Войти"); });
    } catch (e) { console.warn("Кабинет: вход (запасной путь)", e); }
  }, 4000);
  sb.auth.onAuthStateChange(function (ev, session) {
    state.user = session ? session.user : null;
    state.authReady = true;
    var my = ++seq;
    if (state.user) emit();  // сразу сообщить «вход есть» (профиль догрузится следом)
    setTimeout(async function () {
      try {
        await loadProfile();
        if (my !== seq) return;
        if (state.user && (ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) await syncFavs();
      } catch (e) { console.warn("Кабинет: не удалось загрузить аккаунт", e); }
      if (my !== seq) return;
      emit();
      nickGate();
      document.querySelectorAll("[data-acc-name]").forEach(function (e) { e.textContent = (window.T || String)(state.user ? "Кабинет" : "Войти"); });
    }, 0);
  });
})();

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
    var r = await sb.from("profiles").select("email,sub_until,created_at").eq("id", state.user.id).maybeSingle();
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
  window.LAAuth = {
    ready: ready, state: state, hasSub: hasSub, client: sb,
    on: function (f) { subs.push(f); f(state); },
    signUp: async function (email, pass) { var r = await sb.auth.signUp({ email: email, password: pass }); if (r.error) throw r.error; return r; },
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
  sb.auth.onAuthStateChange(function (ev, session) {
    state.user = session ? session.user : null;
    var my = ++seq;
    setTimeout(async function () {
      try {
        await loadProfile();
        if (my !== seq) return;
        if (state.user && (ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) await syncFavs();
      } catch (e) { console.warn("Кабинет: не удалось загрузить аккаунт", e); }
      if (my !== seq) return;
      emit();
      document.querySelectorAll("[data-acc-name]").forEach(function (e) { e.textContent = (window.T || String)(state.user ? "Кабинет" : "Войти"); });
    }, 0);
  });
})();

/* Чат сайта (Supabase: таблица chat_messages, новые сообщения приходят сразу — Realtime).
   Читают и пишут зарегистрированные с игровым ником. Фото (сжимаются в браузере), закреплённые сообщения и голосования —
   закрепляют и создают голосования админ и модераторы. Перевод RU⇄EN по кнопке и автоперевод:
   сначала встроенный переводчик Chrome (бесплатно, на устройстве), иначе бесплатный сервис MyMemory. База — tools/supabase_chat.sql. */
(function () {
  "use strict";
  var T = function (s) { return window.T ? window.T(s) : s; };
  var EN = document.documentElement.lang === "en";
  var app = document.getElementById("chatApp");
  if (!app) return;
  var A = window.LAAuth, sb = A && A.client;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var LOC = EN ? "en-GB" : "ru-RU";
  var PAGE = 80, MAX_IMG = 10, AUTO_LAST = 30;
  var saved = {}, refs = {}, replyTo = null;  // избранное (id → 1), сообщения, на которые отвечают (для цитат), ответ в поле ввода
  var msgs = [], byId = {}, pins = [], results = {}, mine = {}, st = { user: null, profile: null, admin: false }, chan = null, started = false;
  var store = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
                set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { console.warn("чат: не сохранить настройку", e); } } };
  var target = store.get("la_chat_lang", EN ? "en" : "ru"), auto = store.get("la_chat_auto", "1") === "1";  // по умолчанию автоперевод включён (её требование)

  if (!sb) { app.innerHTML = '<div class="cab-note">' + T("Чат временно недоступен.") + "</div>"; return; }

  /* ---------- время: по Москве и по игре (игра = Москва − 5 ч) ---------- */
  function when(iso) {
    var d = new Date(iso), now = new Date();
    var day = d.toLocaleDateString(LOC, { day: "numeric", month: "short", timeZone: "Europe/Moscow" });
    var today = day === now.toLocaleDateString(LOC, { day: "numeric", month: "short", timeZone: "Europe/Moscow" });
    var msk = d.toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    var srv = d.toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit", timeZone: "Etc/GMT+2" });
    return (today ? "" : day + ", ") + msk + " " + T("МСК") + " · " + srv + " " + T("в игре");
  }
  function hm(iso, tz) { return new Date(iso).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit", timeZone: tz }); }
  function dayOf(iso) { return new Date(iso).toLocaleDateString(LOC, { day: "numeric", month: "long", timeZone: "Europe/Moscow" }); }
  var NICK_COLORS = ["#d4532b", "#2f8f4e", "#2f6fd6", "#9b3fb5", "#c7781a", "#1a8c99", "#b8346c"];
  function nickColor(n) { var h = 0; for (var i = 0; i < (n || "").length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return NICK_COLORS[h % NICK_COLORS.length]; }
  function mskInputToIso(v) { return v ? new Date(v + ":00+03:00").toISOString() : null; }
  function imgUrl(p) { return sb.storage.from("chat").getPublicUrl(p).data.publicUrl; }
  function bodyHtml(s) { return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>"); }
  function ended(m) { return m.poll && m.poll.ends && new Date(m.poll.ends) <= new Date(); }

  /* ---------- перевод ---------- */
  var trCache = {};
  try { trCache = JSON.parse(store.get("la_chat_tr", "{}")) || {}; } catch (e) { trCache = {}; }
  function saveCache() {
    var keys = Object.keys(trCache);
    if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(function (k) { delete trCache[k]; });
    store.set("la_chat_tr", JSON.stringify(trCache));
  }
  function langOf(text) {
    var cyr = (text.match(/[А-Яа-яЁё]/g) || []).length, lat = (text.match(/[A-Za-z]/g) || []).length;
    return cyr >= lat ? "ru" : "en";
  }
  var chromeTr = {}, chromeLoading = {};
  async function viaChrome(text, src, dst) {
    if (!("Translator" in self)) return null;
    var key = src + ">" + dst;
    if (!chromeTr[key]) {
      var av = await self.Translator.availability({ sourceLanguage: src, targetLanguage: dst });
      if (av === "unavailable") return null;
      if (av !== "available") {
        // модель ещё не скачана: качаем в фоне (это может занять минуты), а сейчас переводим через MyMemory
        if (!chromeLoading[key]) {
          chromeLoading[key] = self.Translator.create({ sourceLanguage: src, targetLanguage: dst })
            .then(function (t) { chromeTr[key] = t; })
            .catch(function (e) { console.warn("чат: модель перевода Chrome не скачалась:", e && e.message); });
        }
        return null;
      }
      chromeTr[key] = await self.Translator.create({ sourceLanguage: src, targetLanguage: dst });
    }
    return await chromeTr[key].translate(text);
  }
  async function viaMyMemory(text, src, dst) {
    // у сервиса предел ~500 символов на запрос — режем по предложениям
    var parts = [], cur = "";
    text.split(/(?<=[.!?\n])\s+/).forEach(function (s) {
      while (s.length > 450) { if (cur) { parts.push(cur); cur = ""; } parts.push(s.slice(0, 450)); s = s.slice(450); }
      if ((cur + " " + s).length > 450) { parts.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
    });
    if (cur) parts.push(cur);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(parts[i]) + "&langpair=" + src + "|" + dst);
      var j = await r.json();
      if (+j.responseStatus !== 200) throw new Error(j.responseDetails || ("перевод не удался (" + j.responseStatus + ")"));
      out.push(j.responseData.translatedText);
    }
    return out.join(" ");
  }
  async function translate(text, dst) {
    var src = langOf(text);
    if (src === dst) return null;  // уже на нужном языке
    var key = dst + "|" + text;
    if (trCache[key]) return trCache[key];
    var res = null;
    try { res = await Promise.race([viaChrome(text, src, dst), new Promise(function (ok) { setTimeout(function () { ok(null); }, 3000); })]); } catch (e) { console.warn("чат: переводчик Chrome не сработал, беру MyMemory:", e && e.message); }  // не ждём Chrome дольше 3 с
    if (res == null) res = await viaMyMemory(text, src, dst);
    trCache[key] = res; saveCache();
    return res;
  }
  var opened = {};  // переводы, открытые кнопкой «Перевести» (когда автоперевод выключен)
  var running = 0, waiting = [];
  function slot(fn) {  // не больше 3 переводов одновременно — быстро, но без заваливания сервиса
    return new Promise(function (done) {
      var go = function () { running++; Promise.resolve().then(fn).catch(function (e) { console.warn("чат: перевод", e); }).then(function () { running--; done(); if (waiting.length) waiting.shift()(); }); };
      if (running < 3) go(); else waiting.push(go);
    });
  }
  function trMessage(id, force) {
    if (force) opened[id] = 1;
    if (byId[id] && byId[id].poll && (force || auto)) trPoll(id);
    return slot(async function () {
      var m = byId[id], el = app.querySelector('[data-msg="' + id + '"] .cm-tr');
      if (!m || !el || !m.body || el.dataset.done) return;  // у голосования без текста переводит trPoll
      el.dataset.done = "1";
      if (langOf(m.body) === target) { if (force) el.innerHTML = '<span class="mut">' + T("Сообщение уже на этом языке.") + "</span>"; return; }
      el.innerHTML = '<span class="mut">' + T("Перевожу…") + "</span>";
      try {
        var t = await translate(m.body, target);
        el.innerHTML = t == null ? "" : '<div class="cm-trtxt">' + bodyHtml(t) + "</div>";
      } catch (e) {
        delete el.dataset.done;
        el.innerHTML = '<span class="cab-msg err">' + T("Не удалось перевести: ") + esc(e.message || e) + "</span>";
      }
    });
  }

  /* ---------- каркас ---------- */
  function shell() {
    app.innerHTML =
      '<div class="ch-top"><a class="ch-back" href="' + (EN ? "index.en.html" : "index.html") + '" aria-label="' + esc(T("Выйти из чата")) + '">‹ <span>' + T("Выйти") + "</span></a>" +
      '<div class="ch-title"><b>' + T("Чат 397") + '</b><span id="chOnline2"></span></div>' +
      '<div class="ch-set" id="chSet"><label>' + T("Переводить на") + ' <select id="chLang"><option value="ru">Русский</option><option value="en">English</option></select></label>' +
      '<label class="ch-auto"><input type="checkbox" id="chAuto"> ' + T("Автоперевод сообщений") + "</label></div>" +
      '<span class="ch-who" id="chWho"></span>' +
      '<button type="button" class="btn ch-mem-btn" id="chSavedBtn" aria-label="' + esc(T("Избранное")) + '">⭐<span class="tx"> ' + T("Избранное") + '</span> <i id="chSavedN"></i></button>' +
      '<button type="button" class="btn ch-mem-btn" id="chMembersBtn" aria-label="' + esc(T("Участники")) + '">👥<span class="tx"> ' + T("Участники") + '</span> <i id="chOnline"></i></button>' +
      '<button type="button" class="btn ch-mem-btn ch-set-btn" id="chSetBtn" aria-label="' + esc(T("Перевод")) + '">⚙</button></div>' +
      '<div class="ch-members" id="chMembers" hidden></div><div class="ch-members" id="chSaved" hidden></div>' +
      '<div class="ch-pins" id="chPins" hidden></div>' +
      '<div class="ch-list" id="chList"><div class="cab-note">' + T("Загружаю чат…") + "</div></div>" +
      '<form class="ch-form" id="chForm"><div class="ch-reply" id="chReply" hidden></div><div class="ch-prev" id="chPrev"></div><div class="ch-poll" id="chPoll" hidden></div>' +
      '<div class="ch-row"><label class="ch-btn" title="' + esc(T("Фото")) + '">📎<input type="file" id="chFiles" accept="image/*" multiple hidden></label>' +
      '<button type="button" class="ch-btn" id="chPollBtn" title="' + esc(T("Голосование")) + '" hidden>📊</button>' +
      '<textarea id="chText" rows="1" placeholder="' + esc(window.matchMedia("(max-width:760px)").matches ? T("Сообщение…") : T("Сообщение… (Enter — отправить, Shift+Enter — новая строка)")) + '"></textarea>' +
      '<button type="submit" class="btn pri" id="chSend">' + T("Отправить") + '</button></div><p class="cab-msg" id="chMsg"></p></form>';
    var sel = app.querySelector("#chLang"); sel.value = target;
    sel.onchange = function () { target = sel.value; store.set("la_chat_lang", target); retranslate(); };
    var au = app.querySelector("#chAuto"); au.checked = auto;
    au.onchange = function () { auto = au.checked; store.set("la_chat_auto", auto ? "1" : "0"); retranslate(); };
    bindForm();
  }
  var polled = {};
  function trPoll(id) {
    var m = byId[id];
    if (!m || !m.poll || polled[id + "|" + target]) return;
    var all = [m.poll.q].concat(m.poll.options || []);
    if (langOf(all.join(" ")) === target) return;
    polled[id + "|" + target] = 1;
    all.forEach(function (txt, i) {
      if (!/[A-Za-zА-Яа-яЁё]/.test(txt)) return;  // «1», «3» — переводить нечего
      slot(async function () {
        try {
          var t = await translate(txt, target);
          var box = app.querySelector('[data-pollid="' + id + '"]'); if (!box || t == null) return;
          var el = i === 0 ? box.querySelector("[data-ptq]") : box.querySelector('[data-pto="' + (i - 1) + '"]');
          if (el) el.textContent = t;
        } catch (e) { delete polled[id + "|" + target]; console.warn("чат: перевод голосования", e); }
      });
    });
  }
  function retranslate() {
    polled = {};
    drawList(true);
    app.querySelectorAll(".cm-tr").forEach(function (el) { el.innerHTML = ""; delete el.dataset.done; });
    Object.keys(opened).forEach(function (id) { trMessage(+id, true); });
    if (auto) msgs.slice(-AUTO_LAST).forEach(function (m) { if (m.body) trMessage(m.id); });
  }

  /* ---------- сообщения ---------- */
  function canMod() { return A.isModerator(); }
  /* ---------- реакции (как в Telegram: одна от человека, повторное нажатие снимает) ---------- */
  var EMOJI = ["👍", "❤️", "🔥", "😂", "😮", "😢", "👎", "🎉"];
  var reacts = {};  // id сообщения → { user_id: {emoji, nick} }
  function reactHtml(id) {
    var r = reacts[id]; if (!r) return "";
    var by = {}, order = [];
    Object.keys(r).forEach(function (u) { var e = r[u].emoji; if (!by[e]) { by[e] = []; order.push(e); } by[e].push(r[u].nick || "?"); });
    if (!order.length) return "";
    var my = st.user && r[st.user.id] && r[st.user.id].emoji;
    return '<div class="cm-r">' + order.map(function (e) {
      return '<button type="button" class="cm-rc' + (e === my ? " mine" : "") + '" data-react="' + id + '" data-emoji="' + esc(e) + '" title="' + esc(by[e].join(", ")) + '">' + e + " <b>" + by[e].length + "</b></button>";
    }).join("") + "</div>";
  }
  async function loadReacts(list) {
    var ids = (list || msgs).map(function (m) { return m.id; });
    if (!ids.length) return;
    var r = await sb.from("chat_reactions").select("message_id,user_id,emoji,nick").in("message_id", ids);
    if (r.error) { console.warn("чат: реакции", r.error.message); return; }
    ids.forEach(function (id) { delete reacts[id]; });
    (r.data || []).forEach(function (x) { (reacts[x.message_id] = reacts[x.message_id] || {})[x.user_id] = { emoji: x.emoji, nick: x.nick }; });
  }
  function redrawReacts(id) {
    var c = app.querySelector('[data-msg="' + id + '"]'); if (!c) return;
    var old = c.querySelector(".cm-r"), html = reactHtml(id);
    if (old) old.outerHTML = html || ""; else if (html) c.querySelector(".cm-a").insertAdjacentHTML("beforebegin", html);
  }
  var lastReact = {};
  async function react(id, emoji) {
    if (!st.user) return;
    // двойное касание на телефоне ловится дважды (наше касание + «двойное нажатие» браузера) — второе за 0,6 с не считаем
    var now = Date.now(); if (now - (lastReact[id] || 0) < 600) return; lastReact[id] = now;
    var mineR = reacts[id] && reacts[id][st.user.id];
    var res;
    if (mineR && mineR.emoji === emoji) {
      delete reacts[id][st.user.id]; redrawReacts(id);
      res = await sb.from("chat_reactions").delete().eq("message_id", id).eq("user_id", st.user.id);
    } else {
      (reacts[id] = reacts[id] || {})[st.user.id] = { emoji: emoji, nick: (st.profile || {}).nick };
      redrawReacts(id);
      res = await sb.from("chat_reactions").upsert({ message_id: id, user_id: st.user.id, emoji: emoji }, { onConflict: "message_id,user_id" });
    }
    if (res.error) { alert(res.error.message); await loadReacts([{ id: id }]); redrawReacts(id); }
  }
  function msgActs(m) {
    var me = st.user && m.user_id === st.user.id;
    return '<button type="button" class="linkbtn" data-reply="' + m.id + '">' + T("Ответить") + "</button>" +
      '<button type="button" class="linkbtn' + (saved[m.id] ? " on" : "") + '" data-save="' + m.id + '">' + (saved[m.id] ? "★ " + T("В избранном") : "☆ " + T("В избранное")) + "</button>" +
      ((m.body || m.poll) && !auto ? '<button type="button" class="linkbtn" data-tr="' + m.id + '">' + (opened[m.id] ? T("Скрыть перевод") : T("Перевести")) + "</button>" : "") +
      (canMod() ? '<button type="button" class="linkbtn" data-pin="' + m.id + '">' + (m.pinned ? T("Открепить") : T("Закрепить")) + "</button>" : "") +
      (me || canMod() ? '<button type="button" class="linkbtn del" data-del="' + m.id + '">' + T("Удалить") + "</button>" : "") +
      (canMod() && !me && m.user_id ? '<button type="button" class="linkbtn del" data-mod="' + m.user_id + '" data-nick="' + esc(m.nick || "") + '">' + T("Мут / исключить") + "</button>" : "");
  }
  function msgHtml(m, prev) {
    var me = st.user && m.user_id === st.user.id;
    var tags = (m.author_mod ? '<em class="cm-tag mod">' + T("модератор") + "</em>" : "") + (m.author_leader ? '<em class="cm-tag ld">' + T("лидер") + "</em>" : "");
    var imgs = (m.images || []).map(function (p) { return '<img src="' + esc(imgUrl(p)) + '" alt="" loading="lazy">'; }).join("");
    var acts = msgActs(m);
    var time = '<span class="cm-time" title="' + esc(when(m.created_at)) + '">' + hm(m.created_at, "Europe/Moscow") + " " + T("мск") + " · " + hm(m.created_at, "Etc/GMT+2") + "</span>";
    return '<div class="cm' + (me ? " me" : "") + (m.pinned ? " pinned" : "") + '" data-msg="' + m.id + '" id="msg-' + m.id + '">' +
      '<div class="cm-h"><b>' + esc(m.nick || "?") + "</b>" + tags + (m.pinned ? '<span class="cm-pin">📌</span>' : "") + "</div>" +
      (m.reply_to ? quoteHtml(m.reply_to) : "") +
      (m.body ? '<div class="cm-body">' + bodyHtml(m.body) + time + "</div>" : "") + '<div class="cm-tr"></div>' +
      (imgs ? '<div class="cm-imgs">' + imgs + "</div>" : "") + (m.poll ? pollHtml(m) : "") + (m.body ? "" : '<div class="cm-tline">' + time + "</div>") +
      reactHtml(m.id) + '<div class="cm-a">' + acts + "</div></div>";
  }
  function snippet(m) { return m ? (m.body ? m.body.replace(/\s+/g, " ").slice(0, 120) : m.poll ? "📊 " + m.poll.q : (m.images || []).length ? "📷 " + T("фото") : "") : ""; }
  function quoteHtml(rid) {
    var r = byId[rid] || refs[rid];
    return '<button type="button" class="cm-q" data-goto="' + rid + '"><b>' + esc(r ? r.nick || "?" : "…") + "</b><span>" + esc(r ? snippet(r) : T("сообщение удалено или ещё не загружено")) + "</span></button>";
  }
  async function loadRefs(list) {  // сообщения, на которые отвечают, но которых нет в ленте (старые)
    var need = (list || msgs).map(function (m) { return m.reply_to; }).filter(function (id) { return id && !byId[id] && !refs[id]; });
    if (!need.length) return;
    var r = await sb.from("chat_messages").select("id,nick,body,images,poll,created_at").in("id", need);
    (r.data || []).forEach(function (x) { refs[x.id] = x; });
  }
  async function loadSaved() {
    var r = await sb.from("chat_saved").select("message_id");
    if (r.error) { console.warn("чат: избранное", r.error.message); return; }
    saved = {}; (r.data || []).forEach(function (x) { saved[x.message_id] = 1; });
    var n = app.querySelector("#chSavedN"); if (n) n.textContent = Object.keys(saved).length || "";
  }
  async function toggleSavedPanel() {
    var box = app.querySelector("#chSaved"); if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    var mb = app.querySelector("#chMembers"); if (mb) mb.hidden = true;
    box.hidden = false; box.innerHTML = '<div class="cab-note">' + T("Загружаю избранное…") + "</div>";
    var ids = Object.keys(saved).map(Number);
    var r = ids.length ? await sb.from("chat_messages").select("*").in("id", ids).order("created_at", { ascending: false }) : { data: [] };
    var list = r.data || [];
    box.innerHTML = '<div class="chm-h"><b>⭐ ' + T("Моё избранное") + "</b> · " + list.length + '<button type="button" class="linkbtn" data-close-saved>✕</button></div>' +
      '<div class="chm-list">' + (list.length ? list.map(function (m) {
        return '<div class="chs"><div class="chs-h"><b>' + esc(m.nick || "?") + '</b><span class="cm-t">' + when(m.created_at) + '</span></div><div class="chs-t">' + esc(snippet(m)) + "</div>" +
          '<div class="cm-a"><button type="button" class="linkbtn" data-goto="' + m.id + '">' + T("Перейти") + '</button><button type="button" class="linkbtn del" data-save="' + m.id + '">' + T("Убрать") + "</button></div></div>";
      }).join("") : '<div class="cab-note">' + T("Пока пусто. Нажмите «☆ В избранное» у любого сообщения.") + "</div>") + "</div>";
  }
  function drawReply() {
    var b = app.querySelector("#chReply"); if (!b) return;
    var m = replyTo && (byId[replyTo] || refs[replyTo]);
    b.hidden = !m;
    b.innerHTML = m ? "<span>↩ " + T("Ответ") + " <b>" + esc(m.nick || "?") + ":</b> " + esc(snippet(m)) + '</span><button type="button" class="linkbtn" data-reply-cancel>✕</button>' : "";
  }
  function pollHtml(m) {
    var pl = m.poll, res = results[m.id] || [], my = mine[m.id], over = ended(m), opts = pl.options || [];
    var by = opts.map(function (_, i) { return res.filter(function (x) { return x.opt === i; })[0] || { leaders: 0, players: 0, voters: [] }; });
    var totL = by.reduce(function (s, x) { return s + x.leaders; }, 0), totP = by.reduce(function (s, x) { return s + x.players; }, 0);
    var pct = function (n, t) { return t ? Math.round(n * 100 / t) : 0; };
    return '<div class="poll" data-pollid="' + m.id + '"><div class="poll-q">📊 ' + esc(pl.q) + '<div class="poll-tr" data-ptq></div></div><div class="poll-info">' +
      [pl.anon ? T("Анонимное голосование") : T("Открытое голосование: ники видны всем"), pl.ends ? (over ? T("закончилось ") : T("до ")) + when(pl.ends) : T("без срока"), T("всего: лидеров ") + totL + T(", игроков ") + totP].join(" · ") + "</div>" +
      opts.map(function (o, i) {
        var x = by[i], vs = x.voters || [];
        return '<div class="poll-opt' + (my === i ? " mine" : "") + '"><button type="button" class="poll-vote" data-vote="' + m.id + '" data-opt="' + i + '"' + (over ? " disabled" : "") + "><span>" + esc(o) + '<i class="poll-otr" data-pto="' + i + '"></i></span></button>' +
          '<div class="poll-bars"><div class="poll-bar ld"><i style="width:' + pct(x.leaders, totL) + '%"></i><span>' + T("Лидеры") + ": <b>" + x.leaders + "</b> · " + pct(x.leaders, totL) + '%</span></div>' +
          '<div class="poll-bar pl"><i style="width:' + pct(x.players, totP) + '%"></i><span>' + T("Игроки") + ": <b>" + x.players + "</b> · " + pct(x.players, totP) + "%</span></div></div>" +
          (!pl.anon && vs.length ? '<details class="poll-who"><summary>' + T("Кто голосовал") + " (" + vs.length + ")</summary>" + vs.map(function (v) { return '<span class="' + (v.leader ? "ld" : "") + '">' + esc(v.nick || "?") + (v.leader ? " · " + T("лидер") : "") + "</span>"; }).join("") + "</details>" : "") + "</div>";
      }).join("") + "</div>";
  }
  function nearBottom(l) { return l.scrollHeight - l.scrollTop - l.clientHeight < 120; }
  function drawList(keepPos) {
    var l = app.querySelector("#chList"); if (!l) return;
    var stick = !keepPos || nearBottom(l), oldH = l.scrollHeight, oldTop = l.scrollTop;
    l.innerHTML = (msgs.length >= PAGE && !l.dataset.noMore ? '<button type="button" class="btn ch-older" id="chOlder">' + T("Показать раньше") + "</button>" : "") +
      (msgs.length ? msgs.map(function (m, i) {
        var prev = msgs[i - 1], d = dayOf(m.created_at);
        return (!prev || dayOf(prev.created_at) !== d ? '<div class="ch-day"><span>' + d + "</span></div>" : "") + msgHtml(m);
      }).join("") : '<div class="cab-empty"><b>' + T("Сообщений пока нет.") + "</b><span>" + T("Напишите первым!") + "</span></div>");
    if (keepPos === "top") l.scrollTop = l.scrollHeight - oldH + oldTop; else if (stick) l.scrollTop = l.scrollHeight;
    if (auto) msgs.slice(-AUTO_LAST).forEach(function (m) { if (m.body) trMessage(m.id); });
    msgs.forEach(function (m) { if (m.poll && (auto || opened[m.id])) { delete polled[m.id + "|" + target]; trPoll(m.id); } });
    Object.keys(opened).forEach(function (id) { if (byId[id]) trMessage(+id, true); });
  }
  function drawPins() {
    var b = app.querySelector("#chPins"); if (!b) return;
    pins.sort(function (a, c) { return new Date(c.pinned_at) - new Date(a.pinned_at); });
    b.hidden = !pins.length;
    b.innerHTML = pins.map(function (m) {
      var txt = m.body ? m.body.replace(/\s+/g, " ").slice(0, 140) : m.poll ? "📊 " + m.poll.q : "📷 " + T("фото");
      return '<button type="button" class="ch-pin" data-goto="' + m.id + '"><span>📌</span><b>' + esc(m.nick || "") + ":</b> " + esc(txt) + "</button>";
    }).join("");
  }
  async function loadPolls(ids) {
    ids = ids || msgs.filter(function (m) { return m.poll; }).map(function (m) { return m.id; });
    if (!ids.length) return;
    var r = await sb.rpc("chat_poll_results", { p_msgs: ids });
    if (r.error) { console.warn("чат: итоги голосований", r.error.message); return; }
    ids.forEach(function (id) { results[id] = []; });
    (r.data || []).forEach(function (x) { results[x.message_id].push(x); });
    var m2 = await sb.rpc("my_chat_votes", { p_msgs: ids });
    ids.forEach(function (id) { delete mine[id]; });
    (m2.data || []).forEach(function (x) { mine[x.message_id] = x.opt; });
  }
  function put(m) { if (!byId[m.id]) { msgs.push(m); } else { Object.assign(byId[m.id], m); m = byId[m.id]; } byId[m.id] = m; }
  async function load() {
    var r = await sb.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(PAGE);
    if (r.error) { app.querySelector("#chList").innerHTML = '<div class="cab-note">' + T("Не удалось загрузить чат: ") + esc(r.error.message) + "</div>"; return; }
    msgs = []; byId = {};
    (r.data || []).reverse().forEach(put);
    var p = await sb.from("chat_messages").select("*").eq("pinned", true).order("pinned_at", { ascending: false }).limit(20);
    pins = p.data || [];
    await Promise.all([loadPolls(), loadSaved(), loadRefs(), loadReacts()]);
    drawPins(); drawList();
    var h = location.hash.match(/^#msg-(\d+)$/); if (h) goTo(+h[1]);
  }
  async function older() {
    var first = msgs[0]; if (!first) return;
    var r = await sb.from("chat_messages").select("*").lt("created_at", first.created_at).order("created_at", { ascending: false }).limit(PAGE);
    if (r.error) return alert(r.error.message);
    var got = (r.data || []).reverse();
    if (got.length < PAGE) app.querySelector("#chList").dataset.noMore = "1";
    msgs = got.concat(msgs); got.forEach(function (m) { byId[m.id] = m; });
    await Promise.all([loadPolls(got.filter(function (m) { return m.poll; }).map(function (m) { return m.id; })), loadRefs(got)]);
    drawList("top");
  }
  function goTo(id) {
    var el = document.getElementById("msg-" + id);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); setTimeout(function () { el.classList.remove("flash"); }, 1600); }
    else jumpLoad(id);
  }
  async function jumpLoad(id) {  // сообщения нет в ленте (старое) — загрузить ленту начиная с него
    var t = await sb.from("chat_messages").select("created_at").eq("id", id).maybeSingle();
    if (!t.data) return alert(T("Сообщение удалено."));
    var r = await sb.from("chat_messages").select("*").gte("created_at", t.data.created_at).order("created_at", { ascending: true }).limit(300);
    if (r.error) return alert(r.error.message);
    msgs = []; byId = {}; (r.data || []).forEach(put);
    var l = app.querySelector("#chList"); if (l) delete l.dataset.noMore;
    await Promise.all([loadPolls(), loadRefs()]);
    drawList(true);
    var el = document.getElementById("msg-" + id);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); setTimeout(function () { el.classList.remove("flash"); }, 1600); }
  }

  /* ---------- новые сообщения сразу ---------- */
  function subscribe() {
    if (chan) sb.removeChannel(chan);
    chan = sb.channel("chat-room").on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, function (p) {
      var x = p.eventType === "DELETE" ? p.old : p.new; if (!x || !x.message_id) return;
      if (p.eventType === "DELETE") { if (reacts[x.message_id]) delete reacts[x.message_id][x.user_id]; }
      else (reacts[x.message_id] = reacts[x.message_id] || {})[x.user_id] = { emoji: x.emoji, nick: x.nick };
      redrawReacts(x.message_id);
    }).on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, async function (p) {
      if (p.eventType === "INSERT") {
        put(p.new);
        await Promise.all([p.new.poll ? loadPolls([p.new.id]) : null, loadRefs([p.new])]);
        drawList(true);
      } else if (p.eventType === "UPDATE") {
        put(p.new);
        pins = pins.filter(function (x) { return x.id !== p.new.id; }); if (p.new.pinned) pins.push(p.new);
        drawPins(); drawList(true);
      } else if (p.eventType === "DELETE") {
        var id = p.old && p.old.id;
        msgs = msgs.filter(function (x) { return x.id !== id; }); delete byId[id];
        pins = pins.filter(function (x) { return x.id !== id; });
        drawPins(); drawList(true);
      }
    }).subscribe(function (s) { if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") console.warn("чат: связь для новых сообщений:", s); });
  }
  async function catchUp() {
    if (!started || document.hidden) return;
    var last = msgs[msgs.length - 1];
    var q = sb.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(100);
    if (last) q = q.gt("created_at", last.created_at);
    var r = await q;
    if (r.error || !(r.data || []).length) return;
    r.data.forEach(put);
    loadReacts(r.data).then(function () { r.data.forEach(function (m) { redrawReacts(m.id); }); });
    await Promise.all([loadPolls(r.data.filter(function (m) { return m.poll; }).map(function (m) { return m.id; })), loadRefs(r.data)]);
    drawList(true);
  }
  setInterval(catchUp, 8000);  // запасной путь: раз в 8 с одним маленьким запросом
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !started) return;
    catchUp();
    if (chan && chan.state !== "joined") subscribe();  // связь уснула — переподключить
    if (presence && presence.state !== "joined") joinPresence();
  });
  window.addEventListener("online", function () { if (started) { catchUp(); subscribe(); joinPresence(); } });
  // итоги голосований обновляются раз в 20 с, пока вкладка открыта
  setInterval(function () { if (started && !document.hidden && msgs.some(function (m) { return m.poll; })) loadPolls().then(function () { drawList(true); }); }, 20000);

  /* ---------- действия ---------- */
  app.addEventListener("click", async function (e) {
    var t = e.target, b;
    if ((b = t.closest("[data-react]"))) { react(+b.dataset.react, b.dataset.emoji); if (b.closest("#chSheet")) closeSheet(); return; }
    if ((b = t.closest("#chSetBtn"))) { app.querySelector("#chSet").classList.toggle("open"); return; }
    var sheet = t.closest("#chSheet");
    if (sheet) {
      if (t === sheet || t.closest("[data-sheet-close]")) { closeSheet(); return; }
      if (t.closest("button")) setTimeout(closeSheet, 0);  // пункт выбран — меню закрыть (действие ниже уже взяло всё нужное)
    }
    if ((b = t.closest("[data-copy]"))) {
      var cm = byId[+b.dataset.copy];
      try { await navigator.clipboard.writeText(cm.body || ""); } catch (err) { console.warn("чат: не скопировать", err); }
      return;
    }
    if ((b = t.closest("#chOlder"))) return older();
    if ((b = t.closest("[data-goto]"))) return goTo(+b.dataset.goto);
    if ((b = t.closest(".cm-imgs img"))) { var lb = document.querySelector(".lightbox"); if (lb) { lb.querySelector("img").src = b.src; lb.classList.add("on"); } return; }
    if ((b = t.closest("[data-tr]"))) {
      var tid = +b.dataset.tr, tel = app.querySelector('[data-msg="' + tid + '"] .cm-tr');
      if (opened[tid]) { delete opened[tid]; tel.innerHTML = ""; delete tel.dataset.done; b.textContent = T("Перевести"); return; }
      b.textContent = T("Скрыть перевод"); return trMessage(tid, true);
    }
    if ((b = t.closest("#chMembersBtn"))) { var sp = app.querySelector("#chSaved"); if (sp) sp.hidden = true; return toggleMembers(); }
    if ((b = t.closest("#chSavedBtn")) || (b = t.closest("[data-close-saved]"))) return toggleSavedPanel();
    if ((b = t.closest("[data-reply-cancel]"))) { replyTo = null; drawReply(); return; }
    if ((b = t.closest("[data-reply]"))) { replyTo = +b.dataset.reply; drawReply(); var tx = app.querySelector("#chText"); if (tx) tx.focus(); return; }
    if ((b = t.closest("[data-save]"))) {
      var sid = +b.dataset.save, was = !!saved[sid];
      var rs = was ? await sb.from("chat_saved").delete().eq("message_id", sid) : await sb.from("chat_saved").insert({ message_id: sid });
      if (rs.error) return alert(rs.error.message);
      if (was) delete saved[sid]; else saved[sid] = 1;
      var sn = app.querySelector("#chSavedN"); if (sn) sn.textContent = Object.keys(saved).length || "";
      drawList(true);
      var spn = app.querySelector("#chSaved"); if (spn && !spn.hidden) { spn.hidden = true; toggleSavedPanel(); }
      return;
    }
    if ((b = t.closest("[data-mod]"))) return modDialog(b.dataset.mod, b.dataset.nick);
    if ((b = t.closest("[data-pin]"))) {
      var m = byId[+b.dataset.pin];
      var r = await sb.from("chat_messages").update({ pinned: !m.pinned }).eq("id", m.id);
      if (r.error) alert(r.error.message);
      return;
    }
    if ((b = t.closest("[data-del]"))) {
      var md = byId[+b.dataset.del];
      if (!confirm(T("Удалить сообщение?"))) return;
      if ((md.images || []).length) { var s = await sb.storage.from("chat").remove(md.images); if (s.error) console.warn("чат: фото не удалены", s.error.message); }
      var rd = await sb.from("chat_messages").delete().eq("id", md.id);
      if (rd.error) alert(rd.error.message);
      return;
    }
    if (!t.closest("[data-vote], details, button, a") && t.closest(".poll-opt")) b = t.closest(".poll-opt").querySelector("[data-vote]");
    else b = t.closest("[data-vote]");
    if (b && !b.disabled) {
      b.disabled = true;
      var rv = await sb.rpc("cast_chat_vote", { p_msg: +b.dataset.vote, p_opt: +b.dataset.opt });
      b.disabled = false;
      if (rv.error) return alert(rv.error.message);
      await loadPolls([+b.dataset.vote]); drawList(true);
    }
  });

  /* ---------- меню сообщения: удержание пальцем или правая кнопка мыши (как в Telegram) ---------- */
  function closeSheet() { var x = app.querySelector("#chSheet"); if (x) x.remove(); }
  function openSheet(id) {
    var m = byId[id]; if (!m) return;
    closeSheet();
    var w = document.createElement("div"); w.className = "ch-sheet"; w.id = "chSheet";
    var myE = st.user && reacts[id] && reacts[id][st.user.id] && reacts[id][st.user.id].emoji;
    w.innerHTML = '<div class="ch-sheet-box"><div class="ch-sheet-e">' + EMOJI.map(function (e) { return '<button type="button" class="' + (e === myE ? "mine" : "") + '" data-react="' + id + '" data-emoji="' + e + '">' + e + "</button>"; }).join("") + "</div>" +
      '<div class="ch-sheet-q"><b>' + esc(m.nick || "?") + "</b> " + esc(snippet(m)) + "</div>" +
      (m.body ? '<button type="button" class="linkbtn" data-copy="' + id + '">' + T("Копировать") + "</button>" : "") +
      msgActs(m) + '<button type="button" class="linkbtn ch-sheet-x" data-sheet-close>' + T("Отмена") + "</button></div>";
    app.appendChild(w);
  }
  var lp = null, lpFired = false;
  app.addEventListener("touchstart", function (e) {
    var c = e.target.closest(".cm");
    if (!c || e.target.closest("button, a, img, input, textarea, select, details, #chSheet")) return;
    var p0 = e.touches[0], id = +c.dataset.msg;
    lp = { x: p0.clientX, y: p0.clientY, timer: setTimeout(function () { lpFired = true; lp = null; if (navigator.vibrate) navigator.vibrate(12); openSheet(id); }, 450) };
  }, { passive: true });
  app.addEventListener("touchmove", function (e) {
    if (!lp) return;
    var p0 = e.touches[0];
    if (Math.abs(p0.clientX - lp.x) > 10 || Math.abs(p0.clientY - lp.y) > 10) { clearTimeout(lp.timer); lp = null; }
  }, { passive: true });
  var lastTap = { id: 0, t: 0 };
  app.addEventListener("touchend", function (e) {
    var wasTap = !!lp && !lpFired;
    if (lp) { clearTimeout(lp.timer); lp = null; }
    if (wasTap) {
      var c = e.target.closest(".cm");
      if (c && !e.target.closest("button, a, img, input, textarea, select, details")) {
        var id = +c.dataset.msg, now = Date.now();
        if (lastTap.id === id && now - lastTap.t < 320) { lastTap = { id: 0, t: 0 }; if (e.cancelable) e.preventDefault(); react(id, "❤️"); return; }
        lastTap = { id: id, t: now };
      }
    }
    if (lpFired) { lpFired = false; if (e.cancelable) e.preventDefault(); }  // после удержания не считать это нажатием
  });
  app.addEventListener("dblclick", function (e) {
    var c = e.target.closest(".cm");
    if (!c || e.target.closest("button, a, img, input, textarea, select, details, #chSheet")) return;
    var sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges();
    react(+c.dataset.msg, "❤️");
  });
  app.addEventListener("contextmenu", function (e) {
    var c = e.target.closest(".cm");
    if (!c || e.target.closest("a, img, #chSheet")) return;
    e.preventDefault(); openSheet(+c.dataset.msg);
  });

  /* ---------- участники: кто в сети (Realtime Presence), мут и исключение ---------- */
  var online = {}, members = [], presence = null;
  function joinPresence() {
    if (presence) sb.removeChannel(presence);
    var pr = st.profile || {};
    presence = sb.channel("chat-online", { config: { presence: { key: st.user.id } } });
    presence.on("presence", { event: "sync" }, function () {
      var stt = presence.presenceState(); online = {};
      Object.keys(stt).forEach(function (k) { online[k] = 1; });
      var n = app.querySelector("#chOnline"); if (n) n.textContent = Object.keys(online).length + " " + T("в сети");
      var n2 = app.querySelector("#chOnline2"); if (n2) n2.textContent = Object.keys(online).length + " " + T("в сети");
      var box = app.querySelector("#chMembers"); if (box && !box.hidden) drawMembers();
    }).subscribe(function (s) { if (s === "SUBSCRIBED") presence.track({ nick: pr.nick || "" }); });
  }
  async function loadMembers() {
    var r = await sb.rpc("chat_members");
    if (r.error) { members = []; return r.error.message; }
    members = r.data || [];
  }
  function muteLabel(u) {
    if (u.kicked) return '<em class="cm-tag bad">' + T("исключён") + "</em>";
    if (u.banned) return '<em class="cm-tag bad">' + T("мут навсегда") + "</em>";
    if (u.muted_until && new Date(u.muted_until) > new Date()) return '<em class="cm-tag bad">' + T("мут до ") + when(u.muted_until) + "</em>";
    return "";
  }
  function drawMembers() {
    var box = app.querySelector("#chMembers"); if (!box) return;
    var list = members.slice().sort(function (a, c) { return (online[c.user_id] ? 1 : 0) - (online[a.user_id] ? 1 : 0) || (a.nick || "").localeCompare(c.nick || ""); });
    var on = list.filter(function (u) { return online[u.user_id]; }).length;
    box.innerHTML = '<div class="chm-h"><b>' + T("Участники чата") + "</b> · " + list.length + " · " + on + " " + T("в сети") + '<button type="button" class="linkbtn" id="chMembersClose">✕</button></div>' +
      '<input type="search" class="cab-filt" id="chMemQ" placeholder="' + esc(T("поиск по нику")) + '">' +
      '<div class="chm-list">' + list.map(function (u) {
        var me = st.user && u.user_id === st.user.id;
        return '<div class="chm" data-n="' + esc((u.nick || "").toLowerCase()) + '"><i class="dot' + (online[u.user_id] ? " on" : "") + '"></i><b>' + esc(u.nick) + "</b>" +
          (u.moderator ? '<em class="cm-tag mod">' + T("модератор") + "</em>" : "") + (u.leader ? '<em class="cm-tag ld">' + T("лидер") + "</em>" : "") + muteLabel(u) +
          (canMod() && !me && !u.moderator ? '<button type="button" class="linkbtn del" data-mod="' + u.user_id + '" data-nick="' + esc(u.nick) + '">' + T("Мут / исключить") + "</button>" : "") + "</div>";
      }).join("") + "</div>";
    box.querySelector("#chMembersClose").onclick = toggleMembers;
    box.querySelector("#chMemQ").oninput = function () { var q = this.value.trim().toLowerCase(); box.querySelectorAll(".chm").forEach(function (x) { x.hidden = q && x.dataset.n.indexOf(q) < 0; }); };
  }
  async function toggleMembers() {
    var box = app.querySelector("#chMembers"); if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '<div class="cab-note">' + T("Загружаю участников…") + "</div>";
    var err = await loadMembers();
    if (err) { box.innerHTML = '<div class="cab-note">' + esc(err) + "</div>"; return; }
    drawMembers();
  }
  function modDialog(uid, nick) {
    var u = members.filter(function (x) { return x.user_id === uid; })[0] || {};
    var w = document.createElement("div"); w.className = "nick-gate";
    w.innerHTML = '<div class="nick-box"><h3>' + esc(nick) + "</h3><p>" + T("Мут — может читать, но не писать. Исключить — не видит чат и не пишет.") + "</p>" +
      '<div class="chm-acts"><b>' + T("Мут на:") + "</b>" + [[10, T("10 мин")], [60, T("1 час")], [1440, T("24 часа")], [10080, T("7 дней")], [0, T("навсегда")]].map(function (x) { return '<button type="button" class="btn" data-mute="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<div class="chm-acts"><button type="button" class="btn" data-act="unmute">' + T("Снять мут") + '</button><button type="button" class="btn" data-act="kick">' + T("Исключить из чата") + '</button><button type="button" class="btn" data-act="unkick">' + T("Вернуть в чат") + "</button></div>" +
      '<p class="cab-msg"></p><div class="nick-btns"><button type="button" class="btn" data-close>' + T("Закрыть") + "</button></div></div>";
    document.body.appendChild(w);
    var msg = w.querySelector(".cab-msg");
    w.addEventListener("click", async function (e) {
      var b = e.target.closest("button"); if (!b) { if (e.target === w) w.remove(); return; }
      if (b.hasAttribute("data-close")) return w.remove();
      var act = b.dataset.act || "mute", mins = b.dataset.mute != null ? +b.dataset.mute : 0;
      if (act === "kick" && !confirm(T("Исключить «") + nick + T("» из чата? Он перестанет видеть сообщения."))) return;
      msg.className = "cab-msg"; msg.textContent = "…";
      var r = await sb.rpc("chat_moderate", { p_user: uid, p_action: act, p_minutes: mins });
      if (r.error) { msg.className = "cab-msg err"; msg.textContent = r.error.message; return; }
      msg.textContent = T("Готово.");
      await loadMembers(); var box = app.querySelector("#chMembers"); if (box && !box.hidden) drawMembers();
      setTimeout(function () { w.remove(); }, 600);
    });
  }

  /* ---------- отправка ---------- */
  var fresh = [];
  async function shrink(file) {  // как в новостях: не шире 1600 и не выше 4000 точек, WebP (иначе JPEG)
    var bmp = await createImageBitmap(file);
    var k = Math.min(1, 1600 / bmp.width, 4000 / bmp.height);
    var c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    var blob = await new Promise(function (ok) { c.toBlob(ok, "image/webp", 0.82); });
    if (!blob || blob.type !== "image/webp") blob = await new Promise(function (ok) { c.toBlob(ok, "image/jpeg", 0.85); });
    return blob;
  }
  function bindForm() {
    var f = app.querySelector("#chForm"), txt = f.querySelector("#chText"), msg = f.querySelector("#chMsg"), prev = f.querySelector("#chPrev"), pollBox = f.querySelector("#chPoll");
    var drawPrev = function () {
      prev.innerHTML = fresh.map(function (x, i) { return '<span><img src="' + x.url + '" alt=""><button type="button" data-rm="' + i + '">✕</button></span>'; }).join("");
    };
    prev.onclick = function (e) { var b = e.target.closest("[data-rm]"); if (!b) return; URL.revokeObjectURL(fresh[+b.dataset.rm].url); fresh.splice(+b.dataset.rm, 1); drawPrev(); };
    f.querySelector("#chFiles").onchange = function () {
      [].forEach.call(this.files, function (file) { if (fresh.length < MAX_IMG) fresh.push({ file: file, url: URL.createObjectURL(file) }); });
      this.value = ""; drawPrev();
    };
    var grow = function () { txt.style.height = "auto"; txt.style.height = Math.min(txt.scrollHeight, 240) + "px"; };
    txt.addEventListener("input", grow);
    txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !window.matchMedia("(max-width:760px)").matches) { e.preventDefault(); f.requestSubmit(); } });
    f.querySelector("#chPollBtn").onclick = function () {
      if (!pollBox.hidden) { pollBox.hidden = true; pollBox.innerHTML = ""; return; }
      pollBox.hidden = false;
      pollBox.innerHTML = '<label>' + T("Вопрос") + '<input name="q" maxlength="300"></label><div class="nf-opts"></div><button type="button" class="linkbtn" id="chAddOpt">' + T("＋ вариант") + "</button>" +
        '<label class="nf-chk"><input type="checkbox" name="anon"> ' + T("Анонимное голосование (ники не показываются, видны только числа)") + "</label>" +
        "<label>" + T("Окончание голосования, время по Москве (пусто — без срока)") + '<input type="datetime-local" name="ends"></label>';
      var ob = pollBox.querySelector(".nf-opts");
      var addOpt = function (v) { var d = document.createElement("div"); d.className = "nf-opt"; d.innerHTML = '<input maxlength="150" placeholder="' + esc(T("Вариант ответа")) + '" value="' + esc(v || "") + '"><button type="button" class="linkbtn del">✕</button>'; d.querySelector("button").onclick = function () { d.remove(); }; ob.appendChild(d); };
      [T("За"), T("Против")].forEach(addOpt);
      pollBox.querySelector("#chAddOpt").onclick = function () { addOpt(""); };
    };
    f.onsubmit = async function (e) {
      e.preventDefault(); msg.className = "cab-msg"; msg.textContent = "";
      var row = { body: txt.value.trim(), images: [], poll: null };
      if (replyTo) row.reply_to = replyTo;
      if (!pollBox.hidden) {
        var opts = [].map.call(pollBox.querySelectorAll(".nf-opt input"), function (i) { return i.value.trim(); }).filter(Boolean);
        var q = pollBox.querySelector("[name=q]").value.trim();
        if (!q || opts.length < 2) { msg.className = "cab-msg err"; msg.textContent = T("В голосовании нужен вопрос и хотя бы 2 варианта."); return; }
        row.poll = { q: q, options: opts, anon: pollBox.querySelector("[name=anon]").checked, ends: mskInputToIso(pollBox.querySelector("[name=ends]").value) };
      }
      if (!row.body && !fresh.length && !row.poll) return;
      var send = f.querySelector("#chSend"); send.disabled = true;
      // поле очищаем сразу (на iPhone подсказки клавиатуры иначе оставляют текст); не отправилось — вернём
      var typed = txt.value; txt.value = ""; grow();
      try {
        for (var i = 0; i < fresh.length; i++) {
          msg.textContent = T("Сжимаю и загружаю фото ") + (i + 1) + " / " + fresh.length + "…";
          var blob = await shrink(fresh[i].file);
          var path = st.user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + (blob.type === "image/webp" ? ".webp" : ".jpg");
          var u = await sb.storage.from("chat").upload(path, blob, { contentType: blob.type, upsert: false });
          if (u.error) throw u.error;
          row.images.push(path);
        }
        var r = await sb.from("chat_messages").insert(row);
        if (r.error) throw r.error;
        if (txt.value === typed) txt.value = "";  // клавиатура телефона вернула текст — убрать ещё раз
        grow(); fresh.forEach(function (x) { URL.revokeObjectURL(x.url); }); fresh = []; drawPrev();
        replyTo = null; drawReply();
        pollBox.hidden = true; pollBox.innerHTML = ""; msg.textContent = "";
      } catch (err) {
        if (!txt.value) { txt.value = typed; grow(); }
        msg.className = "cab-msg err"; msg.textContent = T("Не отправилось: ") + (err.message || err);
      }
      send.disabled = false; txt.focus();
    };
    // кнопка «Отправить» не забирает фокус у поля — клавиатура телефона не прячется после отправки (как в мессенджерах)
    f.querySelector("#chSend").addEventListener("pointerdown", function (e) { e.preventDefault(); });
  }
  function setComposer() {
    var f = app.querySelector("#chForm"), pr = st.profile || {};
    if (!f) return;
    app.querySelector("#chPollBtn").hidden = !canMod();
    var muted = pr.chat_muted_until && new Date(pr.chat_muted_until) > new Date();
    var banned = pr.chat_banned || muted, noNick = ("nick" in pr) && !pr.nick;
    f.querySelector("#chText").disabled = f.querySelector("#chSend").disabled = !!(banned || noNick);
    app.querySelector("#chWho").innerHTML = pr.nick ? T("Вы пишете как ") + "<b>" + esc(pr.nick) + "</b>" + (canMod() ? " · " + T("модератор") : "") : "";
    var m = f.querySelector("#chMsg");
    if (muted && !pr.chat_banned) { m.className = "cab-msg err"; m.textContent = T("У вас мут до ") + when(pr.chat_muted_until) + T(". Читать можно."); }
    else if (banned) { m.className = "cab-msg err"; m.textContent = T("Вам запрещено писать в чат. Читать можно."); }
    else if (noNick) { m.className = "cab-msg err"; m.textContent = T("Чтобы писать, укажите игровой ник (окно сверху или кабинет)."); }
  }

  /* ---------- телефон: как приложение ---------- */
  document.documentElement.classList.add("chat-page");
  function fitViewport() {
    var vv = window.visualViewport;
    app.style.setProperty("--app-h", (vv ? vv.height : window.innerHeight) + "px");
    app.style.setProperty("--app-top", (vv ? vv.offsetTop : 0) + "px");
  }
  fitViewport();
  if (window.visualViewport) { visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport); }
  window.addEventListener("resize", fitViewport);

  /* ---------- старт ---------- */
  var seen = null;
  A.on(function (s) {
    st = s;
    var key = (s.user ? s.user.id : "-") + "|" + (s.profile ? [s.profile.nick, s.profile.moderator, s.profile.chat_banned, s.profile.chat_muted_until, s.profile.chat_kicked].join(",") : "") + "|" + s.admin;
    if (key === seen) return;
    var firstForUser = !seen || seen.split("|")[0] !== key.split("|")[0];
    seen = key;
    if (!s.user) {
      started = false; if (chan) { sb.removeChannel(chan); chan = null; } if (presence) { sb.removeChannel(presence); presence = null; }
      app.innerHTML = '<div class="cab-note"><b>' + T("Чат — только для зарегистрированных.") + "</b> " + T("Войдите или зарегистрируйтесь (нужен игровой ник), и сможете читать и писать.") +
        ' <a class="btn pri" href="' + (EN ? "cabinet.en.html" : "cabinet.html") + '">' + T("Войти") + "</a></div>";
      return;
    }
    if (s.profile && s.profile.chat_kicked) {
      started = false; if (chan) { sb.removeChannel(chan); chan = null; }
      app.innerHTML = '<div class="cab-note"><b>' + T("Вас исключили из чата.") + "</b> " + T("Если это ошибка — напишите администратору сайта.") + "</div>";
      return;
    }
    if (firstForUser || !started) { started = true; shell(); setComposer(); load(); subscribe(); joinPresence(); }
    else { setComposer(); drawList(true); }
  });
})();

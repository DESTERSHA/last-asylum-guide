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
  var msgs = [], byId = {}, pins = [], results = {}, mine = {}, st = { user: null, profile: null, admin: false }, chan = null, started = false;
  var store = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
                set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { console.warn("чат: не сохранить настройку", e); } } };
  var target = store.get("la_chat_lang", EN ? "en" : "ru"), auto = store.get("la_chat_auto", "0") === "1";

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
  var chromeTr = {};
  async function viaChrome(text, src, dst) {
    if (!("Translator" in self)) return null;
    var key = src + ">" + dst;
    if (!chromeTr[key]) {
      var av = await self.Translator.availability({ sourceLanguage: src, targetLanguage: dst });
      if (av === "unavailable") return null;
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
    try { res = await viaChrome(text, src, dst); } catch (e) { console.warn("чат: переводчик Chrome не сработал, беру MyMemory:", e && e.message); }
    if (res == null) res = await viaMyMemory(text, src, dst);
    trCache[key] = res; saveCache();
    return res;
  }
  var opened = {};  // переводы, открытые кнопкой: после перерисовки ленты показываем снова (из кэша)
  var queue = Promise.resolve();
  function trMessage(id, force) {
    if (force) opened[id] = 1;  // по очереди, чтобы не заваливать сервис перевода
    queue = queue.then(async function () {
      var m = byId[id], el = app.querySelector('[data-msg="' + id + '"] .cm-tr');
      if (!m || !el || !m.body) return;
      if (!force && el.dataset.done) return;
      el.innerHTML = '<span class="mut">' + T("Перевожу…") + "</span>";
      try {
        var t = await translate(m.body, target);
        if (t == null) { el.innerHTML = force ? '<span class="mut">' + T("Сообщение уже на этом языке.") + "</span>" : ""; el.dataset.done = "1"; return; }
        el.innerHTML = '<div class="cm-trtxt">' + bodyHtml(t) + '</div><button type="button" class="linkbtn" data-orig="' + id + '">' + T("Показать оригинал") + "</button>";
        el.dataset.done = "1";
        var b = app.querySelector('[data-msg="' + id + '"] .cm-body'); if (b) b.classList.add("hid");
      } catch (e) {
        el.innerHTML = '<span class="cab-msg err">' + T("Не удалось перевести: ") + esc(e.message || e) + "</span>";
      }
    });
    return queue;
  }

  /* ---------- каркас ---------- */
  function shell() {
    app.innerHTML =
      '<div class="ch-top"><label>' + T("Переводить на") + ' <select id="chLang"><option value="ru">Русский</option><option value="en">English</option></select></label>' +
      '<label class="ch-auto"><input type="checkbox" id="chAuto"> ' + T("Автоперевод сообщений") + "</label>" +
      '<span class="ch-who" id="chWho"></span></div>' +
      '<div class="ch-pins" id="chPins" hidden></div>' +
      '<div class="ch-list" id="chList"><div class="cab-note">' + T("Загружаю чат…") + "</div></div>" +
      '<form class="ch-form" id="chForm"><div class="ch-prev" id="chPrev"></div><div class="ch-poll" id="chPoll" hidden></div>' +
      '<div class="ch-row"><label class="ch-btn" title="' + esc(T("Фото")) + '">📎<input type="file" id="chFiles" accept="image/*" multiple hidden></label>' +
      '<button type="button" class="ch-btn" id="chPollBtn" title="' + esc(T("Голосование")) + '" hidden>📊</button>' +
      '<textarea id="chText" rows="1" placeholder="' + esc(T("Сообщение… (Enter — отправить, Shift+Enter — новая строка)")) + '"></textarea>' +
      '<button type="submit" class="btn pri" id="chSend">' + T("Отправить") + '</button></div><p class="cab-msg" id="chMsg"></p></form>';
    var sel = app.querySelector("#chLang"); sel.value = target;
    sel.onchange = function () { target = sel.value; store.set("la_chat_lang", target); retranslate(); };
    var au = app.querySelector("#chAuto"); au.checked = auto;
    au.onchange = function () { auto = au.checked; store.set("la_chat_auto", auto ? "1" : "0"); retranslate(); };
    bindForm();
  }
  function retranslate() {
    app.querySelectorAll(".cm-tr").forEach(function (el) { el.innerHTML = ""; delete el.dataset.done; });
    app.querySelectorAll(".cm-body.hid").forEach(function (b) { b.classList.remove("hid"); });
    Object.keys(opened).forEach(function (id) { trMessage(+id, true); });
    if (auto) msgs.slice(-AUTO_LAST).forEach(function (m) { if (m.body) trMessage(m.id); });
  }

  /* ---------- сообщения ---------- */
  function canMod() { return A.isModerator(); }
  function msgHtml(m) {
    var me = st.user && m.user_id === st.user.id;
    var tags = (m.author_mod ? '<em class="cm-tag mod">' + T("модератор") + "</em>" : "") + (m.author_leader ? '<em class="cm-tag ld">' + T("лидер") + "</em>" : "");
    var imgs = (m.images || []).map(function (p) { return '<img src="' + esc(imgUrl(p)) + '" alt="" loading="lazy">'; }).join("");
    var acts = (m.body ? '<button type="button" class="linkbtn" data-tr="' + m.id + '">' + T("Перевести") + "</button>" : "") +
      (canMod() ? '<button type="button" class="linkbtn" data-pin="' + m.id + '">' + (m.pinned ? T("Открепить") : T("Закрепить")) + "</button>" : "") +
      (me || canMod() ? '<button type="button" class="linkbtn del" data-del="' + m.id + '">' + T("Удалить") + "</button>" : "") +
      (canMod() && !me && m.user_id ? '<button type="button" class="linkbtn del" data-ban="' + m.user_id + '" data-nick="' + esc(m.nick || "") + '">' + T("Запретить писать") + "</button>" : "");
    return '<div class="cm' + (me ? " me" : "") + (m.pinned ? " pinned" : "") + '" data-msg="' + m.id + '" id="msg-' + m.id + '">' +
      '<div class="cm-h"><b>' + esc(m.nick || "?") + "</b>" + tags + '<span class="cm-t">' + when(m.created_at) + "</span>" + (m.pinned ? '<span class="cm-pin">📌</span>' : "") + "</div>" +
      (m.body ? '<div class="cm-body">' + bodyHtml(m.body) + "</div>" : "") + '<div class="cm-tr"></div>' +
      (imgs ? '<div class="cm-imgs">' + imgs + "</div>" : "") + (m.poll ? pollHtml(m) : "") +
      '<div class="cm-a">' + acts + "</div></div>";
  }
  function pollHtml(m) {
    var pl = m.poll, res = results[m.id] || [], my = mine[m.id], over = ended(m), opts = pl.options || [];
    var by = opts.map(function (_, i) { return res.filter(function (x) { return x.opt === i; })[0] || { leaders: 0, players: 0, voters: [] }; });
    var totL = by.reduce(function (s, x) { return s + x.leaders; }, 0), totP = by.reduce(function (s, x) { return s + x.players; }, 0);
    var pct = function (n, t) { return t ? Math.round(n * 100 / t) : 0; };
    return '<div class="poll"><div class="poll-q">📊 ' + esc(pl.q) + '</div><div class="poll-info">' +
      [pl.anon ? T("Анонимное голосование") : T("Открытое голосование: ники видны всем"), pl.ends ? (over ? T("закончилось ") : T("до ")) + when(pl.ends) : T("без срока"), T("всего: лидеров ") + totL + T(", игроков ") + totP].join(" · ") + "</div>" +
      opts.map(function (o, i) {
        var x = by[i], vs = x.voters || [];
        return '<div class="poll-opt' + (my === i ? " mine" : "") + '"><button type="button" class="poll-vote" data-vote="' + m.id + '" data-opt="' + i + '"' + (over ? " disabled" : "") + ">" + (my === i ? "✓ " : "") + esc(o) + "</button>" +
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
      (msgs.length ? msgs.map(msgHtml).join("") : '<div class="cab-empty"><b>' + T("Сообщений пока нет.") + "</b><span>" + T("Напишите первым!") + "</span></div>");
    if (keepPos === "top") l.scrollTop = l.scrollHeight - oldH + oldTop; else if (stick) l.scrollTop = l.scrollHeight;
    if (auto) msgs.slice(-AUTO_LAST).forEach(function (m) { if (m.body) trMessage(m.id); });
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
    await loadPolls();
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
    await loadPolls(got.filter(function (m) { return m.poll; }).map(function (m) { return m.id; }));
    drawList("top");
  }
  function goTo(id) {
    var el = document.getElementById("msg-" + id);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); setTimeout(function () { el.classList.remove("flash"); }, 1600); }
    else { var m = pins.filter(function (x) { return x.id === id; })[0]; if (m) alert((m.nick || "") + ": " + (m.body || (m.poll && m.poll.q) || "")); }
  }

  /* ---------- новые сообщения сразу ---------- */
  function subscribe() {
    if (chan) sb.removeChannel(chan);
    chan = sb.channel("chat-room").on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, async function (p) {
      if (p.eventType === "INSERT") {
        put(p.new);
        if (p.new.poll) await loadPolls([p.new.id]);
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
  // итоги голосований обновляются раз в 20 с, пока вкладка открыта
  setInterval(function () { if (started && !document.hidden && msgs.some(function (m) { return m.poll; })) loadPolls().then(function () { drawList(true); }); }, 20000);

  /* ---------- действия ---------- */
  app.addEventListener("click", async function (e) {
    var t = e.target, b;
    if ((b = t.closest("#chOlder"))) return older();
    if ((b = t.closest("[data-goto]"))) return goTo(+b.dataset.goto);
    if ((b = t.closest(".cm-imgs img"))) { var lb = document.querySelector(".lightbox"); if (lb) { lb.querySelector("img").src = b.src; lb.classList.add("on"); } return; }
    if ((b = t.closest("[data-tr]"))) return trMessage(+b.dataset.tr, true);
    if ((b = t.closest("[data-orig]"))) {
      var box = app.querySelector('[data-msg="' + b.dataset.orig + '"]');
      delete opened[b.dataset.orig];
      box.querySelector(".cm-body").classList.remove("hid"); box.querySelector(".cm-tr").innerHTML = ""; delete box.querySelector(".cm-tr").dataset.done; return;
    }
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
    if ((b = t.closest("[data-ban]"))) {
      if (!confirm(T("Запретить «") + b.dataset.nick + T("» писать в чат? Снять запрет можно в кабинете."))) return;
      var rb = await sb.rpc("chat_set_ban", { p_user: b.dataset.ban, p_on: true });
      alert(rb.error ? rb.error.message : T("Готово: писать в чат больше не может."));
      return;
    }
    if ((b = t.closest("[data-vote]"))) {
      b.disabled = true;
      var rv = await sb.rpc("cast_chat_vote", { p_msg: +b.dataset.vote, p_opt: +b.dataset.opt });
      b.disabled = false;
      if (rv.error) return alert(rv.error.message);
      await loadPolls([+b.dataset.vote]); drawList(true);
    }
  });

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
    txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } });
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
      if (!pollBox.hidden) {
        var opts = [].map.call(pollBox.querySelectorAll(".nf-opt input"), function (i) { return i.value.trim(); }).filter(Boolean);
        var q = pollBox.querySelector("[name=q]").value.trim();
        if (!q || opts.length < 2) { msg.className = "cab-msg err"; msg.textContent = T("В голосовании нужен вопрос и хотя бы 2 варианта."); return; }
        row.poll = { q: q, options: opts, anon: pollBox.querySelector("[name=anon]").checked, ends: mskInputToIso(pollBox.querySelector("[name=ends]").value) };
      }
      if (!row.body && !fresh.length && !row.poll) return;
      var send = f.querySelector("#chSend"); send.disabled = true;
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
        txt.value = ""; grow(); fresh.forEach(function (x) { URL.revokeObjectURL(x.url); }); fresh = []; drawPrev();
        pollBox.hidden = true; pollBox.innerHTML = ""; msg.textContent = "";
      } catch (err) {
        msg.className = "cab-msg err"; msg.textContent = T("Не отправилось: ") + (err.message || err);
      }
      send.disabled = false; txt.focus();
    };
  }
  function setComposer() {
    var f = app.querySelector("#chForm"), pr = st.profile || {};
    if (!f) return;
    app.querySelector("#chPollBtn").hidden = !canMod();
    var banned = pr.chat_banned, noNick = ("nick" in pr) && !pr.nick;
    f.querySelector("#chText").disabled = f.querySelector("#chSend").disabled = !!(banned || noNick);
    app.querySelector("#chWho").innerHTML = pr.nick ? T("Вы пишете как ") + "<b>" + esc(pr.nick) + "</b>" + (canMod() ? " · " + T("модератор") : "") : "";
    var m = f.querySelector("#chMsg");
    if (banned) { m.className = "cab-msg err"; m.textContent = T("Вам запрещено писать в чат. Читать можно."); }
    else if (noNick) { m.className = "cab-msg err"; m.textContent = T("Чтобы писать, укажите игровой ник (окно сверху или кабинет)."); }
  }

  /* ---------- старт ---------- */
  var seen = null;
  A.on(function (s) {
    st = s;
    var key = (s.user ? s.user.id : "-") + "|" + (s.profile ? [s.profile.nick, s.profile.moderator, s.profile.chat_banned].join(",") : "") + "|" + s.admin;
    if (key === seen) return;
    var firstForUser = !seen || seen.split("|")[0] !== key.split("|")[0];
    seen = key;
    if (!s.user) {
      started = false; if (chan) { sb.removeChannel(chan); chan = null; }
      app.innerHTML = '<div class="cab-note"><b>' + T("Чат — только для зарегистрированных.") + "</b> " + T("Войдите или зарегистрируйтесь (нужен игровой ник), и сможете читать и писать.") +
        ' <a class="btn pri" href="' + (EN ? "cabinet.en.html" : "cabinet.html") + '">' + T("Войти") + "</a></div>";
      return;
    }
    if (firstForUser || !started) { started = true; shell(); setComposer(); load(); subscribe(); }
    else { setComposer(); drawList(true); }
  });
})();

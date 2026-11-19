/* «Важные новости»: лента постов (читают все), публикация — у редакторов (отметку ставит админ в кабинете),
   скрины сжимаются в браузере перед загрузкой, голосования с итогами отдельно по лидерам альянсов и по игрокам.
   База — Supabase (tools/supabase_news.sql). */
(function () {
  "use strict";
  var T = function (s) { return window.T ? window.T(s) : s; };
  var EN = document.documentElement.lang === "en";
  var feed = document.getElementById("newsFeed"), bar = document.getElementById("newsBar"), formBox = document.getElementById("newsForm");
  if (!feed) return;
  var A = window.LAAuth, sb = A && A.client;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var PAGE = 20, MAX_IMG = 10;
  var posts = [], results = {}, mine = {}, shown = PAGE, st = { user: null, profile: null, admin: false };

  if (!sb) { feed.innerHTML = '<div class="cab-note">' + T("Новости временно недоступны.") + "</div>"; return; }

  /* время: по Москве и по игре (игра = Москва − 5 ч) */
  var LOC = EN ? "en-GB" : "ru-RU";
  function fmtWhen(iso) {
    var d = new Date(iso);
    var day = d.toLocaleDateString(LOC, { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
    var msk = d.toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    var srv = d.toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit", timeZone: "Etc/GMT+2" });
    return day + ", " + msk + " " + T("МСК") + " · " + srv + " " + T("в игре");
  }
  function mskInputToIso(v) { return v ? new Date(v + ":00+03:00").toISOString() : null; }
  function isoToMskInput(iso) { return iso ? new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 16) : ""; }
  function imgUrl(p) { return sb.storage.from("news").getPublicUrl(p).data.publicUrl; }
  function bodyHtml(s) {
    return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>");
  }
  function canEdit(p) { return st.user && (st.admin || (A.isEditor() && p.author === st.user.id)); }
  function ended(p) { return p.poll && p.poll.ends && new Date(p.poll.ends) <= new Date(); }

  /* ===== загрузка ===== */
  async function load() {
    var r = await sb.from("posts").select("*").order("created_at", { ascending: false }).limit(200);
    if (r.error) { feed.innerHTML = '<div class="cab-note">' + T("Не удалось загрузить новости: ") + esc(r.error.message) + "</div>"; return; }
    posts = r.data || [];
    await loadVotes();
    draw();
    var h = location.hash.match(/^#post-(\d+)$/);
    if (h) { var el = document.getElementById("post-" + h[1]); if (el) setTimeout(function () { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); }, 60); }
  }
  async function loadVotes(onlyId) {
    var ids = posts.filter(function (p) { return p.poll && (!onlyId || p.id === onlyId); }).map(function (p) { return p.id; });
    if (!ids.length) return;
    var r = await sb.rpc("poll_results", { p_posts: ids });
    ids.forEach(function (id) { results[id] = []; });
    (r.data || []).forEach(function (x) { results[x.post_id].push(x); });
    if (st.user) {
      var m = await sb.rpc("my_votes", { p_posts: ids });
      ids.forEach(function (id) { delete mine[id]; });
      (m.data || []).forEach(function (x) { mine[x.post_id] = x.opt; });
    }
  }

  /* ===== лента ===== */
  function draw() {
    bar.innerHTML = st.user && A.isEditor() ? '<button type="button" class="btn pri" id="newPost">＋ ' + T("Новый пост") + "</button>" : "";
    var nb = document.getElementById("newPost");
    if (nb) nb.onclick = function () { openForm(null); };
    if (!posts.length) { feed.innerHTML = '<div class="cab-empty"><b>' + T("Пока новостей нет.") + "</b><span>" + T("Здесь появятся объявления короля и лидеров: планы на КвК, голосования, срочные новости.") + "</span></div>"; return; }
    feed.innerHTML = posts.slice(0, shown).map(postHtml).join("") +
      (posts.length > shown ? '<button type="button" class="btn news-more" id="newsMore">' + T("Показать ещё") + "</button>" : "");
    var mb = document.getElementById("newsMore");
    if (mb) mb.onclick = function () { shown += PAGE; draw(); };
    posts.slice(0, shown).forEach(function (p) { if (!showOrig[p.id]) trPost(p); });
    loadComments(); subscribeComments();
  }
  var TARGET = EN ? "en" : "ru", showOrig = {}, trDone = {};

  /* ===== комментарии к постам ===== */
  var comments = {}, cOpen = {}, cChan = null;  // id поста → [комментарии]; открытые блоки
  function canDelC(c) { return st.user && (c.user_id === st.user.id || (A.isModerator && A.isModerator())); }
  function commentsHtml(p) {
    var list = comments[p.id] || [], open = !!cOpen[p.id];
    return '<div class="nc" data-cpost="' + p.id + '"><button type="button" class="linkbtn nc-toggle" data-ctoggle="' + p.id + '">💬 ' + T("Комментарии") + " (" + list.length + ")" + (open ? " ▴" : " ▾") + "</button>" +
      (open ? '<div class="nc-list">' + (list.length ? list.map(function (c) {
        return '<div class="nc-it" data-cid="' + c.id + '"><div class="nc-h"><b>' + esc(c.nick || "?") + "</b>" +
          (c.author_mod ? '<em class="cm-tag mod">' + T("модератор") + "</em>" : "") + (c.author_leader ? '<em class="cm-tag ld">' + T("лидер") + "</em>" : "") +
          '<span class="nc-t">' + fmtWhen(c.created_at) + "</span>" + (canDelC(c) ? '<button type="button" class="linkbtn del" data-cdel="' + c.id + '" data-cp="' + p.id + '">' + T("Удалить") + "</button>" : "") + "</div>" +
          '<div class="nc-b" data-ctext>' + bodyHtml(c.body) + "</div></div>";
      }).join("") : '<div class="nc-empty">' + T("Комментариев пока нет.") + "</div>") + "</div>" +
        (st.user ? '<form class="nc-form" data-cform="' + p.id + '"><textarea rows="1" maxlength="5000" placeholder="' + esc(T("Написать комментарий…")) + '"></textarea><button type="submit" class="btn pri">' + T("Отправить") + '</button><span class="cab-msg"></span></form>'
          : '<div class="nc-empty"><a href="' + (EN ? "cabinet.en.html" : "cabinet.html") + '">' + T("Войдите, чтобы комментировать") + "</a></div>") : "") + "</div>";
  }
  function redrawComments(pid) {
    var box = feed.querySelector('[data-cpost="' + pid + '"]'); if (!box) return;
    var p = posts.filter(function (x) { return x.id === pid; })[0]; if (!p) return;
    var typed = box.querySelector("textarea") ? box.querySelector("textarea").value : "";
    box.outerHTML = commentsHtml(p);
    var nb = feed.querySelector('[data-cpost="' + pid + '"]'), ta = nb && nb.querySelector("textarea");
    if (ta && typed) ta.value = typed;
    trComments(pid);
  }
  function trComments(pid) {  // комментарии — на языке сайта, как и пост
    if (!window.LATr || !cOpen[pid]) return;
    (comments[pid] || []).forEach(function (c) {
      if (!LATr.needs(c.body, TARGET)) return;
      LATr.translate(c.body, TARGET, "news").then(function (t) {
        var el = feed.querySelector('[data-cid="' + c.id + '"] [data-ctext]');
        if (el && t) { el.innerHTML = bodyHtml(t); el.title = c.body; }
      }).catch(function (e) { console.warn("новости: перевод комментария", e); });
    });
  }
  async function loadComments() {
    var ids = posts.slice(0, shown).map(function (p) { return p.id; });
    if (!ids.length) return;
    var r = await sb.from("post_comments").select("*").in("post_id", ids).order("created_at", { ascending: true });
    if (r.error) { console.warn("новости: комментарии", r.error.message); return; }
    ids.forEach(function (id) { comments[id] = []; });
    (r.data || []).forEach(function (c) { (comments[c.post_id] = comments[c.post_id] || []).push(c); });
    ids.forEach(redrawComments);
  }
  function subscribeComments() {
    if (cChan) return;
    cChan = sb.channel("news-comments").on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, function (pl) {
      var c = pl.eventType === "DELETE" ? pl.old : pl.new; if (!c || !c.post_id) return;
      var list = comments[c.post_id] = comments[c.post_id] || [];
      if (pl.eventType === "DELETE") comments[c.post_id] = list.filter(function (x) { return x.id !== c.id; });
      else if (!list.some(function (x) { return x.id === c.id; })) list.push(c);
      redrawComments(c.post_id);
    }).subscribe();
  }

  function trApply(p, tr) {
    var art = document.getElementById("post-" + p.id); if (!art || showOrig[p.id]) return;
    if (tr.title != null) art.querySelector("[data-tt]").textContent = tr.title;
    if (tr.body != null && art.querySelector("[data-tb]")) art.querySelector("[data-tb]").innerHTML = bodyHtml(tr.body);
    if (tr.q != null && art.querySelector("[data-tq]")) art.querySelector("[data-tq]").textContent = tr.q;
    (tr.opts || []).forEach(function (o, i) { var el = art.querySelector('[data-to="' + i + '"]'); if (el && o != null) el.textContent = o; });
    var b = art.querySelector("[data-orig]"); if (b) b.hidden = false;
  }
  async function trPost(p) {
    if (!window.LATr) return;
    var all = [p.title, p.body, p.poll ? p.poll.q : "", (p.poll && p.poll.options || []).join(" ")].join(" ");
    if (!LATr.needs(all, TARGET)) return;
    if (trDone[p.id]) { trApply(p, trDone[p.id]); return; }
    try {
      var r = await Promise.all([LATr.translate(p.title, TARGET, "news"), p.body ? LATr.translate(p.body, TARGET, "news") : null,
        p.poll ? LATr.translate(p.poll.q, TARGET, "news") : null,
        p.poll ? Promise.all((p.poll.options || []).map(function (o) { return LATr.translate(o, TARGET, "news"); })) : null]);
      trDone[p.id] = { title: r[0], body: r[1], q: r[2], opts: r[3] || [] };
      trApply(p, trDone[p.id]);
    } catch (e) { console.warn("новости: перевод поста", p.id, e); }
  }
  function postHtml(p) {
    var imgs = (p.images || []).map(function (x) { return '<img src="' + esc(imgUrl(x)) + '" alt="" loading="lazy">'; }).join("");
    return '<article class="news-post' + (p.urgent ? " urgent" : "") + '" id="post-' + p.id + '">' +
      '<div class="news-meta">' + (p.urgent ? '<span class="news-urgent">' + T("Срочно") + "</span>" : "") +
      "<span>" + fmtWhen(p.created_at) + "</span>" + (p.author_nick ? "<span>· " + esc(p.author_nick) + "</span>" : "") +
      (p.updated_at ? '<span class="news-ed">· ' + T("изменено") + "</span>" : "") +
      (canEdit(p) ? '<span class="news-act"><button type="button" class="linkbtn" data-edit="' + p.id + '">' + T("Изменить") + '</button><button type="button" class="linkbtn del" data-del="' + p.id + '">' + T("Удалить") + "</button></span>" : "") +
      '<button type="button" class="linkbtn news-orig" data-orig="' + p.id + '" hidden>' + T("Показать оригинал") + "</button>" +
      '<a class="linkbtn news-share" href="' + (EN ? "chat.en.html" : "chat.html") + "?share=post-" + p.id + '">💬 ' + T("В чат") + "</a>" +
      "</div><h3 data-tt>" + esc(p.title) + "</h3>" +
      (p.body ? '<div class="news-body" data-tb>' + bodyHtml(p.body) + "</div>" : "") +
      (imgs ? '<div class="news-imgs">' + imgs + "</div>" : "") +
      (p.poll ? pollHtml(p) : "") + commentsHtml(p) + "</article>";
  }
  function pollHtml(p) {
    var pl = p.poll, res = results[p.id] || [], my = mine[p.id], over = ended(p);
    var opts = pl.options || [];
    var by = opts.map(function (_, i) { return res.filter(function (x) { return x.opt === i; })[0] || { leaders: 0, players: 0, voters: [] }; });
    var totL = by.reduce(function (s, x) { return s + x.leaders; }, 0), totP = by.reduce(function (s, x) { return s + x.players; }, 0);
    var pct = function (n, t) { return t ? Math.round(n * 100 / t) : 0; };
    var rows = opts.map(function (o, i) {
      var x = by[i], vs = x.voters || [];
      return '<div class="poll-opt' + (my === i ? " mine" : "") + '">' +
        '<button type="button" class="poll-vote" data-vote="' + p.id + '" data-opt="' + i + '"' + (over ? " disabled" : "") + '><span data-to="' + i + '">' + esc(o) + "</span></button>" +
        '<div class="poll-bars"><div class="poll-bar ld"><i style="width:' + pct(x.leaders, totL) + '%"></i><span>' + T("Лидеры") + ": <b>" + x.leaders + "</b> · " + pct(x.leaders, totL) + "%</span></div>" +
        '<div class="poll-bar pl"><i style="width:' + pct(x.players, totP) + '%"></i><span>' + T("Игроки") + ": <b>" + x.players + "</b> · " + pct(x.players, totP) + "%</span></div></div>" +
        (!pl.anon && vs.length ? '<details class="poll-who"><summary>' + T("Кто голосовал") + " (" + vs.length + ")</summary>" +
          vs.map(function (v) { return '<span class="' + (v.leader ? "ld" : "") + '">' + esc(v.nick || "?") + (v.leader ? " · " + T("лидер") : "") + "</span>"; }).join("") + "</details>" : "") +
        "</div>";
    }).join("");
    var info = [pl.anon ? T("Анонимное голосование") : T("Открытое голосование: ники видны всем"),
      pl.ends ? (over ? T("закончилось ") : T("до ")) + fmtWhen(pl.ends) : T("без срока"),
      T("всего: лидеров ") + totL + T(", игроков ") + totP];
    var hint = over ? "" : !st.user ? '<a href="' + (EN ? "cabinet.en.html" : "cabinet.html") + '">' + T("Войдите или зарегистрируйтесь, чтобы голосовать") + "</a>" :
      (my != null ? T("Вы проголосовали. Можно переголосовать, пока голосование идёт.") : T("Нажмите на вариант, чтобы проголосовать."));
    return '<div class="poll" data-poll="' + p.id + '"><div class="poll-q">' + '<span data-tq>' + esc(pl.q) + '</span>' + '</div><div class="poll-info">' + info.join(" · ") + "</div>" + rows +
      '<div class="poll-hint">' + hint + '<span class="cab-msg"></span></div>' +
      (st.admin ? '<details class="poll-admin" data-adm="' + p.id + '"><summary>' + T("Все голоса (видно только админу)") + '</summary><div class="poll-adm-list">…</div></details>' : "") + "</div>";
  }

  /* ===== действия в ленте ===== */
  feed.addEventListener("submit", async function (e) {
    var f = e.target.closest("[data-cform]"); if (!f) return;
    e.preventDefault();
    var pid = +f.dataset.cform, ta = f.querySelector("textarea"), msg = f.querySelector(".cab-msg"), body = ta.value.trim();
    if (!body) return;
    var btn = f.querySelector("button"); btn.disabled = true; msg.className = "cab-msg"; msg.textContent = "";
    var r = await (A.call ? A.call(function () { return sb.from("post_comments").insert({ post_id: pid, body: body }).select().single(); }) : sb.from("post_comments").insert({ post_id: pid, body: body }).select().single());
    btn.disabled = false;
    if (r.error) { msg.className = "cab-msg err"; msg.textContent = r.error.message; return; }
    ta.value = "";
    var list = comments[pid] = comments[pid] || [];
    if (!list.some(function (x) { return x.id === r.data.id; })) list.push(r.data);
    redrawComments(pid);
  });
  feed.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && e.target.closest && e.target.closest("[data-cform] textarea") && !window.matchMedia("(max-width:760px)").matches) {
      e.preventDefault(); e.target.closest("form").requestSubmit();
    }
  });
  feed.addEventListener("click", async function (e) {
    var ct = e.target.closest("[data-ctoggle]");
    if (ct) { var cp = +ct.dataset.ctoggle; cOpen[cp] = !cOpen[cp]; redrawComments(cp); if (cOpen[cp]) { var ta0 = feed.querySelector('[data-cform="' + cp + '"] textarea'); if (ta0) ta0.focus(); } return; }
    var cd = e.target.closest("[data-cdel]");
    if (cd) {
      if (!confirm(T("Удалить комментарий?"))) return;
      var rd = await sb.from("post_comments").delete().eq("id", +cd.dataset.cdel);
      if (rd.error) return alert(rd.error.message);
      var cpid = +cd.dataset.cp; comments[cpid] = (comments[cpid] || []).filter(function (x) { return x.id !== +cd.dataset.cdel; }); redrawComments(cpid);
      return;
    }
    var ob = e.target.closest("[data-orig]");
    if (ob) {
      var pid = +ob.dataset.orig; showOrig[pid] = !showOrig[pid];
      var pp = posts.filter(function (x) { return x.id === pid; })[0];
      var art = document.getElementById("post-" + pid); art.outerHTML = postHtml(pp);
      var b2 = document.querySelector('#post-' + pid + ' [data-orig]');
      if (showOrig[pid]) { b2.hidden = false; b2.textContent = T("Показать перевод"); } else trPost(pp);
      return;
    }
    var v = e.target.closest("[data-vote]") || (!e.target.closest("details, button, a") && e.target.closest(".poll-opt") ? e.target.closest(".poll-opt").querySelector("[data-vote]") : null), ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]"), rm = e.target.closest("[data-rmvote]"), im = e.target.closest(".news-imgs img");
    if (im) { var lb = document.querySelector(".lightbox"); if (lb) { lb.querySelector("img").src = im.src; lb.classList.add("on"); } return; }
    if (v) return vote(+v.dataset.vote, +v.dataset.opt, v);
    if (ed) return openForm(posts.filter(function (p) { return p.id === +ed.dataset.edit; })[0]);
    if (del) return removePost(+del.dataset.del);
    if (rm) {
      if (!confirm(T("Снять этот голос?"))) return;
      var r = await sb.rpc("admin_remove_vote", { p_post: +rm.dataset.post, p_user: rm.dataset.rmvote });
      if (r.error) return alert(r.error.message);
      await loadVotes(+rm.dataset.post); draw(); openAdmin(+rm.dataset.post);
    }
  });
  feed.addEventListener("toggle", function (e) { var d = e.target; if (d.matches && d.matches("[data-adm]") && d.open) openAdmin(+d.dataset.adm); }, true);
  async function openAdmin(id) {
    var d = feed.querySelector('[data-adm="' + id + '"]'); if (!d) return;
    d.open = true;
    var box = d.querySelector(".poll-adm-list"), p = posts.filter(function (x) { return x.id === id; })[0];
    var r = await sb.rpc("admin_poll_voters", { p_post: id });
    if (r.error) { box.textContent = r.error.message; return; }
    var rows = r.data || [];
    box.innerHTML = rows.length ? '<table class="cab-users"><tr><th>' + T("Вариант") + "</th><th>" + T("Ник") + "</th><th>" + T("Почта") + "</th><th>" + T("Кто") + "</th><th></th></tr>" + rows.map(function (x) {
      return "<tr><td>" + esc((p.poll.options || [])[x.opt]) + "</td><td>" + esc(x.nick || "—") + "</td><td>" + esc(x.email) + "</td><td>" + (x.leader ? T("лидер") : T("игрок")) + (x.vote_banned ? " · " + T("запрет, не считается") : "") +
        '</td><td><button type="button" class="linkbtn del" data-rmvote="' + esc(x.user_id) + '" data-post="' + id + '">' + T("снять голос") + "</button></td></tr>";
    }).join("") + "</table>" : T("Голосов пока нет.");
  }
  async function vote(id, opt, btn) {
    var msg = btn.closest(".poll").querySelector(".poll-hint .cab-msg");
    if (!st.user) { location.href = EN ? "cabinet.en.html" : "cabinet.html"; return; }
    if (st.profile && ("nick" in st.profile) && !st.profile.nick) {
      var n = prompt(T("Сначала укажите игровой ник (как в игре):"), "");
      if (!n || !n.trim()) return;
      try { await A.setNick(n); } catch (err) { alert(err.message || err); return; }
    }
    btn.disabled = true;
    var r = await A.call(function () { return sb.rpc("cast_vote", { p_post: id, p_opt: opt }); });
    btn.disabled = false;
    if (r.error) { msg.className = "cab-msg err"; msg.textContent = " " + r.error.message; return; }
    await loadVotes(id); draw();
  }
  async function removePost(id) {
    var p = posts.filter(function (x) { return x.id === id; })[0];
    if (!p || !confirm(T("Удалить пост «") + p.title + T("»? Голоса и скрины удалятся тоже."))) return;
    if ((p.images || []).length) { var s = await sb.storage.from("news").remove(p.images); if (s.error) console.warn("скрины не удалены:", s.error.message); }
    var r = await sb.from("posts").delete().eq("id", id);
    if (r.error) return alert(r.error.message);
    load();
  }

  /* ===== форма поста ===== */
  /* скрин -> не шире 1600 и не выше 4000 точек, WebP (или JPEG, если браузер не умеет WebP): обычно 150–400 КБ вместо 1–3 МБ */
  async function shrink(file) {
    var bmp = await createImageBitmap(file);
    var k = Math.min(1, 1600 / bmp.width, 4000 / bmp.height);
    var c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    var blob = await new Promise(function (ok) { c.toBlob(ok, "image/webp", 0.82); });
    if (!blob || blob.type !== "image/webp") blob = await new Promise(function (ok) { c.toBlob(ok, "image/jpeg", 0.85); });
    return blob;
  }
  function openForm(p) {
    var pl = p && p.poll, hasVotes = p && (results[p.id] || []).length > 0;
    var keep = p ? (p.images || []).slice() : [], fresh = [];
    formBox.hidden = false;
    formBox.innerHTML = '<form class="news-form"><h3>' + (p ? T("Изменить пост") : T("Новый пост")) + "</h3>" +
      "<label>" + T("Заголовок") + '<input name="title" required maxlength="200" value="' + esc(p ? p.title : "") + '"></label>' +
      "<label>" + T("Текст") + '<textarea name="body" rows="7" maxlength="20000">' + esc(p ? p.body : "") + "</textarea></label>" +
      '<div class="nf-imgs"></div><label class="nf-file">' + T("＋ Скрины (до 10)") + '<input type="file" name="files" accept="image/*" multiple hidden></label>' +
      '<label class="nf-chk"><input type="checkbox" name="urgent"' + (p && p.urgent ? " checked" : "") + "> <b>" + T("Срочно") + "</b> — " + T("плашка с заголовком на всех страницах сайта (7 дней или пока человек её не закроет)") + "</label>" +
      '<label class="nf-chk"><input type="checkbox" name="haspoll"' + (pl ? " checked" : "") + (hasVotes ? " disabled" : "") + "> <b>" + T("Добавить голосование") + "</b></label>" +
      '<div class="nf-poll"' + (pl ? "" : " hidden") + ">" +
      (hasVotes ? '<p class="cab-hint">' + T("В голосовании уже есть голоса: вопрос, варианты и анонимность менять нельзя, можно только срок.") + "</p>" : "") +
      "<label>" + T("Вопрос") + '<input name="q" maxlength="300" value="' + esc(pl ? pl.q : "") + '"' + (hasVotes ? " disabled" : "") + "></label>" +
      '<div class="nf-opts"></div>' + (hasVotes ? "" : '<button type="button" class="linkbtn" id="addOpt">' + T("＋ вариант") + "</button>") +
      '<label class="nf-chk"><input type="checkbox" name="anon"' + (pl && pl.anon ? " checked" : "") + (hasVotes ? " disabled" : "") + "> " + T("Анонимное голосование (ники не показываются, видны только числа)") + "</label>" +
      "<label>" + T("Окончание голосования, время по Москве (пусто — без срока)") + '<input type="datetime-local" name="ends" value="' + isoToMskInput(pl && pl.ends) + '"></label></div>' +
      '<div class="nf-btns"><button type="submit" class="btn pri">' + (p ? T("Сохранить") : T("Опубликовать")) + '</button><button type="button" class="btn" id="nfCancel">' + T("Отмена") + '</button><span class="cab-msg"></span></div></form>';
    var f = formBox.querySelector("form"), msg = f.querySelector(".cab-msg"), optsBox = f.querySelector(".nf-opts"), imgsBox = f.querySelector(".nf-imgs");
    function optRow(v) {
      var d = document.createElement("div"); d.className = "nf-opt";
      d.innerHTML = '<input maxlength="150" placeholder="' + esc(T("Вариант ответа")) + '" value="' + esc(v || "") + '"' + (hasVotes ? " disabled" : "") + ">" + (hasVotes ? "" : '<button type="button" class="linkbtn del" title="' + esc(T("убрать")) + '">✕</button>');
      var x = d.querySelector("button"); if (x) x.onclick = function () { d.remove(); };
      optsBox.appendChild(d);
    }
    (pl ? pl.options : [T("За"), T("Против")]).forEach(optRow);
    var ao = f.querySelector("#addOpt"); if (ao) ao.onclick = function () { optRow(""); };
    f.haspoll.onchange = function () { f.querySelector(".nf-poll").hidden = !f.haspoll.checked; };
    function drawImgs() {
      imgsBox.innerHTML = keep.map(function (x, i) { return '<span><img src="' + esc(imgUrl(x)) + '" alt=""><button type="button" data-k="' + i + '">✕</button></span>'; }).join("") +
        fresh.map(function (x, i) { return '<span><img src="' + x.url + '" alt=""><button type="button" data-f="' + i + '">✕</button></span>'; }).join("");
    }
    imgsBox.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.k != null) keep.splice(+b.dataset.k, 1); else { URL.revokeObjectURL(fresh[+b.dataset.f].url); fresh.splice(+b.dataset.f, 1); }
      drawImgs();
    };
    f.files.onchange = function () {
      [].forEach.call(f.files.files, function (file) { if (keep.length + fresh.length < MAX_IMG) fresh.push({ file: file, url: URL.createObjectURL(file) }); });
      f.files.value = ""; drawImgs();
    };
    drawImgs();
    f.querySelector("#nfCancel").onclick = function () { formBox.hidden = true; formBox.innerHTML = ""; };
    formBox.scrollIntoView({ block: "start" });
    f.onsubmit = async function (e) {
      e.preventDefault(); msg.className = "cab-msg";
      var row = { title: f.title.value.trim(), body: f.body.value.trim(), urgent: f.urgent.checked, poll: null };
      if (f.haspoll.checked) {
        var opts = [].map.call(optsBox.querySelectorAll("input"), function (i) { return i.value.trim(); }).filter(Boolean);
        if (!hasVotes && (!f.q.value.trim() || opts.length < 2)) { msg.className = "cab-msg err"; msg.textContent = T("В голосовании нужен вопрос и хотя бы 2 варианта."); return; }
        row.poll = hasVotes ? Object.assign({}, pl, { ends: mskInputToIso(f.ends.value) }) : { q: f.q.value.trim(), options: opts, anon: f.anon.checked, ends: mskInputToIso(f.ends.value) };
      }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        var paths = keep.slice(), removed = p ? (p.images || []).filter(function (x) { return keep.indexOf(x) === -1; }) : [];
        for (var i = 0; i < fresh.length; i++) {
          msg.textContent = T("Сжимаю и загружаю скрин ") + (i + 1) + " / " + fresh.length + "…";
          var blob = await shrink(fresh[i].file);
          var path = st.user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + (blob.type === "image/webp" ? ".webp" : ".jpg");
          var u = await sb.storage.from("news").upload(path, blob, { contentType: blob.type, upsert: false });
          if (u.error) throw u.error;
          paths.push(path);
        }
        row.images = paths;
        msg.textContent = T("Сохраняю…");
        var r = p ? await sb.from("posts").update(row).eq("id", p.id) : await sb.from("posts").insert(row);
        if (r.error) throw r.error;
        if (removed.length) { var s = await sb.storage.from("news").remove(removed); if (s.error) console.warn("старые скрины не удалены:", s.error.message); }
        fresh.forEach(function (x) { URL.revokeObjectURL(x.url); });
        formBox.hidden = true; formBox.innerHTML = "";
        load();
      } catch (err) {
        msg.className = "cab-msg err"; msg.textContent = T("Не получилось: ") + (err.message || err); btn.disabled = false;
      }
    };
  }

  /* ===== старт ===== */
  var seen = null;
  A.on(function (s) {
    st = s;
    var key = (s.user ? s.user.id : "-") + (s.profile ? ":" + s.profile.editor + s.profile.nick : "") + s.admin;
    if (key === seen) return;
    seen = key;
    load();
  });
})();

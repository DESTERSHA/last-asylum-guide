/* Язык страницы. LA_LANG — "ru" или "en" (из <html lang>). T("русская строка") — английская строка на английской странице.
   LAurl("server.html#p=1") — ссылка на страницу того же языка (если у страницы есть английская версия).
   Словарь EN пополняется вместе с переводом скриптов; строки без перевода остаются русскими. */
(function () {
  "use strict";
  var lang = (document.documentElement.getAttribute("lang") || "ru").slice(0, 2);
  var meta = document.querySelector('meta[name="la-en"]');
  var have = meta ? meta.getAttribute("content").split(",") : [];
  window.LA_LANG = lang;
  window.LA_I18N = Object.assign({
    /* app.js — часы, отсчёт до КвК, «сегодня» (игровые слова — из английских текстов игры) */
    "бой идёт!": "battle is on!", "через ": "in ", " д ": "d ", " ч ": "h ", " м": "m", "сегодня": "today",
    "Воскресенье": "Sunday", "Понедельник": "Monday", "Вторник": "Tuesday", "Среда": "Wednesday", "Четверг": "Thursday", "Пятница": "Friday", "Суббота": "Saturday",
    "Отдых. Ничего не трать — копи.": "Rest. Don't spend anything — save up.",
    "Короля демонов нет": "No Demon King",
    "День 1 — Ворон: задания сокола, плоды и эссенция Ворона, энергия, сбор ресурсов": "Day 1 — Raven: Falcon Quests, Raven fruit and essence, Stamina, gathering resources",
    "День 2 — Стройка: молотки, ускорения стройки, золотые караваны и секретные операции, выжившие": "Day 2 — Building: hammers, building speedups, gold caravans and Covert Operations, survivors",
    "День 3 — Наука: ускорения исследований, свитки, сундуки снаряжения Ворона, сокол": "Day 3 — Research: research speedups, scrolls, Raven gear chests, Falcon",
    "День 4 — Герои: противоядие, фрагменты, значки навыков, найм": "Day 4 — Heroes: Antitoxin, shards, Skill Badges, recruiting",
    "День 5 — Войска: обучение и повышение солдат, сокол": "Day 5 — Troops: training and promoting troops, Falcon",
    "День 6 — Набег: щит, убрать отряд со стены. Бой КвК в 17:00 МСК": "Day 6 — Raid: shield up, take your squad off the wall. Kingdom War battle at 17:00 Moscow",
    "Колдун скверны — бей Воинами": "Warlock Blight — hit with Warriors",
    "Рейнджер скверны — бей Колдунами": "Ranger Blight — hit with Warlocks",
    "Воин скверны — бей Рейнджерами": "Warrior Blight — hit with Rangers",
    /* fav.js, auth.js, peek.js */
    "★ В избранном": "★ Saved", "☆ В избранное": "☆ Save", "Убрать из избранного": "Remove from saved",
    "Добавить в избранное — появится в «Кабинете»": "Save — it will appear on «My page»",
    "Кабинет": "My page", "Войти": "Sign in",
    "Закрыть": "Close", "Назад": "Back", "Открыть страницу целиком ↗": "Open the full page ↗", "Быстрый просмотр": "Quick view", "Загружаю…": "Loading…"
  }, window.LA_I18N_EXTRA || {}, window.LA_I18N || {});
  window.T = function (s) { return lang === "en" && window.LA_I18N[s] != null ? window.LA_I18N[s] : s; };
  window.LAurl = function (u) {
    if (lang !== "en") return u;
    return String(u).replace(/^([a-z0-9]+)\.html/, function (m, slug) { return have.indexOf(slug) >= 0 ? slug + ".en.html" : m; });
  };
  function save(v) { try { localStorage.setItem("la_lang", v); } catch (e) { /* без хранилища — просто не запоминаем */ } }
  /* переключатель RU/EN: та же страница, то же место (#...) */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-lang-sw]");
    if (!a) return;
    e.preventDefault();
    save(a.getAttribute("data-lang-sw"));
    location.href = a.getAttribute("href") + location.hash;
  });
  /* первый визит: спросить язык сайта (её решение 20.11 — не угадывать по браузеру). Выбор запоминается и задаёт язык перевода в чате */
  var saved = null;
  try { saved = localStorage.getItem("la_lang"); } catch (e) { saved = "skip"; }  // без хранилища — не спрашиваем каждый раз
  var sw0 = document.querySelector("[data-lang-sw]");
  if (!saved && sw0 && !/[?&]embed=1/.test(location.search)) {
    var ask = function () {
      var w = document.createElement("div");
      w.className = "lang-ask";
      w.innerHTML = '<div class="lang-ask-box"><b>Выберите язык · Choose language</b>' +
        '<button type="button" data-pick-lang="ru">🇷🇺 Русский</button><button type="button" data-pick-lang="en">🇬🇧 English</button></div>';
      document.body.appendChild(w);
      w.addEventListener("click", function (e) {
        var b = e.target.closest("[data-pick-lang]"); if (!b) return;
        var v = b.getAttribute("data-pick-lang");
        save(v);
        try { localStorage.setItem("la_chat_lang", v); localStorage.setItem("la_chat_auto2", "1"); } catch (err) { /* без хранилища */ }
        if (v === lang) { w.remove(); return; }
        location.href = sw0.getAttribute("href") + location.hash;
      });
    };
    if (document.body) ask(); else document.addEventListener("DOMContentLoaded", ask);
  }
})();

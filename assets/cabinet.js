/* Кабинет: список избранного по группам. Данные — window.LAFav (assets/fav.js). */
(function () {
  "use strict";
  var box = document.getElementById("cabList"), acc = document.getElementById("cabAcc");
  if (!box || !window.LAFav) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var GROUPS = [["Альянс", "Альянсы"], ["Игрок", "Игроки"], ["Событие", "События"], ["Раздел", "Разделы сайта"]];
  acc.innerHTML = '<div class="cab-note"><b>Вход и регистрация — скоро.</b> Сейчас избранное хранится в этом браузере на этом устройстве. После входа по почте и паролю оно будет в вашем аккаунте и на всех устройствах.</div>';
  function draw() {
    var l = LAFav.list();
    if (!l.length) {
      box.innerHTML = '<div class="cab-empty"><b>Пока пусто.</b><span>Открой любую страницу — у разделов и событий есть кнопка «☆ В избранное», а на странице «Сервер 397» — у альянсов и игроков.</span><a class="btn pri" href="events.html">Например, события</a></div>';
      return;
    }
    box.innerHTML = GROUPS.map(function (g) {
      var items = l.filter(function (x) { return (x.kind || "Раздел") === g[0]; });
      if (!items.length) return "";
      return '<div class="cab-grp"><h3>' + g[1] + " <i>" + items.length + '</i></h3><div class="cab-items">' + items.map(function (x) {
        return '<div class="cab-it">' + (x.icon ? '<img src="' + esc(x.icon) + '" alt="">' : '<span class="ph">★</span>') + '<a href="' + esc(x.url) + '"><b>' + esc(x.title) + "</b><span>" + esc(x.page || "") + "</span></a>" +
          '<button type="button" data-rm="' + esc(x.url) + '" title="Убрать из избранного">Убрать</button></div>';
      }).join("") + "</div></div>";
    }).join("");
  }
  box.addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) { LAFav.remove(b.dataset.rm); draw(); } });
  LAFav.onchange(draw);
  draw();
})();

/* «Приключение»: таблица этапов и дохода в простое из data/adventure.json (таблицы игры). */
(function () {
  "use strict";
  var T = window.T || function (s) { return s; };  // перевод подписей на английской странице (assets/i18n.js)
  var box = document.getElementById("advTable"), inc = document.getElementById("advIncome");
  if (!box) return;
  var ICON = { "Зерно": "food.png", "Древесина": "wood.png", "Трава": "herb.png", "Противоядие": "antidote.png",
    "Grain": "food.png", "Timber": "wood.png", "Herb": "herb.png", "Antitoxin": "antidote.png" };  // английские данные (data/adventure.en.json)
  function full(n) { return (Number(n) || 0).toLocaleString(window.LA_LANG === "en" ? "en-US" : "ru-RU"); }
  function res(list) { return list.map(function (r) { return '<span class="adv-r">' + (ICON[r[0]] ? '<img src="assets/game/' + ICON[r[0]] + '" alt="" title="' + r[0] + '">' : r[0] + " ") + full(r[1]) + "</span>"; }).join(""); }
  fetch(window.LA_LANG === "en" ? "data/adventure.en.json" : "data/adventure.json").then(function (r) { return r.json(); }).then(function (D) {
    var S = D.stages, size = 50, page = 0, pages = Math.ceil(S.length / size);
    function draw() {
      var part = S.slice(page * size, page * size + size);
      var btns = ""; for (var i = 0; i < pages; i++) btns += '<button type="button" data-p="' + i + '"' + (i === page ? ' class="on"' : "") + ">" + (i * size + 1) + "–" + Math.min(S.length, i * size + size) + "</button>";
      box.innerHTML = '<div class="adv-pg">' + btns + T('</div><div class="adv-scroll"><table class="adv-t"><thead><tr><th>Этап</th><th>Рекомендуемая мощь</th><th>Отряд врага</th><th>Награда за первое прохождение</th></tr></thead><tbody>') +
        part.map(function (s) {
          return "<tr><td><b>" + s.n + "</b>" + (s.chest.length ? T(' <span class="adv-chest" title="Сундук этапа: ') + s.chest.map(function (c) { return c[0] + " ×" + c[1]; }).join(", ") + '">◆</span>' : "") + "</td><td>" + full(s.power) + T("</td><td>Заражённые ") + s.troop + " ×" + s.count + "</td><td>" + res(s.reward) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    box.addEventListener("click", function (e) { var b = e.target.closest("[data-p]"); if (b) { page = +b.dataset.p; draw(); } });
    draw();
    if (inc) {
      var rows = D.income.filter(function (x) { return x.lv === 1 || x.lv % 50 === 0; });
      inc.innerHTML = T('<div class="adv-scroll"><table class="adv-t"><thead><tr><th>Уровень дохода</th><th>Каждые 5 минут</th></tr></thead><tbody>') +
        rows.map(function (x) { return "<tr><td><b>" + x.lv + "</b></td><td>" + res(x.reward) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    }
  });
})();

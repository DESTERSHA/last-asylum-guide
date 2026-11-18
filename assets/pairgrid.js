/* Сетка в 2 колонки без пустых мест: рядом ставим карточки похожей высоты.
   Левая карточка — по исходному порядку, правая — самая близкая по высоте из оставшихся.
   В одну колонку (телефон) — исходный порядок. Работает для .evgrid (страница «События»). */
(function () {
  "use strict";
  var grids = [].slice.call(document.querySelectorAll(".evgrid"));
  if (!grids.length) return;
  grids.forEach(function (g) { g._orig = [].slice.call(g.children); });
  function arrange() {
    grids.forEach(function (g) {
      g._orig.forEach(function (c) { g.appendChild(c); });  // сперва исходный порядок
      var cols = getComputedStyle(g).gridTemplateColumns.split(" ").length;
      if (cols < 2) return;
      g.style.alignItems = "start";
      var h = new Map(); g._orig.forEach(function (c) { h.set(c, c.offsetHeight); });
      g.style.alignItems = "";
      var left = g._orig.slice(), out = [];
      while (left.length) {
        var a = left.shift(); out.push(a);
        if (!left.length) break;
        var best = 0, bd = Infinity;
        left.forEach(function (c, i) { var d = Math.abs(h.get(c) - h.get(a)) + i * 0.5; if (d < bd) { bd = d; best = i; } });  // при равной высоте — ближайшая по порядку
        out.push(left.splice(best, 1)[0]);
      }
      out.forEach(function (c) { g.appendChild(c); });
    });
  }
  var t;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(arrange, 200); });
  window.addEventListener("load", arrange);
  if (document.readyState !== "loading") setTimeout(arrange, 0); else document.addEventListener("DOMContentLoaded", function () { setTimeout(arrange, 0); });
})();

/* Плотная укладка карточек шагов без пустых мест: каждая следующая карточка встаёт в самую короткую колонку
   (порядок шагов сохраняется — слева направо, сверху вниз). Работает для .steps (кроме вложенных) и .steps.flow. */
(function () {
  "use strict";
  var UNIT = 4, GAP = 14;
  function boxes() {
    return [].slice.call(document.querySelectorAll(".steps")).filter(function (g) {
      return g.children.length >= 2 && !g.closest(".step .body") && !g.classList.contains("noflow") && !g.classList.contains("flow");
    });
  }
  /* широкий снимок — сверху во всю ширину карточки, высокий — сбоку */
  function markWide() {
    document.querySelectorAll(".steps>.step>.shot img").forEach(function (img) {
      var set = function () { if (img.naturalWidth) img.closest(".step").classList.toggle("wide", img.naturalWidth > img.naturalHeight * 1.15); };
      if (img.complete) set(); else img.addEventListener("load", function () { set(); later(); }, { once: true });
    });
  }
  function lay() {
    boxes().forEach(function (g) {
      var k = [].slice.call(g.children);
      k.forEach(function (c) { c.style.gridColumn = ""; c.style.gridRow = ""; });
      g.classList.remove("mason");
      var cols = g.classList.contains("flow") ? (innerWidth > 1100 ? 4 : innerWidth > 700 ? 2 : 1) : getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length;
      if (g.classList.contains("flow")) g.style.setProperty("--mcols", cols);
      if (cols < 2) return;
      g.classList.add("mason");
      g.style.setProperty("--mcols", cols);
      var hs = []; for (var i = 0; i < cols; i++) hs.push(0);
      k.forEach(function (c) {
        var col = hs.indexOf(Math.min.apply(null, hs));
        c.style.gridColumn = String(col + 1);
        c.style.gridRow = "1";
        var span = Math.ceil((c.getBoundingClientRect().height + GAP) / UNIT);
        c.style.gridRow = (hs[col] + 1) + " / span " + span;
        hs[col] += span;
      });
    });
  }
  var t;
  function later() { clearTimeout(t); t = setTimeout(lay, 120); }
  markWide();
  window.addEventListener("load", function () { markWide(); lay(); });
  window.addEventListener("resize", later);
  document.addEventListener("click", function (e) { if (e.target.closest(".tabbar")) setTimeout(lay, 60); });
  if (document.readyState !== "loading") setTimeout(lay, 0); else document.addEventListener("DOMContentLoaded", function () { setTimeout(lay, 0); });
})();

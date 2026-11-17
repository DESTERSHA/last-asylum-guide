/* Герои в 3D: модели из файлов игры (assets/hero3d/<герой>.glb), поза покоя, оружие в руках. */
(function () {
  "use strict";
  var HEROES = [
    ["arthur", "Артур"], ["annie", "Анни"], ["bell", "Белл"], ["bella", "Белла"], ["bestar", "Бестар"], ["billy", "Билли"],
    ["greenwald", "Гренвальд"], ["griffith", "Гриффит"], ["daskal", "Даскал"], ["jester", "Джокер"], ["durant", "Дюран"],
    ["zoya", "Зоя"], ["kafa", "Кафа"], ["kesso", "Кессо"], ["claire", "Клэр"], ["red-lady", "Красная Леди"], ["louis", "Луи"],
    ["lucius", "Люциус"], ["marlena", "Марлена"], ["nicole", "Николь"], ["robin", "Робин"], ["celia", "Селия"],
    ["cynthia", "Синтия"], ["sivir", "Сивир"], ["stellar", "Стеллар"], ["william", "Уильям"], ["ulfrid", "Ульфрид"],
    ["harper", "Харпер"], ["hastar", "Хастар"], ["shadow", "Шэдоу"], ["ash", "Эш"]
  ];
  var box = document.getElementById("h3d");
  if (!box) return;
  var mv = box.querySelector("model-viewer"), title = box.querySelector(".h3d-name"), grid = box.querySelector(".h3d-grid");
  var names = {};
  HEROES.forEach(function (h) { names[h[0]] = h[1]; });
  grid.innerHTML = HEROES.map(function (h) {
    return '<button type="button" data-h="' + h[0] + '" title="' + h[1] + '"><img src="assets/game/hero/' + h[0] + '.png" alt="" loading="lazy"><span>' + h[1] + "</span></button>";
  }).join("");
  function show(key, scroll) {
    if (!names[key]) return;
    mv.src = "assets/hero3d/" + key + ".glb";
    mv.cameraOrbit = "0deg 80deg auto";
    title.textContent = names[key];
    [].forEach.call(grid.children, function (b) { b.classList.toggle("on", b.dataset.h === key); });
    if (scroll) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  grid.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) show(b.dataset.h); });
  /* любой портрет героя на странице открывает его 3D */
  document.addEventListener("click", function (e) {
    var img = e.target.closest("img");
    if (!img || box.contains(img)) return;
    var m = (img.getAttribute("src") || "").match(/assets\/game\/hero\/([a-z-]+?)(?:-jx|-ur)?\.png$/);
    if (m && names[m[1]]) { e.preventDefault(); show(m[1], true); }
  });
  document.querySelectorAll('img[src*="assets/game/hero/"]').forEach(function (img) {
    var m = (img.getAttribute("src") || "").match(/hero\/([a-z-]+?)(?:-jx|-ur)?\.png$/);
    if (m && names[m[1]] && !box.contains(img)) { img.style.cursor = "pointer"; img.title = img.title || "Открыть в 3D"; }
  });
  show("arthur");
})();

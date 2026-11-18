/* Просмотрщик 3D-моделей игры с кнопками анимаций. Используется на «Героях» и на «Моделях».
   Разметка: <div class="m3d" data-list="<имя списка>"> … </div>; списки — window.M3D_LISTS[имя] = [[файл, подпись, картинка], …] */
(function () {
  "use strict";
  var ANIM = [
    [/^(stand|idle|stand_?\d*)$/i, "Покой"], [/^idle\d+$/i, "Покой"], [/attack/i, "Атака"], [/skill/i, "Навык"], [/^(story\d*_)?walk/i, "Ходьба"],
    [/^run/i, "Бег"], [/stun/i, "Оглушение"], [/^die|death|dead/i, "Смерть"], [/killer|kill/i, "Добивание"], [/born|appear|show/i, "Появление"],
    [/hit|hurt/i, "Удар по нему"], [/wave/i, "Машет"], [/^sit/i, "Сидит"], [/^lie/i, "Лежит"], [/transport/i, "Несёт"], [/^act/i, "Действие"],
    [/fly/i, "Полёт"], [/victory|win/i, "Победа"], [/^(cast|spell)/i, "Колдует"]
  ];
  var ORDER = ["Покой", "Атака", "Навык", "Добивание", "Ходьба", "Бег", "Оглушение", "Смерть", "Появление"];
  function label(n) {
    for (var i = 0; i < ANIM.length; i++) if (ANIM[i][0].test(n)) return ANIM[i][1];
    return "Движение";
  }
  function setup(box) {
    if (box.dataset.ready) return;
    box.dataset.ready = "1";
    var list = (window.M3D_LISTS || {})[box.dataset.list] || [];
    if (!list.length) return;
    box.innerHTML = '<div class="m3d-stage"><model-viewer camera-controls autoplay shadow-intensity="1" exposure="1.1" interaction-prompt="none" camera-orbit="0deg 80deg auto" min-camera-orbit="auto 15deg auto" max-camera-orbit="auto 100deg auto"></model-viewer>' +
      '<div class="m3d-name"></div><div class="m3d-hint"><span>↻</span> Крути мышкой или пальцем · колёсико — приблизить</div><div class="m3d-anims"></div><div class="m3d-load">Загружаю модель…</div></div><div class="m3d-grid"></div>';
    var mv = box.querySelector("model-viewer"), hint = box.querySelector(".m3d-hint");
    mv.addEventListener("pointerdown", function () { if (hint) hint.classList.add("off"); }, { once: true });
    var _x = 0, nameEl = box.querySelector(".m3d-name"), animsEl = box.querySelector(".m3d-anims"), grid = box.querySelector(".m3d-grid"), load = box.querySelector(".m3d-load");
    grid.innerHTML = list.map(function (m, i) {
      return '<button type="button" data-i="' + i + '" title="' + m[1] + '">' + (m[2] ? '<img src="' + m[2] + '" alt="" loading="lazy">' : '<span class="ph"></span>') + "<span>" + m[1] + "</span></button>";
    }).join("");
    var cur = -1;
    function show(i, scroll) {
      if (i === cur || !list[i]) { if (scroll) box.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      cur = i;
      load.style.display = "block";
      animsEl.innerHTML = "";
      mv.src = list[i][0];
      mv.cameraOrbit = "0deg 80deg auto";
      nameEl.textContent = list[i][1];
      [].forEach.call(grid.children, function (b) { b.classList.toggle("on", Number(b.dataset.i) === i); });
      if (scroll) box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    mv.addEventListener("load", function () {
      load.style.display = "none";
      var names = mv.availableAnimations || [];
      if (!names.length) { animsEl.innerHTML = ""; return; }
      var seen = {}, items = [];
      names.forEach(function (n) {
        var l = label(n), k = l, c = 2;
        while (seen[k]) k = l + " " + c++;
        seen[k] = 1;
        items.push([n, k, l]);
      });
      items.sort(function (a, b) {
        var ia = ORDER.indexOf(a[2]), ib = ORDER.indexOf(b[2]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[1].localeCompare(b[1], "ru", { numeric: true });
      });
      animsEl.innerHTML = items.map(function (it) { return '<button type="button" data-a="' + it[0] + '">' + it[1] + "</button>"; }).join("");
      var first = items.filter(function (it) { return it[2] === "Покой"; })[0] || items[0];
      play(first[0]);
    });
    function play(n) {
      mv.animationName = n;
      mv.play({ repetitions: Infinity });
      [].forEach.call(animsEl.children, function (b) { b.classList.toggle("on", b.dataset.a === n); });
    }
    animsEl.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) play(b.dataset.a); });
    grid.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) show(Number(b.dataset.i)); });
    box.m3dShow = function (file, scroll) { for (var i = 0; i < list.length; i++) if (list[i][0] === file) return show(i, scroll); };
    show(0);
  }
  /* запускаем просмотрщик, когда до него долистали — страница не грузит все модели сразу */
  var boxes = document.querySelectorAll(".m3d");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); setup(e.target); } }); }, { rootMargin: "300px" });
    boxes.forEach(function (b) { io.observe(b); });
  } else boxes.forEach(setup);
  /* «Герои»: любой портрет героя на странице открывает его 3D */
  var hb = document.querySelector('.m3d[data-list="heroes"]');
  if (hb) {
    document.addEventListener("click", function (e) {
      var img = e.target.closest("img");
      if (!img || hb.contains(img)) return;
      var m = (img.getAttribute("src") || "").match(/assets\/game\/hero\/([a-z-]+?)(?:-jx|-ur)?\.png$/);
      if (!m) return;
      e.preventDefault();
      if (!hb.m3dShow) setup(hb);
      if (hb.m3dShow) hb.m3dShow("assets/hero3d/" + m[1] + ".glb", true);
    });
    document.querySelectorAll('img[src*="assets/game/hero/"]').forEach(function (img) { if (!hb.contains(img)) { img.style.cursor = "pointer"; img.title = img.title || "Открыть в 3D"; } });
  }
})();

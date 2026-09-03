/* ==========================================================
   現在表示中のセクションをメニューに反映（スクロールスパイ）
   IntersectionObserver が無い環境では何もしない
   ========================================================== */

(function spy() {
  var links = Array.prototype.slice.call(document.querySelectorAll('nav a[href^="#"]'));
  if (!links.length || !('IntersectionObserver' in window)) return;

  var map = {};
  links.forEach(function (a) {
    var el = document.getElementById(a.getAttribute('href').slice(1));
    if (el) map[el.id] = a;
  });

  var visible = {};
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });

    var current = null;
    Object.keys(map).forEach(function (id) { if (visible[id] && !current) current = id; });

    links.forEach(function (a) { a.classList.remove('is-active'); });
    if (current && map[current]) map[current].classList.add('is-active');
  }, { rootMargin: '-76px 0px -55% 0px', threshold: 0 });

  Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
})();

/* ==========================================================
   手応えの演出

   - 所持金は数字が回って増え、増えた分が浮いて消える
   - 戦利品・改造を取ったら、真ん中に札を出して紙吹雪で祝う
   - 賞金首・ボスを倒したとき、走行をクリアしたときも紙吹雪
   見せるだけで、数値には触らない。動きを減らす設定（html.no-motion）では紙吹雪を出さない。

   FX.gold(el, value)                 所持金の表示を value へ回す
   FX.got(canvas, head, name, note)   手に入れた物の札
   FX.confetti(power)                 紙吹雪（1 が普通、2 が派手）
   ========================================================== */
window.FX = (function () {
  'use strict';

  function noMotion() { return document.documentElement.classList.contains('no-motion'); }

  /* ---------------------------------------------------------- 所持金 */
  var goldNow = null, goldGoal = 0, goldEl = null, goldRaf = 0;
  function gold(el, value) {
    goldEl = el;
    if (goldNow == null || noMotion()) { goldNow = goldGoal = value; el.textContent = value + ' G'; return; }
    if (value === goldGoal) return;
    var diff = value - goldGoal;
    goldGoal = value;
    floatText(el, (diff > 0 ? '+' : '−') + Math.abs(diff) + ' G', diff > 0 ? 'is-up' : 'is-down');
    el.classList.remove('is-up', 'is-down'); void el.offsetWidth;
    el.classList.add(diff > 0 ? 'is-up' : 'is-down');
    if (!goldRaf) goldRaf = requestAnimationFrame(goldStep);
    /* 画面を描けない環境でも最後は正しい数字にする */
    clearTimeout(gold.t);
    gold.t = setTimeout(function () { goldNow = goldGoal; el.textContent = goldGoal + ' G'; }, 900);
  }
  function goldStep() {
    goldRaf = 0;
    var d = goldGoal - goldNow;
    if (Math.abs(d) < 1) goldNow = goldGoal;
    else goldNow += d * .18 + (d > 0 ? .6 : -.6);
    goldEl.textContent = Math.round(goldNow) + ' G';
    if (goldNow !== goldGoal) goldRaf = requestAnimationFrame(goldStep);
  }
  function floatText(el, text, cls) {
    var r = el.getBoundingClientRect();
    var f = document.createElement('span');
    f.className = 'fx-float ' + cls;
    f.textContent = text;
    f.style.left = (r.left + r.width / 2) + 'px';
    f.style.top = (r.bottom + 2) + 'px';
    document.body.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1200);
  }

  /* ---------------------------------------------------------- 手に入れた札 */
  var card = null, cardT = 0;
  function got(sprite, head, name, note) {
    if (!card) {
      card = document.createElement('div');
      card.className = 'fx-got';
      card.innerHTML = '<div class="fx-got-card"><em></em><canvas></canvas><b></b><span></span></div>';
      card.addEventListener('click', closeGot);
      document.body.appendChild(card);
    }
    card.querySelector('em').textContent = head;
    card.querySelector('b').textContent = name;
    card.querySelector('span').textContent = note || '';
    var c = card.querySelector('canvas');
    if (sprite) {
      var k = Math.max(1, Math.floor(96 / Math.max(sprite.width, sprite.height)));
      c.width = sprite.width * k; c.height = sprite.height * k;
      var x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(sprite, 0, 0, c.width, c.height);
      c.hidden = false;
    } else c.hidden = true;
    card.hidden = false;
    card.classList.remove('is-in'); void card.offsetWidth;
    card.classList.add('is-in');
    confetti(1);
    clearTimeout(cardT);
    cardT = setTimeout(closeGot, 1700);
  }
  function closeGot() { if (card) card.hidden = true; }

  /* ---------------------------------------------------------- 紙吹雪 */
  var cv = null, bits = [], raf = 0, last = 0;
  function confetti(power) {
    if (noMotion()) return;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'fx-confetti';
      document.body.appendChild(cv);
    }
    var W = window.innerWidth, H = window.innerHeight;
    var cols = ['#e8b355', '#ff5a3c', '#4fd393', '#3d8be0', '#f2f5f7', '#ffd23c'];
    var n = Math.round(60 * (power || 1));
    function add(x, y, a0, spread, cnt, sp) {
      for (var i = 0; i < cnt; i++) {
        var a = a0 + (Math.random() - .5) * spread, v = sp * (.55 + Math.random() * .6);
        bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.3, vr: (Math.random() - .5) * 14,
          f: Math.random() * 6.3, vf: 6 + Math.random() * 10, w: 5 + Math.random() * 4, h: 7 + Math.random() * 6,
          col: cols[(Math.random() * cols.length) | 0], t: 0, life: 2.4 + Math.random() }); }
    }
    add(W / 2, H * .45, -Math.PI / 2, Math.PI * 1.2, n, 900);
    if (power >= 2) { add(-10, H * .95, -Math.PI / 3, .5, n * .6, 1300); add(W + 10, H * .95, -Math.PI * 2 / 3, .5, n * .6, 1300); }
    if (bits.length > 500) bits.splice(0, bits.length - 500);
    if (!raf) { last = 0; raf = requestAnimationFrame(step); }
  }
  function step(now) {
    raf = 0;
    if (!last) last = now;
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    var W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    bits = bits.filter(function (p) {
      p.t += dt;
      p.vy += 1500 * dt; p.vx *= Math.pow(.35, dt); p.vy *= Math.pow(.5, dt); p.vy = Math.min(p.vy, 260);
      p.vx += Math.sin(p.f) * 30 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.f += p.vf * dt;
      var a = Math.min(1, (p.life - p.t) / .5);
      if (a <= 0 || p.y > H + 30) return false;
      g.save(); g.globalAlpha = a; g.translate(p.x, p.y); g.rotate(p.r);
      g.scale(1, Math.cos(p.f)); g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
      return true;
    });
    if (bits.length) raf = requestAnimationFrame(step);
    else g.clearRect(0, 0, W, H);
  }

  return { gold: gold, got: got, confetti: confetti };
})();

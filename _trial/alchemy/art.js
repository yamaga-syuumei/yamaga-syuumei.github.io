// 品物と設備の絵。画像は持たず canvas で描く。
// 色だけで見分けさせないので、品目はすべて「形」か「中の印」が違う。
// 同じ形を使うのは仲間どうし（魔力・アニマ・クリスタル）だけで、そこは印で分ける。
(function (global) {
  'use strict';

  const ITEMS = window.ALCHEMY.ITEMS;
  const INK = '#2a2136';                 // 明るい盤面の上で輪郭に使う色

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function poly(c, pts, close) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    if (close !== false) c.closePath();
  }
  const fill = (c, pts) => { poly(c, pts); c.fill(); };
  const line = (c, pts) => { poly(c, pts, false); c.stroke(); };
  const disc = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  const ring = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); };

  function star(c, n, ro, ri, rot) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2 + (rot || 0);
      const r = i % 2 ? ri : ro;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    fill(c, pts);
  }

  // ---------------------------------------------------------------- 中の印
  // 魔力・アニマ・クリスタルの仲間を見分けるための小さな図形。
  const MARKS = {
    fire:   (c, r) => fill(c, [[0, -r], [r * .6, r * .3], [r * .25, r * .8], [-r * .25, r * .8], [-r * .6, r * .3]]),
    water:  (c, r) => { c.beginPath(); c.moveTo(0, -r);
      c.bezierCurveTo(r * .8, -r * .1, r * .7, r * .8, 0, r * .8);
      c.bezierCurveTo(-r * .7, r * .8, -r * .8, -r * .1, 0, -r); c.fill(); },
    earth:  (c, r) => fill(c, [[-r, r * .55], [-r * .3, -r * .5], [r * .15, r * .05], [r * .6, -r * .75], [r, r * .55]]),
    wind:   (c, r) => { c.lineWidth = Math.max(1, r * .3); c.lineCap = 'round';
      line(c, [[-r, -r * .45], [r * .35, -r * .45]]);
      line(c, [[-r, r * .05], [r * .8, r * .05]]);
      line(c, [[-r, r * .55], [r * .2, r * .55]]); },
    light:  (c, r) => star(c, 4, r, r * .28),
    dark:   (c, r) => { c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(r * .45, -r * .35, r * .82, 0, 7); c.fill();
      c.globalCompositeOperation = 'source-over'; },
    ore:    (c, r) => fill(c, [[-r, r * .4], [-r * .4, -r * .8], [r * .5, -r * .6], [r, r * .3], [r * .2, r * .8]]),
    plant:  (c, r) => { c.lineWidth = Math.max(1, r * .26); c.lineCap = 'round';
      line(c, [[0, r], [0, -r * .3]]);
      c.beginPath(); c.ellipse(-r * .45, -r * .35, r * .48, r * .26, -0.7, 0, 7); c.fill();
      c.beginPath(); c.ellipse(r * .45, -r * .35, r * .48, r * .26, 0.7, 0, 7); c.fill(); },
    gem:    (c, r) => fill(c, [[0, -r], [r * .85, -r * .2], [r * .5, r * .85], [-r * .5, r * .85], [-r * .85, -r * .2]]),
    life:   (c, r) => { c.beginPath(); c.moveTo(0, r * .9);
      c.bezierCurveTo(-r * 1.3, -r * .1, -r * .5, -r, 0, -r * .35);
      c.bezierCurveTo(r * .5, -r, r * 1.3, -r * .1, 0, r * .9); c.fill(); },
    energy: (c, r) => fill(c, [[r * .2, -r], [-r * .7, r * .15], [-r * .05, r * .15], [-r * .25, r], [r * .7, -r * .2], [0, -r * .2]]),
  };

  function mark(c, key, r, color) {
    const f = MARKS[key];
    if (!f) return;
    c.save();
    c.fillStyle = color || INK;
    c.strokeStyle = color || INK;
    f(c, r);
    c.restore();
  }

  // ---------------------------------------------------------------- 品物の形
  // r は「半径」。だいたい 2r 四方に収まる。
  const SHAPES = {
    // ---- 原料
    oregem: (c, r) => {
      fill(c, [[-r, r * .3], [-r * .55, -r * .75], [r * .3, -r], [r, -r * .05], [r * .55, r * .9], [-r * .45, r]]);
      c.save(); c.globalAlpha = .5; c.fillStyle = '#fff';
      fill(c, [[-r * .5, -r * .1], [-r * .2, -r * .7], [r * .15, -r * .3], [-r * .1, r * .2]]);
      c.restore();
    },
    herb: (c, r) => {
      c.lineWidth = Math.max(1.2, r * .22); c.lineCap = 'round';
      line(c, [[0, r], [0, -r * .2]]);
      [[-1, -.2], [1, -.45], [-1, -.75]].forEach(([s, y]) => {
        c.beginPath(); c.ellipse(s * r * .5, y * r, r * .55, r * .26, s * 0.6, 0, 7); c.fill();
      });
    },
    pearl: (c, r) => {
      disc(c, 0, 0, r * .9);
      c.save(); c.globalAlpha = .75; c.fillStyle = '#fff';
      disc(c, -r * .3, -r * .32, r * .26); c.restore();
      c.save(); c.globalAlpha = .35; c.strokeStyle = INK; c.lineWidth = r * .1;
      ring(c, 0, 0, r * .55); c.restore();
    },
    slough: (c, r) => {
      c.lineWidth = Math.max(1.4, r * .34); c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-r, r * .7);
      c.bezierCurveTo(r * .6, r * .6, -r * .6, -r * .3, r * .9, -r * .75);
      c.stroke();
      c.save(); c.globalAlpha = .45; c.fillStyle = '#fff';
      disc(c, r * .82, -r * .72, r * .2); c.restore();
    },
    volcano: (c, r) => {
      fill(c, [[-r, r * .85], [-r * .35, -r * .35], [r * .35, -r * .35], [r, r * .85]]);
      c.save(); c.globalAlpha = .85; c.fillStyle = '#ffd36a';
      fill(c, [[-r * .3, -r * .3], [0, -r], [r * .3, -r * .3]]);
      c.restore();
    },

    // ---- 一次
    rune: (c, r, it) => {
      c.save();
      c.globalAlpha = .28; disc(c, 0, 0, r); c.restore();
      c.save(); c.strokeStyle = it.color; c.lineWidth = Math.max(1.2, r * .16);
      ring(c, 0, 0, r * .95); c.restore();
      mark(c, it.mark, r * .55, INK);
    },
    anima: (c, r, it) => {
      c.beginPath();
      c.moveTo(0, -r);
      c.bezierCurveTo(r * .95, -r * .45, r * .7, r * .85, 0, r);
      c.bezierCurveTo(-r * .7, r * .85, -r * .95, -r * .45, 0, -r);
      c.fill();
      mark(c, it.mark, r * .42, 'rgba(255,255,255,.9)');
    },
    magicstone: (c, r) => {
      fill(c, [[0, -r], [r * .8, -r * .35], [r * .55, r * .85], [-r * .55, r * .85], [-r * .8, -r * .35]]);
      c.save(); c.globalAlpha = .5; c.fillStyle = '#fff';
      fill(c, [[0, -r * .8], [r * .45, -r * .25], [0, r * .1], [-r * .45, -r * .25]]);
      c.restore();
    },

    // ---- 二次
    ring: (c, r) => {
      c.lineWidth = Math.max(1.6, r * .3);
      ring(c, 0, r * .2, r * .68);
      c.save(); c.fillStyle = '#eafaff';
      fill(c, [[0, -r], [r * .3, -r * .6], [0, -r * .28], [-r * .3, -r * .6]]);
      c.restore();
    },
    lifecrystal: (c, r) => {
      fill(c, [[0, -r], [r * .62, 0], [0, r], [-r * .62, 0]]);
      c.save(); c.globalAlpha = .55; c.fillStyle = '#fff';
      fill(c, [[0, -r], [r * .62, 0], [0, 0]]); c.restore();
    },
    shield: (c, r) => {
      c.beginPath();
      c.moveTo(-r * .85, -r * .8); c.lineTo(r * .85, -r * .8);
      c.lineTo(r * .85, r * .15); c.quadraticCurveTo(r * .85, r * .8, 0, r);
      c.quadraticCurveTo(-r * .85, r * .8, -r * .85, r * .15);
      c.closePath(); c.fill();
      c.save(); c.globalAlpha = .45; c.strokeStyle = INK; c.lineWidth = r * .18;
      line(c, [[0, -r * .6], [0, r * .6]]); c.restore();
    },
    potion: (c, r) => {
      c.lineWidth = Math.max(1.3, r * .18);
      c.beginPath();
      c.moveTo(-r * .26, -r); c.lineTo(r * .26, -r); c.lineTo(r * .26, -r * .45);
      c.quadraticCurveTo(r * .78, -r * .1, r * .78, r * .45);
      c.quadraticCurveTo(r * .78, r, 0, r); c.quadraticCurveTo(-r * .78, r, -r * .78, r * .45);
      c.quadraticCurveTo(-r * .78, -r * .1, -r * .26, -r * .45);
      c.closePath(); c.stroke();
      c.save(); c.clip(); c.globalAlpha = .85; c.fillRect(-r, r * .05, r * 2, r); c.restore();
    },
    cloak: (c, r) => {
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r * .95, r * .35); c.lineTo(r * .55, r);
      c.quadraticCurveTo(0, r * .5, -r * .55, r); c.lineTo(-r * .95, r * .35);
      c.closePath(); c.fill();
      c.save(); c.globalAlpha = .5; c.fillStyle = '#fff';
      disc(c, 0, -r * .85, r * .22); c.restore();
    },
    firesword: (c, r) => {
      c.lineWidth = Math.max(1.4, r * .26); c.lineCap = 'round';
      line(c, [[-r * .6, r * .75], [r * .75, -r * .7]]);
      c.save(); c.strokeStyle = INK; c.globalAlpha = .55; c.lineWidth = r * .22;
      line(c, [[-r * .85, r * .15], [-r * .1, r]]); c.restore();
      c.save(); c.globalAlpha = .7; c.fillStyle = '#ffd36a';
      fill(c, [[r * .35, -r * .35], [r * 1, -r * .95], [r * .5, -r * .05]]); c.restore();
    },
    darkorb: (c, r) => {
      disc(c, 0, 0, r * .92);
      c.save(); c.globalCompositeOperation = 'destination-out';
      disc(c, r * .3, -r * .28, r * .55); c.restore();
      c.save(); c.globalAlpha = .8; c.fillStyle = '#fff';
      disc(c, -r * .42, r * .38, r * .13); c.restore();
    },
    lantern: (c, r) => {
      c.lineWidth = Math.max(1.2, r * .16);
      ring(c, 0, -r * .82, r * .22);
      fill(c, [[-r * .55, -r * .5], [r * .55, -r * .5], [r * .72, r * .7], [-r * .72, r * .7]]);
      c.save(); c.globalAlpha = .85; c.fillStyle = '#fffbe0';
      disc(c, 0, r * .05, r * .3); c.restore();
      c.fillRect(-r * .8, r * .7, r * 1.6, r * .25);
    },
    compass: (c, r) => {
      c.lineWidth = Math.max(1.3, r * .18);
      ring(c, 0, 0, r * .88);
      c.save(); c.fillStyle = '#e8506a';
      fill(c, [[0, -r * .7], [r * .24, 0], [0, r * .7], [-r * .24, 0]]); c.restore();
      disc(c, 0, 0, r * .14);
    },
    seed: (c, r) => {
      c.beginPath(); c.ellipse(0, r * .15, r * .55, r * .8, 0, 0, 7); c.fill();
      c.save(); c.strokeStyle = INK; c.globalAlpha = .5; c.lineWidth = r * .16; c.lineCap = 'round';
      line(c, [[0, -r * .6], [0, -r]]);
      c.beginPath(); c.ellipse(r * .35, -r * .8, r * .32, r * .17, 0.5, 0, 7); c.fill();
      c.restore();
    },
    bean: (c, r) => {
      [[-.35, .25], [.35, -.1]].forEach(([x, y]) => {
        c.save(); c.translate(x * r, y * r); c.rotate(0.5);
        c.beginPath(); c.ellipse(0, 0, r * .55, r * .38, 0, 0, 7); c.fill(); c.restore();
      });
    },
    glass: (c, r) => {
      c.lineWidth = Math.max(1.2, r * .16);
      roundRect(c, -r * .8, -r * .8, r * 1.6, r * 1.6, r * .16); c.stroke();
      c.save(); c.globalAlpha = .3; c.fill(); c.restore();
      c.save(); c.globalAlpha = .7; c.strokeStyle = '#fff'; c.lineWidth = r * .18;
      line(c, [[-r * .45, r * .5], [r * .45, -r * .5]]); c.restore();
    },
    cloth: (c, r) => {
      c.beginPath();
      c.moveTo(-r, -r * .6); c.quadraticCurveTo(-r * .3, -r * .95, 0, -r * .6);
      c.quadraticCurveTo(r * .3, -r * .25, r, -r * .6);
      c.lineTo(r, r * .6); c.quadraticCurveTo(r * .3, r * .95, 0, r * .6);
      c.quadraticCurveTo(-r * .3, r * .25, -r, r * .6);
      c.closePath(); c.fill();
    },
    bomb: (c, r) => {
      disc(c, 0, r * .2, r * .72);
      c.save(); c.strokeStyle = INK; c.lineWidth = r * .16; c.lineCap = 'round';
      c.beginPath(); c.moveTo(r * .3, -r * .4);
      c.quadraticCurveTo(r * .9, -r * .8, r * .6, -r); c.stroke(); c.restore();
      c.save(); c.fillStyle = '#ffd36a'; star(c, 5, r * .3, r * .12); c.restore();
    },
    phantomglass: (c, r) => {
      c.save(); c.globalAlpha = .45;
      fill(c, [[0, -r], [r * .85, -r * .3], [r * .55, r * .9], [-r * .55, r * .9], [-r * .85, -r * .3]]);
      c.restore();
      c.lineWidth = Math.max(1.2, r * .14);
      poly(c, [[0, -r], [r * .85, -r * .3], [r * .55, r * .9], [-r * .55, r * .9], [-r * .85, -r * .3]]);
      c.stroke();
      c.save(); c.globalAlpha = .8; c.strokeStyle = '#fff'; c.lineWidth = r * .12;
      line(c, [[-r * .3, r * .6], [r * .25, -r * .6]]); c.restore();
    },

    // ---- 三次
    armor: (c, r) => {
      fill(c, [[-r * .75, -r * .7], [r * .75, -r * .7], [r * .9, r * .1], [r * .45, r], [-r * .45, r], [-r * .9, r * .1]]);
      c.save(); c.globalAlpha = .5; c.strokeStyle = INK; c.lineWidth = r * .16;
      line(c, [[0, -r * .5], [0, r * .8]]);
      line(c, [[-r * .7, -r * .2], [r * .7, -r * .2]]); c.restore();
    },
    holysword: (c, r) => {
      c.lineWidth = Math.max(1.5, r * .26); c.lineCap = 'round';
      line(c, [[0, r * .95], [0, -r]]);
      c.save(); c.strokeStyle = INK; c.globalAlpha = .6; c.lineWidth = r * .2;
      line(c, [[-r * .6, r * .4], [r * .6, r * .4]]); c.restore();
      c.save(); c.globalAlpha = .9; c.fillStyle = '#fffbe0'; star(c, 4, r * .42, r * .12, 0); c.restore();
    },
    tent: (c, r) => {
      fill(c, [[0, -r], [r, r * .8], [-r, r * .8]]);
      c.save(); c.fillStyle = '#3a2f22'; c.globalAlpha = .7;
      fill(c, [[0, -r * .1], [r * .38, r * .8], [-r * .38, r * .8]]); c.restore();
    },
    swirl: (c, r) => {
      c.lineWidth = Math.max(1.3, r * .2); c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * Math.PI * 3.4, rr = r * (0.12 + i / 40 * 0.88);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    },
    soil: (c, r) => {
      c.beginPath(); c.ellipse(0, r * .35, r, r * .5, 0, 0, 7); c.fill();
      c.save(); c.globalAlpha = .8; c.fillStyle = '#fff6c8';
      [[-.45, -.35], [.2, -.6], [.55, -.2]].forEach(([x, y]) => disc(c, x * r, y * r, r * .17));
      c.restore();
    },
    worldseed: (c, r) => {
      c.beginPath(); c.ellipse(0, r * .2, r * .62, r * .78, 0, 0, 7); c.fill();
      c.save(); c.strokeStyle = INK; c.globalAlpha = .55; c.lineWidth = r * .14; c.lineCap = 'round';
      line(c, [[0, -r * .5], [0, -r]]);
      line(c, [[0, -r * .8], [r * .45, -r]]);
      line(c, [[0, -r * .8], [-r * .45, -r]]); c.restore();
    },
    machine: (c, r) => {
      roundRect(c, -r * .85, -r * .6, r * 1.7, r * 1.2, r * .18); c.fill();
      c.save(); c.globalAlpha = .55; c.fillStyle = INK;
      disc(c, -r * .35, 0, r * .24); disc(c, r * .35, 0, r * .24); c.restore();
      c.fillRect(-r * .12, -r, r * .24, r * .42);
    },
    hollow: (c, r) => {
      fill(c, [[-r, r * .9], [-r * .8, -r * .3], [0, -r], [r * .8, -r * .3], [r, r * .9]]);
      c.save(); c.fillStyle = '#2a2136';
      c.beginPath(); c.moveTo(-r * .35, r * .9);
      c.quadraticCurveTo(-r * .35, r * .05, 0, r * .05);
      c.quadraticCurveTo(r * .35, r * .05, r * .35, r * .9);
      c.closePath(); c.fill(); c.restore();
    },
    katana: (c, r) => {
      c.lineWidth = Math.max(1.5, r * .22); c.lineCap = 'round';
      c.beginPath(); c.moveTo(-r * .8, r * .8);
      c.quadraticCurveTo(r * .1, r * .1, r * .95, -r * .85); c.stroke();
      c.save(); c.strokeStyle = INK; c.lineWidth = r * .2;
      line(c, [[-r * .95, r * .55], [-r * .45, r]]); c.restore();
    },
    whipsword: (c, r) => {
      c.save(); c.lineCap = 'butt'; c.lineWidth = Math.max(1.4, r * .24);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const x = -r * .85 + t * r * 1.7, y = r * .8 - t * r * 1.6;
        line(c, [[x, y], [x + r * .22, y - r * .2]]);
      }
      c.restore();
      c.save(); c.strokeStyle = INK; c.lineWidth = r * .18;
      line(c, [[-r, r * .55], [-r * .5, r]]); c.restore();
    },
    homunculus: (c, r) => {
      c.lineWidth = Math.max(1.2, r * .14);
      c.beginPath();
      c.moveTo(-r * .2, -r); c.lineTo(r * .2, -r); c.lineTo(r * .2, -r * .55);
      c.quadraticCurveTo(r * .85, -r * .1, r * .85, r * .45);
      c.quadraticCurveTo(r * .85, r, 0, r); c.quadraticCurveTo(-r * .85, r, -r * .85, r * .45);
      c.quadraticCurveTo(-r * .85, -r * .1, -r * .2, -r * .55);
      c.closePath(); c.stroke();
      c.save(); c.globalAlpha = .75;
      disc(c, 0, r * .35, r * .3);
      c.fillStyle = INK; c.globalAlpha = .5;
      disc(c, -r * .12, r * .28, r * .07); disc(c, r * .12, r * .28, r * .07);
      c.restore();
    },
    crystal: (c, r, it) => {
      fill(c, [[0, -r], [r * .68, -r * .25], [r * .45, r * .9], [-r * .45, r * .9], [-r * .68, -r * .25]]);
      c.save(); c.globalAlpha = .45; c.fillStyle = '#fff';
      fill(c, [[0, -r], [r * .68, -r * .25], [0, -r * .05]]); c.restore();
      if (it && it.mark) mark(c, it.mark, r * .34, 'rgba(32,24,44,.75)');
    },
    fairy: (c, r) => {
      c.save(); c.globalAlpha = .5;
      c.beginPath(); c.ellipse(-r * .5, -r * .3, r * .5, r * .3, -0.6, 0, 7); c.fill();
      c.beginPath(); c.ellipse(r * .5, -r * .3, r * .5, r * .3, 0.6, 0, 7); c.fill();
      c.restore();
      disc(c, 0, r * .1, r * .3);
      c.save(); c.globalAlpha = .85; c.fillStyle = '#fffbe0';
      star(c, 4, r * .22, r * .06, 0); c.restore();
    },
    warrior: (c, r) => {
      fill(c, [[-r * .6, -r * .55], [r * .6, -r * .55], [r * .75, r], [-r * .75, r]]);
      c.save(); c.fillStyle = INK; c.globalAlpha = .6;
      c.fillRect(-r * .4, -r * .35, r * .8, r * .16); c.restore();
      fill(c, [[-r * .55, -r * .55], [0, -r], [r * .55, -r * .55]]);
    },
    beanstalk: (c, r) => {
      c.lineWidth = Math.max(1.4, r * .2); c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, r);
      c.bezierCurveTo(-r * .7, r * .3, r * .7, -r * .3, 0, -r); c.stroke();
      [[-.55, .35], [.55, -.2], [-.5, -.65]].forEach(([x, y]) => {
        c.save(); c.translate(x * r, y * r); c.rotate(x);
        c.beginPath(); c.ellipse(0, 0, r * .4, r * .2, 0, 0, 7); c.fill(); c.restore();
      });
    },
    emblem: (c, r) => {
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r * .9, -r * .55); c.lineTo(r * .9, r * .2);
      c.quadraticCurveTo(r * .9, r * .8, 0, r);
      c.quadraticCurveTo(-r * .9, r * .8, -r * .9, r * .2);
      c.lineTo(-r * .9, -r * .55); c.closePath(); c.fill();
      c.save(); c.fillStyle = '#fff6c8'; c.globalAlpha = .9;
      MARKS.fire(c, r * .45); c.restore();
    },
    guardian: (c, r) => {
      roundRect(c, -r * .8, -r * .45, r * 1.6, r * 1.3, r * .2); c.fill();
      fill(c, [[-r * .5, -r * .45], [-r * .3, -r], [r * .3, -r], [r * .5, -r * .45]]);
      c.save(); c.fillStyle = '#ff6a4a';
      c.fillRect(-r * .55, -r * .12, r * 1.1, r * .18); c.restore();
    },
    magicarmor: (c, r) => {
      fill(c, [[-r * .7, -r * .65], [r * .7, -r * .65], [r * .9, r * .2], [r * .4, r], [-r * .4, r], [-r * .9, r * .2]]);
      c.save(); c.fillStyle = '#c8e8ff'; c.globalAlpha = .9;
      star(c, 6, r * .36, r * .14, 0); c.restore();
    },
    necklace: (c, r) => {
      c.lineWidth = Math.max(1.2, r * .14);
      c.beginPath(); c.arc(0, -r * .15, r * .7, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
      c.save(); c.fillStyle = '#f7e07a';
      fill(c, [[0, r * .95], [r * .3, r * .4], [0, r * .05], [-r * .3, r * .4]]); c.restore();
    },
    egg: (c, r) => {
      c.beginPath(); c.ellipse(0, r * .1, r * .68, r * .88, 0, 0, 7); c.fill();
      c.save(); c.globalAlpha = .7; c.strokeStyle = '#ffd36a'; c.lineWidth = r * .14;
      line(c, [[-r * .5, r * .1], [-r * .15, -r * .15], [r * .15, r * .1], [r * .5, -r * .15]]);
      c.restore();
    },
    eye: (c, r) => {
      c.beginPath();
      c.moveTo(-r, 0); c.quadraticCurveTo(0, -r * .9, r, 0);
      c.quadraticCurveTo(0, r * .9, -r, 0); c.fill();
      c.save(); c.fillStyle = INK; disc(c, 0, 0, r * .3);
      c.fillStyle = '#fff'; disc(c, -r * .1, -r * .1, r * .1); c.restore();
    },
    philosopher: (c, r) => {
      fill(c, [[0, -r], [r * .95, -r * .3], [r * .58, r * .9], [-r * .58, r * .9], [-r * .95, -r * .3]]);
      c.save(); c.globalAlpha = .9; c.fillStyle = '#fff6c8';
      c.lineWidth = r * .1; c.strokeStyle = '#fff6c8';
      ring(c, 0, 0, r * .42);
      fill(c, [[0, -r * .42], [r * .36, r * .21], [-r * .36, r * .21]]);
      c.restore();
    },
    elixir: (c, r) => {
      c.lineWidth = Math.max(1.3, r * .16);
      c.beginPath();
      c.moveTo(-r * .3, -r); c.lineTo(r * .3, -r);
      c.lineTo(r * .18, -r * .35);
      c.quadraticCurveTo(r * .85, 0, r * .85, r * .5);
      c.quadraticCurveTo(r * .85, r, 0, r); c.quadraticCurveTo(-r * .85, r, -r * .85, r * .5);
      c.quadraticCurveTo(-r * .85, 0, -r * .18, -r * .35);
      c.closePath(); c.stroke();
      c.save(); c.clip(); c.globalAlpha = .9; c.fillRect(-r, -r * .2, r * 2, r * 1.3);
      c.fillStyle = '#fff'; c.globalAlpha = .8;
      disc(c, -r * .25, r * .35, r * .1); disc(c, r * .2, r * .6, r * .08); c.restore();
    },
    dragon: (c, r) => {
      fill(c, [[-r * .85, r * .9], [-r * .6, -r * .3], [0, -r], [r * .6, -r * .3], [r * .85, r * .9]]);
      fill(c, [[-r * .6, -r * .3], [-r, -r], [-r * .3, -r * .6]]);
      fill(c, [[r * .6, -r * .3], [r, -r], [r * .3, -r * .6]]);
      c.save(); c.fillStyle = '#ffe08a';
      disc(c, -r * .26, -r * .1, r * .14); disc(c, r * .26, -r * .1, r * .14); c.restore();
    },
    tablet: (c, r) => {
      c.lineWidth = Math.max(1.2, r * .14);
      roundRect(c, -r * .6, -r * .9, r * 1.2, r * 1.8, r * .18);
      c.save(); c.globalAlpha = .35; c.fill(); c.restore();
      c.stroke();
      c.save(); c.globalAlpha = .8; c.lineWidth = r * .12;
      line(c, [[-r * .3, -r * .35], [r * .3, -r * .35]]);
      line(c, [[-r * .3, 0], [r * .3, 0]]);
      line(c, [[-r * .3, r * .35], [r * .1, r * .35]]); c.restore();
    },
    savecircle: (c, r) => {
      c.lineWidth = Math.max(1.2, r * .13);
      ring(c, 0, 0, r * .95);
      ring(c, 0, 0, r * .62);
      c.save(); c.globalAlpha = .9;
      star(c, 5, r * .55, r * .22, 0); c.restore();
    },
    flamesword: (c, r) => {
      c.save(); c.globalAlpha = .55;
      fill(c, [[r * .1, -r], [r * .95, -r * .1], [r * .4, r * .25], [r * .75, r * .75], [-r * .1, r * .25]]);
      c.restore();
      c.lineWidth = Math.max(1.5, r * .24); c.lineCap = 'round';
      line(c, [[-r * .65, r * .8], [r * .7, -r * .75]]);
      c.save(); c.strokeStyle = INK; c.lineWidth = r * .2;
      line(c, [[-r * .95, r * .45], [-r * .4, r]]); c.restore();
    },
    paradise: (c, r) => {
      c.beginPath(); c.ellipse(0, r * .45, r, r * .45, 0, 0, 7); c.fill();
      c.save(); c.fillStyle = '#5a9a45';
      c.beginPath(); c.arc(-r * .35, -r * .1, r * .32, 0, 7); c.fill();
      c.beginPath(); c.arc(r * .2, -r * .25, r * .42, 0, 7); c.fill();
      c.restore();
      c.save(); c.fillStyle = '#8a5a34';
      c.fillRect(r * .12, -r * .05, r * .16, r * .5); c.restore();
    },
    wing: (c, r) => {
      c.beginPath();
      c.moveTo(0, r * .7);
      c.bezierCurveTo(-r * .3, -r * .2, -r * .95, -r * .55, -r, -r);
      c.bezierCurveTo(-r * .35, -r * .7, -r * .15, -r * .2, 0, r * .7);
      c.fill();
      c.beginPath();
      c.moveTo(0, r * .7);
      c.bezierCurveTo(r * .3, -r * .2, r * .95, -r * .55, r, -r);
      c.bezierCurveTo(r * .35, -r * .7, r * .15, -r * .2, 0, r * .7);
      c.fill();
      c.save(); c.globalAlpha = .5; c.strokeStyle = '#fff'; c.lineWidth = r * .1;
      line(c, [[-r * .7, -r * .72], [-r * .2, r * .2]]);
      line(c, [[r * .7, -r * .72], [r * .2, r * .2]]); c.restore();
    },
  };

  function drawItem(c, key, cx, cy, r) {
    const it = ITEMS[key];
    if (!it) return;
    const f = SHAPES[it.shape];
    if (!f) return;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = it.color;
    c.strokeStyle = it.color;
    c.lineWidth = Math.max(1.3, r * 0.24);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    f(c, r, it);
    c.restore();
  }

  // 渡し橋の目印
  function drawBridge(c, cx, cy, r) {
    c.save();
    c.translate(cx, cy);
    c.lineCap = 'round';
    c.strokeStyle = '#b39ddb';
    c.lineWidth = Math.max(2, r * .42);
    c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
    c.strokeStyle = 'rgba(255,250,240,.95)';
    c.lineWidth = Math.max(4, r * .95);
    c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
    c.strokeStyle = '#8d6e9c';
    c.lineWidth = Math.max(2, r * .5);
    c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
    c.restore();
  }

  // 速さの目盛り。レベルを上げると本数が増える。
  const BARS = 5;
  function drawSpeed(c, cx, cy, w, h, level) {
    const gap = w / BARS;
    const bw = Math.max(1.5, gap * .66);
    for (let i = 0; i < BARS; i++) {
      const bh = Math.max(1.5, h * (.36 + .64 * (i / (BARS - 1))));
      const x = cx - w / 2 + gap * i + (gap - bw) / 2;
      c.fillStyle = i < level ? '#6a4f8a' : 'rgba(106,79,138,.18)';
      c.fillRect(x, cy - bh, bw, bh);
    }
  }

  // 品目を持たない設備の絵
  function drawGlyph(c, kind, cx, cy, r) {
    c.save();
    c.translate(cx, cy);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(1.6, r * .22);
    if (kind === 'split') {
      c.strokeStyle = '#2e8b6f';
      c.beginPath();
      c.moveTo(-r, 0); c.lineTo(0, 0);
      c.moveTo(0, -r); c.lineTo(0, r);
      c.moveTo(-r * .45, -r * .55); c.lineTo(0, -r); c.lineTo(r * .45, -r * .55);
      c.moveTo(-r * .45, r * .55); c.lineTo(0, r); c.lineTo(r * .45, r * .55);
      c.stroke();
    } else if (kind === 'store') {
      c.strokeStyle = '#8a6a2e';
      poly(c, [[-r, r * .9], [-r, -r * .2], [0, -r * .9], [r, -r * .2], [r, r * .9]]);
      c.stroke();
      c.beginPath(); c.moveTo(-r * .5, r * .9); c.lineTo(-r * .5, r * .1);
      c.lineTo(r * .5, r * .1); c.lineTo(r * .5, r * .9); c.stroke();
    } else if (kind === 'rubble') {
      c.fillStyle = '#b3a5c4';
      fill(c, [[-r, r * .8], [-r * .7, -r * .3], [0, -r], [r * .75, -r * .2], [r, r * .8]]);
      c.strokeStyle = 'rgba(90,70,110,.55)';
      c.beginPath(); c.moveTo(-r * .7, -r * .3); c.lineTo(-r * .1, r * .2); c.lineTo(r, r * .8); c.stroke();
    }
    c.restore();
  }

  global.ART = { drawItem, drawBridge, drawSpeed, drawGlyph, roundRect };
})(window);

// 品物と設備の絵。画像は持たず canvas で描く。
// 色だけで見分けさせないので、品目はすべて輪郭の形が違う。
(function (global) {
  'use strict';

  const ITEMS = window.COLONY.ITEMS;

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function poly(c, pts) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
  }

  const DARK = '#0c1118';

  // r は「半径」。だいたい 2r 四方に収まる。
  function drawItem(c, key, cx, cy, r) {
    const it = ITEMS[key];
    if (!it) return;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = it.color;
    c.strokeStyle = it.color;
    c.lineWidth = Math.max(1.3, r * 0.26);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    switch (it.shape) {
      // ---- 原料
      case 'ore':       // 丸い塊に粒
        poly(c, [[-r, r * .2], [-r * .6, -r * .8], [r * .3, -r], [r, -r * .1], [r * .6, r * .85], [-r * .5, r]]);
        c.fill();
        c.globalAlpha = .45; c.fillStyle = DARK;
        [[-.3, .1], [.25, -.3], [.15, .45]].forEach((p) => {
          c.beginPath(); c.arc(p[0] * r, p[1] * r, r * .17, 0, 7); c.fill();
        });
        break;

      case 'coal':      // 尖った塊
        poly(c, [[-r, r * .5], [-r * .45, -r * .55], [r * .1, -r], [r * .75, -r * .35], [r, r * .45], [r * .2, r]]);
        c.fill();
        c.globalAlpha = .5; c.strokeStyle = DARK; c.lineWidth = r * .16;
        c.beginPath(); c.moveTo(-r * .45, -r * .55); c.lineTo(r * .05, r * .2); c.lineTo(r, r * .45); c.stroke();
        break;

      case 'drop':      // 雫
        c.beginPath();
        c.moveTo(0, -r);
        c.bezierCurveTo(r * .85, -r * .1, r * .8, r * .8, 0, r);
        c.bezierCurveTo(-r * .8, r * .8, -r * .85, -r * .1, 0, -r);
        c.fill();
        break;

      case 'oil':       // 横倒しのドラム
        roundRect(c, -r, -r * .62, r * 2, r * 1.24, r * .3); c.fill();
        c.globalAlpha = .4; c.fillStyle = DARK;
        c.fillRect(-r * .42, -r * .62, r * .2, r * 1.24);
        c.fillRect(r * .2, -r * .62, r * .2, r * 1.24);
        break;

      case 'grain':     // 麦の穂
        c.lineWidth = Math.max(1.2, r * .2);
        c.beginPath(); c.moveTo(0, r); c.lineTo(0, -r * .3); c.stroke();
        for (let i = 0; i < 3; i++) {
          const y = -r + i * r * .45;
          c.beginPath();
          c.ellipse(-r * .34, y + r * .2, r * .22, r * .34, -0.5, 0, 7); c.fill();
          c.beginPath();
          c.ellipse(r * .34, y + r * .2, r * .22, r * .34, 0.5, 0, 7); c.fill();
        }
        break;

      case 'log':       // 丸太
        roundRect(c, -r, -r * .55, r * 2, r * 1.1, r * .2); c.fill();
        c.strokeStyle = DARK; c.globalAlpha = .45; c.lineWidth = r * .13;
        c.beginPath(); c.arc(-r * .55, 0, r * .3, 0, 7); c.stroke();
        c.beginPath(); c.arc(-r * .55, 0, r * .13, 0, 7); c.stroke();
        break;

      case 'cattle':    // 角のある頭
        c.beginPath(); c.arc(0, r * .15, r * .68, 0, 7); c.fill();
        c.lineWidth = Math.max(1.3, r * .22);
        c.beginPath();
        c.moveTo(-r * .62, -r * .25); c.quadraticCurveTo(-r, -r * .9, -r * .45, -r * .95);
        c.moveTo(r * .62, -r * .25); c.quadraticCurveTo(r, -r * .9, r * .45, -r * .95);
        c.stroke();
        c.fillStyle = DARK; c.globalAlpha = .5;
        c.beginPath(); c.arc(-r * .24, r * .05, r * .12, 0, 7); c.fill();
        c.beginPath(); c.arc(r * .24, r * .05, r * .12, 0, 7); c.fill();
        break;

      // ---- 1段
      case 'plate':     // 板
        roundRect(c, -r, -r * .7, r * 2, r * 1.4, r * .2); c.fill();
        c.globalAlpha = .35; c.fillStyle = DARK;
        c.fillRect(-r * .55, -r * .7, r * .16, r * 1.4);
        c.fillRect(r * .39, -r * .7, r * .16, r * 1.4);
        break;

      case 'pellet':    // 粒3つ
        [[-.45, -.3], [.45, -.3], [0, .5]].forEach((p) => {
          c.beginPath(); c.arc(p[0] * r, p[1] * r, r * .44, 0, 7); c.fill();
        });
        break;

      case 'chunk':     // 三角の炭
        poly(c, [[0, -r], [r, r * .75], [-r, r * .75]]); c.fill();
        c.globalAlpha = .4; c.strokeStyle = DARK; c.lineWidth = r * .15;
        c.beginPath(); c.moveTo(0, -r * .35); c.lineTo(0, r * .75); c.stroke();
        break;

      case 'bag':       // 袋
        c.beginPath();
        c.moveTo(-r * .55, -r * .6);
        c.lineTo(r * .55, -r * .6);
        c.quadraticCurveTo(r * .95, r * .3, r * .7, r);
        c.lineTo(-r * .7, r);
        c.quadraticCurveTo(-r * .95, r * .3, -r * .55, -r * .6);
        c.fill();
        c.globalAlpha = .45; c.fillStyle = DARK;
        c.fillRect(-r * .6, -r * .78, r * 1.2, r * .26);
        break;

      case 'meat':      // 骨付き肉
        c.beginPath(); c.ellipse(r * .12, r * .1, r * .8, r * .66, -0.35, 0, 7); c.fill();
        c.strokeStyle = '#f2ecdf'; c.lineWidth = Math.max(1.4, r * .2);
        c.beginPath(); c.moveTo(-r * .45, r * .55); c.lineTo(-r * .95, r * .95); c.stroke();
        c.fillStyle = '#f2ecdf';
        c.beginPath(); c.arc(-r * .98, r * .98, r * .2, 0, 7); c.fill();
        break;

      case 'hide':      // なめし皮
        poly(c, [[-r, -r * .55], [-r * .3, -r * .85], [r * .55, -r * .6], [r, r * .1],
          [r * .4, r * .9], [-r * .5, r * .75], [-r * .9, r * .2]]);
        c.fill();
        c.globalAlpha = .35; c.fillStyle = DARK;
        c.beginPath(); c.ellipse(0, 0, r * .3, r * .42, .3, 0, 7); c.fill();
        break;

      // ---- 2段
      case 'can':       // 無地の缶
        c.beginPath(); c.ellipse(0, -r * .62, r * .62, r * .24, 0, 0, 7); c.fill();
        c.fillRect(-r * .62, -r * .62, r * 1.24, r * 1.24);
        c.beginPath(); c.ellipse(0, r * .62, r * .62, r * .24, 0, 0, 7); c.fill();
        c.globalAlpha = .4; c.fillStyle = DARK;
        c.beginPath(); c.ellipse(0, -r * .62, r * .38, r * .14, 0, 0, 7); c.fill();
        break;

      case 'hex':       // 六角ナット
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath(); c.fill();
        c.fillStyle = DARK; c.globalAlpha = .45;
        c.beginPath(); c.arc(0, 0, r * .34, 0, 7); c.fill();
        break;

      case 'bottle':    // 空の容器（輪郭だけ）
        c.lineWidth = Math.max(1.4, r * .2);
        c.beginPath();
        c.moveTo(-r * .22, -r);
        c.lineTo(r * .22, -r);
        c.lineTo(r * .22, -r * .5);
        c.quadraticCurveTo(r * .62, -r * .2, r * .62, r * .3);
        c.lineTo(r * .62, r * .82);
        c.quadraticCurveTo(r * .62, r, r * .42, r);
        c.lineTo(-r * .42, r);
        c.quadraticCurveTo(-r * .62, r, -r * .62, r * .82);
        c.lineTo(-r * .62, r * .3);
        c.quadraticCurveTo(-r * .62, -r * .2, -r * .22, -r * .5);
        c.closePath();
        c.stroke();
        break;

      case 'battery':   // 電池
        roundRect(c, -r * .58, -r * .78, r * 1.16, r * 1.62, r * .18); c.fill();
        c.fillRect(-r * .22, -r, r * .44, r * .24);
        c.globalAlpha = .5; c.fillStyle = DARK;
        c.fillRect(-r * .34, -r * .35, r * .68, r * .16);
        c.fillRect(-r * .34, r * .05, r * .68, r * .16);
        break;

      case 'bread':     // パン
        c.beginPath();
        c.moveTo(-r, r * .55);
        c.quadraticCurveTo(-r * .9, -r * .75, 0, -r * .72);
        c.quadraticCurveTo(r * .9, -r * .75, r, r * .55);
        c.quadraticCurveTo(0, r * .95, -r, r * .55);
        c.fill();
        c.globalAlpha = .4; c.strokeStyle = DARK; c.lineWidth = r * .15;
        [-0.38, 0, 0.38].forEach((k) => {
          c.beginPath(); c.moveTo(k * r - r * .12, -r * .5); c.lineTo(k * r + r * .12, -r * .05); c.stroke();
        });
        break;

      case 'bagpack':   // 革のかばん
        c.lineWidth = Math.max(1.3, r * .18);
        c.beginPath(); c.arc(0, -r * .45, r * .42, Math.PI, 0); c.stroke();
        roundRect(c, -r * .82, -r * .45, r * 1.64, r * 1.4, r * .2); c.fill();
        c.globalAlpha = .45; c.fillStyle = DARK;
        c.fillRect(-r * .82, r * .1, r * 1.64, r * .18);
        break;

      // ---- 3段
      case 'canned':    // ラベルの巻かれた缶
        c.beginPath(); c.ellipse(0, -r * .62, r * .62, r * .24, 0, 0, 7); c.fill();
        c.fillRect(-r * .62, -r * .62, r * 1.24, r * 1.24);
        c.beginPath(); c.ellipse(0, r * .62, r * .62, r * .24, 0, 0, 7); c.fill();
        c.fillStyle = DARK; c.globalAlpha = .55;
        c.fillRect(-r * .62, -r * .2, r * 1.24, r * .52);
        c.globalAlpha = 1; c.fillStyle = it.color;
        c.beginPath(); c.arc(0, r * .06, r * .16, 0, 7); c.fill();
        break;

      case 'filled':    // 中身の入った容器
        c.lineWidth = Math.max(1.4, r * .2);
        c.beginPath();
        c.moveTo(-r * .22, -r);
        c.lineTo(r * .22, -r);
        c.lineTo(r * .22, -r * .5);
        c.quadraticCurveTo(r * .62, -r * .2, r * .62, r * .3);
        c.lineTo(r * .62, r * .82);
        c.quadraticCurveTo(r * .62, r, r * .42, r);
        c.lineTo(-r * .42, r);
        c.quadraticCurveTo(-r * .62, r, -r * .62, r * .82);
        c.lineTo(-r * .62, r * .3);
        c.quadraticCurveTo(-r * .62, -r * .2, -r * .22, -r * .5);
        c.closePath();
        c.stroke();
        c.save(); c.clip();
        c.globalAlpha = .85;
        c.fillRect(-r, -r * .1, r * 2, r * 1.2);
        c.restore();
        break;

      case 'gear': {
        const teeth = 7;
        c.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * .68;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath(); c.fill();
        c.globalCompositeOperation = 'destination-out';
        c.beginPath(); c.arc(0, 0, r * .3, 0, 7); c.fill();
        c.globalCompositeOperation = 'source-over';
        break;
      }

      case 'drill':     // 電動工具
        roundRect(c, -r * .95, -r * .72, r * 1.3, r * .84, r * .2); c.fill();
        poly(c, [[r * .35, -r * .5], [r, 0], [r * .35, r * .5]]); c.fill();
        roundRect(c, -r * .72, r * .1, r * .44, r * .9, r * .12); c.fill();
        c.globalAlpha = .45; c.fillStyle = DARK;
        c.fillRect(-r * .8, -r * .5, r * .3, r * .4);
        break;

      case 'ration':    // 包み
        roundRect(c, -r * .85, -r * .85, r * 1.7, r * 1.7, r * .18); c.fill();
        c.globalAlpha = .5; c.strokeStyle = DARK; c.lineWidth = r * .16;
        c.beginPath(); c.moveTo(-r * .85, r * .3); c.lineTo(r * .85, -r * .5); c.stroke();
        c.beginPath(); c.moveTo(-r * .85, r * .75); c.lineTo(r * .85, -r * .05); c.stroke();
        break;
    }
    c.restore();
  }

  // 陸橋の目印
  function drawBridge(c, cx, cy, r) {
    c.save();
    c.translate(cx, cy);
    c.lineCap = 'round';
    c.strokeStyle = '#55637a';
    c.lineWidth = Math.max(2, r * .42);
    c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
    c.strokeStyle = 'rgba(8,11,16,.85)';
    c.lineWidth = Math.max(4, r * .95);
    c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
    c.strokeStyle = '#9fb4cc';
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
      c.fillStyle = i < level ? '#d6e6f7' : 'rgba(214,230,247,.16)';
      c.fillRect(x, cy - bh, bw, bh);
    }
  }

  // 設備の絵（品目を持たないもの）
  function drawGlyph(c, kind, cx, cy, r) {
    c.save();
    c.translate(cx, cy);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(1.6, r * .22);
    if (kind === 'split') {
      c.strokeStyle = '#6fd6ae';
      c.beginPath();
      c.moveTo(-r, 0); c.lineTo(0, 0);
      c.moveTo(0, -r); c.lineTo(0, r);
      c.moveTo(-r * .45, -r * .55); c.lineTo(0, -r); c.lineTo(r * .45, -r * .55);
      c.moveTo(-r * .45, r * .55); c.lineTo(0, r); c.lineTo(r * .45, r * .55);
      c.stroke();
    } else if (kind === 'store') {
      c.strokeStyle = '#c8b57a';
      poly(c, [[-r, r * .9], [-r, -r * .2], [0, -r * .9], [r, -r * .2], [r, r * .9]]);
      c.stroke();
      c.beginPath(); c.moveTo(-r * .5, r * .9); c.lineTo(-r * .5, r * .1);
      c.lineTo(r * .5, r * .1); c.lineTo(r * .5, r * .9); c.stroke();
    } else if (kind === 'rock') {
      c.fillStyle = '#3a4554';
      poly(c, [[-r, r * .8], [-r * .7, -r * .3], [0, -r], [r * .75, -r * .2], [r, r * .8]]);
      c.fill();
      c.strokeStyle = 'rgba(12,17,24,.6)';
      c.beginPath(); c.moveTo(-r * .7, -r * .3); c.lineTo(-r * .1, r * .2); c.lineTo(r, r * .8); c.stroke();
    }
    c.restore();
  }

  global.ART = { drawItem, drawBridge, drawSpeed, drawGlyph, roundRect };
})(window);

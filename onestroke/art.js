// 物と機械の絵。画像は持たず canvas で描く。
// 色だけで見分けさせないので、素材はすべて輪郭の形が違う。
(function (global) {
  'use strict';

  const ITEMS = {
    iron:  { name: '鉄板',     color: '#93a9c0', shape: 'plate' },
    bolt:  { name: 'ボルト',   color: '#e2a33c', shape: 'hex' },
    wire:  { name: '配線',     color: '#5ec46f', shape: 'wire' },
    gear:  { name: '歯車',     color: '#3fc0b6', shape: 'gear' },
    frame: { name: 'フレーム', color: '#8a8cf2', shape: 'frame' },
    motor: { name: 'モーター', color: '#e4655a', shape: 'motor' },
    chip:  { name: '基板',     color: '#bcd94f', shape: 'chip' },
    robot: { name: 'ロボ',     color: '#f2c94c', shape: 'robot' },
  };

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // r は「半径」。だいたい 2r 四方に収まる。
  function drawItem(c, key, cx, cy, r) {
    const it = ITEMS[key];
    if (!it) return;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = it.color;
    c.strokeStyle = it.color;
    c.lineWidth = Math.max(1.4, r * 0.28);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    switch (it.shape) {
      case 'plate':
        roundRect(c, -r, -r * 0.72, r * 2, r * 1.44, r * 0.22);
        c.fill();
        c.save();
        c.globalAlpha = 0.35;
        c.fillStyle = '#0c1118';
        c.fillRect(-r * 0.55, -r * 0.72, r * 0.16, r * 1.44);
        c.fillRect(r * 0.39, -r * 0.72, r * 0.16, r * 1.44);
        c.restore();
        break;

      case 'hex': {
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath();
        c.fill();
        c.fillStyle = '#0c1118';
        c.globalAlpha = 0.4;
        c.beginPath();
        c.arc(0, 0, r * 0.34, 0, Math.PI * 2);
        c.fill();
        break;
      }

      case 'wire':
        c.beginPath();
        c.moveTo(-r, r * 0.55);
        c.lineTo(-r * 0.33, -r * 0.55);
        c.lineTo(r * 0.33, r * 0.55);
        c.lineTo(r, -r * 0.55);
        c.stroke();
        break;

      case 'gear': {
        const teeth = 7;
        c.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.68;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath();
        c.fill();
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        c.arc(0, 0, r * 0.3, 0, Math.PI * 2);
        c.fill();
        c.globalCompositeOperation = 'source-over';
        break;
      }

      case 'frame':
        c.lineWidth = Math.max(1.6, r * 0.34);
        roundRect(c, -r * 0.88, -r * 0.88, r * 1.76, r * 1.76, r * 0.24);
        c.stroke();
        break;

      case 'motor':
        c.beginPath();
        c.arc(0, 0, r * 0.92, 0, Math.PI * 2);
        c.fill();
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        c.arc(0, 0, r * 0.46, 0, Math.PI * 2);
        c.fill();
        c.globalCompositeOperation = 'source-over';
        c.fillRect(-r * 0.16, -r * 1.25, r * 0.32, r * 0.45);
        c.fillRect(-r * 0.16, r * 0.8, r * 0.32, r * 0.45);
        break;

      case 'chip':
        roundRect(c, -r * 0.82, -r * 0.82, r * 1.64, r * 1.64, r * 0.2);
        c.fill();
        c.fillStyle = '#0c1118';
        c.globalAlpha = 0.5;
        for (let i = -1; i <= 1; i += 2) {
          for (let j = -1; j <= 1; j += 2) {
            c.beginPath();
            c.arc(i * r * 0.38, j * r * 0.38, r * 0.16, 0, Math.PI * 2);
            c.fill();
          }
        }
        break;

      case 'robot':
        c.fillRect(-r * 0.08, -r * 1.15, r * 0.16, r * 0.35);
        c.beginPath();
        c.arc(0, -r * 1.2, r * 0.16, 0, Math.PI * 2);
        c.fill();
        roundRect(c, -r * 0.85, -r * 0.8, r * 1.7, r * 1.6, r * 0.3);
        c.fill();
        c.fillStyle = '#12161d';
        c.beginPath();
        c.arc(-r * 0.33, -r * 0.15, r * 0.2, 0, Math.PI * 2);
        c.arc(r * 0.33, -r * 0.15, r * 0.2, 0, Math.PI * 2);
        c.fill();
        c.fillRect(-r * 0.4, r * 0.35, r * 0.8, r * 0.14);
        break;
    }
    c.restore();
  }

  // 陸橋の目印。盤面で描いている陸橋（下をくぐる線＋影で浮かせた線）と同じ形。
  function drawBridge(c, cx, cy, r) {
    c.save();
    c.translate(cx, cy);
    c.lineCap = 'round';
    c.strokeStyle = '#55637a';
    c.lineWidth = Math.max(2, r * 0.42);
    c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
    c.strokeStyle = 'rgba(8,11,16,.85)';
    c.lineWidth = Math.max(4, r * 0.95);
    c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
    c.strokeStyle = '#9fb4cc';
    c.lineWidth = Math.max(2, r * 0.5);
    c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
    c.restore();
  }

  // 速さの目盛り。電波強度のように、左から順に高くなる棒を level 本だけ光らせる。
  // 工場の製作速度と供給口の供給速度に使う。やってみるまで速さが分からない、
  // という状態を作らないため。
  const SPEED_BARS = 5;
  function drawSpeed(c, cx, cy, w, h, level) {
    const gap = w / SPEED_BARS;
    const bw = Math.max(1.5, gap * 0.66);
    c.save();
    for (let i = 0; i < SPEED_BARS; i++) {
      const bh = Math.max(1.5, h * (0.36 + 0.64 * (i / (SPEED_BARS - 1))));
      const x = cx - w / 2 + gap * i + (gap - bw) / 2;
      c.fillStyle = i < level ? '#d6e6f7' : 'rgba(214,230,247,.16)';
      c.fillRect(x, cy - bh, bw, bh);
    }
    c.restore();
  }

  // 1個あたりの秒数から目盛りの本数へ。速いほど多い。
  function speedLevel(secPerItem) {
    if (secPerItem <= 0.4) return 5;
    if (secPerItem <= 0.55) return 4;
    if (secPerItem <= 0.8) return 3;
    if (secPerItem <= 1.1) return 2;
    return 1;
  }

  global.ART = { ITEMS, drawItem, drawBridge, drawSpeed, speedLevel, roundRect };
})(window);

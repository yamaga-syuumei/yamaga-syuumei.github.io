// てびきのフェアリー「ルミ」。絵は sprites.js の fairy（_sprites.py が作る）。
//
//  * 羽ばたきの4コマを回し、ふわふわ上下する。ときどきまばたきする。
//  * 手順をやり終えたら cheer() で喜ぶ（笑って手を振り、星を散らす）。
//  * 小さく描いて CSS で引き伸ばす（image-rendering: pixelated）。
//
//  FAIRY.attach(canvas) / FAIRY.step(dt) / FAIRY.cheer()
window.FAIRY = (function () {
  'use strict';

  const SP = window.SPRITES;
  const BOB = 3;                       // 上下に揺れる幅。キャンバスはその分だけ高くする
  let cv = null, g = null;
  let t = 0, blinkT = 2500, blink = 0, cheerT = 0;
  const cache = new Map();

  function attach(c) {
    if (!SP || !SP.fairy) return;
    cv = c; g = cv.getContext('2d');
    const f = SP.fairy.idle[0];
    cv.width = f[0].length; cv.height = f.length + BOB;
    g.imageSmoothingEnabled = false;
  }

  function cheer() { cheerT = 1200; }

  // 1コマを一度だけ小さなキャンバスに描いて取っておく
  function sheet(rows, key) {
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const x = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      for (let i = 0; i < rows[y].length; i++) {
        const ch = rows[y][i];
        if (ch === '.') continue;
        x.fillStyle = SP.pal[ch] || '#ff00ff';
        x.fillRect(i, y, 1, 1);
      }
    }
    cache.set(key, c);
    return c;
  }

  function step(dt) {
    if (!cv) return;
    t += dt;
    blinkT -= dt; if (blinkT <= 0) { blink = 150; blinkT = 2200 + Math.random() * 2600; }
    if (blink > 0) blink -= dt;
    if (cheerT > 0) cheerT -= dt;
    let set, i;
    if (cheerT > 0) { set = 'cheer'; i = ((1200 - cheerT) / 150 | 0) % 4; }
    else { set = blink > 0 ? 'blink' : 'idle'; i = (t / 150 | 0) % 4; }
    const bob = cheerT > 0 ? 0 : Math.round((Math.sin(t / 420) + 1) / 2 * (BOB - 1));
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(sheet(SP.fairy[set][i], set + i), 0, BOB - 1 - bob);
  }

  return { attach, step, cheer };
})();

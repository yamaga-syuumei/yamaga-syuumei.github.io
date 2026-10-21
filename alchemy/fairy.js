// てびきのフェアリー「ルミ」。1文字1ドットの表から小さなキャンバスに描き、CSS で引き伸ばす。
//
//  * 羽は体の後ろに別に描く。上げ下げの2コマで羽ばたく。
//  * ときどきまばたきする。手順をやり終えたら cheer() で喜ぶ（目を細めて跳ね、光が散る）。
//
//  FAIRY.attach(canvas) / FAIRY.step(dt) / FAIRY.cheer()
window.FAIRY = (function () {
  'use strict';

  const PAL = {
    K: '#2a1a3a', H: '#ffd86a', h: '#e0a83a', S: '#ffe4cc', E: '#3a2a6a', C: '#ff9ab0', M: '#c0506a',
    D: '#b994ff', d: '#8a6ac8', W: 'rgba(200,244,255,.85)', w: '#7ad0f0', L: '#fff8c0',
  };
  // 体。羽は入れない
  const BODY = [
    '......KKKKKK......',
    '.....KHHHHHHK.....',
    '....KHHHHHHHHK....',
    '....KHHHHHHHHK....',
    '...KHHSSSSSSHHK...',
    '...KHSSSSSSSSHK...',
    '...KHSESSSSESHK...',
    '...KHSESSSSESHK...',
    '...KhSCSMMSCShK...',
    '....KSSSSSSSSK....',
    '.....KKSSSSKK.....',
    '.....KDDDDDDK.....',
    '....KDDDDDDDDK....',
    '....KSdDDDDdSK....',
    '....KKDDDDDDKK....',
    '.....KdDDDDdK.....',
    '....KdDDDDDDdK....',
    '....KKKKKKKKKK....',
    '......KS..SK......',
    '......KK..KK......',
  ];
  const WIDE = 18, TALL = 20;

  let cv = null, g = null;
  let t = 0, flapT = 0, flap = 0, blinkT = 2500, blink = 0, cheerT = 0;
  const sparks = [];

  function attach(c) {
    cv = c; g = cv.getContext('2d');
    cv.width = WIDE + 8; cv.height = TALL + 8;      // 跳ねる分と光の分の余白
    g.imageSmoothingEnabled = false;
  }

  function cheer() {
    cheerT = 1200;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.28;
      sparks.push({ x: 13, y: 12, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14 - 6, t: 0 });
    }
  }

  // 羽。上げは頭の横、下げは腰の横。楕円を左に描いて右へ写す
  function wings(up) {
    const cy = up ? 8.5 : 12.5, cx = 2.2;
    for (let y = 0; y < TALL; y++) for (let x = 0; x < 6; x++) {
      const dx = (x - cx) / 2.6, dy = (y - cy) / (up ? 3.4 : 2.6);
      const r = dx * dx + dy * dy;
      if (r > 1) continue;
      const col = r > .55 ? PAL.w : PAL.W;
      g.fillStyle = col;
      g.fillRect(4 + x, 4 + y, 1, 1);
      g.fillRect(4 + WIDE - 1 - x, 4 + y, 1, 1);
    }
  }

  function step(dt) {
    if (!cv) return;
    t += dt;
    flapT += dt; if (flapT > (cheerT > 0 ? 90 : 170)) { flapT = 0; flap ^= 1; }
    blinkT -= dt; if (blinkT <= 0) { blink = 140; blinkT = 2200 + Math.random() * 2600; }
    if (blink > 0) blink -= dt;
    if (cheerT > 0) cheerT -= dt;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.t += dt; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      if (p.t > 700) sparks.splice(i, 1);
    }
    draw();
  }

  function draw() {
    g.clearRect(0, 0, cv.width, cv.height);
    const hop = cheerT > 0 ? -Math.abs(Math.sin(cheerT / 120)) * 3 : Math.sin(t / 380) * 1.2;
    g.save();
    g.translate(0, Math.round(hop));
    wings(flap === 1);
    const happy = cheerT > 0, closed = happy || blink > 0;
    for (let y = 0; y < TALL; y++) {
      const row = BODY[y];
      for (let x = 0; x < WIDE; x++) {
        let ch = row[x];
        if (ch === '.') continue;
        if (ch === 'E' && closed) ch = y === 7 ? 'K' : 'S';       // 目を閉じる・細める
        if (ch === 'M' && happy) ch = 'C';
        g.fillStyle = PAL[ch];
        g.fillRect(4 + x, 4 + y, 1, 1);
      }
    }
    if (happy) { g.fillStyle = PAL.S; g.fillRect(4 + 4, 4 + 11, 1, 2); g.fillRect(4 + 13, 4 + 11, 1, 2); }  // 両手を上げる
    g.restore();
    // まわりの光
    const tw = (t / 300 | 0) % 4;
    g.fillStyle = PAL.L;
    if (tw === 0) g.fillRect(1, 6, 1, 1);
    if (tw === 2) g.fillRect(cv.width - 2, 12, 1, 1);
    for (const p of sparks) {
      g.globalAlpha = 1 - p.t / 700;
      g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    g.globalAlpha = 1;
  }

  return { attach, step, cheer };
})();

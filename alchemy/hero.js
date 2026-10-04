// 勇者の横スクロール。購入パレットの右で、勇者の一行がドット絵で旅をして戦っている。
//
//  * 絵は小さな低解像度のキャンバスに1マス1ドットで描き、CSS で引き伸ばす（image-rendering: pixelated）。
//  * 背景と敵の顔ぶれは「勇者の歩み」の進み（第何話か）で変わる。仲間や飛行船も話が進むと加わる。
//  * 勇者の装備は錬金術師のランクで良くなる。お店の品が勇者まで届いている、という見立て。
//  * 遊びには関わらない。眺めるだけの演出。
//
//  HERO.set({ chapter, tier })  … 話とランクを渡す
//  HERO.boss()                  … 次に出る敵を大物にする（便りで話が進んだとき）
//  HERO.step(dt) / HERO.draw()  … 毎フレーム
window.HERO = (function () {
  'use strict';

  // ---------------------------------------------------------------- ドット絵
  // 1文字1ドット。'.' は透明。色は sprite ごとの pal で引く。
  const HERO = {
    walkA: [
      '...hhhh....',
      '..hhhhhh...',
      '..hssse....',
      '..ssss.....',
      '...ss......',
      '.cttttt....',
      'cctttttsk..',
      'cctttttk...',
      '.cbbbbb....',
      '..ppppp....',
      '..pp.pp....',
      '.pp...pp...',
      '.oo...oo...',
    ],
    walkB: [
      '...hhhh....',
      '..hhhhhh...',
      '..hssse....',
      '..ssss.....',
      '...ss......',
      '.cttttt....',
      'cctttttsk..',
      'cctttttk...',
      '.cbbbbb....',
      '..ppppp....',
      '...ppp.....',
      '...p.p.....',
      '..oo.oo....',
    ],
  };
  // 剣は体とは別に、手の位置から描く。[x, y, 色] の並び
  const SWORD = {
    rest:  [[8, 6, 'm'], [9, 5, 'm'], [10, 4, 'm'], [11, 3, 'w'], [8, 7, 'g']],
    up:    [[6, 4, 'g'], [6, 3, 'm'], [6, 2, 'm'], [6, 1, 'm'], [6, 0, 'w']],
    slash: [[8, 7, 'g'], [9, 7, 'm'], [10, 7, 'm'], [11, 7, 'm'], [12, 7, 'm'], [13, 7, 'w'],
      [12, 5, 'a'], [13, 6, 'a'], [13, 8, 'a'], [12, 9, 'a']],
  };

  const MAGE_HAT = ['....n......', '...nnn.....', '..nnnnnn...'];   // 魔法使いの三角帽子（頭の上に重ねる）

  const MON = {
    slime: { w: 10, h: 7, frames: [[
      '...gggg...',
      '..gggggg..',
      '.gglgggeg.',
      '.gggggggg.',
      'ggggggeggg',
      'gggggggggg',
      '.dddddddd.',
    ], [
      '..........',
      '...gggg...',
      '.gggggggg.',
      'gglggggegg',
      'ggggggeggg',
      'gggggggggg',
      'dddddddddd',
    ]] },
    bat: { w: 11, h: 7, fly: 6, frames: [[
      'w.........w',
      'ww.......ww',
      'wwwgggggwww',
      '.wwgegegww.',
      '...ggggg...',
      '....g.g....',
      '...........',
    ], [
      '...........',
      '...........',
      '...ggggg...',
      'wwwgegegwww',
      'wwwwgggwwww',
      'ww..g.g..ww',
      'w.........w',
    ]] },
    skel: { w: 8, h: 13, frames: [[
      '..bbbb..',
      '.bbbbbb.',
      '.beebeb.',
      '.bbbbbb.',
      '..b.b...',
      '.bbbbbb.',
      'b.bbbb.b',
      'b.b..b.b',
      '..bbbb..',
      '..b..b..',
      '..b..b..',
      '.bb..bb.',
      '........',
    ], [
      '..bbbb..',
      '.bbbbbb.',
      '.beebeb.',
      '.bbbbbb.',
      '..b.b...',
      '.bbbbbb.',
      'b.bbbb.b',
      'b.b..b.b',
      '..bbbb..',
      '..b..b..',
      '.b....b.',
      'bb....bb',
      '........',
    ]] },
    ghost: { w: 9, h: 10, fly: 4, frames: [[
      '..ggggg..',
      '.ggggggg.',
      'gglegleg.',
      'ggggggggg',
      'ggg.d.ggg',
      'ggggggggg',
      'ggggggggg',
      'gggggggg.',
      'g.gg.gg..',
      '...g..g..',
    ], [
      '..ggggg..',
      '.ggggggg.',
      'gglegleg.',
      'ggggggggg',
      'ggg.d.ggg',
      'ggggggggg',
      'ggggggggg',
      '.gggggggg',
      '..gg.gg.g',
      '..g..g...',
    ]] },
    dragon: { w: 16, h: 12, frames: [[
      '..........rr....',
      '.........rrrr...',
      '..ww....rrerrr..',
      '.wwww..rrrrrrrf.',
      'wwwwwwrrrrrr....',
      '.wwwwrrrrrr.....',
      '..rrrrrrrrr.....',
      '.rrrrrrrrrr.....',
      'rr.rrrrrrrr.....',
      '...rr...rr......',
      '...rr...rr......',
      '..ddd..ddd......',
    ], [
      '..........rr....',
      '.........rrrr...',
      '........rrerrr..',
      '.......rrrrrrrff',
      '..wwwwrrrrrr....',
      '.wwwwrrrrrr.....',
      'wwwrrrrrrrr.....',
      'w.rrrrrrrrr.....',
      'rr.rrrrrrrr.....',
      '...rr...rr......',
      '...rr...rr......',
      '..ddd..ddd......',
    ]] },
  };

  // 敵の色。g が体、d が影、e が目、l が光、w が羽、b が骨、r が鱗、f が火
  const MPAL = {
    slime:  { g: '#4fc35a', d: '#2a7a3a', e: '#102010', l: '#b8f0a0' },
    slimeB: { g: '#4f8ae0', d: '#2a4a9a', e: '#101830', l: '#b8d8ff' },
    slimeR: { g: '#e05a4f', d: '#9a2a2a', e: '#301010', l: '#ffc0b8' },
    bat:    { g: '#6a4a9a', w: '#3a2a5a', e: '#ffd040' },
    batR:   { g: '#9a3a4a', w: '#5a1a2a', e: '#ffe060' },
    skel:   { b: '#e8e4d8', e: '#c03030' },
    ghost:  { g: '#c8d8ff', e: '#2a2a5a', l: '#ffffff', d: '#2a2a5a' },
    ghostP: { g: '#d8a8ff', e: '#3a1a5a', l: '#ffffff', d: '#3a1a5a' },
    dragon: { r: '#c04a3a', w: '#7a2a3a', e: '#ffe040', d: '#5a1a1a', f: '#ffb040' },
    dragonV:{ r: '#7a4ac0', w: '#3a2a6a', e: '#ffe040', d: '#2a1a4a', f: '#e080ff' },
  };

  // 話の区切りごとの景色と敵の顔ぶれ。from は第何話から（0始まり）
  const ACTS = [
    { from: 0,  sky: ['#7fc4f0', '#c8ecff'], far: '#6f94c0', near: '#3f8a4a', top: '#5cc060', dirt: '#8a5a2e', foe: [['slime', 'slime'], ['bat', 'bat']] },
    { from: 3,  sky: ['#5fb0f0', '#e0f4ff'], far: '#7aa0c8', near: '#2f7a6a', top: '#e8d498', dirt: '#b8945a', foe: [['slime', 'slimeB'], ['bat', 'bat'], ['skel', 'skel']] },
    { from: 5,  sky: ['#f09a6a', '#4a3a7a'], far: '#5a4a7a', near: '#3a3050', top: '#8a7a9a', dirt: '#4a3e5a', foe: [['skel', 'skel'], ['ghost', 'ghost'], ['bat', 'batR']] },
    { from: 9,  sky: ['#3a0a18', '#8a2a20'], far: '#2a0a10', near: '#1a0608', top: '#6a2a1a', dirt: '#2a1210', foe: [['skel', 'skel'], ['slime', 'slimeR'], ['dragon', 'dragon']], lava: true },
    { from: 12, sky: ['#a8d4ff', '#f0f8ff'], far: '#e8f0ff', near: '#ffffff', top: '#f8fbff', dirt: '#dce8f8', foe: [['ghost', 'ghost'], ['bat', 'bat'], ['dragon', 'dragon']], cloud: true },
    { from: 15, sky: ['#120828', '#3a1a5a'], far: '#22123a', near: '#160c26', top: '#4a3a6a', dirt: '#221a38', foe: [['dragon', 'dragonV'], ['ghost', 'ghostP'], ['skel', 'skel']], stars: true },
  ];

  // 3×5 の数字。ダメージに使う
  const DIGIT = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

  let cv = null, g = null, W = 96, H = 34, cssW = 0, cssH = 0;
  let chapter = 0, tier = 0, act = ACTS[0];
  const S = {
    scroll: 0, mode: 'walk', t: 0, frame: 0, frameT: 0,
    foe: null, next: 1.2, kills: 0, bossNext: false,
    atk: 0, atkT: 0, hurt: 0, nums: [], parts: [], bolts: [], castT: 0,
    ship: -40,
  };

  function attach(canvas) {
    cv = canvas;
    g = cv.getContext('2d');
  }

  // 低解像度のキャンバスを、見えている大きさに合わせて作り直す
  function fit() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.width === cssW && r.height === cssH) return true;
    cssW = r.width; cssH = r.height;
    const scale = Math.max(2, Math.round(cssH / 34));
    W = Math.ceil(cssW / scale); H = Math.ceil(cssH / scale);
    cv.width = W; cv.height = H;
    g.imageSmoothingEnabled = false;
    return true;
  }

  function set(o) {
    if (o.chapter !== undefined) chapter = o.chapter;
    if (o.tier !== undefined) tier = o.tier;
    act = ACTS[0];
    for (const a of ACTS) if (chapter >= a.from) act = a;
  }

  function boss() { S.bossNext = true; }

  const ground = () => H - 6;
  const HX = () => Math.round(W * .36);       // 勇者の立つ位置

  // ---------------------------------------------------------------- 動き
  function spawn() {
    const list = act.foe;
    const pick = list[(Math.random() * list.length) | 0];
    const big = S.bossNext || (S.kills > 0 && S.kills % 7 === 6);
    S.bossNext = false;
    const m = MON[pick[0]];
    S.foe = { kind: pick[0], pal: MPAL[pick[1]], m, x: W + 4, big, sc: big ? 2 : 1,
      hp: big ? 6 + Math.min(4, chapter >> 2) : 2 + ((Math.random() * 2) | 0), flash: 0, kb: 0, f: 0, ft: 0, lunge: 0 };
  }

  function step(dt) {
    if (!cv) return;
    const k = dt / 1000;
    S.t += dt;
    S.frameT += dt;
    if (S.frameT > 170) { S.frameT = 0; S.frame ^= 1; }
    if (S.hurt > 0) S.hurt -= dt;
    if (S.ship > -60 || chapter >= 12) S.ship += k * 6;
    if (S.ship > W + 40) S.ship = -60;

    const f = S.foe;
    if (S.mode === 'walk') {
      S.scroll += k * 24;
      if (!f) { S.next -= k; if (S.next <= 0) spawn(); }
      else {
        f.x -= k * (24 + 10);
        if (f.x - (HX() + 12) < 3) { S.mode = 'fight'; S.atkT = 200; }
      }
    } else if (S.mode === 'fight' && f) {
      S.atkT -= dt;
      if (S.atkT <= 0) {
        // 振りかぶり → 斬る → 間
        S.atk = (S.atk + 1) % 3;
        S.atkT = [150, 190, 260][S.atk];
        if (S.atk === 2) hit(f);
      }
      // 仲間の魔法使いが火の玉を撃つ
      if (chapter >= 1) {
        S.castT -= dt;
        if (S.castT <= 0) { S.castT = 1100; S.bolts.push({ x: HX() - 10, y: ground() - 9, tx: f.x + 2 }); }
      }
      // ときどき体当たりしてくる
      if (f.lunge <= 0 && Math.random() < k * .35) f.lunge = 260;
      if (f.lunge > 0) {
        f.lunge -= dt;
        if (f.lunge < 130 && f.lunge + dt >= 130) S.hurt = 220;
      }
    } else if (S.mode === 'won') {
      S.atkT -= dt;
      if (S.atkT <= 0) { S.mode = 'walk'; S.atk = 0; S.next = .7 + Math.random() * 1.6; }
    }
    if (f) {
      if (f.flash > 0) f.flash -= dt;
      f.kb = Math.max(0, f.kb - k * 18);
      f.ft += dt; if (f.ft > 200) { f.ft = 0; f.f ^= 1; }
    }
    S.bolts = S.bolts.filter((b) => {
      b.x += k * 90;
      if (S.foe && b.x >= b.tx) { S.foe.flash = 90; burst(b.x, b.y, '#ffb040', 4); return false; }
      return b.x < W + 4;
    });
    S.nums = S.nums.filter((n) => { n.t += dt; return n.t < 700; });
    S.parts = S.parts.filter((p) => {
      p.t += dt; p.x += p.vx * k; p.y += p.vy * k; p.vy += 60 * k;
      return p.t < p.life;
    });
  }

  function hit(f) {
    f.hp--;
    f.flash = 120; f.kb = 3;
    const dmg = Math.round((8 + Math.random() * 16) * (1 + tier * .35) * (f.big ? 1.4 : 1));
    S.nums.push({ v: dmg, x: f.x + 2, y: ground() - MON[f.kind].h * f.sc - 2, t: 0 });
    burst(f.x + 2, ground() - 5, '#ffffff', 3);
    if (f.hp <= 0) {
      const cx = f.x + (f.m.w * f.sc) / 2, cy = ground() - (f.m.h * f.sc) / 2;
      burst(cx, cy, f.pal.g || f.pal.r || f.pal.b, f.big ? 18 : 9);
      for (let i = 0; i < (f.big ? 6 : 2); i++) S.parts.push({ x: cx, y: cy, vx: (Math.random() - .5) * 40, vy: -40 - Math.random() * 30, t: 0, life: 900, col: '#f0c040', coin: true });
      S.foe = null; S.kills++;
      S.mode = 'won'; S.atkT = 420;
    }
  }

  function burst(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = 20 + Math.random() * 40;
      S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: 0, life: 300 + Math.random() * 300, col });
    }
  }

  // ---------------------------------------------------------------- 描く
  function px(x, y, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); }

  function sprite(rows, pal, x, y, flash, sc) {
    const s = sc || 1;
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r];
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === '.') continue;
        g.fillStyle = flash ? '#ffffff' : (pal[ch] || '#ff00ff');
        g.fillRect(Math.round(x + c * s), Math.round(y + r * s), s, s);
      }
    }
  }

  function heroPal(kind) {
    const blade = tier >= 6 ? '#bff4ff' : tier >= 3 ? '#ffe070' : '#d8dee8';
    if (kind === 'mage') return { h: '#e8e0f0', s: '#f2c39b', e: '#2a1a10', t: '#6a3aa8', b: '#3a2050', p: '#3a2050', o: '#2a1a30', c: '#6a3aa8', k: '#8a5a2a', n: '#4a2a8a' };
    if (kind === 'priest') return { h: '#f0d070', s: '#f2c39b', e: '#2a1a10', t: '#f0f0f0', b: '#d0a030', p: '#c8c8d8', o: '#6a5a4a', c: '#f0f0f0', k: '#f2c39b' };
    return {
      h: '#7a4a22', s: '#f2c39b', e: '#2a1a10',
      t: tier >= 4 ? '#c8ccd8' : '#3a6fd0',         // ランクが上がると鎧になる
      b: '#7a4a1c', p: '#3a2a50', o: '#5a3010',
      c: tier >= 2 ? (tier >= 7 ? '#f0c040' : '#c43a3a') : '#3a6fd0',   // マントは2つ目のランクから
      k: '#f2c39b', m: blade, w: '#ffffff', g: '#e0b040', a: 'rgba(255,255,255,.6)',
    };
  }

  function drawHero() {
    const x = HX(), base = ground() - 13;
    const fight = S.mode === 'fight' || S.mode === 'won';
    const bob = !fight && S.frame ? -1 : 0;
    const hurt = S.hurt > 0 && ((S.hurt / 55) | 0) % 2 === 0;
    const pal = heroPal('hero');
    // 仲間。話が進むと後ろに付いてくる
    if (chapter >= 1) {
      const mp = heroPal('mage');
      const mx = x - 13, mb = (!fight && !S.frame) ? -1 : 0;
      sprite(S.frame && !fight ? HERO.walkB : HERO.walkA, mp, mx, base + mb);
      sprite(MAGE_HAT, mp, mx, base + mb - 2);
      px(mx + 8, base + mb + 4, '#8a5a2a'); px(mx + 8, base + mb + 5, '#8a5a2a'); px(mx + 8, base + mb + 3, '#ff7aff');
    }
    if (chapter >= 1) {
      const pp = heroPal('priest');
      sprite(!S.frame || fight ? HERO.walkA : HERO.walkB, pp, x - 25, base + ((!fight && S.frame) ? -1 : 0));
    }
    // 女神の加護から先は勇者が光をまとう
    if (chapter >= 15) {
      const a = .25 + .15 * Math.sin(S.t / 200);
      g.fillStyle = 'rgba(255,240,170,' + a.toFixed(2) + ')';
      g.fillRect(x - 1, base - 1, 13, 15);
    }
    const body = fight ? HERO.walkA : (S.frame ? HERO.walkB : HERO.walkA);
    sprite(body, pal, x, base + bob, hurt);
    const sw = !fight ? SWORD.rest : S.atk === 1 ? SWORD.up : S.atk === 2 ? SWORD.slash : SWORD.rest;
    for (const [sx, sy, c] of sw) {
      if (c === 'a') { g.fillStyle = pal.a; g.fillRect(x + sx, base + bob + sy, 1, 1); }
      else px(x + sx, base + bob + sy, hurt ? '#ffffff' : pal[c]);
    }
  }

  function drawFoe() {
    const f = S.foe;
    if (!f) return;
    const m = f.m, sc = f.sc;
    let x = f.x + f.kb;
    if (f.lunge > 0) x -= Math.sin((1 - f.lunge / 260) * Math.PI) * 4;
    const hover = m.fly ? m.fly + Math.round(Math.sin(S.t / 180) * 1.5) : 0;
    const y = ground() - m.h * sc - hover * sc;
    if (m.fly) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(Math.round(x + 2 * sc), ground() - 1, (m.w - 4) * sc, 1); }
    sprite(m.frames[f.f], f.pal, x, y, f.flash > 0, sc);
    if (f.big) {
      // 大物の印
      const bx = Math.round(x + m.w * sc / 2), by = Math.round(y - 5);
      g.fillStyle = '#ff4040'; g.fillRect(bx, by, 1, 3); g.fillRect(bx, by + 4, 1, 1);
    }
  }

  function drawNum(n) {
    const s = String(n.v), a = 1 - n.t / 700;
    let x = Math.round(n.x - s.length * 2), y = Math.round(n.y - n.t / 70);
    g.globalAlpha = Math.max(0, a);
    for (const ch of s) {
      const d = DIGIT[+ch];
      for (let i = 0; i < 15; i++) if (d[i] === '1') {
        g.fillStyle = '#2a1a10'; g.fillRect(x + (i % 3) + 1, y + ((i / 3) | 0) + 1, 1, 1);
        g.fillStyle = '#ffe070'; g.fillRect(x + (i % 3), y + ((i / 3) | 0), 1, 1);
      }
      x += 4;
    }
    g.globalAlpha = 1;
  }

  // 遠くの山並み。決まった形を横に繰り返す
  function ridge(off, base, amp, period, col, seed) {
    g.fillStyle = col;
    for (let x = 0; x < W; x++) {
      const u = (x + off) / period;
      const h = Math.sin(u * 2.1 + seed) * .5 + Math.sin(u * 5.3 + seed * 2) * .3 + Math.sin(u * 11.7 + seed) * .2;
      const top = Math.round(base - amp * (h * .5 + .5));
      g.fillRect(x, top, 1, H - top);
    }
  }

  function drawBack() {
    const gy = ground();
    // 空。帯の境目は市松で混ぜる
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      g.fillStyle = mix(act.sky[0], act.sky[1], t);
      const y0 = Math.floor(gy * i / bands), y1 = Math.floor(gy * (i + 1) / bands);
      g.fillRect(0, y0, W, y1 - y0);
      if (i > 0) {
        g.fillStyle = mix(act.sky[0], act.sky[1], (i - 1) / (bands - 1));
        for (let x = (y0 & 1); x < W; x += 2) g.fillRect(x, y0, 1, 1);
      }
    }
    if (act.stars) {
      for (let i = 0; i < 24; i++) {
        const sx = (i * 37 + 11) % W, sy = (i * 13 + 3) % Math.max(4, gy - 12);
        if ((S.t / 300 + i) % 7 < 5) px(sx, sy, i % 3 ? '#ffffff' : '#ffe8a0');
      }
    }
    if (act.lava) {
      for (let i = 0; i < 10; i++) {
        const sx = ((i * 29 - S.scroll * .15) % W + W) % W;
        px(sx, (i * 7 + (S.t / 90 | 0)) % gy, '#ff9a40');
      }
    }
    // 雲
    g.fillStyle = act.cloud ? '#ffffff' : 'rgba(255,255,255,.75)';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 41 - S.scroll * .12) % (W + 30) + W + 30) % (W + 30) - 15;
      const cy = 4 + (i * 5) % 9;
      g.fillRect(Math.round(cx), cy, 9, 2); g.fillRect(Math.round(cx) + 2, cy - 1, 5, 1);
    }
    // 飛行船（第13話から）
    if (chapter >= 12 && S.ship > -50) {
      const sx = Math.round(S.ship), sy = 6 + Math.round(Math.sin(S.t / 600));
      g.fillStyle = '#7a4a2a'; g.fillRect(sx, sy, 12, 4);
      g.fillStyle = '#c8a050'; g.fillRect(sx + 1, sy - 3, 10, 3);
      g.fillStyle = '#fff4c0'; g.fillRect(sx + 3, sy + 1, 1, 1); g.fillRect(sx + 6, sy + 1, 1, 1);
    }
    ridge(S.scroll * .2, gy - 5, 10, 46, act.far, 1.3);
    ridge(S.scroll * .45, gy - 1, 6, 30, act.near, 4.1);
    // 地面
    g.fillStyle = act.top; g.fillRect(0, gy, W, 2);
    g.fillStyle = act.dirt; g.fillRect(0, gy + 2, W, H - gy - 2);
    g.fillStyle = mix(act.dirt, '#000000', .25);
    for (let x = 0; x < W + 8; x += 8) {
      const xx = Math.round(x - (S.scroll % 8));
      g.fillRect(xx, gy + 3, 2, 1); g.fillRect(xx + 4, gy + 5, 1, 1);
    }
    g.fillStyle = mix(act.top, '#ffffff', .3);
    for (let x = 0; x < W + 6; x += 6) g.fillRect(Math.round(x - (S.scroll % 6)), gy, 1, 1);
  }

  function draw() {
    if (!cv || !fit()) return;
    drawBack();
    drawFoe();
    drawHero();
    for (const b of S.bolts) { px(b.x, b.y, '#ffd040'); px(b.x - 1, b.y, '#ff8a20'); px(b.x - 2, b.y, 'rgba(255,120,40,.5)'); }
    for (const p of S.parts) {
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      if (p.coin) { px(p.x, p.y, (S.t / 60 | 0) % 2 ? '#fff4b0' : p.col); }
      else px(p.x, p.y, p.col);
    }
    g.globalAlpha = 1;
    for (const n of S.nums) drawNum(n);
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return 'rgb(' + r + ',' + gg + ',' + bl + ')';
  }

  return { attach, set, boss, step, draw, state: () => ({ mode: S.mode, kills: S.kills, foe: S.foe && S.foe.kind, big: S.foe && S.foe.big, chapter, tier, W, H }) };
})();

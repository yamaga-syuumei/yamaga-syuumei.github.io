// 勇者の横スクロール。購入パレットの右で、勇者の一行がドット絵で旅をして戦っている。
//
//  * 絵は sprites.js（_sprites.py が作る）。1文字1ドットの表を、色ごとに小さなキャンバスへ
//    一度だけ描いて取っておき、毎フレームはそれを貼るだけにする。
//  * 低解像度のキャンバスに描いて CSS で引き伸ばす（image-rendering: pixelated）。
//  * 景色と敵の顔ぶれは「勇者の歩み」の話数で変わる。仲間や飛行船も話が進むと加わる。
//  * 勇者の服・マント・剣の色は錬金術師のランクで良くなる。お店の品が勇者まで届いている、という見立て。
//  * 遊びには関わらない。眺めるだけの演出。
//
//  HERO.set({ chapter, tier })  … 話とランクを渡す
//  HERO.boss()                  … 次に出る敵を大物にする（便りで話が進んだとき）
//  HERO.time(t)                 … 一日のどこか（0 朝〜1 夜）。空の色と日の位置が変わる
//  HERO.step(dt) / HERO.draw()  … 毎フレーム
window.HERO = (function () {
  'use strict';

  const SP = window.SPRITES;
  const LET = SP ? SP.let : {};

  // 材質の色を差し替える。[明, 中, 暗]
  function recolor(map, mat, cols) {
    (LET[mat] || []).forEach((ch, i) => { if (cols[i]) map[ch] = cols[i]; });
    return map;
  }

  // 勇者の色。ランクで旅装 → 鎧、マントは紺 → 赤 → 金、剣は鋼 → 金 → 光
  function heroPal() {
    const m = {};
    if (tier >= 4) recolor(m, 'tunic', ['#f4f6ff', '#b8c0d8', '#6a7290']);
    if (tier < 2) recolor(m, 'cape', ['#6a8ad8', '#3a5aa8', '#1e2e68']);
    else if (tier >= 7) recolor(m, 'cape', ['#fff0a0', '#e8b030', '#8a5a10']);
    if (tier >= 6) recolor(m, 'blade', ['#ffffff', '#b8f4ff', '#58b8e8']);
    else if (tier >= 3) recolor(m, 'blade', ['#fff8c8', '#ffd860', '#b88a20']);
    return m;
  }

  // 敵の色違い
  const VARIANT = {
    slime: {}, slimeB: { slime: ['#b8dcff', '#4a8ae8', '#24408a'] }, slimeR: { slime: ['#ffc0b0', '#e05a4f', '#8a2222'] },
    bat: {}, batR: { batb: ['#ff9aa8', '#b83a4a', '#5a1424'], batw: ['#b84a5a', '#7a2434', '#3a0e18'] },
    skel: {}, skelD: { bone: ['#d8d0ff', '#9a8ac8', '#4a3a78'] },
    ghost: {}, ghostP: { ghost: ['#ffffff', '#e8c0ff', '#9a5ad8'] },
    dragon: {}, dragonV: { scale: ['#c8a0ff', '#7a4ac0', '#3a1e6a'], wingm: ['#9a7ae8', '#5a3aa8', '#2a1458'], belly: ['#ffe8ff', '#e0a8f0', '#9a5ab0'] },
  };

  // 話の区切りごとの景色と敵の顔ぶれ。from は第何話から（0始まり）。foe は [絵, 色違い]
  const ACTS = [
    { from: 0,  sky: ['#7fc4f0', '#d4f0ff'], far: '#7a9cc8', near: '#3f8a4a', top: '#5cc060', dirt: '#8a5a2e', foe: [['slime', 'slime'], ['bat', 'bat']] },
    { from: 3,  sky: ['#5fb0f0', '#e8f8ff'], far: '#86a8d0', near: '#2f7a6a', top: '#ead8a0', dirt: '#b8945a', foe: [['slime', 'slimeB'], ['bat', 'bat'], ['skel', 'skel']] },
    { from: 5,  sky: ['#f4a070', '#4a3a7a'], far: '#5a4a7a', near: '#3a3050', top: '#8a7a9a', dirt: '#4a3e5a', foe: [['skel', 'skel'], ['ghost', 'ghost'], ['bat', 'batR']] },
    { from: 9,  sky: ['#3a0a18', '#8a2a20'], far: '#2a0a10', near: '#1a0608', top: '#6a2a1a', dirt: '#2a1210', foe: [['skel', 'skelD'], ['slime', 'slimeR'], ['dragon', 'dragon']], lava: true },
    { from: 12, sky: ['#a8d4ff', '#f4faff'], far: '#e8f0ff', near: '#ffffff', top: '#f8fbff', dirt: '#dce8f8', foe: [['ghost', 'ghost'], ['bat', 'bat'], ['dragon', 'dragon']], cloud: true },
    { from: 15, sky: ['#120828', '#3a1a5a'], far: '#22123a', near: '#160c26', top: '#4a3a6a', dirt: '#221a38', foe: [['dragon', 'dragonV'], ['ghost', 'ghostP'], ['skel', 'skelD']], stars: true },
  ];

  // 敵ごとの足元の位置（絵の下から何ドット上が地面か）と、浮いている高さ
  const FOE = {
    slime:  { base: 1, fly: 0, hp: 2 },
    bat:    { base: 0, fly: 9, hp: 2 },
    skel:   { base: 2, fly: 0, hp: 3 },
    ghost:  { base: 0, fly: 4, hp: 3 },
    dragon: { base: 2, fly: 0, hp: 4 },
  };
  const BODY = 2;           // 人の絵は下に2段の余白がある

  // 3×5 の数字。ダメージに使う
  const DIGIT = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

  let cv = null, g = null, W = 150, H = 52, cssW = 0, cssH = 0;
  let chapter = 0, tier = 0, act = ACTS[0];
  const cache = new Map();
  const S = {
    scroll: 0, mode: 'walk', t: 0, walkT: 0, walkF: 0,
    foe: null, next: 1.2, kills: 0, bossNext: false,
    atk: -1, atkT: 0, hurt: 0, win: 0, nums: [], parts: [], bolts: [],
    cast: 0, castT: 900, pray: 0, prayT: 2600, ship: -60,
  };

  function attach(canvas) {
    cv = canvas;
    g = cv.getContext('2d');
  }

  // 低解像度のキャンバスを、見えている大きさに合わせて作り直す。1ドットは2画素以上
  function fit() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.width === cssW && r.height === cssH) return true;
    cssW = r.width; cssH = r.height;
    const scale = Math.max(2, Math.round(cssH / 52));
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

  // 一日のどこにいるか。0 が朝、1 が夜
  let tod = 0;
  function time(v) { tod = Math.max(0, Math.min(1, v)); }

  // 時間帯の空。夜明けから話の景色の空になり、夕焼けを経て夜になる。
  // 返すのは [上の色, 下の色]、どれだけ暗くするか、星を出すか
  const DAWN = ['#5a5aa0', '#ffb890'], DUSK = ['#4a3a88', '#ff8a5a'], NIGHT = ['#0a0c2a', '#262a5a'];
  function skyNow() {
    let col = null, w = 0, dark = 0;
    if (tod < .15) { col = DAWN; w = 1 - tod / .15; dark = .15 * w; }
    else if (tod < .7) { w = 0; }
    else if (tod < .88) { col = DUSK; w = (tod - .7) / .18; dark = .2 * w; }
    else { const k = (tod - .88) / .12; col = [mix(DUSK[0], NIGHT[0], k), mix(DUSK[1], NIGHT[1], k)]; w = 1; dark = .2 + .3 * k; }
    const sky = w ? [mix(act.sky[0], col[0], w), mix(act.sky[1], col[1], w)] : act.sky;
    return { sky, dark, stars: act.stars || tod > .86 };
  }

  const ground = () => H - 8;
  const HX = () => Math.round(W * .3);        // 勇者の絵の左端

  // ---------------------------------------------------------------- 絵の取り置き
  // rows（文字の表）を、色の差し替え map と白飛びの有無ごとに1枚のキャンバスにしておく
  function sheet(rows, map, key, flash) {
    const k = key + (flash ? '!' : '');
    let c = cache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const x = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      const line = rows[y];
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '.') continue;
        if (flash && ch !== '*' && ch !== '+') x.fillStyle = ch === 'K' ? '#ffffff' : '#fff6e8';
        else x.fillStyle = map[ch] || SP.pal[ch] || '#ff00ff';
        x.fillRect(i, y, 1, 1);
      }
    }
    cache.set(k, c);
    return c;
  }

  function blit(rows, map, key, x, y, flash, sc) {
    const c = sheet(rows, map, key, flash);
    const s = sc || 1;
    g.drawImage(c, Math.round(x), Math.round(y), c.width * s, c.height * s);
  }

  // ---------------------------------------------------------------- 動き
  function spawn() {
    const list = act.foe;
    const pick = list[(Math.random() * list.length) | 0];
    const kind = pick[0], frames = SP[kind];
    let big = S.bossNext || (S.kills > 0 && S.kills % 7 === 6);
    S.bossNext = false;
    // 2倍にして空からはみ出す敵は、等倍のまま光をまとった大物にする
    const sc = big && frames[0].length * 2 <= ground() - 2 ? 2 : 1;
    const map = {};
    const v = VARIANT[pick[1]] || {};
    for (const mat in v) recolor(map, mat, v[mat]);
    S.foe = { kind, var: pick[1], map, frames, x: W + 4, big, sc,
      hp: big ? 6 + Math.min(4, chapter >> 2) : FOE[kind].hp, flash: 0, kb: 0, f: 0, ft: 0, lunge: 0 };
  }

  function step(dt) {
    if (!cv || !SP) return;
    const k = dt / 1000;
    S.t += dt;
    if (S.hurt > 0) S.hurt -= dt;
    if (S.cast > 0) S.cast -= dt;
    if (S.pray > 0) S.pray -= dt;
    if (chapter >= 12) { S.ship += k * 7; if (S.ship > W + 40) S.ship = -60; }

    const f = S.foe;
    if (S.mode === 'walk') {
      S.scroll += k * 26;
      S.walkT += dt;
      if (S.walkT > 135) { S.walkT = 0; S.walkF = (S.walkF + 1) % 4; }
      if (!f) { S.next -= k; if (S.next <= 0) spawn(); }
      else {
        f.x -= k * (26 + 12);
        if (f.x - (HX() + 22) < 2) { S.mode = 'fight'; S.atk = -1; S.atkT = 160; }
      }
    } else if (S.mode === 'fight' && f) {
      // 振りかぶり → 斬る → 振り抜き → 戻る
      S.atkT -= dt;
      if (S.atkT <= 0) {
        S.atk = (S.atk + 1) % 5;
        S.atkT = [150, 110, 150, 170, 220][S.atk];
        if (S.atk === 1) hit(f, 1);
      }
      // 魔法使いが火の玉を撃つ
      if (chapter >= 1) {
        S.castT -= dt;
        if (S.castT <= 0) { S.castT = 1300; S.cast = 420; S.bolts.push({ x: HX() - 6, y: ground() - 23, tx: f.x + 4, t: 0 }); }
      }
      // 僧侶がときどき祈る
      if (chapter >= 1) {
        S.prayT -= dt;
        if (S.prayT <= 0) { S.prayT = 2600 + Math.random() * 1500; S.pray = 500; sparkle(HX() + 12, ground() - 14, 6); }
      }
      // ときどき体当たりしてくる
      if (f && f.lunge <= 0 && Math.random() < k * .3) f.lunge = 280;
      if (f && f.lunge > 0) {
        f.lunge -= dt;
        if (f.lunge < 140 && f.lunge + dt >= 140) S.hurt = 240;
      }
    } else if (S.mode === 'won') {
      S.win -= dt;
      if (S.win <= 0) { S.mode = 'walk'; S.next = .6 + Math.random() * 1.6; }
    }
    if (S.foe) {
      const e = S.foe;
      if (e.flash > 0) e.flash -= dt;
      e.kb = Math.max(0, e.kb - k * 20);
      e.ft += dt; if (e.ft > 150) { e.ft = 0; e.f = (e.f + 1) % e.frames.length; }
    }
    S.bolts = S.bolts.filter((b) => {
      b.t += dt;
      b.x += k * 110;
      if (S.foe && b.x >= b.tx) { hit(S.foe, 0); burst(b.x, b.y, '#ffb040', 5); return false; }
      return b.x < W + 4;
    });
    S.nums = S.nums.filter((n) => { n.t += dt; return n.t < 750; });
    S.parts = S.parts.filter((p) => {
      p.t += dt; p.x += p.vx * k; p.y += p.vy * k; p.vy += (p.float ? -10 : 70) * k;
      return p.t < p.life;
    });
  }

  // 当てた。sword が 1 なら剣、0 なら魔法（倒しきらない）
  function hit(f, sword) {
    const fr = f.frames[0];
    if (sword) f.hp--;
    f.flash = 110; f.kb = sword ? 3 : 1;
    const dmg = Math.round((sword ? 10 + Math.random() * 18 : 4 + Math.random() * 8) * (1 + tier * .35) * (f.big ? 1.4 : 1));
    S.nums.push({ v: dmg, x: f.x + fr[0].length * f.sc / 2, y: ground() - fr.length * f.sc - 4, t: 0, magic: !sword });
    burst(f.x + 3, ground() - 10, '#ffffff', sword ? 4 : 0);
    if (f.hp <= 0) {
      const cx = f.x + fr[0].length * f.sc / 2, cy = ground() - fr.length * f.sc / 2;
      const col = (VARIANT[f.var] && Object.values(VARIANT[f.var])[0]) ? Object.values(VARIANT[f.var])[0][1] : '#c8d8ff';
      burst(cx, cy, col, f.big ? 26 : 12);
      burst(cx, cy, '#ffffff', 8);
      for (let i = 0; i < (f.big ? 8 : 3); i++) {
        S.parts.push({ x: cx, y: cy, vx: (Math.random() - .5) * 50, vy: -50 - Math.random() * 40, t: 0, life: 1000, col: '#f0c040', coin: true });
      }
      S.foe = null; S.kills++;
      S.mode = 'won'; S.win = f.big ? 900 : 450;
    }
  }

  function burst(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = 20 + Math.random() * 50;
      S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: 0, life: 280 + Math.random() * 320, col });
    }
  }

  function sparkle(x, y, n) {
    for (let i = 0; i < n; i++) {
      S.parts.push({ x: x + (Math.random() - .5) * 14, y: y + (Math.random() - .5) * 16, vx: 0, vy: -6, t: 0, life: 600 + Math.random() * 300, col: '#fff8c0', float: true, star: true });
    }
  }

  // ---------------------------------------------------------------- 描く
  function px(x, y, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); }

  function drawParty() {
    const x = HX(), top = ground() - 28 + BODY;
    const walking = S.mode === 'walk';
    const wf = S.walkF;
    if (chapter >= 1) {
      // 僧侶と魔法使い。歩く足並みを少しずらす
      const pr = SP.priest;
      const pf = S.pray > 0 ? pr.cast[S.pray > 250 ? 0 : 1] : walking ? pr.walk[(wf + 1) % 4] : pr.idle[(S.t / 400 | 0) % 2];
      blit(pf, {}, 'priest' + (S.pray > 0 ? 'c' + (S.pray > 250 ? 0 : 1) : walking ? 'w' + ((wf + 1) % 4) : 'i' + ((S.t / 400 | 0) % 2)), x - 40, top);
      const mg = SP.mage;
      const mi = S.cast > 0 ? (S.cast > 250 ? 0 : 1) : -1;
      const mf = mi >= 0 ? mg.cast[mi] : walking ? mg.walk[(wf + 2) % 4] : mg.idle[(S.t / 450 | 0) % 2];
      blit(mf, {}, 'mage' + (mi >= 0 ? 'c' + mi : walking ? 'w' + ((wf + 2) % 4) : 'i' + ((S.t / 450 | 0) % 2)), x - 21, top);
    }
    // 女神の加護から先は勇者が光をまとう
    if (chapter >= 15) {
      const a = .18 + .1 * Math.sin(S.t / 220);
      const gr = g.createRadialGradient(x + 12, top + 14, 2, x + 12, top + 14, 18);
      gr.addColorStop(0, 'rgba(255,240,170,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = gr; g.fillRect(x - 8, top - 6, 40, 40);
    }
    const h = SP.hero;
    let rows, key;
    if (S.hurt > 0) { rows = h.hurt[0]; key = 'hurt'; }
    else if (S.mode === 'won') { rows = h.win[0]; key = 'win'; }
    else if (S.mode === 'fight' && S.atk >= 0 && S.atk < 4) { rows = h.attack[S.atk]; key = 'a' + S.atk; }
    else if (S.mode === 'fight') { rows = h.idle[(S.t / 420 | 0) % 2]; key = 'i' + ((S.t / 420 | 0) % 2); }
    else { rows = h.walk[wf]; key = 'w' + wf; }
    const flash = S.hurt > 0 && ((S.hurt / 60) | 0) % 2 === 0;
    blit(rows, heroPal(), 'hero' + tier + key, x - (S.hurt > 0 ? 2 : 0), top, flash);
  }

  function drawFoe() {
    const f = S.foe;
    if (!f) return;
    const fr = f.frames[f.f], sc = f.sc, info = FOE[f.kind];
    let x = f.x + f.kb;
    if (f.lunge > 0) x -= Math.sin((1 - f.lunge / 280) * Math.PI) * 5;
    const hover = info.fly ? info.fly + Math.round(Math.sin(S.t / 200) * 1.5) : 0;
    const y = ground() - (fr.length - info.base) * sc - hover;
    if (info.fly) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(Math.round(x + 4 * sc), ground() - 1, (fr[0].length - 8) * sc, 2); }
    if (f.big && sc === 1) {
      // 等倍の大物は赤い光をまとう
      const gr = g.createRadialGradient(x + fr[0].length / 2, y + fr.length / 2, 2, x + fr[0].length / 2, y + fr.length / 2, fr.length);
      gr.addColorStop(0, 'rgba(255,60,60,.35)'); gr.addColorStop(1, 'rgba(255,60,60,0)');
      g.fillStyle = gr; g.fillRect(x - fr.length, y - fr.length / 2, fr[0].length + fr.length * 2, fr.length * 2);
    }
    blit(fr, f.map, f.var + f.f, x, y, f.flash > 0, sc);
    if (f.big) {
      // 大物の印
      const bx = Math.round(x + fr[0].length * sc / 2), by = Math.round(y - 7);
      g.fillStyle = '#1c1226'; g.fillRect(bx - 1, by - 1, 3, 7);
      g.fillStyle = '#ff4040'; g.fillRect(bx, by, 1, 3); g.fillRect(bx, by + 4, 1, 1);
    }
  }

  function drawNum(n) {
    const s = String(n.v), a = 1 - n.t / 750;
    let x = Math.round(n.x - s.length * 2), y = Math.round(n.y - n.t / 60);
    g.globalAlpha = Math.max(0, a);
    for (const ch of s) {
      const d = DIGIT[+ch];
      for (let i = 0; i < 15; i++) if (d[i] === '1') {
        g.fillStyle = '#1c1226'; g.fillRect(x + (i % 3) + 1, y + ((i / 3) | 0) + 1, 1, 1);
        g.fillStyle = n.magic ? '#ffb87a' : '#ffe070'; g.fillRect(x + (i % 3), y + ((i / 3) | 0), 1, 1);
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

  // 日と月。日は左から昇って右へ沈み、その位置で一日の進み具合が分かる。夜は月
  function drawSunMoon(gy) {
    if (tod < .9) {
      const p = tod / .9;
      const x = Math.round(4 + p * (W - 8)), y = Math.round(gy - 6 - Math.sin(p * Math.PI) * (gy - 14));
      const late = Math.max(0, (tod - .65) / .25);
      g.fillStyle = 'rgba(255,230,150,.25)'; g.fillRect(x - 4, y - 2, 9, 5); g.fillRect(x - 2, y - 4, 5, 9);
      g.fillStyle = mix('#ffd050', '#ff7a3a', late); g.fillRect(x - 2, y - 1, 5, 3); g.fillRect(x - 1, y - 2, 3, 5);
      g.fillStyle = mix('#fff8d0', '#ffb070', late); g.fillRect(x - 1, y - 1, 3, 3);
    } else {
      const a = Math.min(1, (tod - .9) / .08);
      const x = W - 22, y = 8;
      g.globalAlpha = a;
      g.fillStyle = 'rgba(220,230,255,.2)'; g.fillRect(x - 4, y - 2, 9, 5); g.fillRect(x - 2, y - 4, 5, 9);
      g.fillStyle = '#f4f2d8'; g.fillRect(x - 2, y - 1, 5, 3); g.fillRect(x - 1, y - 2, 3, 5);
      g.fillStyle = mix(NIGHT[0], NIGHT[1], .3); g.fillRect(x + 1, y - 2, 2, 3); g.fillRect(x + 2, y - 1, 1, 3);
      g.globalAlpha = 1;
    }
  }

  function drawBack() {
    const gy = ground();
    const now = skyNow();
    // 空。帯の境目は市松で混ぜる
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      g.fillStyle = mix(now.sky[0], now.sky[1], t);
      const y0 = Math.floor(gy * i / bands), y1 = Math.floor(gy * (i + 1) / bands);
      g.fillRect(0, y0, W, y1 - y0);
      if (i > 0) {
        g.fillStyle = mix(now.sky[0], now.sky[1], (i - 1) / (bands - 1));
        for (let x = (y0 & 1); x < W; x += 2) g.fillRect(x, y0, 1, 1);
      }
    }
    if (now.stars) {
      for (let i = 0; i < 36; i++) {
        const sx = (i * 37 + 11) % W, sy = (i * 13 + 3) % Math.max(4, gy - 16);
        if ((S.t / 300 + i) % 7 < 5) px(sx, sy, i % 3 ? '#ffffff' : '#ffe8a0');
      }
    }
    if (act.lava) {
      for (let i = 0; i < 14; i++) {
        const sx = ((i * 29 - S.scroll * .15) % W + W) % W;
        px(sx, (i * 7 + (S.t / 90 | 0)) % gy, '#ff9a40');
      }
    }
    drawSunMoon(gy);
    // 雲
    for (let i = 0; i < 5; i++) {
      const cx = Math.round(((i * 47 - S.scroll * .12) % (W + 40) + W + 40) % (W + 40) - 20);
      const cy = 6 + (i * 7) % 12;
      g.fillStyle = act.cloud ? '#ffffff' : act.stars ? 'rgba(150,130,210,.35)' : 'rgba(255,255,255,.8)';   // 夜の雲は暗く
      g.fillRect(cx, cy, 14, 3); g.fillRect(cx + 3, cy - 2, 7, 2); g.fillRect(cx + 9, cy - 1, 4, 1);
      g.fillStyle = act.cloud ? '#dce8f8' : act.stars ? 'rgba(90,70,150,.35)' : 'rgba(200,220,240,.6)';
      g.fillRect(cx + 1, cy + 3, 12, 1);
    }
    // 飛行船（第13話から）
    if (chapter >= 12 && S.ship > -50) {
      const sx = Math.round(S.ship), sy = 8 + Math.round(Math.sin(S.t / 600));
      g.fillStyle = '#1c1226'; g.fillRect(sx - 1, sy - 6, 22, 12);
      g.fillStyle = '#d8b060'; g.fillRect(sx, sy - 5, 20, 5);
      g.fillStyle = '#f0d890'; g.fillRect(sx + 1, sy - 5, 18, 2);
      g.fillStyle = '#7a4a2a'; g.fillRect(sx + 4, sy + 1, 12, 4);
      g.fillStyle = '#fff4c0'; g.fillRect(sx + 6, sy + 2, 1, 1); g.fillRect(sx + 9, sy + 2, 1, 1); g.fillRect(sx + 12, sy + 2, 1, 1);
    }
    ridge(S.scroll * .2, gy - 9, 14, 60, act.far, 1.3);
    ridge(S.scroll * .45, gy - 2, 8, 38, act.near, 4.1);
    // 地面
    g.fillStyle = act.top; g.fillRect(0, gy, W, 2);
    g.fillStyle = act.dirt; g.fillRect(0, gy + 2, W, H - gy - 2);
    g.fillStyle = mix(act.dirt, '#000000', .25);
    for (let x = 0; x < W + 10; x += 10) {
      const xx = Math.round(x - (S.scroll % 10));
      g.fillRect(xx, gy + 3, 2, 1); g.fillRect(xx + 5, gy + 5, 1, 1); g.fillRect(xx + 7, gy + 3, 1, 1);
    }
    g.fillStyle = mix(act.top, '#ffffff', .3);
    for (let x = 0; x < W + 6; x += 6) g.fillRect(Math.round(x - (S.scroll % 6)), gy, 1, 1);
  }

  function draw() {
    if (!cv || !SP || !fit()) return;
    drawBack();
    drawFoe();
    drawParty();
    for (const b of S.bolts) {
      const fl = (b.t / 60 | 0) % 2;
      g.fillStyle = '#1c1226'; g.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 5, 5);
      g.fillStyle = fl ? '#ff8a20' : '#ffb040'; g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
      px(b.x, b.y, '#fff4c0');
      px(b.x - 3, b.y, 'rgba(255,140,40,.6)'); px(b.x - 5, b.y - 1 + fl, 'rgba(255,140,40,.35)');
    }
    for (const p of S.parts) {
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      if (p.coin) { px(p.x, p.y, (S.t / 60 | 0) % 2 ? '#fff4b0' : p.col); px(p.x + 1, p.y, p.col); }
      else if (p.star) { px(p.x, p.y, p.col); px(p.x - 1, p.y, 'rgba(255,248,192,.5)'); px(p.x + 1, p.y, 'rgba(255,248,192,.5)'); px(p.x, p.y - 1, 'rgba(255,248,192,.5)'); px(p.x, p.y + 1, 'rgba(255,248,192,.5)'); }
      else px(p.x, p.y, p.col);
    }
    g.globalAlpha = 1;
    // 朝夕と夜は景色ごと暗くする
    const dark = skyNow().dark;
    if (dark > 0) { g.fillStyle = 'rgba(10,8,48,' + dark.toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    for (const n of S.nums) drawNum(n);
  }

  // 色を混ぜる。#rrggbb で受けて #rrggbb で返す（混ぜた色をさらに混ぜられるように）
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | bl).toString(16).slice(1);
  }

  return { attach, set, boss, time, step, draw,
    state: () => ({ mode: S.mode, kills: S.kills, foe: S.foe && S.foe.kind, big: S.foe && S.foe.big, sc: S.foe && S.foe.sc, chapter, tier, W, H, cached: cache.size }) };
})();

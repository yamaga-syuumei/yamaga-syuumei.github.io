// 言葉狩り淫夢：本体
// 画面は4つ（タイトル・好きな文章・プレイ・結果）。プレイはコメントが右から左へ流れ（段に分かれて重ならない）、文字を撃って語録を取る。

(() => {
  const $ = id => document.getElementById(id);
  const screens = { title: $('scTitle'), free: $('scFree'), play: $('scPlay'), result: $('scResult') };

  // ---------------------------------------------------------------- 設定（この端末にだけ保存）

  const SKEY = 'kotobagari.settings', FKEY = 'kotobagari.free';
  const settings = { motion: 100, volume: Math.round(TUNE.volume * 100), speed: 'normal', mosaic: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) {}
  const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) {} };

  function applySettings() {
    Fx.setMotion(settings.motion / 100);
    Sound.setVolume(settings.volume / 100);
    document.body.classList.toggle('mosaic', settings.mosaic);
    $('optMotion').value = settings.motion; $('optMotionV').textContent = settings.motion + '%';
    $('optVolume').value = settings.volume; $('optVolumeV').textContent = settings.volume + '%';
    $('optMosaic').checked = settings.mosaic;
    for (const b of $('optSpeed').children) b.classList.toggle('on', b.dataset.v === settings.speed);
  }

  // ---------------------------------------------------------------- 文章 → 行

  // 「名前：本文」なら話者付き
  const SPEAKER = /^([^：:「」\s]{1,10})[：:](.+)$/;

  function splitSentences(text, max) {
    if (Array.from(text).length <= max) return [text];
    const parts = text.match(/[^。！？!?]*[。！？!?]+[」』]?|[^。！？!?]+$/g) || [text];
    const out = [];
    for (let p of parts) {
      p = p.trim();
      if (!p) continue;
      while (Array.from(p).length > max) {
        const cs = Array.from(p);
        let cut = cs.lastIndexOf('、', max);
        if (cut < max * 0.4) cut = max - 1;
        out.push(cs.slice(0, cut + 1).join(''));
        p = cs.slice(cut + 1).join('');
      }
      if (p) out.push(p);
    }
    return out;
  }

  function toLines(text) {
    const lines = [];
    for (let raw of text.replace(/\r/g, '').split('\n')) {
      raw = raw.trim();
      if (!raw) continue;
      const m = raw.match(SPEAKER);
      const who = m ? m[1] : '';
      const body = m ? m[2].trim() : raw;
      for (const s of splitSentences(body, TUNE.maxChars)) lines.push({ who, text: s });
    }
    return lines;
  }

  // 行ごとに的を探す。cover[i] は i 文字目を含む的の番号
  function prepare(text) {
    const lines = toLines(text);
    const targets = [];
    lines.forEach((ln, li) => {
      ln.chars = Array.from(ln.text);
      ln.cover = ln.chars.map(() => []);
      for (const h of Match.find(ln.chars)) {
        const id = targets.length;
        targets.push({ id, li, s: h.s, e: h.e, gi: h.gi, len: h.len, got: null });
        for (let i = h.s; i < h.e; i++) ln.cover[i].push(id);
      }
    });
    return { lines, targets };
  }

  // ---------------------------------------------------------------- タイトル

  function buildTitle() {
    const list = $('stageList');
    list.innerHTML = '';
    for (const st of STAGES) {
      const { targets } = prepare(st.text);
      const b = document.createElement('button');
      b.className = 'stage';
      b.innerHTML = `<span class="kind">${st.source ? '青空文庫' : '会話'}</span><b></b><span></span><em>語録 ${targets.length} 個</em>`;
      b.querySelector('b').textContent = st.title;
      b.querySelector('span:not(.kind)').textContent = st.source ? st.source : st.note;
      b.onclick = () => start({ title: st.title, text: st.text, source: st.source || '' });
      list.appendChild(b);
    }
    const f = document.createElement('button');
    f.className = 'stage free';
    f.innerHTML = '<span class="kind">自由</span><b>好きな文章で遊ぶ</b><span>貼り付けた文章がそのままステージになる</span>';
    f.onclick = openFree;
    list.appendChild(f);
  }

  function show(name) {
    for (const k in screens) screens[k].hidden = k !== name;
    $('aim').classList.toggle('on', false);
  }

  // ---------------------------------------------------------------- 好きな文章

  let freeTimer = 0;
  function openFree() {
    Sound.init();
    try { $('freeText').value = localStorage.getItem(FKEY) || ''; } catch (e) {}
    analyzeFree();
    show('free');
  }

  function analyzeFree() {
    const text = $('freeText').value;
    try { localStorage.setItem(FKEY, text); } catch (e) {}
    const { lines, targets } = prepare(text);
    const kinds = new Set(targets.map(t => t.gi)).size;
    $('freeCount').textContent = targets.length ? `語録 ${targets.length} 個（${kinds} 種）が潜んでいます` : '語録 0 個';
    $('freePlay').disabled = !targets.length;
    const pv = $('freePreview');
    pv.hidden = !$('freeShow').checked || !targets.length;
    if (!pv.hidden) {
      pv.innerHTML = '';
      lines.forEach(ln => {
        const p = document.createElement('div');
        if (ln.who) p.append(ln.who + '：');
        ln.chars.forEach((c, i) => {
          if (ln.cover[i].length) { const m = document.createElement('mark'); m.textContent = c; p.append(m); }
          else p.append(c);
        });
        pv.appendChild(p);
      });
    }
  }

  $('freeText').addEventListener('input', () => { clearTimeout(freeTimer); freeTimer = setTimeout(analyzeFree, 250); });
  $('freeShow').addEventListener('change', analyzeFree);
  $('freeBack').onclick = () => show('title');
  $('freePlay').onclick = () => start({ title: '好きな文章', text: $('freeText').value, source: '' });

  // ---------------------------------------------------------------- プレイ

  const field = $('field');
  let G = null;     // いま遊んでいるステージの状態
  let last = performance.now();

  function start(stage) {
    Sound.init();
    Fx.clear();
    const { lines, targets } = prepare(stage.text);
    // 話者ごとに色を分ける（4色をくり返す）
    const spk = {};
    let spkNext = 0;
    for (const ln of lines) {
      if (!ln.who) { ln.spk = -1; continue; }
      if (!(ln.who in spk)) spk[ln.who] = spkNext++ % 4;
      ln.spk = spk[ln.who];
    }
    G = {
      stage, lines, targets, next: 0, comments: [], lanes: [], spawnWait: 0, exited: 0,
      score: 0, combo: 0, maxCombo: 0, misses: 0, callIdx: -1,
      e: 0, tier: 0, hitstop: 0, windup: false, running: false, paused: false, ended: false,
    };
    field.innerHTML = '';
    $('hudScore').textContent = '0';
    $('hudGot').textContent = '0';
    $('hudAll').textContent = targets.length;
    $('hudProg').style.width = '0';
    $('combo').hidden = true;
    show('play');
    Fx.setTier(0, 0);
    Sound.setIntensity(0, 0);
    countdown();
  }

  async function countdown() {
    const g = G;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const n of ['3', '2', '1']) {
      if (G !== g) return;
      Fx.popBanner(n, 'big'); Sound.beep(false);
      await wait(550);
    }
    if (G !== g) return;
    Fx.popBanner(LINES.ready); Sound.beep(true);
    Sound.startBgm();
    g.running = true;
  }

  function makeComment(ln, li) {
    const d = document.createElement('div');
    d.className = 'cmt' + (ln.spk >= 0 ? ' spk-' + ln.spk : ' narr');
    if (ln.who) { const w = document.createElement('b'); w.className = 'who'; w.textContent = ln.who; d.appendChild(w); }
    ln.chars.forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'ch'; s.textContent = c; s.dataset.i = i;
      d.appendChild(s);
    });
    d.dataset.li = li;
    field.appendChild(d);
    const c = { el: d, li, x: field.clientWidth, w: d.offsetWidth, h: d.offsetHeight, born: performance.now() };
    d.style.transform = `translateX(${c.x}px)`;
    ln.cmt = c;
    return c;
  }

  // 空いている段を選ぶ。前のコメントの後ろが右端から laneGap 以上離れていれば空き
  function freeLane(W) {
    const free = [];
    G.lanes.forEach((c, k) => { if (!c || c.x + c.w + TUNE.laneGap <= W) free.push(k); });
    return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
  }

  function stepWorld(dt) {
    const W = field.clientWidth, H = field.clientHeight;
    const time = TUNE.flowTime / TUNE.speeds[settings.speed];
    for (const c of G.comments) {
      c.x -= (W + c.w) / time * dt;
      c.el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y}px)`;
    }
    // 左へ抜けたコメント
    for (let k = G.comments.length - 1; k >= 0; k--) {
      const c = G.comments[k];
      if (c.x + c.w >= 0) continue;
      c.el.remove();
      G.comments.splice(k, 1);
      G.lines[c.li].gone = true;
      G.exited++;
    }
    // 次のコメント
    G.spawnWait -= dt;
    if (G.next < G.lines.length && G.spawnWait <= 0) {
      const c = makeComment(G.lines[G.next], G.next);
      if (!G.lanes.length) {
        const n = Math.max(3, Math.floor(H / c.h));
        G.lanes = new Array(n).fill(null);
        G.laneH = H / n;
      }
      const lane = freeLane(W);
      if (lane < 0) {
        c.el.remove();
      } else {
        c.y = Math.round(lane * G.laneH + (G.laneH - c.h) / 2);
        c.el.style.transform = `translate(${c.x}px,${c.y}px)`;
        G.lanes[lane] = c;
        G.comments.push(c);
        G.next++;
        G.spawnWait = TUNE.spawnEvery / TUNE.speeds[settings.speed];
      }
    }
    $('hudProg').style.width = (G.exited / G.lines.length * 100).toFixed(1) + '%';
    if (G.exited >= G.lines.length && !G.ended) {
      G.ended = true;
      Fx.popBanner(LINES.finish);
      setTimeout(finish, 1300);
    }
  }

  // ---------------------------------------------------------------- 演出の強さ

  function stepIntensity(dt) {
    const prog = G.exited / Math.max(1, G.lines.length);
    const target = TUNE.comboWeight * Math.min(1, G.combo / TUNE.comboFull) + TUNE.progressWeight * prog;
    if (target > G.e) G.e += (target - G.e) * Math.min(1, TUNE.eRise * dt);
    else G.e = Math.max(target, G.e - TUNE.eFall * dt);
    let t = 0;
    for (const th of TUNE.tiers) if (G.e > th) t++;
    if (t > G.tier) {
      Sound.tierUp(t);
      Fx.popBanner(TIER_CALLS[t] || '');
      Fx.flash(0.35, t >= 4 ? '#ffd23f' : '#ff3d8b');
      if (t >= 3) Fx.confetti(60);
    }
    G.tier = t;
    Fx.setTier(t, G.e);
    Sound.setIntensity(G.e, t);
    const cb = $('combo');
    cb.style.setProperty('--s', (1 + t * 0.12).toFixed(2));
    cb.classList.toggle('t3', t >= 3);
  }

  // ---------------------------------------------------------------- 撃つ

  function scoreOf(tg, kind, cmt) {
    const rate = kind === 'double' ? TUNE.doubleRate : kind === 'head' ? TUNE.headRate : 1;
    const mult = Math.min(TUNE.comboMaxRate, 1 + G.combo * TUNE.comboStep);
    const age = (performance.now() - cmt.born) / 1000;
    const quick = 1 + TUNE.quickRate * Math.max(0, 1 - age / TUNE.quickTime);
    return Math.round(tg.len * TUNE.perChar * rate * mult * quick);
  }

  function charsOf(tg) {
    const b = G.lines[tg.li].cmt;
    return b ? Array.from(b.el.querySelectorAll('.ch')).slice(tg.s, tg.e) : [];
  }

  function shoot(ev) {
    if (!G || !G.running || G.paused || G.windup) return;
    Sound.shot();
    const aim = $('aim'); aim.classList.remove('fire'); void aim.offsetWidth; aim.classList.add('fire');
    const x = ev.clientX, y = ev.clientY;
    const ch = document.elementFromPoint(x, y)?.closest?.('.ch');
    const cmtEl = ch && ch.closest('.cmt');
    if (!ch || !cmtEl) return missShot(x, y);
    const ln = G.lines[+cmtEl.dataset.li], i = +ch.dataset.i;
    const all = ln.cover[i];
    const open = all.filter(id => !G.targets[id].got);
    if (!open.length) {
      if (all.length) { Fx.popScore(x, y, LINES.already, 'miss'); return; }
      return missShot(x, y);
    }
    if (open.length >= 2) return doubleShot(open, x, y, ln.cmt);
    const tg = G.targets[open[0]];
    take([tg], i === tg.s ? 'head' : 'body', x, y, ln.cmt);
  }

  function missShot(x, y) {
    G.misses++;
    Fx.burst(x, y, 'miss');
    Fx.popScore(x, y, LINES.miss, 'miss');
    Fx.shake(TUNE.shake.miss);
    Sound.miss();
    if (G.combo >= 3) {
      Sound.comboBreak();
      Fx.popBanner(LINES.comboBreak, 'quiet');
    }
    G.combo = 0;
    G.callIdx = -1;
    $('combo').hidden = true;
  }

  // ダブルショット：溜め（周りを暗くして重なりだけ光らせる）→ 爆発
  function doubleShot(ids, x, y, cmt) {
    const tgs = ids.map(id => G.targets[id]);
    G.windup = true;
    field.classList.add('dim');
    cmt.el.classList.add('has-charge');
    tgs.forEach(tg => charsOf(tg).forEach(c => c.classList.add('charge')));
    Sound.windup(TUNE.doubleWindup);
    setTimeout(() => {
      field.classList.remove('dim');
      cmt.el.classList.remove('has-charge');
      tgs.forEach(tg => charsOf(tg).forEach(c => c.classList.remove('charge')));
      G.windup = false;
      take(tgs, 'double', x, y, cmt);
    }, TUNE.doubleWindup * 1000);
  }

  function take(tgs, kind, x, y, cmt) {
    let pts = 0;
    for (const tg of tgs) {
      pts += scoreOf(tg, kind, cmt);
      tg.got = kind;
      charsOf(tg).forEach(c => c.classList.add('g-' + kind));
      G.combo++;
    }
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    G.score += pts;
    G.hitstop = TUNE.hitstop[kind];

    const words = tgs.map(tg => GOROKU[tg.gi][0]);
    Fx.popWord(words.join(' × '), kind);
    Fx.popScore(x, y - 20, '+' + pts, kind);
    Fx.burst(x, y, kind);
    Fx.shake(TUNE.shake[kind] * (1 + G.tier * 0.25));
    if (kind === 'double') { Fx.flash(0.85); Fx.confetti(80); }
    else if (kind === 'head') Fx.flash(0.25, '#ff3b30');
    else if (G.tier >= 2) Fx.flash(0.08);
    Sound.hit(kind, G.combo);

    $('hudScore').textContent = G.score.toLocaleString();
    $('hudGot').textContent = G.targets.filter(t => t.got).length;
    const cb = $('combo');
    if (G.combo >= 2) {
      cb.hidden = false;
      $('comboNum').textContent = G.combo;
      cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump');
    }
    // 連鎖の掛け声
    let ci = -1;
    COMBO_CALLS.forEach(([n], k) => { if (G.combo >= n) ci = k; });
    if (ci > G.callIdx) {
      G.callIdx = ci;
      setTimeout(() => G && Fx.popBanner(COMBO_CALLS[ci][1], ci >= 4 ? 'big' : ''), kind === 'double' ? 700 : 350);
      if (ci >= 6) Sound.cheer(1.2);
    }
  }

  // ---------------------------------------------------------------- 結果

  function finish() {
    if (!G) return;
    const g = G;
    g.running = false;
    Sound.stopBgm();
    const all = g.targets.length;
    const got = g.targets.filter(t => t.got);
    const head = got.filter(t => t.got === 'head').length;
    const dbl = got.filter(t => t.got === 'double').length;
    const ratio = all ? got.length / all : 0;
    let rank = 0;
    TUNE.rankBorders.forEach((b, k) => { if (ratio >= b) rank = k; });
    const perfect = all && got.length === all && got.every(t => t.got !== 'body');
    if (perfect) rank = RANKS.length - 1;

    $('resStage').textContent = g.stage.title;
    $('resAll').textContent = all;
    $('resSource').textContent = g.stage.source ? '出典：' + g.stage.source : '';
    const missed = [...new Set(g.targets.filter(t => !t.got).map(t => GOROKU[t.gi][0]))];
    $('resMissedBox').hidden = !missed.length;
    $('resMissed').innerHTML = '';
    for (const w of missed) { const s = document.createElement('span'); s.textContent = w; $('resMissed').appendChild(s); }
    const rk = $('resRank');
    rk.textContent = ''; rk.className = 'res-rank';
    show('result');
    Fx.setTier(Math.min(4, rank), rank / (RANKS.length - 1));

    // 数字を順に打ち込む
    const nums = [['resScore', g.score], ['resGot', got.length], ['resHead', head], ['resDouble', dbl], ['resCombo', g.maxCombo], ['resMiss', g.misses]];
    nums.forEach(([id]) => { $(id).textContent = '0'; });
    nums.forEach(([id, v], k) => {
      setTimeout(() => {
        const t0 = performance.now(), dur = 500;
        const run = () => {
          const p = Math.min(1, (performance.now() - t0) / dur);
          $(id).textContent = Math.round(v * (1 - Math.pow(1 - p, 3))).toLocaleString();
          if (p < 1) requestAnimationFrame(run);
        };
        run();
        Sound.beep(false);
      }, 200 + k * 160);
    });
    setTimeout(() => {
      rk.textContent = RANKS[rank];
      rk.classList.add('stamp');
      if (rank === RANKS.length - 1) rk.classList.add('top');
      Fx.shake(14);
      Fx.flash(0.6);
      Sound.jingle(rank, RANKS.length - 1);
      if (perfect) Fx.popBanner(LINES.perfect, 'big');
      if (rank >= RANKS.length - 3) {
        const { W, H } = Fx.size();
        for (let i = 0; i < 6 + rank; i++) {
          setTimeout(() => { Fx.firework(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.4)); Sound.pop(); }, i * 260);
        }
        Fx.confetti(140);
      }
    }, 200 + nums.length * 160 + 300);
  }

  $('resRetry').onclick = () => G && start(G.stage);
  $('resBack').onclick = toTitle;
  $('quit').onclick = toTitle;

  function toTitle() {
    Sound.stopBgm();
    G = null;
    Fx.clear();
    Fx.setTier(0, 0);
    show('title');
  }

  // ---------------------------------------------------------------- 入力

  field.addEventListener('pointerdown', ev => { ev.preventDefault(); shoot(ev); });
  addEventListener('pointermove', ev => {
    const aim = $('aim');
    const on = !screens.play.hidden && ev.target.closest && ev.target.closest('.field');
    aim.classList.toggle('on', !!on);
    if (on) { aim.style.left = ev.clientX + 'px'; aim.style.top = ev.clientY + 'px'; }
  });

  // ---------------------------------------------------------------- 設定

  $('gear').onclick = () => { $('opt').hidden = false; if (G) G.paused = true; };
  $('optClose').onclick = () => { $('opt').hidden = true; if (G) G.paused = false; last = performance.now(); };
  $('opt').addEventListener('pointerdown', ev => { if (ev.target === $('opt')) $('optClose').onclick(); });
  $('optMotion').oninput = e => { settings.motion = +e.target.value; applySettings(); saveSettings(); };
  $('optVolume').oninput = e => { settings.volume = +e.target.value; applySettings(); saveSettings(); };
  $('optMosaic').onchange = e => { settings.mosaic = e.target.checked; applySettings(); saveSettings(); };
  for (const b of $('optSpeed').children) b.onclick = () => { settings.speed = b.dataset.v; applySettings(); saveSettings(); };

  // ---------------------------------------------------------------- ループ

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let frozen = false;
    if (G && G.running && !G.paused) {
      if (G.hitstop > 0) { G.hitstop -= dt; frozen = true; }
      else if (G.windup) frozen = true;
      else stepWorld(dt);
      stepIntensity(dt);
    }
    Fx.update(dt, frozen || (G && G.paused));
    requestAnimationFrame(loop);
  }

  Fx.init({ bg: $('bg'), fx: $('fx'), shake: $('shake'), flash: $('flash'), pop: $('pop') });
  applySettings();
  buildTitle();
  show('title');
  requestAnimationFrame(loop);
})();

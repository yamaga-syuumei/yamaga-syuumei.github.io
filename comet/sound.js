/* ==========================================================
   音（効果音・走行音・BGM）

   効果音と走行音は合成音。音源ファイルは持たない。play(key) と trail(0..1)。
   BGM だけ bgm/ にファイルを置き、下の BGM_FILES に名前を書く。
   '' のままのキーはエラーにならず、そこだけ無音で遊べる。
   空のキーを指定したときは、いま鳴っている曲をそのまま流し続ける。
   ここで止めると、曲を1つ足すまで場面が静まり返るため。

   ブラウザは利用者が触るより前に音を鳴らすことを禁じているので、
   最初のクリックかタップ（boot）まで再生を試みない。

   出どころ（素材提供者）は CREDITS に書く。設定パネルにそのまま出る。
   ========================================================== */

const Snd = (() => {
  /* ---------- BGM ---------- */
  const BGM_FILES = {
    title: '',   // タイトル画面。裏でデモが飛んでいる
    field: '',   // 宙域。隕石を砕いて育てている間
    boss:  '',   // 惑星が現れてから倒すまで
    burn:  '',   // 燃焼中。空なら現行のまま
    clear: '',   // 1周クリア。空なら field のまま
    over:  '',   // ゲームオーバー
  };

  /* ---------- 素材の出どころ ----------
     もらったらここに足す。設定パネルにそのまま出る。
     例： { what: 'BGM', who: '〇〇工房', url: 'https://example.com' } */
  const CREDITS = [
    { what: 'BGM', who: '魔王魂', url: 'https://maou.audio/' }
  ];

  /* ---------- ここから下は素材が決まっても触らなくていい ---------- */

  // 合成音の鳴りは vol.se が既定の 0.7 のときに master が 0.55 になるよう合わせてある
  const SYNTH = 0.786;
  const vol = { se: 0.7, bgm: 0.4 };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  try {
    const saved = JSON.parse(localStorage.getItem('cs_vol') || 'null');
    if (saved) {
      if (typeof saved.se === 'number') vol.se = clamp01(saved.se);
      if (typeof saved.bgm === 'number') vol.bgm = clamp01(saved.bgm);
    }
  } catch (e) { /* 読めなくても既定値で動く */ }

  function save() {
    try { localStorage.setItem('cs_vol', JSON.stringify(vol)); } catch (e) {}
  }

  let ac = null, master = null;
  let trailGain = null, trailFilt = null;
  let unlocked = false, wantBgm = null, curBgm = null;
  const bgmEls = {};

  function boot() {
    unlock();
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = vol.se * SYNTH;
    master.connect(ac.destination);

    // 彗星の走行音。速度でローパスの開き具合と音量が動く。
    // 素材は白色ノイズにする。先に低域へ寄せた音を帯域通過に入れると、
    // 素材に無い帯域を切り出すことになり、フィルタの共振＝笛の音になる。
    const n = ac.createBufferSource();
    const len = ac.sampleRate * 4;          // 長めに取ってループの周期を目立たせない
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.7;
    // 継ぎ目を滑らかにする
    const fade = 2000;
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[len - fade + i] * (1 - k);
    }
    n.buffer = buf; n.loop = true;

    trailFilt = ac.createBiquadFilter();
    trailFilt.type = 'lowpass';             // 共振させない。開くほど「シャー」に近づく
    trailFilt.frequency.value = 200;
    trailFilt.Q.value = 0.0001;

    // 耳に刺さる高域を落とす
    const tilt = ac.createBiquadFilter();
    tilt.type = 'highshelf'; tilt.frequency.value = 2000; tilt.gain.value = -12;

    trailGain = ac.createGain(); trailGain.gain.value = 0;
    n.connect(trailFilt); trailFilt.connect(tilt); tilt.connect(trailGain);
    trailGain.connect(master);
    n.start();
  }

  function env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(type, f0, f1, a, d, peak, when) {
    if (!ac || vol.se <= 0) return;
    const t0 = ac.currentTime + (when || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + a + d);
    env(g, t0, a, d, peak);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }

  function noise(f, q, a, d, peak, when) {
    if (!ac || vol.se <= 0) return;
    const t0 = ac.currentTime + (when || 0);
    const len = Math.ceil(ac.sampleRate * (a + d + 0.05));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const dd = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f, t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, f * 0.35), t0 + a + d);
    bp.Q.value = q;
    const g = ac.createGain(); env(g, t0, a, d, peak);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + a + d + 0.05);
  }

  // pick は連鎖でピッチが上がる。700ms 空くとリセット
  let pickN = 0, pickT = 0;

  const SFX = {
    break:  () => { noise(1400, 1.1, 0.004, 0.16, 0.5); tone('triangle', 420, 90, 0.004, 0.16, 0.22); },
    crack:  () => { noise(2600, 4.0, 0.002, 0.07, 0.35); },
    bounce: () => { noise(240, 2.2, 0.004, 0.11, 0.30); tone('sine', 150, 80, 0.006, 0.12, 0.18); },
    hurt:   () => { tone('sawtooth', 220, 55, 0.006, 0.34, 0.30); noise(500, 0.8, 0.004, 0.24, 0.30); },
    pick:   () => {
      const now = performance.now();
      if (now - pickT > 700) pickN = 0;
      pickT = now; pickN = Math.min(pickN + 1, 14);
      const f = 640 * Math.pow(1.0595, pickN * 2);
      tone('sine', f, f * 1.5, 0.003, 0.07, 0.16);
    },
    level:  () => { [0, .07, .14].forEach((w, i) => tone('triangle', 520 * Math.pow(1.26, i), 520 * Math.pow(1.26, i), 0.01, 0.16, 0.20, w)); },
    warn:   () => { tone('sine', 1500, 1500, 0.01, 0.10, 0.10); tone('sine', 1500, 1500, 0.01, 0.10, 0.10, 0.14); },
    ignite: () => { noise(900, 0.6, 0.02, 0.5, 0.5); tone('sawtooth', 180, 900, 0.03, 0.4, 0.22); },
    burnout:() => { tone('sine', 900, 200, 0.01, 0.35, 0.16); },
    weak:   () => { noise(1800, 1.4, 0.003, 0.2, 0.55); tone('square', 700, 180, 0.004, 0.22, 0.24); },
    shield: () => { tone('square', 1200, 900, 0.002, 0.09, 0.18); noise(3000, 6, 0.002, 0.06, 0.22); },
    bossin: () => { [0, .12, .24].forEach((w, i) => tone('sawtooth', 120 * Math.pow(0.84, i), 100, 0.03, 0.5, 0.26, w)); },
    rage:   () => { tone('sawtooth', 90, 260, 0.05, 0.45, 0.30); },
    down:   () => { [0, .1, .2, .34].forEach((w, i) => tone('triangle', 300 * Math.pow(1.33, i), 300 * Math.pow(1.33, i), 0.01, 0.35, 0.24, w)); noise(700, 0.7, 0.02, 0.9, 0.4); },
    over:   () => { [0, .18, .38].forEach((w, i) => tone('sine', 330 * Math.pow(0.76, i), 200 * Math.pow(0.76, i), 0.02, 0.5, 0.22, w)); },
    ui:     () => { tone('sine', 880, 880, 0.003, 0.05, 0.12); },
  };

  function play(k) { boot(); const f = SFX[k]; if (f && vol.se > 0) f(); }

  // 走行音。0..1 の速度で音量とローパスの開き具合を動かす。
  // TRAIL_VOL を 0 にすると鳴らない。
  const TRAIL_VOL = 0.085;
  const TRAIL_FROM = 0.35;                  // これ未満の速度では鳴らさない
  function trail(sp) {
    if (!ac || !trailGain) return;
    const k = Math.max(0, (sp - TRAIL_FROM) / (1 - TRAIL_FROM));
    // master が vol.se で下がるので、ここでは 0 にするかどうかだけ見る
    const g = vol.se <= 0 ? 0 : k * k * TRAIL_VOL;
    trailGain.gain.setTargetAtTime(g, ac.currentTime, 0.12);
    trailFilt.frequency.setTargetAtTime(260 + k * 900, ac.currentTime, 0.12);
  }

  /* ---------- BGM ---------- */
  function fade(el, to, ms, stopAtEnd) {
    const from = el.volume, t0 = Date.now();
    (function stepFade() {
      const t = Math.min(1, (Date.now() - t0) / ms);
      el.volume = clamp01(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(stepFade);
      else if (stopAtEnd) { try { el.pause(); } catch (e) {} }
    })();
  }

  // name を null にすると止める。素材が無いキーは、いまの曲をそのまま続ける
  function bgm(name) {
    if (!unlocked) { wantBgm = name; return; }
    if (name === curBgm) return;
    if (name && !BGM_FILES[name]) return;
    const prev = curBgm ? bgmEls[curBgm] : null;
    if (prev) fade(prev, 0, 500, true);
    curBgm = name;
    if (!name) return;
    if (!bgmEls[name]) {
      const a = new Audio(BGM_FILES[name]);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      bgmEls[name] = a;
    }
    const el = bgmEls[name];
    try {
      const pr = el.play();
      if (pr && pr.catch) pr.catch(() => {});
      fade(el, vol.bgm, 700, false);
    } catch (e) {}
  }

  /* 最初の操作で解錠する。ここまでは一切鳴らさない。

     解錠したその操作が、同じ拍で場面も変えることがある（タイトルの「はじめる」）。
     控えていた曲をその場で鳴らすと、0.5秒だけ顔を出してフェードアウトし、
     曲ではなく雑音として聞こえる。1拍おいて、次の曲がもう指定されていたら譲る。 */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (wantBgm === null) return;
    const w = wantBgm;
    wantBgm = null; curBgm = null;
    setTimeout(() => { if (!curBgm) bgm(w); }, 0);
  }

  /* ---------- 音量 ---------- */
  function setVol(kind, v) {
    vol[kind] = clamp01(v);
    if (kind === 'se' && master) master.gain.setTargetAtTime(vol.se * SYNTH, ac.currentTime, 0.05);
    if (kind === 'bgm' && curBgm && bgmEls[curBgm]) bgmEls[curBgm].volume = vol.bgm;
    save();
  }

  function isMuted() { return vol.se <= 0 && vol.bgm <= 0; }

  // ミュートを解いたときに戻す音量
  const last = { se: vol.se || 0.7, bgm: vol.bgm || 0.4 };

  function setMute(m) {
    if (m) { last.se = vol.se; last.bgm = vol.bgm; setVol('se', 0); setVol('bgm', 0); }
    else { setVol('se', last.se || 0.7); setVol('bgm', last.bgm || 0.4); }
  }

  // BGM の素材が1つでも入っているか（設定パネルの出し分けに使う）
  function ready() { for (const k in BGM_FILES) if (BGM_FILES[k]) return true; return false; }

  return {
    boot, play, trail, bgm, unlock,
    setVol, setMute, isMuted, ready,
    vol: () => ({ se: vol.se, bgm: vol.bgm }),
    credits: () => CREDITS.slice(),
  };
})();

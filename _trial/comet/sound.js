// 合成音。音源ファイルは持たない。play(key) と trail(0..1) で鳴らす。

const Snd = (() => {
  let ac = null, master = null, muted = false;
  let trailGain = null, trailFilt = null;

  function boot() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(ac.destination);

    // 彗星の走行音。速度で音量とフィルタが動く
    const n = ac.createBufferSource();
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;       // 低域寄りのノイズ
      d[i] = last * 6;
    }
    n.buffer = buf; n.loop = true;
    trailFilt = ac.createBiquadFilter();
    trailFilt.type = 'bandpass'; trailFilt.frequency.value = 340; trailFilt.Q.value = 0.8;
    trailGain = ac.createGain(); trailGain.gain.value = 0;
    n.connect(trailFilt); trailFilt.connect(trailGain); trailGain.connect(master);
    n.start();
  }

  function env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(type, f0, f1, a, d, peak, when) {
    if (!ac || muted) return;
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
    if (!ac || muted) return;
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

  function play(k) { boot(); const f = SFX[k]; if (f && !muted) f(); }

  // 走行音。0..1 の速度で音量とピッチを動かす
  function trail(sp) {
    if (!ac || !trailGain) return;
    const g = muted ? 0 : Math.min(0.30, sp * sp * 0.34);
    trailGain.gain.setTargetAtTime(g, ac.currentTime, 0.08);
    trailFilt.frequency.setTargetAtTime(240 + sp * 900, ac.currentTime, 0.08);
  }

  function setMute(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ac.currentTime, 0.05);
  }
  function isMuted() { return muted; }

  return { boot, play, trail, setMute, isMuted };
})();

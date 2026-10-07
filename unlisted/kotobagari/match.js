// 文章と語録辞書の照らし合わせ。
// 表記をそろえた文字列の上で探し、見つかった位置を元の文字の番号に戻す。

const Match = (() => {
  const SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゎ': 'わ' };
  const BREAK = new Set(Array.from('。．\n「」『』'));
  const DROP = new Set(Array.from(' 　、，,.・…‥!?！？（）()［］[]【】〈〉《》"\'“”‘’↑↓＾^―－-:：;；/／\r\t†'));
  const WAVE = new Set(Array.from('〜～~'));

  function normChar(c) {
    let out = '';
    for (let ch of c.normalize('NFKC').toLowerCase()) {
      const o = ch.codePointAt(0);
      if (o >= 0x30A1 && o <= 0x30F6) ch = String.fromCodePoint(o - 0x60);
      if (SMALL[ch]) ch = SMALL[ch];
      if (WAVE.has(ch)) ch = 'ー';
      if (BREAK.has(ch)) ch = '|';
      else if (DROP.has(ch)) continue;
      out += ch;
    }
    return out;
  }

  // chars: 元の文字の配列（Array.from 済み）
  // 戻り値: { s: そろえた文字列, map: そろえた文字列の位置 → 元の文字の番号 }
  function normalize(chars) {
    let s = '';
    const map = [];
    chars.forEach((c, i) => {
      for (const ch of normChar(c)) {
        if (ch === 'ー' && s.endsWith('ー')) continue;
        s += ch;
        map.push(i);
      }
    });
    return { s, map };
  }

  let forms = null;
  function prepared() {
    if (forms) return forms;
    forms = [];
    GOROKU.forEach(([, fs], gi) => {
      for (const f of fs) {
        const n = normalize(Array.from(f)).s;
        if (n) forms.push({ gi, n, len: n.length });
      }
    });
    return forms;
  }

  // 1行ぶんの文字から的を探す。
  // 戻り値: [{ s, e, gi, len }]  s〜e-1 が元の文字の番号、gi は GOROKU の番号、len はそろえた長さ
  function find(chars) {
    const { s, map } = normalize(chars);
    const hits = [];
    for (const f of prepared()) {
      let k = s.indexOf(f.n);
      while (k >= 0) {
        hits.push({ s: map[k], e: map[k + f.len - 1] + 1, gi: f.gi, len: f.len });
        k = s.indexOf(f.n, k + 1);
      }
    }
    // 同じ語録どうしが重なったら長いほうだけ残す。別の語録どうしは両方残す
    hits.sort((a, b) => a.gi - b.gi || (b.e - b.s) - (a.e - a.s) || a.s - b.s);
    const kept = [];
    for (const h of hits) {
      if (kept.some(k => k.gi === h.gi && k.s < h.e && h.s < k.e)) continue;
      kept.push(h);
    }
    return kept.sort((a, b) => a.s - b.s || a.e - b.e);
  }

  return { find, normalize };
})();

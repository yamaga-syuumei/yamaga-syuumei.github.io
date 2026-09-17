/* ==========================================================
   ドット絵の生成
   16×16のパターンを実行時に描いて data URL にする。
   画像ファイルを持たないので、zip配布でも file:// でも壊れない
   （`tank/art.js` と同じ方式）。

   パターンの文字
     .      … 透明
     a b c d … パレットの色（順に）
   ========================================================== */
window.ART = (function () {
  'use strict';

  var P = {};   // アイコン定義
  var cache = {};

  function def(id, palette, grid) { P[id] = { p: palette, g: grid }; }

  /* ---------- 消耗品 ---------- */
  def('potion', ['#14181c', '#3fb87a', '#a8f0dc'], [
    '................',
    '......aaaa......',
    '......a..a......',
    '......a..a......',
    '.....aa..aa.....',
    '....aa....aa....',
    '....a......a....',
    '....a.bbbb.a....',
    '....abbbbbba....',
    '....abbcbbba....',
    '....abbbbbba....',
    '....abbbbbba....',
    '....aabbbbaa....',
    '.....aaaaaa.....',
    '................',
    '................'
  ]);

  def('ration', ['#14181c', '#c08b4a', '#e8c98a'], [
    '................',
    '................',
    '...aaaaaaaaaa...',
    '...abbbbbbbba...',
    '...abccccccba...',
    '...abcbbbbcba...',
    '...abcbccbcba...',
    '...abcbbbbcba...',
    '...abccccccba...',
    '...abbbbbbbba...',
    '...abccccccba...',
    '...abbbbbbbba...',
    '...aaaaaaaaaa...',
    '................',
    '................',
    '................'
  ]);

  def('fuel', ['#14181c', '#d9a441', '#f3d98a'], [
    '................',
    '................',
    '.....aaaa.......',
    '....aaaaaaaaa...',
    '....abbbbbbba...',
    '....abccccbba...',
    '....abcbbbcba...',
    '....abcbbbcba...',
    '....abccccbba...',
    '....abbbbbbba...',
    '....abbbbbbba...',
    '....aaaaaaaaa...',
    '................',
    '................',
    '................',
    '................'
  ]);

  def('shell', ['#14181c', '#e03919', '#ff8a5c'], [
    '................',
    '.......aa.......',
    '......abba......',
    '......abba......',
    '.....abbbba.....',
    '.....abbbba.....',
    '.....acccca.....',
    '.....abbbba.....',
    '.....abbbba.....',
    '.....acccca.....',
    '.....abbbba.....',
    '.....aaaaaa.....',
    '................',
    '................',
    '................',
    '................'
  ]);

  /* ---------- 装備 ---------- */
  def('knife', ['#14181c', '#c8ced4', '#6f7c88', '#8a5a2b'], [
    '................',
    '................',
    '............aa..',
    '...........abba.',
    '..........abbba.',
    '.........abbba..',
    '........abbba...',
    '.......abbba....',
    '......abbba.....',
    '.....abbba......',
    '....abbba.......',
    '...cccca........',
    '..dddc..........',
    '.ddd............',
    '.dd.............',
    '................'
  ]);

  def('smg', ['#14181c', '#6f7c88', '#c8ced4'], [
    '................',
    '................',
    '................',
    '................',
    '......aaaaaaaa..',
    '..aaaabbbbbbba..',
    '..abbbbbbbbbba..',
    '..abbbaaaaaaaa..',
    '...abba.........',
    '...abba.........',
    '....aa..........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]);

  def('armor', ['#14181c', '#9aa6b2', '#5c6873'], [
    '................',
    '................',
    '...aa......aa...',
    '..abba....abba..',
    '..abbbaaaabbba..',
    '..abbbbbbbbbba..',
    '..abcbbbbbbcba..',
    '..abbbbbbbbbba..',
    '..abbbbbbbbbba..',
    '..abbcccccbbba..',
    '..abbbbbbbbbba..',
    '...abbbbbbbba...',
    '....aaaaaaaa....',
    '................',
    '................',
    '................'
  ]);

  def('plate', ['#14181c', '#3d8be0', '#1f4e80'], [
    '................',
    '................',
    '...aa......aa...',
    '..abba....abba..',
    '..abbbaaaabbba..',
    '..abbbbbbbbbba..',
    '..abcbbbbbbcba..',
    '..abbbbbbbbbba..',
    '..abbbbbbbbbba..',
    '..abbcccccbbba..',
    '..abbbbbbbbbba..',
    '...abbbbbbbba...',
    '....aaaaaaaa....',
    '................',
    '................',
    '................'
  ]);

  def('cannon', ['#14181c', '#c8ced4', '#6f7c88'], [
    '................',
    '................',
    '................',
    '................',
    '.....aaaaaaaaa..',
    '.....abbbbbbba..',
    '.....abbbbbbba..',
    '.....aaaaaaaaa..',
    '...aaaa.........',
    '..acccca........',
    '..acccca........',
    '..aaaaaa........',
    '................',
    '................',
    '................',
    '................'
  ]);

  /* 副砲：主砲より短く、2連装にして見分けが付くようにしてある */
  def('subgun', ['#14181c', '#c8ced4', '#6f7c88'], [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....aaaaa.aaaaa.',
    '....abbba.abbba.',
    '....aaaaa.aaaaa.',
    '.....aaaaaaa....',
    '.....acccca.....',
    '.....aaaaaa.....',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]);

  def('engine', ['#14181c', '#b45cd6', '#e8b0ff'], [
    '................',
    '................',
    '................',
    '....a.aaaa.a....',
    '....aabbbbaa....',
    '..aaabbbbbbaaa..',
    '..abbbbccbbbba..',
    '..abbbccccbbba..',
    '..abbbccccbbba..',
    '..abbbbccbbbba..',
    '..aaabbbbbbaaa..',
    '....aabbbbaa....',
    '....a.aaaa.a....',
    '................',
    '................',
    '................'
  ]);

  def('tank', ['#14181c', '#8a9a5b', '#4a5540', '#2c3328'], [
    '................',
    '................',
    '................',
    '......aaaa......',
    '.....abbbba.....',
    '.....abbbbaaaaa.',
    '..aaaaaaaaaaaa..',
    '..abbbbbbbbbba..',
    '..abbbbbbbbbba..',
    '..aaaaaaaaaaaa..',
    '.acccccccccccca.',
    '.acdcdcdcdcdcca.',
    '.acccccccccccca.',
    '.aaaaaaaaaaaaaa.',
    '................',
    '................'
  ]);

  /* ---------- 素材 ---------- */
  def('scrap', ['#14181c', '#8a8f96', '#c8ced4'], [
    '................',
    '................',
    '................',
    '.....aaaa.......',
    '....abbbba......',
    '....abccba......',
    '....abbbba......',
    '.....aaaa.......',
    '......abba......',
    '......abba......',
    '......abba......',
    '......abba......',
    '.......aa.......',
    '................',
    '................',
    '................'
  ]);

  def('herb', ['#14181c', '#3fb87a', '#7de0a8'], [
    '................',
    '................',
    '.......a........',
    '....bb.a.bb.....',
    '...bbbbabbbb....',
    '...bbccabccb....',
    '....bb.a.bb.....',
    '.....b.a.b......',
    '.......a........',
    '.......a........',
    '.......a........',
    '......aa........',
    '................',
    '................',
    '................',
    '................'
  ]);

  def('oil', ['#14181c', '#5c4a2b', '#8a6f3c'], [
    '................',
    '................',
    '....aaaaaaaa....',
    '....abbbbbba....',
    '....abccccba....',
    '....abbbbbba....',
    '....abbbbbba....',
    '....abccccba....',
    '....abbbbbba....',
    '....abbbbbba....',
    '....abccccba....',
    '....abbbbbba....',
    '....aaaaaaaa....',
    '................',
    '................',
    '................'
  ]);

  def('spring', ['#14181c', '#c8ced4'], [
    '................',
    '................',
    '................',
    '....aaaaaaaa....',
    '....a.......a...',
    '....aaaaaaaa....',
    '....a...........',
    '....aaaaaaaa....',
    '...........a....',
    '....aaaaaaaa....',
    '....a...........',
    '....aaaaaaaa....',
    '................',
    '................',
    '................',
    '................'
  ]);

  def('circuit', ['#14181c', '#2f6b4a', '#d9a441'], [
    '................',
    '................',
    '................',
    '..aaaaaaaaaaaa..',
    '..abbbbbbbbbba..',
    '..abccccccccba..',
    '..abcbbbbbbcba..',
    '..abcbccccbcba..',
    '..abcbccccbcba..',
    '..abcbbbbbbcba..',
    '..abccccccccba..',
    '..abbbbbbbbbba..',
    '..aaaaaaaaaaaa..',
    '...a.a.a.a.a....',
    '................',
    '................'
  ]);

  def('alloy', ['#14181c', '#9fb4c6', '#e7ecf1'], [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....aaaaaaaa....',
    '...abbbbbbbba...',
    '..abccccccccba..',
    '..abbbbbbbbbba..',
    '..abbbbbbbbbba..',
    '..aaaaaaaaaaaa..',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]);

  def('core', ['#14181c', '#3d8be0', '#7de0ff', '#ffffff'], [
    '................',
    '................',
    '................',
    '......aaaa......',
    '....aabbbbaa....',
    '...abbccccbba...',
    '..abbcddddcbba..',
    '..abccddddccba..',
    '..abccddddccba..',
    '..abbcddddcbba..',
    '...abbccccbba...',
    '....aabbbbaa....',
    '......aaaa......',
    '................',
    '................',
    '................'
  ]);

  /* ---------- その他 ---------- */
  def('blueprint', ['#14181c', '#2b5c8a', '#a8c8e8'], [
    '................',
    '................',
    '................',
    '...aaaaaaaaaa...',
    '...abbbbbbbba...',
    '...abccccbbba...',
    '...abbbbbbbba...',
    '...abbcccccba...',
    '...abbbbbbbba...',
    '...abcccccccba..',
    '...abbbbbbbba...',
    '...aaaaaaaaaa...',
    '................',
    '................',
    '................',
    '................'
  ]);

  def('hunter', ['#14181c', '#e8c9a0', '#8a5a2b', '#7a6a4a'], [
    '................',
    '................',
    '......aaaa......',
    '.....abbbba.....',
    '.....abcbca.....',
    '.....abbbba.....',
    '......aaaa......',
    '....adddddda....',
    '...adddddddda...',
    '...adddddddda...',
    '...adddddddda...',
    '....aaddddaa....',
    '....aa....aa....',
    '....aa....aa....',
    '...aaa....aaa...',
    '................'
  ]);

  /* ==========================================================
     描画
     ========================================================== */
  function url(id, scale) {
    scale = scale || 3;
    var key = id + '@' + scale;
    if (cache[key]) return cache[key];

    var d = P[id] || P.scrap;
    var cv = document.createElement('canvas');
    cv.width = 16 * scale;
    cv.height = 16 * scale;
    var g = cv.getContext('2d');

    for (var y = 0; y < 16; y++) {
      var row = d.g[y] || '';
      for (var x = 0; x < 16; x++) {
        var ch = row.charAt(x);
        if (!ch || ch === '.') continue;
        var ci = ch.charCodeAt(0) - 97;      // a→0, b→1 ...
        var col = d.p[ci];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    cache[key] = cv.toDataURL();
    return cache[key];
  }

  /* キャンバスに直接描く。場面（scene.js）はこちらを使う。
     data URL を経由しないので、読み込み待ちが起きない */
  function draw(g, id, x, y, scale) {
    scale = scale || 1;
    var d = P[id];
    if (!d) return;
    for (var yy = 0; yy < 16; yy++) {
      var row = d.g[yy] || '';
      for (var xx = 0; xx < 16; xx++) {
        var ch = row.charAt(xx);
        if (!ch || ch === '.') continue;
        var col = d.p[ch.charCodeAt(0) - 97];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x + xx * scale, y + yy * scale, scale, scale);
      }
    }
  }

  /* <img> をそのまま返す。一覧に並べるときはこれを使う */
  function img(id, scale) {
    var e = document.createElement('img');
    e.className = 'sp-icon';
    e.src = url(id, scale || 3);
    e.alt = '';
    return e;
  }

  return { url: url, img: img, draw: draw, has: function (id) { return !!P[id]; } };
})();

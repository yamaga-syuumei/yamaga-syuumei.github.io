// ステージ定義。
//
// grid 座標は左上が (0,0)。ノードは 1 マスを占有する。
// ポートの d は辺の向き。ベルトはポートの隣接マス（approach）から引く。
//   → ポートの隣接マスが壁や別ノードだと、そのポートには一生つなげない。
//     ステージを足すときは必ず空きマスにすること。
//
// kind:
//   src : 一定間隔で item を出す。out は1つ。rate が小さいほど速い。
//   fac : 全 in が揃うと make を作る。in が1つなら加工機として描かれる。
//   dup : in を1つ受けて、つながっている out すべてに同じ物を配る。
//   snk : item を goal 個受け取るのが目的。
//
// bridges : 陸橋（交差）を何回まで使えるか。省略＝0＝交差できない。
// key     : 進み具合の保存キー。並べ替えても記録が壊れないよう、番号ではなくこれで持つ。
//
// 盤面は進むほど広くなる。11×8 → 13×9 → 15×10。
// 「できることが増えた」感を大きさで出すため。
//
// 想定解は下の SOL に置く。タイトルのデモがこの手順で引き、par.cells は
// この手順のマス数そのもの。盤面を変えたら SOL も直すこと。
(function (global) {
  'use strict';

  function vwall(x, y0, y1) { const a = []; for (let y = y0; y <= y1; y++) a.push([x, y]); return a; }
  function hwall(y, x0, x1, skip) {
    const a = [];
    for (let x = x0; x <= x1; x++) if (!skip || skip.indexOf(x) < 0) a.push([x, y]);
    return a;
  }

  const STAGES = [
    // ---------------------------------------------------------------- 11×8
    {
      key: 'first-line', name: 'はじめの一本',
      hint: '供給口の口から納品口の口へドラッグする。引いた瞬間から動き出す。',
      w: 11, h: 8, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 3, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'snk', x: 9, y: 3, item: 'iron', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 7, time: 5.5 },
    },
    {
      key: 'wall', name: '壁をよける',
      hint: 'ベルトは壁を通れない。どちらに回り込むかで長さが変わる。',
      w: 11, h: 8, walls: vwall(5, 0, 4),
      nodes: [
        { k: 'src', x: 1, y: 3, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'snk', x: 9, y: 3, item: 'iron', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 11, time: 5.5 },
    },
    {
      key: 'no-cross', name: '交わらせない',
      hint: 'ベルトどうしは交差できない。1マスに引けるのは1本だけ。',
      w: 11, h: 8, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 2, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 4, item: 'bolt', rate: 6, out: [{ d: 'S' }] },
        { k: 'snk', x: 9, y: 1, item: 'bolt', goal: 8, in: [{ d: 'N' }] },
        { k: 'snk', x: 9, y: 5, item: 'iron', goal: 8, in: [{ d: 'S' }] },
      ],
      par: { cells: 28, time: 6 },
    },
    {
      key: 'one-lane', name: '一本道の取り合い',
      hint: '壁の隙間は2つ。どちらのベルトに近い方を使わせるかで長さが変わる。',
      w: 11, h: 8, walls: hwall(3, 0, 10, [2, 8]),
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'S' }] },
        { k: 'snk', x: 1, y: 6, item: 'iron', goal: 8, in: [{ d: 'N' }] },
        { k: 'src', x: 5, y: 1, item: 'bolt', rate: 6, out: [{ d: 'S' }] },
        { k: 'snk', x: 5, y: 6, item: 'bolt', goal: 8, in: [{ d: 'N' }] },
      ],
      par: { cells: 16, time: 5.5 },
    },
    {
      key: 'first-factory', name: 'はじめての工場',
      hint: '工場は入口すべてに材料が揃うと動く。口に描いてある絵が必要な材料。',
      w: 11, h: 8, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 5, y: 3, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 9, y: 3, item: 'frame', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 13, time: 8.5 },
    },
    {
      key: 'back-door', name: '裏口',
      hint: '鉄板の入口が供給口と反対を向いている。回り込む道を先に決める。',
      w: 11, h: 8, walls: [[6, 1], [6, 2]],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 5, y: 3, make: 'frame', ticks: 8, out: [{ d: 'W' }],
          in: [{ d: 'E', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 0, y: 3, item: 'frame', goal: 10, in: [{ d: 'E' }] },
      ],
      par: { cells: 20, time: 9 },
    },

    // ---------------------------------------------------------------- 13×9
    {
      key: 'two-lines', name: '二つのライン',
      hint: '別々のラインを2本。上下でぶつからないように敷く。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 2, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 4, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 8, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 6, y: 3, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 6, y: 7, make: 'chip', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'wire' }, { d: 'S', item: 'iron' }] },
        { k: 'snk', x: 11, y: 3, item: 'frame', goal: 8, in: [{ d: 'W' }] },
        { k: 'snk', x: 11, y: 7, item: 'chip', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 28, time: 7.5 },
    },
    {
      key: 'far-is-right', name: '遠い方が正解',
      hint: '鉄板の供給口は2つ。近い方を使うと、ボルトの道が通らなくなる。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 0, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 3, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 7, y: 4, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 11, y: 4, item: 'frame', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 20, time: 9 },
    },
    {
      key: 'two-stage', name: '二段の工場',
      hint: '工場の出したものが、次の工場の材料になる。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 3, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 8, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 5, y: 2, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 5, y: 7, make: 'motor', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'gear' }, { d: 'S', item: 'wire' }] },
        { k: 'fac', x: 9, y: 4, make: 'robot', ticks: 12, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'frame' }, { d: 'S', item: 'motor' }] },
        { k: 'snk', x: 11, y: 4, item: 'robot', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 28, time: 11 },
    },
    {
      key: 'three-ports', name: '三つの口',
      hint: '入口が3つ。どの辺から入れるかで、他のベルトの通り道が決まる。',
      w: 13, h: 9, walls: [[4, 2], [4, 3], [4, 5], [4, 6]],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 4, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 7, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 6, y: 4, make: 'chip', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'wire' }, { d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 11, y: 4, item: 'chip', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 22, time: 9 },
    },
    {
      key: 'spare-source', name: '余計な供給口',
      hint: '盤面にあるものを全部使うとは限らない。壁の隙間は2つしかない。',
      w: 13, h: 9, walls: vwall(7, 0, 2).concat(vwall(7, 4, 6)),
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 3, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 7, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 10, y: 4, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 12, y: 4, item: 'frame', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 25, time: 9 },
    },
    {
      key: 'splitter', name: '複製機',
      hint: '1つの供給口から2箇所へは送れない。複製機を通せば2つに分かれる。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 4, item: 'iron', rate: 4, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 7, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'dup', x: 4, y: 4, in: [{ d: 'W', item: 'iron' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'fac', x: 8, y: 2, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'N', item: 'bolt' }] },
        { k: 'fac', x: 8, y: 6, make: 'chip', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'wire' }] },
        { k: 'snk', x: 11, y: 2, item: 'frame', goal: 8, in: [{ d: 'W' }] },
        { k: 'snk', x: 11, y: 6, item: 'chip', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 30, time: 7.5 },
    },
    {
      key: 'split-three', name: '三つに分ける',
      hint: '複製機の出したものを、もう一つの複製機に入れてもいい。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 0, y: 4, item: 'iron', rate: 4, out: [{ d: 'E' }] },
        { k: 'dup', x: 2, y: 4, in: [{ d: 'W', item: 'iron' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'dup', x: 2, y: 1, in: [{ d: 'S', item: 'iron' }], out: [{ d: 'N' }, { d: 'E' }] },
        { k: 'src', x: 10, y: 3, item: 'bolt', rate: 6, out: [{ d: 'N' }] },
        { k: 'src', x: 5, y: 8, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 8, y: 0, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 8, y: 6, make: 'chip', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'wire' }] },
        { k: 'snk', x: 11, y: 0, item: 'frame', goal: 8, in: [{ d: 'W' }] },
        { k: 'snk', x: 11, y: 6, item: 'chip', goal: 8, in: [{ d: 'W' }] },
        { k: 'snk', x: 8, y: 3, item: 'iron', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 35, time: 7.5 },
    },
    {
      key: 'split-product', name: '中間を二手に',
      hint: '複製機に入れるのは材料でなくてもいい。工場の出したものでもいい。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 3, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 8, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 5, y: 2, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'dup', x: 8, y: 2, in: [{ d: 'W', item: 'frame' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'fac', x: 4, y: 7, make: 'motor', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'gear' }, { d: 'S', item: 'wire' }] },
        { k: 'fac', x: 8, y: 6, make: 'robot', ticks: 12, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'frame' }, { d: 'S', item: 'motor' }] },
        { k: 'snk', x: 11, y: 1, item: 'frame', goal: 6, in: [{ d: 'W' }] },
        { k: 'snk', x: 11, y: 6, item: 'robot', goal: 6, in: [{ d: 'W' }] },
      ],
      par: { cells: 28, time: 9 },
    },
    {
      key: 'no-splitter', name: '複製機の誘惑',
      hint: '複製機は置いてあるが、使うと遠回りになる。供給口は2つある。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 3, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 7, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'dup', x: 6, y: 4, in: [{ d: 'W', item: 'iron' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'fac', x: 9, y: 1, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 9, y: 7, make: 'chip', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'N', item: 'wire' }] },
        { k: 'snk', x: 12, y: 1, item: 'frame', goal: 8, in: [{ d: 'W' }] },
        { k: 'snk', x: 12, y: 7, item: 'chip', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 36, time: 7.5 },
    },
    {
      key: 'press', name: '加工機',
      hint: 'ボルトの供給口がない。鉄板から作る。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 2, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 5, y: 6, make: 'bolt', ticks: 6, out: [{ d: 'N' }],
          in: [{ d: 'W', item: 'iron' }] },
        { k: 'fac', x: 8, y: 4, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 11, y: 4, item: 'frame', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 17, time: 9 },
    },
    {
      key: 'iron-only', name: '鉄だけの工場',
      hint: '供給口は鉄板ひとつだけ。分けて、片方をボルトに変える。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 4, item: 'iron', rate: 4, out: [{ d: 'E' }] },
        { k: 'dup', x: 4, y: 4, in: [{ d: 'W', item: 'iron' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'fac', x: 7, y: 6, make: 'bolt', ticks: 6, out: [{ d: 'N' }],
          in: [{ d: 'W', item: 'iron' }] },
        { k: 'fac', x: 9, y: 3, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 12, y: 3, item: 'frame', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 19, time: 9.5 },
    },
    {
      key: 'two-sinks', name: '二つの納品口',
      hint: '鉄板そのものも納品する。作る分と納める分に分ける。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 4, item: 'iron', rate: 4, out: [{ d: 'E' }] },
        { k: 'dup', x: 4, y: 4, in: [{ d: 'W', item: 'iron' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'fac', x: 8, y: 2, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'N', item: 'bolt' }] },
        { k: 'snk', x: 11, y: 2, item: 'frame', goal: 8, in: [{ d: 'W' }] },
        { k: 'snk', x: 11, y: 6, item: 'iron', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 24, time: 7.5 },
    },
    {
      key: 'two-presses', name: '二本の加工機',
      hint: '鉄板から2種類を作る。どちらの加工機に、どちらの供給口をつなぐか。',
      w: 13, h: 9, walls: [[7, 3], [7, 4], [7, 5]],
      nodes: [
        { k: 'src', x: 1, y: 2, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 5, y: 2, make: 'bolt', ticks: 6, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }] },
        { k: 'fac', x: 5, y: 6, make: 'gear', ticks: 6, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }] },
        { k: 'fac', x: 9, y: 4, make: 'chip', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'bolt' }, { d: 'S', item: 'gear' }] },
        { k: 'snk', x: 12, y: 4, item: 'chip', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 18, time: 9.5 },
    },
    {
      key: 'wire-short', name: '配線が足りない',
      hint: 'モーターは配線を2本使う。配線の供給口は1つしかない。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'dup', x: 4, y: 5, in: [{ d: 'W', item: 'wire' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'fac', x: 8, y: 4, make: 'motor', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'gear' }, { d: 'W', item: 'wire' }, { d: 'S', item: 'wire' }] },
        { k: 'snk', x: 11, y: 4, item: 'motor', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 23, time: 9 },
    },
    {
      key: 'fast-factory', name: '速い工場・遅い工場',
      hint: '同じ物を作る工場が2つ。下の目盛りが作る速さ。納品口の口は1つなので、どちらかしか使えない。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 0, y: 4, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 0, y: 6, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 3, y: 5, make: 'frame', ticks: 16, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 10, y: 5, make: 'frame', ticks: 6, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 6, y: 1, item: 'frame', goal: 12, in: [{ d: 'S' }] },
      ],
      par: { cells: 12, time: 8.5 },
    },
    {
      key: 'fast-source', name: '速い供給口は遠い',
      hint: '鉄板の供給口は2つ。下の目盛りが出す速さ。速い方は盤面の端にある。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 0, y: 0, item: 'iron', rate: 4, out: [{ d: 'E' }] },
        { k: 'src', x: 5, y: 1, item: 'iron', rate: 12, out: [{ d: 'S' }] },
        { k: 'src', x: 1, y: 6, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 7, y: 4, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 11, y: 4, item: 'frame', goal: 12, in: [{ d: 'W' }] },
      ],
      par: { cells: 14, time: 10 },
    },
    {
      key: 'robot', name: 'ロボット工場',
      hint: '4つの材料から2つの部品、部品からロボット。全部を平面に収める。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 3, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 8, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 6, y: 2, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 6, y: 7, make: 'motor', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'gear' }, { d: 'S', item: 'wire' }] },
        { k: 'fac', x: 10, y: 4, make: 'robot', ticks: 12, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'frame' }, { d: 'S', item: 'motor' }] },
        { k: 'snk', x: 12, y: 4, item: 'robot', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 32, time: 13 },
    },
    {
      key: 'two-orders', name: '注文が二つ',
      hint: 'フレームも納めるし、ロボットにも使う。壁で上下が切れている。',
      w: 13, h: 9, walls: hwall(4, 2, 6),
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 3, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 8, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 5, y: 2, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'dup', x: 8, y: 2, in: [{ d: 'W', item: 'frame' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'fac', x: 5, y: 7, make: 'motor', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'gear' }, { d: 'S', item: 'wire' }] },
        { k: 'fac', x: 8, y: 5, make: 'robot', ticks: 12, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'frame' }, { d: 'S', item: 'motor' }] },
        { k: 'snk', x: 11, y: 1, item: 'frame', goal: 6, in: [{ d: 'W' }] },
        { k: 'snk', x: 11, y: 5, item: 'robot', goal: 6, in: [{ d: 'W' }] },
      ],
      par: { cells: 29, time: 9 },
    },

    // ---------------------------------------------------------------- 陸橋
    {
      key: 'bridge', name: '陸橋',
      hint: '陸橋を使うと1回だけ交差できる。引いてあるベルトの上を、曲がらずにまっすぐ横切る。',
      w: 13, h: 9, walls: [], bridges: 1,
      nodes: [
        { k: 'src', x: 0, y: 0, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 12, y: 0, item: 'bolt', rate: 6, out: [{ d: 'W' }] },
        { k: 'snk', x: 0, y: 8, item: 'bolt', goal: 8, in: [{ d: 'N' }] },
        { k: 'snk', x: 12, y: 8, item: 'iron', goal: 8, in: [{ d: 'N' }] },
      ],
      par: { cells: 38, time: 6.5 },
    },
    {
      key: 'overpass', name: '立体交差',
      hint: '陸橋は2つ。遠回りでも解けるが、それだとマス数の目標には届かない。',
      w: 13, h: 9, walls: [], bridges: 2,
      nodes: [
        { k: 'src', x: 1, y: 3, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 11, y: 3, item: 'wire', rate: 6, out: [{ d: 'W' }] },
        { k: 'src', x: 11, y: 5, item: 'gear', rate: 6, out: [{ d: 'W' }] },
        { k: 'fac', x: 4, y: 4, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 8, y: 4, make: 'motor', ticks: 8, out: [{ d: 'W' }],
          in: [{ d: 'N', item: 'gear' }, { d: 'S', item: 'wire' }] },
        { k: 'fac', x: 6, y: 4, make: 'robot', ticks: 12, out: [{ d: 'S' }],
          in: [{ d: 'W', item: 'frame' }, { d: 'E', item: 'motor' }] },
        { k: 'snk', x: 6, y: 7, item: 'robot', goal: 8, in: [{ d: 'N' }] },
      ],
      par: { cells: 28, time: 11 },
    },
    {
      key: 'twisted-three', name: 'ねじれた三本',
      hint: '3本の行き先がねじれている。どこで1回だけ交差させるか。',
      w: 13, h: 9, walls: [], bridges: 1,
      nodes: [
        { k: 'src', x: 1, y: 2, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 4, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 6, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 7, y: 4, make: 'chip', ticks: 8, out: [{ d: 'S' }],
          in: [{ d: 'N', item: 'wire' }, { d: 'W', item: 'iron' }, { d: 'E', item: 'bolt' }] },
        { k: 'snk', x: 7, y: 8, item: 'chip', goal: 10, in: [{ d: 'N' }] },
      ],
      par: { cells: 26, time: 9 },
    },
    {
      key: 'four-corners', name: '四隅の材料',
      hint: '材料は四隅。入口は全部、反対側を向いている。陸橋は2つ。',
      w: 13, h: 9, walls: [], bridges: 2,
      nodes: [
        { k: 'src', x: 0, y: 0, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 12, y: 0, item: 'bolt', rate: 6, out: [{ d: 'W' }] },
        { k: 'src', x: 0, y: 8, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 12, y: 8, item: 'wire', rate: 6, out: [{ d: 'W' }] },
        { k: 'fac', x: 6, y: 2, make: 'frame', ticks: 8, out: [{ d: 'S' }],
          in: [{ d: 'E', item: 'iron' }, { d: 'W', item: 'bolt' }] },
        { k: 'fac', x: 6, y: 6, make: 'motor', ticks: 8, out: [{ d: 'N' }],
          in: [{ d: 'E', item: 'gear' }, { d: 'W', item: 'wire' }] },
        { k: 'fac', x: 9, y: 4, make: 'robot', ticks: 12, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'frame' }, { d: 'S', item: 'motor' }] },
        { k: 'snk', x: 12, y: 4, item: 'robot', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 46, time: 13 },
    },

    // ---------------------------------------------------------------- 15×10
    {
      key: 'iron-and-wire', name: '鉄と配線だけ',
      hint: '供給口は鉄板と配線の2つだけ。ボルトも歯車も鉄板から作る。',
      w: 15, h: 10, walls: [],
      nodes: [
        { k: 'src', x: 1, y: 4, item: 'iron', rate: 4, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 8, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'dup', x: 3, y: 4, in: [{ d: 'W', item: 'iron' }], out: [{ d: 'N' }, { d: 'S' }] },
        { k: 'dup', x: 3, y: 2, in: [{ d: 'S', item: 'iron' }], out: [{ d: 'N' }, { d: 'E' }] },
        { k: 'fac', x: 8, y: 1, make: 'bolt', ticks: 6, out: [{ d: 'S' }],
          in: [{ d: 'W', item: 'iron' }] },
        { k: 'fac', x: 6, y: 6, make: 'gear', ticks: 6, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }] },
        { k: 'fac', x: 11, y: 3, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'bolt' }, { d: 'W', item: 'iron' }] },
        { k: 'fac', x: 10, y: 7, make: 'motor', ticks: 8, out: [{ d: 'N' }],
          in: [{ d: 'W', item: 'gear' }, { d: 'S', item: 'wire' }] },
        { k: 'fac', x: 12, y: 5, make: 'robot', ticks: 12, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'frame' }, { d: 'S', item: 'motor' }] },
        { k: 'snk', x: 14, y: 5, item: 'robot', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 42, time: 13.5 },
    },
    {
      key: 'robot-plus', name: 'ロボット工場・改',
      hint: '最後。材料の行き先がねじれている。どこで交差させるかを決めてから引く。',
      w: 15, h: 10, walls: [], bridges: 2,
      nodes: [
        { k: 'src', x: 1, y: 1, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 4, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 5, item: 'wire', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 1, y: 8, item: 'gear', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 6, y: 2, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'fac', x: 6, y: 7, make: 'motor', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'gear' }, { d: 'S', item: 'wire' }] },
        { k: 'fac', x: 11, y: 4, make: 'robot', ticks: 12, out: [{ d: 'E' }],
          in: [{ d: 'N', item: 'frame' }, { d: 'S', item: 'motor' }] },
        { k: 'snk', x: 13, y: 4, item: 'robot', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 46, time: 13.5 },
    },
  ];

  // 想定解。タイトル画面のデモがこの手順で引く。
  // par.cells はこの手順のマス数そのもの。
  // [[ノードとポート], [通るマスの並び]] を、引く順に並べる。
  // 陸橋のあるステージは、下をくぐる方を先に引くこと。
  const SOL = {
    'first-line': [
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3]]]],
    'wall': [
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [4, 3], [4, 4], [4, 5], [5, 5], [6, 5], [6, 4], [6, 3], [7, 3], [8, 3]]]],
    'no-cross': [
      [['src', 1, 2, 'E'], [[2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6]]],
      [['src', 1, 4, 'S'], [[1, 5], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0]]]],
    'one-lane': [
      [['src', 1, 1, 'S'], [[1, 2], [2, 2], [2, 3], [2, 4], [1, 4], [1, 5]]],
      [['src', 5, 1, 'S'], [[5, 2], [6, 2], [7, 2], [8, 2], [8, 3], [8, 4], [7, 4], [6, 4], [5, 4], [5, 5]]]],
    'first-factory': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [4, 2], [4, 3]]],
      [['src', 1, 5, 'E'], [[2, 5], [3, 5], [4, 5], [5, 5], [5, 4]]],
      [['fac', 5, 3, 'E'], [[6, 3], [7, 3], [8, 3]]]],
    'back-door': [
      [['src', 1, 1, 'E'], [[2, 1], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1], [7, 2], [7, 3], [6, 3]]],
      [['src', 1, 5, 'E'], [[2, 5], [3, 5], [4, 5], [5, 5], [5, 4]]],
      [['fac', 5, 3, 'W'], [[4, 3], [3, 3], [2, 3], [1, 3]]]],
    'two-lines': [
      [['src', 1, 2, 'E'], [[2, 2], [3, 2], [4, 2], [5, 2], [5, 3]]],
      [['src', 1, 4, 'E'], [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]]],
      [['fac', 6, 3, 'E'], [[7, 3], [8, 3], [9, 3], [10, 3]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6], [4, 7], [5, 7]]],
      [['src', 1, 8, 'E'], [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8]]],
      [['fac', 6, 7, 'E'], [[7, 7], [8, 7], [9, 7], [10, 7]]]],
    'far-is-right': [
      [['src', 1, 0, 'E'], [[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1], [7, 2], [7, 3]]],
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]]],
      [['fac', 7, 4, 'E'], [[8, 4], [9, 4], [10, 4]]]],
    'two-stage': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [4, 2]]],
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [4, 3], [5, 3]]],
      [['fac', 5, 2, 'E'], [[6, 2], [7, 2], [8, 2], [9, 2], [9, 3]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6], [4, 7]]],
      [['src', 1, 8, 'E'], [[2, 8], [3, 8], [4, 8], [5, 8]]],
      [['fac', 5, 7, 'E'], [[6, 7], [7, 7], [8, 7], [9, 7], [9, 6], [9, 5]]],
      [['fac', 9, 4, 'E'], [[10, 4]]]],
    'three-ports': [
      [['src', 1, 4, 'E'], [[2, 4], [3, 4], [4, 4], [5, 4]]],
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [6, 2], [6, 3]]],
      [['src', 1, 7, 'E'], [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [6, 6], [6, 5]]],
      [['fac', 6, 4, 'E'], [[7, 4], [8, 4], [9, 4], [10, 4]]]],
    'spare-source': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [6, 2], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3]]],
      [['src', 1, 5, 'E'], [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [6, 6], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [10, 6], [10, 5]]],
      [['fac', 10, 4, 'E'], [[11, 4]]]],
    'splitter': [
      [['src', 1, 4, 'E'], [[2, 4], [3, 4]]],
      [['dup', 4, 4, 'N'], [[4, 3], [4, 2], [5, 2], [6, 2], [7, 2]]],
      [['dup', 4, 4, 'S'], [[4, 5], [4, 6], [5, 6], [6, 6], [7, 6]]],
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]]],
      [['src', 1, 7, 'E'], [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7]]],
      [['fac', 8, 2, 'E'], [[9, 2], [10, 2]]],
      [['fac', 8, 6, 'E'], [[9, 6], [10, 6]]]],
    'split-three': [
      [['src', 0, 4, 'E'], [[1, 4]]],
      [['dup', 2, 4, 'N'], [[2, 3], [2, 2]]],
      [['dup', 2, 1, 'N'], [[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]]],
      [['dup', 2, 1, 'E'], [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [7, 2], [7, 3]]],
      [['dup', 2, 4, 'S'], [[2, 5], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6]]],
      [['src', 10, 3, 'N'], [[10, 2], [10, 1], [9, 1], [8, 1]]],
      [['src', 5, 8, 'E'], [[6, 8], [7, 8], [8, 8], [8, 7]]],
      [['fac', 8, 0, 'E'], [[9, 0], [10, 0]]],
      [['fac', 8, 6, 'E'], [[9, 6], [10, 6]]]],
    'split-product': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1]]],
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [4, 3], [5, 3]]],
      [['fac', 5, 2, 'E'], [[6, 2], [7, 2]]],
      [['dup', 8, 2, 'N'], [[8, 1], [9, 1], [10, 1]]],
      [['dup', 8, 2, 'S'], [[8, 3], [8, 4], [8, 5]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [3, 7]]],
      [['src', 1, 8, 'E'], [[2, 8], [3, 8], [4, 8]]],
      [['fac', 4, 7, 'E'], [[5, 7], [6, 7], [7, 7], [8, 7]]],
      [['fac', 8, 6, 'E'], [[9, 6], [10, 6]]]],
    'no-splitter': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]]],
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [9, 2]]],
      [['src', 1, 7, 'E'], [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7]]],
      [['src', 1, 5, 'E'], [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [9, 6]]],
      [['fac', 9, 1, 'E'], [[10, 1], [11, 1]]],
      [['fac', 9, 7, 'E'], [[10, 7], [11, 7]]]],
    'press': [
      [['src', 1, 2, 'E'], [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [8, 3]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6]]],
      [['fac', 5, 6, 'N'], [[5, 5], [6, 5], [7, 5], [8, 5]]],
      [['fac', 8, 4, 'E'], [[9, 4], [10, 4]]]],
    'iron-only': [
      [['src', 1, 4, 'E'], [[2, 4], [3, 4]]],
      [['dup', 4, 4, 'N'], [[4, 3], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2]]],
      [['dup', 4, 4, 'S'], [[4, 5], [4, 6], [5, 6], [6, 6]]],
      [['fac', 7, 6, 'N'], [[7, 5], [8, 5], [9, 5], [9, 4]]],
      [['fac', 9, 3, 'E'], [[10, 3], [11, 3]]]],
    'two-sinks': [
      [['src', 1, 4, 'E'], [[2, 4], [3, 4]]],
      [['dup', 4, 4, 'N'], [[4, 3], [4, 2], [5, 2], [6, 2], [7, 2]]],
      [['dup', 4, 4, 'S'], [[4, 5], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6]]],
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]]],
      [['fac', 8, 2, 'E'], [[9, 2], [10, 2]]]],
    'two-presses': [
      [['src', 1, 2, 'E'], [[2, 2], [3, 2], [4, 2]]],
      [['fac', 5, 2, 'E'], [[6, 2], [7, 2], [8, 2], [9, 2], [9, 3]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6]]],
      [['fac', 5, 6, 'E'], [[6, 6], [7, 6], [8, 6], [9, 6], [9, 5]]],
      [['fac', 9, 4, 'E'], [[10, 4], [11, 4]]]],
    'wire-short': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [8, 2], [8, 3]]],
      [['src', 1, 5, 'E'], [[2, 5], [3, 5]]],
      [['dup', 4, 5, 'N'], [[4, 4], [5, 4], [6, 4], [7, 4]]],
      [['dup', 4, 5, 'S'], [[4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [8, 5]]],
      [['fac', 8, 4, 'E'], [[9, 4], [10, 4]]]],
    // 近い遅い工場を使う手。マス数が短い（★2の根拠）
    'fast-factory': [
      [['src', 0, 4, 'E'], [[1, 4], [2, 4], [3, 4]]],
      [['src', 0, 6, 'E'], [[1, 6], [2, 6], [3, 6]]],
      [['fac', 3, 5, 'E'], [[4, 5], [4, 4], [4, 3], [4, 2], [5, 2], [6, 2]]]],
    'fast-source': [
      [['src', 5, 1, 'S'], [[5, 2], [6, 2], [7, 2], [7, 3]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [7, 5]]],
      [['fac', 7, 4, 'E'], [[8, 4], [9, 4], [10, 4]]]],
    'robot': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1], [5, 2]]],
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3]]],
      [['fac', 6, 2, 'E'], [[7, 2], [8, 2], [9, 2], [10, 2], [10, 3]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6], [5, 6], [5, 7]]],
      [['src', 1, 8, 'E'], [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8]]],
      [['fac', 6, 7, 'E'], [[7, 7], [8, 7], [9, 7], [10, 7], [10, 6], [10, 5]]],
      [['fac', 10, 4, 'E'], [[11, 4]]]],
    'two-orders': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [4, 1], [5, 1]]],
      [['src', 1, 3, 'E'], [[2, 3], [3, 3], [4, 3], [5, 3]]],
      [['fac', 5, 2, 'E'], [[6, 2], [7, 2]]],
      [['dup', 8, 2, 'N'], [[8, 1], [9, 1], [10, 1]]],
      [['dup', 8, 2, 'S'], [[8, 3], [8, 4]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6], [4, 7]]],
      [['src', 1, 8, 'E'], [[2, 8], [3, 8], [4, 8], [5, 8]]],
      [['fac', 5, 7, 'E'], [[6, 7], [7, 7], [8, 7], [8, 6]]],
      [['fac', 8, 5, 'E'], [[9, 5], [10, 5]]]],
    'bridge': [
      [['src', 0, 0, 'E'], [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7]]],
      [['src', 12, 0, 'W'], [[11, 0], [11, 1], [10, 1], [9, 1], [8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]]]],
    'overpass': [
      [['src', 1, 5, 'E'], [[2, 5], [3, 5], [3, 4], [3, 3], [4, 3]]],
      [['src', 1, 3, 'E'], [[2, 3], [2, 4], [2, 5], [2, 6], [3, 6], [4, 6], [4, 5]]],
      [['src', 11, 5, 'W'], [[10, 5], [9, 5], [9, 4], [9, 3], [8, 3]]],
      [['src', 11, 3, 'W'], [[10, 3], [10, 4], [10, 5], [10, 6], [9, 6], [8, 6], [8, 5]]],
      [['fac', 4, 4, 'E'], [[5, 4]]],
      [['fac', 8, 4, 'W'], [[7, 4]]],
      [['fac', 6, 4, 'S'], [[6, 5], [6, 6]]]],
    'twisted-three': [
      [['src', 1, 4, 'E'], [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [6, 5], [6, 4], [6, 3], [7, 3]]],
      [['src', 1, 2, 'E'], [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [8, 3], [8, 4]]],
      [['fac', 7, 4, 'S'], [[7, 5], [7, 6], [7, 7]]]],
    'four-corners': [
      [['src', 0, 0, 'E'], [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1], [7, 2]]],
      [['src', 12, 0, 'W'], [[11, 0], [11, 1], [10, 1], [9, 1], [8, 1], [7, 1], [6, 1], [5, 1], [5, 2]]],
      [['src', 0, 8, 'E'], [[1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [7, 7], [7, 6]]],
      [['src', 12, 8, 'W'], [[11, 8], [11, 7], [10, 7], [9, 7], [8, 7], [7, 7], [6, 7], [5, 7], [5, 6]]],
      [['fac', 6, 2, 'S'], [[6, 3], [7, 3], [8, 3], [9, 3]]],
      [['fac', 6, 6, 'N'], [[6, 5], [7, 5], [8, 5], [9, 5]]],
      [['fac', 9, 4, 'E'], [[10, 4], [11, 4]]]],
    'iron-and-wire': [
      [['src', 1, 4, 'E'], [[2, 4]]],
      [['dup', 3, 4, 'N'], [[3, 3]]],
      [['dup', 3, 2, 'N'], [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]],
      [['dup', 3, 2, 'E'], [[4, 2], [5, 2], [6, 2], [7, 2], [7, 3], [8, 3], [9, 3], [10, 3]]],
      [['dup', 3, 4, 'S'], [[3, 5], [4, 5], [5, 5], [6, 5]]],
      [['fac', 8, 1, 'S'], [[8, 2], [9, 2], [10, 2], [11, 2]]],
      [['fac', 6, 6, 'E'], [[7, 6], [8, 6], [9, 6], [9, 7]]],
      [['src', 1, 8, 'E'], [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8]]],
      [['fac', 11, 3, 'E'], [[12, 3], [12, 4]]],
      [['fac', 10, 7, 'N'], [[10, 6], [11, 6], [12, 6]]],
      [['fac', 12, 5, 'E'], [[13, 5]]]],
    'robot-plus': [
      [['src', 1, 1, 'E'], [[2, 1], [3, 1], [3, 2], [3, 3], [4, 3], [5, 3], [6, 3]]],
      [['src', 1, 4, 'E'], [[2, 4], [2, 3], [2, 2], [2, 1], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [6, 1]]],
      [['src', 1, 5, 'E'], [[2, 5], [3, 5], [4, 5], [4, 6], [4, 7], [4, 8], [5, 8], [6, 8]]],
      [['src', 1, 8, 'E'], [[2, 8], [3, 8], [3, 7], [3, 6], [4, 6], [5, 6], [6, 6]]],
      [['fac', 6, 2, 'E'], [[7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [11, 3]]],
      [['fac', 6, 7, 'E'], [[7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [11, 6], [11, 5]]],
      [['fac', 11, 4, 'E'], [[12, 4]]]],
  };

  // ★2（マス数）と★3（タイム）の答えが違うステージの、速い方の手。
  // par.time はこちらの実測値。デモは使わない。
  const SOL_FAST = {
    'fast-factory': [
      [['src', 0, 4, 'E'], [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4]]],
      [['src', 0, 6, 'E'], [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6]]],
      [['fac', 10, 5, 'E'], [[11, 5], [11, 4], [11, 3], [11, 2], [10, 2], [9, 2], [8, 2], [7, 2], [6, 2]]]],
    'fast-source': [
      [['src', 0, 0, 'E'], [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1], [7, 2], [7, 3]]],
      [['src', 1, 6, 'E'], [[2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [7, 5]]],
      [['fac', 7, 4, 'E'], [[8, 4], [9, 4], [10, 4]]]],
  };

  STAGES.forEach((s, i) => { s.no = i + 1; s.sol = SOL[s.key]; s.solFast = SOL_FAST[s.key]; });
  global.STAGES = STAGES;
})(window);

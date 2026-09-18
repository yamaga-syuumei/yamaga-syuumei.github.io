// ステージ定義。
//
// grid 座標は左上が (0,0)。ノードは 1 マスを占有する。
// ポートの d は辺の向き。ベルトはポートの隣接マス（approach）から引く。
//   → ポートの隣接マスが壁や別ノードだと、そのポートには一生つなげない。
//     ステージを足すときは必ず空きマスにすること。
//
// kind:
//   src : 一定間隔で item を出す。out は1つ。
//   fac : 全 in が揃うと make を作る。in が1つなら加工機として描かれる。
//   dup : in を1つ受けて、つながっている out すべてに同じ物を配る。
//   snk : item を goal 個受け取るのが目的。
//
// bridges : 陸橋（交差）を何回まで使えるか。省略＝0＝交差できない。
//
// par.cells / par.time は★2/★3の目標。実際に解いた手順のマス数を入れてある。
(function (global) {
  'use strict';

  function vwall(x, y0, y1) { const a = []; for (let y = y0; y <= y1; y++) a.push([x, y]); return a; }

  const STAGES = [
    {
      name: 'はじめの一本',
      hint: '供給口の口から納品口の口へドラッグする。引いた瞬間から動き出す。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 2, y: 4, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'snk', x: 10, y: 4, item: 'iron', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 7, time: 5.5 },
    },
    {
      name: '壁をよける',
      hint: 'ベルトは壁を通れない。どちらに回り込むかで長さが変わる。',
      w: 13, h: 9, walls: vwall(6, 1, 6),
      nodes: [
        { k: 'src', x: 2, y: 4, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'snk', x: 10, y: 4, item: 'iron', goal: 8, in: [{ d: 'W' }] },
      ],
      par: { cells: 13, time: 6 },
    },
    {
      name: '交わらせない',
      hint: 'ベルトどうしは交差できない。1マスに引けるのは1本だけ。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 2, y: 3, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 2, y: 5, item: 'bolt', rate: 6, out: [{ d: 'S' }] },
        { k: 'snk', x: 10, y: 2, item: 'bolt', goal: 8, in: [{ d: 'N' }] },
        { k: 'snk', x: 10, y: 6, item: 'iron', goal: 8, in: [{ d: 'S' }] },
      ],
      par: { cells: 28, time: 6.5 },
    },
    {
      name: 'はじめての工場',
      hint: '工場は入口すべてに材料が揃うと動く。口に描いてある絵が必要な材料。',
      w: 13, h: 9, walls: [],
      nodes: [
        { k: 'src', x: 2, y: 2, item: 'iron', rate: 6, out: [{ d: 'E' }] },
        { k: 'src', x: 2, y: 6, item: 'bolt', rate: 6, out: [{ d: 'E' }] },
        { k: 'fac', x: 6, y: 4, make: 'frame', ticks: 8, out: [{ d: 'E' }],
          in: [{ d: 'W', item: 'iron' }, { d: 'S', item: 'bolt' }] },
        { k: 'snk', x: 10, y: 4, item: 'frame', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 13, time: 8.5 },
    },
    {
      name: '二つのライン',
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
      name: '二段の工場',
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
      name: '余計な供給口',
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
      name: '複製機',
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
      name: '加工機',
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
      par: { cells: 17, time: 9.5 },
    },
    {
      name: '二つの納品口',
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
      name: '配線が足りない',
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
      name: 'ロボット工場',
      hint: '4つの材料から2つの部品、部品からロボット。全部を平面に収める。',
      w: 15, h: 10, walls: [[8, 4], [9, 4], [8, 5], [9, 5]],
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
        { k: 'snk', x: 13, y: 4, item: 'robot', goal: 10, in: [{ d: 'W' }] },
      ],
      par: { cells: 33, time: 13.5 },
    },
    {
      name: '陸橋',
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
      name: '立体交差',
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
      name: 'ロボット工場・改',
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

  STAGES.forEach((s, i) => { s.no = i + 1; });
  global.STAGES = STAGES;
})(window);

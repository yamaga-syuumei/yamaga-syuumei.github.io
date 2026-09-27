// 魔法プログラミングゲーム（試作）— 表だけを持つ。処理は game.js にある。
//
//  命令は kind で3つに分かれる。in が魔素を積み、mod が一番上を書き換え、out が消費する。
//  ステージの solve は想定解。遊びには使わないが、MP内で倒せることの確認に使う。
window.SPELL = (function () {
  'use strict';

  // ---------------------------------------------------------------- 属性
  // mana は属性なし。弱点には当たらないが安く引ける。
  const ELEMS = {
    mana: { key: 'mana', name: '魔力', add: 0, color: '#b48ce8', glow: '#e3d2ff' },
    fire: { key: 'fire', name: '火',   add: 1, color: '#f0743a', glow: '#ffd0a8' },
  };

  // ---------------------------------------------------------------- 命令
  //  cost … 固定コスト。draw だけは引く量で決まるので data には持たない。
  //  args … 書き方の確認と補完に使う。
  const CMDS = [
    { key: 'draw', kind: 'in', name: '抽出', args: ['属性', '量'],
      usage: 'draw <属性> <量>',
      desc: '魔力を注いで魔素を取り出し、手元に積む。',
      note: 'コストは量ぶん。火は精霊の力を借りるので＋1。' },
    { key: 'amp', kind: 'mod', cost: 2, name: '増幅', args: [],
      usage: 'amp',
      desc: '手元の一番上の魔素の威力を2倍にする。',
      note: '大きく引くより、少なく引いて増幅する方が安く済む。' },
    { key: 'pierce', kind: 'mod', cost: 2, name: '貫通', args: [],
      usage: 'pierce',
      desc: '一番上の魔素に、防壁を無視して当たる性質を与える。',
      note: '防壁が厚い相手ほど効く。' },
    { key: 'split', kind: 'mod', cost: 1, name: '分割', args: [],
      usage: 'split',
      desc: '一番上の魔素を、半分の威力の2つに割る。',
      note: '端数は切り捨て。的が2つのときに使う。' },
    { key: 'cast', kind: 'out', cost: 1, name: '放つ', args: ['的'],
      usage: 'cast <的>',
      desc: '一番上の魔素を的に放つ。手元から消える。',
      note: '弱点に当たれば2倍。防壁があればその数だけ引かれる。' },
    { key: 'scan', kind: 'out', cost: 1, name: '看破', args: ['的'],
      usage: 'scan <的>',
      desc: '的の防壁と弱点を調べて、伏せられた表示を開く。',
      note: '調べた内容は、その詠唱のあいだ残る。' },
  ];

  // ---------------------------------------------------------------- 敵
  //  art … art.js の描き分け。weak が null なら弱点なし。
  const FOES = {
    mud:   { name: '泥人形',   art: 'mud',   hp: 8,  guard: 0, weak: null },
    stone: { name: '石の番人', art: 'stone', hp: 10, guard: 4, weak: null },
    bat:   { name: '氷の蝙蝠', art: 'bat',   hp: 16, guard: 6, weak: 'fire' },
    oniL:  { name: '炎鬼（左）', art: 'oni', hp: 6,  guard: 1, weak: null },
    oniR:  { name: '炎鬼（右）', art: 'oni', hp: 6,  guard: 1, weak: null },
  };

  // ---------------------------------------------------------------- ステージ
  //  unlock … その戦いに入るときに使えるようになる命令と属性。
  //  foes   … id は呪文の中で的として書く名前。
  const STAGES = [
    {
      key: 'st1', title: '一の試し',
      unlock: { cmds: ['draw', 'cast'], elems: ['mana'] },
      mp: 10,
      foes: [{ id: 'enemy', def: 'mud' }],
      word: ['魔法は手順だ。覚える呪文などない。',
        '魔力を取り出し、的に放つ。まずはそれだけやってみろ。'],
      hint: '魔素の威力がそのまま傷になる。泥人形は防壁を持たない。',
      solve: 'draw mana 8\ncast enemy',
    },
    {
      key: 'st2', title: '二の試し',
      unlock: { cmds: ['amp', 'pierce'], elems: [] },
      mp: 13,
      foes: [{ id: 'enemy', def: 'stone' }],
      word: ['石の番人は硬い。まともに撃てば削られる。',
        '大きく引くな。小さく引いて、増幅しろ。'],
      hint: '防壁はダメージから引かれる。増幅で上回るか、貫通で素通りさせるか。',
      solve: 'draw mana 7\namp\ncast enemy',
    },
    {
      key: 'st3', title: '三の試し',
      unlock: { cmds: ['scan'], elems: ['fire'] },
      mp: 12,
      foes: [{ id: 'enemy', def: 'bat' }],
      word: ['火の精霊がお前に付いた。属性を引けるようになる。',
        '相手の弱点が分からんときは、まず調べろ。'],
      hint: '弱点に当てれば2倍。魔力のままでは、この防壁は抜けない。',
      solve: 'scan enemy\ndraw fire 6\namp\ncast enemy',
    },
    {
      key: 'st4', title: '四の試し',
      unlock: { cmds: ['split'], elems: [] },
      mp: 12,
      foes: [{ id: 'left', def: 'oniL' }, { id: 'right', def: 'oniR' }],
      word: ['二体だ。片方ずつ引いていては魔力が保たん。',
        '一度引いた魔素を、割って配れ。'],
      hint: '的の名前は left と right。分割した魔素は2つとも手元に残る。',
      solve: 'draw mana 7\namp\nsplit\ncast left\ncast right',
    },
  ];

  // ---------------------------------------------------------------- 文言
  const TEXT = {
    chapter: '第一章　純粋な魔力',
    clear: ['四つの試しを越えたな。',
      'ここから先は、繰り返しと、手順に名前を付けることを教える。',
      '……それはまた次の章だ。'],
  };

  return { ELEMS, CMDS, FOES, STAGES, TEXT };
})();

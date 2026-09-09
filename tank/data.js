/* ==========================================================
   ゲームデータ
   街・イベント・敵・パーツをここに外出ししている。
   企画書 6章の方針どおり、シナリオは後から差し込めるようにする。
   街を増やすときは towns に足すだけでよい。
   ========================================================== */
window.GAME_DATA = {

  /* ---------- 街 ---------- */
  towns: [
    {
      id: 'town_01',
      name: 'ハガネ基地',
      x: 8, y: 34,
      home: true,
      intro: '鉄骨と土嚢で固めた、この荒野で唯一まともな基地。ハンターはここで車を直す。',
      npcs: [
        { who: '整備士 ドゥガン', lines: [
          'その戦車、まだ走るのか。……直してやる。金は置いていけ。',
          '装甲を厚くすれば死ににくい。だが重い。エンジンも一緒に考えろ。'
        ]},
        { who: '受付 サキ', lines: [
          '賞金首の依頼が出てるよ。倒して戻ってくれば、賞金は現金で。',
          '雑魚は放っておいても金にはなる。でも大物を狙わないと車は良くならない。'
        ]},
        { who: '酔っぱらい', lines: [
          'north……北にでかいのがいる。俺の車は、そこで、な……',
          'ここらの砂はな、昔は畑だったらしいぜ。信じるか?'
        ]}
      ],
      /* 後からイベントを足す枠。events に押し込めば会話に混ざる */
      events: []
    },
    {
      id: 'town_02',
      name: 'サビ砂の宿場',
      x: 44, y: 30,
      intro: '砂に半分埋もれた宿場町。売るものより、売られたものの方が多い。',
      npcs: [
        { who: '宿の女将', lines: [
          '泊まってく? 直してはやれないけど、話なら聞くよ。',
          '東の岩場に妙なのが棲みついてる。うちの客が二人、帰ってこない。'
        ]},
        { who: '子ども', lines: [
          'せんしゃ! ねえ、それ、うごくの?',
          'おっちゃん、キャタピラって、こわれるとどうなるの?'
        ]}
      ],
      events: []
    },
    {
      id: 'town_03',
      name: '断崖のドッグ',
      x: 30, y: 8,
      intro: '崖にへばりついた整備場。ここまで来られる車は、それだけで一人前とされる。',
      npcs: [
        { who: '老技師', lines: [
          'ここまで上がってきたか。……砲を見せてみろ。',
          '大砲ってのはな、当てる場所を選べるようになって一人前だ。'
        ]},
        { who: '流れのハンター', lines: [
          '賞金首の相手は、まず足を潰せ。逃げられちゃ話にならん。',
          '砲塔を壊せば向こうの手数が減る。そこからは作業だ。'
        ]}
      ],
      events: []
    }
  ],

  /* ---------- パーツ（4系統 × 3段階） ---------- */
  /* color は画面上の戦車にそのまま使う。
     HUD の色見本と合うので、何を積んでいるかが一目で分かる。 */
  parts: {
    cannon: [
      { name: '60mm速射砲',   atk: 14, price: 0,    color: '#c8ced4' },
      { name: '105mm滑腔砲',  atk: 34, price: 1200, color: '#e8d18a' },
      { name: '155mm重砲',    atk: 70, price: 4200, color: '#ffb454' }
    ],
    /* 副砲。最初は積んでいない。積むと主砲の後にもう一発入る */
    subgun: [
      { name: 'なし',         atk: 0,  price: 0,    color: null      },
      { name: '12.7mm機銃',  atk: 9,  price: 900,  color: '#aab6c0' },
      { name: '20mm機関砲',  atk: 22, price: 3000, color: '#f0784a' }
    ],
    armor: [
      { name: '鉄板',       def: 4,  hp: 140, price: 0,    color: '#4a7f5e' },
      { name: '複合装甲',   def: 12, hp: 260, price: 1500, color: '#3fb87a' },
      { name: '反応装甲',   def: 24, hp: 430, price: 5000, color: '#7fe3a6' }
    ],
    engine: [
      { name: '中古V8',       spd: 2.3, price: 0,    color: '#2f5f46' },
      { name: '改造V12',      spd: 3.1, price: 1000, color: '#2f7f9c' },
      { name: 'ガスタービン', spd: 4.0, price: 3600, color: '#c9a13f' }
    ]
  },

  /* ---------- 敵 ---------- */
  /* kind: 'mob'  … フィールドの雑魚。ワンボタンのオート戦闘
     kind: 'boss' … 賞金首。ターン制で部位を狙う          */
  enemies: [
    { id: 'drone',  kind: 'mob', name: '野良ドローン', hp: 40,  atk: 10, def: 2,  gold: 180 },
    { id: 'buggy',  kind: 'mob', name: '砂バギー',     hp: 70,  atk: 16, def: 5,  gold: 340 },
    { id: 'junk',   kind: 'mob', name: '廃棄ロボ',     hp: 120, atk: 24, def: 10, gold: 620 },

    {
      id: 'mantis', kind: 'boss', tier: 'mid', name: '鋼鉄のカマキリ', town: 'town_01',
      x: 16, y: 20, gold: 1800,
      desc: '基地の北をうろつく大型機。鎌で装甲を裂く。',
      parts: [
        { key: 'body',  name: '本体',     hp: 260, atk: 26, def: 10 },
        { key: 'arm',   name: '鎌',       hp: 90,  atk: 34, def: 6  },
        { key: 'track', name: 'キャタピラ', hp: 70,  atk: 0,  def: 4  }
      ]
    },
    {
      id: 'scorpion', kind: 'boss', tier: 'mid', name: '双胴のサソリ', town: 'town_02',
      x: 52, y: 20, gold: 3600,
      desc: '東の岩場に棲みついた二連装の機体。尾の砲が厄介。',
      parts: [
        { key: 'body',  name: '本体',     hp: 420, atk: 32, def: 16 },
        { key: 'tail',  name: '尾部砲',   hp: 150, atk: 48, def: 10 },
        { key: 'track', name: 'キャタピラ', hp: 110, atk: 0,  def: 8  }
      ]
    },
    {
      id: 'ghost', kind: 'boss', tier: 'final', name: '灰色の亡霊', town: 'town_03',
      x: 38, y: 6, gold: 7000,
      desc: '崖の上に据わったまま動かない、正体不明の重機。',
      parts: [
        { key: 'body',   name: '本体',     hp: 640, atk: 44, def: 26 },
        { key: 'cannon', name: '主砲塔',   hp: 240, atk: 66, def: 18 },
        { key: 'track',  name: 'キャタピラ', hp: 160, atk: 0,  def: 12 }
      ]
    }
  ]
};

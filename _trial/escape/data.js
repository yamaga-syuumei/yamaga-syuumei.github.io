/* ==========================================================
   脱出ADV ダミー台本
   企画書（事業計画/WEBゲーム企画_脱出ADV.md）6章の方針どおり、
   本文が書き上がったらこのファイルを差し替えるだけで動く状態にしてある。

   ---------------------------------------------------------
   スキーマ（本文を流し込むときのメモ。テンプレートではない）
   ---------------------------------------------------------
   SCRIPT.start … 開始ノードのid

   SCRIPT.nodes[id] = {
     checkpoint: true,          // 省略可。ここをバッドエンドからの復帰地点にする
     messages: [ 'テキスト', { text:'テキスト', delay:1200, silent:true }, ... ],
       // 文字列だけでもよい（delayは文字数から自動計算する）。
       // silent:true は「間」を作りたいとき（入力中…を出さずに沈黙させる）
     choices: [
       { text:'ボタンの文言', kind:'response', next:'次のid' },
         // 応答：結末に影響しない。次へ進むだけ
       { text:'ボタンの文言', kind:'puzzle', correct:true,  next:'次のid' },
       { text:'ボタンの文言', kind:'puzzle', correct:false, reply:['外したときの返信'] },
         // 謎：correctが1つ。外しても進める（reply→再度選択肢を出す）。
         // 1回目に外した回数だけをミスとして数える（同じノードでの2回目以降は数えない）
       { text:'ボタンの文言', kind:'branch', next:'ジャンプ先id' }
         // 分かれ道：ジャンプ先が end を持てばバッドエンドになる
     ],
     end: [
       { maxMiss:0, id:'true_end',   title:'…', text:'…' },
       {            id:'normal_end', title:'…', text:'…' } // maxMiss省略＝常に一致（最後に置く保険）
     ]
       // 上から順に条件を見て最初に一致したものを採用する
   }
   ========================================================== */
window.SCRIPT = {

  start: 'n_start',

  nodes: {

    /* ---------- 導入 ---------- */
    n_start: {
      checkpoint: true,
      messages: [
        'あ、繋がった……！？',
        'ごめん、誰だか分かんないけどちょっとだけ聞いて',
        { text: 'わたし今、知らない部屋にいる', delay: 1600 }
      ],
      choices: [
        { text: 'どういうこと？', kind: 'response', next: 'n_intro2' },
        { text: '……誰？', kind: 'response', next: 'n_intro2' }
      ]
    },

    n_intro2: {
      messages: [
        'それが分かんないの、こっちが聞きたい',
        '目が覚めたらここにいて、スマホだけ握らされてた感じ',
        { text: 'なんかもう怖いっていうか、状況が渋滞してる', delay: 1400 }
      ],
      choices: [
        { text: '落ち着いて、周り見て', kind: 'response', next: 'n_room1' }
      ]
    },

    /* ---------- 最初の分かれ道（片方はバッドエンド） ---------- */
    n_room1: {
      messages: [
        '落ち着いてる場合……いや落ち着く',
        'えっと、狭い部屋。窓ひとつ、ドアひとつ。以上',
        { text: '家具とかは無し。潔いくらい無し', delay: 1300 }
      ],
      choices: [
        { text: '窓の外を見て', kind: 'branch', next: 'n_window' },
        { text: 'とりあえず大声で叫んでみて', kind: 'branch', next: 'n_bad_scream' }
      ]
    },

    n_bad_scream: {
      messages: [
        'え、正気？ ……いや叫ぶけど',
        'うわあああ……あー、うん、疲れた',
        { text: 'なんか喉痛いだけで特に……', delay: 1500 },
        { text: 'あ、', delay: 1800 },
        { text: '……', delay: 1600, silent: true },
        { text: 'ごめんちょっと外から音した、あとで話す', delay: 1400 }
      ],
      end: [
        { id: 'bad_scream', title: 'バッドエンド：静寂', text: 'それきり、彼女からの返信は来なくなった。' }
      ]
    },

    /* ---------- 窓ルート → 謎 ---------- */
    n_window: {
      checkpoint: true,
      messages: [
        '窓、外は真っ暗。庭っぽい？ よく分かんない',
        'でもドアのところに変な板があって、数字押すやつっぽい',
        { text: '4つボタンがあって、ひとつだけ選べって感じ。矢印が描いてある', delay: 1700 }
      ],
      choices: [
        { text: '「7」を押すよう伝える', kind: 'puzzle', correct: false,
          reply: ['押した', '……何も起きない。というか音すらしない'] },
        { text: '「12」を押すよう伝える', kind: 'puzzle', correct: true, next: 'n_hallway' },
        { text: '「3」を押すよう伝える', kind: 'puzzle', correct: false,
          reply: ['押した', 'ランプが赤く点滅した。多分違う'] },
        { text: '矢印の向きをよく見てって言う', kind: 'puzzle', correct: false,
          reply: ['向き……？', '見た、見たけど分かんない、普通に矢印だよそれ'] }
      ]
    },

    /* ---------- 合流 → 2つめの分かれ道 ---------- */
    n_hallway: {
      checkpoint: true,
      messages: [
        '開いた！ すごい、あなたのおかげかも',
        '廊下に出た。長い。奥に light 見える',
        { text: 'このまま奥まで走っちゃおうかな', delay: 1400 }
      ],
      choices: [
        { text: 'ゆっくりでいい、周り確認しながら進んで', kind: 'response', next: 'n_ending_gate' },
        { text: '迷ってる時間ないから走って', kind: 'branch', next: 'n_bad_rush' }
      ]
    },

    n_bad_rush: {
      messages: [
        'だよね、走る！',
        'うわ、',
        { text: '床、抜けた……？', delay: 1300 },
        { text: '待って笑い事じゃなくて本当に落ちて', delay: 1600 }
      ],
      end: [
        { id: 'bad_rush', title: 'バッドエンド：暗転', text: '足音が途切れたきり、既読はつかなくなった。' }
      ]
    },

    /* ---------- 結末 ---------- */
    n_ending_gate: {
      messages: [
        '確認しながら、っと……あ、出口だ',
        { text: '本当にありがとう、あなたがいなかったら多分ダメだった', delay: 1600 }
      ],
      end: [
        { maxMiss: 0, id: 'true_end', title: '真エンド：出口の先',
          text: '一度も外さずに、彼女は屋敷を出た。最後の一言だけ、やけにはっきり届いた。' },
        { id: 'normal_end', title: '通常エンド：脱出',
          text: '彼女は無事に屋敷を出た。何箇所か遠回りをしたことは、たぶん本人も分かっている。' }
      ]
    }

  }
};

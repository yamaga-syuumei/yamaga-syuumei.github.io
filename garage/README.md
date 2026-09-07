# 荒野の車載工房（ベータ 0.1）

メタルマックス風 × Slay the Spire × backpack battles。
`事業計画/WebGame/WEBゲーム企画_メタルマックス風StS.md` の実装。

## 遊び方

`index.html` をブラウザで開くだけ。サーバも通信も要らない。

## 作り

`website/tank/` と同じ方針。**画像ファイルも音声ファイルも持たない。**

| ファイル | 中身 |
|---|---|
| `data.js` | 車体・部品・敵・進行の数値。**調整はここだけ触れば足りる** |
| `sfx.js` | 効果音とBGM。どちらも合成。音量は設定から別々に変えられる |
| `art.js` | ドット絵。実行時に canvas へ描く。1マス16px |
| `sfx.js` | 効果音。Web Audio で合成 |
| `game.js` | 進行・配置・戦闘 |
| `style.css` / `index.html` | 画面 |

- 外部ライブラリなし・ビルドなし・素のJS
- `fetch` も ES modules も使っていないので `file://` でそのまま動く
- 保存は `localStorage`（キー `garage-run-v1`）

## 数値をいじるとき

ほぼ `data.js` で完結する。

- 部品：`weight`（重さ）/ `price` / `stats.dmg` / `stats.ammo` / `stats.reload` / `stats.pierce`
- 補助部品の隣接効果：`aura`
- 敵：`hp` / `armor`（1発ごとに引く固定値）/ `atk` / `interval`
- 進行：`run.floors` / `run.scaleHp` / `run.scaleAtk`（雑魚の階層補正）/
  `run.eliteScaleHp` / `run.eliteScaleAtk`（中ボスの階層補正）

強化1段あたりの伸び（+22%など）と、休憩の回復量だけは `game.js` にある
（`eff()` と `renderRest()`）。

## 企画書との対応

- **消耗品**（徹甲弾・追加弾倉・タイルパック・応急パッチ）… 実装済み。持ち物として最大5個まで持ち、
  戦利品・行商で手に入る。効果は「次の戦闘だけ」（貫通・弾数）と「その場で永続」（マス開放・回復）の2系統
- **穴追加・穴をふさぐ** … 実装済み。車体には最初から塞がったマスがある（企画書の「穴をふさぐ」の逆）。
  ショップの「車体の増設」か、消耗品の「タイルパック」で開ける。値段は買うたびに上がる

## 更新するとき

`index.html` の `?v=X.Y` を書き換えないと、ブラウザが古いJSを読み続ける
（1ファイルだけ書き換え忘れると、新旧が食い違って壊れる）。手で直さず、
必ずこれを使う。

```bash
./bump-version.sh 1.3 1.4
```

## 動作確認用

`index.html?debug=1` を開くと `window.__garage` が生える。

```js
__garage.state()                       // セーブ状態
__garage.build()                       // 組み上がった性能
__garage.give('m_105')                 // 部品を足す
__garage.gold(999)
__garage.warpTo('boss')                // その種類のノードへ飛ぶ
__garage.meta()                        // 図鑑・実績・記録
__garage.resetMeta()                   // 記録だけ消す
__garage.step(60)                      // 戦闘を60秒ぶん進める（画面を待たない）
__garage.simulate('boss', 11, 10)      // 10回まわして勝率を見る
```

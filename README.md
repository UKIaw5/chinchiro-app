# chinchiro-app

サイコロ3個でチンチロを行う、1画面だけの iPhone 向けアプリ（Expo / React Native + TypeScript）。
Expo Go で動かす。

## 遊び方

画面上部がお椀、中央が「振る」ボタン、下部に役名が出る。

| タップ位置 | 出る目 |
|---|---|
| 四隅以外（ボタンを含む） | 完全ランダム |
| 左上（角から幅・高さ20%） | ピンゾロ（1-1-1） |
| 右上 | シゴロ（4-5-6） |
| 左下 | アラシ（2〜6のゾロ目） |
| 右下 | 目あり（同じ目2個＋別の目1個） |

- 四隅には何も表示しない。サイコロの並び順は毎回ランダム。
- アニメーションと所要時間はどのタップでも同じ（投げ入れ → 約2秒で3個が順に止まる → 寄り → 2.9秒で役名）。

| 役 | 効果音 | 役名の書体 |
|---|---|---|
| ピンゾロ・アラシ・シゴロ | 太鼓2回 | Zen Antique（金色に光る） |
| ○の目 | 太鼓1回 | Dela Gothic One |
| ヒフミ | なし | Dela Gothic One（赤） |
| 目なし | なし | 標準書体 |

消音スイッチが ON のときは音を鳴らさない（振動は出る）。

## 起動（Expo Go・トンネル接続）

```bash
npm install
npm run play     # 本番に近い速さで動かす（= expo start --tunnel --no-dev --minify）
npm run tunnel   # 開発用（保存すると自動で反映される。動きは重め）
```

PC と iPhone の Expo Go に同じ Expo アカウントでログインしておき、表示された QR コードを iPhone の標準カメラで読み取る。
依存パッケージを追加・変更したあとは `-c`（キャッシュ削除）を付けて起動する。

## 構成

- `App.tsx` — 画面レイアウト・タップ判定・役名の表示
- `src/lib/dice.ts` — 出目の生成・役の判定・役の格
- `src/hooks/useDiceRoll.ts` — 振る処理の時刻表・振動
- `src/audio/useDiceSound.ts` — 衝突音と、役が出たときの太鼓
- `src/components/RollButton.tsx` — 中央の「振る」ボタン
- `src/motion/` — サイコロの動きの設計（物理演算は使わない）
  - `designThrow.ts` — 投げ入れ → 跳ねる → 壁沿いに回り込む → 減速して止まる動きを作る。止まったときに狙った目が上を向く
  - `geometry.ts` / `recording.ts` — お椀とサイコロの寸法、動きの記録の型
- `src/scene/` — 描画
  - `DiceScene.tsx` — サイコロの各面を View として置き、毎コマ 3D の変形行列だけを UI スレッドで更新する（描画は iOS が行う）
  - `frame.ts` — 1コマ分の変形行列・影・揺れの計算
  - `bowl.ts` — お椀と卓（Skia で一度だけ描く）
  - `camera.ts` / `dieShape.ts` / `math3d.ts` — カメラ、サイコロの形、3D 計算

## 素材

- 効果音は合成している：`python scripts/generate-sounds.py` で `assets/sounds/` に再生成。同名の wav を置き換えれば差し替えられる
- 書体は役名に使う文字だけに絞ったサブセット（`assets/fonts/`、SIL Open Font License。ライセンス文を同梱）。
  使う文字を増やすときは、元の書体（Google Fonts）から fonttools の `pyftsubset` で作り直す

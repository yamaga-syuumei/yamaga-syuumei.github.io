#!/bin/bash
# index.html の ?v=X.Y をまとめて書き換える。
#
# なぜ要るか：script/style タグのキャッシュは、そのタグ自身の src/href
# 文字列が変わらない限り破棄されない。1ファイルだけ書き換え忘れると、
# 「新しい game.js が古い data.js を読む」ような食い違いが起きる。
# 手작업だと起きやすいので、必ずこのコマンド1回で全部を揃える。
#
# 使い方: ./bump-version.sh 1.3 1.4
set -euo pipefail
cd "$(dirname "$0")"

old="${1:?使い方: ./bump-version.sh <旧バージョン> <新バージョン>}"
new="${2:?使い方: ./bump-version.sh <旧バージョン> <新バージョン>}"

sed -i \
  -e "s/\.js?v=${old}/.js?v=${new}/g" \
  -e "s/style\.css?v=${old}/style.css?v=${new}/" \
  index.html

count=$(grep -c "v=${new}" index.html || true)
echo "index.html を v=${old} → v=${new} に更新（${count}箇所）"
grep -n "v=${new}" index.html

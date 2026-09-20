# 公開物から開発用のものを落とす。GitHub Actions が公開の直前に走らせる。
# 手元のファイルは触らない（CI のチェックアウト上でだけ動く）。
#
# 落とすもの
#   1. /* dev:start */ … /* dev:end */   （.js）
#   2. <!-- dev:start --> … <!-- dev:end -->（.html）
#   3. _ 始まり・. 始まりのファイルとディレクトリ
#
# 3 が要るのは、この経路では Jekyll が走らないため。
# GitHub Pages に直接置いていたときは Jekyll が _ 始まりを外していたので、
# その前提がここでは成り立たない。

import os
import re
import shutil
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')

JS_BLOCK = re.compile(r'[ \t]*/\* dev:start \*/.*?/\* dev:end \*/[ \t]*\n?', re.S)
HTML_BLOCK = re.compile(r'[ \t]*<!-- dev:start -->.*?<!-- dev:end -->[ \t]*\n?', re.S)

dropped = []
stripped = []


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')


# --- 1. _ 始まり / . 始まりを丸ごと落とす ---
targets = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    for name in list(dirnames):
        if name.startswith('_') or name.startswith('.'):
            targets.append(os.path.join(dirpath, name))
            dirnames.remove(name)
    for name in filenames:
        if name.startswith('_') or name.startswith('.'):
            targets.append(os.path.join(dirpath, name))

for t in targets:
    dropped.append(rel(t))
    if os.path.isdir(t):
        shutil.rmtree(t)
    else:
        os.remove(t)

# --- 2. 残ったファイルから dev ブロックを削る ---
for dirpath, dirnames, filenames in os.walk(ROOT):
    for name in filenames:
        ext = os.path.splitext(name)[1].lower()
        if ext not in ('.js', '.html'):
            continue
        path = os.path.join(dirpath, name)
        with open(path, encoding='utf-8') as f:
            src = f.read()
        out = JS_BLOCK.sub('', src) if ext == '.js' else HTML_BLOCK.sub('', src)
        if out != src:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(out)
            stripped.append('%s (-%d文字)' % (rel(path), len(src) - len(out)))

# --- 3. 取り残しがあれば失敗させる ---
leftovers = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    for name in filenames:
        if os.path.splitext(name)[1].lower() not in ('.js', '.html'):
            continue
        path = os.path.join(dirpath, name)
        with open(path, encoding='utf-8') as f:
            src = f.read()
        if 'dev:start' in src or 'dev:end' in src:
            leftovers.append(rel(path))

print('落としたファイル:')
for d in sorted(dropped):
    print('  -', d)
print('dev ブロックを削ったファイル:')
for s in sorted(stripped):
    print('  -', s)

if leftovers:
    print('対応していないマーカーが残っています:')
    for l in leftovers:
        print('  !', l)
    sys.exit(1)

print('OK')

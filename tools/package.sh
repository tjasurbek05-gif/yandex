#!/usr/bin/env bash
# Package the shippable game into dist/stack.zip with index.html + logic.js at the archive ROOT.
# Works for both the Yandex Games console upload and the apps-engine (Higgsfield) deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/stack.zip
zip -rq dist/stack.zip index.html logic.js strings.js src assets \
  -x '*.DS_Store' '*/.*'
echo "built dist/stack.zip"
unzip -l dist/stack.zip

#!/bin/bash
# Build a PROTECTED (obfuscated) release of the Tabora extension.
# Requires: Node.js 18+ (uses npx javascript-obfuscator)
# NOTE: Obfuscated builds are for direct distribution only.
#       The Chrome Web Store does NOT allow obfuscated code.
set -e
VER=${1:-1.0.2}
cd "$(dirname "$0")"

SRC="extension"
OUT="tabora-protected-build"
ZIP="tabora-v${VER}-protected.zip"

rm -rf "$OUT" "$ZIP"
cp -r "$SRC" "$OUT"
sed -i "s/\"version\": \"[0-9.]*\"/\"version\": \"$VER\"/" "$OUT/manifest.json"

echo "Obfuscating JavaScript…"
for f in "$OUT"/js/*.js "$OUT"/background.js; do
  npx --yes javascript-obfuscator "$f" \
    --compact true \
    --identifier-names-generator hexadecimal \
    --rename-globals false \
    --string-array true \
    --string-array-encoding rc4 \
    --string-array-threshold 0.8 \
    --split-strings true \
    --split-strings-chunk-length 6 \
    --control-flow-flattening true \
    --control-flow-flattening-threshold 0.45 \
    --dead-code-injection true \
    --dead-code-injection-threshold 0.2 \
    --transform-object-keys false \
    --self-defending false \
    --output "$f" >/dev/null
  echo "  ✓ $f"
done

cd "$OUT"
zip -qr "../$ZIP" . -x "*.DS_Store"
cd ..
rm -rf "$OUT"
echo "Built $ZIP"
ls -lh "$ZIP"

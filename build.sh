#!/bin/bash
# Build a release zip of the Tabora Chrome extension
VER=${1:-1.0.0}
cd "$(dirname "$0")"
rm -f "tabora-v${VER}.zip"
cd extension
zip -qr "../tabora-v${VER}.zip" . -x "*.DS_Store"
cd ..
echo "Built tabora-v${VER}.zip"
ls -lh "tabora-v${VER}.zip"

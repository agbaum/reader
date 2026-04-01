#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "Switching to dev package id..."
pnpm run toggle-package-id dev

echo "Running app on Android..."
# Ensure old signed app does not block install
adb uninstall com.akpgreentree.reader || true

pnpm expo run:android

echo "Switching back to prod package id..."
pnpm run toggle-package-id prod

echo "Done."
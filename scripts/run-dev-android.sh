#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "Switching to dev package id..."
pnpm run toggle-package-id dev

echo "Running app on Android..."
pnpm expo run:android

echo "Switching back to prod package id..."
pnpm run toggle-package-id prod

echo "Done."
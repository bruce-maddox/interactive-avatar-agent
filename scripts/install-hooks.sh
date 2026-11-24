#!/bin/sh
# Install the public-repo safety hooks into this clone's .git/hooks.
# Run from anywhere inside the repo.
set -eu
cd "$(dirname "$0")/.."
cp scripts/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "Installed pre-push hook."

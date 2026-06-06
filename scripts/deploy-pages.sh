#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${1:-indkobsvogn-web}"

cd "$ROOT_DIR"

bun run build
npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --commit-dirty

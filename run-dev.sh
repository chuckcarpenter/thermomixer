#!/bin/sh
# Wrapper so the Preview MCP launches the dev server with Node 22 (the repo
# requires >=22.12; the machine's default `node` is older).
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"
cd "$(dirname "$0")" || exit 1
exec npm run dev

#!/bin/zsh
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -d node_modules ] || npm install
(sleep 2 && open "http://localhost:5180") &
npm run dev -- --port 5180

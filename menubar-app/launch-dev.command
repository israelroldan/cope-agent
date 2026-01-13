#!/bin/bash
# Launch COPE Agent menubar in dev mode (no terminal needed)
cd "$(dirname "$0")"
npm run build 2>/dev/null
nohup ./node_modules/.bin/electron . &>/dev/null &

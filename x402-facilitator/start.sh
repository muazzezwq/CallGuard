#!/data/data/com.termux/files/usr/bin/bash

termux-wake-lock

tmux new -d -s x402 "node server.js"
tmux split-window -t x402 "cloudflared tunnel --url http://localhost:4021"

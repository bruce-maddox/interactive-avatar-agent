#!/bin/bash
# Verifies the deployed demo picks up the key from .env and can mint a
# sandbox session. Prints only statuses — never the key or tokens.
cd /root/liveavatar-demo || exit 1

if [ ! -f .env ]; then echo "ENV: missing"; exit 1; fi
set -a
# shellcheck disable=SC1091
source .env
set +a
if [ -z "$LIVEAVATAR_API_KEY" ]; then echo "ENV: key empty"; exit 1; fi
echo "ENV: key present (length ${#LIVEAVATAR_API_KEY})"

# Restart the server so it picks up the new environment.
pkill -f 'node server.mjs' 2>/dev/null
sleep 1
nohup node server.mjs > /root/liveavatar-demo/server.log 2>&1 &
sleep 2

# 1) Mint a token through the deployed endpoint itself.
RESP=$(curl -s -X POST http://127.0.0.1:3000/api/session)
if echo "$RESP" | grep -q 'session_token'; then
  echo "MINT: ok (session_token received via deployed endpoint)"
else
  echo "MINT: FAILED: $(echo "$RESP" | head -c 300)"
  exit 1
fi
TOKEN=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).session_token)}catch(e){}})")

# 2) Start a sandbox session with that token, then stop it immediately
# (proves the full chain; sandbox auto-ends in ~1 min anyway).
START=$(curl -s -X POST https://api.liveavatar.com/v1/sessions/start \
  -H "Authorization: Bearer $TOKEN")
if echo "$START" | grep -q 'livekit_url'; then
  echo "START: ok (livekit room created)"
else
  echo "START: FAILED: $(echo "$START" | head -c 300)"
  exit 1
fi
STOP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST https://api.liveavatar.com/v1/sessions/stop \
  -H "Authorization: Bearer $TOKEN")
echo "STOP: http $STOP_CODE"
echo "SERVER: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)"

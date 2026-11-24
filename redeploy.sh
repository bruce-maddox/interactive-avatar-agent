#!/bin/bash
cd /root/liveavatar-demo || exit 1
tar -xzf /root/liveavatar-deploy2.tgz
ls -la create-context.mjs knowledge.md.example
# Restart with .env loaded (the server reads env at startup).
pkill -f 'node server.mjs' 2>/dev/null
sleep 1
set -a
source .env
set +a
nohup node server.mjs > /root/liveavatar-demo/server.log 2>&1 &
sleep 2
echo "GET /: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)"
echo "POST /api/session: $(curl -s -X POST http://127.0.0.1:3000/api/session | head -c 120)"
echo "--- server log ---"
cat /root/liveavatar-demo/server.log

// Minimal backend for the LiveAvatar sandbox demo.
//
// Job: mint a sandbox session token server-side (the API key must never
// reach the browser) and serve the built frontend from ./dist.
// Run:  npm install && npm run build && node server.mjs
// Then open http://localhost:3000 (mic access works on localhost).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
// Bind localhost only by default: reach it via `ssh -L 3000:localhost:3000`
// so the browser treats it as a secure context (mic works) and the token
// endpoint is never exposed. Set HOST=0.0.0.0 only if you really want it public.
const HOST = process.env.HOST || '127.0.0.1';
const DIST = path.join(__dirname, 'dist');

// Sandbox session: fixed test avatar (Wayne), ~60s auto-terminate, no credits.
// Flip to production later: set IS_SANDBOX=false and AVATAR_ID to your own avatar.
const SANDBOX_AVATAR_ID = 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function handleSession(req, res) {
  const key = process.env.LIVEAVATAR_API_KEY;
  if (!key) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'LIVEAVATAR_API_KEY is not set. Copy .env.example to .env and add your key from app.liveavatar.com/developers, then restart.',
    }));
    return;
  }

  const persona = { language: 'en' };
  if (process.env.LIVEAVATAR_CONTEXT_ID) persona.context_id = process.env.LIVEAVATAR_CONTEXT_ID;
  if (process.env.LIVEAVATAR_VOICE_ID) persona.voice_id = process.env.LIVEAVATAR_VOICE_ID;

  const payload = {
    mode: 'FULL',
    is_sandbox: true,
    avatar_id: SANDBOX_AVATAR_ID,
    // Explicit: the agent must answer voice turns on its own. Without
    // this, a session could sit in push-to-talk gating and transcribe
    // speech without ever replying to it.
    interactivity_type: 'CONVERSATIONAL',
    avatar_persona: persona,
  };

  let upstream;
  try {
    upstream = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Could not reach api.liveavatar.com: ${err.message}` }));
    return;
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `LiveAvatar rejected the token request (HTTP ${upstream.status}). A 401 usually means a bad or missing API key. Upstream said: ${text.slice(0, 300)}`,
    }));
    return;
  }

  let data;
  try {
    data = JSON.parse(text).data;
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'LiveAvatar returned an unexpected token response.' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ session_token: data.session_token, session_id: data.session_id }));
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/session') {
    handleSession(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Server error: ${err.message}` }));
    });
    return;
  }

  // Static files from ./dist (run `npm run build` first).
  let filePath = path.join(DIST, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found. Run `npm run build` first, then restart the server.');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Sandbox demo running at http://${HOST}:${PORT}`);
  if (!process.env.LIVEAVATAR_API_KEY) {
    console.log('NOTE: LIVEAVATAR_API_KEY is not set — /api/session will report that until you add it to .env.');
  }
});

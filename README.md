# Interactive Avatar Agent

Build your own live, talking AI avatar — a starter using HeyGen LiveAvatar
(FULL mode), with a free sandbox demo. An interactive avatar agent is a
real-time digital avatar that answers questions by voice or text, using
speech recognition, a language model, and text-to-speech to hold a
conversation instead of playing a pre-recorded video.

This repo is a starter: take it, swap in your own avatar and knowledge,
and run it. It contains only the generic demo — no personal data, no
run-environment specifics, and no knowledge-base content (see
`knowledge.md.example` for the template). Your API key stays in your own
`.env` and is never committed.

## What you get

- **Live voice conversation** — speak into the mic, or type; the avatar answers in real time.
- **Persona and knowledge base** — the avatar's behaviour and facts live in a LiveAvatar Context you control.
- **Server-side token minting** — the API key never reaches the browser; the frontend only sees a short-lived session token.
- **Free sandbox** — no credits spent, ~60-second sessions, fixed test avatar (Wayne). The only thing you need is a LiveAvatar API key.
- **Minimal stack** — one Node.js backend file (`server.mjs`), a Vite frontend, and LiveKit video.

## How it works

```
Browser ──POST /api/session──▶ server.mjs ──X-API-KEY──▶ api.liveavatar.com
Browser ◀── session_token ─── server.mjs ◀── token ──── api.liveavatar.com
Browser ──LiveAvatarSession──▶ LiveKit room (video + mic, via the SDK)
```

The API key never leaves the server. The frontend only ever sees a
short-lived session token, and the `@heygen/liveavatar-web-sdk` handles
session start and the LiveKit connection itself.

## Run it

```bash
npm install
cp .env.example .env
# edit .env: paste your key from https://app.liveavatar.com/developers
npm run build
node server.mjs
# open http://localhost:3000
```

Then: **Start session** → allow the mic → talk. Or type in the box and hit
**Send** (the avatar answers through its LLM). **Interrupt** cuts it off
mid-speech; **Stop** ends the session. When the ~60s sandbox cap hits,
press **Start** again for a fresh session.

For development with hot reload instead: run `node server.mjs` in one
terminal and `npm run dev` in another, then open the Vite URL (port 5173).
`/api` calls are proxied to the token server.

## Sandbox rules that shape testing

- **~60 seconds per session.** Design each test as one exchange: one
  question, one answer. Restarting is one click.
- **Fixed avatar.** Sandbox always uses Wayne. Your own avatar only works
  in production sessions.
- **Context matters.** Create a context (persona + opening greeting) via
  `POST /v1/contexts` and set `LIVEAVATAR_CONTEXT_ID`. Without one, the
  avatar may stream video but stay silent — with no error.
- **Mic needs localhost or HTTPS.** `http://localhost:3000` is fine. If
  you expose it over plain HTTP on another host, the browser will block
  the mic and you'll be text-only.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401` from `/api/session` | Bad or missing `LIVEAVATAR_API_KEY` |
| Avatar moves but never speaks | No `LIVEAVATAR_CONTEXT_ID` set |
| Text works, mic doesn't | See "Voice chat" below |
| Session ends after ~1 minute | Expected sandbox behavior — press Start again |

### Voice chat

The mic is started only after the video stream is ready — starting it
earlier silently does nothing (the SDK logs a warning and returns, no
error). The status line now reports the mic's real state; use the
**Unmute mic / Mute mic** button to retry or toggle. If it still fails:

1. Check the browser's site settings: mic must be **Allowed** for the
   page. A denied permission puts the demo in text-only mode.
2. Confirm you're on `http://localhost:3000` (via the SSH tunnel). Plain
   `http://<server-ip>` is not a secure context, so browsers block the
   mic there even if permission looks granted.
3. Check the browser console for `getUserMedia` errors (no mic device,
   another app holding the mic).
4. Note the avatar's replies also come through the `<video>` element —
   if you can talk but can't hear it, check the page isn't muted and
   the system volume.

## Knowledge base

A FULL-mode avatar's knowledge lives in its **Context**. Three layers,
in increasing power:

1. **Knowledge text (simplest).** Facts written directly into the
   Context's prompt. `create-context.mjs` does this: put facts in
   `knowledge.md`, and it builds a Context with a Knowledge section
   plus an instruction to prioritize it and not invent facts.
2. **Links.** `links.json` entries of `{"url": "...", "faq": "..."}`.
   LiveAvatar scrapes each URL and *summarizes* it into Knowledge — it
   does not exhaustively catalogue the page. So: summaries for
   background, exact facts in `knowledge.md`.
3. **Your own LLM + retrieval (full control).** For real document
   search (PDFs, large corpora), store an LLM key via
   `POST /v1/secrets`, create an LLM configuration, and pass
   `llm_configuration_id` in the session token — or switch to LITE
   mode with your own agent. Then retrieval lives in your stack, and
   LiveAvatar only renders the face.

Create a Context from the demo folder (key already in `.env`):

```bash
cp knowledge.md.example knowledge.md   # edit with your facts
node create-context.mjs \
  --name "Support Agent" \
  --persona "You are a friendly support agent. Keep answers concise." \
  --opening "Hi! How can I help?" \
  --knowledge-file knowledge.md \
  --save
# restart the demo server so it picks up the new LIVEAVATAR_CONTEXT_ID
```

Caveat: the sandbox example in LiveAvatar's guide ships without a
context. A `context_id` is accepted in the token payload, but if a
sandbox session seems to ignore your knowledge, test the same context
in a production session — sandbox behavior may differ.

## Flip to production later

Two-line change in `server.mjs`: set `is_sandbox: false` (or remove the
flag) and replace `SANDBOX_AVATAR_ID` with your own avatar's ID. The
context, token flow, and frontend code stay identical. Production sessions
bill 2 credits/minute in FULL mode and cap at 20 minutes on Essential
(60 on Business) — and then you'll want a keep-alive ping every 2–3
minutes, since sessions time out after 5 minutes of inactivity.

## FAQ

### Can I use my own avatar instead of the sandbox test avatar?

Yes. Sandbox sessions always use HeyGen's fixed Wayne test avatar. For
production, create your own avatar on HeyGen, set `is_sandbox` to `false`
in `server.mjs`, and replace the avatar ID. The token flow, context, and
frontend code stay identical.

### How much does it cost to run?

The sandbox is free: no credits are spent and sessions auto-end after
about 60 seconds. Production bills 2 credits per minute in FULL mode. The
free plan includes 10 credits a month; Essential is $99 a month for 1,100
credits, about $0.18 per minute.

### Do I need a server?

Yes, a small one. The backend is a single Node.js file (`server.mjs`) that
mints session tokens server-side and serves the page. It runs anywhere
Node.js runs — on your own machine or a small VPS — and the API key stays
on the server, never in the browser.

### What can the avatar talk about?

Whatever you put in its Context. Knowledge text in the prompt is the
strongest signal; `links` let LiveAvatar summarise pages into knowledge;
or bring your own LLM with retrieval via `llm_configuration_id`. Without
a Context, the avatar may stream video but stay silent.

### Does it only work with HeyGen LiveAvatar?

No. LiveAvatar is the current backend — it runs speech recognition, the
language model, text-to-speech, and WebRTC in FULL mode. The backend and
frontend are small and swappable, so other live-avatar platforms can be
added behind the same session flow.

## Files

- `server.mjs` — token minting + static file server (the only backend)
- `index.html`, `src/main.js`, `src/style.css` — the page
- `vite.config.js` — dev proxy for `/api`
- `.env.example` — config template

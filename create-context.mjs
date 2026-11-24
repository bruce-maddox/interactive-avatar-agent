// Creates a LiveAvatar Context (persona + knowledge base) from local files
// and optionally wires it into .env as LIVEAVATAR_CONTEXT_ID.
//
// A Context is how a FULL-mode avatar "knows" things:
//   - prompt:      persona + instructions + knowledge, sent to the LLM
//   - opening_text: what the avatar says first
//   - links:       [{ url, faq }] — LiveAvatar scrapes each URL and
//                  SUMMARIZES it into the Knowledge section. It does NOT
//                  exhaustively catalogue the page, so put must-know facts
//                  in the knowledge file itself, not only behind links.
//
// Usage (from the demo folder, with .env holding LIVEAVATAR_API_KEY):
//   node create-context.mjs \
//     --name "Support Agent" \
//     --persona "You are a friendly support agent. Keep answers concise." \
//     --opening "Hi! How can I help?" \
//     --knowledge-file knowledge.md \
//     --links-file links.json \
//     --save
// With --save, .env's LIVEAVATAR_CONTEXT_ID is updated in place (the key
// line is untouched). Restart the demo server afterwards so it picks up
// the new id. Without --save, the id is just printed.
//
// links.json format: [{ "url": "https://example.com/faq", "faq": "Pricing and refunds" }]

import fs from 'node:fs';

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const envPath = '.env';
if (!fs.existsSync(envPath)) {
  console.error('No .env found. Copy .env.example to .env and add LIVEAVATAR_API_KEY first.');
  process.exit(1);
}
const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
if (!env.LIVEAVATAR_API_KEY) {
  console.error('LIVEAVATAR_API_KEY is not set in .env.');
  process.exit(1);
}

const persona = args.persona || 'You are a helpful assistant. Keep answers concise and speakable.';
const knowledge = args['knowledge-file'] ? fs.readFileSync(args['knowledge-file'], 'utf8') : '';
const prompt = knowledge
  ? `${persona}\n\nKnowledge:\n${knowledge}\n\nAlways prioritize the Knowledge above when answering. If the Knowledge does not cover the question, say so instead of inventing facts.`
  : persona;
const links = args['links-file'] ? JSON.parse(fs.readFileSync(args['links-file'], 'utf8')) : undefined;

const body = {
  name: args.name || 'Demo Agent',
  prompt,
  opening_text: args.opening || 'Hi there! How can I help you today?',
  ...(links ? { links } : {}),
};

const res = await fetch('https://api.liveavatar.com/v1/contexts', {
  method: 'POST',
  headers: { 'X-API-KEY': env.LIVEAVATAR_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Context creation failed (HTTP ${res.status}): ${text.slice(0, 500)}`);
  process.exit(1);
}
const id = JSON.parse(text).data.id;
console.log(`Context created: ${id}`);

if (args.save) {
  let envText = fs.readFileSync(envPath, 'utf8');
  if (/^LIVEAVATAR_CONTEXT_ID=.*/m.test(envText)) {
    envText = envText.replace(/^LIVEAVATAR_CONTEXT_ID=.*/m, `LIVEAVATAR_CONTEXT_ID=${id}`);
  } else {
    envText = envText.trimEnd() + `\nLIVEAVATAR_CONTEXT_ID=${id}\n`;
  }
  fs.writeFileSync(envPath, envText);
  console.log('Saved LIVEAVATAR_CONTEXT_ID to .env. Restart the demo server to use it.');
} else {
  console.log('Re-run with --save to write it into .env, or set LIVEAVATAR_CONTEXT_ID manually.');
}

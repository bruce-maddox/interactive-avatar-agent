// Frontend for the LiveAvatar sandbox demo.
// The API key never appears here: the backend mints a short-lived session
// token, and the SDK handles session start + the LiveKit connection itself.
//
// Audio lesson learned the hard way: voiceChat.start() SILENTLY does
// nothing (console.warn only, no throw) if the session isn't active yet.
// So the mic is started only after SESSION_STREAM_READY fires, and the
// UI reports the mic's real state instead of assuming it worked.

import {
  LiveAvatarSession,
  SessionEvent,
  AgentEventsEnum,
  VoiceChatState,
} from '@heygen/liveavatar-web-sdk';

const videoEl = document.getElementById('avatarVideo');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const interruptBtn = document.getElementById('interruptBtn');
const micBtn = document.getElementById('micBtn');
const soundBtn = document.getElementById('soundBtn');
const debugEl = document.getElementById('debug');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');

let session = null;
let micOn = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function addLine(who, text) {
  if (!text) return;
  const div = document.createElement('div');
  div.className = who === 'You' ? 'line user' : 'line avatar';
  div.textContent = `${who}: ${text}`;
  transcriptEl.appendChild(div);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// Event payloads vary slightly by SDK version; pull text defensively.
function pickText(e) {
  if (!e) return '';
  if (typeof e === 'string') return e;
  return e.text ?? e.detail?.text ?? e.transcript ?? '';
}

function setLive(live) {
  startBtn.disabled = live;
  stopBtn.disabled = !live;
  interruptBtn.disabled = !live;
  micBtn.disabled = !live;
  soundBtn.disabled = !live;
  textInput.disabled = !live;
  sendBtn.disabled = !live;
}

function refreshDebug() {
  debugEl.textContent =
    `video: paused=${videoEl.paused} muted=${videoEl.muted} volume=${videoEl.volume} readyState=${videoEl.readyState}`;
}

// Browsers block AUDIBLE playback that starts outside a user gesture.
// The stream arrives seconds after the Start click, so that click doesn't
// count — this button IS a gesture, and is the reliable way to unlock sound.
async function enableSound() {
  videoEl.muted = false;
  videoEl.volume = 1;
  try {
    await videoEl.play();
    soundBtn.textContent = 'Sound on ✓';
    setStatus('Sound on — you should now hear the avatar.');
  } catch (err) {
    setStatus(`Sound blocked by browser: ${err.message} — click Enable sound again.`);
  }
  refreshDebug();
}

function refreshMicButton() {
  micBtn.textContent = micOn ? 'Mute mic' : 'Unmute mic';
}

// Start the mic and REPORT the outcome visibly. Never assume success:
// a silent no-op here was the original "text works, no voice" bug.
async function startMic() {
  if (!session) return;
  try {
    await session.voiceChat.start();
  } catch (err) {
    micOn = false;
    refreshMicButton();
    setStatus(`Mic failed: ${err.message} — text input still works. Check the browser's mic permission for this site.`);
    return;
  }
  if (session.voiceChat.state === VoiceChatState.ACTIVE) {
    micOn = true;
    refreshMicButton();
    setStatus('Live — mic on, just talk. (Sandbox sessions end after ~60s.)');
  } else {
    // start() returned without activating (e.g. session not ready yet).
    micOn = false;
    refreshMicButton();
    setStatus('Mic did not activate — press "Unmute mic" to retry, or use text.');
  }
}

async function toggleMic() {
  if (!session) return;
  try {
    if (micOn) {
      await session.voiceChat.mute();
      micOn = false;
      refreshMicButton();
      setStatus('Mic muted — text input still works.');
    } else if (session.voiceChat.state === VoiceChatState.ACTIVE) {
      await session.voiceChat.unmute();
      micOn = true;
      refreshMicButton();
      setStatus('Live — mic on, just talk.');
    } else {
      await startMic();
    }
  } catch (err) {
    setStatus(`Mic action failed: ${err.message}`);
  }
}

async function startSession() {
  setLive(false);
  setStatus('Minting sandbox session…');
  try {
    const res = await fetch('/api/session', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Session request failed (HTTP ${res.status})`);

    session = new LiveAvatarSession(data.session_token);

    // The session is only guaranteed active from here on — this is the
    // correct place to attach video AND start the mic.
    session.on(SessionEvent.SESSION_STREAM_READY, async () => {
      session.attach(videoEl);
      // Best-effort unmute: browsers often block this (no gesture here),
      // so the Enable sound button below is the reliable path.
      videoEl.muted = false;
      try {
        await videoEl.play();
      } catch (err) {
        console.warn('Video autoplay blocked:', err);
      }
      refreshDebug();
      setLive(true);
      setStatus('Stream ready — click "Enable sound", then talk.');
      await startMic();
    });

    session.on(SessionEvent.SESSION_DISCONNECTED, () => {
      setStatus('Session ended. Press Start for a fresh ~60s session.');
      micOn = false;
      refreshMicButton();
      soundBtn.textContent = 'Enable sound';
      setLive(false);
      session = null;
    });

    // Transcripts (FULL-mode agent events). Guarded: the session still
    // works without them if event names ever change.
    try {
      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => addLine('You', pickText(e)));
      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => addLine('Avatar', pickText(e)));
      // Speak-state trace: tells us whether the agent hears a finished
      // turn (speak_ended) and then fails to answer, vs never finishing.
      session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
        debugEl.textContent = 'event: user.speak_started';
      });
      session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
        debugEl.textContent = 'event: user.speak_ended — waiting for reply…';
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => setStatus('Avatar is speaking…'));
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        if (micOn) setStatus('Live — mic on, just talk.');
      });
    } catch (err) {
      console.warn('Transcript events unavailable:', err);
    }

    await session.start();
    setStatus('Session starting… waiting for the video stream.');
  } catch (err) {
    console.error(err);
    setStatus(`Failed: ${err.message}`);
    setLive(false);
  }
}

async function stopSession() {
  try {
    await session?.stop();
  } catch (err) {
    console.warn('Stop failed:', err);
  }
  session = null;
  micOn = false;
  refreshMicButton();
  setStatus('Session ended. Press Start for a fresh ~60s session.');
  setLive(false);
}

async function sendText() {
  const text = textInput.value.trim();
  if (!text || !session) return;
  addLine('You', text);
  textInput.value = '';
  try {
    await session.message(text); // LLM-generated reply, spoken by the avatar
  } catch (err) {
    setStatus(`Send failed: ${err.message}`);
  }
}

startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
interruptBtn.addEventListener('click', () => session?.interrupt?.());
micBtn.addEventListener('click', toggleMic);
soundBtn.addEventListener('click', enableSound);
sendBtn.addEventListener('click', sendText);
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendText();
});

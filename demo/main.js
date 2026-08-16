import { createCue } from '../src/index.js';
import { moonshine } from '../src/models/index.js';

const scriptInput = document.querySelector('#script');
const loadButton = document.querySelector('#load');
const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const status = document.querySelector('#status');
const transcript = document.querySelector('#transcript');
const prompter = document.querySelector('#prompter');

const cue = createCue({
  script: scriptInput.value,
  model: moonshine(),
});

let wordElements = [];

function renderScript() {
  prompter.replaceChildren();
  wordElements = cue.words.map((word) => {
    const element = document.createElement('span');
    element.className = 'word';
    element.dataset.position = String(word.index);
    element.textContent = `${word.text} `;
    prompter.append(element);
    return element;
  });
  showPosition(cue.position);
}

function showPosition(position) {
  for (let index = 0; index < wordElements.length; index += 1) {
    wordElements[index].classList.toggle('past', index < position);
    wordElements[index].classList.toggle('current', index === position);
  }
  wordElements[position]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function formatBytes(bytes) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

cue.addEventListener('statechange', ({ detail }) => {
  if (detail.status === 'preparing') {
    status.textContent =
      detail.phase === 'warmup'
        ? 'Warming up the speech model…'
        : `Downloading ${detail.file ?? 'speech model'}${detail.loadedBytes ? ` — ${formatBytes(detail.loadedBytes)}` : '…'}`;
  } else if (detail.status === 'error') {
    status.textContent = `Error: ${detail.error?.message ?? detail.error}`;
  } else {
    status.textContent = detail.status[0].toUpperCase() + detail.status.slice(1);
  }

  const listening = detail.status === 'listening';
  startButton.disabled = listening || detail.status === 'preparing';
  stopButton.disabled = !listening && detail.status !== 'preparing';
  loadButton.disabled = listening || detail.status === 'preparing';
  scriptInput.disabled = listening || detail.status === 'preparing';
});

cue.addEventListener('transcript', ({ detail }) => {
  transcript.textContent = detail.text;
});

cue.addEventListener('positionchange', ({ detail }) => {
  showPosition(detail.position);
});

loadButton.addEventListener('click', () => {
  cue.setScript(scriptInput.value);
  transcript.textContent = '';
  status.textContent = `${cue.words.length} words loaded`;
  renderScript();
});

startButton.addEventListener('click', () => {
  // Keep start() directly in this click stack so Safari can unlock Web Audio.
  cue.start().catch(() => {});
});

stopButton.addEventListener('click', () => {
  cue.stop().catch((error) => {
    status.textContent = `Error: ${error.message}`;
  });
});

renderScript();
status.textContent = `${cue.words.length} words loaded`;

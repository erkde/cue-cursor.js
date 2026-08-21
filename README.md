# cue-cursor.js

A browser library for building voice-following teleprompters.

## Quick start

```js
import { createCue } from 'cue-cursor.js';
import { moonshine } from 'cue-cursor.js/models';

const cue = createCue({
  script: 'The words that should appear in the teleprompter.',
  model: moonshine(),
});

cue.addEventListener('positionchange', ({ detail }) => {
  highlightWord(detail.position);
});

// Diagnostics contain runtime metadata and timings, never audio or text.
cue.addEventListener('diagnostic', ({ detail }) => {
  console.debug(detail);
});

startButton.addEventListener('click', () => void cue.start());
stopButton.addEventListener('click', () => void cue.stop());
```

`start()` begins listening and should be called directly from a user gesture so
browsers can unlock microphone capture. `stop()` pauses listening while keeping
the Cue instance available for another `start()`.

Call `prepare()` earlier if the application wants to download and warm the model
before the user starts reading.

For lifecycle cleanup, call `cue.terminate()` from `pagehide` when the model worker
must be stopped synchronously; use the asynchronous `cue.destroy()` for normal
application shutdown so the model can dispose cleanly.

```js
window.addEventListener('pagehide', () => cue.terminate());
```

Scripts can be plain text or explicit words. Explicit words let a rich-text UI
retain its own mapping:

```js
cue.setScript([
  { text: 'Welcome', key: 'word-1' },
  { text: 'back.', key: 'word-2' },
]);
```

## Reading observations

Cue exposes neutral observations so applications can build reading session histories,
partial reviews, overlays, or other script-related tools without the library
deciding what counts as a mistake.

`capturechange` reports when microphone capture actually starts and stops. This
can differ from the requested listening state when the document is hidden or
the model is still preparing. `speechactivitychange` reports transitions from
Cue's audio gate and includes the script position at that moment.
It is an estimate of speech activity, not a definitive voice classification.

```js
cue.addEventListener('capturechange', ({ detail }) => {
  console.log('capturing:', detail.active);
});

cue.addEventListener('speechactivitychange', ({ detail, timeStamp }) => {
  console.log('speech activity:', detail.active, detail.position, timeStamp);
});
```

Each non-empty, non-duplicate `transcript` includes the matcher's observation.
`candidatePosition` is where the speech matched, while `position` is the cursor
position Cue actually applied. They differ when Cue deliberately holds a small
backward match to keep the prompter stable.

```js
cue.addEventListener('transcript', ({ detail, timeStamp }) => {
  const { previousPosition, candidatePosition, position, outcome } = detail.match;
  console.log({ timeStamp, previousPosition, candidatePosition, position, outcome });
});
```

Event `timeStamp` values provide the monotonic timeline. Applications own reading session
boundaries: stopping Cue can end a capture segment without requiring the
application to discard the observations collected so far.

The built-in Moonshine adapter bundles its pinned Transformers.js dependency as
a separate, lazy browser asset. The ONNX Runtime WASM binary remains an external
download; Transformers.js uses its pinned CDN location by default.

The adapter
accepts optional `runtimeUrl`, `modelBaseUrl`, and `wasmBaseUrl` overrides for
self-hosting. The library itself does not assume a hosting provider or proxy.

Applications that want the most explicit model boundary can import Moonshine
directly. This guarantees that future built-in models cannot enter the same
module graph accidentally:

```js
import { moonshine } from 'cue-cursor.js/models/moonshine';
```

## Local demo

The demo is a local development harness, not a hosted application. It contains
no Cloudflare configuration, service worker, analytics, or deployment setup.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, load the sample script, and select **Start
listening**. The first start downloads and warms the default Moonshine model.

## Commands

```sh
npm test       # unit tests
npm run build  # build and validate the package output
npm run size   # production output sizes: raw, gzip, and Brotli
npm run package:check # run every release check and inspect the package contents
```

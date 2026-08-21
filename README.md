# cue-cursor.js

A browser library for building voice-following teleprompters.

Cue listens to microphone audio, matches recognized speech against a script,
and reports the current word. The application remains responsible for rendering
the script and deciding how to present or review a reading.

## Install

```sh
npm install cue-cursor.js
```

## Create a cursor

```js
import { createCue } from "cue-cursor.js";
import { moonshine } from "cue-cursor.js/models/moonshine";

const cue = createCue({
  script: "The words that should appear in the teleprompter.",
  model: moonshine(),
});

cue.addEventListener("positionchange", ({ detail }) => {
  highlightWord(detail.position);
});
```

`positionchange` reports the script position whenever speech or an explicit
`seek()` moves the cursor.

## Start and stop listening

Call `start()` directly from a click or tap. Browsers generally require a user
gesture before they allow microphone capture.

```js
startButton.addEventListener("click", () => void cue.start());
stopButton.addEventListener("click", () => void cue.stop());
```

`stop()` pauses listening without discarding the model or script. The same Cue
instance can be started again.

### Prepare ahead of time

Call `prepare()` when the application should load and warm the model ahead of time:

```js
await cue.prepare();
```

A later call to `start()` will then request microphone access and begin listening
without waiting for model preparation.

## Provide a script

Pass plain text when creating Cue, or replace it later with `setScript()`.
Stop listening before replacing the script.

Rich-text applications can provide explicit words with stable keys that map
back to rendered elements:

```js
cue.setScript([
  { text: "Welcome", key: "word-1" },
  { text: "back.", key: "word-2" },
]);
```

## Events

| Event                  | What it reports                                       |
| ---------------------- | ----------------------------------------------------- |
| `capturechange`        | Microphone capture actually starting or stopping      |
| `diagnostic`           | Privacy-safe runtime metadata and performance timings |
| `positionchange`       | Cursor movement caused by speech or `seek()`          |
| `speechactivitychange` | Transitions from Cue's audio gate                     |
| `statechange`          | Model preparation, listening, errors, and shutdown    |
| `transcript`           | Recognized text and its script-match observation      |

### Capture and speech activity

Requested listening and actual microphone capture are not always the same. The
model may still be preparing, or the page may have become hidden.

```js
cue.addEventListener("capturechange", ({ detail }) => {
  console.log("capturing:", detail.active);
});

cue.addEventListener("speechactivitychange", ({ detail, timeStamp }) => {
  console.log("speech activity:", detail.active, detail.position, timeStamp);
});
```

Speech activity is an estimate from Cue's audio gate, not a definitive voice
classification. Short transitions may need smoothing before being shown in a
review interface.

### Transcript matches

Each non-empty, non-duplicate transcript includes a neutral match observation:

```js
cue.addEventListener("transcript", ({ detail, timeStamp }) => {
  const { previousPosition, candidatePosition, position, outcome } =
    detail.match;
  console.log({
    timeStamp,
    previousPosition,
    candidatePosition,
    position,
    outcome,
  });
});
```

The outcomes are:

- `moved`: the cursor moved to the matched position.
- `stationary`: the transcript matched the current position.
- `held`: speech matched slightly behind, but Cue held the cursor steady.
- `unmatched`: Cue found no confident script position.

`candidatePosition` is where the transcript matched. `position` is where Cue
actually left the cursor. They differ for a `held` result.

### Reading-session timelines

Every browser event includes a monotonic `timeStamp`. Applications can combine
those timestamps into reading-session histories, overlays, or review tools.

Cue deliberately does not decide what constitutes a session, pause, mistake,
or reread. For example, an application may treat each capture period as a new
session, or combine several capture periods into one review.

### Diagnostics

Diagnostics contain model/runtime metadata and timings. They never contain
audio or recognized text.

```js
cue.addEventListener("diagnostic", ({ detail }) => {
  console.debug(detail);
});
```

## Cleanup and page lifecycle

### Normal shutdown

Use `destroy()` when the application can wait for the model to dispose cleanly:

```js
await cue.destroy();
```

### Leaving the page

Use `terminate()` when a `pagehide` handler must stop the model worker
synchronously:

```js
window.addEventListener("pagehide", () => cue.terminate());
```

Termination permanently destroys that Cue instance. If the page is restored
from the back/forward cache, create a new instance during `pageshow` before
listening again.

## Moonshine model

Importing the adapter directly keeps the model boundary explicit:

```js
import { moonshine } from "cue-cursor.js/models/moonshine";
```

The shorter `cue-cursor.js/models` export is also available. A direct import
ensures future built-in models cannot enter the same module graph accidentally.

### Runtime assets

Moonshine loads its pinned Transformers.js runtime as a separate, lazy browser
asset. The ONNX Runtime WASM binary remains an external download and uses the
pinned Transformers.js CDN location by default.

For self-hosting, the adapter accepts `runtimeUrl`, `modelBaseUrl`,
`wasmBaseUrl`, and `wasmPaths`. It does not assume a hosting provider or proxy.

## Local development

The included demo is a development harness. It has no Cloudflare configuration,
service worker, analytics, or deployment setup.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, load the sample script, and select **Start
listening**. The first start downloads and warms the default Moonshine model.

## Commands

```sh
npm test              # unit tests
npm run build         # build and validate package output
npm run size          # report raw, gzip, and Brotli sizes
npm run package:check # run release checks and inspect package contents
```

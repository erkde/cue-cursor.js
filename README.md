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

startButton.addEventListener('click', () => cue.start());
stopButton.addEventListener('click', () => cue.stop());
```

Call `start()` directly from a user gesture so browsers can unlock microphone
capture, or call `prepare()` earlier if the application wants to download and warm
the model before the user starts reading.

Scripts can be plain text or explicit words. Explicit words let a rich-text UI
retain its own mapping:

```js
cue.setScript([
  { text: 'Welcome', key: 'word-1' },
  { text: 'back.', key: 'word-2' },
]);
```

The built-in Moonshine adapter emits its pinned Transformers.js dependency as a
separate, lazy browser asset. It accepts optional `runtimeUrl`, `modelBaseUrl`,
and `wasmBaseUrl` overrides for self-hosting. The library itself does not assume
a hosting provider or proxy.

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
npm run dev    # local demo
npm test       # unit tests
npm run build  # package build
npm run check  # tests and build
npm run size   # production output sizes: raw, gzip, and Brotli
npm run package:check # verify tests, build, and published package contents
```

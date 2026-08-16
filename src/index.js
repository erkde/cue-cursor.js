import { Cue } from './cue.js';

export function createCue({ script = [], model } = {}) {
  return new Cue({ script, model });
}

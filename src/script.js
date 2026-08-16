import { normalizeWord } from './matcher.js';

function inputTokens(script) {
  if (typeof script === 'string') return script.split(/\s+/).filter(Boolean);
  if (!Array.isArray(script)) {
    throw new TypeError('script must be a string or an array of words');
  }
  return script;
}

export function tokenizeScript(script) {
  const words = [];
  for (const input of inputTokens(script)) {
    const source = typeof input === 'string' ? { text: input } : input;
    if (!source || typeof source.text !== 'string') {
      throw new TypeError('each script word must be a string or an object with a text property');
    }
    const normalized = normalizeWord(source.text);
    if (!normalized) continue;
    words.push(
      Object.freeze({
        index: words.length,
        text: source.text,
        normalized,
        ...(source.key == null ? {} : { key: source.key }),
      }),
    );
  }
  return Object.freeze(words);
}

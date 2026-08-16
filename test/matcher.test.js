import test from 'node:test';
import assert from 'node:assert/strict';
import { Matcher, normalizeWord } from '../src/matcher.js';

const SCRIPT =
  'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango'.split(
    ' ',
  );
const fresh = () => new Matcher([...SCRIPT]);

test('normalizeWord handles punctuation, apostrophes, and Unicode', () => {
  assert.equal(normalizeWord('Hello,'), 'hello');
  assert.equal(normalizeWord("DON'T"), "don't");
  assert.equal(normalizeWord('café'), 'café');
  assert.equal(normalizeWord('...'), '');
});

test('feed advances to the end of a confident match', () => {
  const matcher = fresh();
  assert.equal(matcher.feed('alpha bravo charlie'), 2);
  assert.equal(matcher.feed('delta echo foxtrot'), 5);
});

test('feed tolerates one bad trailing recognition word', () => {
  const matcher = new Matcher(['welcome', 'to', 'cue', 'good', 'evening']);
  assert.equal(matcher.feed('welcome to queue'), 1);
});

test('small backward wobble is ignored but a genuine reread is honored', () => {
  const matcher = fresh();
  matcher.feed('oscar papa quebec');
  const held = matcher.cursor;
  matcher.feed('november oscar papa');
  assert.equal(matcher.cursor, held);
  matcher.feed('alpha bravo charlie');
  assert.ok(matcher.cursor <= 3);
});

test('seek clamps and reanchors the matcher', () => {
  const matcher = fresh();
  assert.equal(matcher.seek(12), 12);
  assert.equal(matcher.seek(-10), 0);
  assert.equal(matcher.seek(999), SCRIPT.length - 1);
});

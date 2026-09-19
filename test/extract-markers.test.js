const test = require('node:test');
const assert = require('node:assert/strict');
const { extractMarkedWords, extractEnglishCandidates } = require('../src/extract-markers');

test('extracts common study marks', () => {
  const text = 'The *abandon* of **reluctant** students, see [ephemeral] and 【lucid】 plus ★vivid and #sparse.';
  assert.deepEqual(extractMarkedWords(text), ['abandon', 'reluctant', 'ephemeral', 'lucid', 'vivid', 'sparse']);
});

test('ignores unmarked running text', () => {
  assert.deepEqual(extractMarkedWords('This is just a sentence about nothing in particular.'), []);
});

test('deduplicates case-insensitively', () => {
  assert.deepEqual(extractMarkedWords('*Apple* and [apple]'), ['Apple']);
});

test('extracts english candidates from ocr noise', () => {
  const words = extractEnglishCandidates('这是 reluctant 的意思, also lucid.');
  assert.ok(words.includes('reluctant'));
  assert.ok(words.includes('lucid'));
});

test('keeps highlighted phrases and comma-separated items', () => {
  const { extractScanItems } = require('../src/extract-markers');
  assert.deepEqual(
    extractScanItems('stem from, derive, on account of, in that'),
    ['stem from', 'derive', 'on account of', 'in that']
  );
  assert.deepEqual(
    extractScanItems('neglect, overlook, underestimate'),
    ['neglect', 'overlook', 'underestimate']
  );
  assert.ok(!extractScanItems('of, to, the').length);
});

test('all-scan mode keeps content words and drops short stopwords', () => {
  const words = extractEnglishCandidates('The reluctant students can see lucid examples.');
  assert.ok(words.includes('reluctant'));
  assert.ok(words.includes('students'));
  assert.ok(words.includes('lucid'));
  assert.ok(!words.map(item => item.toLowerCase()).includes('the'));
  assert.ok(!words.map(item => item.toLowerCase()).includes('can'));
});

test('all-scan mode keeps vocab phrases from table-like OCR', () => {
  const { extractPageScanItems } = require('../src/extract-markers');
  const text = [
    "reserve [ri'z3:v] v. 预订    book",
    'in advance 提前    ahead, before',
    'have to 必须    must, should, need, require, necessary, be supposed to, demand, order',
    "adjust [ə'dʒʌst] v. 调整；改变    change, alter, modify, shift, revert",
    'and [ənd] conj. 和    and also, as well as, with, in addition',
    'because [bi\'kɒz] conj. 因为    why, as a result, therefore, cause',
  ].join('\n');
  const items = extractPageScanItems(text);
  [
    'reserve', 'book', 'in advance', 'ahead', 'before', 'have to',
    'be supposed to', 'adjust', 'change', 'alter', 'modify',
    'and also', 'as well as', 'in addition', 'as a result', 'because',
  ].forEach((item) => {
    assert.ok(items.includes(item), `missing ${item}: ${items.join(' | ')}`);
  });
});

test('dictation matching ignores case, extra spaces, and hyphens', () => {
  const { dictationMatches } = require('../src/extract-markers');
  assert.equal(dictationMatches('stem from', '  STEM FROM '), true);
  assert.equal(dictationMatches('well-being', 'Well being'), true);
  assert.equal(dictationMatches("don't", 'Don’t'), true);
  assert.equal(dictationMatches('lucid', 'lucidly'), false);
  assert.equal(dictationMatches('lucid', ''), false);
});

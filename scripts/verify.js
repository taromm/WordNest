'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractMarkedWords } = require('../src/extract-markers');
const { Store, migrate, dueCount, dueWords, applyReview, createWord, emptyState } = require('../src/store');

assert.deepStrictEqual(
  extractMarkedWords('The *abandon* of **reluctant** students, see [ephemeral] and 【lucid】 plus ★vivid and #sparse.'),
  ['abandon', 'reluctant', 'ephemeral', 'lucid', 'vivid', 'sparse']
);
assert.deepStrictEqual(extractMarkedWords('plain text only'), []);

const migrated = migrate({
  version: 0,
  books: { reading: { words: [{ text: 'keep', meaning: '保留' }] } },
});
assert.strictEqual(migrated.books.reading.words[0].text, 'keep');
assert.strictEqual(migrated.books.reading.words[0].meaning, '保留');
assert.ok(migrated.settings.reminderMinutes);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
const store = new Store(path.join(dir, 'data.json'));
store.state = emptyState();
store.addWords('reading', [{ text: 'keep', meaning: '保留' }]);
const merged = store.addWords('reading', [{ text: 'keep' }, { text: 'new' }]);
assert.strictEqual(merged.added.length, 1);
assert.strictEqual(merged.existing.length, 1);
assert.strictEqual(store.getState().books.reading.words.find(word => word.text === 'keep').meaning, '保留');
assert.ok(dueCount(store.getState()) >= 1);

const imported = store.importMerge({
  books: {
    reading: { words: [{ text: 'keep', meaning: 'should not wipe' }, { text: 'third' }] },
  },
});
assert.strictEqual(imported.added, 1);
assert.strictEqual(store.getState().books.reading.words.find(word => word.text === 'keep').meaning, '保留');
assert.strictEqual(store.getState().books.reading.words.length, 3);

store.addWords('reading', [{ text: 'keep', meaning: '保留', tags: ['剑雅 17'] }]);
assert.deepStrictEqual(store.getState().books.reading.words.find(word => word.text === 'keep').tags, ['剑雅 17']);
assert.ok(store.getState().settings.savedTags.indexOf('剑雅 17') !== -1);

const now = Date.parse('2026-09-21T00:00:00.000Z');
let curveWord = createWord({ text: 'curve', createdAt: new Date(now).toISOString() });
curveWord = applyReview(curveWord, 'good', now);
assert.strictEqual(curveWord.review.intervalMinutes, 20);
curveWord = applyReview(curveWord, 'good', now + 20 * 60 * 1000);
assert.strictEqual(curveWord.review.intervalMinutes, 60);

const fresh = createWord({
  text: 'fresh',
  createdAt: new Date(now).toISOString(),
  review: { intervalMinutes: 90, dueAt: new Date(now).toISOString(), lastReviewedAt: new Date(now).toISOString(), forgetCount: 0 },
});
const rusty = createWord({
  text: 'rusty',
  createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
  review: { intervalMinutes: 90, dueAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), lastReviewedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), forgetCount: 2 },
});
const ranked = emptyState();
ranked.books.reading.words = [fresh, rusty];
assert.strictEqual(dueWords(ranked, 'reading', now + 60 * 60 * 1000)[0].word.text, 'rusty');

store.updateNotebook('listening', 'keep notes');
store.importOverwrite({
  books: { listening: { words: [{ text: 'x' }], notebook: '' } },
});
assert.strictEqual(store.getState().books.listening.notebook, 'keep notes');

assert.deepStrictEqual(
  require('../src/extract-markers').extractScanItems('stem from, neglect, overlook, underestimate'),
  ['stem from', 'neglect', 'overlook', 'underestimate']
);

const { pickExamples, extractCollinsExamples } = require('../src/dictionary');
const senseExamples = [
  { sentence: 'He advocates reform.', translation: '他提倡改革。', sense: 'If you advocate a plan, you recommend it. 提倡' },
  { sentence: 'The advocate spoke in court.', translation: '这位辩护律师在法庭上发言。', sense: 'An advocate is a lawyer. 辩护律师' },
];
assert.strictEqual(pickExamples(senseExamples, 'v. 拥护，提倡')[0].sentence, 'He advocates reform.');
assert.strictEqual(pickExamples(senseExamples, 'n. 辩护律师')[0].sentence, 'The advocate spoke in court.');
const collins = extractCollinsExamples({
  collins: {
    collins_entries: [{
      entries: {
        entry: [{
          tran_entry: [
            { tran: '提倡', exam_sents: { sent: [{ eng_sent: 'People advocate change.', chn_sent: '人们提倡变革。' }] } },
            { tran: '辩护律师', exam_sents: { sent: [{ eng_sent: 'She hired an advocate.', chn_sent: '她请了一位辩护律师。' }] } },
          ],
        }],
      },
    }],
  },
});
assert.strictEqual(collins.length, 2);
assert.strictEqual(pickExamples(collins, '辩护律师')[0].sentence, 'She hired an advocate.');

console.log('verify ok');

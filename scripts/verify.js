'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractMarkedWords } = require('../src/extract-markers');
const { Store, migrate, dueCount, emptyState } = require('../src/store');

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

assert.deepStrictEqual(
  require('../src/extract-markers').extractScanItems('stem from, neglect, overlook, underestimate'),
  ['stem from', 'neglect', 'overlook', 'underestimate']
);

console.log('verify ok');

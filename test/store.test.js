const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, migrate, dueCount, dueWords, applyReview, createWord, emptyState } = require('../src/store');

test('migrate never drops words from older files', () => {
  const migrated = migrate({
    version: 0,
    books: {
      reading: { words: [{ text: 'abandon', meaning: '放弃' }] },
      listening: { words: [{ text: 'vivid' }] },
    },
  });
  assert.equal(migrated.books.reading.words[0].text, 'abandon');
  assert.equal(migrated.books.listening.words[0].text, 'vivid');
  assert.equal(migrated.books.writing.words.length, 0);
  assert.ok(migrated.books.reading.words[0].id);
  assert.ok(migrated.books.reading.words[0].review.dueAt);
  assert.equal(migrated.settings.ieltsExamAt, '');
});

test('adding the same word does not delete the original', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  store.addWords('speaking', [{ text: 'lucid', meaning: '清晰的' }]);
  const result = store.addWords('speaking', [{ text: 'lucid', meaning: '' }, { text: 'sparse' }]);
  assert.equal(result.added.length, 1);
  assert.equal(result.existing.length, 1);
  assert.equal(store.getState().books.speaking.words.length, 2);
  assert.equal(store.getState().books.speaking.words.find(word => word.text === 'lucid').meaning, '清晰的');
});

test('import merges and keeps previous memory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  store.addWords('reading', [{ text: 'keep', meaning: '保留' }]);
  const summary = store.importMerge({
    books: {
      reading: { words: [{ text: 'keep' }, { text: 'new' }] },
    },
  });
  assert.equal(summary.added, 1);
  assert.equal(summary.existing, 1);
  const keep = store.getState().books.reading.words.find(word => word.text === 'keep');
  assert.equal(keep.meaning, '保留');
});

test('new words are due for review', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  store.addWords('writing', [{ text: 'ephemeral' }]);
  assert.equal(dueCount(store.getState()), 1);
});

test('deleteWords removes only the selected entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  store.addWords('reading', [{ text: 'keep' }, { text: 'drop' }, { text: 'stay' }]);
  const ids = store.getState().books.reading.words.filter(word => word.text !== 'keep').map(word => word.id);
  const result = store.deleteWords('reading', ids);
  assert.equal(result.deleted, 2);
  assert.equal(store.getState().books.reading.words.length, 1);
  assert.equal(store.getState().books.reading.words[0].text, 'keep');
});

test('tagWords merges tags onto selected entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  store.addWords('listening', [{ text: 'passport' }, { text: 'keep', tags: ['剑雅 21'] }]);
  const ids = store.getState().books.listening.words.map(word => word.id);
  const result = store.tagWords('listening', ids, ['场景词']);
  assert.equal(result.updated, 2);
  const passport = store.getState().books.listening.words.find(word => word.text === 'passport');
  const keep = store.getState().books.listening.words.find(word => word.text === 'keep');
  assert.deepEqual(passport.tags, ['场景词']);
  assert.ok(keep.tags.includes('剑雅 21'));
  assert.ok(keep.tags.includes('场景词'));
});

test('importOverwrite replaces books but keeps the local cloud token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  store.addWords('reading', [{ text: 'old' }]);
  store.updateSettings({ cloudToken: 'secret-token', cloudGistId: 'abc123' });
  const result = store.importOverwrite({
    books: {
      listening: { words: [{ text: 'new' }] },
    },
    settings: { cloudToken: 'from-cloud', ieltsExamAt: '2026-10-23T01:40:00.000Z' },
  });
  assert.equal(result.words, 1);
  assert.equal(store.getState().books.reading.words.length, 0);
  assert.equal(store.getState().books.listening.words[0].text, 'new');
  assert.equal(store.getState().settings.cloudToken, 'secret-token');
  assert.equal(store.getState().settings.cloudGistId, 'abc123');
  assert.equal(store.exportPublicState().settings.cloudToken, undefined);
});

test('keeps a saved IELTS exam time during migrate', () => {
  const migrated = migrate({
    settings: { ieltsExamAt: '2026-12-05T01:00:00.000Z' },
  });
  assert.equal(migrated.settings.ieltsExamAt, '2026-12-05T01:00:00.000Z');
});

test('each book keeps its own notebook through migrate and updates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  const migrated = migrate({
    books: {
      reading: { words: [{ text: 'keep' }], notebook: 'passage one' },
    },
  });
  assert.equal(migrated.books.reading.notebook, 'passage one');
  assert.equal(migrated.books.listening.notebook, '');
  store.state = migrated;
  store.updateNotebook('writing', 'task 2 outlines');
  assert.equal(store.getState().books.writing.notebook, 'task 2 outlines');
  assert.equal(store.getState().books.reading.notebook, 'passage one');
  assert.equal(store.getState().books.reading.words[0].text, 'keep');
});

test('review intervals follow the forgetting curve', () => {
  const now = Date.parse('2026-09-21T00:00:00.000Z');
  let word = createWord({ text: 'curve', createdAt: new Date(now).toISOString() });
  word = applyReview(word, 'good', now);
  assert.equal(word.review.intervalMinutes, 20);
  word = applyReview(word, 'good', now + 20 * 60 * 1000);
  assert.equal(word.review.intervalMinutes, 60);
  word = applyReview(word, 'again', now + 80 * 60 * 1000);
  assert.equal(word.review.intervalMinutes, 10);
  assert.equal(word.review.repetitions, 0);
});

test('due review order puts weaker words first', () => {
  const now = Date.parse('2026-09-21T12:00:00.000Z');
  const fresh = createWord({
    text: 'fresh',
    createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
    review: {
      intervalMinutes: 90,
      dueAt: new Date(now - 10 * 60 * 1000).toISOString(),
      lastReviewedAt: new Date(now - 10 * 60 * 1000).toISOString(),
      forgetCount: 0,
      repetitions: 0,
    },
  });
  const rusty = createWord({
    text: 'rusty',
    createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    review: {
      intervalMinutes: 90,
      dueAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      lastReviewedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      forgetCount: 2,
      repetitions: 0,
    },
  });
  const state = emptyState();
  state.books.reading.words = [fresh, rusty];
  const queue = dueWords(state, 'reading', now);
  assert.equal(queue[0].word.text, 'rusty');
  assert.equal(queue[1].word.text, 'fresh');
});

test('overwrite download does not wipe a local notebook with empty cloud notes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordnest-'));
  const store = new Store(path.join(dir, 'data.json'));
  store.state = emptyState();
  store.addWords('listening', [{ text: 'keep' }]);
  store.updateNotebook('listening', '听力结构');
  store.importOverwrite({
    books: {
      listening: { words: [{ text: 'keep' }], notebook: '' },
    },
  });
  assert.equal(store.getState().books.listening.notebook, '听力结构');
  assert.equal(store.getState().books.listening.words[0].text, 'keep');
});

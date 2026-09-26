'use strict';

const fs = require('fs');
const path = require('path');

const BOOKS = ['reading', 'listening', 'writing', 'speaking'];
const SCHEMA_VERSION = 1;

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      reminderEnabled: true,
      reminderMinutes: 90,
      ttsRate: 0.92,
      ttsRepeat: 1,
      ttsGapMs: 900,
      ttsVoiceURI: 'youdao:us',
      launchAtLogin: false,
      lastNotifiedAt: null,
      highlightColor: 'auto',
      scanMode: 'highlight',
      ieltsExamAt: '',
      savedTags: [],
      cloudGistId: '',
      cloudToken: '',
    },
    books: {
      reading: { words: [], notebook: '' },
      listening: { words: [], notebook: '' },
      writing: { words: [], notebook: '' },
      speaking: { words: [], notebook: '' },
    },
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[,，;；]/);
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const tag = String(item || '').trim();
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  });
  return out;
}

function rememberTags(state, tags) {
  const saved = new Set(state.settings.savedTags || []);
  normalizeTags(tags).forEach(tag => saved.add(tag));
  state.settings.savedTags = Array.from(saved);
}

function createWord(input) {
  const createdAt = input.createdAt || nowIso();
  const ieltsMeaning = String(input.ieltsMeaning || '').trim();
  const otherMeanings = String(input.otherMeanings || '').trim();
  const meaning = ieltsMeaning || String(input.meaning || '').trim();
  return {
    id: input.id || `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text: String(input.text || '').trim(),
    meaning,
    ieltsMeaning: ieltsMeaning || meaning,
    otherMeanings,
    phonetic: String(input.phonetic || '').trim(),
    example: String(input.example || '').trim(),
    notes: String(input.notes || '').trim(),
    tags: normalizeTags(input.tags || input.tag),
    examples: Array.isArray(input.examples) ? input.examples.filter(item => item && item.sentence) : [],
    source: input.source || 'manual',
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    review: Object.assign({
      ease: 2.5,
      intervalMinutes: 90,
      repetitions: 0,
      dueAt: createdAt,
      lastReviewedAt: null,
      reviewCount: 0,
      forgetCount: 0,
      mastered: false,
    }, input.review && typeof input.review === 'object' ? input.review : {}, {
      dueAt: (input.review && input.review.dueAt) || createdAt,
    }),
  };
}

function normalizeWord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim();
  if (!text) return null;
  return createWord(raw);
}

/**
 * 升级数据格式时只补字段、不删词。未来若增加第 5 本单词本，在 BOOKS 中追加即可。
 */
function migrate(data) {
  const base = emptyState();
  if (!data || typeof data !== 'object') return base;

  const next = emptyState();
  next.settings = Object.assign({}, base.settings, data.settings || {});
  next.version = Math.max(Number(data.version) || 1, SCHEMA_VERSION);

  const incomingBooks = data.books && typeof data.books === 'object' ? data.books : {};
  for (const id of BOOKS) {
    const rawWords = incomingBooks[id] && Array.isArray(incomingBooks[id].words)
      ? incomingBooks[id].words
      : [];
    next.books[id] = Object.assign({}, incomingBooks[id] || {}, {
      words: rawWords.map(normalizeWord).filter(Boolean),
      notebook: String((incomingBooks[id] && incomingBooks[id].notebook) || ''),
      notebookUpdatedAt: (incomingBooks[id] && incomingBooks[id].notebookUpdatedAt) || '',
    });
  }
  for (const key of Object.keys(incomingBooks)) {
    if (BOOKS.indexOf(key) === -1) next.books[key] = incomingBooks[key];
  }
  return next;
}

const FORGETTING_CURVE_MINUTES = [
  20,
  60,
  9 * 60,
  24 * 60,
  2 * 24 * 60,
  6 * 24 * 60,
  15 * 24 * 60,
  31 * 24 * 60,
];

function applyReview(word, rating, now) {
  const ts = now || Date.now();
  const review = Object.assign({}, word.review);
  review.lastReviewedAt = new Date(ts).toISOString();
  review.reviewCount = (review.reviewCount || 0) + 1;
  review.ease = Number(review.ease) || 2.5;

  if (rating === 'again') {
    review.forgetCount = (review.forgetCount || 0) + 1;
    review.repetitions = 0;
    review.ease = Math.max(1.3, review.ease - 0.2);
    review.intervalMinutes = 10;
    review.mastered = false;
  } else if (rating === 'hard') {
    review.ease = Math.max(1.3, review.ease - 0.15);
    const step = Math.max(0, (review.repetitions || 0) - 1);
    const base = FORGETTING_CURVE_MINUTES[Math.min(step, FORGETTING_CURVE_MINUTES.length - 1)];
    review.intervalMinutes = Math.max(20, Math.round(base * 0.6));
    review.mastered = false;
  } else {
    review.repetitions = (review.repetitions || 0) + 1;
    review.ease = Math.min(2.8, review.ease + 0.05);
    const step = Math.min(FORGETTING_CURVE_MINUTES.length - 1, Math.max(0, review.repetitions - 1));
    let minutes = FORGETTING_CURVE_MINUTES[step];
    if (review.repetitions > FORGETTING_CURVE_MINUTES.length) {
      minutes = Math.round(FORGETTING_CURVE_MINUTES[FORGETTING_CURVE_MINUTES.length - 1] * (review.ease / 2.5));
    }
    review.intervalMinutes = Math.min(minutes, 60 * 24 * 60);
    review.mastered = review.intervalMinutes >= 6 * 24 * 60;
  }

  review.dueAt = new Date(ts + review.intervalMinutes * 60 * 1000).toISOString();
  return Object.assign({}, word, { review, updatedAt: new Date(ts).toISOString() });
}

function reviewRetention(word, now) {
  const ts = now || Date.now();
  const review = (word && word.review) || {};
  const last = Date.parse(review.lastReviewedAt) || Date.parse(word && word.createdAt) || ts;
  const elapsed = Math.max(0, ts - last);
  const intervalMs = Math.max(10, Number(review.intervalMinutes) || 90) * 60 * 1000;
  const forgets = Number(review.forgetCount) || 0;
  const ease = Number(review.ease) || 2.5;
  const stability = intervalMs * Math.max(0.8, ease / 2.5) / (1 + forgets * 0.35);
  return Math.exp(-elapsed / Math.max(stability, 1));
}

function compareReviewItems(a, b, now) {
  const wa = a && a.word ? a.word : a;
  const wb = b && b.word ? b.word : b;
  const ra = reviewRetention(wa, now);
  const rb = reviewRetention(wb, now);
  if (ra !== rb) return ra - rb;
  const da = Date.parse((wa.review || {}).dueAt) || 0;
  const db = Date.parse((wb.review || {}).dueAt) || 0;
  if (da !== db) return da - db;
  return String(wa.text || '').localeCompare(String(wb.text || ''));
}

function dueWords(state, bookId, now) {
  const ts = now || Date.now();
  const books = bookId ? [bookId] : BOOKS;
  const out = [];
  for (const id of books) {
    const book = state.books[id];
    if (!book || !Array.isArray(book.words)) continue;
    for (const word of book.words) {
      if (word.review && word.review.mastered) continue;
      if (new Date(word.review.dueAt).getTime() <= ts) out.push({ bookId: id, word });
    }
  }
  out.sort((a, b) => compareReviewItems(a, b, ts));
  return out;
}

function dueCount(state, bookId, now) {
  return dueWords(state, bookId, now).length;
}

function chooseNotebook(localBook, incomingBook) {
  const local = String((localBook && localBook.notebook) || '');
  const incoming = String((incomingBook && incomingBook.notebook) || '');
  const localAt = Date.parse((localBook && localBook.notebookUpdatedAt) || '') || 0;
  const incomingAt = Date.parse((incomingBook && incomingBook.notebookUpdatedAt) || '') || 0;
  if (incoming.trim() && local.trim()) {
    if (incomingAt > localAt) return { notebook: incoming, notebookUpdatedAt: incomingBook.notebookUpdatedAt || '' };
    if (localAt > incomingAt) return { notebook: local, notebookUpdatedAt: localBook.notebookUpdatedAt || '' };
    if (incoming.length >= local.length) return { notebook: incoming, notebookUpdatedAt: incomingBook.notebookUpdatedAt || '' };
    return { notebook: local, notebookUpdatedAt: localBook.notebookUpdatedAt || '' };
  }
  if (local.trim()) return { notebook: local, notebookUpdatedAt: (localBook && localBook.notebookUpdatedAt) || '' };
  return { notebook: incoming, notebookUpdatedAt: (incomingBook && incomingBook.notebookUpdatedAt) || '' };
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.bakPath = `${filePath}.bak`;
    this.tmpPath = `${filePath}.tmp`;
    this.state = emptyState();
  }

  load() {
    const parsed = this._readJson(this.filePath) || this._readJson(this.bakPath);
    this.state = migrate(parsed);
    if (parsed) this.save();
    return this.state;
  }

  _readJson(target) {
    try {
      if (!fs.existsSync(target)) return null;
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      try { fs.copyFileSync(this.filePath, this.bakPath); } catch (_) { /* keep going */ }
    }
    fs.writeFileSync(this.tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(this.tmpPath, this.filePath);
    return this.state;
  }

  getState() {
    return this.state;
  }

  updateSettings(patch) {
    this.state.settings = Object.assign({}, this.state.settings, patch || {});
    return this.save();
  }

  addWords(bookId, words) {
    if (!this.state.books[bookId]) throw new Error('未知单词本');
    const added = [];
    const existing = [];
    const index = new Map(this.state.books[bookId].words.map(word => [word.text.toLowerCase(), word]));

    for (const item of words || []) {
      const word = normalizeWord(item);
      if (!word) continue;
      const key = word.text.toLowerCase();
      if (index.has(key)) {
        const old = index.get(key);
        ['meaning', 'ieltsMeaning', 'otherMeanings', 'phonetic', 'example', 'notes'].forEach((field) => {
          if (!old[field] && word[field]) {
            old[field] = word[field];
            old.updatedAt = nowIso();
          }
        });
        if (word.tags && word.tags.length) {
          old.tags = normalizeTags([].concat(old.tags || [], word.tags));
          old.updatedAt = nowIso();
          rememberTags(this.state, word.tags);
        }
        if ((!old.examples || !old.examples.length) && word.examples && word.examples.length) {
          old.examples = word.examples;
          old.updatedAt = nowIso();
        }
        existing.push(old);
        continue;
      }
      this.state.books[bookId].words.unshift(word);
      index.set(key, word);
      added.push(word);
      rememberTags(this.state, word.tags);
    }
    this.save();
    return { added, existing };
  }

  updateWord(bookId, id, patch) {
    const book = this.state.books[bookId];
    if (!book) throw new Error('未知单词本');
    const word = book.words.find(item => item.id === id);
    if (!word) throw new Error('找不到单词');
    const nextPatch = Object.assign({}, patch || {});
    const reviewPatch = nextPatch.review;
    delete nextPatch.review;
    Object.assign(word, nextPatch, { updatedAt: nowIso() });
    if (reviewPatch) word.review = Object.assign({}, word.review, reviewPatch);
    if (nextPatch.text) word.text = String(nextPatch.text).trim();
    if (Object.prototype.hasOwnProperty.call(nextPatch, 'tags') || Object.prototype.hasOwnProperty.call(nextPatch, 'tag')) {
      word.tags = normalizeTags(nextPatch.tags || nextPatch.tag);
      rememberTags(this.state, word.tags);
    }
    this.save();
    return word;
  }

  deleteWord(bookId, id) {
    const book = this.state.books[bookId];
    if (!book) throw new Error('未知单词本');
    const next = book.words.filter(item => item.id !== id);
    if (next.length === book.words.length) throw new Error('找不到单词');
    book.words = next;
    this.save();
    return this.state;
  }

  deleteWords(bookId, ids) {
    const book = this.state.books[bookId];
    if (!book) throw new Error('未知单词本');
    const remove = new Set((ids || []).map(item => String(item)));
    const before = book.words.length;
    book.words = book.words.filter(item => !remove.has(item.id));
    const deleted = before - book.words.length;
    if (deleted) this.save();
    return { deleted, state: this.state };
  }

  tagWords(bookId, ids, tags) {
    const book = this.state.books[bookId];
    if (!book) throw new Error('未知单词本');
    const extra = normalizeTags(tags);
    if (!extra.length) return { updated: 0, state: this.state };
    const idSet = new Set((ids || []).map(item => String(item)));
    let updated = 0;
    book.words.forEach((word) => {
      if (!idSet.has(word.id)) return;
      word.tags = normalizeTags([].concat(word.tags || [], extra));
      word.updatedAt = nowIso();
      updated += 1;
    });
    if (updated) {
      rememberTags(this.state, extra);
      this.save();
    }
    return { updated, state: this.state };
  }

  reviewWord(bookId, id, rating) {
    const book = this.state.books[bookId];
    if (!book) throw new Error('未知单词本');
    const index = book.words.findIndex(item => item.id === id);
    if (index < 0) throw new Error('找不到单词');
    book.words[index] = applyReview(book.words[index], rating);
    this.save();
    return book.words[index];
  }

  updateNotebook(bookId, text) {
    const book = this.state.books[bookId];
    if (!book) throw new Error('未知单词本');
    book.notebook = String(text || '');
    book.notebookUpdatedAt = nowIso();
    this.save();
    return book.notebook;
  }

  importMerge(incoming) {
    const migrated = migrate(incoming);
    const summary = { added: 0, existing: 0 };
    for (const id of BOOKS) {
      const result = this.addWords(id, migrated.books[id].words);
      summary.added += result.added.length;
      summary.existing += result.existing.length;
    }
    for (const id of BOOKS) {
      const picked = chooseNotebook(this.state.books[id], (migrated.books || {})[id]);
      this.state.books[id].notebook = picked.notebook;
      this.state.books[id].notebookUpdatedAt = picked.notebookUpdatedAt;
    }
    this.save();
    if (incoming && incoming.settings) {
      const incomingSettings = Object.assign({}, incoming.settings);
      delete incomingSettings.cloudToken;
      this.state.settings = Object.assign({}, this.state.settings, incomingSettings, {
        lastNotifiedAt: this.state.settings.lastNotifiedAt,
        cloudToken: this.state.settings.cloudToken,
      });
      this.save();
    }
    return summary;
  }

  importOverwrite(incoming) {
    const keepToken = this.state.settings.cloudToken || '';
    const keepGist = this.state.settings.cloudGistId || '';
    const prevBooks = this.state.books;
    const migrated = migrate(incoming);
    migrated.settings.cloudToken = keepToken;
    migrated.settings.cloudGistId = keepGist || migrated.settings.cloudGistId || '';
    for (const id of BOOKS) {
      const picked = chooseNotebook(prevBooks[id], (migrated.books || {})[id]);
      migrated.books[id].notebook = picked.notebook;
      migrated.books[id].notebookUpdatedAt = picked.notebookUpdatedAt;
    }
    this.state = migrated;
    this.save();
    let words = 0;
    BOOKS.forEach((id) => {
      words += ((((this.state.books || {})[id] || {}).words) || []).length;
    });
    return { words };
  }

  exportPublicState() {
    const next = JSON.parse(JSON.stringify(this.state));
    if (next.settings) delete next.settings.cloudToken;
    return next;
  }
}

module.exports = {
  Store,
  BOOKS,
  SCHEMA_VERSION,
  emptyState,
  migrate,
  applyReview,
  createWord,
  dueWords,
  dueCount,
  reviewRetention,
  compareReviewItems,
  chooseNotebook,
  FORGETTING_CURVE_MINUTES,
  normalizeTags,
};

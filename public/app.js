'use strict';

const BOOKS = [
  { id: 'reading', name: '阅读', en: 'Reading', hint: '篇章里遇见的词', speak: false, color: 'reading' },
  { id: 'listening', name: '听力', en: 'Listening', hint: '耳朵先认识的词', speak: true, color: 'listening' },
  { id: 'writing', name: '写作', en: 'Writing', hint: '落笔要用准的词', speak: false, color: 'writing' },
  { id: 'speaking', name: '口语', en: 'Speaking', hint: '说出口的词', speak: true, color: 'speaking' },
];

const BOOK_ICONS = {
  reading: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5A3.5 3.5 0 0 1 8 4h4v15H8a3.5 3.5 0 0 0-3.5 1.5v-15Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19.5 5.5A3.5 3.5 0 0 0 16 4h-4v15h4a3.5 3.5 0 0 1 3.5 1.5v-15Z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  listening: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1M4.5 13v4a2 2 0 0 0 2 2H8v-7H6.5a2 2 0 0 0-2 2Zm15 0v4a2 2 0 0 1-2 2H16v-7h1.5a2 2 0 0 1 2 2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  writing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 18.5 1-4L16.8 3.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L9.5 18l-4.5.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14.8 5.7 3.5 3.5M5 21h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  speaking: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7.5 11.5h.01M12 11.5h.01M16.5 11.5h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

const ui = {
  nav: document.getElementById('book-nav'),
  mobileNav: document.getElementById('mobile-nav'),
  title: document.getElementById('book-title'),
  en: document.getElementById('book-en'),
  hint: document.getElementById('book-hint'),
  stats: document.getElementById('book-stats'),
  list: document.getElementById('word-list'),
  search: document.getElementById('search'),
  overlay: document.getElementById('overlay'),
  speakAll: document.getElementById('btn-speak-all'),
  dictation: document.getElementById('btn-dictation'),
  exam: document.getElementById('btn-exam'),
  dataHint: document.getElementById('data-hint'),
  reviewDue: document.getElementById('btn-review-due'),
  toast: document.getElementById('toast'),
};

function emptyRendererState() {
  return {
    version: 1,
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

const state = {
  bookId: 'reading',
  data: emptyRendererState(),
  query: '',
  tagFilter: '',
  speaking: false,
};

const UNTAGGED_FILTER = '__untagged__';

const COLOR_LABELS = {
  auto: '橙色 / 黄 / 绿荧光笔',
  orange: '橙色荧光笔',
  yellow: '黄色荧光笔',
  green: '绿色荧光笔',
  pink: '粉色荧光笔',
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"'`]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
  })[char]);
}

function bookMeta(id) {
  return BOOKS.find(item => item.id === id) || BOOKS[0];
}

function isDue(word, now) {
  if (!word || !word.review || word.review.mastered) return false;
  return Date.parse(word.review.dueAt) <= (now || Date.now());
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

function spellProgressOf(word) {
  const n = Number(word && word.review && word.review.spellProgress);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(6, Math.floor(n));
}

function bumpSpellProgress(progress) {
  const n = Math.max(0, Math.min(6, Math.floor(Number(progress) || 0)));
  if (n >= 6) return 6;
  if (n === 0) return 2;
  return n + 1;
}

function localDay(ts) {
  const d = new Date(ts || Date.now());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function nextLocalDayStart(ts) {
  const d = new Date(ts || Date.now());
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function writingReviewRank(word, now) {
  const today = localDay(now);
  const frontOn = String((word && word.review && word.review.frontOn) || '');
  if (frontOn && frontOn === today) return 0;
  if (frontOn && frontOn > today) return 2;
  return 1;
}

function applySpellOutcome(word, outcome, now) {
  const ts = now || Date.now();
  const review = Object.assign({}, word.review);
  if (outcome === 'miss') {
    review.spellProgress = 0;
    return Object.assign({}, word, { review, updatedAt: new Date(ts).toISOString() });
  }
  if (outcome === 'unfamiliar') {
    const due = nextLocalDayStart(ts);
    review.spellProgress = 0;
    review.frontOn = localDay(due.getTime());
    review.mastered = false;
    review.forgetCount = (Number(review.forgetCount) || 0) + 1;
    review.lastReviewedAt = new Date(ts).toISOString();
    review.reviewCount = (Number(review.reviewCount) || 0) + 1;
    review.repetitions = 0;
    review.dueAt = due.toISOString();
    review.intervalMinutes = Math.max(1, Math.round((due.getTime() - ts) / 60000));
    return Object.assign({}, word, { review, updatedAt: new Date(ts).toISOString() });
  }
  if (outcome === 'fail') {
    const cleared = Object.assign({}, word, {
      review: Object.assign({}, review, { spellProgress: 0 }),
    });
    const next = applyReview(cleared, 'again', ts);
    next.review.spellProgress = 0;
    next.review.mastered = false;
    return next;
  }
  const progress = bumpSpellProgress(spellProgressOf(word));
  const base = Object.assign({}, word, {
    review: Object.assign({}, review, { spellProgress: progress, frontOn: '' }),
  });
  const next = applyReview(base, 'good', ts);
  next.review.spellProgress = progress;
  next.review.frontOn = '';
  next.review.mastered = progress >= 6;
  return next;
}

function spellRingHtml(word) {
  const sixths = spellProgressOf(word);
  const circ = 2 * Math.PI * 15.5;
  const arc = sixths > 0
    ? `<circle class="spell-ring-value" cx="18" cy="18" r="15.5" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ * (1 - sixths / 6)).toFixed(2)}"></circle>`
    : '';
  return `<div class="spell-ring" aria-label="进度 ${sixths}/6"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="spell-ring-track" cx="18" cy="18" r="15.5"></circle>${arc}</svg></div>`;
}

function dueInBook(bookId) {
  if (bookId === 'writing') return collectWritingQueue().length;
  const words = (((state.data || {}).books || {})[bookId] || {}).words || [];
  return words.filter(word => isDue(word)).length;
}

function totalDueCount() {
  const books = (state.data && state.data.books) || {};
  return BOOKS.reduce((total, book) => {
    const words = ((books[book.id] || {}).words) || [];
    return total + words.filter(word => isDue(word)).length;
  }, 0);
}

function createLocalApi() {
  const key = 'wordnest-local-v1';
  const empty = {
    version: 1,
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

  let mem = null;
  function normalizeLoaded(raw) {
    const base = JSON.parse(JSON.stringify(empty));
    if (!raw || typeof raw !== 'object') return base;
    const settings = Object.assign({}, base.settings, raw.settings || {});
    const books = Object.assign({}, base.books, raw.books || {});
    ['reading', 'listening', 'writing', 'speaking'].forEach((id) => {
      const src = books[id] || {};
      books[id] = Object.assign({}, src, {
        words: Array.isArray(src.words) ? src.words : [],
        notebook: String(src.notebook || ''),
        notebookUpdatedAt: src.notebookUpdatedAt || '',
      });
    });
    return Object.assign(base, raw, { settings, books });
  }
  function load() {
    if (mem) return mem;
    try {
      mem = normalizeLoaded(JSON.parse(localStorage.getItem(key) || 'null'));
    } catch (_) {
      mem = JSON.parse(JSON.stringify(empty));
    }
    return mem;
  }
  function save(data) {
    mem = data;
    localStorage.setItem(key, JSON.stringify(data));
    return data;
  }
  function makeWord(item) {
    const now = new Date().toISOString();
    return {
      id: `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      text: String(item.text || '').trim(),
      meaning: item.meaning || '',
      ieltsMeaning: item.ieltsMeaning || item.meaning || '',
      otherMeanings: item.otherMeanings || '',
      phonetic: item.phonetic || '',
      example: item.example || '',
      notes: item.notes || '',
      tags: item.tags || [],
      source: item.source || 'manual',
      createdAt: now,
      updatedAt: now,
      review: { ease: 2.5, intervalMinutes: 90, repetitions: 0, dueAt: now, lastReviewedAt: null, reviewCount: 0, forgetCount: 0, mastered: false, spellProgress: 0, frontOn: '' },
    };
  }

  return {
    desktop: false,
    async getState() { return load(); },
    async addWords(bookId, words) {
      const data = load();
      const book = data.books[bookId];
      if (!book) throw new Error('未知单词本');
      const added = [];
      const existing = [];
      const index = new Map((book.words || []).map(word => [String(word.text || '').toLowerCase(), word]));
      for (const item of words || []) {
        const text = String((item && item.text) || '').trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (index.has(key)) {
          const old = index.get(key);
          ['meaning', 'ieltsMeaning', 'otherMeanings', 'phonetic', 'example', 'notes'].forEach((field) => {
            if (!old[field] && item[field]) old[field] = item[field];
          });
          const extra = [].concat(item.tags || (item.tag ? [item.tag] : [])).map(tag => String(tag || '').trim()).filter(Boolean);
          if (extra.length) {
            const seen = new Set();
            const merged = [];
            [].concat(old.tags || [], extra).forEach((tag) => {
              const value = String(tag || '').trim();
              if (!value) return;
              const tagKey = value.toLowerCase();
              if (seen.has(tagKey)) return;
              seen.add(tagKey);
              merged.push(value);
            });
            old.tags = merged;
          }
          old.updatedAt = new Date().toISOString();
          existing.push(old);
          continue;
        }
        const word = makeWord(item);
        book.words.unshift(word);
        index.set(key, word);
        added.push(word);
      }
      save(data);
      return { added, existing };
    },
    async updateWord(bookId, id, patch) {
      const data = load();
      const word = data.books[bookId].words.find(item => item.id === id);
      Object.assign(word, patch, { updatedAt: new Date().toISOString() });
      save(data);
      return word;
    },
    async deleteWord(bookId, id) {
      const data = load();
      data.books[bookId].words = data.books[bookId].words.filter(item => item.id !== id);
      return save(data);
    },
    async deleteWords(bookId, ids) {
      const data = load();
      const remove = new Set((ids || []).map(item => String(item)));
      data.books[bookId].words = data.books[bookId].words.filter(item => !remove.has(item.id));
      return save(data);
    },
    async tagWords(bookId, ids, tags) {
      const data = load();
      const extra = [].concat(tags || []).map(item => String(item || '').trim()).filter(Boolean);
      const idSet = new Set((ids || []).map(item => String(item)));
      let updated = 0;
      (data.books[bookId].words || []).forEach((word) => {
        if (!idSet.has(word.id)) return;
        const merged = [];
        const seen = new Set();
        [].concat(word.tags || [], extra).forEach((tag) => {
          const value = String(tag || '').trim();
          if (!value) return;
          const key = value.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          merged.push(value);
        });
        word.tags = merged;
        word.updatedAt = new Date().toISOString();
        updated += 1;
      });
      save(data);
      return { updated };
    },
    async reviewWord(bookId, id, rating) {
      const data = load();
      const list = data.books[bookId].words;
      const index = list.findIndex(item => item.id === id);
      if (index < 0) throw new Error('找不到单词');
      list[index] = applyReview(list[index], rating);
      save(data);
      return list[index];
    },
    async updateNotebook(bookId, text) {
      const data = load();
      if (!data.books[bookId]) data.books[bookId] = { words: [], notebook: '' };
      data.books[bookId].notebook = String(text || '');
      data.books[bookId].notebookUpdatedAt = new Date().toISOString();
      save(data);
      return data.books[bookId].notebook;
    },
    async updateSettings(patch) {
      const data = load();
      Object.assign(data.settings, patch);
      return save(data);
    },
    async exportData() {
      const blob = new Blob([JSON.stringify(publicCloudState(load()), null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `词栖备份-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      return { canceled: false };
    },
    async importData() { return { canceled: true }; },
    async importOverwrite(incoming) {
      const data = load();
      const keepToken = (data.settings || {}).cloudToken || '';
      const keepGist = (data.settings || {}).cloudGistId || '';
      const prevBooks = data.books || {};
      const next = JSON.parse(JSON.stringify(emptyRendererState()));
      next.settings = Object.assign({}, next.settings, (incoming && incoming.settings) || {});
      next.settings.cloudToken = keepToken;
      next.settings.cloudGistId = keepGist || next.settings.cloudGistId || '';
      next.version = (incoming && incoming.version) || 1;
      ['reading', 'listening', 'writing', 'speaking'].forEach((id) => {
        const src = (((incoming || {}).books || {})[id] || {});
        const words = (src.words || []).filter(item => item && item.text);
        const picked = chooseNotebook(prevBooks[id], src);
        next.books[id] = { words, notebook: picked.notebook, notebookUpdatedAt: picked.notebookUpdatedAt };
      });
      save(next);
      let words = 0;
      ['reading', 'listening', 'writing', 'speaking'].forEach((id) => {
        words += (next.books[id].words || []).length;
      });
      return { words };
    },
    async exportPublicState() { return publicCloudState(load()); },
    async getDataInfo() { return { filePath: '浏览器 localStorage（仅开发预览）', userData: '' }; },
    async openDataFolder() { return false; },
    async recognizeImage() { throw new Error('扫描识别需要在 macOS 桌面版中使用'); },
    async lookupWord(word) {
      const result = { phonetic: '', ieltsMeaning: '', otherMeanings: '', meaning: '', example: '' };
      const text = String(word || '').trim();
      if (!text) return result;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      try {
        const res = await fetch(`https://dict.youdao.com/suggest?num=8&ver=2.0&doctype=json&le=en&q=${encodeURIComponent(text)}`, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        });
        if (!res.ok) return result;
        const data = await res.json();
        const first = ((((data || {}).data || {}).entries) || []).find(item => item && item.explain);
        if (!first) return result;
        const groups = String(first.explain || '').split(/(?=\b(?:n|v|vt|vi|adj|adv|prep|conj)\.\s)/i).map(item => item.trim()).filter(Boolean);
        result.ieltsMeaning = groups[0] || '';
        result.otherMeanings = groups.slice(1).join(' ｜ ');
        result.meaning = [result.ieltsMeaning, result.otherMeanings].filter(Boolean).join('\n');
      } catch (_) { /* offline */ }
      clearTimeout(timer);
      return result;
    },
    onStartReview() { return () => {}; },
  };
}

const api = window.wordnest || createLocalApi();
document.body.classList.toggle('desktop', Boolean(api.desktop));

function publicCloudState(data) {
  const next = JSON.parse(JSON.stringify(data || {}));
  if (next.settings) delete next.settings.cloudToken;
  return next;
}

function parseGistId(raw) {
  const text = String(raw || '').trim();
  const fromUrl = text.match(/gist\.github\.com\/(?:[^/]+\/)?([a-fA-F0-9]+)/);
  if (fromUrl) return fromUrl[1];
  const id = text.match(/^([a-fA-F0-9]+)$/);
  return id ? id[1] : '';
}

async function gistError(res) {
  try {
    const data = await res.json();
    return data.message || `GitHub ${res.status}`;
  } catch (_) {
    return `GitHub ${res.status}`;
  }
}

function gistHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function downloadCloudGist(gistId, token) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: gistHeaders(token) });
  if (!res.ok) throw new Error(await gistError(res));
  const gist = await res.json();
  const files = gist.files || {};
  const file = files['wordnest-data.json'] || Object.keys(files).map(name => files[name]).find(item => item && /\.json$/i.test(item.filename || ''));
  if (!file) throw new Error('这个 Gist 里没有 JSON。请新建文件 wordnest-data.json，内容先写 {}。');
  let content = file.content || '';
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers: gistHeaders(token) });
    if (!raw.ok) throw new Error('云端文件太大，下载失败');
    content = await raw.text();
  }
  const parsed = JSON.parse(content || '{}');
  if (!parsed.books) throw new Error('云端 JSON 不是词栖备份');
  return parsed;
}

async function uploadCloudGist(gistId, token, data) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json' }, gistHeaders(token)),
    body: JSON.stringify({
      files: {
        'wordnest-data.json': { content: JSON.stringify(publicCloudState(data), null, 2) },
      },
    }),
  });
  if (!res.ok) throw new Error(await gistError(res));
}

async function cloudCredentials() {
  const settings = (state.data && state.data.settings) || {};
  const gistId = parseGistId(settings.cloudGistId);
  const token = String(settings.cloudToken || '').trim();
  if (!gistId || !token) throw new Error('请先在设置里填写私有 Gist 和 Token，并保存。');
  return { gistId, token };
}

function showSyncNotice(title, help) {
  setMenuOpen(false);
  openOverlay(`<div class="modal"><h2>${escapeHtml(title)}</h2><p class="help">${escapeHtml(help)}</p><div class="modal-actions"><button type="button" class="primary" data-close>好</button></div></div>`);
}

async function pullCloudOverwrite() {
  const cred = await cloudCredentials();
  const incoming = await downloadCloudGist(cred.gistId, cred.token);
  const result = await api.importOverwrite(incoming);
  await reload();
  return result;
}

async function pushCloudOverwrite() {
  const cred = await cloudCredentials();
  const payload = api.exportPublicState ? await api.exportPublicState() : publicCloudState(state.data);
  await uploadCloudGist(cred.gistId, cred.token, payload);
}

async function runCloudDownload() {
  setMenuOpen(false);
  try {
    await cloudCredentials();
  } catch (err) {
    openSettings();
    return;
  }
  if (!window.confirm('用云端单词完全覆盖本机四册？本机还没上传的改动会丢失。')) return;
  try {
    const result = await pullCloudOverwrite();
    showSyncNotice('已同步到本机', `云端覆盖完成，共 ${result.words || 0} 个词。`);
  } catch (err) {
    showSyncNotice('下载失败', err.message || '下载失败');
  }
}

async function runCloudUpload() {
  setMenuOpen(false);
  try {
    await cloudCredentials();
  } catch (err) {
    openSettings();
    return;
  }
  if (!window.confirm('用本机单词完全覆盖云端？云端还没下载的改动会丢失。')) return;
  try {
    await pushCloudOverwrite();
    showSyncNotice('已上传到云端', '本机四册已覆盖云端。手机打开菜单点「下载云端」即可看到。');
  } catch (err) {
    showSyncNotice('上传失败', err.message || '上传失败');
  }
}

async function lookupWord(text) {
  const word = String(text || '').trim();
  if (!word) return { phonetic: '', ieltsMeaning: '', otherMeanings: '', meaning: '', example: '' };
  if (api.lookupWord) return api.lookupWord(word);
  return { phonetic: '', ieltsMeaning: '', otherMeanings: '', meaning: '', example: '' };
}

function collectedTags() {
  const saved = (((state.data || {}).settings || {}).savedTags) || [];
  const fromWords = [];
  Object.keys(((state.data || {}).books) || {}).forEach((bookId) => {
    ((((state.data.books || {})[bookId] || {}).words) || []).forEach((word) => {
      (word.tags || []).forEach(tag => fromWords.push(tag));
    });
  });
  return Array.from(new Set([].concat(saved, fromWords).filter(Boolean)));
}

function isEnglishDump(text) {
  const cn = (String(text).match(/[\u4e00-\u9fff]/g) || []).length;
  const en = (String(text).match(/[A-Za-z]/g) || []).length;
  return en >= 12 && cn < 2;
}

function senseList(word) {
  const out = [];
  const ielts = String(word.ieltsMeaning || word.meaning || '').trim();
  if (ielts) out.push({ label: '雅思常考', text: ielts });
  String(word.otherMeanings || '')
    .split(/\s*｜\s*|\n/)
    .map(item => item.trim())
    .filter(item => item && !isEnglishDump(item) && !/^\.\.\.$/.test(item))
    .forEach((text) => out.push({ label: '其他意思', text }));
  return out;
}

function meaningHtml(word) {
  const senses = senseList(word);
  if (!senses.length) return '<p class="meaning">还没有释义，复习时可以补上。</p>';
  return senses.map(item => `<p class="meaning ${item.label === '雅思常考' ? 'ielts' : 'other'}"><span class="sense-label">${item.label}</span>${escapeHtml(item.text)}</p>`).join('');
}

function examplePickerHtml(word) {
  const senses = senseList(word);
  if (!senses.length) return '';
  return `<details class="example-details">
    <summary>看例句</summary>
    <p class="example-hint">点一个意思，只看这个意思对应的例句</p>
    <div class="sense-picks">${senses.map((item, index) => `<button type="button" class="sense-pick${index === 0 ? ' active' : ''}" data-sense="${escapeHtml(item.text)}">${escapeHtml(item.label)}：${escapeHtml(item.text)}</button>`).join('')}</div>
    <div class="example-out" hidden></div>
  </details>`;
}

function localSenseTokens(sense) {
  return String(sense || '')
    .split(/[，,；;、。./|｜\s]+/)
    .map(item => item.replace(/^(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|abbr)\.?$/i, '').trim())
    .filter(item => item && item.length >= 2 && /[\u4e00-\u9fff]/.test(item));
}

function localPickExamples(examples, sense) {
  const list = [];
  const seen = new Set();
  (examples || []).forEach((item) => {
    const sentence = String((item && item.sentence) || '').trim();
    const key = sentence.toLowerCase();
    if (!sentence || seen.has(key)) return;
    seen.add(key);
    list.push({
      sentence,
      translation: String((item && item.translation) || '').trim(),
      sense: String((item && item.sense) || '').trim(),
    });
  });
  const tokens = localSenseTokens(sense);
  if (!tokens.length) return list.slice(0, 3);
  return list.map((item) => {
    const hay = `${item.translation} ${item.sense}`;
    let score = 0;
    tokens.forEach((token) => {
      if (hay.includes(token)) score += token.length;
    });
    return { item, score };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(row => row.item);
}

function storedExamples(word) {
  const list = Array.isArray(word && word.examples) ? word.examples.filter(item => item && item.sentence) : [];
  if (list.length) return list;
  const raw = String((word && word.example) || '').trim();
  if (!raw) return [];
  const parts = raw.split(/\s*／\s*/);
  return [{ sentence: parts[0], translation: parts.slice(1).join('／'), sense: '' }];
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordForms(word) {
  const base = String(word || '').trim();
  if (!base) return [];
  if (/\s/.test(base)) return [base];
  const forms = [base];
  if (/[^aeiou]y$/i.test(base)) {
    const stem = base.slice(0, -1);
    forms.push(`${stem}ies`, `${stem}ied`, `${base}ing`);
  } else if (/e$/i.test(base)) {
    forms.push(`${base}d`, `${base}s`, `${base.slice(0, -1)}ing`);
  } else {
    forms.push(`${base}s`, `${base}es`, `${base}ed`, `${base}ing`);
  }
  return forms;
}

function maskHeadword(sentence, word) {
  const forms = wordForms(word).sort((a, b) => b.length - a.length);
  let next = String(sentence || '');
  forms.forEach((form) => {
    next = next.replace(new RegExp(`\\b${escapeRegExp(form)}\\b`, 'ig'), '______');
  });
  return next;
}

function exampleBlocksHtml(list, maskWord) {
  return (list || []).map((item) => {
    const sentence = maskWord ? maskHeadword(item.sentence, maskWord) : item.sentence;
    const translation = maskWord ? maskHeadword(item.translation, maskWord) : item.translation;
    return `<div class="ex-block"><p class="ex-en">${escapeHtml(sentence)}</p>${translation ? `<p class="ex-zh">${escapeHtml(translation)}</p>` : ''}</div>`;
  }).join('');
}

async function examplesForSense(word, sense) {
  let matches = [];
  if (api.lookupExamples) {
    try {
      const result = await api.lookupExamples(word.text, sense || '');
      matches = (result && result.matches) || [];
      if (!matches.length && result && result.picked) matches = [result.picked];
    } catch (_) { /* use saved examples */ }
  }
  if (!matches.length) matches = localPickExamples(storedExamples(word), sense || '');
  return matches;
}

function bindExamplePanel(root, word) {
  if (!root) return;
  root.querySelectorAll('.sense-pick').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const out = root.querySelector('.example-out');
      if (!out) return;
      root.querySelectorAll('.sense-pick').forEach(el => el.classList.toggle('active', el === btn));
      out.hidden = false;
      out.textContent = '正在找这个意思的例句…';
      try {
        const matches = await examplesForSense(word, btn.dataset.sense);
        if (!matches.length) {
          out.textContent = '暂时没有找到这个意思的例句。';
          return;
        }
        out.innerHTML = exampleBlocksHtml(matches);
      } catch (err) {
        out.textContent = err.message || '例句加载失败';
      }
    });
  });
}

function tagHtml(word) {
  const tags = word.tags || [];
  if (!tags.length) return '';
  return `<p class="tag-line">${tags.map(tag => `<span class="book-tag">${escapeHtml(tag)}</span>`).join('')}</p>`;
}

function tagOptions(selected) {
  return sourceFilterHtml(selected);
}

function tagStats(bookId) {
  const words = ((((state.data || {}).books || {})[bookId || state.bookId] || {}).words) || [];
  const counts = new Map();
  let untagged = 0;
  words.forEach((word) => {
    const tags = wordTags(word);
    if (!tags.length) {
      untagged += 1;
      return;
    }
    tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  const names = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, 'zh'));
  return { total: words.length, untagged, counts, names };
}

function sourceFilterHtml(selected) {
  const stats = tagStats();
  const options = [
    `<option value="" ${!selected ? 'selected' : ''}>全部来源（${stats.total}）</option>`,
    `<option value="${UNTAGGED_FILTER}" ${selected === UNTAGGED_FILTER ? 'selected' : ''}>没有标记（${stats.untagged}）</option>`,
  ];
  stats.names.forEach((tag) => {
    options.push(`<option value="${escapeHtml(tag)}" ${tag === selected ? 'selected' : ''}>${escapeHtml(tag)}（${stats.counts.get(tag) || 0}）</option>`);
  });
  if (selected && selected !== UNTAGGED_FILTER && !stats.counts.has(selected)) {
    options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}（0）</option>`);
  }
  return options.join('');
}

function sourceLabel() {
  if (!state.tagFilter) return '全部来源';
  if (state.tagFilter === UNTAGGED_FILTER) return '没有标记';
  return state.tagFilter;
}

function matchesSourceFilter(word) {
  const tag = state.tagFilter;
  if (!tag) return true;
  const tags = wordTags(word);
  if (tag === UNTAGGED_FILTER) return !tags.length;
  return tags.includes(tag);
}

function sourceWords() {
  return currentWords().filter(matchesSourceFilter);
}

const TTS_ACCENTS = [
  { id: 'youdao:us', name: '有道词典 · 美式' },
  { id: 'youdao:uk', name: '有道词典 · 英式' },
  { id: 'lang:en-US', name: '系统语音 · 美式' },
  { id: 'lang:en-GB', name: '系统语音 · 英式' },
  { id: 'lang:en-AU', name: '系统语音 · 澳式' },
];

function ttsVoiceList() {
  if (!window.speechSynthesis || !window.speechSynthesis.getVoices) return [];
  return window.speechSynthesis.getVoices() || [];
}

function voiceKey(item) {
  return (item && (item.voiceURI || item.name)) || '';
}

function englishVoices() {
  const seen = new Set();
  return ttsVoiceList().filter((item) => {
    if (!item) return false;
    if (!(/^en(-|_)/i.test(item.lang || '') || /english/i.test(item.name || ''))) return false;
    const key = voiceKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickTtsVoice(preferred) {
  const wanted = String(preferred != null ? preferred : (((state.data && state.data.settings) || {}).ttsVoiceURI || ''));
  const all = ttsVoiceList();
  if (wanted && wanted.indexOf('lang:') !== 0 && wanted.indexOf('youdao:') !== 0) {
    const hit = all.find((item) => item.voiceURI === wanted || item.name === wanted);
    if (hit) return hit;
  }
  if (wanted.indexOf('lang:') === 0) {
    const lang = wanted.slice(5).toLowerCase();
    const hit = englishVoices().find((item) => String(item.lang || '').replace('_', '-').toLowerCase().indexOf(lang) === 0);
    if (hit) return hit;
  }
  return englishVoices()[0] || all.find((item) => /^en(-|_)/i.test(item.lang || '')) || null;
}

function ttsVoiceOptionsHtml(selected) {
  const current = String(selected || 'youdao:us');
  const opts = TTS_ACCENTS.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === current ? ' selected' : ''}>${escapeHtml(item.name)}</option>`);
  const voices = englishVoices();
  if (voices.length) {
    opts.push('<option disabled>── 网页能用的系统声音 ──</option>');
    voices.forEach((item) => {
      const id = voiceKey(item);
      opts.push(`<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(`${item.name}${item.lang ? ' · ' + item.lang : ''}`)}</option>`);
    });
  }
  return opts.join('');
}

function fillVoiceSelect(select, selected) {
  if (!select) return;
  const keep = selected != null ? selected : select.value;
  select.innerHTML = ttsVoiceOptionsHtml(keep);
}

function whenVoicesReady(callback) {
  if (!window.speechSynthesis) {
    callback();
    return;
  }
  let calls = 0;
  const run = () => {
    if (calls > 6) return;
    calls += 1;
    callback();
  };
  window.speechSynthesis.getVoices();
  run();
  window.speechSynthesis.addEventListener('voiceschanged', run);
  setTimeout(run, 200);
  setTimeout(run, 800);
}

let dictAudio = null;
let speakSerial = 0;

function youdaoVoiceUrl(text, accent) {
  const type = accent === 'uk' ? 1 : 2;
  return `https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeURIComponent(String(text || '').trim())}`;
}

function stopSpeak() {
  speakSerial += 1;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (!dictAudio) return;
  const audio = dictAudio;
  dictAudio = null;
  audio.onended = null;
  audio.onerror = null;
  try { audio.pause(); } catch (_) { /* ignore */ }
  audio.removeAttribute('src');
}

function speakSystem(text, onend, voiceURI) {
  if (!window.speechSynthesis) {
    if (onend) onend();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const wanted = String(voiceURI || 'lang:en-US');
  if (wanted.indexOf('lang:') === 0) {
    utter.lang = wanted.slice(5) || 'en-US';
    const voice = pickTtsVoice(wanted);
    if (voice) utter.voice = voice;
  } else {
    const voice = pickTtsVoice(wanted);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang || 'en-US';
    } else {
      utter.lang = 'en-US';
    }
  }
  utter.rate = Number(((state.data && state.data.settings) || {}).ttsRate) || 0.92;
  if (onend) utter.onend = onend;
  try { if (synth.paused) synth.resume(); } catch (_) { /* ignore */ }
  synth.speak(utter);
}

function applyAudioRate(audio) {
  const rate = Number(((state.data && state.data.settings) || {}).ttsRate) || 0.92;
  try { audio.playbackRate = Math.min(1.2, Math.max(0.6, rate)); } catch (_) { /* ignore */ }
}

function speakYoudao(text, onend, accent, token) {
  const urls = [
    youdaoVoiceUrl(text, accent),
    youdaoVoiceUrl(text, accent === 'uk' ? 'us' : 'uk'),
  ];
  const fallbackVoice = accent === 'uk' ? 'lang:en-GB' : 'lang:en-US';
  const tryUrl = (index) => {
    if (token !== speakSerial) return;
    if (index >= urls.length) {
      speakSystem(text, onend, fallbackVoice);
      return;
    }
    const audio = new Audio();
    dictAudio = audio;
    audio.preload = 'auto';
    audio.setAttribute('playsinline', 'true');
    let settled = false;
    const fail = () => {
      if (settled || token !== speakSerial) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      tryUrl(index + 1);
    };
    audio.onerror = fail;
    audio.onended = () => {
      if (token === speakSerial && onend) onend();
    };
    audio.src = urls[index];
    let playing;
    try { playing = audio.play(); } catch (_) { fail(); return; }
    if (playing && playing.then) {
      playing.then(() => {
        if (token !== speakSerial) return;
        applyAudioRate(audio);
      }).catch(() => fail());
    }
  };
  tryUrl(0);
}

function speak(text, onend, voiceURI) {
  stopSpeak();
  const token = speakSerial;
  const word = String(text || '').trim();
  if (!word) {
    if (onend) onend();
    return;
  }
  const wanted = String(voiceURI != null ? voiceURI : (((state.data && state.data.settings) || {}).ttsVoiceURI || 'youdao:us'));
  if (wanted.indexOf('youdao:') === 0) {
    speakYoudao(word, onend, wanted === 'youdao:uk' ? 'uk' : 'us', token);
    return;
  }
  speakSystem(word, onend, wanted);
}

let scanPasteHandler = null;
let notebookSaveTimer = null;
let writingShowTimer = null;
let writingShowKey = null;
let writingShowKeyUp = null;
let notebookSession = null;
let notebookWriteChain = Promise.resolve();

function currentNotebook(bookId) {
  const id = bookId || state.bookId;
  return String(((((state.data || {}).books || {})[id] || {}).notebook) || '');
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

function notebookBackupKey() {
  return 'wordnest-notebook-bak-v1';
}

function writeNotebookBackup(bookId, text) {
  const value = String(text || '');
  if (!bookId || !value.trim()) return;
  try {
    const all = JSON.parse(localStorage.getItem(notebookBackupKey()) || '{}') || {};
    all[bookId] = { text: value, at: Date.now() };
    localStorage.setItem(notebookBackupKey(), JSON.stringify(all));
  } catch (_) { /* ignore quota */ }
}

function readNotebookBackup(bookId) {
  try {
    const all = JSON.parse(localStorage.getItem(notebookBackupKey()) || '{}') || {};
    return String((all[bookId] && all[bookId].text) || '');
  } catch (_) {
    return '';
  }
}

function persistNotebookNow(text, opts) {
  if (!api.updateNotebook) return Promise.resolve('');
  const bookId = (opts && opts.bookId) || (notebookSession && notebookSession.bookId) || state.bookId;
  const value = String(text || '');
  const existing = currentNotebook(bookId);
  if (!value.trim() && existing.trim() && !(opts && opts.allowEmpty)) {
    return Promise.resolve(existing);
  }
  return api.updateNotebook(bookId, value).then((saved) => {
    const next = String(saved != null ? saved : value);
    if (state.data && state.data.books && state.data.books[bookId]) {
      state.data.books[bookId].notebook = next;
      state.data.books[bookId].notebookUpdatedAt = new Date().toISOString();
    }
    if (next.trim()) writeNotebookBackup(bookId, next);
    const btn = document.getElementById('btn-notebook');
    if (btn && bookId === state.bookId) btn.classList.toggle('has-notes', Boolean(next.trim()));
    if (notebookSession && notebookSession.bookId === bookId) notebookSession.lastGood = next;
    return next;
  });
}

function persistNotebook(text, opts) {
  const job = persistNotebookNow(text, opts);
  notebookWriteChain = notebookWriteChain.then(() => job, () => job);
  return job;
}

function notebookMarkdownToHtml(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function notebookNodeIsBold(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = node.tagName.toLowerCase();
  if (tag === 'b' || tag === 'strong') return true;
  const weight = (node.style && node.style.fontWeight) || '';
  return weight === 'bold' || Number(weight) >= 600;
}

function notebookHtmlToMarkdown(root) {
  if (!root) return '';
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    const inner = Array.from(node.childNodes).map(walk).join('');
    if (notebookNodeIsBold(node)) return inner ? `**${inner.replace(/^\*\*|\*\*$/g, '')}**` : '';
    if (tag === 'div' || tag === 'p' || tag === 'li' || tag === 'h1' || tag === 'h2' || tag === 'h3') {
      return inner + '\n';
    }
    return inner;
  }
  return walk(root).replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

function readNotebookValue(box) {
  if (!box) return null;
  if (box.getAttribute && box.getAttribute('contenteditable') === 'true') {
    const md = notebookHtmlToMarkdown(box);
    const plain = String(box.innerText || box.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
    if (md.trim()) {
      const mdPlain = md.replace(/\*+/g, '').replace(/\s+/g, '');
      const visPlain = plain.replace(/\s+/g, '');
      if (visPlain && mdPlain.length < visPlain.length * 0.5) return plain;
      return md;
    }
    return plain;
  }
  if ('value' in box) return box.value;
  return box.textContent || '';
}

function notebookEditorHasText(box) {
  if (!box) return false;
  return Boolean(String(box.innerText || box.textContent || '').replace(/\u00a0/g, ' ').trim());
}

function flushOpenNotebook() {
  const box = ui.overlay && ui.overlay.querySelector('#nb-text');
  if (!box || !notebookSession) return Promise.resolve('');
  try { box.blur(); } catch (_) { /* ignore */ }
  const value = readNotebookValue(box);
  const allowEmpty = notebookSession.dirty && !notebookEditorHasText(box);
  return persistNotebook(value, { bookId: notebookSession.bookId, allowEmpty });
}

function glossForExport(word) {
  return senseList(word)
    .map(item => String(item.text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('；');
}

function exportWordLines(words, mode) {
  return (words || []).slice()
    .sort((a, b) => String(a.text || '').localeCompare(String(b.text || ''), 'en', { sensitivity: 'base' }))
    .map((word) => {
      const text = String(word.text || '').trim();
      if (!text) return '';
      if (mode !== 'bilingual') return text;
      const gloss = glossForExport(word);
      return gloss ? `${text}\t${gloss}` : text;
    })
    .filter(Boolean)
    .join('\n');
}

async function copyPlainText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) { /* fall through */ }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  area.remove();
  return ok;
}

function downloadPlainText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openExport() {
  const words = currentWords();
  const meta = bookMeta(state.bookId);
  if (!words.length) {
    openOverlay(`<div class="modal"><h2>这一册还没有单词</h2><p class="help">先加入单词，再导出「${escapeHtml(meta.name)}」。</p><div class="modal-actions"><button type="button" class="primary" data-close>好</button></div></div>`);
    return;
  }
  let mode = 'bilingual';
  function body() { return exportWordLines(words, mode); }
  openOverlay(`
    <div class="modal">
      <h2>导出${escapeHtml(meta.name)}</h2>
      <p class="help">这一册共 ${words.length} 个单词，按字母排成一行一个。选了中文时，释义跟在同一行后面，中间是制表符，贴进表格或 Anki 会分成两列。</p>
      <div class="scan-mode" id="export-mode">
        <label><input type="radio" name="export-mode" value="en"><span><b>只有英文</b><small>一行一个单词</small></span></label>
        <label><input type="radio" name="export-mode" value="bilingual" checked><span><b>英文 + 中文</b><small>释义写在同一行后面</small></span></label>
      </div>
      <textarea id="export-preview" class="export-preview" readonly></textarea>
      <p class="help" id="export-status">复制后可以直接粘贴到笔记或表格。</p>
      <div class="modal-actions">
        <button type="button" class="ghost" data-close>关闭</button>
        <button type="button" class="secondary" id="export-download">下载文本</button>
        <button type="button" class="primary" id="export-copy">复制全部</button>
      </div>
    </div>
  `);
  const preview = ui.overlay.querySelector('#export-preview');
  const status = ui.overlay.querySelector('#export-status');
  const refresh = () => { preview.value = body(); };
  refresh();
  ui.overlay.querySelectorAll('input[name="export-mode"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      mode = input.value === 'en' ? 'en' : 'bilingual';
      refresh();
      status.textContent = '复制后可以直接粘贴到笔记或表格。';
    });
  });
  ui.overlay.querySelector('#export-copy').addEventListener('click', async () => {
    const ok = await copyPlainText(body());
    status.textContent = ok ? `已复制 ${words.length} 行。` : '复制失败，可以选中预览文字手动复制，或改用下载。';
  });
  ui.overlay.querySelector('#export-download').addEventListener('click', () => {
    const suffix = mode === 'en' ? '英文' : '英中';
    downloadPlainText(`词栖-${meta.name}-${suffix}.txt`, body());
    status.textContent = '已开始下载文本文件。';
  });
}

function openNotebook() {
  const meta = bookMeta(state.bookId);
  let text = currentNotebook();
  if (!text.trim()) {
    const backup = readNotebookBackup(state.bookId);
    if (backup.trim()) {
      text = backup;
      persistNotebook(text, { bookId: state.bookId }).catch(() => {});
    }
  }
  notebookSession = { bookId: state.bookId, original: text, lastGood: text, dirty: false };
  openOverlay(`
    <div class="modal notebook-modal">
      <div class="notebook-head">
        <div>
          <h2>${escapeHtml(meta.name)}笔记本</h2>
          <p class="help">只属于「${escapeHtml(meta.name)}」这一册，和单词一起云端覆盖同步。选中文字后点「标粗」，或按 Ctrl / ⌘ + B。</p>
          <p class="help" id="nb-status">${text.trim() ? '已保存' : '还是空白，写一点会自动保存。'}</p>
        </div>
        <div class="modal-actions">
          <button type="button" class="ghost" data-close>关闭</button>
          <button type="button" class="primary" id="nb-save">保存</button>
        </div>
      </div>
      <div class="notebook-tools">
        <button type="button" id="nb-bold" class="nb-bold" title="标粗 Ctrl+B"><b>B</b> 标粗</button>
      </div>
      <div id="nb-text" class="notebook-input" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" role="textbox" aria-multiline="true" data-placeholder="在这里写这一册的笔记…"></div>
    </div>
  `);
  const box = ui.overlay.querySelector('#nb-text');
  const status = ui.overlay.querySelector('#nb-status');
  const boldBtn = ui.overlay.querySelector('#nb-bold');
  if (text.trim()) box.innerHTML = notebookMarkdownToHtml(text);
  else box.innerHTML = '';

  let composing = false;
  const markEmpty = () => {
    if (composing) return;
    box.classList.toggle('is-empty', !notebookEditorHasText(box));
  };
  markEmpty();

  const scheduleSave = () => {
    clearTimeout(notebookSaveTimer);
    notebookSaveTimer = setTimeout(saveNow, 1200);
  };
  const saveNow = async () => {
    if (composing) {
      scheduleSave();
      return;
    }
    status.textContent = '正在保存…';
    try {
      const value = readNotebookValue(box);
      const allowEmpty = notebookSession && notebookSession.dirty && !notebookEditorHasText(box);
      await persistNotebook(value, { bookId: notebookSession && notebookSession.bookId, allowEmpty });
      if (notebookSession) {
        notebookSession.original = currentNotebook(notebookSession.bookId);
        notebookSession.dirty = false;
      }
      status.textContent = '已保存';
    } catch (err) {
      status.textContent = err.message || '保存失败';
    }
  };
  const noteChanged = () => {
    if (composing) return;
    if (notebookSession) notebookSession.dirty = true;
    markEmpty();
    status.textContent = '未保存';
    scheduleSave();
  };
  box.addEventListener('compositionstart', () => {
    composing = true;
    clearTimeout(notebookSaveTimer);
  });
  box.addEventListener('compositionend', () => {
    composing = false;
    noteChanged();
  });
  box.addEventListener('input', () => {
    noteChanged();
  });
  box.addEventListener('paste', (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, pasted);
  });
  function applyBold() {
    box.focus();
    try { document.execCommand('styleWithCSS', false, false); } catch (_) { /* ignore */ }
    document.execCommand('bold');
    box.dispatchEvent(new Event('input'));
  }
  boldBtn.addEventListener('mousedown', (event) => event.preventDefault());
  boldBtn.addEventListener('click', applyBold);
  box.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      applyBold();
    }
  });
  ui.overlay.querySelector('#nb-save').addEventListener('click', () => {
    clearTimeout(notebookSaveTimer);
    saveNow();
  });
  box.focus();
}

function clearWritingShowTimer() {
  if (writingShowTimer) {
    clearInterval(writingShowTimer);
    writingShowTimer = null;
  }
  if (writingShowKey) {
    document.removeEventListener('keydown', writingShowKey);
    writingShowKey = null;
  }
  if (writingShowKeyUp) {
    document.removeEventListener('keyup', writingShowKeyUp);
    writingShowKeyUp = null;
  }
}

let overlayReturnFocus = null;
let toastTimer = null;

function setPageInert(inert) {
  [document.querySelector('.desk'), ui.mobileNav, document.getElementById('btn-menu')].forEach((element) => {
    if (element) element.inert = Boolean(inert);
  });
}

function closeOverlay() {
  const wasOpen = ui.overlay.classList.contains('open');
  const pending = flushOpenNotebook();
  if (notebookSaveTimer) {
    clearTimeout(notebookSaveTimer);
    notebookSaveTimer = null;
  }
  notebookSession = null;
  clearWritingShowTimer();
  state.speaking = false;
  scanPasteHandler = null;
  stopSpeak();
  ui.overlay.classList.remove('open');
  ui.overlay.hidden = true;
  ui.overlay.setAttribute('hidden', '');
  ui.overlay.innerHTML = '';
  document.body.classList.remove('modal-open');
  setPageInert(false);
  pending.catch(() => {});
  if (wasOpen && overlayReturnFocus && overlayReturnFocus.isConnected) {
    const target = overlayReturnFocus;
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }
  overlayReturnFocus = null;
}

function openOverlay(html) {
  const wasOpen = ui.overlay.classList.contains('open');
  if (!wasOpen) overlayReturnFocus = document.activeElement;
  flushOpenNotebook();
  ui.overlay.innerHTML = html;
  ui.overlay.hidden = false;
  ui.overlay.removeAttribute('hidden');
  ui.overlay.classList.add('open');
  document.body.classList.add('modal-open');
  setPageInert(true);
  const modal = ui.overlay.querySelector('.modal');
  if (modal) {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.tabIndex = -1;
    const heading = modal.querySelector('h2');
    if (heading) {
      heading.id = 'wordnest-dialog-title';
      modal.setAttribute('aria-labelledby', heading.id);
    }
    requestAnimationFrame(() => {
      if (ui.overlay.classList.contains('open') && !modal.contains(document.activeElement)) {
        modal.focus({ preventScroll: true });
      }
    });
  }
}

function showToast(message) {
  if (!ui.toast || !message) return;
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  requestAnimationFrame(() => ui.toast.classList.add('show'));
  toastTimer = setTimeout(() => {
    ui.toast.classList.remove('show');
    setTimeout(() => { ui.toast.hidden = true; }, 180);
  }, 2400);
}

function currentWords() {
  return ((((state.data || {}).books || {})[state.bookId] || {}).words || []);
}

function bookWordKeys(bookId) {
  const words = ((((state.data || {}).books || {})[bookId || state.bookId] || {}).words) || [];
  return new Set(words.map(word => String(word.text || '').trim().toLowerCase()).filter(Boolean));
}

function wordTags(word) {
  return (word && word.tags ? word.tags : []).map(tag => String(tag || '').trim()).filter(Boolean);
}

function filteredWords() {
  const q = state.query.trim().toLowerCase();
  const words = sourceWords().slice().filter((word) => {
    if (!q) return true;
    const tags = wordTags(word);
    return `${word.text} ${word.meaning} ${word.ieltsMeaning || ''} ${word.otherMeanings || ''} ${word.notes} ${tags.join(' ')}`.toLowerCase().includes(q);
  });
  words.sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return words;
}

function reviewTimeLabel(word) {
  if (word && word.review && word.review.mastered) return '阶段学习已完成';
  if (isDue(word)) return '现在适合复习';
  const dueAt = Date.parse(word && word.review && word.review.dueAt);
  if (!Number.isFinite(dueAt)) return '等待安排复习';
  const minutes = Math.max(1, Math.ceil((dueAt - Date.now()) / 60000));
  if (minutes < 60) return `${minutes} 分钟后复习`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} 小时后复习`;
  const days = Math.ceil(hours / 24);
  if (days < 7) return `${days} 天后复习`;
  return `${new Date(dueAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}复习`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseExamAt(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function toDatetimeLocalValue(iso) {
  const time = parseExamAt(iso);
  if (time == null) return '';
  const date = new Date(time);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
  if (!value) return '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

function formatExamDate(iso) {
  const time = parseExamAt(iso);
  if (time == null) return '';
  const date = new Date(time);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function examRemaining(target, now) {
  const ms = target - (now || Date.now());
  if (ms <= 0) return { overdue: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const total = Math.floor(ms / 1000);
  return {
    overdue: false,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

let examTimer = null;

function examCardHtml() {
  const iso = ((state.data.settings || {}).ieltsExamAt) || '';
  const target = parseExamAt(iso);
  if (target == null) {
    return `<span class="exam-kicker">IELTS</span>
      <strong>雅思考试倒计时</strong>
      <span class="exam-note">点这里设置考试日期和时间</span>`;
  }
  const left = examRemaining(target);
  if (left.overdue) {
    return `<span class="exam-kicker">IELTS</span>
      <strong>考试时间已到</strong>
      <span class="exam-date">${escapeHtml(formatExamDate(iso))}</span>`;
  }
  return `<span class="exam-kicker">IELTS</span>
    <strong>距离考试</strong>
    <span class="exam-date">${escapeHtml(formatExamDate(iso))}</span>
    <div class="exam-units">
      <span><b>${left.days}</b><small>天</small></span>
      <span><b>${pad2(left.hours)}</b><small>时</small></span>
      <span><b>${pad2(left.minutes)}</b><small>分</small></span>
      <span><b>${pad2(left.seconds)}</b><small>秒</small></span>
    </div>`;
}

function examMode(iso) {
  const target = parseExamAt(iso);
  if (target == null) return 'empty';
  return target <= Date.now() ? 'overdue' : 'live';
}

function renderExamCountdown() {
  if (!ui.exam) return;
  const iso = ((state.data.settings || {}).ieltsExamAt) || '';
  const mode = examMode(iso);
  ui.exam.classList.toggle('empty', mode === 'empty');
  ui.exam.classList.toggle('overdue', mode === 'overdue');
  if (ui.exam.dataset.mode !== mode || ui.exam.dataset.at !== iso) {
    ui.exam.dataset.mode = mode;
    ui.exam.dataset.at = iso;
    ui.exam.innerHTML = examCardHtml();
    return;
  }
  if (mode !== 'live') return;
  const left = examRemaining(parseExamAt(iso));
  const nums = ui.exam.querySelectorAll('.exam-units b');
  if (nums.length === 4) {
    nums[0].textContent = String(left.days);
    nums[1].textContent = pad2(left.hours);
    nums[2].textContent = pad2(left.minutes);
    nums[3].textContent = pad2(left.seconds);
  }
}

function startExamTicker() {
  if (examTimer) clearInterval(examTimer);
  renderExamCountdown();
  examTimer = setInterval(renderExamCountdown, 1000);
}

async function saveExamAt(iso) {
  if (!state.data.settings) state.data.settings = {};
  state.data.settings.ieltsExamAt = iso || '';
  if (ui.exam) {
    ui.exam.dataset.mode = '';
    ui.exam.dataset.at = '';
  }
  try { await api.updateSettings({ ieltsExamAt: iso || '' }); } catch (_) { /* preview */ }
  renderExamCountdown();
}

function openExamForm() {
  const iso = ((state.data.settings || {}).ieltsExamAt) || '';
  openOverlay(`
    <div class="modal">
      <h2>雅思考试时间</h2>
      <p class="help">会显示在左侧四册下面，按天、时、分、秒倒计时。时间按你电脑的本地时区计算。</p>
      <label class="field"><span>考试日期和时间</span>
        <input id="exam-at" type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(iso))}">
      </label>
      <div class="modal-actions">
        <button type="button" class="ghost" data-close>取消</button>
        ${iso ? '<button type="button" class="danger" id="exam-clear">清除</button>' : ''}
        <button type="button" class="primary" id="exam-save">保存</button>
      </div>
    </div>
  `);
  ui.overlay.querySelector('#exam-save').addEventListener('click', async () => {
    await saveExamAt(fromDatetimeLocalValue(ui.overlay.querySelector('#exam-at').value));
    closeOverlay();
  });
  const clearBtn = ui.overlay.querySelector('#exam-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await saveExamAt('');
      closeOverlay();
    });
  }
}

function renderNav() {
  const books = (state.data && state.data.books) || emptyRendererState().books;
  const bookButton = (book) => {
    const due = dueInBook(book.id);
    const count = (((books[book.id] || {}).words) || []).length;
    const current = book.id === state.bookId;
    return `<button type="button" class="book-btn ${current ? 'active' : ''}" data-book="${book.id}" ${current ? 'aria-current="page"' : ''} aria-label="${book.name}单词本，${count} 个词${due ? `，${due} 个待复习` : ''}">
      <span class="book-icon">${BOOK_ICONS[book.id]}</span>
      <span class="book-copy"><b>${book.name}</b><small>${count} 个词</small></span>
      <span class="badge ${due ? '' : 'empty'}" title="${due ? `${due} 个待复习` : '暂无待复习'}">${due || (count ? '✓' : '—')}</span>
    </button>`;
  };
  ui.nav.innerHTML = BOOKS.map(bookButton).join('');

  if (ui.mobileNav) {
    const mobileBookButton = (book) => {
      const due = dueInBook(book.id);
      const current = book.id === state.bookId;
      return `<button type="button" class="mobile-book ${current ? 'active' : ''}" data-book="${book.id}" ${current ? 'aria-current="page"' : ''}>
        <span class="mobile-book-icon">${BOOK_ICONS[book.id]}</span>
        <span>${book.name}</span>
        ${due ? `<b class="mobile-due" aria-label="${due} 个待复习">${due > 99 ? '99+' : due}</b>` : ''}
      </button>`;
    };
    ui.mobileNav.innerHTML = [
      mobileBookButton(BOOKS[0]),
      mobileBookButton(BOOKS[1]),
      `<button type="button" class="mobile-add" data-mobile-action="add" aria-label="新增单词">
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        <small>新增</small>
      </button>`,
      mobileBookButton(BOOKS[2]),
      mobileBookButton(BOOKS[3]),
    ].join('');
  }

  if (ui.reviewDue) {
    const due = totalDueCount();
    ui.reviewDue.classList.toggle('is-complete', !due);
    ui.reviewDue.innerHTML = due
      ? `<span>开始今日复习</span><b>${due}</b>`
      : '<span>今日已完成</span><small>暂无到期</small>';
  }
}

function renderList() {
  const meta = bookMeta(state.bookId);
  const words = filteredWords();
  const all = currentWords();
  const due = dueInBook(state.bookId);
  const mastered = all.filter(word => word.review && word.review.mastered).length;
  const masteredPercent = all.length ? Math.round((mastered / all.length) * 100) : 0;
  document.body.dataset.book = meta.id;
  ui.title.textContent = meta.name;
  ui.en.textContent = meta.en;
  ui.hint.textContent = meta.hint;
  ui.list.dataset.book = meta.id;
  ui.list.setAttribute('aria-label', `${meta.name}单词列表，共 ${words.length} 个结果`);
  if (ui.speakAll) ui.speakAll.hidden = !meta.speak;
  if (ui.dictation) ui.dictation.hidden = meta.id !== 'listening';
  const notebookBtn = document.getElementById('btn-notebook');
  if (notebookBtn) notebookBtn.classList.toggle('has-notes', Boolean(currentNotebook().trim()));
  const mobileReviewLabel = document.querySelector('[data-mobile-action="review"] span');
  if (mobileReviewLabel) mobileReviewLabel.textContent = due ? `复习本册 · ${due}` : '复习本册';
  ui.stats.innerHTML = `
    <div class="stat"><span>本册收录</span><b>${all.length}</b></div>
    <div class="stat ${due ? 'has-due' : ''}"><span>待复习</span><b>${due}</b></div>
    <div class="stat stat-mastered" style="--mastered:${masteredPercent}%"><span>已掌握</span><b>${masteredPercent}%</b></div>
  `;
  if (!all.length) {
    ui.list.innerHTML = `<article class="empty-card">
      <div class="empty-visual" aria-hidden="true">
        <svg viewBox="0 0 64 64"><path d="M13 14.5h16a7 7 0 0 1 7 7V52H20a7 7 0 0 0-7 4V14.5Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M51 14.5H35a7 7 0 0 0-7 7V52h16a7 7 0 0 1 7 4V14.5Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m43 8 1.5 3.5L48 13l-3.5 1.5L43 18l-1.5-3.5L38 13l3.5-1.5L43 8Z" fill="currentColor"/></svg>
      </div>
      <span class="empty-kicker">${meta.name}单词本</span>
      <h2>从第一个词开始积累</h2>
      <p>随手记下今天遇到的词，词栖会按记忆节奏安排复习，让积累慢慢变成掌握。</p>
      <div class="empty-actions">
        <button type="button" class="primary" data-empty-action="add">新增一个词</button>
        <button type="button" class="secondary" data-empty-action="batch">批量粘贴</button>
      </div>
      <small class="empty-tip">电脑端也可以按 Ctrl/⌘ + N 快速新增</small>
    </article>`;
    return;
  }
  if (!words.length) {
    ui.list.innerHTML = `<article class="empty-card compact">
      <div class="empty-visual search-empty" aria-hidden="true">
        <svg viewBox="0 0 64 64"><circle cx="28" cy="28" r="15" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="m39 39 12 12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
      </div>
      <h2>没有找到匹配的单词</h2>
      <p>可以换个关键词，或清除搜索与来源筛选。</p>
      <div class="empty-actions"><button type="button" class="secondary" data-empty-action="clear">清除筛选</button></div>
    </article>`;
    return;
  }
  ui.list.innerHTML = words.map((word) => `
    <article class="word-card ${isDue(word) ? 'due' : ''}" data-id="${escapeHtml(word.id)}">
      <div>
        <div class="word-en">${escapeHtml(word.text)}</div>
        ${word.phonetic ? `<div class="phonetic">${escapeHtml(word.phonetic)}</div>` : ''}
        ${meaningHtml(word)}
        ${tagHtml(word)}
        ${examplePickerHtml(word)}
        <p class="meta review-meta ${isDue(word) ? 'due' : (word.review && word.review.mastered ? 'mastered' : '')}">
          <span class="status-dot" aria-hidden="true"></span>${escapeHtml(reviewTimeLabel(word))}
        </p>
      </div>
      <div class="row-actions">
        <button type="button" class="icon-btn ghost" data-act="speak" aria-label="发音" title="发音"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9H5z" fill="currentColor"/><path d="M16.5 8.5a4.5 4.5 0 010 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
        <button type="button" class="icon-btn ghost" data-act="edit" aria-label="编辑" title="编辑"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
        <button type="button" class="icon-btn danger" data-act="delete" aria-label="删除" title="删除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2m-6 0l.8 12h6.4l.8-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </article>
  `).join('');
  ui.list.querySelectorAll('.word-card').forEach((card) => {
    const word = all.find(item => item.id === card.dataset.id);
    card.querySelector('[data-act="speak"]').addEventListener('click', () => speak(word.text));
    card.querySelector('[data-act="edit"]').addEventListener('click', () => openWordForm(word));
    bindExamplePanel(card, word);
    card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      if (!window.confirm(`从「${meta.name}」中删除 ${word.text}？`)) return;
      await api.deleteWord(state.bookId, word.id);
      await reload();
      showToast(`已从${meta.name}册删除 ${word.text}`);
    });
  });
}

function render() {
  renderNav();
  renderList();
  renderExamCountdown();
  const filter = document.getElementById('tag-filter');
  if (filter) {
    const current = state.tagFilter;
    filter.innerHTML = sourceFilterHtml(current);
    filter.value = current;
  }
}

function openMobileTools() {
  const meta = bookMeta(state.bookId);
  const tools = [
    {
      id: 'manage',
      label: '批量整理',
      hint: '标签与删除',
      icon: '<path d="M7 6h13M7 12h13M7 18h13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m3.5 6 .8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    },
    {
      id: 'notebook',
      label: '本册笔记',
      hint: '记录素材',
      icon: '<path d="M6 3.5h11a2 2 0 0 1 2 2v15H8a3 3 0 0 1-3-3v-13a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 17.5a3 3 0 0 1 3-3h11M9 8h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    },
    {
      id: 'export',
      label: '导出单词',
      hint: '复制或下载',
      icon: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 15v5h14v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    },
  ];
  if (api.desktop) {
    tools.unshift({
      id: 'scan',
      label: '图片识词',
      hint: '扫描重点词',
      icon: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    });
  }
  if (meta.id === 'listening') {
    tools.unshift({
      id: 'dictation',
      label: '听写练习',
      hint: '听音后拼写',
      icon: '<path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6.5 11.5v.5a5.5 5.5 0 0 0 11 0v-.5M12 17.5V21M9.5 21h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    });
  }
  if (meta.speak) {
    tools.unshift({
      id: 'speak',
      label: '顺序朗读',
      hint: '整册播放',
      icon: '<path d="M5 9v6h4l5 4V5L9 9H5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M17 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    });
  }
  tools.push({
    id: 'settings',
    label: '设置与备份',
    hint: '同步与偏好',
    icon: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.5 1A7 7 0 0 0 14.3 5L14 2.5h-4L9.7 5a7 7 0 0 0-2.1 1.8l-2.5-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.5-1A7 7 0 0 0 9.7 19l.3 2.5h4l.3-2.5a7 7 0 0 0 2.1-1.8l2.5 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  });
  openOverlay(`
    <div class="modal mobile-tools-modal">
      <div class="sheet-handle" aria-hidden="true"></div>
      <span class="empty-kicker">${meta.name}单词本</span>
      <h2>更多工具</h2>
      <p class="help">选择接下来要做的事。</p>
      <div class="mobile-tool-grid">
        ${tools.map(tool => `<button type="button" data-mobile-tool="${tool.id}">
          <span class="mobile-tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${tool.icon}</svg></span>
          <span><b>${tool.label}</b><small>${tool.hint}</small></span>
        </button>`).join('')}
      </div>
      <div class="modal-actions"><button type="button" class="ghost" data-close>取消</button></div>
    </div>
  `);
}

async function reload() {
  ui.list.setAttribute('aria-busy', 'true');
  try {
    state.data = await api.getState();
    if (ui.exam) {
      ui.exam.dataset.mode = '';
      ui.exam.dataset.at = '';
    }
    render();
  } finally {
    ui.list.setAttribute('aria-busy', 'false');
  }
}

function extractEnglishItems(raw) {
  const seen = new Set();
  const out = [];
  String(raw || '')
    .replace(/[\u3400-\u9fff\uf900-\ufaff]+/g, '\n')
    .split(/[\n\r,，、;；|]+/)
    .forEach((item) => {
      const text = String(item || '')
        .replace(/[^A-Za-z'’\-\s]/g, ' ')
        .replace(/['’]+/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || text.length > 80 || !/[A-Za-z]{2,}/.test(text)) return;
      const parts = text.split(' ');
      const chunks = parts.length > 8 ? parts : [text];
      chunks.forEach((chunk) => {
        const value = String(chunk || '').trim();
        if (!value || value.length > 80 || !/[A-Za-z]{2,}/.test(value)) return;
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(value);
      });
    });
  return out;
}

function parseBatchItems(raw) {
  return extractEnglishItems(raw);
}

function primaryEnglish(raw) {
  return extractEnglishItems(raw)[0] || '';
}

function wordSnippet(word) {
  return String(word.ieltsMeaning || word.meaning || word.otherMeanings || word.notes || '').replace(/\s+/g, ' ').trim();
}

async function deleteSelectedWords(bookId, ids) {
  const list = (ids || []).map(item => String(item)).filter(Boolean);
  if (!list.length) return 0;
  if (api.deleteWords) {
    const result = await api.deleteWords(bookId, list);
    return (result && result.deleted) || list.length;
  }
  for (const id of list) await api.deleteWord(bookId, id);
  return list.length;
}

async function tagSelectedWords(bookId, ids, tags) {
  const list = (ids || []).map(item => String(item)).filter(Boolean);
  const extra = String(tags || '').split(/[,，、;；]+/).map(item => item.trim()).filter(Boolean);
  if (!list.length || !extra.length) return 0;
  if (api.tagWords) {
    const result = await api.tagWords(bookId, list, extra);
    return (result && result.updated) || list.length;
  }
  for (const id of list) {
    const word = currentWords().find(item => item.id === id) || {};
    await api.updateWord(bookId, id, { tags: Array.from(new Set(wordTags(word).concat(extra))) });
  }
  return list.length;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const n = Math.max(1, Math.min(limit || 4, items.length || 1));
  await Promise.all(Array.from({ length: items.length ? n : 0 }, worker));
  return out;
}

function addModeSwitch(mode) {
  return `<div class="scan-mode" role="radiogroup" aria-label="加入方式">
    <label>
      <input type="radio" name="add-mode" value="single" ${mode === 'single' ? 'checked' : ''}>
      <span><b>单个加入</b><small>查完释义再保存</small></span>
    </label>
    <label>
      <input type="radio" name="add-mode" value="batch" ${mode === 'batch' ? 'checked' : ''}>
      <span><b>批量加入</b><small>每行一个词或短语</small></span>
    </label>
  </div>`;
}

function openWordForm(existing, startMode) {
  const word = existing || { text: '', meaning: '', ieltsMeaning: '', otherMeanings: '', phonetic: '', example: '', notes: '', tags: [] };
  const tagValue = (word.tags || [])[0] || '';
  let mode = existing ? 'single' : (startMode === 'batch' ? 'batch' : 'single');

  function bindModeSwitch() {
    ui.overlay.querySelectorAll('input[name="add-mode"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        mode = input.value;
        paint();
      });
    });
  }

  function paintSingle() {
    openOverlay(`
      <div class="modal">
        <h2>${existing ? '编辑单词' : '打字加入'}</h2>
        ${existing ? '' : addModeSwitch('single')}
        <p class="help">加入后会进入当前「${bookMeta(state.bookId).name}」单词本。手动输入时中文会自动忽略，只保留英文单词或短语。如果这个词已经在本册，保存时会把新标签加到原词上，不会再建一条。</p>
        <div class="grid-2">
          <label class="field"><span>单词</span><input id="f-text" value="${escapeHtml(word.text)}" ${existing ? 'readonly' : ''} placeholder="例如：certificate 证书"></label>
          <label class="field"><span>音标</span><input id="f-phonetic" value="${escapeHtml(word.phonetic)}"></label>
        </div>
        <label class="field"><span>来源书 / 标签</span>
          <input id="f-tag" list="tag-list" value="${escapeHtml(tagValue)}" placeholder="例如：剑雅 17、王陆 807">
          <datalist id="tag-list">${collectedTags().map(tag => `<option value="${escapeHtml(tag)}">`).join('')}</datalist>
        </label>
        <label class="field"><span>雅思常考意思</span><textarea id="f-ielts">${escapeHtml(word.ieltsMeaning || word.meaning)}</textarea></label>
        <label class="field"><span>其他意思</span><textarea id="f-other">${escapeHtml(word.otherMeanings)}</textarea></label>
        <label class="field"><span>例句</span><textarea id="f-example">${escapeHtml(word.example)}</textarea></label>
        <label class="field"><span>笔记</span><textarea id="f-notes">${escapeHtml(word.notes)}</textarea></label>
        <p class="help" id="f-status"></p>
        <div class="modal-actions">
          <button type="button" class="ghost" data-close>取消</button>
          <button type="button" class="secondary" id="f-lookup">自动查词</button>
          <button type="button" class="primary" id="f-save">保存</button>
        </div>
      </div>
    `);
    const $ = (id) => ui.overlay.querySelector(id);
    bindModeSwitch();
    $('#f-lookup').addEventListener('click', async () => {
      const status = $('#f-status');
      const english = existing ? String($('#f-text').value || '').trim() : primaryEnglish($('#f-text').value);
      if (english && !existing) $('#f-text').value = english;
      if (!english) {
        if (status) status.textContent = '请先输入英文单词或短语，中文会被忽略。';
        return;
      }
      $('#f-lookup').disabled = true;
      $('#f-lookup').textContent = '正在查词…';
      if (status) status.textContent = '正在查有道词典…';
      try {
        const queried = english;
        const found = await lookupWord(queried);
        if (String($('#f-text').value || '').trim() !== queried) return;
        if (found.ieltsMeaning || found.phonetic || found.example) {
          $('#f-phonetic').value = found.phonetic || '';
          $('#f-ielts').value = found.ieltsMeaning || '';
          $('#f-other').value = found.otherMeanings || '';
          $('#f-example').value = found.example || '';
          if (status) status.textContent = '已填入查到的释义。';
        } else if (status) {
          status.textContent = '没有查到释义，可以先手填再保存。';
        }
      } catch (err) {
        if (status) status.textContent = err.message || '查词失败';
      }
      $('#f-lookup').disabled = false;
      $('#f-lookup').textContent = '自动查词';
    });
    if (!existing) {
      $('#f-text').addEventListener('blur', () => {
        const english = primaryEnglish($('#f-text').value);
        if (english) $('#f-text').value = english;
      });
    }
    $('#f-save').addEventListener('click', async () => {
      const english = existing ? String($('#f-text').value || '').trim() : primaryEnglish($('#f-text').value);
      if (english && !existing) $('#f-text').value = english;
      if (!english) {
        const status = $('#f-status');
        if (status) status.textContent = '请输入英文单词或短语，中文会被忽略。';
        return;
      }
      const payload = {
        text: english,
        phonetic: $('#f-phonetic').value.trim(),
        ieltsMeaning: $('#f-ielts').value.trim(),
        otherMeanings: $('#f-other').value.trim(),
        meaning: $('#f-ielts').value.trim(),
        example: $('#f-example').value.trim(),
        notes: $('#f-notes').value.trim(),
        tags: $('#f-tag').value.trim() ? [$('#f-tag').value.trim()] : [],
        source: existing ? existing.source : 'manual',
      };
      if (!payload.text) return;
      if (existing) await api.updateWord(state.bookId, existing.id, payload);
      else await api.addWords(state.bookId, [payload]);
      closeOverlay();
      await reload();
      showToast(existing ? `已保存 ${payload.text}` : `已加入 ${payload.text}`);
    });
    $('#f-text').focus();
  }

  function paintBatch() {
    openOverlay(`
      <div class="modal">
        <h2>批量加入</h2>
        ${addModeSwitch('batch')}
        <p class="help">每行一个单词或短语，也可用逗号分隔。中文会自动忽略，只识别英文。已有的词不会再建一条；填了标签时，会把这个标签加到那些词上。</p>
        <label class="field"><span>来源书 / 标签</span>
          <input id="f-tag" list="tag-list" value="${escapeHtml(tagValue)}" placeholder="例如：剑雅 17、王陆 807">
          <datalist id="tag-list">${collectedTags().map(tag => `<option value="${escapeHtml(tag)}">`).join('')}</datalist>
        </label>
        <label class="field"><span>词语列表</span>
          <textarea id="f-batch" class="batch-input" placeholder="airfare 机票&#10;in advance 提前&#10;have to"></textarea>
        </label>
        <label class="check-row">
          <input id="f-batch-lookup" type="checkbox" checked>
          <span>加入时自动查释义（有道词典，已在本册的不查，只补标签）</span>
        </label>
        <p class="help" id="f-status"></p>
        <div class="modal-actions">
          <button type="button" class="ghost" data-close>取消</button>
          <button type="button" class="primary" id="f-save">加入本册</button>
        </div>
      </div>
    `);
    const $ = (id) => ui.overlay.querySelector(id);
    bindModeSwitch();
    $('#f-save').addEventListener('click', async () => {
      const items = parseBatchItems($('#f-batch').value);
      const status = $('#f-status');
      if (!items.length) {
        if (status) status.textContent = '没有识别到英文。请粘贴单词或短语，中文会被忽略。';
        return;
      }
      const tag = ($('#f-tag').value || '').trim();
      const existingKeys = bookWordKeys(state.bookId);
      const fresh = [];
      const already = [];
      items.forEach((text) => {
        if (existingKeys.has(text.toLowerCase())) already.push(text);
        else fresh.push(text);
      });
      if (!fresh.length && !tag) {
        if (status) status.textContent = `这 ${items.length} 个词都已在本册。填上来源书标签后，可以把这个标签加到原词上。`;
        return;
      }
      const doLookup = $('#f-batch-lookup').checked;
      $('#f-save').disabled = true;
      let filled = [];
      try {
        if (doLookup && fresh.length) {
          let done = 0;
          if (status) status.textContent = `正在查词 0 / ${fresh.length}…`;
          filled = await mapLimit(fresh, 4, async (text) => {
            const extra = await lookupWord(text);
            done += 1;
            if (status) status.textContent = `正在查词 ${done} / ${fresh.length}…`;
            return Object.assign({ source: 'manual', tags: tag ? [tag] : [] }, extra, { text });
          });
        } else {
          filled = fresh.map(text => ({ text, source: 'manual', tags: tag ? [tag] : [] }));
        }
        const tagged = tag ? already.map(text => ({ text, source: 'manual', tags: [tag] })) : [];
        const result = await api.addWords(state.bookId, filled.concat(tagged));
        closeOverlay();
        await reload();
        const added = (result && result.added && result.added.length) || 0;
        const existed = tag ? already.length : 0;
        const skipped = tag ? 0 : already.length;
        const parts = [];
        if (added) parts.push(`新增 ${added} 个词条`);
        if (existed) parts.push(`已给 ${existed} 个已有词加上「${tag}」`);
        if (skipped) parts.push(`${skipped} 个已在本册，没有重复添加`);
        openOverlay(`<div class="modal"><h2>已加入本册</h2><p class="help">${parts.join('，') || '没有新的改动'}。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
      } catch (err) {
        if (status) status.textContent = err.message || '加入失败';
        $('#f-save').disabled = false;
      }
    });
    $('#f-batch').focus();
  }

  function paint() {
    if (mode === 'batch' && !existing) paintBatch();
    else paintSingle();
  }
  paint();
}

function openBatchManage() {
  const meta = bookMeta(state.bookId);
  let all = currentWords().slice().sort((a, b) => String(a.text || '').localeCompare(String(b.text || ''), 'en', { sensitivity: 'base' }));
  const selected = new Set();
  let query = '';
  let tagFilter = state.tagFilter || '';

  function visibleWords() {
    const q = query.trim().toLowerCase();
    return all.filter((word) => {
      const tags = wordTags(word);
      if (tagFilter === UNTAGGED_FILTER && tags.length) return false;
      if (tagFilter && tagFilter !== UNTAGGED_FILTER && !tags.includes(tagFilter)) return false;
      if (!q) return true;
      return `${word.text} ${word.ieltsMeaning || ''} ${word.meaning || ''} ${word.otherMeanings || ''} ${tags.join(' ')}`.toLowerCase().includes(q);
    });
  }

  function setStatus(text) {
    const status = ui.overlay.querySelector('#manage-status');
    if (status) status.textContent = text || '';
  }

  function paintList() {
    const list = ui.overlay.querySelector('#manage-list');
    const count = ui.overlay.querySelector('#manage-count');
    const shown = visibleWords();
    if (!all.length) {
      list.innerHTML = '<article class="empty-card"><h2>这一册还是空白</h2><p>没有可管理的词条。</p></article>';
    } else if (!shown.length) {
      list.innerHTML = '<article class="empty-card"><h2>没有匹配的单词</h2><p>试试别的检索词。</p></article>';
    } else {
      list.innerHTML = shown.map((word) => {
        const snippet = wordSnippet(word);
        const tags = wordTags(word);
        const extra = [snippet, tags.length ? tags.join('、') : '没有标记'].filter(Boolean).join(' · ');
        return `<label class="manage-row">
          <input type="checkbox" data-id="${escapeHtml(word.id)}" ${selected.has(word.id) ? 'checked' : ''}>
          <span><b>${escapeHtml(word.text)}</b>${extra ? `<small>${escapeHtml(extra)}</small>` : ''}</span>
        </label>`;
      }).join('');
    }
    if (count) count.textContent = `已选 ${selected.size} / 当前 ${shown.length}`;
  }

  function updateCount() {
    const count = ui.overlay.querySelector('#manage-count');
    if (count) count.textContent = `已选 ${selected.size} / 当前 ${visibleWords().length}`;
  }

  openOverlay(`
    <div class="modal">
      <h2>批量管理</h2>
      <p class="help">勾选当前「${meta.name}」里的词条，可以加标签或删除。加标签会并到已有来源上，不会覆盖；只动本册。检索可以按单词、释义或标签。</p>
      <div class="manage-toolbar">
        <label class="search">
          <span>检索</span>
          <input id="manage-search" type="search" placeholder="按单词、释义或标签筛选">
        </label>
        <label class="search">
          <span>来源书</span>
          <select id="manage-source">${sourceFilterHtml(tagFilter)}</select>
        </label>
        <div class="manage-toolbar-actions">
          <button type="button" class="ghost" id="manage-all">全选当前列表</button>
          <button type="button" class="ghost" id="manage-none">取消全选</button>
          <span class="manage-count" id="manage-count"></span>
        </div>
      </div>
      <div class="manage-tagbar">
        <label class="search">
          <span>已有标签</span>
          <select id="manage-tag-pick">
            <option value="">选择已有标签</option>
            ${collectedTags().map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join('')}
          </select>
        </label>
        <label class="search">
          <span>或输入新标签</span>
          <input id="manage-tag" placeholder="例如：场景词、剑雅 21">
        </label>
      </div>
      <p class="help" id="manage-status"></p>
      <div class="manage-list" id="manage-list"></div>
      <div class="modal-actions">
        <button type="button" class="ghost" data-close>关闭</button>
        <button type="button" class="primary" id="manage-tag-add">确认加标签</button>
        <button type="button" class="danger" id="manage-delete">删除所选</button>
      </div>
    </div>
  `);
  paintList();
  ui.overlay.querySelector('#manage-search').addEventListener('input', (event) => {
    query = event.target.value;
    paintList();
  });
  ui.overlay.querySelector('#manage-source').addEventListener('change', (event) => {
    tagFilter = event.target.value;
    paintList();
  });
  ui.overlay.querySelector('#manage-list').addEventListener('change', (event) => {
    const box = event.target.closest('input[data-id]');
    if (!box) return;
    if (box.checked) selected.add(box.dataset.id);
    else selected.delete(box.dataset.id);
    updateCount();
  });
  ui.overlay.querySelector('#manage-all').addEventListener('click', () => {
    visibleWords().forEach(word => selected.add(word.id));
    paintList();
  });
  ui.overlay.querySelector('#manage-none').addEventListener('click', () => {
    selected.clear();
    paintList();
  });
  function chosenTag() {
    const typed = (ui.overlay.querySelector('#manage-tag').value || '').trim();
    const picked = (ui.overlay.querySelector('#manage-tag-pick').value || '').trim();
    return typed || picked;
  }
  async function applyTags() {
    const ids = Array.from(selected);
    const tag = chosenTag();
    if (!ids.length) {
      setStatus('请先勾选要加标签的词条。');
      return;
    }
    if (!tag) {
      setStatus('请选择已有标签，或在右侧输入新标签，再点确认。');
      return;
    }
    const updated = await tagSelectedWords(state.bookId, ids, tag);
    await reload();
    all = currentWords().slice().sort((a, b) => String(a.text || '').localeCompare(String(b.text || ''), 'en', { sensitivity: 'base' }));
    const source = ui.overlay.querySelector('#manage-source');
    if (source) {
      source.innerHTML = sourceFilterHtml(tagFilter);
      source.value = tagFilter;
    }
    paintList();
    setStatus(`已给 ${updated} 个词加上「${tag}」。`);
  }
  ui.overlay.querySelector('#manage-tag-add').addEventListener('click', applyTags);
  ui.overlay.querySelector('#manage-tag').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyTags();
    }
  });
  ui.overlay.querySelector('#manage-delete').addEventListener('click', async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(`从「${meta.name}」中删除 ${ids.length} 个词条？`)) return;
    await deleteSelectedWords(state.bookId, ids);
    closeOverlay();
    await reload();
  });
  ui.overlay.querySelector('#manage-search').focus();
}

function scanHelpText(mode, colorName) {
  if (mode === 'all') {
    return '将识别图片里的英文单词和短语，例如 in advance、have to、as well as。逗号或中文分隔的会拆成多条，the / of 等单独虚词会过滤。适合整页词汇表。';
  }
  return `当前识别<strong>${colorName}</strong>涂出的单词和短语，不会把红色印刷字当成标记。短语会整段收录，逗号分隔的会拆成多条。请用荧光笔涂在词或短语上。`;
}

function normalizeDictation(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/-/g, ' ')
    .replace(/[^a-z']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function openScan() {
  const color = ((state.data.settings || {}).highlightColor) || 'auto';
  const colorName = COLOR_LABELS[color] || COLOR_LABELS.auto;
  let scanMode = ((state.data.settings || {}).scanMode) === 'all' ? 'all' : 'highlight';
  openOverlay(`
    <div class="modal wide">
      <h2>扫描加入</h2>
      <div class="scan-mode" role="radiogroup" aria-label="扫描范围">
        <label>
          <input type="radio" name="scan-mode" value="all" ${scanMode === 'all' ? 'checked' : ''}>
          <span><b>扫描所有词条</b><small>整页单词和短语都收进来</small></span>
        </label>
        <label>
          <input type="radio" name="scan-mode" value="highlight" ${scanMode === 'highlight' ? 'checked' : ''}>
          <span><b>只扫描带高光的</b><small>荧光笔涂出的词和短语</small></span>
        </label>
      </div>
      <p class="help scan-alert" id="scan-help">${scanHelpText(scanMode, colorName)}</p>
      <label class="field"><span>这批词来自哪本书（标签）</span>
        <input id="scan-tag" list="tag-list" placeholder="例如：剑雅 17">
        <datalist id="tag-list">${collectedTags().map(tag => `<option value="${escapeHtml(tag)}">`).join('')}</datalist>
      </label>
      <input id="scan-file" type="file" accept="image/*">
      <img id="scan-preview" class="scan-preview" alt="" hidden>
      <p class="help" id="scan-status"></p>
      <div id="scan-candidates" class="candidates"></div>
      <div class="modal-actions">
        <button type="button" class="ghost" data-close>取消</button>
        <button type="button" class="primary" id="scan-add" disabled>加入本册</button>
      </div>
    </div>
  `);

  const status = ui.overlay.querySelector('#scan-status');
  const help = ui.overlay.querySelector('#scan-help');
  const preview = ui.overlay.querySelector('#scan-preview');
  const box = ui.overlay.querySelector('#scan-candidates');
  const addBtn = ui.overlay.querySelector('#scan-add');
  let pending = [];
  let lastFile = null;
  let runId = 0;

  async function rememberMode(next) {
    scanMode = next;
    help.innerHTML = scanHelpText(scanMode, colorName);
    if (!state.data.settings) state.data.settings = {};
    state.data.settings.scanMode = scanMode;
    try { await api.updateSettings({ scanMode }); } catch (_) { /* preview */ }
  }

  async function recognize(file) {
    if (!file) return;
    lastFile = file;
    const id = ++runId;
    status.textContent = scanMode === 'all' ? '正在识别整页单词和短语…' : '正在寻找荧光笔区域…';
    addBtn.disabled = true;
    box.innerHTML = '';
    try {
      const img = await window.HighlightScan.loadImageFile(file);
      const prepared = window.HighlightScan.prepareImage(img, { color, mode: scanMode });
      if (id !== runId) return;
      preview.src = prepared.previewUrl;
      preview.hidden = false;
      if (scanMode === 'highlight' && !prepared.boxCount) {
        status.textContent = `没有找到${colorName}涂色。请确认用的是荧光笔而不是红色印刷字；也可在设置里换黄/绿/粉。`;
        return;
      }
      status.textContent = scanMode === 'all'
        ? '正在识别整页英文单词和短语…'
        : `找到 ${prepared.boxCount} 处${colorName}区域，正在识别单词…`;
      const result = await api.recognizeImage({
        dataUrl: prepared.dataUrl,
        regionDataUrls: prepared.regionDataUrls,
        mode: scanMode,
      });
      if (id !== runId) return;
      pending = result.words || [];
      if (!pending.length) {
        status.textContent = scanMode === 'all'
          ? '没有识别出完整英文词或短语。请拍清楚一些，或换「只扫描带高光的」。'
          : '涂色区域里没有识别出完整英文词。请拍清楚一些，并确保荧光笔盖在单词上。';
        return;
      }
      const existingKeys = bookWordKeys(state.bookId);
      let existingCount = 0;
      box.innerHTML = pending.map((item, index) => {
        const exists = existingKeys.has(String(item.text || '').trim().toLowerCase());
        if (exists) existingCount += 1;
        const checked = (/\s/.test(item.text) || item.text.length >= 3) ? 'checked' : '';
        return `<label class="chip${exists ? ' existing' : ''}"><input type="checkbox" data-i="${index}" ${checked}> ${escapeHtml(item.text)}${exists ? '<small>已有，可加标签</small>' : ''}</label>`;
      }).join('');
      const freshCount = pending.length - existingCount;
      const skipNote = existingCount ? `，其中 ${existingCount} 个已在本册，填了标签就会加到原词上` : '';
      status.textContent = scanMode === 'all'
        ? `整页识别到 ${pending.length} 个词条${skipNote}。请确认后加入。`
        : `从${colorName}中识别到 ${pending.length} 个单词${skipNote}。请确认后加入。`;
      addBtn.disabled = false;
      if (!freshCount && !((ui.overlay.querySelector('#scan-tag').value || '').trim())) {
        status.textContent = `识别到的 ${pending.length} 个词条都已在本册。填上标签后，可以把这个标签加到原词上。`;
      }
    } catch (err) {
      if (id !== runId) return;
      status.textContent = err.message || '识别失败';
    }
  }

  ui.overlay.querySelectorAll('input[name="scan-mode"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      rememberMode(input.value);
      if (lastFile) recognize(lastFile);
    });
  });
  ui.overlay.querySelector('#scan-file').addEventListener('change', (event) => recognize(event.target.files[0]));
  ui.overlay.addEventListener('dragover', (event) => event.preventDefault());
  ui.overlay.addEventListener('drop', (event) => {
    event.preventDefault();
    recognize(event.dataTransfer.files[0]);
  });
  scanPasteHandler = (event) => {
    const file = [...(event.clipboardData && event.clipboardData.items || [])]
      .map(item => item.kind === 'file' ? item.getAsFile() : null)
      .find(Boolean);
    if (file) recognize(file);
  };
  addBtn.addEventListener('click', async () => {
    const existingKeys = bookWordKeys(state.bookId);
    const selected = [...box.querySelectorAll('input:checked')]
      .map(input => pending[Number(input.dataset.i)])
      .filter(Boolean);
    if (!selected.length) {
      status.textContent = '请先勾选要加入的词。';
      return;
    }
    const tag = (ui.overlay.querySelector('#scan-tag').value || '').trim();
    const fresh = selected.filter(item => !existingKeys.has(String(item.text || '').trim().toLowerCase()));
    const already = selected.filter(item => existingKeys.has(String(item.text || '').trim().toLowerCase()));
    if (!fresh.length && !tag) {
      status.textContent = '这些词已在本册。填上标签后，可以把这个标签加到原词上。';
      return;
    }
    addBtn.disabled = true;
    let filled = [];
    if (fresh.length) {
      status.textContent = `正在查词 0 / ${fresh.length}…`;
      let done = 0;
      filled = await mapLimit(fresh, 4, async (item) => {
        const extra = await lookupWord(item.text);
        done += 1;
        status.textContent = `正在查词 ${done} / ${fresh.length}…`;
        return Object.assign({ source: item.source || 'ocr', tags: tag ? [tag] : [] }, extra, { text: item.text });
      });
    }
    const tagged = tag ? already.map(item => ({ text: item.text, source: item.source || 'ocr', tags: [tag] })) : [];
    const result = await api.addWords(state.bookId, filled.concat(tagged));
    closeOverlay();
    await reload();
    const added = (result && result.added && result.added.length) || 0;
    const parts = [];
    if (added) parts.push(`新增 ${added} 个词条`);
    if (tag && already.length) parts.push(`已给 ${already.length} 个已有词加上「${tag}」`);
    if (!tag && already.length) parts.push(`${already.length} 个已在本册，没有重复添加`);
    if (parts.length) {
      openOverlay(`<div class="modal"><h2>已加入本册</h2><p class="help">${parts.join('，')}。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
    }
  });
}

function collectReviewQueue(oneBook) {
  const ids = oneBook ? [state.bookId] : BOOKS.map(item => item.id);
  const queue = [];
  ids.forEach((bookId) => {
    ((((state.data.books || {})[bookId] || {}).words) || []).forEach((word) => {
      if (oneBook && !matchesSourceFilter(word)) return;
      if (isDue(word)) queue.push({ bookId, word });
    });
  });
  queue.sort((a, b) => compareReviewItems(a, b));
  return queue;
}

function openWritingSpellReview(queue, spellMode) {
  const scopeNote = state.tagFilter ? ` · ${escapeHtml(sourceLabel())}` : '';
  let index = 0;
  let phase = spellMode ? 'ask' : 'recall';
  let typed = '';
  let correct = false;
  let afterShow = 'retry';
  let misses = 0;
  let loadToken = 0;
  let spellSave = Promise.resolve();
  let enterArmsOnKeyup = false;
  const showSeconds = 5;

  function bindEnter(action, fromEnter) {
    clearWritingShowTimer();
    let ready = !fromEnter;
    if (fromEnter) {
      writingShowKeyUp = (event) => {
        if (event.key !== 'Enter') return;
        ready = true;
        document.removeEventListener('keyup', writingShowKeyUp);
        writingShowKeyUp = null;
      };
      document.addEventListener('keyup', writingShowKeyUp);
    }
    writingShowKey = (event) => {
      if (event.key !== 'Enter' || event.repeat || !ready) return;
      event.preventDefault();
      action();
    };
    document.addEventListener('keydown', writingShowKey);
  }

  function bindJudgeKeys(onKnow, onUnfamiliar, fromEnter) {
    clearWritingShowTimer();
    let ready = !fromEnter;
    if (fromEnter) {
      writingShowKeyUp = (event) => {
        if (event.key !== 'Enter') return;
        ready = true;
        document.removeEventListener('keyup', writingShowKeyUp);
        writingShowKeyUp = null;
      };
      document.addEventListener('keyup', writingShowKeyUp);
    }
    writingShowKey = (event) => {
      if (event.repeat) return;
      if (event.key === 'CapsLock' || event.code === 'CapsLock') {
        event.preventDefault();
        onUnfamiliar();
        return;
      }
      if (event.key !== 'Enter' || !ready) return;
      event.preventDefault();
      onKnow();
    };
    document.addEventListener('keydown', writingShowKey);
  }

  function commit(item, outcome) {
    const next = applySpellOutcome(item.word, outcome);
    item.word.review = next.review;
    item.word.updatedAt = next.updatedAt;
    const review = Object.assign({}, next.review);
    spellSave = spellSave
      .catch(() => {})
      .then(() => api.updateWord(item.bookId, item.word.id, { review }))
      .then(() => reload())
      .catch(() => {});
  }

  async function fillSpellExamples(word, sense, token) {
    const box = ui.overlay.querySelector('#spell-examples');
    if (!box) return;
    box.textContent = '正在找可参考的例句…';
    const matches = await examplesForSense(word, sense || '');
    if (token !== loadToken) return;
    const current = ui.overlay.querySelector('#spell-examples');
    if (!current) return;
    if (!matches.length) {
      current.textContent = '这条释义暂时没有例句，可以按中文意思来拼。';
      return;
    }
    current.innerHTML = exampleBlocksHtml(matches, word.text);
  }

  function goNext() {
    clearWritingShowTimer();
    if (index >= queue.length - 1) {
      phase = 'done';
      openOverlay(`<div class="modal"><h2>写作复习完成</h2><p class="help">进度环满的词之后不会再出现。不熟的词会排在明天复习的最前面。</p><div class="modal-actions"><button type="button" class="primary" data-close>好</button></div></div>`);
      return;
    }
    index += 1;
    phase = spellMode ? 'ask' : 'recall';
    typed = '';
    correct = false;
    misses = 0;
    paint();
  }

  function parkUnfamiliar(item) {
    commit(item, 'unfamiliar');
    queue.splice(index, 1);
    queue.push(item);
    if (!queue.length) {
      goNext();
      return;
    }
    if (index >= queue.length) index = 0;
    enterArmsOnKeyup = false;
    phase = spellMode ? 'ask' : 'recall';
    typed = '';
    correct = false;
    misses = 0;
    paint();
  }

  function finishShow() {
    if (phase !== 'show') return;
    clearWritingShowTimer();
    phase = 'ask';
    typed = '';
    correct = false;
    if (afterShow === 'next') {
      goNext();
      return;
    }
    paint();
  }

  function beginShow(nextAction, fromEnter) {
    afterShow = nextAction;
    phase = 'show';
    let left = showSeconds;
    let skipReady = !fromEnter;
    paint();
    speak(queue[index].word.text);
    clearWritingShowTimer();
    if (fromEnter) {
      writingShowKeyUp = (event) => {
        if (event.key !== 'Enter') return;
        skipReady = true;
        document.removeEventListener('keyup', writingShowKeyUp);
        writingShowKeyUp = null;
      };
      document.addEventListener('keyup', writingShowKeyUp);
    }
    writingShowKey = (event) => {
      if (event.key !== 'Enter' || event.repeat || !skipReady) return;
      event.preventDefault();
      finishShow();
    };
    document.addEventListener('keydown', writingShowKey);
    writingShowTimer = setInterval(() => {
      left -= 1;
      const count = ui.overlay.querySelector('#sp-count');
      if (count) count.textContent = String(Math.max(left, 0));
      if (left > 0) return;
      finishShow();
    }, 1000);
  }

  function paint() {
    const item = queue[index];
    if (!item) {
      phase = 'done';
      openOverlay(`<div class="modal"><h2>写作复习完成</h2><p class="help">进度环满的词之后不会再出现。不熟的词会排在明天复习的最前面。</p><div class="modal-actions"><button type="button" class="primary" data-close>好</button></div></div>`);
      return;
    }
    const senses = senseList(item.word);
    if (!spellMode && phase === 'recall') {
      const recallMeanings = senses.length
        ? senses.map(sense => `<p class="meaning ${sense.label === '雅思常考' ? 'ielts' : 'other'}"><span class="sense-label">${escapeHtml(sense.label)}</span>${escapeHtml(maskHeadword(sense.text, item.word.text))}</p>`).join('')
        : '<p class="meaning">还没有释义，复习时可以补上。</p>';
      openOverlay(`
        <div class="modal">
          <div class="review-card writing-spell">
            <p class="progress">写作${scopeNote} · 看词判断 · ${index + 1} / ${queue.length}</p>
            ${recallMeanings}
            <p class="help">按回车看单词</p>
            <div class="modal-actions" style="justify-content:center">
              <button type="button" class="ghost" data-close>结束</button>
            </div>
          </div>
        </div>
      `);
      bindEnter(() => {
        if (phase !== 'recall') return;
        enterArmsOnKeyup = true;
        phase = 'judge';
        paint();
      }, enterArmsOnKeyup);
      enterArmsOnKeyup = false;
      return;
    }
    if (!spellMode && phase === 'judge') {
      const fromEnter = enterArmsOnKeyup;
      enterArmsOnKeyup = false;
      const markKnown = (openedByEnter) => {
        if (phase !== 'judge') return;
        const before = spellProgressOf(item.word);
        commit(item, 'hit');
        enterArmsOnKeyup = Boolean(openedByEnter);
        if (spellProgressOf(item.word) <= before) {
          goNext();
          return;
        }
        phase = 'gain';
        paint();
      };
      openOverlay(`
        <div class="modal">
          <div class="review-card writing-spell">
            <p class="progress">写作${scopeNote} · 看词判断 · ${index + 1} / ${queue.length}</p>
            <div class="review-word">${escapeHtml(item.word.text)}</div>
            <div class="phonetic-line"><span class="phonetic">${escapeHtml(item.word.phonetic)}</span>${playButton('sp-speak', '发音')}</div>
            ${meaningHtml(item.word)}
            <div class="modal-actions" style="justify-content:center">
              <button type="button" class="ghost" data-close>结束</button>
            </div>
            <div class="review-dock review-rates">
              <button type="button" class="primary" id="sp-know">认识</button>
              <button type="button" class="secondary" id="sp-unsure">不熟</button>
            </div>
          </div>
        </div>
      `);
      ui.overlay.querySelector('#sp-know').addEventListener('click', () => markKnown(false));
      ui.overlay.querySelector('#sp-unsure').addEventListener('click', () => parkUnfamiliar(item));
      ui.overlay.querySelector('#sp-speak').addEventListener('click', () => speak(item.word.text));
      bindJudgeKeys(() => markKnown(true), () => {
        if (phase !== 'judge') return;
        parkUnfamiliar(item);
      }, fromEnter);
      speak(item.word.text);
      return;
    }
    if (!spellMode && phase === 'gain') {
      const full = spellProgressOf(item.word) >= 6;
      openOverlay(`
        <div class="modal">
          <div class="review-card writing-spell">
            <p class="progress">写作${scopeNote} · 看词判断 · ${index + 1} / ${queue.length}</p>
            ${spellRingHtml(item.word)}
            <p class="dictation-result ok">${full ? '进度已满，之后不再复习' : '进度增加了'}</p>
            <div class="review-word">${escapeHtml(item.word.text)}</div>
            <p class="help">按回车继续</p>
            <div class="modal-actions" style="justify-content:center">
              <button type="button" class="ghost" data-close>结束</button>
            </div>
            <div class="review-dock word-nav">
              <button type="button" class="primary" id="sp-continue">继续</button>
            </div>
          </div>
        </div>
      `);
      const leave = (fromEnter) => {
        if (phase !== 'gain') return;
        enterArmsOnKeyup = Boolean(fromEnter);
        goNext();
      };
      ui.overlay.querySelector('#sp-continue').addEventListener('click', () => leave(false));
      bindEnter(() => leave(true), enterArmsOnKeyup);
      enterArmsOnKeyup = false;
      return;
    }
    if (phase === 'show') {
      const again = afterShow !== 'next';
      const full = spellProgressOf(item.word) >= 6;
      openOverlay(`
        <div class="modal">
          <div class="review-card writing-spell">
            <p class="progress">写作${scopeNote} · 看释义拼写 · ${index + 1} / ${queue.length}</p>
            ${spellRingHtml(item.word)}
            <p class="dictation-result ${correct ? 'ok' : 'bad'}">${correct ? '拼写正确' : '先看这个词'}</p>
            ${typed && !correct ? `<p class="dictation-typed">你写的是 ${escapeHtml(typed)}</p>` : ''}
            <div class="review-word">${escapeHtml(item.word.text)}</div>
            <div class="phonetic-line"><span class="phonetic">${escapeHtml(item.word.phonetic)}</span>${playButton('sp-speak', '发音')}</div>
            ${meaningHtml(item.word)}
            <p class="help">${full ? '进度已满，之后不再复习。' : ''}<b id="sp-count">${showSeconds}</b> 秒后${again ? '继续拼这个词' : '进入下一词'}，按回车可跳过</p>
            <div class="modal-actions" style="justify-content:center">
              <button type="button" class="ghost" data-close>结束</button>
            </div>
          </div>
        </div>
      `);
      ui.overlay.querySelector('#sp-speak').addEventListener('click', () => speak(item.word.text));
      return;
    }

    const token = loadToken + 1;
    loadToken = token;
    openOverlay(`
      <div class="modal">
        <div class="review-card writing-spell">
          <p class="progress">写作${scopeNote} · 看释义拼写 · ${index + 1} / ${queue.length}</p>
          ${senses.length ? senses.map((sense, senseIndex) => `<p class="meaning ${sense.label === '雅思常考' ? 'ielts' : 'other'}${senses.length > 1 && senseIndex === 0 ? ' active' : ''}" data-sense="${escapeHtml(sense.text)}"><span class="sense-label">${escapeHtml(sense.label)}</span>${escapeHtml(sense.text)}</p>`).join('') : '<p class="meaning">还没有释义，复习时可以补上。</p>'}
          <div id="spell-examples" class="example-out">正在找可参考的例句…</div>
          <input id="sp-input" class="dictation-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="拼写这个词">
          <div class="modal-actions" style="justify-content:center">
            <button type="button" class="ghost" data-close>结束</button>
          </div>
          <div class="review-dock word-nav">
            <button type="button" class="secondary" id="sp-prev" ${index === 0 ? 'disabled' : ''}>＜ 上一词</button>
            <button type="button" class="primary" id="sp-submit">提交</button>
          </div>
        </div>
      </div>
    `);
    const input = ui.overlay.querySelector('#sp-input');
    input.focus();
    const reveal = (value, fromEnter) => {
      typed = String(value || '').trim();
      correct = Boolean(typed) && normalizeDictation(typed) === normalizeDictation(item.word.text);
      if (correct) {
        commit(item, misses ? 'fail' : 'hit');
        beginShow('next', fromEnter);
        return;
      }
      misses += 1;
      commit(item, 'miss');
      beginShow('retry', fromEnter);
    };
    ui.overlay.querySelector('#sp-prev').addEventListener('click', () => {
      if (index === 0) return;
      clearWritingShowTimer();
      index -= 1;
      phase = 'ask';
      typed = '';
      correct = false;
      misses = 0;
      paint();
    });
    ui.overlay.querySelector('#sp-submit').addEventListener('click', () => reveal(input.value, false));
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      reveal(input.value, true);
    });
    ui.overlay.querySelectorAll('.meaning[data-sense]').forEach((line) => {
      if (senses.length < 2) return;
      line.classList.add('sense-line');
      line.addEventListener('click', () => {
        ui.overlay.querySelectorAll('.meaning[data-sense]').forEach(el => el.classList.toggle('active', el === line));
        const next = loadToken + 1;
        loadToken = next;
        fillSpellExamples(item.word, line.dataset.sense, next);
      });
    });
    fillSpellExamples(item.word, (senses[0] && senses[0].text) || '', token);
  }
  paint();
}

function collectWritingQueue() {
  const ts = Date.now();
  const today = localDay(ts);
  const words = ((((state.data || {}).books || {}).writing || {}).words) || [];
  const queue = [];
  words.forEach((word) => {
    if (!matchesSourceFilter(word)) return;
    if (spellProgressOf(word) >= 6) return;
    const frontOn = String((word.review || {}).frontOn || '');
    const dueAt = Date.parse((word.review || {}).dueAt);
    const due = !Number.isFinite(dueAt) || dueAt <= ts;
    if (frontOn === today || due) queue.push({ bookId: 'writing', word });
  });
  queue.sort((a, b) => {
    const rank = writingReviewRank(a.word, ts) - writingReviewRank(b.word, ts);
    if (rank) return rank;
    return compareReviewItems(a, b, ts);
  });
  return queue;
}

function openWritingReview() {
  const words = (((((state.data || {}).books || {}).writing || {}).words) || []).filter(matchesSourceFilter);
  const queue = collectWritingQueue();
  const scope = state.tagFilter ? `「${escapeHtml(sourceLabel())}」` : '这册';
  if (!queue.length) {
    if (words.length && words.every(word => spellProgressOf(word) >= 6)) {
      openOverlay(`<div class="modal"><h2>${scope}不用再复习</h2><p class="help">这些词的进度环都满了，之后不会再出现。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
      return;
    }
    openOverlay(`<div class="modal"><h2>暂时没有到期单词</h2><p class="help">${scope}里暂时没有到复习时间的词。新词会马上进入复习。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
    return;
  }
  openOverlay(`<div class="modal"><h2>开始写作复习</h2><p class="help">拼写：看释义把单词拼出来。不拼写：先只看释义，回车后再看单词，选认识或不熟。认识并且进度增加时会出示进度环。不熟会排到这次最后，明天排在最前。</p><div class="modal-actions"><button type="button" class="primary" id="mode-spell">拼写</button><button type="button" class="secondary" id="mode-read">不拼写</button><button type="button" class="ghost" data-close>取消</button></div></div>`);
  ui.overlay.querySelector('#mode-spell').addEventListener('click', () => openWritingSpellReview(queue, true));
  ui.overlay.querySelector('#mode-read').addEventListener('click', () => openWritingSpellReview(queue, false));
}

function sidePrevButton(id, disabled) {
  return `<button type="button" class="side-prev" id="${id}" ${disabled ? 'disabled' : ''}>＜ 上一词</button>`;
}

function playButton(id, label) {
  return `<button type="button" class="play-btn" id="${id}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/></svg></button>`;
}

function openReview(oneBook) {
  const sourceNote = oneBook && state.tagFilter ? ` · ${escapeHtml(sourceLabel())}` : '';
  if (oneBook && state.bookId === 'writing') {
    openWritingReview();
    return;
  }
  const queue = collectReviewQueue(oneBook);
  if (!queue.length) {
    const where = oneBook && state.tagFilter ? `「${escapeHtml(sourceLabel())}」里暂时没有到复习时间的词。` : '';
    openOverlay(`<div class="modal"><h2>暂时没有到期单词</h2><p class="help">${where}新词会马上进入复习。认识后按遗忘曲线约 20 分钟、1 小时、9 小时、1 天、2 天、6 天再出现。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
    return;
  }
  let index = 0;
  let phase = 'ask';
  const listenFirst = oneBook && state.bookId === 'listening';

  function paint() {
    const item = queue[index];
    const meta = bookMeta(item.bookId);
    const last = index >= queue.length - 1;
    const hideWord = listenFirst && phase === 'ask';
    const playBtn = playButton('rv-speak', '发音');
    const head = hideWord
      ? `<div class="listen-line">${sidePrevButton('rv-prev', index === 0)}<p class="dictation-prompt">请听</p>${playBtn}</div>`
      : phase === 'ask'
        ? `<div class="listen-line">${sidePrevButton('rv-prev', index === 0)}<div class="review-word">${escapeHtml(item.word.text)}</div>${playBtn}</div><div class="phonetic">${escapeHtml(item.word.phonetic)}</div>`
        : `<div class="review-word">${escapeHtml(item.word.text)}</div><div class="phonetic-line"><span class="phonetic">${escapeHtml(item.word.phonetic)}</span>${playBtn}</div>`;
    openOverlay(`
      <div class="modal">
        <div class="review-card">
          <p class="progress">${meta.name}${sourceNote} · ${index + 1} / ${queue.length}</p>
          ${head}
          ${phase === 'ask' ? (hideWord ? '' : '<p class="review-meaning">先判断，再看释义</p>') : meaningHtml(item.word)}
          ${phase === 'show' ? tagHtml(item.word) : ''}
          ${phase === 'show' ? examplePickerHtml(item.word) : ''}
          <div class="modal-actions" style="justify-content:center">
            <button type="button" class="ghost" data-close>结束</button>
          </div>
          ${phase === 'ask' ? `<div class="review-dock review-rates"><button type="button" class="danger" id="rv-again">不认识</button><button type="button" class="secondary" id="rv-hard">模糊</button><button type="button" class="primary" id="rv-good">认识</button></div>` : `<div class="review-dock word-nav"><button type="button" class="secondary" id="rv-prev" ${index === 0 ? 'disabled' : ''}>＜ 上一词</button><button type="button" class="primary" id="rv-next">${last ? '完成' : '下一词 ＞'}</button></div>`}
        </div>
      </div>
    `);
    speak(item.word.text);
    ui.overlay.querySelector('#rv-speak').addEventListener('click', () => speak(item.word.text));
    ui.overlay.querySelector('#rv-prev').addEventListener('click', () => {
      if (index === 0) return;
      index -= 1;
      phase = 'ask';
      paint();
    });
    if (phase === 'show') bindExamplePanel(ui.overlay, item.word);
    const rate = async (rating) => {
      await api.reviewWord(item.bookId, item.word.id, rating);
      await reload();
      phase = 'show';
      paint();
    };
    if (phase === 'ask') {
      ui.overlay.querySelector('#rv-again').addEventListener('click', () => rate('again'));
      ui.overlay.querySelector('#rv-hard').addEventListener('click', () => rate('hard'));
      ui.overlay.querySelector('#rv-good').addEventListener('click', () => rate('good'));
    } else {
      ui.overlay.querySelector('#rv-next').addEventListener('click', () => {
        if (last) {
          openOverlay(`<div class="modal"><h2>这轮复习完成</h2><p class="help">已按遗忘曲线记下下次时间。越熟的词间隔越长，生疏或点了「不认识」的会更快再见到。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
          return;
        }
        index += 1;
        phase = 'ask';
        paint();
      });
    }
  }
  paint();
}

function openDictation() {
  let queue = collectReviewQueue(true);
  const usingDue = queue.length > 0;
  if (!queue.length) {
    queue = sourceWords().map(word => ({ bookId: state.bookId, word }));
    queue.sort((a, b) => compareReviewItems(a, b));
  }
  const sourceNote = state.tagFilter ? `${escapeHtml(sourceLabel())} · ` : '';
  if (!queue.length) {
    const where = state.tagFilter ? `「${escapeHtml(sourceLabel())}」里还没有单词。` : '先在听力册加入单词，再来听写。';
    openOverlay(`<div class="modal"><h2>还没有可听写的单词</h2><p class="help">${where}有到期词时会优先听写到期的。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
    return;
  }
  let index = 0;
  let phase = 'ask';
  let typed = '';
  let correct = false;

  function paint() {
    const item = queue[index];
    const last = index >= queue.length - 1;
    const title = usingDue ? '到期听写' : '本册听写';
    if (phase === 'ask') {
      openOverlay(`
        <div class="modal">
          <div class="review-card">
            <p class="progress">听力 · ${sourceNote}${title} · ${index + 1} / ${queue.length}</p>
            <div class="listen-line">${sidePrevButton('dt-prev', index === 0)}<p class="dictation-prompt">请听写</p>${playButton('dt-speak', '再听一遍')}</div>
            <input id="dt-input" class="dictation-input" type="text" autocomplete="off" spellcheck="false" placeholder="听到的单词或短语">
            <div class="modal-actions" style="justify-content:center">
              <button type="button" class="ghost" data-close>结束</button>
            </div>
            <div class="review-dock review-rates">
              <button type="button" class="secondary" id="dt-skip">不会</button>
              <button type="button" class="primary" id="dt-submit">提交</button>
            </div>
          </div>
        </div>
      `);
      const input = ui.overlay.querySelector('#dt-input');
      input.focus();
      speak(item.word.text);
      const reveal = (value) => {
        typed = String(value || '').trim();
        correct = Boolean(typed) && normalizeDictation(typed) === normalizeDictation(item.word.text);
        phase = 'show';
        paint();
      };
      ui.overlay.querySelector('#dt-speak').addEventListener('click', () => speak(item.word.text));
      ui.overlay.querySelector('#dt-prev').addEventListener('click', () => {
        if (index === 0) return;
        index -= 1;
        phase = 'ask';
        typed = '';
        correct = false;
        paint();
      });
      ui.overlay.querySelector('#dt-submit').addEventListener('click', () => reveal(input.value));
      ui.overlay.querySelector('#dt-skip').addEventListener('click', () => reveal(''));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          reveal(input.value);
        }
      });
      return;
    }

    openOverlay(`
      <div class="modal">
        <div class="review-card">
          <p class="progress">听力 · ${sourceNote}${title} · ${index + 1} / ${queue.length}</p>
          <p class="dictation-result ${correct ? 'ok' : 'bad'}">${correct ? '拼写正确' : (typed ? '拼写不匹配' : '先看答案，再判断')}</p>
          ${typed && !correct ? `<p class="dictation-typed">你写的是 ${escapeHtml(typed)}</p>` : ''}
          <div class="listen-line">${sidePrevButton('dt-prev', index === 0)}<div class="review-word">${escapeHtml(item.word.text)}</div>${playButton('dt-speak', '发音')}</div>
          <div class="phonetic">${escapeHtml(item.word.phonetic)}</div>
          ${meaningHtml(item.word)}
          ${tagHtml(item.word)}
          ${examplePickerHtml(item.word)}
          <div class="modal-actions" style="justify-content:center">
            <button type="button" class="ghost" data-close>结束</button>
          </div>
          <div class="review-dock review-rates">
            <button type="button" class="danger" id="rv-again">不认识</button>
            <button type="button" class="secondary" id="rv-hard">模糊</button>
            <button type="button" class="primary" id="rv-good">认识</button>
          </div>
        </div>
      </div>
    `);
    bindExamplePanel(ui.overlay, item.word);
    ui.overlay.querySelector('#dt-speak').addEventListener('click', () => speak(item.word.text));
    ui.overlay.querySelector('#dt-prev').addEventListener('click', () => {
      if (index === 0) return;
      index -= 1;
      phase = 'ask';
      typed = '';
      correct = false;
      paint();
    });
    const rate = async (rating) => {
      await api.reviewWord(item.bookId, item.word.id, rating);
      await reload();
      if (last) {
        openOverlay(`<div class="modal"><h2>听写完成</h2><p class="help">已记住进度。可以随时再打开听力册继续听写。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
        return;
      }
      index += 1;
      phase = 'ask';
      typed = '';
      correct = false;
      paint();
    };
    ui.overlay.querySelector('#rv-again').addEventListener('click', () => rate('again'));
    ui.overlay.querySelector('#rv-hard').addEventListener('click', () => rate('hard'));
    ui.overlay.querySelector('#rv-good').addEventListener('click', () => rate('good'));
  }
  paint();
}

const SPEAK_GAP_OPTIONS = [
  { ms: 500, label: '0.5 秒' },
  { ms: 1000, label: '1 秒' },
  { ms: 1500, label: '1.5 秒' },
  { ms: 2000, label: '2 秒' },
  { ms: 3000, label: '3 秒' },
  { ms: 5000, label: '5 秒' },
];

function clampSpeakGap(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return 1000;
  return Math.min(8000, Math.max(300, Math.round(n)));
}

function nearestSpeakGap(ms) {
  const value = clampSpeakGap(ms);
  return SPEAK_GAP_OPTIONS.reduce((best, item) => (
    Math.abs(item.ms - value) < Math.abs(best - value) ? item.ms : best
  ), SPEAK_GAP_OPTIONS[0].ms);
}

function speakGapOptionsHtml(selected) {
  const current = nearestSpeakGap(selected);
  return SPEAK_GAP_OPTIONS.map(item => `<option value="${item.ms}" ${item.ms === current ? 'selected' : ''}>${item.label}</option>`).join('');
}

function openPlayer() {
  const words = sourceWords().slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const label = sourceLabel();
  if (!words.length) {
    openOverlay(`<div class="modal"><h2>没有可发音的单词</h2><p class="help">当前来源「${escapeHtml(label)}」没有词条。可先改到来源书，或给单词加上对应标签。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
    return;
  }
  let index = 0;
  let paused = false;
  let playToken = 0;
  state.speaking = true;
  const settings = state.data.settings || {};
  const repeat = Math.max(1, Number(settings.ttsRepeat) || 1);
  let gap = nearestSpeakGap(settings.ttsGapMs || 1000);

  function persistGap(ms) {
    gap = nearestSpeakGap(ms);
    if (state.data && state.data.settings) state.data.settings.ttsGapMs = gap;
    api.updateSettings({ ttsGapMs: gap }).catch(() => {});
  }

  function paint() {
    const word = words[index];
    openOverlay(`
      <div class="modal">
        <div class="player-card">
          <p class="progress">全部发音 · ${escapeHtml(label)} · ${index + 1} / ${words.length}</p>
          <div class="player-word">${escapeHtml(word.text)}</div>
          <div class="phonetic-line"><span class="phonetic">${escapeHtml(word.phonetic)}</span><button type="button" class="play-btn" id="pl-pause" aria-label="${paused ? '继续' : '暂停'}" title="${paused ? '继续' : '暂停'}"><svg viewBox="0 0 24 24" aria-hidden="true">${paused ? '<path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/>' : '<path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" fill="currentColor"/>'}</svg></button></div>
          ${meaningHtml(word)}
          <label class="player-gap">
            <span>词间间隔</span>
            <select id="pl-gap">${speakGapOptionsHtml(gap)}</select>
          </label>
          <div class="modal-actions" style="justify-content:center">
            <button type="button" class="ghost" data-close>停止</button>
          </div>
          <div class="review-dock word-nav">
            <button type="button" class="secondary" id="pl-prev" ${index === 0 ? 'disabled' : ''}>＜ 上一词</button>
            <button type="button" class="primary" id="pl-next" ${index >= words.length - 1 ? 'disabled' : ''}>下一词 ＞</button>
          </div>
        </div>
      </div>
    `);
    ui.overlay.querySelector('#pl-gap').addEventListener('change', (event) => {
      persistGap(event.target.value);
    });
    ui.overlay.querySelector('#pl-prev').addEventListener('click', () => goTo(index - 1));
    ui.overlay.querySelector('#pl-next').addEventListener('click', () => goTo(index + 1));
    ui.overlay.querySelector('#pl-pause').addEventListener('click', () => {
      paused = !paused;
      playToken += 1;
      stopSpeak();
      if (paused) paint();
      else playCurrent(0);
    });
  }

  function goTo(nextIndex) {
    playToken += 1;
    stopSpeak();
    index = Math.max(0, Math.min(words.length - 1, nextIndex));
    if (paused) {
      paint();
      speak(words[index].text);
      return;
    }
    playCurrent(0);
  }

  function playCurrent(times) {
    const token = playToken;
    if (!state.speaking || paused) return;
    paint();
    speak(words[index].text, () => {
      if (token !== playToken || !state.speaking || paused) return;
      if (times + 1 < repeat) {
        setTimeout(() => {
          if (token !== playToken || paused || !state.speaking) return;
          playCurrent(times + 1);
        }, gap);
        return;
      }
      if (index + 1 >= words.length) {
        state.speaking = false;
        openOverlay(`<div class="modal"><h2>播放完成</h2><p class="help">「${escapeHtml(label)}」共 ${words.length} 个单词已经全部读完。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
        return;
      }
      index += 1;
      setTimeout(() => {
        if (token !== playToken || paused || !state.speaking) return;
        playCurrent(0);
      }, gap);
    });
  }
  playCurrent(0);
}

function readSavedWallpaper() {
  try { return localStorage.getItem('wordnest-wallpaper-v1') || ''; }
  catch (_) { return ''; }
}

function applyWallpaper(dataUrl) {
  if (dataUrl) document.documentElement.style.setProperty('--wallpaper', `url("${dataUrl}")`);
  else document.documentElement.style.removeProperty('--wallpaper');
}

function clampWallpaperBlur(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.max(0, Math.min(24, Math.round(n)));
}

function readSavedWallpaperBlur() {
  try {
    const raw = localStorage.getItem('wordnest-wallpaper-blur-v1');
    if (raw == null || raw === '') return 8;
    return clampWallpaperBlur(raw);
  } catch (_) {
    return 8;
  }
}

function applyWallpaperBlur(px) {
  document.documentElement.style.setProperty('--wallpaper-blur', `${clampWallpaperBlur(px)}px`);
}

function saveWallpaperBlur(px) {
  const blur = clampWallpaperBlur(px);
  try { localStorage.setItem('wordnest-wallpaper-blur-v1', String(blur)); } catch (_) { /* ignore */ }
  applyWallpaperBlur(blur);
  return blur;
}

function saveWallpaper(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem('wordnest-wallpaper-v1', dataUrl);
    else localStorage.removeItem('wordnest-wallpaper-v1');
  } catch (err) {
    throw new Error(err && err.name === 'QuotaExceededError' ? '这张图太大，浏览器存不下，请换一张更小的照片。' : (err.message || '壁纸保存失败'));
  }
  applyWallpaper(dataUrl || '');
}

function fileToWallpaper(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxEdge = 1600;
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      let quality = 0.82;
      let out = canvas.toDataURL('image/jpeg', quality);
      while (out.length > 1400000 && quality > 0.48) {
        quality -= 0.12;
        out = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('这张图读不出来，请换 jpg 或 png。'));
    };
    img.src = url;
  });
}

async function openSettings() {
  const info = await api.getDataInfo();
  const s = state.data.settings;
  openOverlay(`
    <div class="modal">
      <h2>设置与备份</h2>
      <p class="help">单词存在用户目录，不在软件安装包里。以后更新功能、重装或替换 App，都不会清空已有单词和复习记录。</p>
      <label class="field"><span>复习提醒</span>
        <select id="s-on"><option value="1">开启，每隔 1–2 小时</option><option value="0">关闭</option></select>
      </label>
      <label class="field"><span>提醒间隔（分钟）</span>
        <input id="s-min" type="number" min="60" max="120" value="${escapeHtml(s.reminderMinutes)}">
      </label>
      <label class="field"><span>发音语音</span>
        <select id="s-voice">${ttsVoiceOptionsHtml(s.ttsVoiceURI || '')}</select>
      </label>
      <div class="modal-actions" style="justify-content:flex-start;margin-top:8px">
        <button type="button" class="ghost" id="s-voice-try">试听这个声音</button>
      </div>
      <p class="help">默认用有道词典的单词录音（美式 / 英式）。没网或有道失败时，会改用系统语音。系统语音仍受 Safari 限制，手机里下载的增强语音网页用不到。</p>
      <label class="field"><span>发音语速</span>
        <input id="s-rate" type="number" min="0.6" max="1.2" step="0.02" value="${escapeHtml(s.ttsRate)}">
      </label>
      <label class="field"><span>全部发音时每个单词重复次数</span>
        <input id="s-rep" type="number" min="1" max="3" value="${escapeHtml(s.ttsRepeat)}">
      </label>
      <label class="field"><span>全部发音时词与词的间隔</span>
        <select id="s-gap">${speakGapOptionsHtml(s.ttsGapMs || 1000)}</select>
      </label>
      <label class="field"><span>扫描标记颜色</span>
        <select id="s-color">
          <option value="auto">自动（橙 / 黄 / 绿，忽略红字）</option>
          <option value="orange">只用橙色</option>
          <option value="yellow">只用黄色</option>
          <option value="green">只用绿色</option>
          <option value="pink">只用粉色</option>
        </select>
      </label>
      <p class="help">请用荧光笔涂在单词上。红色印刷字不会被当成标记。若橙色识别不准，可改成黄 / 绿 / 粉，改完后请用新颜色涂词。</p>
      <label class="field"><span>雅思考试日期和时间</span>
        <input id="s-exam" type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(s.ieltsExamAt))}">
      </label>
      <p class="help">会显示在左侧四册下面。也可以直接点左侧倒计时卡片修改或清除。</p>
      <label class="field"><span>登录 macOS 时自动打开词栖</span>
        <select id="s-launch"><option value="0">否</option><option value="1">是</option></select>
      </label>
      <h3 class="settings-sub">网页壁纸</h3>
      <p class="help">从相册选一张图作为背景。只存在这台设备的浏览器里，不会上传到云端。</p>
      <label class="field"><span>选择图片</span>
        <input id="s-wallpaper" type="file" accept="image/*">
      </label>
      <div class="wallpaper-preview" id="s-wallpaper-preview" aria-hidden="true"></div>
      <label class="field"><span>模糊程度：<b id="s-wallpaper-blur-val">8</b></span>
        <input id="s-wallpaper-blur" type="range" min="0" max="24" step="1" value="8">
      </label>
      <p class="help">0 为完全清晰，数字越大越糊。默认 8，和原来差不多。</p>
      <div class="modal-actions" style="justify-content:flex-start;margin-top:8px">
        <button type="button" class="ghost" id="s-wallpaper-reset">恢复默认壁纸</button>
      </div>
      <p class="help" id="s-wallpaper-status"></p>
      <h3 class="settings-sub">手机 / 电脑覆盖同步</h3>
      <p class="help">用一份<strong>私有</strong> GitHub Gist 存单词 JSON。下载会用云端覆盖本机；上传会用本机覆盖云端。Token 只存在本机，不会上传。手机打开网页后也在这里填同一组 Gist 和 Token。</p>
      <label class="field"><span>私有 Gist ID 或链接</span>
        <input id="s-cloud-gist" value="${escapeHtml(s.cloudGistId || '')}" placeholder="https://gist.github.com/用户名/一串字母数字">
      </label>
      <label class="field"><span>GitHub Token（gist 权限）</span>
        <input id="s-cloud-token" type="password" autocomplete="off" placeholder="${s.cloudToken ? '已保存，留空则不修改' : 'ghp_ 开头的令牌'}">
      </label>
      <div class="modal-actions" style="justify-content:flex-start">
        <button type="button" class="secondary" id="s-cloud-down">下载覆盖本地</button>
        <button type="button" class="secondary" id="s-cloud-up">上传覆盖云端</button>
      </div>
      <p class="help" id="s-cloud-status"></p>
      <p class="help">数据文件</p>
      <div class="settings-path">${escapeHtml(info.filePath)}</div>
      <div class="modal-actions">
        <button type="button" class="ghost" data-close>关闭</button>
        <button type="button" class="secondary" id="s-folder">打开数据目录</button>
        <button type="button" class="secondary" id="s-export">导出备份</button>
        <button type="button" class="secondary" id="s-import">合并导入</button>
        <button type="button" class="primary" id="s-save">保存设置</button>
      </div>
    </div>
  `);
  ui.overlay.querySelector('#s-on').value = s.reminderEnabled ? '1' : '0';
  ui.overlay.querySelector('#s-launch').value = s.launchAtLogin ? '1' : '0';
  ui.overlay.querySelector('#s-color').value = s.highlightColor || 'auto';
  const voiceSelect = ui.overlay.querySelector('#s-voice');
  whenVoicesReady(() => fillVoiceSelect(voiceSelect, s.ttsVoiceURI || ''));
  voiceSelect.addEventListener('change', async () => {
    const uri = voiceSelect.value || '';
    if (state.data && state.data.settings) state.data.settings.ttsVoiceURI = uri;
    await api.updateSettings({ ttsVoiceURI: uri });
  });
  ui.overlay.querySelector('#s-voice-try').addEventListener('click', () => {
    speak('example', null, voiceSelect.value || 'youdao:us');
  });
  const wallpaperStatus = ui.overlay.querySelector('#s-wallpaper-status');
  const blurInput = ui.overlay.querySelector('#s-wallpaper-blur');
  const blurLabel = ui.overlay.querySelector('#s-wallpaper-blur-val');
  const blurNow = readSavedWallpaperBlur();
  blurInput.value = String(blurNow);
  blurLabel.textContent = String(blurNow);
  const onBlurInput = () => {
    const blur = saveWallpaperBlur(blurInput.value);
    blurLabel.textContent = String(blur);
  };
  blurInput.addEventListener('input', onBlurInput);
  blurInput.addEventListener('change', onBlurInput);
  ui.overlay.querySelector('#s-wallpaper').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    wallpaperStatus.textContent = '正在处理图片…';
    try {
      const dataUrl = await fileToWallpaper(file);
      saveWallpaper(dataUrl);
      wallpaperStatus.textContent = '壁纸已换好，关掉设置就能看到。';
    } catch (err) {
      wallpaperStatus.textContent = err.message || '壁纸更换失败';
    }
    event.target.value = '';
  });
  ui.overlay.querySelector('#s-wallpaper-reset').addEventListener('click', () => {
    try {
      saveWallpaper('');
      wallpaperStatus.textContent = '已恢复默认壁纸。';
    } catch (err) {
      wallpaperStatus.textContent = err.message || '恢复失败';
    }
  });
  ui.overlay.querySelector('#s-save').addEventListener('click', async () => {
    const minutes = Math.min(120, Math.max(60, Number(ui.overlay.querySelector('#s-min').value) || 90));
    const gistId = parseGistId(ui.overlay.querySelector('#s-cloud-gist').value);
    const token = (ui.overlay.querySelector('#s-cloud-token').value || '').trim();
    const patch = {
      reminderEnabled: ui.overlay.querySelector('#s-on').value === '1',
      reminderMinutes: minutes,
      ttsRate: Number(ui.overlay.querySelector('#s-rate').value) || 0.92,
      ttsVoiceURI: ui.overlay.querySelector('#s-voice').value || '',
      ttsRepeat: Number(ui.overlay.querySelector('#s-rep').value) || 1,
      ttsGapMs: nearestSpeakGap(ui.overlay.querySelector('#s-gap').value),
      launchAtLogin: ui.overlay.querySelector('#s-launch').value === '1',
      highlightColor: ui.overlay.querySelector('#s-color').value || 'auto',
      ieltsExamAt: fromDatetimeLocalValue(ui.overlay.querySelector('#s-exam').value),
      cloudGistId: gistId,
    };
    if (token) patch.cloudToken = token;
    await api.updateSettings(patch);
    closeOverlay();
    await reload();
  });
  ui.overlay.querySelector('#s-folder').addEventListener('click', () => api.openDataFolder());
  ui.overlay.querySelector('#s-export').addEventListener('click', async () => {
    const result = await api.exportData();
    if (!result.canceled) closeOverlay();
  });
  ui.overlay.querySelector('#s-import').addEventListener('click', async () => {
    const result = await api.importData();
    if (result.canceled) return;
    await reload();
    const summary = result.summary || {};
    openOverlay(`<div class="modal"><h2>已合并导入</h2><p class="help">新增 ${summary.added || 0} 个单词，原有 ${summary.existing || 0} 个保持不动。</p><div class="modal-actions"><button class="primary" data-close>好</button></div></div>`);
  });
  const cloudStatus = ui.overlay.querySelector('#s-cloud-status');
  async function saveCloudFields() {
    const gistId = parseGistId(ui.overlay.querySelector('#s-cloud-gist').value);
    const token = (ui.overlay.querySelector('#s-cloud-token').value || '').trim();
    const patch = { cloudGistId: gistId || ((state.data.settings || {}).cloudGistId) || '' };
    if (token) patch.cloudToken = token;
    await api.updateSettings(patch);
    await reload();
  }
  ui.overlay.querySelector('#s-cloud-down').addEventListener('click', async () => {
    if (!window.confirm('用云端单词完全覆盖本机四册？本机还没上传的改动会丢失。')) return;
    cloudStatus.textContent = '正在下载…';
    try {
      await saveCloudFields();
      const result = await pullCloudOverwrite();
      cloudStatus.textContent = `已用云端覆盖本机，共 ${result.words || 0} 个词。`;
    } catch (err) {
      cloudStatus.textContent = err.message || '下载失败';
    }
  });
  ui.overlay.querySelector('#s-cloud-up').addEventListener('click', async () => {
    if (!window.confirm('用本机单词完全覆盖云端？云端还没下载的改动会丢失。')) return;
    cloudStatus.textContent = '正在上传…';
    try {
      await saveCloudFields();
      await pushCloudOverwrite();
      cloudStatus.textContent = '已用本机覆盖云端。';
    } catch (err) {
      cloudStatus.textContent = err.message || '上传失败';
    }
  });
}

function setMenuOpen(open) {
  document.body.classList.toggle('menu-open', open);
  const btn = document.getElementById('btn-menu');
  const backdrop = document.getElementById('menu-backdrop');
  if (btn) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
  }
  if (backdrop) {
    backdrop.hidden = !open;
    if (open) backdrop.removeAttribute('hidden');
    else backdrop.setAttribute('hidden', '');
  }
}

function bindChrome() {
  document.addEventListener('click', (event) => {
    const bookBtn = event.target.closest('[data-book]');
    if (bookBtn && (ui.nav.contains(bookBtn) || (ui.mobileNav && ui.mobileNav.contains(bookBtn)))) {
      state.bookId = bookBtn.dataset.book;
      setMenuOpen(false);
      render();
      const stage = document.querySelector('.stage');
      if (stage) stage.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    const closeBtn = event.target.closest('[data-close]');
    if (closeBtn) {
      closeOverlay();
      return;
    }
    const mobileAction = event.target.closest('[data-mobile-action]');
    if (mobileAction) {
      const action = mobileAction.dataset.mobileAction;
      if (action === 'add') openWordForm();
      else if (action === 'review') openReview(true);
      else if (action === 'batch') openWordForm(null, 'batch');
      else if (action === 'more') openMobileTools();
      return;
    }
    const emptyAction = event.target.closest('[data-empty-action]');
    if (emptyAction) {
      const action = emptyAction.dataset.emptyAction;
      if (action === 'add') openWordForm();
      else if (action === 'batch') openWordForm(null, 'batch');
      else if (action === 'clear') {
        state.query = '';
        state.tagFilter = '';
        ui.search.value = '';
        render();
        ui.search.focus();
      }
      return;
    }
    const mobileTool = event.target.closest('[data-mobile-tool]');
    if (mobileTool) {
      const tool = mobileTool.dataset.mobileTool;
      if (tool === 'scan') openScan();
      else if (tool === 'manage') openBatchManage();
      else if (tool === 'export') openExport();
      else if (tool === 'notebook') openNotebook();
      else if (tool === 'dictation') openDictation();
      else if (tool === 'speak') openPlayer();
      else if (tool === 'settings') openSettings();
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'btn-menu') {
      setMenuOpen(!document.body.classList.contains('menu-open'));
      return;
    }
    if (button.id === 'btn-add') openWordForm();
    else if (button.id === 'btn-scan') openScan();
    else if (button.id === 'btn-manage') openBatchManage();
    else if (button.id === 'btn-export') openExport();
    else if (button.id === 'btn-notebook') openNotebook();
    else if (button.id === 'btn-speak-all') openPlayer();
    else if (button.id === 'btn-dictation') openDictation();
    else if (button.id === 'btn-exam') { setMenuOpen(false); openExamForm(); }
    else if (button.id === 'btn-review-book') openReview(true);
    else if (button.id === 'btn-review-due') { setMenuOpen(false); openReview(false); }
    else if (button.id === 'btn-cloud-down') runCloudDownload();
    else if (button.id === 'btn-cloud-up') runCloudUpload();
    else if (button.id === 'btn-settings') { setMenuOpen(false); openSettings(); }
  });
  const backdrop = document.getElementById('menu-backdrop');
  if (backdrop) backdrop.addEventListener('click', () => setMenuOpen(false));
  ui.search.addEventListener('input', () => {
    state.query = ui.search.value;
    renderList();
  });
  const tagFilter = document.getElementById('tag-filter');
  if (tagFilter) {
    tagFilter.addEventListener('change', () => {
      state.tagFilter = tagFilter.value;
      renderList();
    });
  }
  document.addEventListener('paste', (event) => {
    if (scanPasteHandler) scanPasteHandler(event);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && ui.overlay.classList.contains('open')) {
      const focusable = [...ui.overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [contenteditable="true"], [href], [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.hidden && el.getClientRects().length);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!ui.overlay.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('modal'))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    if (event.key === 'Escape') {
      closeOverlay();
      setMenuOpen(false);
    }
    const typing = event.target && event.target.matches && event.target.matches('input, textarea, select, [contenteditable="true"]');
    if (!typing && !ui.overlay.classList.contains('open') && (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'))) {
      event.preventDefault();
      ui.search.focus();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      openWordForm();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      openReview(false);
    }
  });
  ui.overlay.addEventListener('click', (event) => {
    if (event.target === ui.overlay) closeOverlay();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOpenNotebook();
  });
  window.addEventListener('pagehide', () => { flushOpenNotebook(); });
  if (!api.desktop && ui.dataHint) {
    ui.dataHint.textContent = 'Gist 和 Token 在设置里填一次。之后电脑点「上传云端」，手机点「下载云端」。';
  }
  const scanButton = document.getElementById('btn-scan');
  if (!api.desktop && scanButton) scanButton.hidden = true;
  if (api.onStartReview) api.onStartReview(() => openReview(false));
  bindUpdateBanner();
  if (window.speechSynthesis && window.speechSynthesis.getVoices) window.speechSynthesis.getVoices();
}

function bindUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner || !api.desktop || !api.checkUpdate) return;
  const copy = document.getElementById('update-copy');
  const apply = document.getElementById('update-apply');
  const later = document.getElementById('update-later');
  let dismissed = false;
  const show = () => {
    if (dismissed) return;
    banner.hidden = false;
  };
  later.addEventListener('click', () => {
    dismissed = true;
    banner.hidden = true;
  });
  apply.addEventListener('click', async () => {
    apply.disabled = true;
    later.disabled = true;
    if (copy) copy.textContent = '正在更新，完成后会重新打开…';
    try {
      await api.applyUpdate();
    } catch (err) {
      apply.disabled = false;
      later.disabled = false;
      if (copy) copy.textContent = err.message || '更新失败，可以稍后在项目目录手动 git pull。';
    }
  });
  const ask = () => {
    api.checkUpdate().then((info) => {
      if (info && info.available) show();
    }).catch(() => {});
  };
  if (api.onUpdateAvailable) api.onUpdateAvailable(() => show());
  setTimeout(ask, 1500);
}

function boot() {
  window.__wordnestBooted = true;
  applyWallpaper(readSavedWallpaper());
  applyWallpaperBlur(readSavedWallpaperBlur());
  closeOverlay();
  render();
  bindChrome();
  startExamTicker();
  reload().catch((err) => {
    ui.list.innerHTML = `<article class="empty-card"><h2>无法读取单词本</h2><p>${escapeHtml(err.message)}</p></article>`;
  });
}

try {
  boot();
} catch (err) {
  window.__wordnestBooted = true;
  const list = document.getElementById('word-list');
  if (list) {
    list.innerHTML = `<article class="empty-card"><h2>界面启动失败</h2><p>${escapeHtml(err.message)}</p></article>`;
  }
}

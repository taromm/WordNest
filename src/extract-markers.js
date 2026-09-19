'use strict';

function uniqueKeepOrder(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const word = String(raw || '').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
    if (!isPlausibleWord(word)) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function normalizeScanItem(raw) {
  return String(raw || '')
    .replace(/[*#★☆]+/g, '')
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isKeepableScanItem(text) {
  if (!text || text.length < 2 || text.length > 80) return false;
  const words = text.split(' ');
  if (!words.every(word => /^[A-Za-z][A-Za-z'-]*$/.test(word))) return false;
  if (words.length === 1) {
    if (FRAGMENTS.test(text)) return false;
    if (STOPWORDS.has(text.toLowerCase()) && text.length <= 3) return false;
    return /[aeiouy]/i.test(text);
  }
  return words.length <= 8;
}

function uniqueScanItems(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const item = normalizeScanItem(raw);
    if (!isKeepableScanItem(item)) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extractScanItems(text) {
  const chunks = String(text || '').split(/[,，、;；]+/);
  return uniqueScanItems(chunks);
}

function splitVocabCells(line) {
  return String(line || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[（(][^)）]*[)）]/g, ' ')
    .replace(/\b(?:v|n|adj|adv|prep|conj|pron|vi|vt|phr|noun|verb)\.?\b/gi, ' ')
    .split(/[\u4e00-\u9fff]+|[,，、;；|｜]+|\s{2,}/);
}

function extractPageScanItems(text) {
  const chunks = [];
  String(text || '').split(/\n+/).forEach((line) => {
    splitVocabCells(line).forEach((cell) => {
      const run = normalizeScanItem(cell);
      if (!run) return;
      const words = run.split(' ');
      if (words.length <= 5) {
        chunks.push(run);
        return;
      }
      chunks.push(...words);
    });
  });
  const items = uniqueScanItems(chunks);
  const seen = new Set(items.map(item => item.toLowerCase()));
  extractEnglishCandidates(text).forEach((word) => {
    if (seen.has(word.toLowerCase())) return;
    seen.add(word.toLowerCase());
    items.push(word);
  });
  return items;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was',
  'one', 'our', 'out', 'day', 'had', 'has', 'have', 'his', 'how', 'its', 'may',
  'new', 'now', 'old', 'see', 'two', 'way', 'who', 'did', 'let', 'put', 'say',
  'she', 'too', 'use', 'of', 'to', 'in', 'on', 'at', 'by', 'or', 'as', 'is',
  'it', 'an', 'be', 'we', 'he', 'a', 'i', 'from', 'with', 'this', 'that',
  'into', 'over', 'also', 'than', 'then', 'them', 'they', 'been', 'were',
]);

const FRAGMENTS = /^(ize|ise|tion|sion|ing|ment|ness|able|ally|tify|alize|ulate|uate|ated|ative|ence|ance|edge|sthod|rehe|imil)$/i;

function isPlausibleWord(word) {
  const text = String(word || '').replace(/[^A-Za-z'-]/g, '');
  if (text.length < 3 || text.length > 24) return false;
  if (!/[aeiouy]/i.test(text)) return false;
  if (STOPWORDS.has(text.toLowerCase())) return false;
  if (FRAGMENTS.test(text)) return false;
  if (/^[A-Z]{2,}$/.test(text) && text.length <= 3) return false;
  return true;
}

const WORD = String.raw`[A-Za-z][A-Za-z'-]{0,46}`;

function extractMarkedWords(text) {
  const src = String(text || '');
  const found = [];
  const patterns = [
    new RegExp(String.raw`\*\*(${WORD})\*\*`, 'g'),
    new RegExp(String.raw`\*(${WORD})\*`, 'g'),
    new RegExp(String.raw`\[(${WORD})\]`, 'g'),
    new RegExp(String.raw`【(${WORD})】`, 'g'),
    new RegExp(String.raw`「(${WORD})」`, 'g'),
    new RegExp(String.raw`『(${WORD})』`, 'g'),
    new RegExp(String.raw`_(${WORD})_`, 'g'),
    new RegExp(String.raw`[★☆✦#](${WORD})`, 'g'),
    new RegExp(String.raw`<(${WORD})>`, 'g'),
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(src))) found.push({ word: match[1], index: match.index });
  }
  found.sort((a, b) => a.index - b.index);
  return uniqueKeepOrder(found.map(item => item.word));
}

function extractEnglishCandidates(text) {
  const src = String(text || '');
  const found = [];
  const re = /[A-Za-z][A-Za-z'-]{2,46}/g;
  let match;
  while ((match = re.exec(src))) found.push(match[0]);
  return uniqueKeepOrder(found);
}

function normalizeDictationAnswer(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/-/g, ' ')
    .replace(/[^a-z']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dictationMatches(expected, typed) {
  const answer = normalizeDictationAnswer(expected);
  const guess = normalizeDictationAnswer(typed);
  return Boolean(answer) && answer === guess;
}

const api = {
  extractMarkedWords,
  extractEnglishCandidates,
  extractScanItems,
  extractPageScanItems,
  uniqueKeepOrder,
  uniqueScanItems,
  isPlausibleWord,
  isKeepableScanItem,
  normalizeDictationAnswer,
  dictationMatches,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.ExtractMarkers = api;

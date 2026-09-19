'use strict';

const WORD = String.raw`[A-Za-z][A-Za-z'-]{0,46}`;

function uniqueKeepOrder(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const word = String(raw || '').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
    if (word.length < 2 || word.length > 46) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

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
  const re = /[A-Za-z][A-Za-z'-]{1,46}/g;
  let match;
  while ((match = re.exec(src))) {
    const word = match[0];
    if (/^[A-Z]{1,3}$/.test(word)) continue;
    found.push(word);
  }
  return uniqueKeepOrder(found);
}

const api = { extractMarkedWords, extractEnglishCandidates, uniqueKeepOrder };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.ExtractMarkers = api;

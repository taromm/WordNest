'use strict';

async function readJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 3500);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function splitExplain(explain) {
  const text = String(explain || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const parts = text.split(/(?=\b(?:n|v|vt|vi|adj|adv|prep|conj|num|int|pron|art|abbr)\.\s)/i)
    .map(item => cleanSense(item))
    .filter(Boolean);
  return parts.length ? parts : [cleanSense(text)].filter(Boolean);
}

function cleanSense(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\.{3,}/g, '')
    .replace(/\s*\|\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isMostlyEnglish(text) {
  const cn = (String(text).match(/[\u4e00-\u9fff]/g) || []).length;
  const en = (String(text).match(/[A-Za-z]/g) || []).length;
  return en >= 12 && cn < 2;
}

function flattenTran(row) {
  if (!row) return '';
  if (typeof row === 'string') return row;
  if (typeof row.tran === 'string') return row.tran;
  if (Array.isArray(row.tran)) return row.tran.map(flattenTran).filter(Boolean).join('；');
  const tr = row.tr || row.trs;
  if (Array.isArray(tr)) {
    return tr.map((item) => {
      if (typeof item === 'string') return item;
      const bits = (((item || {}).l || {}).i);
      if (Array.isArray(bits)) return bits.filter(bit => typeof bit === 'string' && !bit.startsWith('&')).join('');
      if (typeof bits === 'string') return bits;
      return flattenTran(item);
    }).filter(Boolean).join('；');
  }
  return '';
}

function youdaoHeadword(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  const raw = item['return-phrase'] || item.returnPhrase || item.entry || item.word || '';
  if (typeof raw === 'string') return raw;
  const bits = raw && raw.l && raw.l.i;
  if (typeof bits === 'string') return bits;
  if (Array.isArray(bits)) return bits.filter(bit => typeof bit === 'string').join('');
  return '';
}

function normalizeHeadword(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9'\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameHeadword(query, head) {
  const q = normalizeHeadword(query);
  const h = normalizeHeadword(head);
  return Boolean(q && h && q === h);
}

function fromYoudaoSuggest(data, query) {
  const entries = (((data || {}).data || {}).entries)
    || (((data || {}).result || {}).entries)
    || [];
  const wanted = String(query || '').trim();
  const match = entries.find(item => item && item.explain && sameHeadword(wanted, item.entry))
    || (!wanted ? entries.find(item => item && item.explain) : null);
  if (!match) return null;
  const groups = splitExplain(match.explain).filter(item => !isMostlyEnglish(item));
  if (!groups.length) return null;
  return {
    ieltsMeaning: groups[0] || '',
    otherMeanings: groups.slice(1).join(' ｜ '),
  };
}

function fromYoudaoJsonapi(data, query) {
  const word = (((data || {}).ec || {}).word);
  const item = Array.isArray(word) ? word[0] : word;
  if (!item) return null;
  const head = youdaoHeadword(item);
  if (query && head && !sameHeadword(query, head)) return null;
  const groups = (item.trs || []).map((row) => {
    const pos = row.pos || '';
    const tran = flattenTran(row);
    return cleanSense(`${pos} ${tran}`);
  }).filter(item => item && !isMostlyEnglish(item));

  const phone = item.usphone || item.ukphone || item.phone || '';
  return {
    phonetic: phone ? `/${String(phone).replace(/^\/|\/$/g, '')}/` : '',
    ieltsMeaning: groups[0] || '',
    otherMeanings: groups.slice(1).join(' ｜ '),
  };
}

function extractExamples(data, dict) {
  const out = [];
  const pairs = (((data || {}).blng_sents_part) || {})['sentence-pair'] || [];
  pairs.forEach((row) => {
    const sentence = cleanSense(row.sentence || row['sentence-eng'] || '');
    const translation = cleanSense(row['sentence-translation'] || row.translation || '');
    if (sentence) out.push({ sentence, translation });
  });
  const entry = Array.isArray(dict) ? dict[0] : null;
  (entry && entry.meanings || []).forEach((meaning) => {
    (meaning.definitions || []).forEach((def) => {
      if (def.example) {
        out.push({
          sentence: def.example,
          translation: '',
          sense: `${meaning.partOfSpeech || ''}. ${def.definition}`.trim(),
        });
      }
    });
  });
  const seen = new Set();
  return out.filter((item) => {
    const key = item.sentence.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function pickExample(examples, sense) {
  const list = examples || [];
  if (!list.length) return null;
  const hint = String(sense || '').replace(/[^\u4e00-\u9fffA-Za-z]/g, '');
  if (hint) {
    const matched = list.find(item => `${item.sentence} ${item.translation} ${item.sense || ''}`.includes(hint.slice(0, 4))
      || (item.sense && sense && item.sense.toLowerCase().includes(String(sense).slice(0, 8).toLowerCase())));
    if (matched) return matched;
  }
  return list.find(item => item.translation) || list[0];
}

const lookupCache = new Map();

function emptyLookup() {
  return {
    phonetic: '',
    ieltsMeaning: '',
    otherMeanings: '',
    meaning: '',
    example: '',
    examples: [],
  };
}

function rememberLookup(key, result) {
  lookupCache.set(key, result);
  if (lookupCache.size > 300) lookupCache.delete(lookupCache.keys().next().value);
}

async function lookupWord(word) {
  const text = String(word || '').trim();
  const result = emptyLookup();
  if (!text) return result;
  const cacheKey = text.toLowerCase();
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);

  let youdao = null;
  let matchedYoudao = false;
  try {
    youdao = await readJson(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(text)}`);
    const parsed = fromYoudaoJsonapi(youdao, text);
    if (parsed) {
      matchedYoudao = true;
      result.phonetic = parsed.phonetic || '';
      result.ieltsMeaning = parsed.ieltsMeaning || '';
      result.otherMeanings = parsed.otherMeanings || '';
    }
  } catch (_) { /* continue */ }

  if (!result.ieltsMeaning) {
    try {
      const suggest = await readJson(`https://dict.youdao.com/suggest?num=8&ver=2.0&doctype=json&le=en&q=${encodeURIComponent(text)}`);
      const parsed = fromYoudaoSuggest(suggest, text);
      if (parsed) Object.assign(result, parsed);
    } catch (_) { /* continue */ }
  }

  result.examples = matchedYoudao ? extractExamples(youdao, null) : [];

  if (!result.ieltsMeaning) {
    try {
      const dict = await readJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`);
      const phonetic = (Array.isArray(dict) && dict[0] && (dict[0].phonetic || ((dict[0].phonetics || []).map(item => item.text).find(Boolean)))) || '';
      if (phonetic && !result.phonetic) result.phonetic = phonetic;
      result.examples = extractExamples(null, dict);
    } catch (_) { /* offline is fine */ }
  }

  if (result.examples[0]) {
    result.example = result.examples[0].translation
      ? `${result.examples[0].sentence} ／ ${result.examples[0].translation}`
      : result.examples[0].sentence;
  }
  result.meaning = [result.ieltsMeaning, result.otherMeanings].filter(Boolean).join('\n');
  rememberLookup(cacheKey, result);
  return result;
}

async function lookupExamples(word, sense) {
  const data = await lookupWord(word);
  const picked = pickExample(data.examples, sense);
  return {
    examples: data.examples,
    picked,
    senses: [data.ieltsMeaning].concat(String(data.otherMeanings || '').split(/\s*｜\s*/).filter(Boolean)).filter(Boolean),
  };
}

module.exports = {
  lookupWord,
  lookupExamples,
  splitExplain,
  sameHeadword,
  fromYoudaoSuggest,
  fromYoudaoJsonapi,
  pickExample,
  isMostlyEnglish,
  cleanSense,
};

const test = require('node:test');
const assert = require('node:assert/strict');
const { splitExplain, fromYoudaoSuggest } = require('../src/dictionary');

test('splits youdao explains into exam meaning and others', () => {
  const groups = splitExplain('adj. 国内的；家庭的 n. 佣人');
  assert.equal(groups[0], 'adj. 国内的；家庭的');
  assert.ok(groups[1].includes('佣人'));
});

test('uses the first sense as IELTS meaning', () => {
  const parsed = fromYoudaoSuggest({
    data: { entries: [{ explain: 'v. 像，与……相似 vt. 类似' }] },
  });
  assert.equal(parsed.ieltsMeaning, 'v. 像，与……相似');
  assert.match(parsed.otherMeanings, /类似/);
});

test('drops english-only dumps', () => {
  const { isMostlyEnglish } = require('../src/dictionary');
  assert.equal(isMostlyEnglish('adj. 人造的；合成的'), false);
  assert.equal(isMostlyEnglish('adjective. Produced by synthesis instead of being isolated from a natural source'), true);
});

test('rejects youdao jsonapi payload for a different headword', () => {
  const { fromYoudaoJsonapi, sameHeadword } = require('../src/dictionary');
  assert.equal(sameHeadword('certificate', 'certificate'), true);
  assert.equal(sameHeadword('certificate', 'placatory'), false);
  const parsed = fromYoudaoJsonapi({
    ec: {
      word: {
        'return-phrase': { l: { i: 'placatory' } },
        usphone: 'pleikətəri',
        trs: [{ pos: 'adj.', tran: '<正式>抚慰的' }],
      },
    },
  }, 'certificate');
  assert.equal(parsed, null);
});

test('accepts youdao jsonapi payload for the queried headword', () => {
  const { fromYoudaoJsonapi } = require('../src/dictionary');
  const parsed = fromYoudaoJsonapi({
    ec: {
      word: {
        'return-phrase': { l: { i: 'certificate' } },
        usphone: 'sərˈtɪfɪkət',
        trs: [{ tr: [{ l: { i: ['n. 证明，证书'] } }] }],
      },
    },
  }, 'certificate');
  assert.equal(parsed.phonetic, '/sərˈtɪfɪkət/');
  assert.match(parsed.ieltsMeaning, /证书/);
});

test('suggest prefers the exact entry', () => {
  const { fromYoudaoSuggest } = require('../src/dictionary');
  const parsed = fromYoudaoSuggest({
    data: {
      entries: [
        { entry: 'placatory', explain: 'adj. 抚慰的' },
        { entry: 'certificate', explain: 'n. 证明，证书' },
      ],
    },
  }, 'certificate');
  assert.match(parsed.ieltsMeaning, /证书/);
});

'use strict';

const path = require('path');
const { createWorker } = require('tesseract.js');
const { extractScanItems, extractPageScanItems } = require('./extract-markers');

let workerPromise = null;

function getWorker(cachePath) {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      cachePath,
      logger: () => {},
    });
  }
  return workerPromise;
}

function uniqueWords(items, source) {
  const words = [];
  const seen = new Set();
  items.forEach((text) => {
    const key = String(text || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    words.push({ text, source });
  });
  return words;
}

async function recognizeImage({ regionDataUrls, dataUrl, cachePath, mode }) {
  const scanMode = mode === 'all' ? 'all' : 'highlight';
  const worker = await getWorker(cachePath);

  if (scanMode === 'all') {
    if (!dataUrl) {
      return { fullText: '', regionTexts: [], words: [], usedFallback: false, highlightOnly: false };
    }
    const result = await worker.recognize(dataUrl);
    const fullText = (result.data && result.data.text) || '';
    return {
      fullText,
      regionTexts: [],
      words: uniqueWords(extractPageScanItems(fullText), 'ocr-page'),
      usedFallback: false,
      highlightOnly: false,
    };
  }

  const regions = regionDataUrls || [];
  if (!regions.length) {
    return { fullText: '', regionTexts: [], words: [], usedFallback: false, highlightOnly: true };
  }

  const regionTexts = [];
  for (const region of regions) {
    const result = await worker.recognize(region);
    regionTexts.push((result.data && result.data.text) || '');
  }

  const words = [];
  const seen = new Set();
  for (const regionText of regionTexts) {
    extractScanItems(regionText).forEach((text) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      words.push({ text, source: 'ocr-highlight' });
    });
  }

  return {
    fullText: '',
    regionTexts,
    words,
    usedFallback: false,
    highlightOnly: true,
  };
}

function tessdataPath(userData) {
  return path.join(userData, 'tessdata');
}

module.exports = { recognizeImage, tessdataPath };

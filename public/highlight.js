'use strict';

function rgbToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1) || 1);
  let hue = 0;
  if (delta !== 0) {
    if (max === rr) hue = ((gg - bb) / delta) % 6;
    else if (max === gg) hue = (bb - rr) / delta + 2;
    else hue = (rr - gg) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s: sat, l: lightness };
}

function isRedPrint(h, s, l) {
  return (h <= 16 || h >= 350) && s >= 0.35 && l <= 0.62;
}

function isMarkerPixel(r, g, b, color) {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (isRedPrint(h, s, l)) return false;
  if (s < 0.16 || l > 0.92) return false;

  const orange = h >= 18 && h <= 50 && s >= 0.22 && s <= 0.82 && l >= 0.48 && r > 160 && g > 85 && b < 170 && (r - b) > 35;
  const yellow = h >= 44 && h <= 68 && s >= 0.28 && l >= 0.48;
  const green = h >= 70 && h <= 160 && g > r + 6 && g > b && l >= 0.36 && l <= 0.88 && s >= 0.18;
  const pink = ((h >= 300 && h <= 345) || (h >= 320 && h <= 360)) && l >= 0.58 && b > 90;

  if (color === 'yellow') return yellow;
  if (color === 'green') return green;
  if (color === 'pink') return pink;
  if (color === 'auto') return orange || yellow || green || pink;
  return orange;
}

function mergeBoxes(boxes) {
  const out = boxes.slice();
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        const pad = 2;
        const overlap = a.x - pad < b.x + b.w && a.x + a.w + pad > b.x
          && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
        if (!overlap) continue;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const right = Math.max(a.x + a.w, b.x + b.w);
        const bottom = Math.max(a.y + a.h, b.y + b.h);
        out[i] = { x, y, w: right - x, h: bottom - y };
        out.splice(j, 1);
        merged = true;
        break;
      }
      if (merged) break;
    }
  }
  return out;
}

function findHighlightBoxes(imageData, width, height, color) {
  const cell = 8;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const hits = [];
  const data = imageData.data;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let count = 0;
      let samples = 0;
      for (let y = row * cell; y < Math.min(height, (row + 1) * cell); y += 2) {
        for (let x = col * cell; x < Math.min(width, (col + 1) * cell); x += 2) {
          const i = (y * width + x) * 4;
          samples += 1;
          if (isMarkerPixel(data[i], data[i + 1], data[i + 2], color)) count += 1;
        }
      }
      if (samples && count / samples > 0.34) {
        hits.push({ x: col * cell, y: row * cell, w: cell, h: cell });
      }
    }
  }
  return mergeBoxes(hits).filter((box) => {
    if (box.w < 18 || box.h < 10) return false;
    if (box.w >= width * 0.42 && box.h <= height * 0.14) return false;
    if (box.w * box.h > width * height * 0.16) return false;
    return true;
  });
}

function cropBox(sourceCanvas, box, padding) {
  const pad = padding || 10;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(sourceCanvas.width - x, box.w + pad * 2);
  const h = Math.min(sourceCanvas.height - y, box.h + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function prepareImage(img, options) {
  const color = (options && options.color) || 'orange';
  const mode = (options && options.mode) || 'highlight';
  const max = 1800;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (mode === 'all') {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return {
      dataUrl,
      previewUrl: dataUrl,
      regionDataUrls: [],
      boxCount: 0,
      color,
      mode,
    };
  }
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const boxes = findHighlightBoxes(imageData, canvas.width, canvas.height, color);
  const overlay = document.createElement('canvas');
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  overlay.getContext('2d').drawImage(canvas, 0, 0);
  const octx = overlay.getContext('2d');
  octx.strokeStyle = 'rgba(196, 146, 64, .95)';
  octx.lineWidth = 3;
  octx.fillStyle = 'rgba(196, 146, 64, .16)';
  boxes.forEach((box) => {
    octx.fillRect(box.x, box.y, box.w, box.h);
    octx.strokeRect(box.x, box.y, box.w, box.h);
  });
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    previewUrl: overlay.toDataURL('image/jpeg', 0.9),
    regionDataUrls: boxes.slice(0, 40).map(box => cropBox(canvas, box, 12)),
    boxCount: boxes.length,
    color,
    mode,
  };
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片'));
    };
    img.src = url;
  });
}

window.HighlightScan = { prepareImage, loadImageFile, findHighlightBoxes, isMarkerPixel };

Dixel.define('ShapeMask', ['Utils'], function (Utils) {
  'use strict';

  function textMask(host, scale) {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(scale || Utils.dpr, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    const range = document.createRange();
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement || host;
      const style = getComputedStyle(parent);
      ctx.font = style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const spacing = parseFloat(style.letterSpacing);
      const text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        if (!text[i].trim()) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const glyph = range.getBoundingClientRect();
        if (!glyph.width) continue;
        const baseline = glyph.bottom - rect.top - (glyph.height - parseFloat(style.fontSize)) * 0.34;
        ctx.fillText(text[i], glyph.left - rect.left + (isNaN(spacing) ? 0 : 0), baseline);
      }
    }
    return { canvas, width, height };
  }

  function ringMask(host, thickness) {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const radius = parseFloat(getComputedStyle(host).borderRadius) || 0;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    roundRect(ctx, thickness, thickness, width - thickness * 2, height - thickness * 2, Math.max(radius - thickness, 0));
    ctx.fill();
    return { canvas, width, height };
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function samplePoints(maskCanvas, step) {
    const ctx = maskCanvas.getContext('2d');
    const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    const points = [];
    const stride = Math.max(1, Math.round(step || 4));
    for (let y = 0; y < maskCanvas.height; y += stride) {
      for (let x = 0; x < maskCanvas.width; x += stride) {
        if (data[(y * maskCanvas.width + x) * 4 + 3] > 96) {
          points.push({ x: x / maskCanvas.width, y: y / maskCanvas.height });
        }
      }
    }
    return points;
  }

  function toMaskImage(el, maskCanvas) {
    const url = 'url(' + maskCanvas.canvas.toDataURL('image/png') + ')';
    el.style.webkitMaskImage = url;
    el.style.maskImage = url;
    el.style.webkitMaskSize = '100% 100%';
    el.style.maskSize = '100% 100%';
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.maskRepeat = 'no-repeat';
  }

  return { textMask, ringMask, samplePoints, toMaskImage };
});

Dixel.define('Utils', [], function () {
  'use strict';

  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const touchQuery = matchMedia('(pointer: coarse)');
  const tokenCache = {};
  const themeListeners = new Set();

  return {
    token(name, fallback) {
      const key = String(name).slice(0, 2) === '--' ? String(name) : '--dx-' + name;
      if (key in tokenCache) return tokenCache[key] || fallback || '';
      const value = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
      tokenCache[key] = value;
      return value || fallback || '';
    },
    color(value, fallback) {
      const text = String(value === null || value === undefined ? '' : value).trim();
      if (!text) return this.token(fallback, '');
      if (/^(#|rgb|hsl|oklch|oklab|lab|lch|color\(|transparent|currentColor)/i.test(text)) return text;
      return this.token(text, fallback);
    },
    channels(color) {
      const text = String(color).trim();
      if (text[0] === '#') {
        const hex = text.slice(1);
        const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex.slice(0, 6);
        const int = parseInt(full, 16);
        if (isNaN(int)) return null;
        return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
      }
      const match = text.match(/^rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(/[\s,/]+/).filter((part) => part !== '').map(parseFloat);
      if (parts.length < 3 || parts.some(isNaN)) return null;
      return [parts[0], parts[1], parts[2]];
    },
    clearTokens() {
      Object.keys(tokenCache).forEach((key) => delete tokenCache[key]);
    },
    onTheme(callback) {
      themeListeners.add(callback);
      return () => themeListeners.delete(callback);
    },
    emitTheme() {
      this.clearTokens();
      themeListeners.forEach((listener) => {
        try {
          listener();
        } catch (error) {}
      });
    },
    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },
    lerp(start, end, amount) {
      return start + (end - start) * amount;
    },
    damp(current, target, smoothing, delta) {
      return this.lerp(current, target, 1 - Math.exp(-smoothing * delta));
    },
    map(value, inMin, inMax, outMin, outMax) {
      const span = inMax - inMin;
      if (!span) return outMin;
      return outMin + ((value - inMin) / span) * (outMax - outMin);
    },
    withAlpha(color, alpha) {
      const text = String(color).trim();
      const parts = this.channels(text);
      if (parts) return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + alpha + ')';
      return text;
    },
    escape(value) {
      return String(value).replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
      ));
    },
    get reducedMotion() {
      return reducedMotionQuery.matches;
    },
    get isTouch() {
      return touchQuery.matches;
    },
    get dpr() {
      return Math.min(window.devicePixelRatio || 1, 2);
    },
    el(tag, className, attributes) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (attributes) {
        Object.keys(attributes).forEach((key) => {
          if (key === 'text') node.textContent = attributes[key];
          else if (key === 'html') node.innerHTML = attributes[key];
          else node.setAttribute(key, attributes[key]);
        });
      }
      return node;
    },
    on(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      return () => target.removeEventListener(type, handler, options);
    },
    fitCanvas(canvas, context) {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = this.dpr;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height, dpr };
    },
    uid() {
      return 'dx' + Math.random().toString(36).slice(2, 9);
    }
  };
});

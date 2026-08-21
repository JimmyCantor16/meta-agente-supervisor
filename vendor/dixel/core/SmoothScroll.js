Dixel.define('SmoothScroll', ['Ticker', 'Utils'], function (Ticker, Utils) {
  'use strict';

  const scrollKeys = [' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
  const editableSelector = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const interactiveSelector = 'button, a, summary, [role="button"], audio, video';

  class SmoothScroll {
    constructor(options) {
      const settings = options || {};
      this.smoothing = settings.smoothing || 14;
      this.wheelMultiplier = settings.wheelMultiplier || 1.2;
      this.arrowStep = settings.arrowStep || 140;
      this.enabled = !Utils.isTouch && !Utils.reducedMotion && settings.enabled !== false;
      this.target = window.scrollY;
      this.current = window.scrollY;
      this.listeners = new Set();
      this.bound = false;
      this.stopTick = null;
      this.idleFrames = 0;
      this.tick = this.tick.bind(this);
      this.controller = typeof AbortController === 'undefined' ? null : new AbortController();
      if (this.enabled) this.bind();
      this.bindAnchors();
    }

    maxScroll() {
      return Math.max(document.documentElement.scrollHeight - innerHeight, 0);
    }

    scrollableAncestor(start, delta) {
      let node = start;
      while (node && node !== document.documentElement && node !== document.body) {
        if (node.nodeType === 1 && node.scrollHeight > node.clientHeight + 1) {
          const overflow = getComputedStyle(node).overflowY;
          if (overflow === 'auto' || overflow === 'scroll') {
            const atTop = node.scrollTop <= 0;
            const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
            if ((delta > 0 && !atBottom) || (delta < 0 && !atTop)) return node;
          }
        }
        node = node.parentNode;
      }
      return null;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      const signal = this.controller ? { signal: this.controller.signal } : {};
      addEventListener('wheel', (event) => {
        if (!this.enabled || event.ctrlKey || event.defaultPrevented) return;
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        if (this.scrollableAncestor(event.target, event.deltaY)) return;
        event.preventDefault();
        this.target = Utils.clamp(this.target + this.normalize(event) * this.wheelMultiplier, 0, this.maxScroll());
        this.wake();
      }, Object.assign({ passive: false }, signal));

      addEventListener('keydown', (event) => this.handleKey(event), signal);

      addEventListener('scroll', () => {
        if (!this.enabled) return;
        if (Math.abs(window.scrollY - Math.round(this.current)) < 2) return;
        this.target = window.scrollY;
        this.current = window.scrollY;
      }, Object.assign({ passive: true }, signal));

      addEventListener('resize', () => {
        this.target = Utils.clamp(this.target, 0, this.maxScroll());
      }, Object.assign({ passive: true }, signal));

      this.wake();
    }

    wake() {
      this.idleFrames = 0;
      if (this.stopTick || !this.enabled) return;
      this.stopTick = Ticker.add(this.tick);
    }

    sleep() {
      if (!this.stopTick) return;
      this.stopTick();
      this.stopTick = null;
    }

    tick(time, delta) {
      if (!this.enabled) {
        this.sleep();
        return;
      }
      if (Math.abs(this.target - this.current) < 0.05) {
        this.current = this.target;
        this.idleFrames += 1;
        if (this.idleFrames > 12) this.sleep();
        return;
      }
      this.idleFrames = 0;
      this.current = Utils.damp(this.current, this.target, this.smoothing, delta);
      window.scrollTo(0, this.current);
      this.listeners.forEach((listener) => listener(this.current));
    }

    handleKey(event) {
      if (!this.enabled || event.defaultPrevented) return;
      this.wake();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (scrollKeys.indexOf(event.key) === -1) return;
      const focus = event.target;
      const canQuery = focus && focus.closest;
      if (canQuery && focus.closest(editableSelector)) return;
      if (event.key === ' ' && canQuery && focus.closest(interactiveSelector)) return;
      event.preventDefault();
      const max = this.maxScroll();
      if (event.key === 'Home') {
        this.target = 0;
        return;
      }
      if (event.key === 'End') {
        this.target = max;
        return;
      }
      const page = innerHeight * 0.88;
      let step = 0;
      if (event.key === ' ') step = event.shiftKey ? -page : page;
      else if (event.key === 'PageDown') step = page;
      else if (event.key === 'PageUp') step = -page;
      else if (event.key === 'ArrowDown') step = this.arrowStep;
      else if (event.key === 'ArrowUp') step = -this.arrowStep;
      this.target = Utils.clamp(this.target + step, 0, max);
    }

    normalize(event) {
      if (event.deltaMode === 1) return event.deltaY * 32;
      if (event.deltaMode === 2) return event.deltaY * innerHeight;
      return event.deltaY;
    }

    bindAnchors() {
      addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = event.target.closest('a[href^="#"]');
        if (!anchor) return;
        const id = anchor.getAttribute('href').slice(1);
        if (!id) return;
        const destination = document.getElementById(id);
        if (!destination) return;
        event.preventDefault();
        this.scrollTo(destination);
      });
    }

    scrollTo(target, offset) {
      const top = typeof target === 'number'
        ? target
        : target.getBoundingClientRect().top + window.scrollY;
      const destination = Utils.clamp(top + (offset || 0), 0, this.maxScroll());
      if (this.enabled) {
        this.target = destination;
        this.wake();
      } else {
        window.scrollTo({ top: destination, behavior: Utils.reducedMotion ? 'auto' : 'smooth' });
      }
    }

    onScroll(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    get y() {
      return this.enabled ? this.current : window.scrollY;
    }

    stop() {
      this.enabled = false;
      this.sleep();
    }

    start() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.enabled = true;
      this.target = window.scrollY;
      this.current = window.scrollY;
      this.bind();
      this.wake();
    }

    destroy() {
      this.stop();
      this.listeners.clear();
      if (this.controller) this.controller.abort();
      this.bound = false;
    }
  }

  return SmoothScroll;
});

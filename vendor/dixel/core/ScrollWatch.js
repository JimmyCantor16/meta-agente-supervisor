Dixel.define('ScrollWatch', ['Ticker', 'Utils'], function (Ticker, Utils) {
  'use strict';

  class ScrollWatch {
    constructor() {
      this.items = [];
      this.lastY = -1;
      this.stop = null;
      this.idleFrames = 0;
      this.measureQueued = false;
      addEventListener('resize', () => this.queueRefresh(), { passive: true });
      addEventListener('load', () => this.queueRefresh());
      addEventListener('scroll', () => this.ensure(), { passive: true });
    }

    queueRefresh() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      requestAnimationFrame(() => {
        this.measureQueued = false;
        this.refresh();
      });
    }

    refresh() {
      const scrollY = window.scrollY;
      this.items.forEach((item) => {
        const rect = item.el.getBoundingClientRect();
        item.top = rect.top + scrollY;
        item.height = rect.height;
        item.measured = true;
      });
      this.lastY = -1;
    }

    watch(el, handlers) {
      const item = {
        el,
        top: 0,
        height: 0,
        entered: false,
        enterAt: handlers.enterAt !== undefined ? handlers.enterAt : 0.85,
        once: handlers.once || false,
        onEnter: handlers.enter || null,
        onLeave: handlers.leave || null,
        onProgress: handlers.progress || null
      };
      item.measured = false;
      this.items.push(item);
      this.queueRefresh();
      this.ensure();
      return () => {
        this.items = this.items.filter((existing) => existing !== item);
        this.sleepIfIdle();
      };
    }

    sleepIfIdle() {
      if (!this.items.length && this.stop) {
        this.stop();
        this.stop = null;
        this.lastY = -1;
      }
    }

    ensure() {
      if (this.stop || !this.items.length) return;
      this.idleFrames = 0;
      this.stop = Ticker.add(() => this.update());
    }

    update() {
      const y = window.scrollY;
      if (y === this.lastY) {
        this.idleFrames += 1;
        if (this.idleFrames > 30 && this.stop) {
          this.stop();
          this.stop = null;
        }
        return;
      }
      this.idleFrames = 0;
      this.lastY = y;
      const viewHeight = innerHeight;
      let finished = false;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        if (!item.measured) continue;
        const viewTop = item.top - y;
        const enterLine = viewHeight * item.enterAt;
        const inside = viewTop < enterLine && viewTop + item.height > 0;
        if (inside && !item.entered) {
          item.entered = true;
          if (item.onEnter) item.onEnter(item.el);
          if (item.once && !item.onProgress) {
            item.done = true;
            finished = true;
          }
        } else if (!inside && item.entered && !item.once) {
          item.entered = false;
          if (item.onLeave) item.onLeave(item.el);
        }
        if (item.onProgress) {
          const progress = Utils.clamp((viewHeight - viewTop) / (viewHeight + item.height), 0, 1);
          if (progress !== item.lastProgress) {
            item.lastProgress = progress;
            item.onProgress(progress, item.el);
          }
        }
      }
      if (finished) {
        this.items = this.items.filter((item) => !item.done);
        this.sleepIfIdle();
      }
    }
  }

  return new ScrollWatch();
});

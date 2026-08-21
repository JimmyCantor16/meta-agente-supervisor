Dixel.define('Ticker', [], function () {
  'use strict';

  class Ticker {
    constructor() {
      this.callbacks = new Set();
      this.running = false;
      this.last = 0;
      this.frame = this.frame.bind(this);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.last = performance.now();
      });
    }

    add(callback) {
      this.callbacks.add(callback);
      this.start();
      return () => this.remove(callback);
    }

    remove(callback) {
      this.callbacks.delete(callback);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.frame);
    }

    frame(now) {
      if (!this.callbacks.size) {
        this.running = false;
        return;
      }
      requestAnimationFrame(this.frame);
      const delta = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      const time = now / 1000;
      const snapshot = [...this.callbacks];
      for (let i = 0; i < snapshot.length; i++) {
        try {
          if (this.callbacks.has(snapshot[i])) snapshot[i](time, delta);
        } catch (error) {
          this.callbacks.delete(snapshot[i]);
        }
      }
    }
  }

  return new Ticker();
});

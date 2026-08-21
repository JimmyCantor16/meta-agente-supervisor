Dixel.define('Viewport', [], function () {
  'use strict';

  class Viewport {
    constructor() {
      this.handlers = new Map();
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const set = this.handlers.get(entry.target);
            if (set) set.forEach((handler) => handler(entry.isIntersecting, entry));
          });
        },
        { rootMargin: '14% 0px 14% 0px' }
      );
    }

    watch(el, handler) {
      if (!el) return () => {};
      let set = this.handlers.get(el);
      if (!set) {
        set = new Set();
        this.handlers.set(el, set);
        this.observer.observe(el);
      }
      set.add(handler);
      return () => {
        set.delete(handler);
        if (!set.size) this.unwatch(el);
      };
    }

    unwatch(el) {
      this.handlers.delete(el);
      this.observer.unobserve(el);
    }
  }

  return new Viewport();
});

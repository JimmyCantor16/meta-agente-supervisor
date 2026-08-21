Dixel.define('TypeWriter', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class TypeWriter extends Component {
    static defaults = {
      phrases: [],
      typeSpeed: 16,
      deleteSpeed: 34,
      hold: 1.7,
      gap: 0.4,
      loop: true,
      caret: true
    };

    build() {
      return Utils.el('span', 'dx-type');
    }

    ready() {
      this.el.classList.add('dx-type');
      const initial = this.el.textContent.trim();
      this.phrases = this.options.phrases.length ? this.options.phrases : initial ? [initial] : [];
      this.el.textContent = '';
      this.textEl = Utils.el('span', 'dx-type-text');
      this.el.appendChild(this.textEl);
      if (this.phrases.length) this.el.setAttribute('aria-label', this.phrases[0]);
      if (this.options.caret) {
        this.el.appendChild(Utils.el('span', 'dx-type-caret', { 'aria-hidden': 'true' }));
      }
      if (Utils.reducedMotion || !this.phrases.length) {
        this.textEl.textContent = this.phrases[0] || '';
        return;
      }
      this.phraseIndex = 0;
      this.charCount = 0;
      this.buffer = 0;
      this.wait = 0;
      this.mode = 'typing';
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-type--paused', !visible);
        if (visible) this.run();
        else this.halt();
      });
    }

    run() {
      if (this.stopFrames || this.finished) return;
      this.stopFrames = Ticker.add((time, delta) => this.step(delta));
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    step(delta) {
      if (this.wait > 0) {
        this.wait -= delta;
        return;
      }
      const phrase = this.phrases[this.phraseIndex];
      const speed = this.mode === 'typing' ? this.options.typeSpeed : this.options.deleteSpeed;
      this.buffer += delta * speed;
      if (this.buffer < 1) return;
      const steps = Math.floor(this.buffer);
      this.buffer -= steps;
      if (this.mode === 'typing') {
        this.charCount = Math.min(this.charCount + steps, phrase.length);
        this.textEl.textContent = phrase.slice(0, this.charCount);
        if (this.charCount >= phrase.length) {
          const last = this.phraseIndex === this.phrases.length - 1;
          if (this.phrases.length === 1 || (last && !this.options.loop)) {
            this.finished = true;
            this.halt();
            return;
          }
          this.mode = 'deleting';
          this.wait = this.options.hold;
        }
      } else {
        this.charCount = Math.max(this.charCount - steps, 0);
        this.textEl.textContent = phrase.slice(0, this.charCount);
        if (this.charCount <= 0) {
          this.phraseIndex = (this.phraseIndex + 1) % this.phrases.length;
          this.mode = 'typing';
          this.wait = this.options.gap;
        }
      }
    }
  }

  return TypeWriter;
});

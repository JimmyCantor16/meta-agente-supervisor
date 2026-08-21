Dixel.define('ScrambleText', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  const CHARSET = '!<>-_\\/[]{}=+*^?#abcdefghijklmnopqrstuvwxyz0123456789';

  class ScrambleText extends Component {
    static defaults = {
      text: null,
      duration: 1.2,
      delay: 0,
      fps: 30
    };

    build() {
      return Utils.el('span', 'dx-scramble', this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-scramble');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.setAttribute('aria-label', this.sourceText);
      this.el.textContent = this.sourceText;
      if (Utils.reducedMotion) return;
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible, entry) => {
        if (visible) this.play();
        else if (entry.boundingClientRect.top < 0) this.revert();
      });
    }

    play() {
      if (this.stopFrames) return;
      const duration = Math.max(this.options.duration, 0.001);
      const frameStep = 1 / this.options.fps;
      let elapsed = -this.options.delay;
      let sinceFrame = frameStep;
      this.stopFrames = Ticker.add((time, delta) => {
        elapsed += delta;
        sinceFrame += delta;
        if (elapsed < 0 || sinceFrame < frameStep) return;
        sinceFrame = 0;
        const progress = Utils.clamp(elapsed / duration, 0, 1);
        this.el.textContent = this.scrambled(progress);
        if (progress >= 1) this.halt();
      });
    }

    scrambled(progress) {
      const source = this.sourceText;
      const lockCount = Math.floor(source.length * progress);
      let output = source.slice(0, lockCount);
      for (let i = lockCount; i < source.length; i++) {
        const char = source[i];
        output += char === ' ' ? ' ' : CHARSET[(Math.random() * CHARSET.length) | 0];
      }
      return output;
    }

    revert() {
      this.halt();
      this.el.textContent = this.sourceText;
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return ScrambleText;
});

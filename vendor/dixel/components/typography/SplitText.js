Dixel.define('SplitText', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class SplitText extends Component {
    static defaults = {
      text: null,
      split: 'chars',
      stagger: 0.03,
      duration: 0.9,
      delay: 0,
      maxStagger: 1.1
    };

    build() {
      return Utils.el('span', 'dx-split', this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-split');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.setAttribute('aria-label', this.sourceText);
      this.resplitQueued = false;
      this.splitUnits(false);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-split--in');
        return;
      }
      if (this.options.split === 'lines') {
        this.listen(window, 'resize', () => this.queueResplit());
      }
      this.whenVisible((visible, entry) => {
        if (visible) {
          this.el.classList.add('dx-split--in');
        } else if (entry.boundingClientRect.top < 0) {
          this.applyTimings(false);
          this.el.classList.remove('dx-split--in');
        }
      });
    }

    queueResplit() {
      if (this.resplitQueued) return;
      this.resplitQueued = true;
      if (!this.stopResplitRegistered) {
        this.stopResplitRegistered = true;
        this.addCleanup(() => {
          if (this.stopResplit) this.stopResplit();
        });
      }
      this.stopResplit = Ticker.add(() => {
        this.stopResplit();
        this.stopResplit = null;
        this.resplitQueued = false;
        this.splitUnits(this.el.classList.contains('dx-split--in'));
      });
    }

    splitUnits(instant) {
      this.units = [];
      if (this.options.split === 'lines') this.splitLines();
      else this.splitInline();
      this.applyTimings(instant);
    }

    splitLines() {
      const words = this.sourceText.split(/\s+/).filter(Boolean);
      this.el.textContent = '';
      const probes = words.map((word, index) => {
        const probe = Utils.el('span', 'dx-split-word', { text: word });
        this.el.appendChild(probe);
        if (index < words.length - 1) this.el.appendChild(document.createTextNode(' '));
        return probe;
      });
      const lines = [];
      let currentTop = null;
      probes.forEach((probe) => {
        if (probe.offsetTop !== currentTop) {
          currentTop = probe.offsetTop;
          lines.push([]);
        }
        lines[lines.length - 1].push(probe.textContent);
      });
      this.el.textContent = '';
      lines.forEach((lineWords) => {
        const mask = Utils.el('span', 'dx-split-mask dx-split-mask--line', { 'aria-hidden': 'true' });
        const unit = Utils.el('span', 'dx-split-unit', { text: lineWords.join(' ') });
        mask.appendChild(unit);
        this.el.appendChild(mask);
        this.units.push(unit);
      });
    }

    splitInline() {
      const words = this.sourceText.split(/\s+/).filter(Boolean);
      this.el.textContent = '';
      words.forEach((word, wordIndex) => {
        const wordWrap = Utils.el('span', 'dx-split-word', { 'aria-hidden': 'true' });
        if (this.options.split === 'chars') {
          Array.from(word).forEach((char) => wordWrap.appendChild(this.buildUnit(char)));
        } else {
          wordWrap.appendChild(this.buildUnit(word));
        }
        this.el.appendChild(wordWrap);
        if (wordIndex < words.length - 1) this.el.appendChild(document.createTextNode(' '));
      });
    }

    buildUnit(text) {
      const mask = Utils.el('span', 'dx-split-mask');
      const unit = Utils.el('span', 'dx-split-unit', { text });
      mask.appendChild(unit);
      this.units.push(unit);
      return mask;
    }

    applyTimings(instant) {
      this.units.forEach((unit, index) => {
        if (instant) {
          unit.style.transition = 'none';
          return;
        }
        unit.style.transition = '';
        unit.style.transitionDuration = this.options.duration + 's';
        unit.style.transitionDelay = (this.options.delay + Math.min(index * this.options.stagger, this.options.maxStagger)).toFixed(3) + 's';
      });
    }
  }

  return SplitText;
});

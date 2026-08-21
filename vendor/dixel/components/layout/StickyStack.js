Dixel.define('StickyStack', ['Component', 'Utils', 'ScrollWatch'], function (Component, Utils, ScrollWatch) {
  'use strict';

  class StickyStack extends Component {
    static defaults = {
      top: 24,
      scaleStep: 0.05,
      items: []
    };

    build() {
      return Utils.el('div', 'dx-stack');
    }

    ready() {
      this.el.classList.add('dx-stack');
      if (!this.el.children.length && this.options.items.length) {
        this.options.items.forEach((html) => {
          const card = Utils.el('div', 'dx-stack-panel');
          card.innerHTML = html;
          this.el.appendChild(card);
        });
      }
      this.cards = Array.from(this.el.children);
      this.cards.forEach((card, index) => {
        card.classList.add('dx-stack-card');
        card.style.top = this.options.top + 'px';
        card.style.zIndex = String(index + 1);
      });
      if (Utils.reducedMotion || this.cards.length < 2) return;
      this.addCleanup(ScrollWatch.watch(this.el, {
        progress: (progress) => this.paint(progress)
      }));
    }

    paint(progress) {
      const count = this.cards.length;
      for (let i = 0; i < count - 1; i++) {
        const covered = Utils.clamp(progress * count - (i + 1), 0, 1);
        const scale = 1 - covered * this.options.scaleStep;
        this.cards[i].style.transform = 'scale(' + scale.toFixed(4) + ')';
      }
    }
  }

  return StickyStack;
});

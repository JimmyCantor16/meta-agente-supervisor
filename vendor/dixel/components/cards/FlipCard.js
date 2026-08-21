Dixel.define('FlipCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  class FlipCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      front: '',
      back: '',
      trigger: 'click',
      axis: 'y',
      minHeight: 220
    });

    build() {
      const el = Utils.el('div', 'dx-flip');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<div class="dx-flip-inner">' +
        '<div class="dx-flip-face dx-flip-front">' + this.options.front + '</div>' +
        '<div class="dx-flip-face dx-flip-back">' + this.options.back + '</div>' +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-flip', 'dx-flip--' + this.options.axis);
      if (!this.el.querySelector('.dx-flip-inner')) this.el.innerHTML = this.markup();
      this.inner = this.el.querySelector('.dx-flip-inner');
      this.inner.style.minHeight = this.options.minHeight + 'px';
      this.flipped = false;
      this.el.setAttribute('tabindex', '0');
      this.el.setAttribute('role', 'button');
      this.el.setAttribute('aria-pressed', 'false');
      this.el.classList.add('dx-focusable');
      if (this.options.trigger === 'hover' && !Utils.isTouch) {
        this.listen(this.el, 'pointerenter', () => this.setFlipped(true));
        this.listen(this.el, 'pointerleave', () => this.setFlipped(false));
      } else {
        this.listen(this.el, 'click', this.toggle);
      }
      this.listen(this.el, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.toggle();
      });
    }

    toggle() {
      this.setFlipped(!this.flipped);
    }

    setFlipped(flipped) {
      this.flipped = flipped;
      this.el.classList.toggle('is-flipped', flipped);
      this.el.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    }
  }

  return FlipCard;
});

Dixel.define('HighlightText', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class HighlightText extends Component {
    static defaults = {
      text: null,
      type: 'marker',
      color: 'primary',
      duration: 0.8,
      delay: 0.1
    };

    build() {
      return Utils.el('span', null, this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-hl', 'dx-hl--' + this.options.type, 'dx-hl--' + this.options.color);
      const textWrap = Utils.el('span', 'dx-hl-text');
      while (this.el.firstChild) textWrap.appendChild(this.el.firstChild);
      this.el.appendChild(textWrap);
      this.ink = Utils.el('span', 'dx-hl-ink', { 'aria-hidden': 'true' });
      this.el.insertBefore(this.ink, textWrap);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-hl--in');
        return;
      }
      this.ink.style.transitionDuration = this.options.duration + 's';
      this.ink.style.transitionDelay = this.options.delay + 's';
      this.whenVisible((visible, entry) => {
        if (visible) this.el.classList.add('dx-hl--in');
        else if (entry.boundingClientRect.top < 0) this.el.classList.remove('dx-hl--in');
      });
    }
  }

  return HighlightText;
});

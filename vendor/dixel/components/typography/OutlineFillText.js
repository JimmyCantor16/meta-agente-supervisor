Dixel.define('OutlineFillText', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class OutlineFillText extends Component {
    static defaults = {
      text: null,
      gradient: false,
      duration: 1.1,
      delay: 0
    };

    build() {
      return Utils.el('span', 'dx-outline', this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-outline');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.textContent = '';
      this.el.setAttribute('aria-label', this.sourceText);
      this.el.appendChild(Utils.el('span', 'dx-outline-stroke', { text: this.sourceText, 'aria-hidden': 'true' }));
      this.fillMask = Utils.el('span', 'dx-outline-fill', { 'aria-hidden': 'true' });
      const fillText = Utils.el('span', 'dx-outline-fill-text' + (this.options.gradient ? ' dx-gradient-text' : ''), { text: this.sourceText });
      this.fillMask.appendChild(fillText);
      this.el.appendChild(this.fillMask);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-outline--in');
        return;
      }
      const timing = this.options.duration + 's';
      const delay = this.options.delay + 's';
      this.fillMask.style.transitionDuration = timing;
      this.fillMask.style.transitionDelay = delay;
      fillText.style.transitionDuration = timing;
      fillText.style.transitionDelay = delay;
      this.whenVisible((visible, entry) => {
        if (visible) this.el.classList.add('dx-outline--in');
        else if (entry.boundingClientRect.top < 0) this.el.classList.remove('dx-outline--in');
      });
    }
  }

  return OutlineFillText;
});

Dixel.define('GradientText', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class GradientText extends Component {
    static defaults = {
      text: null,
      gradient: 'text',
      animateIn: true,
      duration: 0.9,
      delay: 0
    };

    build() {
      return Utils.el('span', null, this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-gtext', 'dx-gtext--' + this.options.gradient);
      if (!this.options.animateIn || Utils.reducedMotion) {
        this.el.classList.add('dx-gtext--in');
        return;
      }
      this.el.style.transitionDuration = this.options.duration + 's';
      this.el.style.transitionDelay = this.options.delay + 's';
      this.whenVisible((visible, entry) => {
        if (visible) this.el.classList.add('dx-gtext--in');
        else if (entry.boundingClientRect.top < 0) this.el.classList.remove('dx-gtext--in');
      });
    }
  }

  return GradientText;
});

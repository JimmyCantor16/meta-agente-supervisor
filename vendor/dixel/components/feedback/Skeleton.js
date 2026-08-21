Dixel.define('Skeleton', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Skeleton extends Component {
    static defaults = {
      variant: 'text',
      lines: 3,
      height: 160,
      sheenAngle: null,
      sheenSpeed: null,
      sheenColor: null
    };

    build() {
      const el = Utils.el('div', 'dx-skeleton dx-skeleton--' + this.options.variant, { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const lines = (count) => {
        let html = '';
        for (let i = 0; i < count; i++) {
          html += '<div class="dx-skeleton-piece dx-skeleton-line' + (i === count - 1 ? ' is-short' : '') + '"></div>';
        }
        return html;
      };
      if (this.options.variant === 'avatar') {
        return '<div class="dx-skeleton-piece dx-skeleton-circle"></div><div class="dx-skeleton-group">' + lines(2) + '</div>';
      }
      if (this.options.variant === 'card') {
        return '<div class="dx-skeleton-piece dx-skeleton-block" style="height:' + this.options.height + 'px"></div>' + lines(this.options.lines);
      }
      return lines(this.options.lines);
    }

    ready() {
      this.el.classList.add('dx-skeleton', 'dx-skeleton--' + this.options.variant);
      this.el.setAttribute('aria-hidden', 'true');
      if (this.options.sheenAngle !== null) this.el.style.setProperty('--dx-skeleton-angle', this.options.sheenAngle + 'deg');
      if (this.options.sheenSpeed !== null) this.el.style.setProperty('--dx-skeleton-speed', this.options.sheenSpeed + 's');
      if (this.options.sheenColor) this.el.style.setProperty('--dx-skeleton-sheen', this.options.sheenColor);
      if (!this.el.querySelector('.dx-skeleton-piece')) this.el.innerHTML = this.markup();
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return Skeleton;
});

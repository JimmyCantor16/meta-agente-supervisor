Dixel.define('ProgressBar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ProgressBar extends Component {
    static defaults = {
      value: 0,
      max: 100,
      label: null,
      showValue: true,
      indeterminate: false
    };

    build() {
      const el = Utils.el('div', 'dx-progress');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const header = this.options.label || this.options.showValue
        ? '<div class="dx-progress-head">' +
          (this.options.label ? '<span class="dx-progress-label">' + this.options.label + '</span>' : '') +
          (this.options.showValue && !this.options.indeterminate ? '<span class="dx-progress-value">0%</span>' : '') +
          '</div>'
        : '';
      return header + '<div class="dx-progress-track"><span class="dx-progress-fill"></span></div>';
    }

    ready() {
      this.el.classList.add('dx-progress');
      if (!this.el.querySelector('.dx-progress-track')) this.el.innerHTML = this.markup();
      this.track = this.el.querySelector('.dx-progress-track');
      this.fill = this.el.querySelector('.dx-progress-fill');
      this.valueText = this.el.querySelector('.dx-progress-value');
      this.track.setAttribute('role', 'progressbar');
      this.track.setAttribute('aria-valuemin', '0');
      this.track.setAttribute('aria-valuemax', String(this.options.max));
      if (this.options.label) this.track.setAttribute('aria-label', this.options.label);
      if (this.options.indeterminate) {
        this.el.classList.add('is-indeterminate');
        this.whenVisible((visible) => {
          this.fill.classList.toggle('dx-anim-paused', !visible);
        });
        return;
      }
      this.set(this.options.value);
    }

    set(value) {
      const clamped = Utils.clamp(value, 0, this.options.max);
      const ratio = this.options.max ? clamped / this.options.max : 0;
      this.value = clamped;
      this.fill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
      this.track.setAttribute('aria-valuenow', String(Math.round(clamped)));
      if (this.valueText) this.valueText.textContent = Math.round(ratio * 100) + '%';
    }
  }

  return ProgressBar;
});

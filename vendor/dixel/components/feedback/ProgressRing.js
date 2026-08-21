Dixel.define('ProgressRing', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ProgressRing extends Component {
    static defaults = {
      value: 0,
      max: 100,
      size: 96,
      stroke: 8,
      showValue: true,
      label: 'Progreso'
    };

    build() {
      const el = Utils.el('div', 'dx-ring');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const size = this.options.size;
      const stroke = this.options.stroke;
      const radius = (size - stroke) / 2;
      this.circumference = 2 * Math.PI * radius;
      const gradientId = Utils.uid();
      const center = size / 2;
      const value = this.options.showValue ? '<span class="dx-ring-value">0%</span>' : '';
      return '<svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="var(--dx-primary)"/><stop offset="1" stop-color="var(--dx-cyan)"/>' +
        '</linearGradient></defs>' +
        '<circle class="dx-ring-track" cx="' + center + '" cy="' + center + '" r="' + radius + '" stroke-width="' + stroke + '"/>' +
        '<circle class="dx-ring-fill" cx="' + center + '" cy="' + center + '" r="' + radius + '" stroke-width="' + stroke +
        '" stroke="url(#' + gradientId + ')" stroke-dasharray="' + this.circumference.toFixed(2) +
        '" stroke-dashoffset="' + this.circumference.toFixed(2) + '" transform="rotate(-90 ' + center + ' ' + center + ')"/>' +
        '</svg>' + value;
    }

    ready() {
      this.el.classList.add('dx-ring');
      if (!this.el.querySelector('svg')) this.el.innerHTML = this.markup();
      if (this.circumference === undefined) {
        this.circumference = 2 * Math.PI * ((this.options.size - this.options.stroke) / 2);
      }
      this.el.style.setProperty('--dx-ring-size', this.options.size + 'px');
      this.fill = this.el.querySelector('.dx-ring-fill');
      this.valueText = this.el.querySelector('.dx-ring-value');
      this.el.setAttribute('role', 'progressbar');
      this.el.setAttribute('aria-label', this.options.label);
      this.el.setAttribute('aria-valuemin', '0');
      this.el.setAttribute('aria-valuemax', String(this.options.max));
      this.set(this.options.value);
    }

    set(value) {
      const clamped = Utils.clamp(value, 0, this.options.max);
      const ratio = this.options.max ? clamped / this.options.max : 0;
      this.value = clamped;
      this.fill.style.strokeDashoffset = (this.circumference * (1 - ratio)).toFixed(2);
      this.el.setAttribute('aria-valuenow', String(Math.round(clamped)));
      if (this.valueText) this.valueText.textContent = Math.round(ratio * 100) + '%';
    }
  }

  return ProgressRing;
});

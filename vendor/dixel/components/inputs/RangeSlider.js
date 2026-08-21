Dixel.define('RangeSlider', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  class RangeSlider extends Component {
    static defaults = {
      label: '',
      min: 0,
      max: 100,
      step: 1,
      value: 50,
      unit: '',
      onInput: null,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-slider dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        const head = Utils.el('div', 'dx-slider-head');
        head.appendChild(Utils.el('span', 'dx-slider-label', { text: this.options.label }));
        this.readout = Utils.el('span', 'dx-slider-readout');
        head.appendChild(this.readout);
        el.appendChild(head);
      }
      this.track = Utils.el('div', 'dx-slider-track');
      this.fill = Utils.el('span', 'dx-slider-fill', { 'aria-hidden': 'true' });
      this.thumb = Utils.el('span', 'dx-slider-thumb', { 'aria-hidden': 'true' });
      this.tip = Utils.el('span', 'dx-slider-tip');
      this.thumb.appendChild(this.tip);
      this.input = Utils.el('input', 'dx-slider-input', { type: 'range' });
      this.input.min = this.options.min;
      this.input.max = this.options.max;
      this.input.step = this.options.step;
      this.input.value = this.options.value;
      if (this.options.label) this.input.setAttribute('aria-label', this.options.label);
      this.track.appendChild(this.fill);
      this.track.appendChild(this.thumb);
      this.track.appendChild(this.input);
      el.appendChild(this.track);
    }

    ready() {
      if (!this.track) {
        this.el.classList.add('dx-slider', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.trackWidth = 0;
      this.thumbWidth = 0;
      this.listen(this.input, 'input', this.handleInput);
      this.listen(this.input, 'change', this.handleChange);
      this.listen(this.input, 'pointerdown', this.activate);
      this.listen(this.input, 'focus', this.activate);
      this.listen(this.input, 'pointerup', this.deactivate);
      this.listen(this.input, 'pointercancel', this.deactivate);
      this.listen(this.input, 'blur', this.deactivate);
      this.listen(window, 'resize', this.remeasure);
      this.whenVisible((isVisible) => {
        if (isVisible) this.remeasure();
      });
      this.remeasure();
    }

    activate() {
      this.el.classList.add('is-active');
    }

    deactivate() {
      this.el.classList.remove('is-active');
    }

    remeasure() {
      this.trackWidth = this.track.clientWidth;
      this.thumbWidth = this.thumb.offsetWidth;
      this.paint();
    }

    handleInput() {
      this.paint();
      if (this.options.onInput) this.options.onInput(this.value, this);
    }

    handleChange() {
      if (this.options.onChange) this.options.onChange(this.value, this);
    }

    paint() {
      const span = this.options.max - this.options.min || 1;
      const ratio = (this.value - this.options.min) / span;
      Motion.set(this.fill, { scaleX: ratio });
      Motion.set(this.thumb, { x: ratio * Math.max(this.trackWidth - this.thumbWidth, 0) });
      const text = this.value + this.options.unit;
      this.tip.textContent = text;
      if (this.readout) this.readout.textContent = text;
    }

    get value() {
      return Number(this.input.value);
    }

    set value(next) {
      this.input.value = next;
      this.paint();
    }
  }

  return RangeSlider;
});

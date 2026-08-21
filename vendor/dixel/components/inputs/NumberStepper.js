Dixel.define('NumberStepper', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const minusIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  const plusIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  class NumberStepper extends Component {
    static defaults = {
      label: '',
      value: 0,
      min: null,
      max: null,
      step: 1,
      name: '',
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-stepper dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-stepper-label', { text: this.options.label }));
      }
      const body = Utils.el('div', 'dx-stepper-body');
      this.minus = Utils.el('button', 'dx-stepper-btn dx-focusable', {
        type: 'button',
        'aria-label': 'Decrease',
        html: minusIcon
      });
      this.input = Utils.el('input', 'dx-stepper-value', { type: 'text', inputmode: 'decimal' });
      if (this.options.name) this.input.name = this.options.name;
      if (this.options.label) this.input.setAttribute('aria-label', this.options.label);
      this.plus = Utils.el('button', 'dx-stepper-btn dx-focusable', {
        type: 'button',
        'aria-label': 'Increase',
        html: plusIcon
      });
      body.appendChild(this.minus);
      body.appendChild(this.input);
      body.appendChild(this.plus);
      el.appendChild(body);
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-stepper', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.currentValue = this.clampValue(this.options.value);
      this.sync();
      this.listen(this.minus, 'click', () => this.step(-1));
      this.listen(this.plus, 'click', () => this.step(1));
      this.listen(this.input, 'change', this.commitTyped);
      this.listen(this.input, 'keydown', this.handleKeyDown);
    }

    handleKeyDown(event) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.step(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.step(-1);
      }
    }

    clampValue(raw) {
      let next = Number(raw);
      if (!Number.isFinite(next)) next = 0;
      if (this.options.min !== null) next = Math.max(next, this.options.min);
      if (this.options.max !== null) next = Math.min(next, this.options.max);
      const decimals = (String(this.options.step).split('.')[1] || '').length;
      return Number(next.toFixed(decimals));
    }

    step(direction) {
      const next = this.clampValue(this.currentValue + direction * this.options.step);
      if (next === this.currentValue) return;
      this.currentValue = next;
      this.sync();
      if (!Utils.reducedMotion) {
        Motion.fromTo(
          this.input,
          { y: direction > 0 ? 10 : -10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.3, ease: 'out' }
        );
      }
      if (this.options.onChange) this.options.onChange(this.currentValue, this);
    }

    commitTyped() {
      const next = this.clampValue(this.input.value);
      const changed = next !== this.currentValue;
      this.currentValue = next;
      this.sync();
      if (changed && this.options.onChange) this.options.onChange(this.currentValue, this);
    }

    sync() {
      this.input.value = this.currentValue;
      this.minus.disabled = this.options.min !== null && this.currentValue <= this.options.min;
      this.plus.disabled = this.options.max !== null && this.currentValue >= this.options.max;
    }

    get value() {
      return this.currentValue;
    }

    set value(next) {
      this.currentValue = this.clampValue(next);
      this.sync();
    }
  }

  return NumberStepper;
});

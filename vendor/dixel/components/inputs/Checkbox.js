Dixel.define('Checkbox', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const checkMarkup =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="dx-check-mark" d="M5 12.5l4.6 4.6L19 7.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  class Checkbox extends Component {
    static defaults = {
      label: 'Checkbox',
      checked: false,
      name: '',
      value: 'on',
      disabled: false,
      onChange: null
    };

    build() {
      const el = Utils.el('label', 'dx-check dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      this.input = Utils.el('input', 'dx-check-input', { type: 'checkbox' });
      if (this.options.name) this.input.name = this.options.name;
      this.input.value = this.options.value;
      this.input.checked = this.options.checked;
      this.input.disabled = this.options.disabled;
      this.box = Utils.el('span', 'dx-check-box', { html: checkMarkup, 'aria-hidden': 'true' });
      this.text = Utils.el('span', 'dx-check-text', { text: this.options.label });
      el.appendChild(this.input);
      el.appendChild(this.box);
      el.appendChild(this.text);
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-check', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.listen(this.input, 'change', this.handleChange);
    }

    handleChange() {
      if (this.input.checked && !Utils.reducedMotion) {
        Motion.fromTo(this.box, { scale: 0.75 }, { scale: 1, duration: 0.4, ease: 'outBack' });
      }
      if (this.options.onChange) this.options.onChange(this.input.checked, this);
    }

    get checked() {
      return this.input.checked;
    }

    set checked(next) {
      this.input.checked = next;
    }
  }

  return Checkbox;
});

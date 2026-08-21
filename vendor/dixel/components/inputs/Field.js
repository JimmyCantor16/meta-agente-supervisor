Dixel.define('Field', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Field extends Component {
    static defaults = {
      label: 'Label',
      name: '',
      value: '',
      helper: '',
      required: false,
      disabled: false,
      onInput: null,
      onChange: null
    };

    build() {
      const el = Utils.el('div', this.rootClassNames());
      this.populate(el);
      return el;
    }

    rootClassNames() {
      return 'dx-field dx-reset dx-motion';
    }

    populate(el) {
      this.controlId = Utils.uid();
      this.shell = Utils.el('div', 'dx-field-shell');
      this.control = this.buildControl();
      this.control.id = this.controlId;
      if (this.options.name) this.control.name = this.options.name;
      if (this.options.required) this.control.required = true;
      if (this.options.disabled) this.control.disabled = true;
      this.labelEl = Utils.el('label', 'dx-field-label', {
        for: this.controlId,
        text: this.options.label
      });
      this.message = Utils.el('p', 'dx-field-msg', { text: this.options.helper || '' });
      this.shell.appendChild(this.control);
      this.shell.appendChild(this.labelEl);
      el.appendChild(this.shell);
      this.decorate(el);
      el.appendChild(this.message);
    }

    buildControl() {
      const input = Utils.el('input', 'dx-field-input', { type: 'text' });
      input.value = this.options.value || '';
      return input;
    }

    decorate() {}

    ready() {
      if (!this.shell) {
        this.el.className += ' ' + this.rootClassNames();
        this.populate(this.el);
      }
      this.bindControl();
      this.refresh();
    }

    bindControl() {
      this.listen(this.control, 'input', this.handleInput);
      this.listen(this.control, 'change', this.handleChange);
    }

    handleInput() {
      this.refresh();
      if (this.options.onInput) this.options.onInput(this.value, this);
    }

    handleChange() {
      if (this.options.onChange) this.options.onChange(this.value, this);
    }

    refresh() {
      this.el.classList.toggle('is-filled', this.isFilled());
    }

    isFilled() {
      const current = this.value;
      return current !== null && current !== undefined && String(current).length > 0;
    }

    get value() {
      return this.control.value;
    }

    set value(next) {
      this.control.value = next;
      this.refresh();
    }

    setError(text) {
      this.el.classList.remove('is-success');
      this.el.classList.add('is-error');
      this.message.textContent = text || '';
      this.shake();
    }

    setSuccess(text) {
      this.el.classList.remove('is-error');
      this.el.classList.add('is-success');
      this.message.textContent = text || this.options.helper || '';
    }

    clearStatus() {
      this.el.classList.remove('is-error', 'is-success');
      this.message.textContent = this.options.helper || '';
    }

    shake() {
      if (Utils.reducedMotion) return;
      this.shell.classList.remove('dx-shake');
      void this.shell.offsetWidth;
      this.shell.classList.add('dx-shake');
    }
  }

  return Field;
});

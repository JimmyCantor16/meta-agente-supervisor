Dixel.define('CheckboxGroup', ['Component', 'Utils', 'Checkbox'], function (Component, Utils, Checkbox) {
  'use strict';

  class CheckboxGroup extends Component {
    static defaults = {
      label: '',
      name: null,
      items: [],
      values: [],
      inline: false,
      disabled: false,
      onChange: null
    };

    build() {
      return Utils.el('fieldset', 'dx-checkgroup');
    }

    ready() {
      this.el.classList.add('dx-checkgroup');
      if (this.options.inline) this.el.classList.add('dx-checkgroup--inline');
      if (this.options.label) {
        this.el.appendChild(Utils.el('legend', 'dx-checkgroup-legend', { text: this.options.label }));
      }
      this.selected = new Set(this.options.values);
      this.boxes = this.options.items.map((item) => {
        const label = typeof item === 'string' ? item : item.label;
        const value = typeof item === 'string' ? item : item.value;
        const box = new Checkbox({
          label,
          checked: this.selected.has(value),
          disabled: this.options.disabled,
          onChange: (checked) => {
            if (checked) this.selected.add(value);
            else this.selected.delete(value);
            if (this.options.onChange) this.options.onChange(this.values(), this);
          }
        }).mount(this.el);
        if (this.options.name) {
          const input = box.el.querySelector('input');
          if (input) {
            input.name = this.options.name;
            input.value = value;
          }
        }
        this.addCleanup(() => box.destroy());
        return { box, value };
      });
    }

    values() {
      return this.options.items
        .map((item) => (typeof item === 'string' ? item : item.value))
        .filter((value) => this.selected.has(value));
    }

    setValues(values) {
      this.selected = new Set(values);
      this.boxes.forEach((entry) => {
        const input = entry.box.el.querySelector('input');
        if (input) input.checked = this.selected.has(entry.value);
      });
    }
  }

  return CheckboxGroup;
});

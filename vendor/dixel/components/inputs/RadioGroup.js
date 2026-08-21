Dixel.define('RadioGroup', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  function normalize(items) {
    return items.map((item) =>
      typeof item === 'object' ? item : { value: String(item), label: String(item) }
    );
  }

  class RadioGroup extends Component {
    static defaults = {
      label: '',
      name: '',
      items: [],
      value: null,
      inline: false,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-radios dx-reset dx-motion', { role: 'radiogroup' });
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.inline) el.classList.add('dx-radios--inline');
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-radios-label', { text: this.options.label }));
        el.setAttribute('aria-label', this.options.label);
      }
      const groupName = this.options.name || Utils.uid();
      this.items = normalize(this.options.items);
      this.inputs = [];
      this.dots = [];
      this.items.forEach((item) => {
        const radio = Utils.el('label', 'dx-radio');
        const input = Utils.el('input', 'dx-radio-input', { type: 'radio' });
        input.name = groupName;
        input.value = item.value;
        input.checked = item.value === this.options.value;
        const dot = Utils.el('span', 'dx-radio-dot', { 'aria-hidden': 'true' });
        radio.appendChild(input);
        radio.appendChild(dot);
        radio.appendChild(Utils.el('span', 'dx-radio-text', { text: item.label }));
        el.appendChild(radio);
        this.inputs.push(input);
        this.dots.push(dot);
      });
    }

    ready() {
      if (!this.inputs) {
        this.el.classList.add('dx-radios', 'dx-reset', 'dx-motion');
        this.el.setAttribute('role', 'radiogroup');
        this.populate(this.el);
      }
      this.listen(this.el, 'change', this.handleChange);
    }

    handleChange(event) {
      const index = this.inputs.indexOf(event.target);
      if (index < 0) return;
      if (!Utils.reducedMotion) {
        Motion.fromTo(this.dots[index], { scale: 0.7 }, { scale: 1, duration: 0.4, ease: 'outBack' });
      }
      if (this.options.onChange) this.options.onChange(this.items[index].value, this);
    }

    get value() {
      const checked = this.inputs.find((input) => input.checked);
      return checked ? checked.value : null;
    }

    set value(next) {
      this.inputs.forEach((input) => {
        input.checked = input.value === next;
      });
    }
  }

  return RadioGroup;
});

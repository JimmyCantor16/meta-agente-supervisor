Dixel.define('Switch', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';


  class Switch extends Component {
    static defaults = {
      label: '',
      checked: false,
      name: '',
      disabled: false,
      elastic: true,
      onChange: null
    };

    thumbEase() {
      return this.options.elastic ? { duration: 0.55, ease: 'outElastic' } : { duration: 0.22, ease: 'out' };
    }

    build() {
      const el = Utils.el('label', 'dx-switch dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      this.input = Utils.el('input', 'dx-switch-input', { type: 'checkbox', role: 'switch' });
      if (this.options.name) this.input.name = this.options.name;
      this.input.checked = this.options.checked;
      this.input.disabled = this.options.disabled;
      this.track = Utils.el('span', 'dx-switch-track', { 'aria-hidden': 'true' });
      this.thumb = Utils.el('span', 'dx-switch-thumb');
      this.thumb.appendChild(Utils.el('span', 'dx-switch-core'));
      this.track.appendChild(this.thumb);
      el.appendChild(this.input);
      el.appendChild(this.track);
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-switch-text', { text: this.options.label }));
      }
    }

    travel() {
      if (this.travelPx === undefined) {
        const trackWidth = this.track.offsetWidth;
        const thumbWidth = this.thumb.offsetWidth;
        this.travelPx = trackWidth && thumbWidth ? trackWidth - thumbWidth - 4 : 20;
      }
      return this.travelPx;
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-switch', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      Motion.set(this.thumb, { x: this.input.checked ? this.travel() : 0 });
      this.listen(this.input, 'change', this.handleChange);
    }

    handleChange() {
      Motion.to(this.thumb, Object.assign({ x: this.input.checked ? this.travel() : 0 }, this.thumbEase()));
      if (this.options.onChange) this.options.onChange(this.input.checked, this);
    }

    get checked() {
      return this.input.checked;
    }

    set checked(next) {
      this.input.checked = next;
      Motion.to(this.thumb, Object.assign({ x: next ? this.travel() : 0 }, this.thumbEase()));
    }
  }

  return Switch;
});

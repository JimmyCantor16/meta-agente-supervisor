Dixel.define('PillToggle', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class PillToggle extends Component {
    static defaults = {
      options: ['One', 'Two'],
      value: 0,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-pill dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      this.indicator = Utils.el('span', 'dx-pill-indicator', { 'aria-hidden': 'true' });
      el.appendChild(this.indicator);
      this.buttons = this.options.options.map((label) => {
        const option = Utils.el('button', 'dx-pill-option dx-focusable', {
          type: 'button',
          text: label,
          'aria-pressed': 'false'
        });
        el.appendChild(option);
        return option;
      });
    }

    ready() {
      if (!this.indicator) {
        this.el.classList.add('dx-pill', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.index = -1;
      this.baseWidth = 0;
      this.listen(this.el, 'click', this.handleClick);
      this.listen(this.el, 'keydown', this.handleKeyDown);
      this.listen(window, 'resize', this.place);
      this.whenVisible((isVisible) => {
        if (isVisible) this.place();
      });
      this.select(this.options.value, true);
    }

    handleClick(event) {
      const option = event.target.closest('.dx-pill-option');
      if (!option) return;
      this.select(this.buttons.indexOf(option));
    }

    handleKeyDown(event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = Utils.clamp(this.index + step, 0, this.buttons.length - 1);
      this.select(next);
      this.buttons[next].focus();
    }

    select(index, silent) {
      if (index === this.index || index < 0 || index >= this.buttons.length) return;
      this.index = index;
      this.buttons.forEach((button, i) => {
        button.classList.toggle('is-selected', i === index);
        button.setAttribute('aria-pressed', String(i === index));
      });
      this.place();
      if (!silent && this.options.onChange) {
        this.options.onChange(this.options.options[index], index);
      }
    }

    place() {
      const option = this.buttons[this.index];
      if (!option) return;
      const rect = option.getBoundingClientRect();
      if (!rect.width) return;
      if (!this.baseWidth) {
        this.baseWidth = rect.width;
        this.indicator.style.width = rect.width + 'px';
      }
      const pillRect = this.el.getBoundingClientRect();
      const x = rect.left - pillRect.left - this.el.clientLeft + this.el.scrollLeft;
      this.indicator.style.transform =
        'translateX(' + x + 'px) scaleX(' + rect.width / this.baseWidth + ')';
    }

    get value() {
      return this.options.options[this.index];
    }
  }

  return PillToggle;
});

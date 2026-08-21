Dixel.define('PinInput', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  class PinInput extends Component {
    static defaults = {
      label: '',
      length: 4,
      numeric: true,
      name: '',
      onChange: null,
      onComplete: null
    };

    build() {
      const el = Utils.el('div', 'dx-pin dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-pin-label', { text: this.options.label }));
      }
      const row = Utils.el('div', 'dx-pin-row');
      this.cells = [];
      for (let i = 0; i < this.options.length; i++) {
        const cell = Utils.el('input', 'dx-pin-cell', {
          type: 'text',
          maxlength: '1',
          autocomplete: i === 0 ? 'one-time-code' : 'off',
          'aria-label': (this.options.label || 'Code') + ' ' + (i + 1)
        });
        if (this.options.numeric) cell.setAttribute('inputmode', 'numeric');
        row.appendChild(cell);
        this.cells.push(cell);
      }
      if (this.options.name) {
        this.hidden = Utils.el('input', '', { type: 'hidden' });
        this.hidden.name = this.options.name;
        row.appendChild(this.hidden);
      }
      el.appendChild(row);
    }

    ready() {
      if (!this.cells) {
        this.el.classList.add('dx-pin', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.cells.forEach((cell, index) => {
        this.listen(cell, 'input', () => this.handleInput(index));
        this.listen(cell, 'keydown', (event) => this.handleKeyDown(event, index));
        this.listen(cell, 'focus', () => cell.select());
        this.listen(cell, 'paste', (event) => this.handlePaste(event, index));
      });
    }

    sanitize(text) {
      return this.options.numeric ? text.replace(/\D/g, '') : text.trim();
    }

    handleInput(index) {
      const cell = this.cells[index];
      const clean = this.sanitize(cell.value);
      cell.value = clean.slice(-1);
      if (!cell.value) {
        this.emitChange();
        return;
      }
      if (!Utils.reducedMotion) {
        Motion.fromTo(cell, { y: -9, scale: 1.08 }, { y: 0, scale: 1, duration: 0.4, ease: 'outBack' });
      }
      if (index < this.cells.length - 1) this.cells[index + 1].focus();
      this.emitChange();
    }

    handleKeyDown(event, index) {
      if (event.key === 'Backspace' && !this.cells[index].value && index > 0) {
        event.preventDefault();
        this.cells[index - 1].value = '';
        this.cells[index - 1].focus();
        this.emitChange();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        this.cells[index - 1].focus();
      } else if (event.key === 'ArrowRight' && index < this.cells.length - 1) {
        event.preventDefault();
        this.cells[index + 1].focus();
      }
    }

    handlePaste(event, index) {
      event.preventDefault();
      const text = this.sanitize(event.clipboardData.getData('text'));
      if (!text) return;
      let cursor = index;
      for (const char of text) {
        if (cursor >= this.cells.length) break;
        this.cells[cursor].value = char;
        cursor++;
      }
      this.cells[Math.min(cursor, this.cells.length - 1)].focus();
      this.emitChange();
    }

    emitChange(silent) {
      const current = this.value;
      if (this.hidden) this.hidden.value = current;
      if (silent) return;
      if (this.options.onChange) this.options.onChange(current, this);
      if (current.length === this.cells.length) {
        if (!Utils.reducedMotion) {
          Motion.fromTo(
            this.cells,
            { y: -8 },
            { y: 0, duration: 0.45, ease: 'outBack', stagger: 0.05 }
          );
        }
        if (this.options.onComplete) this.options.onComplete(current, this);
      }
    }

    get value() {
      return this.cells.map((cell) => cell.value).join('');
    }

    set value(next) {
      const clean = this.sanitize(String(next));
      this.cells.forEach((cell, index) => {
        cell.value = clean[index] || '';
      });
      this.emitChange(true);
    }
  }

  return PinInput;
});

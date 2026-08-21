Dixel.define('TagInput', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const closeIcon =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  class TagInput extends Component {
    static defaults = {
      label: 'Tags',
      tags: [],
      max: null,
      name: '',
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-field dx-field--tags dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      const inputId = Utils.uid();
      this.tags = [];
      this.shell = Utils.el('div', 'dx-field-shell dx-tags-shell');
      this.input = Utils.el('input', 'dx-tags-input', { type: 'text', id: inputId });
      this.labelEl = Utils.el('label', 'dx-field-label', {
        for: inputId,
        text: this.options.label
      });
      this.shell.appendChild(this.input);
      this.shell.appendChild(this.labelEl);
      el.appendChild(this.shell);
      if (this.options.name) {
        this.hidden = Utils.el('input', '', { type: 'hidden' });
        this.hidden.name = this.options.name;
        el.appendChild(this.hidden);
      }
    }

    ready() {
      if (!this.shell) {
        this.el.classList.add('dx-field', 'dx-field--tags', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.options.tags.forEach((tag) => this.addTag(tag, false, true));
      this.listen(this.input, 'keydown', this.handleKeyDown);
      this.listen(this.input, 'input', this.refresh);
      this.listen(this.shell, 'click', this.handleShellClick);
      this.refresh();
    }

    handleShellClick(event) {
      const chipButton = event.target.closest('.dx-chip-x');
      if (chipButton) {
        this.removeTag(chipButton.closest('.dx-chip'));
        return;
      }
      this.input.focus();
    }

    handleKeyDown(event) {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        this.addTag(this.input.value, true);
        this.input.value = '';
        this.refresh();
      } else if (event.key === 'Backspace' && !this.input.value && this.tags.length) {
        this.removeTag(this.shell.querySelectorAll('.dx-chip')[this.tags.length - 1]);
      }
    }

    addTag(raw, animate, silent) {
      const text = String(raw || '').trim();
      if (!text || this.tags.includes(text)) return;
      if (this.options.max && this.tags.length >= this.options.max) return;
      const chip = Utils.el('span', 'dx-chip');
      chip.appendChild(Utils.el('span', 'dx-chip-text', { text }));
      chip.appendChild(
        Utils.el('button', 'dx-chip-x', {
          type: 'button',
          'aria-label': 'Remove ' + text,
          html: closeIcon
        })
      );
      this.shell.insertBefore(chip, this.input);
      this.tags.push(text);
      if (animate && !Utils.reducedMotion) {
        Motion.fromTo(chip, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'outBack' });
      }
      this.emitChange(silent);
    }

    removeTag(chip) {
      if (!chip) return;
      const text = chip.querySelector('.dx-chip-text').textContent;
      this.tags = this.tags.filter((tag) => tag !== text);
      Motion.to(chip, {
        scale: 0.5,
        opacity: 0,
        duration: 0.18,
        ease: 'out',
        onComplete: () => chip.remove()
      });
      this.emitChange();
    }

    emitChange(silent) {
      if (this.hidden) this.hidden.value = this.tags.join(',');
      this.refresh();
      if (!silent && this.options.onChange) this.options.onChange(this.tags.slice(), this);
    }

    refresh() {
      this.el.classList.toggle('is-filled', this.tags.length > 0 || this.input.value.length > 0);
    }

    get value() {
      return this.tags.slice();
    }
  }

  return TagInput;
});

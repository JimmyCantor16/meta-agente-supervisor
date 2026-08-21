Dixel.define('SelectField', ['Field', 'Motion', 'Utils'], function (Field, Motion, Utils) {
  'use strict';

  const chevronIcon =
    '<svg class="dx-select-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function normalize(items) {
    return items.map((item) =>
      typeof item === 'object' ? item : { value: String(item), label: String(item) }
    );
  }

  class SelectField extends Field {
    static defaults = Object.assign({}, Field.defaults, {
      label: 'Select',
      items: [],
      value: null
    });

    rootClassNames() {
      return super.rootClassNames() + ' dx-field--select';
    }

    buildControl() {
      const trigger = Utils.el('button', 'dx-field-input dx-select-trigger', {
        type: 'button',
        role: 'combobox',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false'
      });
      this.valueEl = Utils.el('span', 'dx-select-value');
      trigger.appendChild(this.valueEl);
      trigger.insertAdjacentHTML('beforeend', chevronIcon);
      return trigger;
    }

    decorate() {
      this.items = normalize(this.options.items);
      this.hidden = Utils.el('input', '', { type: 'hidden' });
      if (this.options.name) this.hidden.name = this.options.name;
      this.panel = Utils.el('div', 'dx-select-panel dx-scroll-thin', { role: 'listbox', id: Utils.uid() });
      this.control.setAttribute('aria-controls', this.panel.id);
      this.optionEls = this.items.map((item) => {
        const optionEl = Utils.el('div', 'dx-select-option', {
          role: 'option',
          id: Utils.uid(),
          text: item.label,
          'aria-selected': 'false'
        });
        this.panel.appendChild(optionEl);
        return optionEl;
      });
      this.shell.appendChild(this.panel);
      this.shell.appendChild(this.hidden);
    }

    ready() {
      super.ready();
      this.openState = false;
      this.activeIndex = -1;
      this.selectedIndex = -1;
      this.globalCleanups = [];
      Motion.set(this.panel, { y: -8, scale: 0.98, opacity: 0 });
      this.listen(this.control, 'click', this.togglePanel);
      this.listen(this.control, 'keydown', this.handleKeyDown);
      this.listen(this.panel, 'click', this.handlePanelClick);
      this.listen(this.panel, 'pointermove', this.handlePanelHover);
      this.listen(document, 'pointerdown', this.handleOutside);
      this.addCleanup(() => {
        this.releaseGlobal();
        if (this.panel && this.panel.parentNode === document.body) this.panel.remove();
      });
      if (this.options.value !== null) {
        const initial = this.items.findIndex((item) => item.value === this.options.value);
        if (initial >= 0) this.choose(initial, true);
      }
    }

    isFilled() {
      return this.selectedIndex >= 0;
    }

    get value() {
      return this.selectedIndex >= 0 ? this.items[this.selectedIndex].value : null;
    }

    set value(next) {
      const index = this.items.findIndex((item) => item.value === next);
      if (index >= 0) this.choose(index, true);
    }

    togglePanel() {
      if (this.openState) this.closePanel();
      else this.openPanel();
    }

    openPanel() {
      if (this.openState) return;
      this.openState = true;
      this.el.classList.add('is-open');
      this.panel.classList.add('is-open');
      this.control.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.panel);
      this.place();
      this.highlight(this.selectedIndex >= 0 ? this.selectedIndex : 0);
      Motion.to(this.panel, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'outBack' });
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.place(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.place(), { passive: true }));
    }

    closePanel() {
      if (!this.openState) return;
      this.openState = false;
      this.el.classList.remove('is-open');
      this.control.setAttribute('aria-expanded', 'false');
      this.control.removeAttribute('aria-activedescendant');
      this.releaseGlobal();
      Motion.to(this.panel, {
        y: -8,
        scale: 0.98,
        opacity: 0,
        duration: 0.22,
        ease: 'out',
        onComplete: () => {
          if (!this.openState) this.retractPanel();
        }
      });
    }

    retractPanel() {
      if (!this.shell || !this.panel) return;
      this.panel.classList.remove('is-open', 'is-up');
      this.panel.style.left = '';
      this.panel.style.top = '';
      this.panel.style.width = '';
      this.shell.appendChild(this.panel);
    }

    place() {
      if (!this.openState) return;
      const rect = this.control.getBoundingClientRect();
      this.panel.style.width = Math.round(rect.width) + 'px';
      const panelHeight = this.panel.offsetHeight;
      const spaceBelow = innerHeight - rect.bottom;
      const openUp = spaceBelow < panelHeight + 12 && rect.top > spaceBelow;
      this.panel.classList.toggle('is-up', openUp);
      const left = Utils.clamp(rect.left, 8, Math.max(8, innerWidth - rect.width - 8));
      const top = openUp ? rect.top - panelHeight - 6 : rect.bottom + 6;
      this.panel.style.left = Math.round(left) + 'px';
      this.panel.style.top = Math.round(top) + 'px';
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }

    handleOutside(event) {
      if (this.openState && !this.el.contains(event.target) && !this.panel.contains(event.target)) this.closePanel();
    }

    handlePanelClick(event) {
      const optionEl = event.target.closest('.dx-select-option');
      if (optionEl) this.choose(this.optionEls.indexOf(optionEl));
    }

    handlePanelHover(event) {
      const optionEl = event.target.closest('.dx-select-option');
      if (optionEl) this.highlight(this.optionEls.indexOf(optionEl));
    }

    handleKeyDown(event) {
      if (!this.openState) {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          this.openPanel();
        }
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.highlight(Utils.clamp(this.activeIndex + step, 0, this.items.length - 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.highlight(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        this.highlight(this.items.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.choose(this.activeIndex);
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        this.closePanel();
      }
    }

    highlight(index) {
      if (index < 0 || index >= this.optionEls.length) return;
      if (this.activeIndex >= 0) this.optionEls[this.activeIndex].classList.remove('is-active');
      this.activeIndex = index;
      const optionEl = this.optionEls[index];
      optionEl.classList.add('is-active');
      this.control.setAttribute('aria-activedescendant', optionEl.id);
      optionEl.scrollIntoView({ block: 'nearest' });
    }

    choose(index, silent) {
      if (index < 0 || index >= this.items.length) return;
      if (this.selectedIndex >= 0) {
        this.optionEls[this.selectedIndex].classList.remove('is-selected');
        this.optionEls[this.selectedIndex].setAttribute('aria-selected', 'false');
      }
      this.selectedIndex = index;
      const item = this.items[index];
      this.optionEls[index].classList.add('is-selected');
      this.optionEls[index].setAttribute('aria-selected', 'true');
      this.valueEl.textContent = item.label;
      this.hidden.value = item.value;
      this.refresh();
      this.closePanel();
      if (!silent && this.options.onChange) this.options.onChange(item.value, this);
    }
  }

  return SelectField;
});

Dixel.define('PickerBase', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const chevron = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const sheetQuery = matchMedia('(max-width: 520px)');

  class PickerBase extends Component {
    static defaults = {
      label: '',
      placeholder: 'Seleccionar',
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-picker');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const label = this.options.label ? '<span class="dx-picker-label">' + this.options.label + '</span>' : '';
      return label +
        '<button class="dx-picker-trigger dx-focusable" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="' + id + '">' +
        '<span class="dx-picker-value is-placeholder">' + this.options.placeholder + '</span>' +
        '<span class="dx-picker-caret" aria-hidden="true">' + this.triggerIcon() + '</span>' +
        '</button>' +
        '<div class="dx-picker-panel dx-scroll-thin" id="' + id + '" role="dialog" aria-label="' + (this.options.label || this.options.placeholder) + '">' +
        this.panelMarkup() +
        '</div>';
    }

    triggerIcon() {
      return chevron;
    }

    panelMarkup() {
      return '';
    }

    ready() {
      this.el.classList.add('dx-picker');
      if (!this.el.querySelector('.dx-picker-panel')) this.el.innerHTML = this.markup();
      this.trigger = this.el.querySelector('.dx-picker-trigger');
      this.valueEl = this.el.querySelector('.dx-picker-value');
      this.panel = this.el.querySelector('.dx-picker-panel');
      this.isOpen = false;
      this.globalCleanups = [];
      this.listen(this.trigger, 'click', this.toggle);
      this.addCleanup(() => {
        this.releaseGlobal();
        if (this.panel && this.panel.parentNode === document.body) this.panel.remove();
      });
      this.setupPanel();
    }

    setupPanel() {}

    onOpen() {}

    setDisplay(text) {
      if (text) {
        this.valueEl.textContent = text;
        this.valueEl.classList.remove('is-placeholder');
      } else {
        this.valueEl.textContent = this.options.placeholder;
        this.valueEl.classList.add('is-placeholder');
      }
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.sheet = sheetQuery.matches;
      this.el.classList.add('is-open');
      this.panel.classList.add('is-open');
      this.panel.classList.toggle('is-sheet', this.sheet);
      this.trigger.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.panel);
      this.positionPanel();
      const from = this.sheet
        ? { y: 40, opacity: 0 }
        : { scale: 0.94, y: this.panel.classList.contains('is-up') ? 6 : -6, opacity: 0 };
      Motion.fromTo(this.panel, from, { scale: 1, y: 0, opacity: 1, duration: 0.28, ease: 'outQuart' });
      this.globalCleanups.push(Utils.on(document, 'pointerdown', (event) => {
        if (!this.el.contains(event.target) && !this.panel.contains(event.target)) this.close();
      }));
      this.globalCleanups.push(Utils.on(document, 'keydown', (event) => {
        if (event.key !== 'Escape') return;
        this.close();
        this.trigger.focus();
      }));
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.positionPanel(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.positionPanel(), { passive: true }));
      this.onOpen();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.trigger.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      const to = this.sheet
        ? { y: 30, opacity: 0, duration: 0.16, ease: 'in' }
        : { scale: 0.96, opacity: 0, duration: 0.15, ease: 'in' };
      to.onComplete = () => {
        if (!this.isOpen) this.retractPanel();
      };
      Motion.to(this.panel, to);
    }

    retractPanel() {
      if (!this.el || !this.panel) return;
      this.el.classList.remove('is-open');
      this.panel.classList.remove('is-open', 'is-sheet', 'is-up');
      this.panel.style.left = '';
      this.panel.style.top = '';
      this.el.appendChild(this.panel);
    }

    positionPanel() {
      if (!this.isOpen || this.sheet) return;
      const rect = this.trigger.getBoundingClientRect();
      const panelWidth = this.panel.offsetWidth;
      const panelHeight = this.panel.offsetHeight;
      const spaceBelow = innerHeight - rect.bottom;
      const openUp = spaceBelow < panelHeight + 16 && rect.top > spaceBelow;
      this.panel.classList.toggle('is-up', openUp);
      const left = Utils.clamp(rect.left, 8, Math.max(8, innerWidth - panelWidth - 8));
      const top = openUp ? rect.top - panelHeight - 8 : rect.bottom + 8;
      this.panel.style.left = Math.round(left) + 'px';
      this.panel.style.top = Math.round(top) + 'px';
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }
  }

  return PickerBase;
});

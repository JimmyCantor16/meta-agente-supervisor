Dixel.define('Drawer', ['Component', 'Utils', 'Overlays'], function (Component, Utils, Overlays) {
  'use strict';

  const closeIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class Drawer extends Component {
    static defaults = {
      side: 'right',
      title: '',
      content: '',
      width: null
    };

    build() {
      const el = Utils.el('div', 'dx-drawer dx-drawer--' + this.options.side, { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const content = typeof this.options.content === 'string' ? this.options.content : '';
      return '<div class="dx-drawer-overlay"></div>' +
        '<aside class="dx-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
        '<header class="dx-drawer-head">' +
        '<h2 class="dx-drawer-title" id="' + id + '">' + Utils.escape(this.options.title) + '</h2>' +
        '<button class="dx-drawer-close dx-focusable" type="button" aria-label="Cerrar panel">' + closeIcon + '</button>' +
        '</header>' +
        '<div class="dx-drawer-body dx-scroll-thin">' + content + '</div>' +
        '</aside>';
    }

    ready() {
      this.el.classList.add('dx-drawer', 'dx-drawer--' + this.options.side);
      if (!this.el.querySelector('.dx-drawer-panel')) this.el.innerHTML = this.markup();
      this.el.setAttribute('aria-hidden', 'true');
      this.panel = this.el.querySelector('.dx-drawer-panel');
      this.overlay = this.el.querySelector('.dx-drawer-overlay');
      this.closeButton = this.el.querySelector('.dx-drawer-close');
      this.slot = this.el.querySelector('.dx-drawer-body');
      if (this.options.content && typeof this.options.content !== 'string') {
        Component.applyContent(this.options.content, this.slot, this);
      }
      if (this.options.width) this.panel.style.setProperty('--dx-drawer-w', this.options.width + 'px');
      this.isOpen = false;
      this.lastFocus = null;
      this.unbindKeys = null;
      this.previousOverflow = '';
      this.listen(this.overlay, 'click', this.close);
      this.listen(this.closeButton, 'click', this.close);
      this.addCleanup(() => this.releaseGlobal());
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.unlockScroll = Overlays.lock(this);
      this.popEscape = Overlays.pushEscape(() => this.close());
      this.unbindKeys = Utils.on(document, 'keydown', (event) => {
        if (event.key === 'Tab') this.trapFocus(event);
      });
      this.closeButton.focus();
    }

    trapFocus(event) {
      const focusables = Array.from(this.panel.querySelectorAll(focusableSelector));
      if (!focusables.length) {
        event.preventDefault();
        this.closeButton.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      this.releaseGlobal();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    releaseGlobal() {
      if (this.unbindKeys) {
        this.unbindKeys();
        this.unbindKeys = null;
      }
      if (this.popEscape) {
        this.popEscape();
        this.popEscape = null;
      }
      if (this.unlockScroll) {
        this.unlockScroll();
        this.unlockScroll = null;
      }
    }
  }

  return Drawer;
});

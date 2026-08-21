Dixel.define('Modal', ['Component', 'Utils', 'Overlays'], function (Component, Utils, Overlays) {
  'use strict';

  const closeIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class Modal extends Component {
    static defaults = {
      title: '',
      content: '',
      footer: '',
      dismissible: true
    };

    build() {
      const el = Utils.el('div', 'dx-modal', { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const content = typeof this.options.content === 'string' ? this.options.content : '';
      const footer = typeof this.options.footer === 'string' && this.options.footer
        ? '<footer class="dx-modal-foot">' + this.options.footer + '</footer>'
        : '';
      return '<div class="dx-modal-overlay"></div>' +
        '<div class="dx-modal-panel" role="dialog" aria-modal="true" aria-labelledby="' + id + '" tabindex="-1">' +
        '<header class="dx-modal-head">' +
        '<h2 class="dx-modal-title" id="' + id + '">' + Utils.escape(this.options.title) + '</h2>' +
        '<button class="dx-modal-close dx-focusable" type="button" aria-label="Cerrar diálogo">' + closeIcon + '</button>' +
        '</header>' +
        '<div class="dx-modal-body dx-scroll-thin">' + content + '</div>' +
        footer +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-modal');
      if (!this.el.querySelector('.dx-modal-panel')) this.el.innerHTML = this.markup();
      this.el.setAttribute('aria-hidden', 'true');
      this.panel = this.el.querySelector('.dx-modal-panel');
      this.overlay = this.el.querySelector('.dx-modal-overlay');
      this.closeButton = this.el.querySelector('.dx-modal-close');
      this.slot = this.el.querySelector('.dx-modal-body');
      if (this.options.content && typeof this.options.content !== 'string') {
        Component.applyContent(this.options.content, this.slot, this);
      }
      if (this.options.footer && typeof this.options.footer !== 'string') {
        this.slots.footer = Utils.el('footer', 'dx-modal-foot');
        this.panel.appendChild(this.slots.footer);
        Component.applyContent(this.options.footer, this.slots.footer, this);
      }
      this.isOpen = false;
      this.lastFocus = null;
      this.unbindKeys = null;
      this.previousOverflow = '';
      this.listen(this.closeButton, 'click', this.close);
      this.listen(this.overlay, 'click', () => {
        if (this.options.dismissible) this.close();
      });
      this.addCleanup(() => this.releaseGlobal());
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.unlockScroll = Overlays.lock(this);
      this.popEscape = this.options.dismissible ? Overlays.pushEscape(() => this.close()) : null;
      this.unbindKeys = Utils.on(document, 'keydown', (event) => {
        if (event.key === 'Tab') this.trapFocus(event);
      });
      const first = this.panel.querySelector(focusableSelector);
      (first || this.panel).focus();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      this.releaseGlobal();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    trapFocus(event) {
      const focusables = Array.from(this.panel.querySelectorAll(focusableSelector));
      if (!focusables.length) {
        event.preventDefault();
        this.panel.focus();
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

  return Modal;
});

Dixel.define('SearchField', ['TextField', 'Utils'], function (TextField, Utils) {
  'use strict';

  const searchIcon =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';
  const clearIcon =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  class SearchField extends TextField {
    static defaults = Object.assign({}, TextField.defaults, {
      label: 'Search',
      type: 'search',
      shortcut: '/'
    });

    rootClassNames() {
      return super.rootClassNames() + ' dx-field--search';
    }

    decorate() {
      this.shell.insertBefore(
        Utils.el('span', 'dx-field-lead', { html: searchIcon, 'aria-hidden': 'true' }),
        this.control
      );
      this.clear = Utils.el('button', 'dx-field-affix dx-field-clear', {
        type: 'button',
        'aria-label': 'Clear search',
        tabindex: '-1',
        html: clearIcon
      });
      this.shell.appendChild(this.clear);
      if (this.options.shortcut) {
        this.kbd = Utils.el('kbd', 'dx-field-kbd', {
          text: this.options.shortcut,
          'aria-hidden': 'true'
        });
        this.shell.appendChild(this.kbd);
      }
    }

    ready() {
      super.ready();
      this.listen(this.clear, 'click', this.clearValue);
      if (this.options.shortcut) this.listen(document, 'keydown', this.handleShortcut);
    }

    clearValue() {
      this.value = '';
      this.control.focus();
      this.control.dispatchEvent(new Event('input', { bubbles: true }));
    }

    handleShortcut(event) {
      if (event.key !== this.options.shortcut || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target === this.control) return;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      this.control.focus();
    }
  }

  return SearchField;
});

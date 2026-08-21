Dixel.define('Chip', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const closeIcon = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class Chip extends Component {
    static defaults = {
      label: 'Chip',
      icon: null,
      tone: 'neutral',
      removable: true,
      onRemove: null
    };

    build() {
      const el = Utils.el('span', 'dx-chip dx-chip--' + this.options.tone);
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const label = Utils.escape(this.options.label);
      const icon = this.options.icon ? '<span class="dx-chip-icon" aria-hidden="true">' + this.options.icon + '</span>' : '';
      const remove = this.options.removable
        ? '<button class="dx-chip-remove dx-focusable" type="button" aria-label="Quitar ' + label + '">' + closeIcon + '</button>'
        : '';
      return icon + '<span class="dx-chip-label">' + label + '</span>' + remove;
    }

    ready() {
      this.el.classList.add('dx-chip', 'dx-chip--' + this.options.tone);
      if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      this.removing = false;
      const removeButton = this.el.querySelector('.dx-chip-remove');
      if (removeButton) this.listen(removeButton, 'click', this.remove);
    }

    remove() {
      if (this.removing) return;
      this.removing = true;
      Motion.to(this.el, {
        scale: 0.5,
        opacity: 0,
        duration: 0.2,
        ease: 'in',
        onComplete: () => {
          if (this.options.onRemove) this.options.onRemove(this);
          this.destroy();
        }
      });
    }
  }

  return Chip;
});

Dixel.define('FabButton', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const plusIcon =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  class FabButton extends Component {
    static defaults = {
      label: 'Menu',
      icon: plusIcon,
      items: [],
      radius: 84,
      angleFrom: -90,
      angleTo: -180,
      fixed: false,
      onToggle: null
    };

    build() {
      const el = Utils.el('div', 'dx-fab dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.fixed) el.classList.add('dx-fab--fixed');
      this.itemEls = this.options.items.map((item) => {
        const itemEl = Utils.el('button', 'dx-fab-item dx-focusable', {
          type: 'button',
          html: item.icon || '',
          'aria-label': item.label || 'Action',
          title: item.label || ''
        });
        el.appendChild(itemEl);
        return itemEl;
      });
      this.iconEl = Utils.el('span', 'dx-fab-icon', { html: this.options.icon, 'aria-hidden': 'true' });
      this.main = Utils.el('button', 'dx-fab-main dx-focusable', {
        type: 'button',
        'aria-label': this.options.label,
        'aria-expanded': 'false'
      });
      this.main.appendChild(this.iconEl);
      el.appendChild(this.main);
    }

    ready() {
      if (!this.main) {
        this.el.classList.add('dx-fab', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.open = false;
      this.globalCleanups = [];
      this.layer = Utils.el('div', 'dx-fab-layer');
      this.itemEls.forEach((itemEl) => this.layer.appendChild(itemEl));
      Motion.set(this.itemEls, { scale: 0.4, opacity: 0 });
      this.listen(this.main, 'click', this.toggleMenu);
      this.listen(this.layer, 'click', this.handleItemClick);
      this.listen(document, 'pointerdown', this.handleOutside);
      this.listen(document, 'keydown', this.handleEscape);
      this.addCleanup(() => {
        this.releaseGlobal();
        this.layer.remove();
      });
    }

    handleItemClick(event) {
      const itemEl = event.target.closest('.dx-fab-item');
      if (!itemEl) return;
      const item = this.options.items[this.itemEls.indexOf(itemEl)];
      if (item && item.onClick) item.onClick(item);
      this.closeMenu();
    }

    handleOutside(event) {
      if (!this.open) return;
      if (this.el.contains(event.target) || this.layer.contains(event.target)) return;
      this.closeMenu();
    }

    handleEscape(event) {
      if (this.open && event.key === 'Escape') this.closeMenu();
    }

    toggleMenu() {
      if (this.open) this.closeMenu();
      else this.openMenu();
    }

    angleAt(index) {
      const count = Math.max(this.itemEls.length - 1, 1);
      const angle =
        this.options.angleFrom +
        ((this.options.angleTo - this.options.angleFrom) * index) / count;
      return (angle * Math.PI) / 180;
    }

    placeLayer() {
      const rect = this.main.getBoundingClientRect();
      this.layer.style.left = Math.round(rect.left + rect.width / 2) + 'px';
      this.layer.style.top = Math.round(rect.top + rect.height / 2) + 'px';
    }

    openMenu() {
      if (this.open) return;
      this.open = true;
      this.el.classList.add('is-open');
      this.layer.classList.add('is-open');
      this.main.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.layer);
      this.placeLayer();
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.placeLayer(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.placeLayer(), { passive: true }));
      Motion.to(this.iconEl, { rotate: 45, duration: 0.4, ease: 'outBack' });
      this.itemEls.forEach((itemEl, index) => {
        const angle = this.angleAt(index);
        Motion.to(itemEl, {
          x: Math.cos(angle) * this.options.radius,
          y: Math.sin(angle) * this.options.radius,
          scale: 1,
          opacity: 1,
          duration: 0.5,
          ease: 'outBack',
          delay: index * 0.045
        });
      });
      if (this.options.onToggle) this.options.onToggle(true);
    }

    closeMenu() {
      if (!this.open) return;
      this.open = false;
      this.el.classList.remove('is-open');
      this.layer.classList.remove('is-open');
      this.main.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      Motion.to(this.iconEl, { rotate: 0, duration: 0.35, ease: 'out' });
      const last = this.itemEls.length - 1;
      this.itemEls.forEach((itemEl, index) => {
        Motion.to(itemEl, {
          x: 0,
          y: 0,
          scale: 0.4,
          opacity: 0,
          duration: 0.3,
          ease: 'out',
          delay: (last - index) * 0.03,
          onComplete: index === 0
            ? () => {
                if (!this.open) this.layer.remove();
              }
            : undefined
        });
      });
      if (!this.itemEls.length) this.layer.remove();
      if (this.options.onToggle) this.options.onToggle(false);
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }
  }

  return FabButton;
});

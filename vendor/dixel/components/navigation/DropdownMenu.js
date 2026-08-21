Dixel.define('DropdownMenu', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const chevronDown = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const chevronRight = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  class DropdownMenu extends Component {
    static defaults = {
      label: 'Opciones',
      items: [],
      align: 'left',
      hoverOpenDelay: 0.08,
      hoverCloseDelay: 0.3
    };

    build() {
      const el = Utils.el('div', 'dx-dropdown dx-dropdown--' + this.options.align);
      el.innerHTML = this.markup();
      return el;
    }

    itemsMarkup(items, path) {
      return items
        .map((item, index) => {
          if (item.divider) return '<span class="dx-dropdown-divider" role="separator"></span>';
          const key = path ? path + '.' + index : String(index);
          const icon = item.icon ? '<span class="dx-dropdown-icon" aria-hidden="true">' + item.icon + '</span>' : '';
          const nested = !!(item.children && item.children.length);
          const caret = nested ? '<span class="dx-dropdown-caret" aria-hidden="true">' + chevronRight + '</span>' : '';
          const flags = (item.danger ? ' is-danger' : '') + (nested ? ' dx-dropdown-item--parent' : '');
          const expand = nested ? ' aria-haspopup="menu" aria-expanded="false"' : '';
          return '<button class="dx-dropdown-item' + flags + '" type="button" role="menuitem" tabindex="-1" data-path="' + key + '"' + expand + '>' +
            icon + '<span class="dx-dropdown-item-label">' + Utils.escape(item.label) + '</span>' + caret + '</button>';
        })
        .join('');
    }

    markup() {
      const id = Utils.uid();
      return '<button class="dx-dropdown-trigger dx-focusable" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="' + id + '">' +
        '<span>' + Utils.escape(this.options.label) + '</span>' + chevronDown + '</button>' +
        '<div class="dx-dropdown-menu dx-scroll-thin" id="' + id + '" role="menu">' + this.itemsMarkup(this.options.items, '') + '</div>';
    }

    ready() {
      this.el.classList.add('dx-dropdown', 'dx-dropdown--' + this.options.align);
      if (!this.el.querySelector('.dx-dropdown-menu')) this.el.innerHTML = this.markup();
      this.trigger = this.el.querySelector('.dx-dropdown-trigger');
      this.menu = this.el.querySelector('.dx-dropdown-menu');
      this.menu.classList.toggle('dx-dropdown-menu--right', this.options.align === 'right');
      this.isOpen = false;
      this.chain = [];
      this.hoverTimer = null;
      this.globalCleanups = [];
      this.rootCleanups = this.bindMenu(this.menu, 0);
      this.listen(this.trigger, 'click', this.toggle);
      this.listen(this.el, 'keydown', (event) => this.onKeydown(event, this.menu, 0));
      this.addCleanup(() => {
        this.clearHoverTimer();
        this.trimTo(0);
        this.releaseGlobal();
        this.rootCleanups.forEach((cleanup) => cleanup());
        if (this.menu && this.menu.parentNode === document.body) this.menu.remove();
      });
    }

    resolve(path) {
      let list = this.options.items;
      let item = null;
      path.split('.').forEach((part) => {
        item = list ? list[Number(part)] : null;
        list = item ? item.children : null;
      });
      return item;
    }

    bindMenu(menu, depth) {
      const cleanups = [];
      cleanups.push(Utils.on(menu, 'click', (event) => {
        const item = event.target.closest('.dx-dropdown-item');
        if (!item) return;
        if (item.hasAttribute('aria-haspopup')) {
          if (item.getAttribute('aria-expanded') === 'true') this.trimTo(depth);
          else this.openSubmenu(item, depth, false);
          return;
        }
        const config = this.resolve(item.getAttribute('data-path'));
        this.closeAll();
        this.trigger.focus();
        if (config && config.onSelect) config.onSelect(config);
      }));
      cleanups.push(Utils.on(menu, 'pointerenter', () => this.clearHoverTimer()));
      cleanups.push(Utils.on(menu, 'pointerover', (event) => {
        if (Utils.isTouch) return;
        const item = event.target.closest('.dx-dropdown-item');
        if (!item) return;
        this.clearHoverTimer();
        if (item.hasAttribute('aria-haspopup')) {
          if (item.getAttribute('aria-expanded') === 'true') return;
          this.hoverTimer = setTimeout(() => this.openSubmenu(item, depth, false), this.options.hoverOpenDelay * 1000);
        } else if (this.chain.length > depth) {
          this.hoverTimer = setTimeout(() => this.trimTo(depth), this.options.hoverCloseDelay * 1000);
        }
      }));
      cleanups.push(Utils.on(menu, 'keydown', (event) => this.onKeydown(event, menu, depth)));
      return cleanups;
    }

    onKeydown(event, menu, depth) {
      if (event.key === 'Escape' && this.isOpen) {
        this.closeAll();
        this.trigger.focus();
        return;
      }
      if (event.key === 'ArrowRight') {
        const item = document.activeElement;
        if (item && menu.contains(item) && item.hasAttribute('aria-haspopup')) {
          event.preventDefault();
          this.openSubmenu(item, depth, true);
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        if (depth < 1) return;
        event.preventDefault();
        const entry = this.chain[depth - 1];
        const parentItem = entry ? entry.parentItem : null;
        this.trimTo(depth - 1);
        if (parentItem) parentItem.focus();
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      if (!this.isOpen) {
        this.open();
        return;
      }
      const items = Array.from(menu.querySelectorAll('.dx-dropdown-item'));
      const focused = items.indexOf(document.activeElement);
      const next = focused === -1
        ? (direction === 1 ? 0 : items.length - 1)
        : (focused + direction + items.length) % items.length;
      if (items[next]) items[next].focus();
    }

    openSubmenu(item, depth, focusFirst) {
      this.clearHoverTimer();
      this.trimTo(depth);
      const config = this.resolve(item.getAttribute('data-path'));
      if (!config || !config.children || !config.children.length) return;
      const menu = Utils.el('div', 'dx-dropdown-menu dx-dropdown-submenu dx-scroll-thin', { role: 'menu' });
      menu.innerHTML = this.itemsMarkup(config.children, item.getAttribute('data-path'));
      const cleanups = this.bindMenu(menu, depth + 1);
      document.body.appendChild(menu);
      menu.classList.add('is-open');
      item.setAttribute('aria-expanded', 'true');
      item.classList.add('is-active');
      this.chain.push({ menu, parentItem: item, cleanups });
      const flipped = this.placeSubmenu(menu, item);
      Motion.fromTo(menu, { scale: 0.95, x: flipped ? 6 : -6, opacity: 0 }, { scale: 1, x: 0, opacity: 1, duration: 0.24, ease: 'outQuart' });
      if (focusFirst) {
        const first = menu.querySelector('.dx-dropdown-item');
        if (first) first.focus();
      }
    }

    placeSubmenu(menu, item) {
      const rect = item.getBoundingClientRect();
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      let left = rect.right + 6;
      const flipped = left + menuWidth > innerWidth - 8;
      if (flipped) left = Math.max(8, rect.left - menuWidth - 6);
      menu.classList.toggle('is-flip', flipped);
      const top = Utils.clamp(rect.top - 6, 8, Math.max(8, innerHeight - menuHeight - 8));
      menu.style.left = Math.round(left) + 'px';
      menu.style.top = Math.round(top) + 'px';
      return flipped;
    }

    trimTo(depth) {
      while (this.chain.length > depth) {
        const entry = this.chain.pop();
        entry.cleanups.forEach((cleanup) => cleanup());
        entry.parentItem.setAttribute('aria-expanded', 'false');
        entry.parentItem.classList.remove('is-active');
        const menu = entry.menu;
        Motion.to(menu, { opacity: 0, scale: 0.96, duration: 0.12, ease: 'in', onComplete: () => menu.remove() });
      }
    }

    clearHoverTimer() {
      if (this.hoverTimer) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
      }
    }

    toggle() {
      if (this.isOpen) this.closeAll();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.el.classList.add('is-open');
      this.menu.classList.add('is-open');
      this.trigger.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.menu);
      this.place();
      Motion.fromTo(this.menu, { scale: 0.92, y: -6, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.3, ease: 'outBack' });
      const items = Array.from(this.menu.querySelectorAll('.dx-dropdown-item'));
      if (items.length) {
        Motion.fromTo(items, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: 'outQuart', stagger: 0.035 });
        items[0].focus();
      }
      this.globalCleanups.push(Utils.on(document, 'pointerdown', (event) => {
        const target = event.target;
        const inside = this.el.contains(target) || this.menu.contains(target) ||
          this.chain.some((entry) => entry.menu.contains(target));
        if (!inside) this.closeAll();
      }));
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.reflow(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.reflow(), { passive: true }));
    }

    reflow() {
      this.trimTo(0);
      this.place();
    }

    closeAll() {
      this.clearHoverTimer();
      this.trimTo(0);
      this.close();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.trigger.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      Motion.to(this.menu, {
        scale: 0.95,
        y: -4,
        opacity: 0,
        duration: 0.16,
        ease: 'in',
        onComplete: () => {
          if (!this.isOpen) this.retractMenu();
        }
      });
    }

    retractMenu() {
      if (!this.el || !this.menu) return;
      this.el.classList.remove('is-open');
      this.menu.classList.remove('is-open', 'is-up');
      this.menu.style.left = '';
      this.menu.style.top = '';
      this.menu.style.minWidth = '';
      this.el.appendChild(this.menu);
    }

    place() {
      if (!this.isOpen) return;
      const rect = this.trigger.getBoundingClientRect();
      this.menu.style.minWidth = Math.round(Math.max(rect.width, 200)) + 'px';
      const menuWidth = this.menu.offsetWidth;
      const menuHeight = this.menu.offsetHeight;
      const spaceBelow = innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight + 16 && rect.top > spaceBelow;
      this.menu.classList.toggle('is-up', openUp);
      let left = this.options.align === 'right' ? rect.right - menuWidth : rect.left;
      left = Utils.clamp(left, 8, Math.max(8, innerWidth - menuWidth - 8));
      const top = openUp ? rect.top - menuHeight - 8 : rect.bottom + 8;
      this.menu.style.left = Math.round(left) + 'px';
      this.menu.style.top = Math.round(top) + 'px';
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }
  }

  return DropdownMenu;
});

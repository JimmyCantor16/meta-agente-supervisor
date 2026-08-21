Dixel.define('ContextMenu', ['Component', 'Utils', 'Motion', 'IconSet'], function (Component, Utils, Motion, IconSet) {
  'use strict';

  class ContextMenu extends Component {
    static defaults = {
      items: [],
      longPress: 450,
      onSelect: null
    };

    ready() {
      this.scope = this.el;
      this.menus = [];
      this.listen(this.scope, 'contextmenu', (event) => {
        event.preventDefault();
        this.openAt(event.clientX, event.clientY);
      });
      if (Utils.isTouch) this.bindLongPress();
      this.outsideHandler = (event) => {
        if (!this.menus.length) return;
        if (this.menus.some((menu) => menu.contains(event.target))) return;
        this.closeAll();
      };
      this.keyHandler = (event) => {
        if (event.key === 'Escape') this.closeAll();
      };
      this.addCleanup(Utils.on(document, 'pointerdown', this.outsideHandler));
      this.addCleanup(Utils.on(document, 'keydown', this.keyHandler));
      this.addCleanup(() => this.closeAll());
    }

    bindLongPress() {
      let timer = null;
      this.listen(this.scope, 'touchstart', (event) => {
        const touch = event.touches[0];
        timer = setTimeout(() => this.openAt(touch.clientX, touch.clientY), this.options.longPress);
      }, { passive: true });
      const cancel = () => clearTimeout(timer);
      this.listen(this.scope, 'touchend', cancel, { passive: true });
      this.listen(this.scope, 'touchmove', cancel, { passive: true });
    }

    iconMarkup(name) {
      if (!name || !IconSet[name]) return '';
      return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IconSet[name] + '</svg>';
    }

    buildMenu(items, depth) {
      const menu = Utils.el('div', 'dx-ctx');
      menu.setAttribute('role', 'menu');
      items.forEach((item) => {
        if (item.divider) {
          menu.appendChild(Utils.el('span', 'dx-ctx-divider'));
          return;
        }
        const row = Utils.el('button', 'dx-ctx-item' + (item.danger ? ' dx-ctx-item--danger' : '') + (item.disabled ? ' is-disabled' : ''), { type: 'button', role: 'menuitem' });
        row.innerHTML =
          this.iconMarkup(item.icon) +
          '<span class="dx-ctx-label">' + Utils.escape(item.label) + '</span>' +
          (item.hint ? '<kbd class="dx-ctx-hint">' + Utils.escape(item.hint) + '</kbd>' : '') +
          (item.children ? '<span class="dx-ctx-arrow">›</span>' : '');
        if (item.disabled) {
          row.disabled = true;
          row.setAttribute('aria-disabled', 'true');
        }
        if (!item.disabled) {
          if (item.children) {
            row.addEventListener('pointerenter', () => {
              this.closeFrom(depth + 1);
              const rect = row.getBoundingClientRect();
              this.spawn(this.buildMenu(item.children, depth + 1), rect.right - 4, rect.top - 6, depth + 1);
            });
          } else {
            row.addEventListener('pointerenter', () => this.closeFrom(depth + 1));
            row.addEventListener('click', () => {
              if (item.onClick) item.onClick(item, this);
              if (item.onSelect) item.onSelect(item, this);
              if (this.options.onSelect) this.options.onSelect(item, this);
              this.closeAll();
            });
          }
        }
        menu.appendChild(row);
      });
      return menu;
    }

    openAt(x, y) {
      this.closeAll();
      this.spawn(this.buildMenu(this.options.items, 0), x, y, 0);
    }

    spawn(menu, x, y, depth) {
      document.body.appendChild(menu);
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const left = Utils.clamp(x + width > innerWidth - 8 ? x - width : x, 8, innerWidth - width - 8);
      const top = Utils.clamp(y + height > innerHeight - 8 ? y - height : y, 8, innerHeight - height - 8);
      menu.style.left = Math.round(left) + 'px';
      menu.style.top = Math.round(top) + 'px';
      this.menus[depth] = menu;
      this.menus.length = depth + 1;
      Motion.fromTo(menu, { opacity: 0, scale: 0.92, y: -6 }, { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'outBack' });
      const first = menu.querySelector('.dx-ctx-item:not(.is-disabled)');
      if (first) first.focus();
    }

    closeFrom(depth) {
      for (let i = this.menus.length - 1; i >= depth; i--) {
        if (this.menus[i]) this.menus[i].remove();
      }
      this.menus.length = depth;
    }

    closeAll() {
      this.closeFrom(0);
    }
  }

  return ContextMenu;
});

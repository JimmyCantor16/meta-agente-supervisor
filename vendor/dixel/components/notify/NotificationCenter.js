Dixel.define('NotificationCenter', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const bellIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 9.5a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19a2.2 2.2 0 004 0"/></svg>';
  const icons = {
    info: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    success: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>',
    message: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-8 8H4l1.5-3A8 8 0 1121 12z"/></svg>'
  };
  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class NotificationCenter extends Component {
    static defaults = {
      notifications: [],
      label: 'Notificaciones',
      emptyTitle: 'Todo al día',
      emptyText: 'No tienes notificaciones nuevas.',
      markAllLabel: 'Marcar leídas',
      clearLabel: 'Limpiar',
      onRead: null,
      onClear: null
    };

    build() {
      const el = Utils.el('button', 'dx-notify-bell dx-focusable', {
        type: 'button',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'aria-label': this.options.label
      });
      el.innerHTML = bellIcon + '<span class="dx-notify-badge" aria-hidden="true">0</span>';
      return el;
    }

    ready() {
      this.el.classList.add('dx-notify-bell', 'dx-focusable');
      if (!this.el.querySelector('.dx-notify-badge')) {
        this.el.innerHTML = bellIcon + '<span class="dx-notify-badge" aria-hidden="true">0</span>';
      }
      this.badge = this.el.querySelector('.dx-notify-badge');
      this.isOpen = false;
      this.lastFocus = null;
      this.timeTimer = null;
      this.unbindKeys = null;
      this.unbindOutside = null;
      this.panel = this.buildPanel();
      document.body.appendChild(this.panel);
      this.list = this.panel.querySelector('.dx-notify-list');
      this.emptyEl = this.panel.querySelector('.dx-notify-empty');
      this.listen(this.el, 'click', () => this.toggle());
      this.listen(this.panel.querySelector('.dx-notify-markall'), 'click', () => this.markAllRead());
      this.listen(this.panel.querySelector('.dx-notify-clear'), 'click', () => this.clearAll());
      this.listen(this.panel.querySelector('.dx-notify-close'), 'click', () => this.close());
      this.listen(this.list, 'click', (event) => {
        const item = event.target.closest('.dx-notify-item');
        if (item) this.markRead(item);
      });
      this.listen(this.list, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const item = event.target.closest('.dx-notify-item');
        if (!item) return;
        event.preventDefault();
        this.markRead(item);
      });
      this.listen(window, 'resize', () => {
        if (this.isOpen) this.position();
      });
      (this.options.notifications || []).forEach((notification) => this.render(notification, true));
      this.toggleEmpty();
      this.updateBadge(false);
      this.addCleanup(() => {
        this.releaseGlobal();
        this.panel.remove();
      });
    }

    buildPanel() {
      const panel = Utils.el('div', 'dx-notify-panel dx-reset', {
        role: 'dialog',
        'aria-label': this.options.label,
        tabindex: '-1'
      });
      panel.innerHTML =
        '<header class="dx-notify-head"><h3 class="dx-notify-title">' + Utils.escape(this.options.label) + '</h3>' +
        '<div class="dx-notify-tools">' +
        '<button class="dx-notify-tool dx-notify-markall dx-focusable" type="button">' + Utils.escape(this.options.markAllLabel) + '</button>' +
        '<button class="dx-notify-tool dx-notify-clear dx-focusable" type="button">' + Utils.escape(this.options.clearLabel) + '</button>' +
        '<button class="dx-notify-close dx-focusable" type="button" aria-label="Cerrar panel">' + closeIcon + '</button>' +
        '</div></header>' +
        '<div class="dx-notify-list"></div>' +
        '<div class="dx-notify-empty"><span class="dx-notify-emptyicon" aria-hidden="true">' + icons.success + '</span>' +
        '<strong>' + Utils.escape(this.options.emptyTitle) + '</strong><span>' + Utils.escape(this.options.emptyText) + '</span></div>';
      return panel;
    }

    normalize(notification) {
      const minutes = notification.minutesAgo || 0;
      return {
        id: notification.id || Utils.uid(),
        type: icons[notification.type] ? notification.type : 'info',
        title: notification.title || '',
        text: notification.text || '',
        html: !!notification.html,
        at: notification.at || Date.now() - minutes * 60000,
        unread: notification.unread !== false
      };
    }

    render(notification, silent) {
      const data = this.normalize(notification);
      const item = Utils.el('article', 'dx-notify-item' + (data.unread ? ' is-unread' : ''), {
        tabindex: '0',
        'data-id': data.id,
        'data-at': data.at
      });
      item.innerHTML =
        '<span class="dx-notify-icon dx-notify-icon--' + data.type + '" aria-hidden="true">' + icons[data.type] + '</span>' +
        '<div class="dx-notify-body"><strong class="dx-notify-itemtitle">' + (data.html ? data.title : Utils.escape(data.title)) + '</strong>' +
        '<span class="dx-notify-itemtext">' + (data.html ? data.text : Utils.escape(data.text)) + '</span>' +
        '<time class="dx-notify-time">' + this.relative(data.at) + '</time></div>' +
        '<span class="dx-notify-dot" aria-hidden="true"></span>';
      if (silent) {
        this.list.appendChild(item);
      } else {
        this.list.prepend(item);
        Motion.fromTo(item, { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'out' });
      }
      return item;
    }

    push(notification) {
      const item = this.render(notification, false);
      this.toggleEmpty();
      this.updateBadge(true);
      return item;
    }

    relative(at) {
      const diff = Date.now() - Number(at);
      const minutes = Math.round(diff / 60000);
      if (minutes < 1) return 'ahora';
      if (minutes < 60) return 'hace ' + minutes + ' min';
      const hours = Math.round(minutes / 60);
      if (hours < 24) return 'hace ' + hours + ' h';
      const days = Math.round(hours / 24);
      if (days === 1) return 'hace 1 día';
      return 'hace ' + days + ' días';
    }

    refreshTimes() {
      this.list.querySelectorAll('.dx-notify-item').forEach((item) => {
        item.querySelector('.dx-notify-time').textContent = this.relative(item.getAttribute('data-at'));
      });
    }

    unreadCount() {
      return this.list.querySelectorAll('.dx-notify-item.is-unread').length;
    }

    updateBadge(pop) {
      const count = this.unreadCount();
      this.badge.textContent = count > 99 ? '99+' : String(count);
      this.el.classList.toggle('has-unread', count > 0);
      this.el.setAttribute('aria-label', this.options.label + (count ? ', ' + count + ' sin leer' : ''));
      if (pop && count > 0) Motion.fromTo(this.badge, { scale: 0.4 }, { scale: 1, duration: 0.4, ease: 'outBack' });
    }

    toggleEmpty() {
      this.emptyEl.classList.toggle('is-visible', !this.list.children.length);
    }

    markRead(item) {
      if (!item.classList.contains('is-unread')) return;
      item.classList.remove('is-unread');
      const dot = item.querySelector('.dx-notify-dot');
      Motion.to(dot, { scale: 0, opacity: 0, duration: 0.25, ease: 'in' });
      this.updateBadge(false);
      if (this.options.onRead) this.options.onRead(item.getAttribute('data-id'));
    }

    markAllRead() {
      this.list.querySelectorAll('.dx-notify-item.is-unread').forEach((item) => this.markRead(item));
    }

    clearAll() {
      if (this.clearing) return;
      const items = Array.from(this.list.children);
      if (!items.length) return;
      this.clearing = true;
      Motion.to(items, {
        x: 36,
        opacity: 0,
        duration: 0.25,
        ease: 'in',
        stagger: 0.04,
        onComplete: () => {
          this.clearing = false;
          items.forEach((item) => item.remove());
          this.toggleEmpty();
          this.updateBadge(false);
        }
      });
      if (this.options.onClear) this.options.onClear();
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.setAttribute('aria-expanded', 'true');
      const mobile = this.position();
      this.panel.classList.add('is-open');
      this.refreshTimes();
      this.scheduleRefresh();
      Motion.fromTo(this.panel, { y: mobile ? 28 : -10, scale: mobile ? 1 : 0.98, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'out' });
      this.panel.focus({ preventScroll: true });
      this.unbindKeys = Utils.on(document, 'keydown', (event) => {
        if (event.key === 'Escape') this.close();
        else if (event.key === 'Tab') this.trapFocus(event);
      });
      this.unbindOutside = Utils.on(document, 'pointerdown', (event) => {
        if (!this.panel.contains(event.target) && !this.el.contains(event.target)) this.close();
      });
    }

    position() {
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const mobile = viewW < 640;
      this.panel.classList.toggle('dx-notify-panel--sheet', mobile);
      if (mobile) {
        this.panel.style.left = '';
        this.panel.style.top = '';
        return true;
      }
      const bellRect = this.el.getBoundingClientRect();
      const panelW = this.panel.offsetWidth;
      const panelH = this.panel.offsetHeight;
      const x = Utils.clamp(bellRect.right - panelW, 12, Math.max(viewW - panelW - 12, 12));
      let y = bellRect.bottom + 10;
      if (y + panelH > viewH - 12) y = Math.max(bellRect.top - panelH - 10, 12);
      this.panel.style.left = Math.round(x) + 'px';
      this.panel.style.top = Math.round(y) + 'px';
      return false;
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      const panel = this.panel;
      const mobile = panel.classList.contains('dx-notify-panel--sheet');
      Motion.to(panel, {
        y: mobile ? 28 : -10,
        opacity: 0,
        duration: 0.2,
        ease: 'in',
        onComplete: () => panel.classList.remove('is-open')
      });
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    scheduleRefresh() {
      this.timeTimer = setTimeout(() => {
        this.refreshTimes();
        this.scheduleRefresh();
      }, 60000);
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
      if (event.shiftKey && (document.activeElement === first || document.activeElement === this.panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!this.panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    releaseGlobal() {
      clearTimeout(this.timeTimer);
      this.timeTimer = null;
      if (this.unbindKeys) {
        this.unbindKeys();
        this.unbindKeys = null;
      }
      if (this.unbindOutside) {
        this.unbindOutside();
        this.unbindOutside = null;
      }
    }
  }

  return NotificationCenter;
});

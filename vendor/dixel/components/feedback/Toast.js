Dixel.define('Toast', ['Component', 'Motion', 'Ticker', 'Utils'], function (Component, Motion, Ticker, Utils) {
  'use strict';

  const icons = {
    info: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    success: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>'
  };

  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class Toast extends Component {
    static defaults = {
      position: 'bottom-right',
      duration: 4.5,
      max: 5
    };

    build() {
      return Utils.el('div', 'dx-toasts dx-toasts--' + this.options.position, { 'aria-live': 'polite' });
    }

    ready() {
      this.el.classList.add('dx-toasts', 'dx-toasts--' + this.options.position);
      if (!this.el.getAttribute('aria-live')) this.el.setAttribute('aria-live', 'polite');
      this.active = new Map();
      this.fromTop = this.options.position.indexOf('top') === 0;
      this.addCleanup(() => {
        this.active.forEach((stop) => stop());
        this.active.clear();
      });
    }

    push(config) {
      const settings = Object.assign({ type: 'info', title: '', message: '', duration: this.options.duration }, config);
      while (this.active.size >= this.options.max) {
        this.dismiss(this.active.keys().next().value, true);
      }
      const toast = Utils.el('div', 'dx-toast dx-toast--' + settings.type, { role: 'status' });
      const safeTitle = settings.html ? settings.title : Utils.escape(settings.title);
      const safeMessage = settings.html ? settings.message : Utils.escape(settings.message);
      const title = settings.title ? '<strong class="dx-toast-title">' + safeTitle + '</strong>' : '';
      const message = settings.message ? '<span class="dx-toast-message">' + safeMessage + '</span>' : '';
      const action = settings.action && settings.action.label
        ? '<button class="dx-toast-action dx-focusable" type="button">' + Utils.escape(settings.action.label) + '</button>'
        : '';
      toast.innerHTML =
        '<span class="dx-toast-icon" aria-hidden="true">' + (icons[settings.type] || icons.info) + '</span>' +
        '<div class="dx-toast-content">' + title + message + action + '</div>' +
        '<button class="dx-toast-close dx-focusable" type="button" aria-label="Cerrar notificación">' + closeIcon + '</button>' +
        '<span class="dx-toast-life"><span class="dx-toast-life-fill"></span></span>';
      this.el.appendChild(toast);
      Motion.fromTo(toast, { y: this.fromTop ? -18 : 18, scale: 0.94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'outBack' });
      const fill = toast.querySelector('.dx-toast-life-fill');
      let elapsed = 0;
      let paused = false;
      const stop = Ticker.add((time, delta) => {
        if (paused) return;
        elapsed += delta;
        const progress = Math.min(elapsed / settings.duration, 1);
        fill.style.transform = 'scaleX(' + (1 - progress).toFixed(4) + ')';
        if (progress >= 1) this.dismiss(toast);
      });
      this.active.set(toast, stop);
      toast.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') paused = true; });
      toast.addEventListener('pointerleave', () => { paused = false; });
      toast.querySelector('.dx-toast-close').addEventListener('click', () => this.dismiss(toast));
      const actionButton = toast.querySelector('.dx-toast-action');
      if (actionButton) {
        actionButton.addEventListener('click', () => {
          if (settings.action.onClick) settings.action.onClick(toast, this);
          if (settings.action.dismiss !== false) this.dismiss(toast);
        });
      }
      return toast;
    }

    dismiss(toast, immediate) {
      if (!toast || !this.active.has(toast)) return;
      this.active.get(toast)();
      this.active.delete(toast);
      if (immediate) {
        toast.remove();
        return;
      }
      Motion.to(toast, {
        x: 28,
        opacity: 0,
        duration: 0.22,
        ease: 'in',
        onComplete: () => toast.remove()
      });
    }

    info(config) {
      return this.push(Object.assign({}, config, { type: 'info' }));
    }

    success(config) {
      return this.push(Object.assign({}, config, { type: 'success' }));
    }

    warning(config) {
      return this.push(Object.assign({}, config, { type: 'warning' }));
    }

    danger(config) {
      return this.push(Object.assign({}, config, { type: 'danger' }));
    }
  }

  return Toast;
});

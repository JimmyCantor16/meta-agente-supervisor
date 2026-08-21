Dixel.define('EmptyState', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const defaultIcon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7z"/><path d="M4 8.5l8 4.5 8-4.5M12 13v7"/></svg>';

  class EmptyState extends Component {
    static defaults = {
      icon: defaultIcon,
      title: 'Nada por aquí',
      description: '',
      actionLabel: null,
      onAction: null
    };

    build() {
      const el = Utils.el('section', 'dx-empty');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const description = this.options.description ? '<p class="dx-empty-desc">' + Utils.escape(this.options.description) + '</p>' : '';
      const action = this.options.actionLabel
        ? '<button class="dx-empty-action dx-focusable" type="button">' + Utils.escape(this.options.actionLabel) + '</button>'
        : '';
      return '<div class="dx-empty-icon" aria-hidden="true">' + this.options.icon + '</div>' +
        '<h3 class="dx-empty-title">' + Utils.escape(this.options.title) + '</h3>' +
        description + action;
    }

    ready() {
      this.el.classList.add('dx-empty');
      if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      const action = this.el.querySelector('.dx-empty-action');
      if (action && this.options.onAction) this.listen(action, 'click', this.options.onAction);
      this.revealed = false;
      this.whenVisible((visible) => {
        if (!visible || this.revealed) return;
        this.revealed = true;
        Motion.fromTo(this.el.children, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'outQuart', stagger: 0.08 });
      });
    }
  }

  return EmptyState;
});

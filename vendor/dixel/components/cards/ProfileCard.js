Dixel.define('ProfileCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  class ProfileCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      name: '',
      role: '',
      bio: '',
      avatar: null,
      initials: '',
      stats: [],
      actionLabel: null,
      onAction: null
    });

    build() {
      const el = Utils.el('article', 'dx-card dx-card--hover dx-profile');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const name = Utils.escape(this.options.name);
      const avatar = this.options.avatar
        ? '<img src="' + Utils.escape(this.options.avatar) + '" alt="' + name + '">'
        : '<span>' + Utils.escape(this.options.initials) + '</span>';
      const bio = this.options.bio ? '<p class="dx-profile-bio">' + Utils.escape(this.options.bio) + '</p>' : '';
      const stats = this.options.stats.length
        ? '<div class="dx-profile-stats">' +
          this.options.stats
            .map((stat) => '<div class="dx-profile-stat"><strong>' + Utils.escape(stat.value) + '</strong><span>' + Utils.escape(stat.label) + '</span></div>')
            .join('') +
          '</div>'
        : '';
      const action = this.options.actionLabel
        ? '<button type="button" class="dx-profile-action dx-focusable">' + Utils.escape(this.options.actionLabel) + '</button>'
        : '';
      return '<div class="dx-profile-cover"></div>' +
        '<div class="dx-profile-avatar">' + avatar + '</div>' +
        '<h3 class="dx-profile-name">' + name + '</h3>' +
        '<span class="dx-profile-role">' + Utils.escape(this.options.role) + '</span>' +
        bio + stats + action;
    }

    ready() {
      if (!this.el.classList.contains('dx-profile')) {
        this.el.className += (this.el.className ? ' ' : '') + 'dx-card dx-card--hover dx-profile';
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
      const action = this.el.querySelector('.dx-profile-action');
      if (action && this.options.onAction) this.listen(action, 'click', this.options.onAction);
    }
  }

  return ProfileCard;
});

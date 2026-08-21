Dixel.define('Navbar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Navbar extends Component {
    static defaults = {
      brand: 'DIXEL',
      href: '#',
      links: [],
      actions: '',
      hideOnScroll: true,
      glassAt: 24
    };

    build() {
      const el = Utils.el('header', 'dx-navbar');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const links = this.options.links
        .map((link) => '<a class="dx-navbar-link" href="' + Utils.escape(link.href) + '">' + Utils.escape(link.label) + '</a>')
        .join('');
      return '<div class="dx-navbar-inner">' +
        '<a class="dx-navbar-brand" href="' + Utils.escape(this.options.href) + '">' + Utils.escape(this.options.brand) + '</a>' +
        '<nav class="dx-navbar-links" aria-label="Principal">' + links + '</nav>' +
        '<div class="dx-navbar-actions">' + this.options.actions + '</div>' +
        '<button class="dx-navbar-burger dx-focusable" type="button" aria-label="Abrir menú" aria-expanded="false"><span></span><span></span></button>' +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-navbar');
      if (!this.el.querySelector('.dx-navbar-inner')) this.el.innerHTML = this.markup();
      this.burger = this.el.querySelector('.dx-navbar-burger');
      this.menuOpen = false;
      this.hidden = false;
      this.glass = false;
      this.lastY = window.scrollY;
      if (this.burger) this.listen(this.burger, 'click', this.toggleMenu);
      this.listen(this.el, 'click', (event) => {
        if (this.menuOpen && event.target.closest('.dx-navbar-link')) this.setMenu(false);
      });
      this.listen(window, 'scroll', this.onScroll, { passive: true });
      this.onScroll();
    }

    onScroll() {
      const y = window.scrollY;
      const glass = y > this.options.glassAt;
      if (glass !== this.glass) {
        this.glass = glass;
        this.el.classList.toggle('is-glass', glass);
      }
      if (this.options.hideOnScroll && !this.menuOpen) {
        if (y > this.lastY + 6 && y > 90) this.setHidden(true);
        else if (y < this.lastY - 6 || y <= 90) this.setHidden(false);
      }
      this.lastY = y;
    }

    setHidden(hidden) {
      if (hidden === this.hidden) return;
      this.hidden = hidden;
      this.el.classList.toggle('is-hidden', hidden);
    }

    toggleMenu() {
      this.setMenu(!this.menuOpen);
    }

    setMenu(open) {
      this.menuOpen = open;
      this.el.classList.toggle('is-open', open);
      if (this.burger) {
        this.burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      }
      if (open) this.setHidden(false);
    }
  }

  return Navbar;
});

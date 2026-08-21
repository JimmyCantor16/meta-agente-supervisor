Dixel.define('SmoothAnchorNav', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class SmoothAnchorNav extends Component {
    static defaults = { offset: 0, line: 0.35 };

    ready() {
      this.el.classList.add('dx-anchor-nav');
      this.items = [];
      this.el.querySelectorAll('a[href^="#"]').forEach((link) => {
        const id = decodeURIComponent(link.getAttribute('href').slice(1));
        const section = document.getElementById(id);
        if (section) this.items.push({ link, section, top: 0 });
      });
      this.lastY = -1;
      this.current = null;
      this.viewHeight = innerHeight;
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.listen(this.el, 'click', this.onClick);
      if (this.items.length) this.onFrame(this.update);
    }

    measure() {
      const scrolled = window.scrollY;
      this.viewHeight = innerHeight;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        item.top = item.section.getBoundingClientRect().top + scrolled;
      }
      this.lastY = -1;
    }

    onClick(event) {
      const link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
      if (!link || !this.el.contains(link)) return;
      let item = null;
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].link === link) item = this.items[i];
      }
      if (!item) return;
      event.preventDefault();
      const top = item.section.getBoundingClientRect().top + window.scrollY - this.options.offset;
      window.scrollTo({ top, behavior: Utils.reducedMotion ? 'auto' : 'smooth' });
    }

    update() {
      const y = window.scrollY;
      if (y === this.lastY) return;
      this.lastY = y;
      const line = y + this.viewHeight * this.options.line;
      let active = this.items[0];
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].top <= line) active = this.items[i];
      }
      if (active === this.current) return;
      if (this.current) this.current.link.classList.remove('is-active');
      this.current = active;
      this.current.link.classList.add('is-active');
    }
  }

  return SmoothAnchorNav;
});

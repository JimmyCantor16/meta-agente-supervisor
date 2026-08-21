Dixel.define('ScrollSpyDots', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ScrollSpyDots extends Component {
    static defaults = {
      sections: 'section[id]',
      offset: 0.35
    };

    build() {
      return Utils.el('nav', 'dx-spydots', { 'aria-label': 'Secciones' });
    }

    ready() {
      this.el.classList.add('dx-spydots');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', 'Secciones');
      this.sections = Array.from(document.querySelectorAll(this.options.sections));
      this.tops = [];
      this.active = -1;
      if (!this.el.children.length) this.render();
      this.dots = Array.from(this.el.querySelectorAll('.dx-spydots-dot'));
      this.listen(this.el, 'click', (event) => {
        const dot = event.target.closest('.dx-spydots-dot');
        if (!dot) return;
        this.scrollToSection(Number(dot.getAttribute('data-index')));
      });
      this.listen(window, 'scroll', this.update, { passive: true });
      this.listen(window, 'resize', this.measure, { passive: true });
      this.listen(window, 'load', this.measure);
      this.measure();
    }

    labelFor(section) {
      return section.getAttribute('data-spy-label') || section.id || 'Sección';
    }

    render() {
      this.el.innerHTML = this.sections
        .map((section, index) =>
          '<button class="dx-spydots-dot dx-focusable" type="button" data-index="' + index +
          '" aria-label="' + Utils.escape(this.labelFor(section)) + '">' +
          '<span class="dx-spydots-label" aria-hidden="true">' + Utils.escape(this.labelFor(section)) + '</span>' +
          '<span class="dx-spydots-point" aria-hidden="true"></span>' +
          '</button>')
        .join('');
    }

    measure() {
      const scrollY = window.scrollY;
      this.tops = this.sections.map((section) => section.getBoundingClientRect().top + scrollY);
      this.update();
    }

    update() {
      if (!this.tops.length) return;
      const line = window.scrollY + innerHeight * this.options.offset;
      let index = 0;
      for (let i = 0; i < this.tops.length; i++) {
        if (this.tops[i] <= line) index = i;
      }
      if (index === this.active) return;
      this.active = index;
      this.dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    scrollToSection(index) {
      const top = this.tops[index];
      if (top === undefined) return;
      window.scrollTo({ top, behavior: Utils.reducedMotion ? 'auto' : 'smooth' });
    }
  }

  return ScrollSpyDots;
});

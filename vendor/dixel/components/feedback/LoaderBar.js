Dixel.define('LoaderBar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderBar extends Component {
    static defaults = {
      fixed: true,
      color: 'primary'
    };

    build() {
      const el = Utils.el('div', 'dx-loadbar', { role: 'progressbar', 'aria-hidden': 'true', 'aria-label': 'Cargando' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadbar-runner"></span>';
    }

    ready() {
      this.el.classList.add('dx-loadbar');
      if (!this.el.querySelector('.dx-loadbar-runner')) this.el.innerHTML = this.markup();
      this.el.classList.toggle('dx-loadbar--fixed', !!this.options.fixed);
      this.el.style.setProperty('--dx-loadbar-color', 'var(--dx-' + this.options.color + ')');
      this.runner = this.el.querySelector('.dx-loadbar-runner');
      this.active = false;
      this.doneTimer = null;
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
      this.addCleanup(() => {
        if (this.doneTimer) clearTimeout(this.doneTimer);
      });
    }

    start() {
      if (this.doneTimer) {
        clearTimeout(this.doneTimer);
        this.doneTimer = null;
      }
      this.active = true;
      this.el.classList.remove('is-done');
      this.el.classList.add('is-active');
      this.el.setAttribute('aria-hidden', 'false');
    }

    done() {
      if (!this.active) return;
      this.active = false;
      this.el.classList.add('is-done');
      this.doneTimer = setTimeout(() => {
        this.el.classList.remove('is-active', 'is-done');
        this.el.setAttribute('aria-hidden', 'true');
        this.doneTimer = null;
      }, 450);
    }
  }

  return LoaderBar;
});

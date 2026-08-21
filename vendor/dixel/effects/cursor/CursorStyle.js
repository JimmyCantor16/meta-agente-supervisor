Dixel.define('CursorStyle', ['Component', 'Pointer', 'Icon', 'Utils'], function (Component, Pointer, Icon, Utils) {
  'use strict';

  const stateIcons = { pointer: 'target', grab: 'move', text: 'type', zoom: 'zoomIn' };

  class CursorStyle extends Component {
    static defaults = {
      icon: 'navigation',
      size: 22,
      strokeWidth: 2,
      tint: 'primary',
      rotate: false,
      scope: null,
      states: null
    };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.scope = this.resolveScope();
      this.states = Object.assign({}, stateIcons, this.options.states || {});
      this.current = null;
      this.icon = Utils.el('div', 'dx-cursor-style dx-cursor-style--' + this.options.tint);
      this.el.appendChild(this.icon);
      this.swap(this.options.icon);
      this.angle = 0;
      this.scope.classList.add('dx-cursor-hide');
      this.addCleanup(() => this.scope.classList.remove('dx-cursor-hide'));
      this.addCleanup(Pointer.use());
      const global = this.scope === document.documentElement;
      const edge = global ? document.documentElement : this.scope;
      if (!global) this.el.classList.add('is-out');
      this.listen(edge, 'pointerenter', () => this.el.classList.remove('is-out'));
      this.listen(edge, 'pointerleave', () => this.el.classList.add('is-out'));
      this.listen(this.scope, 'pointerover', (event) => {
        const target = event.target.closest ? event.target.closest('[data-cursor]') : null;
        const state = target ? this.states[target.getAttribute('data-cursor')] : null;
        this.swap(state || this.options.icon);
      });
      this.onFrame(this.update, true);
    }

    resolveScope() {
      const scope = this.options.scope;
      if (!scope) return document.documentElement;
      if (typeof scope === 'string') return document.querySelector(scope) || document.documentElement;
      return scope.el || scope;
    }

    swap(name) {
      if (name === this.current) return;
      this.current = name;
      this.icon.innerHTML = Icon.svg(name, this.options.size, this.options.strokeWidth);
    }

    update(time, delta) {
      const half = this.options.size / 2;
      let rotation = '';
      if (this.options.rotate) {
        const target = Utils.clamp(Pointer.velocityX * 0.02, -24, 24);
        this.angle = Utils.damp(this.angle, target, 8, delta);
        rotation = ' rotate(' + this.angle.toFixed(2) + 'deg)';
      }
      this.icon.style.transform = 'translate3d(' + (Pointer.x - half) + 'px,' + (Pointer.y - half) + 'px,0)' + rotation;
    }
  }

  return CursorStyle;
});

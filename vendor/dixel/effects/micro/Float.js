Dixel.define('Float', ['Component', 'Utils', 'Motion'], function (Component, Utils, Motion) {
  'use strict';

  class Float extends Component {
    static defaults = { amplitude: 8, speed: 1.2, rotate: 1.5 };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-float');
      this.phase = Math.random() * Math.PI * 2;
      this.fx = Motion.channel(this.el, 'float');
      this.addCleanup(() => this.fx.clear());
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update(time) {
      if (!this.visible) return;
      const lift = Math.sin(time * this.options.speed + this.phase) * this.options.amplitude;
      const tilt = this.options.rotate
        ? Math.sin(time * this.options.speed * 0.8 + this.phase) * this.options.rotate
        : 0;
      this.fx.set({ y: lift, rotate: tilt });
    }
  }

  return Float;
});

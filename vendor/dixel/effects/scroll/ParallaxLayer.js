Dixel.define('ParallaxLayer', ['Component', 'Motion', 'ScrollWatch', 'Utils'], function (Component, Motion, ScrollWatch, Utils) {
  'use strict';

  class ParallaxLayer extends Component {
    static defaults = { speed: 0.25, axis: 'y' };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-parallax');
      this.viewHeight = innerHeight;
      this.fx = Motion.channel(this.el, 'parallax');
      this.addCleanup(() => this.fx.clear());
      this.listen(window, 'resize', () => {
        this.viewHeight = innerHeight;
      });
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          progress: (progress) => {
            const offset = (progress - 0.5) * this.options.speed * this.viewHeight;
            this.fx.set(this.options.axis === 'x' ? { x: offset } : { y: offset });
          }
        })
      );
    }
  }

  return ParallaxLayer;
});

Dixel.define('GradientMesh', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class GradientMesh extends Component {
    static defaults = { blobs: 4, range: 0.16 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.el.classList.add('dx-mesh');
      this.blobs = [];
      for (let i = 0; i < this.options.blobs; i++) {
        const node = Utils.el('div', 'dx-mesh-blob dx-mesh-blob--' + ((i % 4) + 1));
        this.el.appendChild(node);
        this.blobs.push({
          node,
          phase: Math.random() * Math.PI * 2,
          speedX: 0.05 + Math.random() * 0.07,
          speedY: 0.04 + Math.random() * 0.06,
          speedS: 0.03 + Math.random() * 0.05
        });
      }
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      if (!Utils.reducedMotion) this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.rangeX = rect.width * this.options.range;
      this.rangeY = rect.height * this.options.range;
    }

    update(time) {
      if (!this.visible) return;
      for (let i = 0; i < this.blobs.length; i++) {
        const blob = this.blobs[i];
        const x = Math.sin(time * blob.speedX + blob.phase) * this.rangeX;
        const y = Math.cos(time * blob.speedY + blob.phase * 1.4) * this.rangeY;
        const scale = 1 + 0.1 * Math.sin(time * blob.speedS + blob.phase * 2);
        blob.node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + scale + ')';
      }
    }
  }

  return GradientMesh;
});

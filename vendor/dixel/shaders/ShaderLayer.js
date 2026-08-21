Dixel.define('ShaderLayer', ['Component', 'Utils', 'ShapeMask'], function (Component, Utils, ShapeMask) {
  'use strict';

  class ShaderLayer extends Component {
    static defaults = {
      shader: 'Liquid',
      mode: 'background',
      thickness: 2,
      opacity: 1,
      blend: null,
      resolutionScale: 0.6,
      shaderOptions: {}
    };

    ready() {
      const host = this.el;
      if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
        this.addCleanup(() => {
          host.style.position = '';
        });
      }
      host.style.isolation = 'isolate';
      this.addCleanup(() => {
        host.style.isolation = '';
      });
      this.layer = Utils.el('div', 'dx-fx-layer dx-fx-layer--' + this.options.mode);
      this.layer.style.opacity = String(this.options.opacity);
      if (this.options.blend) this.layer.style.mixBlendMode = this.options.blend;
      if (this.options.mode === 'background') {
        host.insertBefore(this.layer, host.firstChild);
      } else {
        host.appendChild(this.layer);
      }
      this.addCleanup(() => this.layer.remove());
      const name = this.options.shader.indexOf('Shader') === -1 ? this.options.shader + 'Shader' : this.options.shader;
      this.shader = this.adopt(
        Dixel.create(name, Object.assign({ resolutionScale: this.options.resolutionScale }, this.options.shaderOptions)).mount(this.layer)
      );
      if (this.options.mode === 'text' || this.options.mode === 'border') {
        this.applyMask();
        this.listen(window, 'resize', () => this.queueMask());
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            if (!this.destroyed) this.applyMask();
          });
        }
      }
    }

    queueMask() {
      clearTimeout(this.maskTimer);
      this.maskTimer = setTimeout(() => this.applyMask(), 120);
      this.addCleanup(() => clearTimeout(this.maskTimer));
    }

    applyMask() {
      const mask = this.options.mode === 'text'
        ? ShapeMask.textMask(this.el)
        : ShapeMask.ringMask(this.el, this.options.thickness);
      ShapeMask.toMaskImage(this.layer, mask);
      this.mask = mask;
    }

    refreshMask() {
      if (this.options.mode === 'text' || this.options.mode === 'border') this.applyMask();
    }
  }

  return ShaderLayer;
});

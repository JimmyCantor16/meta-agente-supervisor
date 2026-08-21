Dixel.define('RippleButton', ['Button', 'Motion', 'Utils'], function (Button, Motion, Utils) {
  'use strict';

  class RippleButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      rippleOpacity: 0.38
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--ripple');
      this.listen(this.el, 'pointerdown', this.spawnWave);
    }

    spawnWave(event) {
      const rect = this.el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const wave = Utils.el('span', 'dx-btn-wave', { 'aria-hidden': 'true' });
      wave.style.width = size + 'px';
      wave.style.height = size + 'px';
      wave.style.left = event.clientX - rect.left - size / 2 + 'px';
      wave.style.top = event.clientY - rect.top - size / 2 + 'px';
      this.el.appendChild(wave);
      Motion.fromTo(
        wave,
        { scale: 0, opacity: this.options.rippleOpacity },
        {
          scale: 1,
          opacity: 0,
          duration: 0.65,
          ease: 'out',
          onComplete: () => wave.remove()
        }
      );
    }
  }

  return RippleButton;
});

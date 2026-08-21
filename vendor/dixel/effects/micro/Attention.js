Dixel.define('Attention', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const sequences = {
    shake: [
      { x: -9, duration: 0.06, ease: 'linear' },
      { x: 8, duration: 0.06, ease: 'linear' },
      { x: -6, duration: 0.06, ease: 'linear' },
      { x: 5, duration: 0.06, ease: 'linear' },
      { x: 0, duration: 0.09, ease: 'out' }
    ],
    wiggle: [
      { rotate: -7, duration: 0.09, ease: 'linear' },
      { rotate: 6, duration: 0.09, ease: 'linear' },
      { rotate: -4, duration: 0.09, ease: 'linear' },
      { rotate: 3, duration: 0.09, ease: 'linear' },
      { rotate: 0, duration: 0.12, ease: 'out' }
    ],
    tada: [
      { scale: 0.93, rotate: -3, duration: 0.12, ease: 'out' },
      { scale: 1.07, rotate: 3, duration: 0.12, ease: 'out' },
      { rotate: -3, duration: 0.1, ease: 'linear' },
      { rotate: 3, duration: 0.1, ease: 'linear' },
      { scale: 1, rotate: 0, duration: 0.18, ease: 'outBack' }
    ],
    pop: [
      { scale: 1.16, duration: 0.12, ease: 'out' },
      { scale: 1, duration: 0.26, ease: 'outBack' }
    ],
    flash: [
      { opacity: 0.25, duration: 0.08, ease: 'linear' },
      { opacity: 1, duration: 0.08, ease: 'linear' },
      { opacity: 0.35, duration: 0.08, ease: 'linear' },
      { opacity: 1, duration: 0.12, ease: 'out' }
    ]
  };

  class Attention extends Component {
    static defaults = { trigger: null, effect: 'pop' };

    ready() {
      this.el.classList.add('dx-attention');
      this.pending = [];
      this.busy = false;
      this.addCleanup(() => {
        this.pending.length = 0;
        if (this.el) Motion.kill(this.el);
      });
      if (this.options.trigger === 'click') {
        this.listen(this.el, 'click', () => this.play(this.options.effect));
      } else if (this.options.trigger === 'hover' && !Utils.isTouch) {
        this.listen(this.el, 'pointerenter', () => this.play(this.options.effect));
      }
    }

    play(name) {
      if (!sequences[name] || Utils.reducedMotion || this.destroyed) return this;
      this.pending.push(name);
      if (!this.busy) this.next();
      return this;
    }

    next() {
      const name = this.pending.shift();
      if (!name || this.destroyed) {
        this.busy = false;
        return;
      }
      this.busy = true;
      const steps = sequences[name].slice();
      const run = () => {
        if (this.destroyed) return;
        const step = steps.shift();
        if (!step) {
          this.next();
          return;
        }
        Motion.to(this.el, Object.assign({}, step, { onComplete: run }));
      };
      run();
    }

    shake() {
      return this.play('shake');
    }

    wiggle() {
      return this.play('wiggle');
    }

    tada() {
      return this.play('tada');
    }

    pop() {
      return this.play('pop');
    }

    flash() {
      return this.play('flash');
    }
  }

  return Attention;
});

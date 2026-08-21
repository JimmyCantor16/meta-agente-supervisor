Dixel.define('Tooltip', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Tooltip extends Component {
    static defaults = {
      text: '',
      placement: 'top',
      delay: 350,
      offset: 10
    };

    ready() {
      this.bubble = Utils.el('div', 'dx-tooltip', { role: 'tooltip', id: Utils.uid() });
      this.bubble.innerHTML = '<span class="dx-tooltip-text"></span><i class="dx-tooltip-arrow" aria-hidden="true"></i>';
      this.bubble.querySelector('.dx-tooltip-text').textContent = this.options.text;
      document.body.appendChild(this.bubble);
      this.el.setAttribute('aria-describedby', this.bubble.id);
      this.timer = null;
      this.followCleanups = [];
      if (!Utils.isTouch) {
        this.listen(this.el, 'pointerenter', this.schedule);
        this.listen(this.el, 'pointerleave', this.hide);
      }
      this.listen(this.el, 'focus', this.schedule);
      this.listen(this.el, 'blur', this.hide);
      this.addCleanup(() => {
        clearTimeout(this.timer);
        this.releaseFollow();
        this.bubble.remove();
      });
    }

    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.show(), this.options.delay);
    }

    show() {
      this.position();
      this.bubble.classList.add('is-open');
      this.bindFollow();
    }

    hide() {
      clearTimeout(this.timer);
      this.bubble.classList.remove('is-open');
      this.releaseFollow();
    }

    bindFollow() {
      if (this.followCleanups.length) return;
      this.followCleanups.push(Utils.on(window, 'scroll', () => this.position(), { passive: true, capture: true }));
      this.followCleanups.push(Utils.on(window, 'resize', () => this.position(), { passive: true }));
    }

    releaseFollow() {
      this.followCleanups.forEach((cleanup) => cleanup());
      this.followCleanups = [];
    }

    position() {
      const rect = this.el.getBoundingClientRect();
      const width = this.bubble.offsetWidth;
      const height = this.bubble.offsetHeight;
      const gap = this.options.offset;
      let placement = this.options.placement;
      const space = {
        top: rect.top,
        bottom: innerHeight - rect.bottom,
        left: rect.left,
        right: innerWidth - rect.right
      };
      const needed = (placement === 'top' || placement === 'bottom' ? height : width) + gap + 8;
      const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[placement];
      if (space[placement] < needed && space[opposite] > space[placement]) placement = opposite;
      let x;
      let y;
      if (placement === 'top' || placement === 'bottom') {
        x = rect.left + rect.width / 2 - width / 2;
        y = placement === 'top' ? rect.top - height - gap : rect.bottom + gap;
        x = Utils.clamp(x, 8, Math.max(8, innerWidth - width - 8));
      } else {
        x = placement === 'left' ? rect.left - width - gap : rect.right + gap;
        y = rect.top + rect.height / 2 - height / 2;
        y = Utils.clamp(y, 8, Math.max(8, innerHeight - height - 8));
      }
      this.bubble.style.left = Math.round(x) + 'px';
      this.bubble.style.top = Math.round(y) + 'px';
      this.bubble.setAttribute('data-placement', placement);
    }
  }

  return Tooltip;
});

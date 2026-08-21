Dixel.define('Hotspot', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const closeIcon = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class Hotspot extends Component {
    static defaults = {
      target: null,
      title: '',
      text: '',
      placement: 'top',
      anchor: 'top-right',
      tone: 'primary',
      label: 'Abrir ayuda contextual'
    };

    build() {
      const el = Utils.el('button', 'dx-hotspot dx-hotspot--' + this.options.tone + ' dx-focusable', {
        type: 'button',
        'aria-expanded': 'false',
        'aria-label': this.options.label
      });
      el.innerHTML = '<span class="dx-hotspot-pulse" aria-hidden="true"></span><span class="dx-hotspot-core" aria-hidden="true"></span>';
      return el;
    }

    ready() {
      if (!this.el.querySelector('.dx-hotspot-core')) {
        this.el.classList.add('dx-hotspot', 'dx-hotspot--' + this.options.tone, 'dx-focusable');
        this.el.setAttribute('aria-expanded', 'false');
        if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', this.options.label);
        this.el.innerHTML = '<span class="dx-hotspot-pulse" aria-hidden="true"></span><span class="dx-hotspot-core" aria-hidden="true"></span>';
      }
      this.popOpen = false;
      this.unbindOutside = null;
      this.targetEl = this.resolveTarget();
      this.pop = this.buildPop();
      document.body.appendChild(this.pop);
      if (this.targetEl) {
        document.body.appendChild(this.el);
        this.el.classList.add('dx-hotspot--anchored');
        this.place();
        this.listen(window, 'resize', () => this.place());
      }
      this.listen(this.el, 'click', () => this.toggle());
      this.listen(this.pop.querySelector('.dx-hotspot-close'), 'click', () => this.close());
      this.whenVisible((visible) => this.el.classList.toggle('is-idle', !visible));
      this.addCleanup(() => {
        this.releaseOutside();
        this.pop.remove();
      });
    }

    resolveTarget() {
      const target = this.options.target;
      if (!target) return null;
      if (target instanceof Element) return target;
      return document.querySelector(target);
    }

    buildPop() {
      const titleId = Utils.uid();
      const pop = Utils.el('div', 'dx-hotspot-pop dx-reset', {
        role: 'dialog',
        'aria-labelledby': titleId,
        tabindex: '-1'
      });
      pop.innerHTML =
        '<div class="dx-hotspot-pophead"><h4 class="dx-hotspot-poptitle" id="' + titleId + '">' + Utils.escape(this.options.title) + '</h4>' +
        '<button class="dx-hotspot-close dx-focusable" type="button" aria-label="Cerrar">' + closeIcon + '</button></div>' +
        '<p class="dx-hotspot-poptext">' + this.options.text + '</p>';
      return pop;
    }

    place() {
      if (!this.targetEl) return;
      const rect = this.targetEl.getBoundingClientRect();
      const anchor = this.options.anchor;
      const pageX = window.scrollX;
      const pageY = window.scrollY;
      const x = anchor.indexOf('left') >= 0 ? rect.left : rect.right;
      const y = anchor.indexOf('bottom') === 0 ? rect.bottom : rect.top;
      this.el.style.left = Math.round(x + pageX) + 'px';
      this.el.style.top = Math.round(y + pageY) + 'px';
    }

    toggle() {
      if (this.popOpen) this.close();
      else this.open();
    }

    open() {
      if (this.popOpen) return;
      this.popOpen = true;
      const dotRect = this.el.getBoundingClientRect();
      const popW = this.pop.offsetWidth;
      const popH = this.pop.offsetHeight;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const gap = 12;
      const edge = 10;
      let placement = this.options.placement;
      if (placement === 'top' && dotRect.top - gap - popH < edge) placement = 'bottom';
      if (placement === 'bottom' && dotRect.bottom + gap + popH > viewH - edge) placement = 'top';
      const x = Utils.clamp(dotRect.left + dotRect.width / 2 - popW / 2, edge, viewW - popW - edge);
      const y = placement === 'top' ? dotRect.top - gap - popH : dotRect.bottom + gap;
      this.pop.style.left = Math.round(x + window.scrollX) + 'px';
      this.pop.style.top = Math.round(Utils.clamp(y, edge, viewH - popH - edge) + window.scrollY) + 'px';
      this.pop.classList.add('is-open');
      this.el.setAttribute('aria-expanded', 'true');
      Motion.fromTo(this.pop, { y: placement === 'top' ? 6 : -6, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.32, ease: 'outBack' });
      this.pop.focus({ preventScroll: true });
      this.unbindOutside = Utils.on(document, 'pointerdown', (event) => {
        if (!this.pop.contains(event.target) && !this.el.contains(event.target)) this.close();
      });
      this.unbindEscape = Utils.on(document, 'keydown', (event) => {
        if (event.key === 'Escape') this.close();
      });
    }

    close() {
      if (!this.popOpen) return;
      this.popOpen = false;
      this.el.setAttribute('aria-expanded', 'false');
      this.releaseOutside();
      const pop = this.pop;
      Motion.to(pop, {
        scale: 0.94,
        opacity: 0,
        duration: 0.18,
        ease: 'in',
        onComplete: () => pop.classList.remove('is-open')
      });
      this.el.focus({ preventScroll: true });
    }

    releaseOutside() {
      if (this.unbindOutside) {
        this.unbindOutside();
        this.unbindOutside = null;
      }
      if (this.unbindEscape) {
        this.unbindEscape();
        this.unbindEscape = null;
      }
    }
  }

  return Hotspot;
});

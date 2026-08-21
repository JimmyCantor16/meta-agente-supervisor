Dixel.define('HoldButton', ['Button', 'Motion', 'Ticker', 'Utils'], function (Button, Motion, Ticker, Utils) {
  'use strict';

  const circumference = 50.27;
  const sweepLength = 100;
  const ringMarkup =
    '<span class="dx-hold-ring" aria-hidden="true"><svg viewBox="0 0 24 24">' +
    '<circle class="dx-hold-track" cx="12" cy="12" r="8"/>' +
    '<circle class="dx-hold-progress" cx="12" cy="12" r="8"/>' +
    '</svg></span>';
  const fillMarkup = '<span class="dx-hold-fill" aria-hidden="true"></span>';
  const sweepMarkup =
    '<span class="dx-hold-sweep" aria-hidden="true"><svg aria-hidden="true">' +
    '<rect pathLength="' + sweepLength + '"/>' +
    '</svg></span>';

  class HoldButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      label: 'Hold to confirm',
      holdDuration: 1.1,
      progressStyle: 'ring',
      onConfirm: null
    });

    ready() {
      super.ready();
      this.progressStyle =
        this.options.progressStyle === 'fill' || this.options.progressStyle === 'sweep'
          ? this.options.progressStyle
          : 'ring';
      this.el.classList.add('dx-btn--hold', 'dx-btn--hold-' + this.progressStyle);
      this.buildMeter();
      this.progress = 0;
      this.holding = false;
      this.stopFrame = null;
      this.confirmTimer = 0;
      this.advance = this.advance.bind(this);
      this.listen(this.el, 'pointerdown', this.startHold);
      this.listen(this.el, 'pointerup', this.stopHold);
      this.listen(this.el, 'pointerleave', this.stopHold);
      this.listen(this.el, 'pointercancel', this.stopHold);
      this.listen(this.el, 'keydown', this.handleKeyDown);
      this.listen(this.el, 'keyup', this.stopHold);
      this.addCleanup(() => {
        this.stopFrameLoop();
        clearTimeout(this.confirmTimer);
      });
    }

    buildMeter() {
      if (this.progressStyle === 'fill') {
        if (!this.el.querySelector('.dx-hold-fill')) {
          this.el.insertAdjacentHTML('afterbegin', fillMarkup);
        }
        this.meter = this.el.querySelector('.dx-hold-fill');
        this.paint(0);
        return;
      }
      if (this.progressStyle === 'sweep') {
        if (!this.el.querySelector('.dx-hold-sweep')) {
          this.el.insertAdjacentHTML('afterbegin', sweepMarkup);
        }
        this.meter = this.el.querySelector('.dx-hold-sweep rect');
        this.meter.style.strokeDasharray = sweepLength;
        this.paint(0);
        return;
      }
      if (!this.el.querySelector('.dx-hold-ring')) {
        this.el.insertAdjacentHTML('afterbegin', ringMarkup);
      }
      this.meter = this.el.querySelector('.dx-hold-progress');
      this.meter.style.strokeDasharray = circumference;
      this.paint(0);
    }

    paint(progress) {
      if (this.progressStyle === 'fill') {
        this.meter.style.transform = 'scaleX(' + progress + ')';
        return;
      }
      const length = this.progressStyle === 'sweep' ? sweepLength : circumference;
      this.meter.style.strokeDashoffset = length * (1 - progress);
    }

    handleKeyDown(event) {
      if (event.repeat) return;
      if (event.key === ' ' || event.key === 'Enter') this.startHold();
    }

    startHold(event) {
      if (event && event.type === 'pointerdown') {
        if (event.button !== 0) return;
        if (this.el.setPointerCapture) {
          try { this.el.setPointerCapture(event.pointerId); } catch (error) {}
        }
      }
      this.holding = true;
      this.el.classList.add('is-holding');
      if (!this.stopFrame) this.stopFrame = Ticker.add(this.advance);
    }

    stopHold() {
      if (!this.holding) return;
      this.holding = false;
      this.el.classList.remove('is-holding');
    }

    stopFrameLoop() {
      if (!this.stopFrame) return;
      this.stopFrame();
      this.stopFrame = null;
    }

    advance(time, delta) {
      const speed = delta / Math.max(this.options.holdDuration, 0.1);
      this.progress = Utils.clamp(
        this.progress + (this.holding ? speed : -speed * 2.4),
        0,
        1
      );
      this.paint(this.progress);
      if (this.progress >= 1) this.confirm();
      else if (!this.holding && this.progress <= 0) this.stopFrameLoop();
    }

    confirm() {
      this.holding = false;
      this.progress = 0;
      this.stopFrameLoop();
      this.el.classList.remove('is-holding');
      this.el.classList.add('is-confirmed');
      this.paint(0);
      Motion.fromTo(this.el, { scale: 1.07 }, { scale: 1, duration: 0.55, ease: 'outElastic' });
      clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => {
        if (this.el) this.el.classList.remove('is-confirmed');
      }, 900);
      if (this.options.onConfirm) this.options.onConfirm();
    }
  }

  return HoldButton;
});

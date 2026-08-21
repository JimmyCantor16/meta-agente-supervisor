Dixel.define('Pointer', ['Ticker', 'Utils'], function (Ticker, Utils) {
  'use strict';

  class Pointer {
    constructor() {
      this.x = innerWidth / 2;
      this.y = innerHeight / 2;
      this.smoothX = this.x;
      this.smoothY = this.y;
      this.velocityX = 0;
      this.velocityY = 0;
      this.down = false;
      this.hasMoved = false;
      this.subscribers = 0;
      this.stop = null;
      addEventListener('pointermove', (event) => {
        this.x = event.clientX;
        this.y = event.clientY;
        this.hasMoved = true;
      }, { passive: true });
      addEventListener('pointerdown', () => { this.down = true; }, { passive: true });
      addEventListener('pointerup', () => { this.down = false; }, { passive: true });
      addEventListener('pointercancel', () => { this.down = false; }, { passive: true });
      addEventListener('blur', () => { this.down = false; });
    }

    use() {
      this.subscribers++;
      if (!this.stop) {
        this.stop = Ticker.add((time, delta) => {
          const previousX = this.smoothX;
          const previousY = this.smoothY;
          this.smoothX = Utils.damp(this.smoothX, this.x, 12, delta);
          this.smoothY = Utils.damp(this.smoothY, this.y, 12, delta);
          this.velocityX = (this.smoothX - previousX) / Math.max(delta, 0.001);
          this.velocityY = (this.smoothY - previousY) / Math.max(delta, 0.001);
        });
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.subscribers--;
        if (this.subscribers <= 0 && this.stop) {
          this.stop();
          this.stop = null;
          this.subscribers = 0;
        }
      };
    }

    get normalX() {
      return (this.x / innerWidth) * 2 - 1;
    }

    get normalY() {
      return (this.y / innerHeight) * 2 - 1;
    }
  }

  return new Pointer();
});

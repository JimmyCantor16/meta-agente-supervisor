Dixel.define('ColorPicker', ['PickerBase', 'Motion', 'Utils'], function (PickerBase, Motion, Utils) {
  'use strict';

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta) {
      if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
      else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
      else h = 60 * ((rn - gn) / delta + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max ? delta / max : 0, v: max };
  }

  function hexToRgba(hex) {
    let value = hex.replace('#', '').trim();
    if (value.length === 3) value = value.split('').map((ch) => ch + ch).join('');
    if (value.length !== 6 && value.length !== 8) return null;
    const int = parseInt(value.slice(0, 6), 16);
    if (isNaN(int)) return null;
    const a = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255, a };
  }

  function toHexPair(value) {
    return value.toString(16).padStart(2, '0');
  }

  const copyIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  const checkIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';

  class ColorPicker extends PickerBase {
    static defaults = Object.assign({}, PickerBase.defaults, {
      placeholder: 'Elegir color',
      value: '#6d5cff',
      alpha: true,
      swatches: ['#6d5cff', '#2ee6d6', '#ff4ecd', '#3ddc97', '#ffb454', '#ff5470']
    });

    triggerIcon() {
      return '<span class="dx-color-dot" aria-hidden="true"></span>';
    }

    panelMarkup() {
      const alphaBar = this.options.alpha
        ? '<div class="dx-color-bar dx-color-alpha dx-focusable" role="slider" tabindex="0" aria-label="Opacidad" aria-valuemin="0" aria-valuemax="100">' +
          '<span class="dx-color-bar-thumb"></span></div>'
        : '';
      const swatches = this.options.swatches.length
        ? '<div class="dx-color-swatches">' +
          this.options.swatches
            .map((swatch) => '<button class="dx-color-swatch dx-focusable" type="button" data-hex="' + swatch +
              '" aria-label="Color ' + swatch + '" style="background:' + swatch + '"></button>')
            .join('') +
          '</div>'
        : '';
      return '<div class="dx-color-area dx-focusable" role="slider" tabindex="0" aria-label="Saturación y brillo">' +
        '<span class="dx-color-area-thumb"></span></div>' +
        '<div class="dx-color-row">' +
        '<span class="dx-color-preview" aria-hidden="true"><i></i></span>' +
        '<div class="dx-color-bars">' +
        '<div class="dx-color-bar dx-color-hue dx-focusable" role="slider" tabindex="0" aria-label="Matiz" aria-valuemin="0" aria-valuemax="360">' +
        '<span class="dx-color-bar-thumb"></span></div>' +
        alphaBar +
        '</div></div>' +
        '<div class="dx-color-formats" role="group" aria-label="Formato del valor">' +
        this.formats()
          .map((format) => '<button class="dx-color-format dx-focusable" type="button" data-format="' + format + '" aria-pressed="false">' + format.toUpperCase() + '</button>')
          .join('') +
        '</div>' +
        '<div class="dx-color-io">' +
        '<input class="dx-color-hex" type="text" spellcheck="false" aria-label="Valor del color">' +
        '<button class="dx-color-copy dx-focusable" type="button" aria-label="Copiar color">' + copyIcon + '</button>' +
        '</div>' + swatches;
    }

    setupPanel() {
      const initial = hexToRgba(this.options.value) || { r: 109, g: 92, b: 255, a: 1 };
      const hsv = rgbToHsv(initial.r, initial.g, initial.b);
      this.h = hsv.h;
      this.s = hsv.s;
      this.v = hsv.v;
      this.a = this.options.alpha ? initial.a : 1;
      this.area = this.panel.querySelector('.dx-color-area');
      this.areaThumb = this.panel.querySelector('.dx-color-area-thumb');
      this.hueBar = this.panel.querySelector('.dx-color-hue');
      this.hueThumb = this.hueBar.querySelector('.dx-color-bar-thumb');
      this.alphaBar = this.panel.querySelector('.dx-color-alpha');
      this.alphaThumb = this.alphaBar ? this.alphaBar.querySelector('.dx-color-bar-thumb') : null;
      this.preview = this.panel.querySelector('.dx-color-preview i');
      this.hexInput = this.panel.querySelector('.dx-color-hex');
      this.copyBtn = this.panel.querySelector('.dx-color-copy');
      this.formatBtns = Array.from(this.panel.querySelectorAll('.dx-color-format'));
      this.triggerDot = this.el.querySelector('.dx-color-dot');
      this.sizes = { areaW: 1, areaH: 1, hueW: 1, alphaW: 1 };
      this.copyTimer = 0;
      this.addCleanup(() => clearTimeout(this.copyTimer));
      this.setFormat('hex');
      this.listen(this.copyBtn, 'click', this.copyValue);
      this.bindDrag(this.area, (event, rect) => {
        this.s = Utils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
        this.v = 1 - Utils.clamp((event.clientY - rect.top) / rect.height, 0, 1);
        this.apply(true);
      });
      this.bindDrag(this.hueBar, (event, rect) => {
        this.h = Utils.clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360;
        this.apply(true);
      });
      if (this.alphaBar) {
        this.bindDrag(this.alphaBar, (event, rect) => {
          this.a = Utils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
          this.apply(true);
        });
      }
      this.listen(this.area, 'keydown', (event) => {
        const step = 0.03;
        if (event.key === 'ArrowLeft') this.s = Utils.clamp(this.s - step, 0, 1);
        else if (event.key === 'ArrowRight') this.s = Utils.clamp(this.s + step, 0, 1);
        else if (event.key === 'ArrowUp') this.v = Utils.clamp(this.v + step, 0, 1);
        else if (event.key === 'ArrowDown') this.v = Utils.clamp(this.v - step, 0, 1);
        else return;
        event.preventDefault();
        this.apply(true);
      });
      this.listen(this.hueBar, 'keydown', (event) => {
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
        if (!direction) return;
        event.preventDefault();
        this.h = Utils.clamp(this.h + direction * 4, 0, 360);
        this.apply(true);
      });
      if (this.alphaBar) {
        this.listen(this.alphaBar, 'keydown', (event) => {
          const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
          if (!direction) return;
          event.preventDefault();
          this.a = Utils.clamp(this.a + direction * 0.05, 0, 1);
          this.apply(true);
        });
      }
      this.listen(this.hexInput, 'change', () => {
        if (this.format !== 'hex') return;
        const parsed = hexToRgba(this.hexInput.value);
        if (!parsed) {
          this.hexInput.value = this.hex();
          return;
        }
        const parsedHsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
        this.h = parsedHsv.h;
        this.s = parsedHsv.s;
        this.v = parsedHsv.v;
        if (this.options.alpha) this.a = parsed.a;
        this.apply(true);
      });
      this.listen(this.panel, 'click', (event) => {
        const formatBtn = event.target.closest('.dx-color-format');
        if (formatBtn) {
          this.setFormat(formatBtn.getAttribute('data-format'));
          return;
        }
        const swatch = event.target.closest('.dx-color-swatch');
        if (!swatch) return;
        const parsed = hexToRgba(swatch.getAttribute('data-hex'));
        if (!parsed) return;
        const parsedHsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
        this.h = parsedHsv.h;
        this.s = parsedHsv.s;
        this.v = parsedHsv.v;
        this.apply(true);
        Motion.fromTo(swatch, { scale: 0.7 }, { scale: 1, duration: 0.3, ease: 'outBack' });
      });
      this.listen(window, 'resize', () => {
        if (this.isOpen) this.measure();
      });
      this.apply(false);
    }

    bindDrag(el, onMove) {
      this.listen(el, 'pointerdown', (event) => {
        event.preventDefault();
        el.focus();
        el.setPointerCapture(event.pointerId);
        const rect = el.getBoundingClientRect();
        this.measure();
        onMove(event, rect);
        const move = (moveEvent) => onMove(moveEvent, rect);
        const stop = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', stop);
          el.removeEventListener('pointercancel', stop);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', stop);
        el.addEventListener('pointercancel', stop);
      });
    }

    onOpen() {
      this.measure();
      this.apply(false);
      this.area.focus();
    }

    measure() {
      this.sizes.areaW = this.area.clientWidth || 1;
      this.sizes.areaH = this.area.clientHeight || 1;
      this.sizes.hueW = this.hueBar.clientWidth || 1;
      if (this.alphaBar) this.sizes.alphaW = this.alphaBar.clientWidth || 1;
    }

    rgb() {
      return hsvToRgb(this.h, this.s, this.v);
    }

    formats() {
      return this.options.alpha ? ['hex', 'rgb', 'rgba'] : ['hex', 'rgb'];
    }

    setFormat(format) {
      if (this.formats().indexOf(format) === -1) return;
      this.format = format;
      this.formatBtns.forEach((button) => {
        const active = button.getAttribute('data-format') === format;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      this.hexInput.readOnly = format !== 'hex';
      this.hexInput.value = this.formatted();
    }

    formatted() {
      const color = this.rgb();
      if (this.format === 'rgb') {
        return 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
      }
      if (this.format === 'rgba') {
        return 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', ' + this.a.toFixed(2) + ')';
      }
      return this.hex();
    }

    copyValue() {
      const text = this.formatted();
      const done = () => this.flashCopied();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => this.copyFallback(text, done));
        return;
      }
      this.copyFallback(text, done);
    }

    copyFallback(text, done) {
      const scratch = Utils.el('textarea', 'dx-color-scratch');
      scratch.value = text;
      this.panel.appendChild(scratch);
      scratch.select();
      try {
        document.execCommand('copy');
      } catch (error) {}
      scratch.remove();
      done();
    }

    flashCopied() {
      this.copyBtn.classList.add('is-copied');
      this.copyBtn.innerHTML = checkIcon;
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        if (!this.copyBtn) return;
        this.copyBtn.classList.remove('is-copied');
        this.copyBtn.innerHTML = copyIcon;
      }, 1400);
    }

    hex() {
      const color = this.rgb();
      const base = '#' + toHexPair(color.r) + toHexPair(color.g) + toHexPair(color.b);
      return this.options.alpha && this.a < 1 ? base + toHexPair(Math.round(this.a * 255)) : base;
    }

    getValue() {
      return this.hex();
    }

    setValue(value) {
      const parsed = hexToRgba(String(value || ''));
      if (!parsed) return;
      const parsedHsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
      this.h = parsedHsv.h;
      this.s = parsedHsv.s;
      this.v = parsedHsv.v;
      if (this.options.alpha) this.a = parsed.a;
      this.apply(false);
    }

    apply(emit) {
      const color = this.rgb();
      const hex = this.hex();
      const rgbString = 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
      this.panel.style.setProperty('--dx-color-hue', String(Math.round(this.h)));
      this.panel.style.setProperty('--dx-color-current', rgbString);
      this.areaThumb.style.transform =
        'translate(' + (this.s * this.sizes.areaW).toFixed(1) + 'px, ' + ((1 - this.v) * this.sizes.areaH).toFixed(1) + 'px)';
      this.hueThumb.style.transform = 'translateX(' + ((this.h / 360) * this.sizes.hueW).toFixed(1) + 'px)';
      if (this.alphaThumb) this.alphaThumb.style.transform = 'translateX(' + (this.a * this.sizes.alphaW).toFixed(1) + 'px)';
      this.preview.style.background = 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', ' + this.a.toFixed(2) + ')';
      this.triggerDot.style.background = hex;
      if (document.activeElement !== this.hexInput) this.hexInput.value = this.formatted();
      this.area.setAttribute('aria-valuetext', 'Saturación ' + Math.round(this.s * 100) + '%, brillo ' + Math.round(this.v * 100) + '%');
      this.hueBar.setAttribute('aria-valuenow', String(Math.round(this.h)));
      if (this.alphaBar) this.alphaBar.setAttribute('aria-valuenow', String(Math.round(this.a * 100)));
      this.setDisplay(hex);
      if (emit && this.options.onChange) {
        this.options.onChange({
          hex,
          rgb: { r: color.r, g: color.g, b: color.b, a: Number(this.a.toFixed(2)) },
          hsv: { h: this.h, s: this.s, v: this.v }
        });
      }
    }
  }

  return ColorPicker;
});

Dixel.define('PasswordField', ['TextField', 'Motion', 'Utils'], function (TextField, Motion, Utils) {
  'use strict';

  const eyeIcon =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOffIcon =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 20 4"/></svg>';
  const levels = ['', 'weak', 'fair', 'good', 'strong'];

  class PasswordField extends TextField {
    static defaults = Object.assign({}, TextField.defaults, {
      label: 'Password',
      type: 'password',
      meter: true
    });

    rootClassNames() {
      return super.rootClassNames() + ' dx-field--password';
    }

    decorate(root) {
      this.toggle = Utils.el('button', 'dx-field-affix dx-focusable', {
        type: 'button',
        'aria-label': 'Show password',
        'aria-pressed': 'false',
        html: eyeIcon
      });
      this.shell.appendChild(this.toggle);
      if (!this.options.meter) return;
      this.meter = Utils.el('div', 'dx-strength', { 'aria-hidden': 'true' });
      this.meterTrack = Utils.el('span', 'dx-strength-track');
      this.meterBar = Utils.el('span', 'dx-strength-bar');
      this.meterLabel = Utils.el('span', 'dx-strength-label');
      this.meterTrack.appendChild(this.meterBar);
      this.meter.appendChild(this.meterTrack);
      this.meter.appendChild(this.meterLabel);
      root.appendChild(this.meter);
    }

    ready() {
      super.ready();
      this.listen(this.toggle, 'click', this.toggleVisibility);
      if (this.meter) {
        Motion.set(this.meterBar, { scaleX: 0 });
        this.listen(this.control, 'input', this.updateStrength);
      }
    }

    toggleVisibility() {
      const hidden = this.control.type === 'password';
      this.control.type = hidden ? 'text' : 'password';
      this.toggle.innerHTML = hidden ? eyeOffIcon : eyeIcon;
      this.toggle.setAttribute('aria-pressed', String(hidden));
      this.toggle.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
      this.control.focus();
    }

    updateStrength() {
      const score = this.scoreOf(this.control.value);
      this.meter.className = 'dx-strength' + (score ? ' dx-strength--' + levels[score] : '');
      this.meterLabel.textContent = levels[score];
      Motion.to(this.meterBar, { scaleX: score / 4, duration: 0.45, ease: 'out' });
    }

    scoreOf(text) {
      if (!text) return 0;
      let score = 0;
      if (text.length >= 8) score++;
      if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score++;
      if (/\d/.test(text)) score++;
      if (/[^a-zA-Z0-9]/.test(text)) score++;
      return Math.max(score, 1);
    }
  }

  return PasswordField;
});

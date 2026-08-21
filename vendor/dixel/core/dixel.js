(function (global) {
  'use strict';

  const definitions = [];
  const classes = {};
  let started = false;

  function define(name, dependencies, factory) {
    definitions.push({ name, dependencies, factory });
  }

  function resolveAll() {
    let unresolved = definitions.filter((item) => !classes[item.name]);
    let resolvedSomething = true;
    while (unresolved.length && resolvedSomething) {
      resolvedSomething = false;
      unresolved = unresolved.filter((item) => {
        if (!item.dependencies.every((dep) => classes[dep])) return true;
        classes[item.name] = item.factory(...item.dependencies.map((dep) => classes[dep]));
        resolvedSomething = true;
        return false;
      });
    }
    if (unresolved.length) {
      throw new Error('Dixel: unresolved dependencies -> ' + unresolved.map((item) => item.name).join(', '));
    }
  }

  function resolvePending() {
    if (started && definitions.some((item) => !classes[item.name])) resolveAll();
  }

  function create(name, options) {
    resolvePending();
    const Class = classes[name];
    if (!Class) throw new Error('Dixel: unknown component -> ' + name);
    return new Class(options);
  }

  function safeParse(raw) {
    try {
      return JSON.parse(raw, (key, value) => (key === '__proto__' || key === 'constructor' ? undefined : value)) || {};
    } catch (error) {
      return null;
    }
  }

  function scan(root) {
    resolvePending();
    const scope = root || document;
    const instances = [];
    scope.querySelectorAll('[data-dx]').forEach((el) => {
      if (el.__dixel) return;
      const name = el.getAttribute('data-dx');
      const raw = el.getAttribute('data-dx-options');
      const options = raw ? safeParse(raw) : {};
      if (options === null) {
        el.setAttribute('data-dx-error', 'options');
        return;
      }
      el.__dixel = true;
      const instance = create(name, options);
      el.__dixel = instance;
      instance.attach(el);
      instances.push(instance);
    });
    return instances;
  }

  const channelTokens = [
    'bg', 'surface', 'surface-2', 'ink', 'ink-soft', 'ink-dim', 'line',
    'primary', 'cyan', 'magenta', 'success', 'warning', 'danger', 'sheen', 'shadow'
  ];

  function toChannels(color) {
    const text = String(color).trim();
    if (text[0] === '#') {
      const hex = text.slice(1);
      const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex.slice(0, 6);
      const int = parseInt(full, 16);
      if (isNaN(int)) return null;
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
    }
    const match = text.match(/^rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter((part) => part !== '').map(parseFloat);
    if (parts.length < 3 || parts.some(isNaN)) return null;
    return [parts[0], parts[1], parts[2]];
  }

  function currentTheme() {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const palette = { mode: root.getAttribute('data-dx-theme') || 'dark' };
    channelTokens.forEach((name) => {
      const value = styles.getPropertyValue('--dx-' + name + '-rgb').trim();
      if (value) palette[name] = 'rgb(' + value + ')';
    });
    return palette;
  }

  function theme(config) {
    if (!config) return currentTheme();
    const root = document.documentElement;
    const style = root.style;
    if (config.mode) root.setAttribute('data-dx-theme', config.mode);
    Object.keys(config).forEach((key) => {
      if (key === 'mode' || key === 'fonts' || key === 'tokens') return;
      const value = config[key];
      if (value === null || value === undefined) return;
      if (channelTokens.indexOf(key) >= 0) {
        const parts = toChannels(value);
        if (parts) {
          style.setProperty('--dx-' + key + '-rgb', parts.join(' '));
          return;
        }
      }
      style.setProperty(key.slice(0, 2) === '--' ? key : '--dx-' + key, String(value));
    });
    if (config.fonts) {
      Object.keys(config.fonts).forEach((key) => {
        style.setProperty('--dx-font-' + key, String(config.fonts[key]));
      });
    }
    if (config.tokens) {
      Object.keys(config.tokens).forEach((key) => {
        style.setProperty(key.slice(0, 2) === '--' ? key : '--dx-' + key, String(config.tokens[key]));
      });
    }
    if (classes.Utils && classes.Utils.emitTheme) classes.Utils.emitTheme();
    return api;
  }

  function init(options) {
    const settings = options || {};
    if (started) return api;
    started = true;
    resolveAll();
    if (settings.theme) theme(settings.theme);
    if (settings.smoothScroll !== false && classes.SmoothScroll) {
      api.scroll = new classes.SmoothScroll(settings.scroll || {});
    }
    if (settings.scan !== false) scan();
    return api;
  }

  const api = { define, create, scan, init, theme, classes, version: '0.1.0' };
  global.Dixel = api;
})(window);

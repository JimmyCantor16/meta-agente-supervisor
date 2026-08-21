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

;
Dixel.define('Utils', [], function () {
  'use strict';

  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const touchQuery = matchMedia('(pointer: coarse)');
  const tokenCache = {};
  const themeListeners = new Set();

  return {
    token(name, fallback) {
      const key = String(name).slice(0, 2) === '--' ? String(name) : '--dx-' + name;
      if (key in tokenCache) return tokenCache[key] || fallback || '';
      const value = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
      tokenCache[key] = value;
      return value || fallback || '';
    },
    color(value, fallback) {
      const text = String(value === null || value === undefined ? '' : value).trim();
      if (!text) return this.token(fallback, '');
      if (/^(#|rgb|hsl|oklch|oklab|lab|lch|color\(|transparent|currentColor)/i.test(text)) return text;
      return this.token(text, fallback);
    },
    channels(color) {
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
    },
    clearTokens() {
      Object.keys(tokenCache).forEach((key) => delete tokenCache[key]);
    },
    onTheme(callback) {
      themeListeners.add(callback);
      return () => themeListeners.delete(callback);
    },
    emitTheme() {
      this.clearTokens();
      themeListeners.forEach((listener) => {
        try {
          listener();
        } catch (error) {}
      });
    },
    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },
    lerp(start, end, amount) {
      return start + (end - start) * amount;
    },
    damp(current, target, smoothing, delta) {
      return this.lerp(current, target, 1 - Math.exp(-smoothing * delta));
    },
    map(value, inMin, inMax, outMin, outMax) {
      const span = inMax - inMin;
      if (!span) return outMin;
      return outMin + ((value - inMin) / span) * (outMax - outMin);
    },
    withAlpha(color, alpha) {
      const text = String(color).trim();
      const parts = this.channels(text);
      if (parts) return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + alpha + ')';
      return text;
    },
    escape(value) {
      return String(value).replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
      ));
    },
    get reducedMotion() {
      return reducedMotionQuery.matches;
    },
    get isTouch() {
      return touchQuery.matches;
    },
    get dpr() {
      return Math.min(window.devicePixelRatio || 1, 2);
    },
    el(tag, className, attributes) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (attributes) {
        Object.keys(attributes).forEach((key) => {
          if (key === 'text') node.textContent = attributes[key];
          else if (key === 'html') node.innerHTML = attributes[key];
          else node.setAttribute(key, attributes[key]);
        });
      }
      return node;
    },
    on(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      return () => target.removeEventListener(type, handler, options);
    },
    fitCanvas(canvas, context) {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = this.dpr;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height, dpr };
    },
    uid() {
      return 'dx' + Math.random().toString(36).slice(2, 9);
    }
  };
});

;
Dixel.define('Ticker', [], function () {
  'use strict';

  class Ticker {
    constructor() {
      this.callbacks = new Set();
      this.running = false;
      this.last = 0;
      this.frame = this.frame.bind(this);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.last = performance.now();
      });
    }

    add(callback) {
      this.callbacks.add(callback);
      this.start();
      return () => this.remove(callback);
    }

    remove(callback) {
      this.callbacks.delete(callback);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.frame);
    }

    frame(now) {
      if (!this.callbacks.size) {
        this.running = false;
        return;
      }
      requestAnimationFrame(this.frame);
      const delta = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      const time = now / 1000;
      const snapshot = [...this.callbacks];
      for (let i = 0; i < snapshot.length; i++) {
        try {
          if (this.callbacks.has(snapshot[i])) snapshot[i](time, delta);
        } catch (error) {
          this.callbacks.delete(snapshot[i]);
        }
      }
    }
  }

  return new Ticker();
});

;
Dixel.define('Viewport', [], function () {
  'use strict';

  class Viewport {
    constructor() {
      this.handlers = new Map();
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const set = this.handlers.get(entry.target);
            if (set) set.forEach((handler) => handler(entry.isIntersecting, entry));
          });
        },
        { rootMargin: '14% 0px 14% 0px' }
      );
    }

    watch(el, handler) {
      if (!el) return () => {};
      let set = this.handlers.get(el);
      if (!set) {
        set = new Set();
        this.handlers.set(el, set);
        this.observer.observe(el);
      }
      set.add(handler);
      return () => {
        set.delete(handler);
        if (!set.size) this.unwatch(el);
      };
    }

    unwatch(el) {
      this.handlers.delete(el);
      this.observer.unobserve(el);
    }
  }

  return new Viewport();
});

;
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

;
Dixel.define('Motion', ['Ticker', 'Utils'], function (Ticker, Utils) {
  'use strict';

  const eases = {
    linear: (t) => t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outBack: (t) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) => {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    }
  };

  const transformKeys = ['x', 'y', 'z', 'rotate', 'rotateX', 'rotateY', 'scale', 'scaleX', 'scaleY'];
  const styleKeys = ['opacity'];
  const defaults = { x: 0, y: 0, z: 0, rotate: 0, rotateX: 0, rotateY: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 };
  const channelDefaults = { x: 0, y: 0, z: 0, rotate: 0, rotateX: 0, rotateY: 0, scale: 1, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, perspective: 0 };

  let tweens = [];
  let ticking = false;
  let stopTicker = null;

  function stateOf(el) {
    if (!el.__dxState) el.__dxState = Object.assign({ hasTransform: false, hasOpacity: false }, defaults);
    return el.__dxState;
  }

  function render(el) {
    const s = el.__dxState;
    let x = s.x;
    let y = s.y;
    let z = s.z;
    let rotate = s.rotate;
    let rotateX = s.rotateX;
    let rotateY = s.rotateY;
    let scaleX = s.scaleX * s.scale;
    let scaleY = s.scaleY * s.scale;
    let skewXTotal = 0;
    let skewYTotal = 0;
    let perspective = 0;
    let hasTransform = s.hasTransform;
    if (el.__dxChannels && el.__dxChannels.size) {
      el.__dxChannels.forEach((channel) => {
        x += channel.x;
        y += channel.y;
        z += channel.z;
        rotate += channel.rotate;
        rotateX += channel.rotateX;
        rotateY += channel.rotateY;
        scaleX *= channel.scaleX * channel.scale;
        scaleY *= channel.scaleY * channel.scale;
        skewXTotal += channel.skewX;
        skewYTotal += channel.skewY;
        if (channel.perspective) perspective = Math.max(perspective, channel.perspective);
        hasTransform = true;
      });
    }
    if (hasTransform) {
      el.style.transform =
        (perspective ? 'perspective(' + perspective + 'px) ' : '') +
        'translate3d(' + x + 'px,' + y + 'px,' + z + 'px)' +
        (rotate ? ' rotate(' + rotate + 'deg)' : '') +
        (rotateX ? ' rotateX(' + rotateX + 'deg)' : '') +
        (rotateY ? ' rotateY(' + rotateY + 'deg)' : '') +
        (skewXTotal || skewYTotal ? ' skew(' + skewXTotal + 'deg,' + skewYTotal + 'deg)' : '') +
        ' scale(' + scaleX + ',' + scaleY + ')';
    }
    if (s.hasOpacity) el.style.opacity = s.opacity;
  }

  function finishTween(tween) {
    if (tween.done) return;
    tween.done = true;
    if (tween.onInterrupt) tween.onInterrupt();
    else if (tween.onComplete) tween.onComplete();
  }

  function killConflicts(el, keys) {
    tweens.forEach((tween) => {
      if (tween.el !== el) return;
      keys.forEach((key) => delete tween.props[key]);
      if (!Object.keys(tween.props).length) finishTween(tween);
    });
  }

  function ensureTicker() {
    if (ticking) return;
    ticking = true;
    stopTicker = Ticker.add(step);
  }

  function step(time, delta) {
    for (let i = 0; i < tweens.length; i++) {
      const tween = tweens[i];
      if (tween.done) continue;
      if (!tween.el.isConnected) {
        tween.done = true;
        if (tween.onComplete) tween.onComplete();
        continue;
      }
      tween.elapsed += delta;
      const raw = Utils.clamp((tween.elapsed - tween.delay) / tween.duration, 0, 1);
      if (raw <= 0) continue;
      const eased = tween.ease(raw);
      const state = stateOf(tween.el);
      Object.keys(tween.props).forEach((key) => {
        const prop = tween.props[key];
        state[key] = prop.from + (prop.to - prop.from) * eased;
      });
      render(tween.el);
      if (tween.onUpdate) tween.onUpdate(eased);
      if (raw >= 1) {
        tween.done = true;
        if (tween.onComplete) tween.onComplete();
      }
    }
    tweens = tweens.filter((tween) => !tween.done);
    if (!tweens.length && stopTicker) {
      stopTicker();
      ticking = false;
      stopTicker = null;
    }
  }

  function parseTargets(target) {
    if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
    if (target instanceof Element) return [target];
    if (target && target.el instanceof Element) return [target.el];
    return Array.from(target || []);
  }

  function coerce(value, fallback) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(num) ? num : fallback;
  }

  function buildProps(el, values, fromValues) {
    const state = stateOf(el);
    const props = {};
    transformKeys.concat(styleKeys).forEach((key) => {
      if (values[key] === undefined && (!fromValues || fromValues[key] === undefined)) return;
      const from = fromValues && fromValues[key] !== undefined ? coerce(fromValues[key], state[key]) : state[key];
      const to = values[key] !== undefined ? coerce(values[key], state[key]) : state[key];
      props[key] = { from, to };
      state[key] = from;
      if (transformKeys.includes(key)) state.hasTransform = true;
      else state.hasOpacity = true;
    });
    return props;
  }

  function animate(target, values, fromValues) {
    const els = parseTargets(target);
    const stagger = values.stagger || 0;
    const reduced = Utils.reducedMotion;
    const tweensCreated = els.map((el, index) => {
      const keySource = Object.assign({}, fromValues || {}, values);
      const keys = Object.keys(keySource).filter((key) => transformKeys.includes(key) || styleKeys.includes(key));
      killConflicts(el, keys);
      const tween = {
        el,
        props: buildProps(el, values, fromValues),
        duration: Math.max(values.duration || 0.7, 0.001),
        delay: (values.delay || 0) + stagger * index,
        ease: eases[values.ease] || eases.out,
        elapsed: 0,
        done: false,
        onUpdate: values.onUpdate || null,
        onInterrupt: values.onInterrupt || null,
        onComplete: values.onComplete && index === els.length - 1 ? values.onComplete : null
      };
      if (reduced) {
        const state = stateOf(el);
        Object.keys(tween.props).forEach((key) => {
          state[key] = tween.props[key].to;
        });
        render(el);
        if (tween.onUpdate) tween.onUpdate(1);
        tween.done = true;
        if (tween.onComplete) tween.onComplete();
        return tween;
      }
      render(el);
      tweens.push(tween);
      return tween;
    });
    ensureTicker();
    return tweensCreated;
  }

  return {
    eases,
    to(target, values) {
      return animate(target, values);
    },
    from(target, values) {
      const finals = {};
      Object.keys(values).forEach((key) => {
        if (transformKeys.includes(key) || styleKeys.includes(key)) finals[key] = defaults[key];
      });
      const merged = Object.assign({}, values, finals);
      return animate(target, merged, values);
    },
    fromTo(target, fromValues, toValues) {
      return animate(target, toValues, fromValues);
    },
    set(target, values) {
      parseTargets(target).forEach((el) => {
        const state = stateOf(el);
        Object.keys(values).forEach((key) => {
          if (transformKeys.includes(key)) {
            state[key] = coerce(values[key], state[key]);
            state.hasTransform = true;
          } else if (styleKeys.includes(key)) {
            state[key] = coerce(values[key], state[key]);
            state.hasOpacity = true;
          }
        });
        render(el);
      });
    },
    kill(target) {
      const els = parseTargets(target);
      tweens.forEach((tween) => {
        if (els.includes(tween.el)) tween.done = true;
      });
    },
    channel(target, name) {
      const el = parseTargets(target)[0];
      if (!el) return null;
      if (!el.__dxChannels) el.__dxChannels = new Map();
      let state = el.__dxChannels.get(name);
      if (!state) {
        state = Object.assign({}, channelDefaults);
        el.__dxChannels.set(name, state);
      }
      stateOf(el);
      return {
        set(props) {
          Object.keys(props).forEach((key) => {
            if (key in channelDefaults) state[key] = props[key];
          });
          render(el);
        },
        clear() {
          Object.assign(state, channelDefaults);
          el.__dxChannels.delete(name);
          render(el);
          if (!el.__dxChannels.size && !el.__dxState.hasTransform) el.style.transform = '';
        }
      };
    }
  };
});

;
Dixel.define('SmoothScroll', ['Ticker', 'Utils'], function (Ticker, Utils) {
  'use strict';

  const scrollKeys = [' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
  const editableSelector = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const interactiveSelector = 'button, a, summary, [role="button"], audio, video';

  class SmoothScroll {
    constructor(options) {
      const settings = options || {};
      this.smoothing = settings.smoothing || 14;
      this.wheelMultiplier = settings.wheelMultiplier || 1.2;
      this.arrowStep = settings.arrowStep || 140;
      this.enabled = !Utils.isTouch && !Utils.reducedMotion && settings.enabled !== false;
      this.target = window.scrollY;
      this.current = window.scrollY;
      this.listeners = new Set();
      this.bound = false;
      this.stopTick = null;
      this.idleFrames = 0;
      this.tick = this.tick.bind(this);
      this.controller = typeof AbortController === 'undefined' ? null : new AbortController();
      if (this.enabled) this.bind();
      this.bindAnchors();
    }

    maxScroll() {
      return Math.max(document.documentElement.scrollHeight - innerHeight, 0);
    }

    scrollableAncestor(start, delta) {
      let node = start;
      while (node && node !== document.documentElement && node !== document.body) {
        if (node.nodeType === 1 && node.scrollHeight > node.clientHeight + 1) {
          const overflow = getComputedStyle(node).overflowY;
          if (overflow === 'auto' || overflow === 'scroll') {
            const atTop = node.scrollTop <= 0;
            const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
            if ((delta > 0 && !atBottom) || (delta < 0 && !atTop)) return node;
          }
        }
        node = node.parentNode;
      }
      return null;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      const signal = this.controller ? { signal: this.controller.signal } : {};
      addEventListener('wheel', (event) => {
        if (!this.enabled || event.ctrlKey || event.defaultPrevented) return;
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        if (this.scrollableAncestor(event.target, event.deltaY)) return;
        event.preventDefault();
        this.target = Utils.clamp(this.target + this.normalize(event) * this.wheelMultiplier, 0, this.maxScroll());
        this.wake();
      }, Object.assign({ passive: false }, signal));

      addEventListener('keydown', (event) => this.handleKey(event), signal);

      addEventListener('scroll', () => {
        if (!this.enabled) return;
        if (Math.abs(window.scrollY - Math.round(this.current)) < 2) return;
        this.target = window.scrollY;
        this.current = window.scrollY;
      }, Object.assign({ passive: true }, signal));

      addEventListener('resize', () => {
        this.target = Utils.clamp(this.target, 0, this.maxScroll());
      }, Object.assign({ passive: true }, signal));

      this.wake();
    }

    wake() {
      this.idleFrames = 0;
      if (this.stopTick || !this.enabled) return;
      this.stopTick = Ticker.add(this.tick);
    }

    sleep() {
      if (!this.stopTick) return;
      this.stopTick();
      this.stopTick = null;
    }

    tick(time, delta) {
      if (!this.enabled) {
        this.sleep();
        return;
      }
      if (Math.abs(this.target - this.current) < 0.05) {
        this.current = this.target;
        this.idleFrames += 1;
        if (this.idleFrames > 12) this.sleep();
        return;
      }
      this.idleFrames = 0;
      this.current = Utils.damp(this.current, this.target, this.smoothing, delta);
      window.scrollTo(0, this.current);
      this.listeners.forEach((listener) => listener(this.current));
    }

    handleKey(event) {
      if (!this.enabled || event.defaultPrevented) return;
      this.wake();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (scrollKeys.indexOf(event.key) === -1) return;
      const focus = event.target;
      const canQuery = focus && focus.closest;
      if (canQuery && focus.closest(editableSelector)) return;
      if (event.key === ' ' && canQuery && focus.closest(interactiveSelector)) return;
      event.preventDefault();
      const max = this.maxScroll();
      if (event.key === 'Home') {
        this.target = 0;
        return;
      }
      if (event.key === 'End') {
        this.target = max;
        return;
      }
      const page = innerHeight * 0.88;
      let step = 0;
      if (event.key === ' ') step = event.shiftKey ? -page : page;
      else if (event.key === 'PageDown') step = page;
      else if (event.key === 'PageUp') step = -page;
      else if (event.key === 'ArrowDown') step = this.arrowStep;
      else if (event.key === 'ArrowUp') step = -this.arrowStep;
      this.target = Utils.clamp(this.target + step, 0, max);
    }

    normalize(event) {
      if (event.deltaMode === 1) return event.deltaY * 32;
      if (event.deltaMode === 2) return event.deltaY * innerHeight;
      return event.deltaY;
    }

    bindAnchors() {
      addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = event.target.closest('a[href^="#"]');
        if (!anchor) return;
        const id = anchor.getAttribute('href').slice(1);
        if (!id) return;
        const destination = document.getElementById(id);
        if (!destination) return;
        event.preventDefault();
        this.scrollTo(destination);
      });
    }

    scrollTo(target, offset) {
      const top = typeof target === 'number'
        ? target
        : target.getBoundingClientRect().top + window.scrollY;
      const destination = Utils.clamp(top + (offset || 0), 0, this.maxScroll());
      if (this.enabled) {
        this.target = destination;
        this.wake();
      } else {
        window.scrollTo({ top: destination, behavior: Utils.reducedMotion ? 'auto' : 'smooth' });
      }
    }

    onScroll(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    get y() {
      return this.enabled ? this.current : window.scrollY;
    }

    stop() {
      this.enabled = false;
      this.sleep();
    }

    start() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.enabled = true;
      this.target = window.scrollY;
      this.current = window.scrollY;
      this.bind();
      this.wake();
    }

    destroy() {
      this.stop();
      this.listeners.clear();
      if (this.controller) this.controller.abort();
      this.bound = false;
    }
  }

  return SmoothScroll;
});

;
Dixel.define('ScrollWatch', ['Ticker', 'Utils'], function (Ticker, Utils) {
  'use strict';

  class ScrollWatch {
    constructor() {
      this.items = [];
      this.lastY = -1;
      this.stop = null;
      this.idleFrames = 0;
      this.measureQueued = false;
      addEventListener('resize', () => this.queueRefresh(), { passive: true });
      addEventListener('load', () => this.queueRefresh());
      addEventListener('scroll', () => this.ensure(), { passive: true });
    }

    queueRefresh() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      requestAnimationFrame(() => {
        this.measureQueued = false;
        this.refresh();
      });
    }

    refresh() {
      const scrollY = window.scrollY;
      this.items.forEach((item) => {
        const rect = item.el.getBoundingClientRect();
        item.top = rect.top + scrollY;
        item.height = rect.height;
        item.measured = true;
      });
      this.lastY = -1;
    }

    watch(el, handlers) {
      const item = {
        el,
        top: 0,
        height: 0,
        entered: false,
        enterAt: handlers.enterAt !== undefined ? handlers.enterAt : 0.85,
        once: handlers.once || false,
        onEnter: handlers.enter || null,
        onLeave: handlers.leave || null,
        onProgress: handlers.progress || null
      };
      item.measured = false;
      this.items.push(item);
      this.queueRefresh();
      this.ensure();
      return () => {
        this.items = this.items.filter((existing) => existing !== item);
        this.sleepIfIdle();
      };
    }

    sleepIfIdle() {
      if (!this.items.length && this.stop) {
        this.stop();
        this.stop = null;
        this.lastY = -1;
      }
    }

    ensure() {
      if (this.stop || !this.items.length) return;
      this.idleFrames = 0;
      this.stop = Ticker.add(() => this.update());
    }

    update() {
      const y = window.scrollY;
      if (y === this.lastY) {
        this.idleFrames += 1;
        if (this.idleFrames > 30 && this.stop) {
          this.stop();
          this.stop = null;
        }
        return;
      }
      this.idleFrames = 0;
      this.lastY = y;
      const viewHeight = innerHeight;
      let finished = false;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        if (!item.measured) continue;
        const viewTop = item.top - y;
        const enterLine = viewHeight * item.enterAt;
        const inside = viewTop < enterLine && viewTop + item.height > 0;
        if (inside && !item.entered) {
          item.entered = true;
          if (item.onEnter) item.onEnter(item.el);
          if (item.once && !item.onProgress) {
            item.done = true;
            finished = true;
          }
        } else if (!inside && item.entered && !item.once) {
          item.entered = false;
          if (item.onLeave) item.onLeave(item.el);
        }
        if (item.onProgress) {
          const progress = Utils.clamp((viewHeight - viewTop) / (viewHeight + item.height), 0, 1);
          if (progress !== item.lastProgress) {
            item.lastProgress = progress;
            item.onProgress(progress, item.el);
          }
        }
      }
      if (finished) {
        this.items = this.items.filter((item) => !item.done);
        this.sleepIfIdle();
      }
    }
  }

  return new ScrollWatch();
});

;
Dixel.define('Overlays', [], function () {
  'use strict';

  const locks = new Set();
  const escStack = [];
  let savedOverflow = '';

  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !escStack.length) return;
    event.preventDefault();
    escStack[escStack.length - 1].close();
  });

  return {
    lock(token) {
      if (!locks.size) savedOverflow = document.body.style.overflow;
      locks.add(token);
      document.body.style.overflow = 'hidden';
      return () => this.unlock(token);
    },
    unlock(token) {
      if (!locks.has(token)) return;
      locks.delete(token);
      if (!locks.size) document.body.style.overflow = savedOverflow;
    },
    pushEscape(close) {
      const entry = { close };
      escStack.push(entry);
      return () => {
        const index = escStack.indexOf(entry);
        if (index !== -1) escStack.splice(index, 1);
      };
    }
  };
});

;
Dixel.define('Component', ['Utils', 'Ticker', 'Viewport'], function (Utils, Ticker, Viewport) {
  'use strict';

  class Component {
    static defaults = {};

    constructor(options) {
      this.options = Object.assign({}, this.constructor.defaults, options || {});
      this.el = null;
      this.owned = false;
      this.cleanups = [];
      this.children = [];
      this.slot = null;
      this.slots = {};
      this.destroyed = false;
      this.visible = false;
    }

    static applyContent(content, host, owner) {
      if (content === null || content === undefined) return;
      if (Array.isArray(content)) {
        content.forEach((item) => Component.applyContent(item, host, owner));
        return;
      }
      if (typeof content === 'function') {
        Component.applyContent(content(host, owner), host, owner);
        return;
      }
      if (typeof content === 'string') {
        const holder = document.createElement('div');
        holder.innerHTML = content;
        while (holder.firstChild) host.appendChild(holder.firstChild);
        if (owner && window.Dixel) {
          Dixel.scan(host).forEach((instance) => owner.adopt(instance));
        }
        return;
      }
      if (content instanceof Node) {
        host.appendChild(content);
        return;
      }
      if (content instanceof Component) {
        content.mount(host);
        if (owner) owner.adopt(content);
        return;
      }
      if (content.dx) {
        const instance = Dixel.create(content.dx, content.options || {}).mount(host);
        if (owner) owner.adopt(instance);
      }
    }

    adopt(child) {
      this.children.push(child);
      this.addCleanup(() => child.destroy());
      return child;
    }

    setContent(content, target) {
      const host = target
        ? (typeof target === 'string' ? this.slots[target] : target)
        : (this.slot || this.el);
      if (!host) return this;
      this.children = this.children.filter((child) => {
        if (child.el && host.contains(child.el)) {
          child.destroy();
          return false;
        }
        return true;
      });
      host.innerHTML = '';
      Component.applyContent(content, host, this);
      return this;
    }

    setOptions(partial) {
      Object.assign(this.options, partial || {});
      if (this.optionsChanged) this.optionsChanged(Object.keys(partial || {}));
      return this;
    }

    build() {
      return Utils.el('div');
    }

    mount(parent) {
      if (this.destroyed) throw new Error('Dixel: no se puede montar un componente destruido');
      this.owned = true;
      this.el = this.build();
      const container = parent && parent.el ? parent.el : parent || document.body;
      container.appendChild(this.el);
      this.ready();
      return this;
    }

    attach(el) {
      if (this.destroyed) throw new Error('Dixel: no se puede adjuntar un componente destruido');
      this.el = el instanceof Component ? el.el : (el && el.el instanceof Element ? el.el : el);
      this.ready();
      return this;
    }

    ready() {}

    listen(target, type, handler, options) {
      this.cleanups.push(Utils.on(target, type, handler.bind(this), options));
    }

    onFrame(callback, ungated) {
      const bound = callback.bind(this);
      if (ungated || !this.el || !this.el.isConnected) {
        this.cleanups.push(Ticker.add(bound));
        return;
      }
      let stop = null;
      this.cleanups.push(() => {
        if (stop) {
          stop();
          stop = null;
        }
      });
      this.cleanups.push(
        Viewport.watch(this.el, (isVisible) => {
          this.visible = isVisible;
          if (isVisible && !stop) stop = Ticker.add(bound);
          else if (!isVisible && stop) {
            stop();
            stop = null;
          }
        })
      );
    }

    whenVisible(callback) {
      if (!this.el) return;
      const bound = callback.bind(this);
      this.cleanups.push(
        Viewport.watch(this.el, (isVisible, entry) => {
          this.visible = isVisible;
          bound(isVisible, entry);
        })
      );
    }

    addCleanup(cleanup) {
      this.cleanups.push(cleanup);
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {}
      });
      this.cleanups = [];
      if (this.el) {
        const Motion = Dixel.classes.Motion;
        if (Motion && Motion.kill) Motion.kill(this.el);
        if (this.owned) this.el.remove();
      }
      this.el = null;
    }
  }

  return Component;
});

;
Dixel.define('DrawIcon', ['Icon', 'Utils'], function (Icon, Utils) {
  'use strict';

  class DrawIcon extends Icon {
    static defaults = Object.assign({}, Icon.defaults, {
      duration: 1.1,
      redraw: true
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-icon--draw');
      this.el.style.setProperty('--dx-icon-draw-duration', this.options.duration + 's');
      this.prepareStrokes();
      this.whenVisible((isVisible) => {
        if (Utils.reducedMotion) {
          this.el.classList.add('dx-icon--drawn');
          return;
        }
        if (isVisible) this.el.classList.add('dx-icon--drawn');
        else if (this.options.redraw) this.el.classList.remove('dx-icon--drawn');
      });
    }

    prepareStrokes() {
      this.el.querySelectorAll('path, circle, rect, ellipse, line, polyline').forEach((shape, index) => {
        const length = shape.getTotalLength ? Math.ceil(shape.getTotalLength()) : 100;
        shape.style.strokeDasharray = length;
        shape.style.strokeDashoffset = length;
        shape.style.transitionDelay = index * 0.12 + 's';
      });
    }

    swap(name) {
      super.swap(name);
      this.el.classList.remove('dx-icon--drawn');
      this.prepareStrokes();
      if (this.visible) {
        void this.el.offsetWidth;
        this.el.classList.add('dx-icon--drawn');
      }
    }
  }

  return DrawIcon;
});

;
Dixel.define('Icon', ['Component', 'IconSet', 'Utils'], function (Component, IconSet, Utils) {
  'use strict';

  class Icon extends Component {
    static defaults = {
      name: 'sparkles',
      size: 24,
      strokeWidth: 2,
      spin: false,
      label: null
    };

    static names() {
      return Object.keys(IconSet);
    }

    static svg(name, size, strokeWidth) {
      const paths = IconSet[name];
      if (!paths) throw new Error('Dixel: unknown icon -> ' + name);
      const dimension = size || 24;
      const stroke = strokeWidth || 2;
      return '<svg class="dx-icon-svg" viewBox="0 0 24 24" width="' + dimension + '" height="' + dimension + '" fill="none" stroke="currentColor" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }

    build() {
      const el = Utils.el('span', 'dx-icon' + (this.options.spin ? ' dx-icon--spin' : ''));
      if (this.options.label) {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', this.options.label);
      } else {
        el.setAttribute('aria-hidden', 'true');
      }
      el.innerHTML = Icon.svg(this.options.name, this.options.size, this.options.strokeWidth);
      return el;
    }

    ready() {
      if (!this.el.querySelector('svg')) {
        this.el.classList.add('dx-icon');
        this.el.innerHTML = Icon.svg(this.options.name, this.options.size, this.options.strokeWidth);
      }
    }

    swap(name) {
      this.options.name = name;
      this.el.innerHTML = Icon.svg(name, this.options.size, this.options.strokeWidth);
    }
  }

  return Icon;
});

;
Dixel.define('IconCategories', ['IconSet'], function (IconSet) {
  'use strict';

  const categories = {
    interfaz: [
      'close', 'menu', 'plus', 'minus', 'check', 'checkCircle', 'search', 'searchX',
      'searchHeart', 'searchCheck', 'settings', 'settingsAlt', 'tune', 'sliders',
      'toggleLeft', 'toggleRight', 'home', 'homeHeart', 'homeWifi', 'homePlus',
      'dashboard', 'download', 'upload', 'external', 'link', 'link2', 'linkOff',
      'copy', 'copyCheck', 'copyPlus', 'trash', 'edit', 'eye', 'eyeOff', 'filter',
      'filterX', 'grid', 'gridPlus', 'moreGrid', 'list', 'listChecks', 'layers',
      'layoutSidebar', 'layoutTop', 'bookmark', 'bookmarkPlus', 'bookmarkX',
      'bookmarkCheck', 'info', 'help', 'alertTriangle', 'alertOctagon', 'ban',
      'loader', 'moreHorizontal', 'moreVertical', 'dragHandle', 'crop', 'zoomIn',
      'zoomOut', 'contrast', 'power', 'logIn', 'logOut', 'scan', 'save', 'puzzle',
      'magnet', 'wrench', 'dice', 'plusCircle', 'minusCircle', 'xCircle',
      'plusSquare', 'minusSquare', 'xSquare', 'checkSquare', 'palette', 'wand',
      'brush', 'pipette', 'eraser', 'type', 'textBold', 'textItalic',
      'textUnderline', 'textStrikethrough', 'alignLeft', 'alignCenter',
      'alignRight', 'indent', 'outdent', 'quote', 'command', 'keyCap', 'altKey',
      'shiftKey', 'capsLock', 'enterKey', 'backspace', 'spaceBar'
    ],
    flechas: [
      'arrowRight', 'arrowLeft', 'arrowUp', 'arrowDown', 'arrowUpRight',
      'arrowUpLeft', 'arrowDownRight', 'arrowDownLeft', 'arrowsLeftRight',
      'arrowsUpDown', 'arrowsExchange', 'arrowBounce', 'arrowElbow',
      'arrowRightFromLine', 'arrowLeftFromLine', 'arrowBigUp', 'arrowBigDown',
      'arrowUpCircle', 'arrowDownCircle', 'arrowLeftCircle', 'arrowRightCircle',
      'arrowTurnUp', 'arrowTurnDown', 'arrowTurnLeft', 'arrowTurnRight',
      'arrowsMaximize', 'arrowsMinimize', 'arrowSplit', 'arrowMerge',
      'arrowUpFromDot', 'arrowUpToLine', 'arrowDownFromLine', 'chevronRight',
      'chevronLeft', 'chevronUp', 'chevronDown', 'chevronsRight', 'chevronsLeft',
      'chevronsUp', 'chevronsDown', 'chevronsUpDown', 'chevronsDownUp',
      'chevronUpCircle', 'chevronDownCircle', 'cornerUpRight', 'cornerUpLeft',
      'cornerDownRight', 'cornerDownLeft', 'undo', 'redo', 'expand', 'collapse',
      'maximize', 'minimize', 'refresh', 'shuffle', 'repeat', 'repeatOne',
      'sortAsc', 'sortDesc', 'rotateCw', 'rotateCcw', 'move'
    ],
    archivos: [
      'file', 'fileText', 'filePlus', 'fileMinus', 'fileCheck', 'fileX', 'fileCode',
      'fileZip', 'fileSearch', 'fileImage', 'fileVideo', 'fileAudio', 'fileHeart',
      'fileLock', 'fileUser', 'fileClock', 'filePen', 'fileWarning',
      'fileDownload', 'fileUpload', 'fileStar', 'folder', 'folderOpen',
      'folderPlus', 'folderMinus', 'folderCheck', 'folderX', 'folderSearch',
      'folderStar', 'folderLock', 'folderHeart', 'folderCode', 'folderDownload',
      'folderUpload', 'folderClock', 'clipboard', 'clipboardCheck',
      'clipboardList', 'archive', 'box'
    ],
    media: [
      'play', 'playCircle', 'pause', 'pauseCircle', 'stop', 'stopCircle', 'volume',
      'volumeOff', 'volumeLow', 'volumePlus', 'image', 'imagePlus', 'gallery',
      'camera', 'cameraOff', 'cameraPlus', 'video', 'videoOff', 'videoPlus',
      'mic', 'micOff', 'headphones', 'speaker', 'music', 'musicNote', 'musicOff',
      'playlist', 'playlistPlus', 'waveform', 'skipForward', 'skipBack',
      'fastForward', 'rewind', 'radio', 'tv', 'cast', 'airplay', 'film',
      'clapperboard', 'subtitles', 'disc', 'podcast', 'aperture', 'equalizer'
    ],
    comunicacion: [
      'mail', 'mailOpen', 'mailAlert', 'mailStar', 'mailPlus', 'mailCheck',
      'mailSearch', 'mailLock', 'mailHeart', 'mailOff', 'mailbox', 'inbox',
      'inboxIn', 'inboxOut', 'send', 'reply', 'replyAll', 'forward',
      'messageCircle', 'messageSquare', 'messageText', 'messageOff', 'chatDots',
      'chatHeart', 'chatAlert', 'chatCheck', 'chatPlus', 'chatX', 'chatQuestion',
      'chatLock', 'chatStar', 'phone', 'phoneCall', 'phoneOff', 'phoneIncoming',
      'phoneOutgoing', 'phonePlus', 'phoneX', 'videocall', 'voicemail',
      'contactBook', 'atSign', 'bell', 'bellOff', 'bellRing', 'bellDot',
      'bellSnooze', 'bellPlus', 'bellCheck', 'bellMinus', 'notificationSquare',
      'notificationDot'
    ],
    social: [
      'user', 'users', 'userPlus', 'userMinus', 'userCheck', 'userX', 'userHeart',
      'userCircle', 'userSquare', 'userGear', 'userStar', 'userClock',
      'teamGroup', 'thumbsUp', 'thumbsDown', 'heart', 'heartPlus', 'heartCheck',
      'heartMinus', 'handHeart', 'share', 'share2', 'repost', 'verified',
      'megaphone', 'liveDot', 'rss', 'hash', 'crown'
    ],
    comercio: [
      'cart', 'cartPlus', 'cartCheck', 'cartX', 'basket', 'store', 'shoppingBag',
      'package', 'packageCheck', 'creditCard', 'wallet', 'coin', 'coins',
      'bitcoin', 'dollarSign', 'euroSign', 'cashBill', 'piggyBank', 'handCoin',
      'moneyBag', 'barcode', 'qrCode', 'receipt', 'percent', 'percentCircle',
      'gift', 'ticket', 'tag', 'tagPlus', 'scale',
      'cashRegister', 'bankBuilding', 'banknote', 'coinsStack', 'flagCheckered'
    ],
    desarrollo: [
      'code', 'terminal', 'terminal2', 'brackets', 'braces', 'variable', 'api',
      'bug', 'gitBranch', 'gitCommit', 'gitMerge', 'gitPullRequest', 'gitFork',
      'gitCompare', 'cpu', 'memoryChip', 'server', 'harddrive', 'binary', 'zap',
      'monitor', 'monitorCheck', 'monitorPlay', 'laptop', 'laptopCode',
      'smartphone', 'phoneVibrate', 'tablet', 'mouse', 'keyboard', 'plug',
      'battery', 'batteryLow', 'batteryFull', 'batteryCharging', 'batteryAlert',
      'usb', 'ethernet', 'webcam', 'gamepad', 'bluetooth', 'bluetoothOff', 'wifi',
      'wifiOff', 'signal', 'signalLow', 'router', 'cloudUpload', 'cloudDownload',
      'cloudOff', 'cloudCheck', 'cloudAlert', 'cloudSync', 'cloudX'
    ],
    datosIA: [
      'brain', 'brainCircuit', 'sparkAI', 'sparkles', 'robot', 'botHead', 'aiChip',
      'aiStars', 'aiFace', 'neuralNet', 'promptCursor', 'chatAI', 'dataFlow',
      'database', 'network', 'sitemap', 'radar', 'chartBar', 'chartLine',
      'chartArea', 'chartDonut', 'chartCandles', 'chartUp', 'chartDown',
      'chartMixed', 'chartRadar', 'pieChart', 'scatterChart', 'trendingUp',
      'trendingDown', 'activity', 'pulse', 'funnel', 'gauge', 'table', 'columns',
      'rows'
    ],
    seguridad: [
      'lock', 'unlock', 'lockHeart', 'lockClock', 'key', 'password', 'shield',
      'shieldOff', 'shieldAlert', 'shieldLock', 'shieldStar', 'shieldZap',
      'fingerprint', 'scanFace', 'eyeScan', 'safe', 'userShield', 'userLock',
      'incognito', 'cctv'
    ],
    clima: [
      'sun', 'moon', 'moonFull', 'moonStar', 'sunrise', 'sunset', 'cloud',
      'cloudRain', 'cloudSnow', 'cloudLightning', 'cloudFog', 'cloudSun',
      'cloudMoon', 'thermometer', 'wind', 'tornado', 'droplet', 'wave',
      'snowflake', 'rainbow', 'umbrella', 'mountain', 'tree', 'leaf', 'flower',
      'flame', 'planet', 'cactus', 'mushroom'
    ],
    transporte: [
      'car', 'bus', 'bike', 'train', 'plane', 'ship', 'sailboat', 'anchor',
      'truck', 'rocket', 'fuel', 'parking', 'route', 'navigation', 'compass',
      'map', 'trafficLight', 'steeringWheel', 'skateboard',
      'scooterElectric', 'motorbike', 'bikeElectric'
    ],
    lugares: [
      'mapPin', 'globe', 'building', 'buildings', 'factory', 'hospital', 'tent',
      'landmark', 'signpost', 'doorClosed', 'doorOpen', 'bridge', 'lighthouse'
    ],
    salud: [
      'heartPulse', 'pill', 'stethoscope', 'medicalCross', 'bandage', 'dumbbell',
      'run', 'sleep', 'bed', 'tooth', 'dna', 'wheelchair', 'glasses'
    ],
    comida: [
      'coffee', 'wine', 'pizza', 'utensils', 'apple', 'iceCream', 'cake', 'cookie',
      'burger', 'eggFried', 'candy', 'carrot', 'donut'
    ],
    educacion: [
      'book', 'bookOpen', 'bookHeart', 'graduationCap', 'notebook', 'pencil',
      'ruler', 'award', 'backpack', 'abacus', 'microscope'
    ],
    oficina: [
      'briefcase', 'presentation', 'print', 'calculator', 'idCard', 'lanyard',
      'paperclip', 'pin', 'scissors', 'stamp', 'pen', 'target', 'trophy', 'medal',
      'flag'
    ],
    tiempo: [
      'clock', 'clockAlert', 'clockCheck', 'clockPlus', 'watch', 'calendar',
      'calendarCheck', 'calendarPlus', 'calendarX', 'calendarDays',
      'calendarHeart', 'calendarStar', 'calendarClock', 'calendarMinus', 'alarm',
      'alarmPlus', 'timer', 'stopwatch', 'hourglass', 'history'
    ],
    cursores: [
      'cursorArrow', 'cursorClick', 'cursorPointer', 'cursorGrab', 'cursorGrabbing',
      'cursorText', 'cursorCrosshair', 'cursorMove', 'cursorCell', 'cursorResizeH',
      'cursorResizeV', 'cursorResizeDiag', 'cursorZoomIn', 'cursorZoomOut',
      'cursorDraw', 'cursorForbidden'
    ],
    formas: [
      'circle', 'square', 'triangle', 'pentagon', 'hexagon', 'octagon', 'rhombus',
      'squircle', 'diamond', 'star', 'starHalf', 'starCircle', 'starOff',
      'shootingStar', 'blob', 'asterisk', 'slash', 'dot', 'infinity'
    ],
    emociones: [
      'smile', 'smilePlus', 'laugh', 'grin', 'grinBig', 'joy', 'wink', 'meh',
      'frown', 'cry', 'angry', 'surprised', 'cool', 'heartEyes', 'tongue',
      'smirk', 'thinking', 'expressionless', 'rollingEyes', 'flushed', 'sleepy',
      'dizzy', 'starStruck', 'moneyFace', 'nerd', 'monocle', 'mask', 'sick',
      'hotFace', 'coldFace', 'scream', 'fearful', 'pleading', 'zany', 'shush',
      'drool', 'yawn', 'partyFace', 'angel', 'devilFace', 'upsideDown',
      'kissFace', 'catFace', 'handWave', 'handPeace', 'handOk', 'handPoint',
      'clap', 'muscle', 'pray', 'handFist', 'handHorns', 'hundred',
      'heartBroken', 'heartSparkle', 'balloon', 'partyPopper', 'bomb',
      'confetti', 'sunglasses', 'ghost', 'skull', 'sticker',
      'thoughtBubble', 'mindBlown', 'starEyes'
    ],
    electronica: [
      'pcTower', 'mouseDevice', 'keyboardKeys', 'monitorStand', 'ram', 'ssd',
      'usbStick', 'motherboard', 'circuitLines', 'powerCable', 'headset',
      'serverRack', 'routerWifi', 'smartwatchFace', 'plugPower',
      'databaseGear', 'databaseCheck', 'databasePlus', 'databaseZap',
      'batteryHalf', 'batteryEmpty', 'batteryDead', 'batteryWarning',
      'batteryBroken', 'signalFull', 'signalMid', 'signalNone',
      'plugOff', 'chipWarning', 'screenCracked', 'phoneCracked',
      'serverDown', 'cameraBroken'
    ],
    ventana: [
      'windowMinimize', 'windowMaximize', 'windowRestore', 'windowClose',
      'windowMode', 'windowSplit'
    ],
    notificaciones: [
      'bellAlert', 'bellX', 'notificationBadge', 'notificationOff'
    ],
    herramientas: [
      'hammer', 'screwdriver', 'drill', 'saw', 'toolBroken', 'chainBroken',
      'bulb', 'bulbOff'
    ],
    electrodomesticos: [
      'fridge', 'stove', 'microwave', 'blender', 'toaster', 'kettle',
      'washingMachine', 'airConditioner', 'fan', 'vacuum'
    ],
    musica: [
      'guitar', 'piano', 'drum'
    ],
    animales: [
      'paw', 'cat', 'dog', 'bird', 'butterfly', 'bee', 'turtle', 'rabbit',
      'snail', 'owl'
    ],
    hogar: [
      'tableFurniture', 'chairSeat', 'deskLamp', 'sofa', 'windowFrame',
      'shelfBooks', 'doorHandle', 'mirrorOval'
    ],
    personas: [
      'personStand', 'personWalk', 'personSit', 'personsPair', 'family', 'baby'
    ],
    cocina: [
      'breadLoaf', 'cheeseWedge', 'fishFood', 'salad', 'soupBowl',
      'sushiRoll', 'taco', 'bottleWater', 'beerMug', 'teaCup'
    ]
  };

  const categorized = new Set();
  Object.keys(categories).forEach(function (category) {
    categories[category].forEach(function (name) {
      if (!IconSet[name]) throw new Error('Dixel: icono desconocido en IconCategories -> ' + category + '.' + name);
      if (categorized.has(name)) throw new Error('Dixel: icono repetido en IconCategories -> ' + name);
      categorized.add(name);
    });
  });
  Object.keys(IconSet).forEach(function (name) {
    if (!categorized.has(name)) throw new Error('Dixel: icono sin categoria -> ' + name);
  });

  return categories;
});

;
Dixel.define('IconSet', [], function () {
  'use strict';

  return {
    arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
    arrowLeft: '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
    arrowUp: '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>',
    arrowDown: '<path d="M12 4v15"/><path d="m18 13-6 6-6-6"/>',
    arrowUpRight: '<path d="M6 18 18 6"/><path d="M9 6h9v9"/>',
    chevronRight: '<path d="m9 5 7 7-7 7"/>',
    chevronLeft: '<path d="m15 5-7 7 7 7"/>',
    chevronUp: '<path d="m5 15 7-7 7 7"/>',
    chevronDown: '<path d="m5 9 7 7 7-7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m4 12.5 5.5 5.5L20 7"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8 13.5 5h2.7l.9 2.5 2.4 1.1-.4 2.7 1.7 2.1-1.7 2.1.4 2.7-2.4 1.1-.9 2.5h-2.7L12 21.2 10.5 19H7.8l-.9-2.5-2.4-1.1.4-2.7L3.2 12l1.7-2.1-.4-2.7 2.4-1.1L7.8 5h2.7z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.5-3.4 4.2-5 7.5-5s6 1.6 7.5 5"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 19c1.2-2.9 3.4-4.3 6.2-4.3s5 1.4 6.2 4.3"/><path d="M15.5 5.4a3.5 3.5 0 0 1 0 6.2M17.8 14.9c2 .6 3.4 2 4.2 4.1"/>',
    heart: '<path d="M12 20.5C6.5 16.7 3.5 13.4 3.5 9.9 3.5 7.2 5.6 5 8.3 5c1.5 0 2.9.7 3.7 1.9C12.8 5.7 14.2 5 15.7 5c2.7 0 4.8 2.2 4.8 4.9 0 3.5-3 6.8-8.5 10.6z"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    bell: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>',
    phone: '<path d="M6.8 3.5c.6 0 1.9 2.6 1.9 3.3 0 1.2-1.8 1.6-1.8 2.7 0 1.5 3.9 6 5.6 6 1 0 1.5-1.8 2.6-1.8.7 0 3.4 1.3 3.4 1.9 0 1.9-2 4-3.9 4-4.4 0-11.1-7.3-11.1-11.9 0-2 2-4.2 3.3-4.2z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.5 2.2"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/>',
    upload: '<path d="M12 15V4M7 8.5l5-5 5 5"/><path d="M4.5 19.5h15"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.2 4.8 11 13"/><path d="M19.5 14v4a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V7A2.5 2.5 0 0 1 6 4.5h4"/>',
    link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M8 12 5.8 14.2a3.8 3.8 0 0 0 5.4 5.4L13 18M16 12l2.2-2.2a3.8 3.8 0 0 0-5.4-5.4L11 6"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
    trash: '<path d="M4.5 6.5h15M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/><path d="M6.5 6.5 7.4 19a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8l.9-12.5"/><path d="M10 10.5v6M14 10.5v6"/>',
    edit: '<path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17z"/><path d="m14.5 8 3 3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.9A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.9M6.1 8A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.9-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.8-1.2"/>',
    play: '<path d="M7 4.8v14.4L19.2 12z"/>',
    pause: '<path d="M7.5 5v14M16.5 5v14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    volume: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17.5 4.5-4 3.5 3 3.5-3.5 3.5 3.5"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9.5 4.5h5L16.5 7h2A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><circle cx="12" cy="13" r="3.5"/>',
    video: '<rect x="3" y="6.5" width="13" height="11" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>',
    file: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/>',
    folder: '<path d="M3.5 6.5A2 2 0 0 1 5.5 4.5h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    database: '<path d="M4.5 5.5a7.5 2.8 0 1 0 15 0 7.5 2.8 0 1 0-15 0"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
    server: '<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 18.5z"/>',
    code: '<path d="m8 8-4.5 4L8 16M16 8l4.5 4L16 16"/><path d="m13.5 5-3 14"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7 9.5 3 2.8-3 2.8M12.5 15.5H17"/>',
    cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3"/>',
    zap: '<path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10H12z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.8 12h2M19.2 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18"/>',
    mapPin: '<path d="M12 21.5s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10.5" r="2.5"/>',
    tag: '<path d="m3.5 12.5 8-9h9v9l-8 9z"/><circle cx="16" cy="8" r="1.4"/>',
    cart: '<circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/><path d="M3 4.5h2.5L8 15.5h11l2.2-8.5H6"/>',
    creditCard: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 14.5h4"/>',
    wallet: '<path d="M19.5 8V6.5a2 2 0 0 0-2-2H6A2.5 2.5 0 0 0 3.5 7v10A2.5 2.5 0 0 0 6 19.5h13.5a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19.5 8H6"/><path d="M16.5 13.5h.01"/>',
    chartBar: '<path d="M4 20.5V14M10 20.5V9M16 20.5V4.5M4.5 20.5H21"/>',
    chartLine: '<path d="M3.5 4v16.5H21"/><path d="m6.5 15 4-5 3.5 3 5.5-7"/>',
    trendingUp: '<path d="m3.5 17 6-6 4 4 7-8"/><path d="M14.5 7h6v6"/>',
    trendingDown: '<path d="m3.5 7 6 6 4-4 7 8"/><path d="M14.5 17h6v-6"/>',
    activity: '<path d="M3 12h4l2.5-6.5 4 13L16 12h5"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    layers: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3.5 13 8.5 4.7L20.5 13"/><path d="m3.5 17 8.5 4.7L20.5 17"/>',
    box: '<path d="m12 3 8.5 4.7v8.6L12 21l-8.5-4.7V7.7z"/><path d="M3.7 7.8 12 12.4l8.3-4.6M12 12.4V21"/>',
    rocket: '<path d="M12 15.5c5.5-3.5 7.5-8 7-12-4-.5-8.5 1.5-12 7"/><path d="M7 10.5c-2 .5-3.5 2-4 5 3-.5 4.5-2 5-4M13.5 17c-.5 2-2 3.5-5 4 .5-3 2-4.5 4-5"/><circle cx="14.5" cy="9.5" r="1.7"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
    alertTriangle: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.2-2.4 3.5M12 16.8h.01"/>',
    refresh: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.2L20 9"/><path d="M20 4.5V9h-4.5M19.5 12a7.5 7.5 0 0 1-13 5.2L4 15"/><path d="M4 19.5V15h4.5"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17.5" cy="5.5" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.3 10.8 7-3.9M8.3 13.2l7 3.9"/>',
    send: '<path d="M21 3.5 10.5 14M21 3.5 14 20.5l-3.5-6.5L4 10.5z"/>',
    bookmark: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16L12 16.5 5.5 20.5v-16a1 1 0 0 1 1-1z"/>',
    wifi: '<path d="M2.5 9.5C8 4.5 16 4.5 21.5 9.5M5.5 13c4-3.5 9-3.5 13 0M8.7 16.2c2-1.7 4.6-1.7 6.6 0"/><path d="M12 19.5h.01"/>',
    sparkles: '<path d="M12 4 13.8 10.2 20 12l-6.2 1.8L12 20l-1.8-6.2L4 12l6.2-1.8z"/><path d="M19 3.5v3M20.5 5h-3M5 17.5v3M6.5 19h-3"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.2 0 2-.9 2-2s-.8-1.6-.8-2.4c0-1 .8-1.6 1.9-1.6H17a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/>',
    wand: '<path d="m5 19 10-10M13.5 5.5 15 4M18.5 10.5 20 9M17 15.5l1.5 1.5M8.5 6.5 7 5"/><path d="m15 9 .8-2.4L18 6l-2.2-.7L15 3l-.8 2.3L12 6l2.2.6z"/>',
    home: '<path d="m4 11 8-7.5L20 11v8.5a1 1 0 0 1-1 1h-4.5V14h-5v6.5H5a1 1 0 0 1-1-1z"/>',
    dashboard: '<rect x="4" y="4" width="7" height="9" rx="1.5"/><rect x="13" y="4" width="7" height="5" rx="1.5"/><rect x="13" y="11" width="7" height="9" rx="1.5"/><rect x="4" y="15" width="7" height="5" rx="1.5"/>',
    gitBranch: '<circle cx="6.5" cy="6" r="2.3"/><circle cx="6.5" cy="18" r="2.3"/><circle cx="17.5" cy="8" r="2.3"/><path d="M6.5 8.3v7.4M17.5 10.3c0 3.2-3 4.2-8.7 4.6"/>',
    fingerprint: '<path d="M8 20c-1.5-3.5-1.5-7 0-9.5A5.6 5.6 0 0 1 12 8.5c2.5 0 4.5 1.6 5 4 .4 1.9.2 4.5-.5 7"/><path d="M11.8 12.2c.8 2.3.6 5-.4 8M15 5.4A9 9 0 0 0 5.3 8.1M18.9 8.6c.8 1.5 1.2 3.2 1.1 5.4"/>',
    infinity: '<path d="M8 15.5c-2 0-3.5-1.6-3.5-3.5S6 8.5 8 8.5c3.5 0 4.5 7 8 7 2 0 3.5-1.6 3.5-3.5S18 8.5 16 8.5c-3.5 0-4.5 7-8 7z"/>',
    aperture: '<circle cx="12" cy="12" r="9"/><path d="m14.3 8.5-8-1.9M17.5 14.3l-3.2-7.7M13.7 19.7l4.6-6.9M6.9 17.2l6.8.2M4.3 10l4.4 6.5M9.5 4.3l-1 7"/>',
    hexagon: '<path d="M12 3 20 7.7v8.6L12 21l-8-4.7V7.7z"/>',
    pulse: '<path d="M3 12h4l2.5-6 3.5 12 3-9 2 3h3"/>',
    arrowUpLeft: '<path d="M18 18 6 6"/><path d="M15 6H6v9"/>',
    arrowDownRight: '<path d="m6 6 12 12"/><path d="M18 9v9H9"/>',
    arrowDownLeft: '<path d="M18 6 6 18"/><path d="M15 18H6V9"/>',
    arrowsLeftRight: '<path d="m7 8-3.5 3.5L7 15"/><path d="m17 8 3.5 3.5L17 15"/><path d="M3.5 11.5h17"/>',
    arrowsUpDown: '<path d="m8.5 7 3.5-3.5L15.5 7"/><path d="m8.5 17 3.5 3.5 3.5-3.5"/><path d="M12 3.5v17"/>',
    chevronsRight: '<path d="m6 6 6 6-6 6M13 6l6 6-6 6"/>',
    chevronsLeft: '<path d="m18 6-6 6 6 6M11 6l-6 6 6 6"/>',
    chevronsUp: '<path d="m6 18 6-6 6 6M6 11l6-6 6 6"/>',
    chevronsDown: '<path d="m6 6 6 6 6-6M6 13l6 6 6-6"/>',
    cornerUpRight: '<path d="M4 20v-7a4 4 0 0 1 4-4h12"/><path d="m15 4 5 5-5 5"/>',
    cornerUpLeft: '<path d="M20 20v-7a4 4 0 0 0-4-4H4"/><path d="M9 4 4 9l5 5"/>',
    cornerDownRight: '<path d="M4 4v7a4 4 0 0 0 4 4h12"/><path d="m15 10 5 5-5 5"/>',
    cornerDownLeft: '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
    undo: '<path d="M4 8h11a5 5 0 0 1 0 10H9"/><path d="M8 4 4 8l4 4"/>',
    redo: '<path d="M20 8H9a5 5 0 0 0 0 10h6"/><path d="m16 4 4 4-4 4"/>',
    expand: '<path d="M14.5 3.5h6v6M20 4l-5.5 5.5M9.5 20.5h-6v-6M4 20l5.5-5.5"/>',
    collapse: '<path d="M20.5 9.5h-6v-6M14.5 9.5 20 4M3.5 14.5h6v6M9.5 14.5 4 20"/>',
    maximize: '<path d="M8 3.5H5.5a2 2 0 0 0-2 2V8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M3.5 16v2.5a2 2 0 0 0 2 2H8"/>',
    minimize: '<path d="M8.5 3.5v5h-5M15.5 3.5v5h5M15.5 20.5v-5h5M8.5 20.5v-5h-5"/>',
    sortAsc: '<path d="M4 6h9M4 12h7M4 18h5"/><path d="M17 20V8M13.5 11.5 17 8l3.5 3.5"/>',
    sortDesc: '<path d="M4 6h5M4 12h7M4 18h9"/><path d="M17 4v12M13.5 12.5 17 16l3.5-3.5"/>',
    shuffle: '<path d="M3.5 6.5H7c6 0 6 11 12 11h1.5"/><path d="M3.5 17.5H7c2.5 0 4-1.9 5-4M14 8.4c1-1.2 2.3-1.9 4-1.9h2.5"/><path d="m18 3.5 3 3-3 3M18 14.5l3 3-3 3"/>',
    repeat: '<path d="m17 2.5 3 3-3 3"/><path d="M4 11.5v-1a5 5 0 0 1 5-5h11M7 21.5l-3-3 3-3"/><path d="M20 12.5v1a5 5 0 0 1-5 5H4"/>',
    repeatOne: '<path d="m17 2.5 3 3-3 3"/><path d="M4 11.5v-1a5 5 0 0 1 5-5h11M7 21.5l-3-3 3-3"/><path d="M20 12.5v1a5 5 0 0 1-5 5H4"/><path d="m11 10.5 1.5-1v5"/>',
    fileText: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M9 13h6M9 17h4"/>',
    filePlus: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M12 12v6M9 15h6"/>',
    fileMinus: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M9 15h6"/>',
    fileCheck: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M9 14.5l2.2 2.2 4-4.2"/>',
    fileX: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M9.8 12.8l4.4 4.4M14.2 12.8l-4.4 4.4"/>',
    fileCode: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M10 12l-2.2 2.5L10 17M14 12l2.2 2.5L14 17"/>',
    fileZip: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M10 11.5h1.5M12.5 13.5H14M10 15.5h1.5M12.5 17.5H14"/>',
    fileSearch: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><circle cx="11.3" cy="14" r="2.5"/><path d="m13.3 16 2 2"/>',
    folderOpen: '<path d="M3.5 17.5v-11a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v1"/><path d="m3.5 19.5 2.5-8h15.5l-2.3 7a1.5 1.5 0 0 1-1.4 1z"/>',
    folderPlus: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
    folderMinus: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M9.5 13h5"/>',
    folderCheck: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m9.3 13.3 2 2 3.6-3.8"/>',
    clipboard: '<rect x="4.5" y="4" width="15" height="17.5" rx="2.5"/><rect x="8.5" y="2.5" width="7" height="3.5" rx="1.5"/>',
    clipboardCheck: '<rect x="4.5" y="4" width="15" height="17.5" rx="2.5"/><rect x="8.5" y="2.5" width="7" height="3.5" rx="1.5"/><path d="m8.5 13 2.5 2.5 4.5-5"/>',
    clipboardList: '<rect x="4.5" y="4" width="15" height="17.5" rx="2.5"/><rect x="8.5" y="2.5" width="7" height="3.5" rx="1.5"/><path d="M8.5 11h.01M12 11h4M8.5 15h.01M12 15h4"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="5" rx="1.5"/><path d="M5 9.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5M10 13.5h4"/>',
    inbox: '<path d="M3.5 13h5l1.5 2.5h4L15.5 13h5"/><path d="M6.3 5.5h11.4a2 2 0 0 1 1.9 1.4l1.9 6.1v5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-5l1.9-6.1a2 2 0 0 1 1.9-1.4z"/>',
    save: '<path d="M17 3.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5V7z"/><path d="M8 3.5V8h7V3.5M8 20.5V14h8v6.5"/>',
    scan: '<path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16M4.5 12h15"/>',
    print: '<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="2"/><path d="M7 13.5h10v7H7z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    micOff: '<path d="m4 4 16 16"/><path d="M9 9.5V11a3 3 0 0 0 5.1 2.1M15 9.8V6a3 3 0 0 0-5.6-1.5"/><path d="M5.5 11.5a6.5 6.5 0 0 0 10.6 5M18.2 13.7c.2-.7.3-1.4.3-2.2M12 18v3"/>',
    headphones: '<path d="M4 14.5v-2a8 8 0 0 1 16 0v2"/><rect x="4" y="14.5" width="4" height="6" rx="2"/><rect x="16" y="14.5" width="4" height="6" rx="2"/>',
    music: '<circle cx="7" cy="17.5" r="3"/><circle cx="17.5" cy="15.5" r="3"/><path d="M10 17.5v-11l10.5-2.5v11.5"/><path d="M10 10.5 20.5 8"/>',
    playlist: '<path d="M4 6h12M4 11h12M4 16h6"/><path d="m14 13.5 6 3.5-6 3.5z"/>',
    skipForward: '<path d="m5 5 9 7-9 7z"/><path d="M18.5 5v14"/>',
    skipBack: '<path d="m19 5-9 7 9 7z"/><path d="M5.5 5v14"/>',
    fastForward: '<path d="m3.5 6 7.5 6-7.5 6zM13 6l7.5 6L13 18z"/>',
    rewind: '<path d="M20.5 6 13 12l7.5 6zM11 6 3.5 12 11 18z"/>',
    radio: '<rect x="3" y="8.5" width="18" height="12" rx="2.5"/><path d="m6.5 8.5 10-5"/><circle cx="8.5" cy="14.5" r="2.2"/><path d="M14 12.5h4M14 16.5h4"/>',
    tv: '<rect x="3" y="7.5" width="18" height="13" rx="2.5"/><path d="m8.5 3 3.5 3.5L15.5 3"/>',
    cast: '<path d="M3.5 19.5h.01"/><path d="M3.5 16a4 4 0 0 1 4 3.5M3.5 12.5a7.5 7.5 0 0 1 7.5 7"/><path d="M3.5 8V6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/>',
    film: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 8H7M3.5 12H7M3.5 16H7M17 8h3.5M17 12h3.5M17 16h3.5M7 3.5v17M17 3.5v17"/>',
    subtitles: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M6.5 12h4M13 12h4.5M6.5 15.5h2M11 15.5h6.5"/>',
    gallery: '<rect x="3.5" y="6.5" width="15" height="14" rx="2.5"/><path d="M7.5 3.5h11a2 2 0 0 1 2 2V17"/><circle cx="8" cy="11" r="1.6"/><path d="m4 17.5 4-3.5 3 2.5 3-3 4.5 4"/>',
    volumeOff: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    volumeLow: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
    podcast: '<circle cx="12" cy="10" r="2.2"/><path d="M12 15v6"/><path d="M7.5 13.5a6 6 0 1 1 9 0M4.8 16.2a10 10 0 1 1 14.4 0"/>',
    videoOff: '<path d="m4 4 16 16"/><path d="M16 15.5v-5l5-3v9M16 10.5V9a2.5 2.5 0 0 0-2.5-2.5H9.5M5 6.6A2.5 2.5 0 0 0 3 9v6a2.5 2.5 0 0 0 2.5 2.5h8c.8 0 1.5-.3 2-.9"/>',
    messageCircle: '<path d="M21 12a9 9 0 0 1-13.2 8L3 21l1-4.8A9 9 0 1 1 21 12z"/>',
    messageSquare: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>',
    chatDots: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01"/>',
    messageText: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>',
    atSign: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a2.5 2.5 0 0 0 5 0 9 9 0 1 0-3.5 7.1"/>',
    hash: '<path d="M9.5 3.5 7.5 20.5M16.5 3.5l-2 17M4.5 8.5h16M3.5 15.5h16"/>',
    rss: '<path d="M4.5 11a8.5 8.5 0 0 1 8.5 8.5M4.5 4.5a15 15 0 0 1 15 15"/><path d="M5.5 19.5h.01"/>',
    thumbsUp: '<path d="M7.5 10.5 11 3.5c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.1 6.5a2 2 0 0 1-2 1.7H7.5z"/><path d="M7.5 10.5H4a.8.8 0 0 0-.8.8v7.4c0 .4.4.8.8.8h3.5z"/>',
    thumbsDown: '<path d="M16.5 13.5 13 20.5c-1.5 0-2.5-1-2.5-2.5V15h-5a2 2 0 0 1-2-2.3l1.1-6.5a2 2 0 0 1 2-1.7h9.9z"/><path d="M16.5 13.5H20a.8.8 0 0 0 .8-.8V5.3a.8.8 0 0 0-.8-.8h-3.5z"/>',
    userPlus: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7s5.6 1.5 7 4.7"/><path d="M19 7v6M16 10h6"/>',
    userMinus: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7s5.6 1.5 7 4.7"/><path d="M16 10h6"/>',
    userCheck: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7s5.6 1.5 7 4.7"/><path d="m15.5 9.5 2.3 2.3 4-4.3"/>',
    userX: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7s5.6 1.5 7 4.7"/><path d="m16.5 7.5 5 5M21.5 7.5l-5 5"/>',
    teamGroup: '<circle cx="12" cy="7" r="3"/><path d="M7.5 20a4.8 4.8 0 0 1 9 0"/><circle cx="4.8" cy="9.5" r="2.3"/><path d="M1.5 17.5c.6-2 2-3.2 4-3.4"/><circle cx="19.2" cy="9.5" r="2.3"/><path d="M22.5 17.5c-.6-2-2-3.2-4-3.4"/>',
    videocall: '<rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/><circle cx="9" cy="10.8" r="1.8"/><path d="M5.8 15.5c.7-1.3 1.9-2 3.2-2s2.5.7 3.2 2"/>',
    share2: '<path d="M12 3.5v12"/><path d="m8 7 4-3.5L16 7"/><path d="M5 11.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    phoneCall: '<path d="M6.8 3.5c.6 0 1.9 2.6 1.9 3.3 0 1.2-1.8 1.6-1.8 2.7 0 1.5 3.9 6 5.6 6 1 0 1.5-1.8 2.6-1.8.7 0 3.4 1.3 3.4 1.9 0 1.9-2 4-3.9 4-4.4 0-11.1-7.3-11.1-11.9 0-2 2-4.2 3.3-4.2z"/><path d="M14.5 6.5a4 4 0 0 1 3 3M15 3a7.5 7.5 0 0 1 6 6"/>',
    phoneOff: '<path d="m4 4 16 16"/><path d="M6.8 3.5c.6 0 1.9 2.6 1.9 3.3 0 1.2-1.8 1.6-1.8 2.7 0 1.5 3.9 6 5.6 6 1 0 1.5-1.8 2.6-1.8.7 0 3.4 1.3 3.4 1.9 0 1.9-2 4-3.9 4-4.4 0-11.1-7.3-11.1-11.9 0-2 2-4.2 3.3-4.2z"/>',
    mailOpen: '<path d="m3.5 9.5 8.5-6 8.5 6V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m4 10.5 8 5.5 8-5.5"/>',
    reply: '<path d="M9.5 4 4 9.5 9.5 15"/><path d="M4 9.5h10a6 6 0 0 1 6 6V20"/>',
    forward: '<path d="M14.5 4 20 9.5 14.5 15"/><path d="M20 9.5H10a6 6 0 0 0-6 6V20"/>',
    store: '<path d="M4 10V7.5l2-4h12l2 4V10"/><path d="M4 10c0 1.4 1.1 2.5 2.6 2.5S9.3 11.4 9.3 10c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 11.4 20 10"/><path d="M5.5 12.5v8h13v-8M10 20.5v-5h4v5"/>',
    shoppingBag: '<path d="M6 7.5h12l1 12a1.8 1.8 0 0 1-1.8 2H6.8a1.8 1.8 0 0 1-1.8-2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
    package: '<path d="m12 3 8.5 4.7v8.6L12 21l-8.5-4.7V7.7z"/><path d="M3.7 7.8 12 12.4l8.3-4.6M12 12.4V21M7.8 5.4l8.4 4.6"/>',
    truck: '<path d="M14.5 16.5V5.5H4a1.5 1.5 0 0 0-1.5 1.5v9.5H5"/><path d="M14.5 8.5h3.4l3.6 3.8v4.2h-2.4M9 16.5h6"/><circle cx="7" cy="16.5" r="2"/><circle cx="17" cy="16.5" r="2"/>',
    barcode: '<path d="M4 6v12M8 6v12M11 6v9M14 6v12M17 6v9M20 6v12"/>',
    qrCode: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h3v3h-3zM20 14h.01M14 20h.01M17 20h3"/>',
    receipt: '<path d="M5 3.5h14V20.5l-2.3-1.5-2.3 1.5-2.4-1.5-2.4 1.5L7.3 19 5 20.5z"/><path d="M9 8h6M9 12h6"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M15 9.2c-.7-1-1.8-1.5-3-1.5-1.8 0-3.2 1-3.2 2.4 0 2.9 6.4 1.4 6.4 4.2 0 1.4-1.4 2.4-3.2 2.4-1.2 0-2.3-.5-3-1.5"/>',
    coins: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="M15.5 9.3a5.5 5.5 0 1 1-6.2 6.2"/><path d="M8.5 6.5v4M6.5 8.5h4"/>',
    bitcoin: '<path d="M9 7h4.2a2.2 2.2 0 0 1 0 4.4H9zM9 11.4h4.8a2.3 2.3 0 0 1 0 4.6H9z"/><path d="M9 7v9M10.5 5v2M13.5 5v2M10.5 16v2M13.5 16v2"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7M12 8v12.5"/><path d="M12 8s-1-4.5-4-4.5a2 2 0 0 0 0 4M12 8s1-4.5 4-4.5a2 2 0 0 1 0 4"/>',
    ticket: '<path d="M3.5 9V6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1V9a3 3 0 0 0 0 6v2.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V15a3 3 0 0 0 0-6z"/><path d="M14.5 6v2M14.5 11v2M14.5 16v2"/>',
    landmark: '<path d="m12 3 9 5H3z"/><path d="M5 8v9M9.5 8v9M14.5 8v9M19 8v9M3.5 17h17M2.5 20.5h19"/>',
    scale: '<path d="M12 4v16.5M7 20.5h10M12 6.5 5.5 8M12 6.5 18.5 8"/><path d="M5.5 8 3 14a2.6 2.6 0 0 0 5 0zM18.5 8 16 14a2.6 2.6 0 0 0 5 0z"/>',
    gitCommit: '<circle cx="12" cy="12" r="3.5"/><path d="M2.5 12h6M15.5 12h6"/>',
    gitMerge: '<circle cx="6.5" cy="5.5" r="2.3"/><circle cx="17.5" cy="18.5" r="2.3"/><path d="M6.5 7.8V21"/><path d="M6.5 9.5a9 9 0 0 0 8.7 9"/>',
    gitPullRequest: '<circle cx="6.5" cy="6" r="2.3"/><circle cx="6.5" cy="18" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="M6.5 8.3v7.4M13.5 6H15a2.5 2.5 0 0 1 2.5 2.5v7.2"/><path d="m13 3.5 2.5 2.5L13 8.5"/>',
    bug: '<path d="M9 9V7.5a3 3 0 0 1 6 0V9"/><path d="M12 20.5c-3.3 0-5.5-2.4-5.5-5.7V12A3 3 0 0 1 9.5 9h5a3 3 0 0 1 3 3v2.8c0 3.3-2.2 5.7-5.5 5.7z"/><path d="M12 20.5v-8M6.5 13H3M21 13h-3.5M6.8 17.5 4 19.5M17.2 17.5l2.8 2M6.8 10 4.5 7.5M17.2 10l2.3-2.5"/>',
    terminal2: '<path d="m5 7 4 4-4 4"/><path d="M11 15.5h8"/>',
    brackets: '<path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H16"/>',
    braces: '<path d="M8.5 4H8a2.5 2.5 0 0 0-2.5 2.5V9A2.5 2.5 0 0 1 3 11.5v1A2.5 2.5 0 0 1 5.5 15v2.5A2.5 2.5 0 0 0 8 20h.5M15.5 4h.5a2.5 2.5 0 0 1 2.5 2.5V9a2.5 2.5 0 0 0 2.5 2.5v1A2.5 2.5 0 0 0 18.5 15v2.5A2.5 2.5 0 0 1 16 20h-.5"/>',
    variable: '<path d="M6 4.5c-3.3 5-3.3 10 0 15M18 4.5c3.3 5 3.3 10 0 15M8.5 9l7 6.5M15.5 9l-7 6.5"/>',
    api: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/><path d="m6 6 2.8 2.8M18 6l-2.8 2.8M6 18l2.8-2.8M18 18l-2.8-2.8"/>',
    bluetooth: '<path d="m7 8 10 8-5 4V4l5 4L7 16"/>',
    usb: '<path d="M12 21V4"/><path d="m9.8 6.2 2.2-2.2 2.2 2.2"/><path d="M12 14.5 7 11.8V9.2"/><path d="m12 12 5-2.7V6.8"/><circle cx="7" cy="7.7" r="1.4"/><path d="M15.6 5.4h2.8v2.8h-2.8z"/>',
    plug: '<path d="M9 3.5V8M15 3.5V8"/><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5v4"/>',
    battery: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 11v2"/>',
    batteryLow: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 11v2M6 11v2"/>',
    batteryFull: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 11v2M6 11v2M9.5 11v2M13 11v2"/>',
    batteryCharging: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 11v2"/><path d="m11 9.5-2 2.8h4l-2 2.8"/>',
    signal: '<path d="M3.5 20h.01M8 20v-4M12.5 20v-8M17 20V8M21.5 20V4"/>',
    router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M6.5 16.5h.01M10 16.5h.01"/><path d="M17.5 13V8.5"/><path d="M14.7 5.7a4 4 0 0 1 5.6 0M12.6 3.4a7 7 0 0 1 9.8 0"/>',
    cloudUpload: '<path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 18.5"/><path d="M12 12.5V21M8.8 15.5 12 12.3l3.2 3.2"/>',
    cloudDownload: '<path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 18.5"/><path d="M12 12v8.5M8.8 17.5l3.2 3.2 3.2-3.2"/>',
    cloudOff: '<path d="m4 4 16 16"/><path d="M7.2 7.4A4.5 4.5 0 0 0 7 18.5h9M19.6 16.6a4.3 4.3 0 0 0-2.8-8.2 5.5 5.5 0 0 0-8.3-3.6"/>',
    keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>',
    mouse: '<rect x="7" y="3.5" width="10" height="17" rx="5"/><path d="M12 7v3.5"/>',
    monitor: '<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 17v3.5"/>',
    smartphone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
    tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
    watch: '<circle cx="12" cy="12" r="5.5"/><path d="M12 9.5V12l1.8 1.2"/><path d="M9.3 7.2 9.8 3h4.4l.5 4.2M9.3 16.8 9.8 21h4.4l.5-4.2"/>',
    harddrive: '<path d="M2.5 12.5h19"/><path d="M4.8 5.7a2 2 0 0 1 1.8-1.2h10.8a2 2 0 0 1 1.8 1.2l2.3 6.8v5.3a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-5.3z"/><path d="M6.5 16.5h.01M10 16.5h.01"/>',
    binary: '<rect x="13.5" y="3.5" width="4" height="7" rx="2"/><rect x="6" y="13.5" width="4" height="7" rx="2"/><path d="M6 3.5h2.5v7M6 10.5h4M14 13.5h2.5v7M14 20.5h4"/>',
    brain: '<path d="M12 5a3 3 0 0 0-5.8 1A3.4 3.4 0 0 0 4 9.3c0 .9.3 1.7.9 2.3a3.4 3.4 0 0 0 .7 5.1 3.1 3.1 0 0 0 6 .8"/><path d="M12 5a3 3 0 0 1 5.8 1A3.4 3.4 0 0 1 20 9.3c0 .9-.3 1.7-.9 2.3a3.4 3.4 0 0 1-.7 5.1 3.1 3.1 0 0 1-6 .8"/><path d="M12 5v13"/>',
    sparkAI: '<path d="M12 3.5 14 10l6.5 2L14 14 12 20.5 10 14l-6.5-2L10 10z"/><path d="M18.5 3v3M20 4.5h-3"/>',
    robot: '<circle cx="12" cy="3.8" r="1.3"/><path d="M12 5.1v3.4"/><rect x="5" y="8.5" width="14" height="10.5" rx="2.5"/><path d="M9 13h.01M15 13h.01M9.5 16.5h5M2.5 12.5v3M21.5 12.5v3"/>',
    dataFlow: '<rect x="3" y="3.5" width="7" height="5.5" rx="1.5"/><rect x="14" y="15" width="7" height="5.5" rx="1.5"/><path d="M6.5 9v4a2.5 2.5 0 0 0 2.5 2.5h5M17.5 15v-1.5a2.5 2.5 0 0 0-2.5-2.5H12"/>',
    pieChart: '<path d="M12 3.5A8.5 8.5 0 1 0 20.5 12H12z"/><path d="M14.5 3.9a8.5 8.5 0 0 1 5.6 5.6H14.5z"/>',
    scatterChart: '<path d="M3.5 4v16.5H21"/><circle cx="8" cy="15" r="1.4"/><circle cx="12" cy="9" r="1.4"/><circle cx="16.5" cy="12.5" r="1.4"/><circle cx="18.5" cy="6.5" r="1.4"/>',
    chartArea: '<path d="M3.5 4v16.5H21"/><path d="M6.5 16.5V13l4-4 3.5 2.5 4.5-5v10z"/>',
    funnel: '<path d="M3.5 4.5h17L14 12.5v6L10 21v-8.5z"/>',
    gauge: '<path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4.5"/><circle cx="12" cy="14.5" r="1.6"/>',
    table: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M3 14.5h18M9.5 9.5v10"/>',
    columns: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16"/>',
    rows: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.3h17M3.5 14.7h17"/>',
    network: '<circle cx="12" cy="5.5" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M10.8 7.6 6.8 15.9M13.2 7.6l4 8.3M8 18h8"/>',
    magnet: '<path d="M5 4.5h4V13a3 3 0 0 0 6 0V4.5h4V13a7 7 0 0 1-14 0z"/><path d="M5 8.5h4M15 8.5h4"/>',
    sitemap: '<rect x="9" y="3.5" width="6" height="5" rx="1.2"/><rect x="2.5" y="15.5" width="6" height="5" rx="1.2"/><rect x="15.5" y="15.5" width="6" height="5" rx="1.2"/><path d="M12 8.5V12M5.5 15.5V12h13v3.5"/>',
    key: '<circle cx="8" cy="15.5" r="4.5"/><path d="m11.2 12.3 8.3-8.3M17 6.5l2.5 2.5M14 9.5l2.5 2.5"/>',
    shieldOff: '<path d="m4 4 16 16"/><path d="M7.2 5.4 12 3l7.5 3v5.5c0 2.3-.8 4.3-2.1 5.9M16 18.7a13 13 0 0 1-4 1.8c-4.3-1.6-7.5-4.9-7.5-9.5V7.6"/>',
    shieldAlert: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.9 7.5-9.5V6z"/><path d="M12 8.5v4M12 15.5h.01"/>',
    scanFace: '<path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"/><path d="M9 9.5h.01M15 9.5h.01M8.5 14a4.5 4.5 0 0 0 7 0"/>',
    eyeScan: '<path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"/><path d="M7 12s2-3.5 5-3.5 5 3.5 5 3.5-2 3.5-5 3.5-5-3.5-5-3.5z"/><circle cx="12" cy="12" r="1.5"/>',
    safe: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="12" cy="12" r="4.2"/><path d="M12 7.8V5.5M12 18.5v-2.3M7.8 12H5.5M18.5 12h-2.3"/>',
    userShield: '<circle cx="10" cy="7.5" r="3.5"/><path d="M3 19.5c1.2-3 3.6-4.5 6.5-4.5 1 0 1.9.2 2.7.5"/><path d="M17.5 11.5 14 13v2.6c0 2.2 1.5 3.8 3.5 4.6 2-.8 3.5-2.4 3.5-4.6V13z"/>',
    incognito: '<path d="M4 11.5 5.8 5.7a2 2 0 0 1 1.9-1.4h8.6a2 2 0 0 1 1.9 1.4l1.8 5.8"/><path d="M2.5 12.5h19"/><circle cx="8" cy="17" r="2.8"/><circle cx="16" cy="17" r="2.8"/><path d="M10.8 16.5c.8-.5 1.6-.5 2.4 0"/>',
    cloudRain: '<path d="M7 15.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 15.5z"/><path d="M8.5 18v2.5M12 18.5V21M15.5 18v2.5"/>',
    cloudSnow: '<path d="M7 15.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 15.5z"/><path d="M8.5 18.5h.01M12 20.5h.01M15.5 18.5h.01M12 17.5h.01"/>',
    cloudLightning: '<path d="M7 15.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 15.5z"/><path d="m12.5 15.5-2 3.5h3l-2 3.5"/>',
    cloudFog: '<path d="M7 15.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 15.5z"/><path d="M5 18.5h14M7 21.5h10"/>',
    cloudSun: '<circle cx="7.5" cy="7.5" r="3"/><path d="M7.5 2.5v1.6M2.5 7.5h1.6M4 4l1.1 1.1M12.5 4l-1.1 1.1"/><path d="M12 20.5h7.5a3.8 3.8 0 0 0 .5-7.6 5 5 0 0 0-9.7-1.1A4 4 0 0 0 12 20.5z"/>',
    cloudMoon: '<path d="M16.5 3a4.5 4.5 0 0 0 5 6 5 5 0 0 1-3.2 3.3"/><path d="M7 20.5a4.2 4.2 0 0 1-.8-8.3 5.2 5.2 0 0 1 10.1-1.1 4 4 0 0 1-.3 8z"/>',
    thermometer: '<path d="M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z"/><path d="M12 11v6"/>',
    wind: '<path d="M3.5 8h9.5a2.5 2.5 0 1 0-2.4-3.2M3.5 12h13.5a2.8 2.8 0 1 1-2.7 3.5M3.5 16h6.5a2.2 2.2 0 1 1-2.1 2.8"/>',
    droplet: '<path d="M12 3.5c3.5 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.5-6.3 6-10.5z"/>',
    wave: '<path d="M2.5 9c1.6-2 3.2-3 4.8-3s3.1 1 4.7 3 3.1 3 4.7 3 3.2-1 4.8-3"/><path d="M2.5 15c1.6-2 3.2-3 4.8-3s3.1 1 4.7 3 3.1 3 4.7 3 3.2-1 4.8-3"/>',
    mountain: '<path d="M3 20.5 9.5 7.5l4.2 8.4M10.5 13.5l3.5-6 7 13z"/>',
    tree: '<path d="m12 3 5 6.5h-2.5l4 5.5h-4l3.5 5.5H6l3.5-5.5h-4l4-5.5H7z"/><path d="M12 20.5V22"/>',
    leaf: '<path d="M6 15.5c0-7 5.5-11 14-11 0 8.5-4 14-11 14a5.6 5.6 0 0 1-3-1z"/><path d="M4 20.5c2-5 6-8.5 11-10.5"/>',
    flower: '<circle cx="12" cy="12" r="3"/><path d="M12 9V7.5A2.5 2.5 0 1 0 9.5 10H12M15 12h1.5A2.5 2.5 0 1 0 14 9.5V12M12 15v1.5a2.5 2.5 0 1 0 2.5-2.5H12M9 12H7.5a2.5 2.5 0 1 0 2.5 2.5V12"/>',
    flame: '<path d="M12 3.5c1 2.5 2.5 4.4 4.5 6.5a6.5 6.5 0 1 1-9.4.4c1.5-1.9 3.9-3.9 4.9-6.9z"/><path d="M12 20.5a3 3 0 0 1-2-5.2c.8-.8 1.5-1.7 2-2.8.5 1.1 1.2 2 2 2.8a3 3 0 0 1-2 5.2z"/>',
    snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
    rainbow: '<path d="M3.5 17a8.5 8.5 0 0 1 17 0"/><path d="M7 17a5 5 0 0 1 10 0"/><path d="M10.5 17a1.5 1.5 0 0 1 3 0"/>',
    sunrise: '<path d="M12 3v5M9.5 5.5 12 3l2.5 2.5"/><path d="M6.3 12.3 4.9 10.9M17.7 12.3l1.4-1.4M2.5 17.5h2M19.5 17.5h2M8 17.5a4 4 0 0 1 8 0"/><path d="M4.5 20.5h15"/>',
    sunset: '<path d="M12 3v5M9.5 5.5 12 8l2.5-2.5"/><path d="M6.3 12.3 4.9 10.9M17.7 12.3l1.4-1.4M2.5 17.5h2M19.5 17.5h2M8 17.5a4 4 0 0 1 8 0"/><path d="M4.5 20.5h15"/>',
    moonFull: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9h.01M14.5 11h.01M10.5 14.5h.01"/>',
    umbrella: '<path d="M12 3a9.5 9.5 0 0 1 9.5 9.5h-19A9.5 9.5 0 0 1 12 3z"/><path d="M12 12.5V19a2 2 0 0 0 4 0"/>',
    car: '<path d="m5 11 1.7-4.4a2 2 0 0 1 1.9-1.1h6.8a2 2 0 0 1 1.9 1.1L19 11"/><path d="M4.5 11h15A1.5 1.5 0 0 1 21 12.5v4a1 1 0 0 1-1 1h-1.5M4.5 11A1.5 1.5 0 0 0 3 12.5v4a1 1 0 0 0 1 1h1.5M9 17.5h6"/><circle cx="7.2" cy="17.5" r="1.8"/><circle cx="16.8" cy="17.5" r="1.8"/>',
    bike: '<circle cx="5.5" cy="16.5" r="3.3"/><circle cx="18.5" cy="16.5" r="3.3"/><path d="M5.5 16.5 9 9.5h6M12 16.5 9 9.5M15 9.5l3.5 7M15 9.5 13 7h3"/>',
    plane: '<path d="M10.5 13.5 3 11l1.5-1.5 6.5 1 5-5.5c.6-.6 2-1 2.8-.2s.4 2.2-.2 2.8l-5.5 5 1 6.5L12.5 21l-2.5-7.5z"/><path d="m6 18-2 2"/>',
    train: '<rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 11h14M9 14.5h.01M15 14.5h.01M8.5 17.5l-2 3.5M15.5 17.5l2 3.5M7 19.5h10"/>',
    ship: '<path d="M3.5 14.5h17l-2 4.5a2 2 0 0 1-1.8 1.2H7.3a2 2 0 0 1-1.8-1.2z"/><path d="M6.5 14.5V9A1.5 1.5 0 0 1 8 7.5h8A1.5 1.5 0 0 1 17.5 9v5.5"/><path d="M12 7.5v-4"/>',
    anchor: '<circle cx="12" cy="5.5" r="2.5"/><path d="M12 8v13"/><path d="M4.5 13.5a7.5 7.5 0 0 0 15 0"/><path d="m2.5 11.5 2 2 2-2M17.5 11.5l2 2 2-2"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    map: '<path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    route: '<circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><path d="M15.5 5.5H10a3.5 3.5 0 0 0 0 7h4a3.5 3.5 0 0 1 0 7H8.5"/>',
    navigation: '<path d="m12 3 8 18-8-4.5L4 21z"/>',
    building: '<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M9.5 7.5h.01M14.5 7.5h.01M9.5 11.5h.01M14.5 11.5h.01M9.5 15.5h.01M14.5 15.5h.01"/><path d="M10.5 20.5v-3h3v3"/>',
    buildings: '<rect x="3.5" y="8.5" width="8" height="12" rx="1"/><path d="M11.5 12.5H19a1.5 1.5 0 0 1 1.5 1.5v6.5M2.5 20.5h19M6.5 12h2M6.5 15.5h2M15 16h2"/>',
    factory: '<path d="M3.5 20.5V9l5.5 3.5V9l5.5 3.5V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v15z"/><path d="M2.5 20.5h19M7 16.5h.01M11 16.5h.01M15 16.5h.01"/>',
    hospital: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M12 8v6M9 11h6M9.5 20.5v-3h5v3"/>',
    tent: '<path d="M3.5 20.5 12 4l8.5 16.5"/><path d="m12 13.5 3.5 7M12 13.5 8.5 20.5M2.5 20.5h19"/>',
    fuel: '<path d="M4.5 20.5v-14a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14"/><path d="M3 20.5h10.5M5.5 9.5h6"/><path d="M13.5 11H15a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 0 3 0V9.7a2 2 0 0 0-.6-1.4L16.5 6"/>',
    heartPulse: '<path d="M12 20.5C6.5 16.7 3.5 13.4 3.5 9.9 3.5 7.2 5.6 5 8.3 5c1.5 0 2.9.7 3.7 1.9C12.8 5.7 14.2 5 15.7 5c2.7 0 4.8 2.2 4.8 4.9 0 3.5-3 6.8-8.5 10.6z"/><path d="M7 12h2.5l1.5-2.5 2 5 1.5-2.5H17"/>',
    pill: '<path d="M13.4 4.6a4.2 4.2 0 0 1 6 6l-8.8 8.8a4.2 4.2 0 0 1-6-6z"/><path d="m8.5 8.5 7 7"/>',
    stethoscope: '<path d="m6 3.5-1.5.5v5a5 5 0 0 0 10 0V4L13 3.5"/><path d="M9.5 14v2.5a5 5 0 0 0 10 0V13"/><circle cx="19.5" cy="10.5" r="2.4"/>',
    medicalCross: '<path d="M9.5 3.5h5V9H20v5h-5.5v5.5h-5V14H4V9h5.5z"/>',
    dumbbell: '<path d="M6.5 6.5v11M3.5 8.5v7M17.5 6.5v11M20.5 8.5v7M6.5 12h11"/>',
    run: '<circle cx="14.5" cy="4.5" r="2"/><path d="M13.5 8.5 9 11l2.5 3.5L8 20.5M11.5 14.5l4 2 1 4M13.5 8.5l3.5 2.5 3.5-1"/>',
    sleep: '<path d="M13 4h5l-5 6h5M5 13h4.5L5 18.5h4.5"/>',
    coffee: '<path d="M4.5 8.5h13v6a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z"/><path d="M17.5 10H19a2.5 2.5 0 0 1 0 5h-1.7M8 5.5v-2M11 5.5v-2M14 5.5v-2"/>',
    wine: '<path d="M7 3.5h10c0 5-2 8-5 8s-5-3-5-8z"/><path d="M12 11.5V20M8.5 20.5h7"/>',
    pizza: '<path d="M4 6.5c2.4-1.9 5-3 8-3s5.6 1.1 8 3L12 21z"/><path d="M5.3 8.8c1.9-1.4 4.2-2.1 6.7-2.1s4.8.7 6.7 2.1"/><circle cx="12" cy="11.5" r="1.2"/><circle cx="11" cy="16" r="1"/>',
    utensils: '<path d="M5 3.5v5a2.5 2.5 0 0 0 5 0v-5M7.5 8.5v12M19 20.5v-17c-2.3 1.8-3.5 4.7-3.5 8v2.5H19"/>',
    bed: '<path d="M3 4.5v15M3 8.5h16a2 2 0 0 1 2 2v9M3 16.5h18M7 8.5V13"/>',
    apple: '<path d="M12 6.5c1.5-1.5 3.7-1.7 5.3-.4 2.3 1.8 2.4 5.6.6 8.9-1.3 2.4-3 4-4.4 4-.6 0-1-.3-1.5-.3s-.9.3-1.5.3c-1.4 0-3.1-1.6-4.4-4-1.8-3.3-1.7-7.1.6-8.9C8.3 4.8 10.5 5 12 6.5z"/><path d="M12 6.5c0-1.8.8-3 2.5-3.5"/>',
    bandage: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M8.5 8.5v7M15.5 8.5v7M11 11h.01M13 13h.01M13 11h.01M11 13h.01"/>',
    book: '<path d="M4.5 19.5A2.5 2.5 0 0 1 7 17h12.5"/><path d="M7 2.5h12.5v19H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5z"/>',
    bookOpen: '<path d="M2.5 5.5C4.8 4.5 7 4 9 4c1.2 0 2.2.4 3 1.2.8-.8 1.8-1.2 3-1.2 2 0 4.2.5 6.5 1.5v14c-2.3-1-4.5-1.5-6.5-1.5-1.2 0-2.2.4-3 1.2-.8-.8-1.8-1.2-3-1.2-2 0-4.2.5-6.5 1.5z"/><path d="M12 5.2v14"/>',
    graduationCap: '<path d="m12 3.5 10 5-10 5-10-5z"/><path d="M6 10.5v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 8.5V14"/>',
    pencil: '<path d="M17 3.5 20.5 7 7 20.5l-4.5 1 1-4.5z"/><path d="m14.5 6 3.5 3.5"/>',
    pen: '<path d="m12 19.5-7.5 2 2-7.5L17 3.5A2.1 2.1 0 0 1 20.5 5c0 .6-.2 1.1-.6 1.5z"/>',
    ruler: '<path d="M3 17.2 17.2 3l3.8 3.8L6.8 21z"/><path d="m7.5 12.5 2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>',
    scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.1 7.5 20 19M8.1 16.5 20 5"/>',
    paperclip: '<path d="m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L9.8 17.3a1.8 1.8 0 0 1-2.6-2.6l7.8-7.7"/>',
    pin: '<path d="M9 3.5h6l-1 6.5 3 2.5v2H7v-2l3-2.5z"/><path d="M12 14.5V21"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="13" rx="2.5"/><path d="M9 7.5v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12.5h18"/>',
    presentation: '<path d="M3 3.5h18"/><path d="M4.5 3.5h15V14a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><path d="M12 16v2M8.5 21.5l3.5-3.5 3.5 3.5"/><path d="m7.5 11.5 3-3 2 2 3.5-4"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.6"/>',
    trophy: '<path d="M7 3.5h10v6a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5V7a3 3 0 0 0 3 3M17 5.5h2.5V7a3 3 0 0 1-3 3"/><path d="M12 14.5V18M8.5 21h7M10.5 21v-3h3v3"/>',
    medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.5 5 3.5h5L12 8l2-4.5h5l-3.5 7"/><path d="M12 15h.01"/>',
    flag: '<path d="M5 21.5V4c1.5-1 3-1.5 4.5-1.5 3 0 4.5 2 7.5 2 1 0 2-.2 3-.7V14c-1 .5-2 .7-3 .7-3 0-4.5-2-7.5-2-1.5 0-3 .5-4.5 1.5"/>',
    stamp: '<path d="M9.7 12.5 9 6.6a3 3 0 1 1 6 0l-.7 5.9"/><path d="M5.5 17.5v-3a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3zM4.5 21h15"/>',
    notebook: '<rect x="5.5" y="3" width="14" height="18" rx="2"/><path d="M9.5 3v18M3.5 7.5h3M3.5 12h3M3.5 16.5h3"/>',
    hourglass: '<path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2c0 2 1.5 3.3 4 5.3 2.5-2 4-3.3 4-5.3V3.5M8 20.5v-3.2c0-2 1.5-3.3 4-5.3 2.5 2 4 3.3 4 5.3v3.2"/>',
    alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5"/><path d="M5.5 4 3 6.5M18.5 4 21 6.5"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5M10 2.5h4M12 2.5V6"/>',
    stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="m12 13.5 3-3M10 2.5h4M18.5 6.5 20 5"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3.5 2"/>',
    calendarCheck: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/><path d="m8.8 14.8 2.2 2.2 4.2-4.4"/>',
    calendarPlus: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/><path d="M12 12.5v5M9.5 15h5"/>',
    calendarX: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/><path d="m9.8 12.8 4.4 4.4M14.2 12.8l-4.4 4.4"/>',
    sliders: '<path d="M5.5 20.5v-7M5.5 9.5v-6M12 20.5v-5M12 11.5v-8M18.5 20.5v-9M18.5 7.5v-4"/><circle cx="5.5" cy="11.5" r="2"/><circle cx="12" cy="13.5" r="2"/><circle cx="18.5" cy="9.5" r="2"/>',
    equalizer: '<path d="M5 20V10M9.7 20V4M14.3 20v-9M19 20V7"/>',
    toggleLeft: '<rect x="2.5" y="6.5" width="19" height="11" rx="5.5"/><circle cx="8" cy="12" r="2.8"/>',
    toggleRight: '<rect x="2.5" y="6.5" width="19" height="11" rx="5.5"/><circle cx="16" cy="12" r="2.8"/>',
    loader: '<path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5"/>',
    moreHorizontal: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    moreVertical: '<path d="M12 5v.01M12 12v.01M12 19v.01"/>',
    dragHandle: '<path d="M9 5.5h.01M15 5.5h.01M9 12h.01M15 12h.01M9 18.5h.01M15 18.5h.01"/>',
    crop: '<path d="M6.5 2.5V15a2.5 2.5 0 0 0 2.5 2.5h12.5"/><path d="M2.5 6.5H15A2.5 2.5 0 0 1 17.5 9v12.5"/>',
    move: '<path d="M12 2.5v19M2.5 12h19M9.5 5 12 2.5 14.5 5M9.5 19l2.5 2.5 2.5-2.5M5 9.5 2.5 12 5 14.5M19 9.5l2.5 2.5-2.5 2.5"/>',
    rotateCw: '<path d="M20 12a8 8 0 1 1-2.3-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/>',
    rotateCcw: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5"/><path d="M4 4v4.5h4.5"/>',
    zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8M11 8.5v5M8.5 11h5"/>',
    zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8M8.5 11h5"/>',
    contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 5.5a6.5 6.5 0 0 1 0 13z"/>',
    sticker: '<path d="M14.5 3.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5V9.5z"/><path d="M14.5 3.5c.3 3.6 2.4 5.7 6 6"/><path d="M9 14a4 4 0 0 0 6 0"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    frown: '<circle cx="12" cy="12" r="9"/><path d="M15.5 15.5a4.5 4.5 0 0 0-7 0M9 9.5h.01M15 9.5h.01"/>',
    meh: '<circle cx="12" cy="12" r="9"/><path d="M8.5 15h7M9 9.5h.01M15 9.5h.01"/>',
    ghost: '<path d="M12 3a7.5 7.5 0 0 1 7.5 7.5V21l-2.5-2-2.5 2-2.5-2-2.5 2-2.5-2-2.5 2V10.5A7.5 7.5 0 0 1 12 3z"/><path d="M9.5 10.5h.01M14.5 10.5h.01"/>',
    skull: '<path d="M12 2.5a8 8 0 0 1 8 8c0 2.2-.9 4.1-2.5 5.5V19a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3A7.6 7.6 0 0 1 4 10.5a8 8 0 0 1 8-8z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M10.5 21v-2.5M13.5 21v-2.5M12 14l-1 2h2z"/>',
    diamond: '<path d="M7 3.5h10L21 9l-9 11.5L3 9z"/><path d="M3 9h18M7 3.5 9.5 9l2.5 11.5L14.5 9 17 3.5"/>',
    crown: '<path d="m3.5 7 4 3.5L12 4l4.5 6.5 4-3.5-1.8 11H5.3z"/><path d="M8 14.5h8"/>',
    puzzle: '<path d="M9.5 3.5a2 2 0 0 1 4 0V5h3A1.5 1.5 0 0 1 18 6.5v3h1.5a2 2 0 0 1 0 4H18v3a1.5 1.5 0 0 1-1.5 1.5h-3v-1.5a2 2 0 0 0-4 0V18h-3A1.5 1.5 0 0 1 5 16.5v-3H3.5a2 2 0 0 1 0-4H5v-3A1.5 1.5 0 0 1 6.5 5h3z"/>',
    alignLeft: '<path d="M4 6h16M4 10.5h10M4 15h16M4 19.5h10"/>',
    alignCenter: '<path d="M4 6h16M7 10.5h10M4 15h16M7 19.5h10"/>',
    alignRight: '<path d="M4 6h16M10 10.5h10M4 15h16M10 19.5h10"/>',
    textBold: '<path d="M7.5 4.5h5.5a3.5 3.5 0 0 1 0 7H7.5zM7.5 11.5h6.5a4 4 0 0 1 0 8H7.5z"/><path d="M7.5 4.5v15"/>',
    textItalic: '<path d="M10.5 4.5H19M5 19.5h8.5M14.5 4.5l-5 15"/>',
    textUnderline: '<path d="M6.5 4v7a5.5 5.5 0 0 0 11 0V4M5 20.5h14"/>',
    type: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
    quote: '<path d="M8 5.5C5.5 6.6 4 8.7 4 11.5V17a1.5 1.5 0 0 0 1.5 1.5h3A1.5 1.5 0 0 0 10 17v-3a1.5 1.5 0 0 0-1.5-1.5H6.8c.2-2 1.2-3.4 3.2-4.4z"/><path d="M19 5.5c-2.5 1.1-4 3.2-4 6V17a1.5 1.5 0 0 0 1.5 1.5h3A1.5 1.5 0 0 0 21 17v-3a1.5 1.5 0 0 0-1.5-1.5h-1.7c.2-2 1.2-3.4 3.2-4.4z"/>',
    eraser: '<path d="M7.5 20.5 3 16a1.8 1.8 0 0 1 0-2.6L13.4 3a1.8 1.8 0 0 1 2.6 0L21 8a1.8 1.8 0 0 1 0 2.6l-9.9 9.9z"/><path d="m8.5 8 7.5 7.5M7.5 20.5H21"/>',
    brush: '<path d="m11 13 8.3-9.1a1.7 1.7 0 0 1 2.4 2.4L12.6 14.6"/><path d="M9.7 11.7c-3 .3-5.2 2.6-5.2 5.8 0 1.5-.8 2.7-2 3.5 1.3.7 2.7 1 4 1 3.7 0 6.5-2.4 6.5-6"/>',
    pipette: '<path d="M18.5 2.5a2.1 2.1 0 0 1 3 3l-2.5 2.5-3-3z"/><path d="m14.5 6.5 3 3-8 8-3.5.5-2.5 2.5-1-1 2.5-2.5.5-3.5z"/>',
    power: '<path d="M12 3v8"/><path d="M6.7 6.2a7.5 7.5 0 1 0 10.6 0"/>',
    logIn: '<path d="M14 3.5h4a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4"/><path d="M3.5 12H14M10.5 8.5 14 12l-3.5 3.5"/>',
    logOut: '<path d="M10 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h4"/><path d="M9.5 12h11M17 8.5 20.5 12 17 15.5"/>',
    bellOff: '<path d="M18 9.5a6 6 0 0 0-9.8-4.6M6.2 6.7A6 6 0 0 0 6 9.5c0 5-2 6-2 6h11.5"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/><path d="m4 4 16 16"/>',
    command: '<path d="M9 9h6v6H9z"/><path d="M9 9H6.5A2.5 2.5 0 1 1 9 6.5V9zM15 9h2.5A2.5 2.5 0 1 0 15 6.5V9zM15 15h2.5a2.5 2.5 0 1 1-2.5 2.5V15zM9 15H6.5A2.5 2.5 0 1 0 9 17.5V15z"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
    bellRing: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/><path d="M2.5 8a9.5 9.5 0 0 1 3-5.5M21.5 8a9.5 9.5 0 0 0-3-5.5"/>',
    bellDot: '<path d="M17.9 10.6c.3 3.9 2.1 4.9 2.1 4.9H4s2-1 2-6a6 6 0 0 1 8.3-5.5"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/><circle cx="18.5" cy="5" r="2.5"/>',
    bellSnooze: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/><path d="M10.2 7.5h3.6l-3.6 4.5h3.6"/>',
    bellPlus: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/><path d="M12 7.5V12M9.75 9.75h4.5"/>',
    bellCheck: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/><path d="m9.5 9.8 1.8 1.8 3.2-3.4"/>',
    notificationSquare: '<path d="M20.5 12v6a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5h6"/><circle cx="17.5" cy="6.5" r="3"/>',
    notificationDot: '<path d="M13.4 4.6a8.5 8.5 0 1 0 6 6"/><circle cx="18" cy="6" r="2.8"/>',
    chatHeart: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M12 13.8c-2.2-1.5-3.4-2.8-3.4-4.2 0-1.1.9-2 2-2 .6 0 1.1.3 1.4.7.3-.4.8-.7 1.4-.7 1.1 0 2 .9 2 2 0 1.4-1.2 2.7-3.4 4.2z"/>',
    chatAlert: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>',
    chatCheck: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="m8.8 10.6 2.2 2.2 4.2-4.4"/>',
    chatPlus: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M12 7.5v5M9.5 10h5"/>',
    chatX: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="m9.8 8 4.4 4.4M14.2 8l-4.4 4.4"/>',
    chatQuestion: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M9.8 8.6a2.3 2.3 0 0 1 4.5.6c0 1.5-2.2 2-2.2 3.2M12 14.6h.01"/>',
    chatAI: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M12 6.5 13 9.5 16 10.5 13 11.5 12 14.5 11 11.5 8 10.5 11 9.5z"/>',
    mailAlert: '<rect x="2" y="5.5" width="16" height="13" rx="2.5"/><path d="m3 7.5 7 5.5 7-5.5"/><path d="M21 8.5v5M21 17h.01"/>',
    mailStar: '<path d="M21 11.5V8a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 8v8a2.5 2.5 0 0 0 2.5 2.5h7"/><path d="m4 7.5 8 6 8-6"/><path d="m18.5 14.5.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"/>',
    mailPlus: '<path d="M21 11V8a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 8v8a2.5 2.5 0 0 0 2.5 2.5H13"/><path d="m4 7.5 8 6 8-6"/><path d="M18.5 14.5v6M15.5 17.5h6"/>',
    mailCheck: '<path d="M21 11V8a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 8v8a2.5 2.5 0 0 0 2.5 2.5H13"/><path d="m4 7.5 8 6 8-6"/><path d="m15.5 17.5 2 2 3.5-3.7"/>',
    mailSearch: '<path d="M21 11V8a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 8v8a2.5 2.5 0 0 0 2.5 2.5H12"/><path d="m4 7.5 8 6 8-6"/><circle cx="17.5" cy="16.5" r="3"/><path d="m19.8 18.8 2 2"/>',
    inboxIn: '<path d="M3.5 13h5l1.5 2.5h4L15.5 13h5"/><path d="M20.5 13v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-5"/><path d="M12 3v6.5M9 7l3 3 3-3"/>',
    inboxOut: '<path d="M3.5 13h5l1.5 2.5h4L15.5 13h5"/><path d="M20.5 13v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-5"/><path d="M12 9.5V3M9 5.5l3-3 3 3"/>',
    voicemail: '<circle cx="6.5" cy="11.5" r="3.5"/><circle cx="17.5" cy="11.5" r="3.5"/><path d="M6.5 15h11"/>',
    contactBook: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><circle cx="12" cy="9.5" r="2.2"/><path d="M8.5 16c.7-1.5 1.9-2.2 3.5-2.2s2.8.7 3.5 2.2"/><path d="M2.5 7.5h2M2.5 12h2M2.5 16.5h2"/>',
    phoneIncoming: '<path d="M6.8 3.5c.6 0 1.9 2.6 1.9 3.3 0 1.2-1.8 1.6-1.8 2.7 0 1.5 3.9 6 5.6 6 1 0 1.5-1.8 2.6-1.8.7 0 3.4 1.3 3.4 1.9 0 1.9-2 4-3.9 4-4.4 0-11.1-7.3-11.1-11.9 0-2 2-4.2 3.3-4.2z"/><path d="M20.5 3.5 16 8M16 4.5V8h3.5"/>',
    phoneOutgoing: '<path d="M6.8 3.5c.6 0 1.9 2.6 1.9 3.3 0 1.2-1.8 1.6-1.8 2.7 0 1.5 3.9 6 5.6 6 1 0 1.5-1.8 2.6-1.8.7 0 3.4 1.3 3.4 1.9 0 1.9-2 4-3.9 4-4.4 0-11.1-7.3-11.1-11.9 0-2 2-4.2 3.3-4.2z"/><path d="m16 8 4.5-4.5M17 3.5h3.5V7"/>',
    arrowsExchange: '<path d="M4 7.5h13M14 4l3.5 3.5L14 11"/><path d="M20 16.5H7M10 13l-3.5 3.5L10 20"/>',
    arrowBounce: '<path d="M3.5 19.5 9 8.5l4.5 8 7-13"/><path d="M20.5 9.5v-6h-6"/>',
    arrowElbow: '<path d="M4 4v9.5a3 3 0 0 0 3 3h13"/><path d="m16.5 13 3.5 3.5-3.5 3.5"/>',
    arrowRightFromLine: '<path d="M5 5v14"/><path d="M9.5 12h11M17 8.5l3.5 3.5L17 15.5"/>',
    arrowLeftFromLine: '<path d="M19 5v14"/><path d="M14.5 12h-11M7 8.5 3.5 12 7 15.5"/>',
    arrowBigUp: '<path d="M12 3.5 4.5 11H9v9h6v-9h4.5z"/>',
    arrowBigDown: '<path d="M12 20.5 4.5 13H9V4h6v9h4.5z"/>',
    arrowUpCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5v-9M8.5 11 12 7.5l3.5 3.5"/>',
    arrowDownCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M8.5 13 12 16.5 15.5 13"/>',
    arrowLeftCircle: '<circle cx="12" cy="12" r="9"/><path d="M16.5 12h-9M11 8.5 7.5 12l3.5 3.5"/>',
    arrowRightCircle: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12h9M13 8.5l3.5 3.5-3.5 3.5"/>',
    chevronsUpDown: '<path d="m8 9.5 4-4 4 4"/><path d="m8 14.5 4 4 4-4"/>',
    chevronsDownUp: '<path d="m8 5 4 4 4-4"/><path d="m8 19 4-4 4 4"/>',
    chevronUpCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 13.5 4-4 4 4"/>',
    chevronDownCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 10.5 4 4 4-4"/>',
    aiChip: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/><path d="M12 8.5 12.9 11.1 15.5 12 12.9 12.9 12 15.5 11.1 12.9 8.5 12 11.1 11.1z"/>',
    aiStars: '<path d="M9 3.5 10.6 8.4 15.5 10 10.6 11.6 9 16.5 7.4 11.6 2.5 10 7.4 8.4z"/><path d="M17.5 12.5 18.5 15.5 21.5 16.5 18.5 17.5 17.5 20.5 16.5 17.5 13.5 16.5 16.5 15.5z"/>',
    aiFace: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9.5v3M15.5 9.5v3M8.5 16a5 5 0 0 0 7 0"/>',
    neuralNet: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="5.5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18.5" r="2"/><circle cx="19" cy="8.5" r="2"/><circle cx="19" cy="15.5" r="2"/><path d="m6.8 11 3.4-4.4M7 12h3M6.8 13l3.4 4.4M13.9 6.3l3.2 1.4M13.9 12.6l3.2 2M14 11.4l3.2-2M13.9 17.7l3.2-1.4"/>',
    promptCursor: '<path d="m4 7 5 5-5 5"/><path d="M12 17h4"/><path d="M20 5v14"/>',
    botHead: '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 8V4.8"/><circle cx="12" cy="3.5" r="1.3"/><path d="M9 12.5v2M15 12.5v2"/>',
    radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="m12 12 5.5-6.5"/><path d="M12 12h.01"/>',
    chartDonut: '<path d="M20.5 12A8.5 8.5 0 1 1 12 3.5"/><path d="M15.5 4.2a8.5 8.5 0 0 1 4.3 4.3"/><circle cx="12" cy="12" r="4"/>',
    chartCandles: '<path d="M7 3.5V7M7 15v3.5"/><rect x="5" y="7" width="4" height="8" rx="1"/><path d="M17 5.5V9M17 17v2.5"/><rect x="15" y="9" width="4" height="8" rx="1"/>',
    repost: '<path d="M7 5.5h7A3.5 3.5 0 0 1 17.5 9v1.5"/><path d="M10 2.5 7 5.5l3 3"/><path d="M17 18.5h-7A3.5 3.5 0 0 1 6.5 15v-1.5"/><path d="m14 21.5 3-3-3-3"/>',
    heartPlus: '<path d="M12 20.5C6.5 16.7 3.5 13.4 3.5 9.9 3.5 7.2 5.6 5 8.3 5c1.5 0 2.9.7 3.7 1.9C12.8 5.7 14.2 5 15.7 5c2.7 0 4.8 2.2 4.8 4.9 0 3.5-3 6.8-8.5 10.6z"/><path d="M12 9v5M9.5 11.5h5"/>',
    verified: '<path d="m12 2.8 1.9 1.8 2.6-.5 1 2.5 2.5 1-.5 2.6 1.8 1.8-1.8 1.8.5 2.6-2.5 1-1 2.5-2.6-.5-1.9 1.8-1.9-1.8-2.6.5-1-2.5-2.5-1 .5-2.6L2.7 12l1.8-1.8-.5-2.6 2.5-1 1-2.5 2.6.5z"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4"/>',
    megaphone: '<path d="M3.5 10.5v3a1.5 1.5 0 0 0 1.5 1.5h1.5l1 4.7a1 1 0 0 0 1 .8h.8a1 1 0 0 0 1-1.2l-.9-4.3H13l7 3.5v-13L13 9H5a1.5 1.5 0 0 0-1.5 1.5z"/>',
    userHeart: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7 1 0 1.9.1 2.7.4"/><path d="M18 21c-2.5-1.7-3.8-3.2-3.8-4.8 0-1.2 1-2.2 2.2-2.2.6 0 1.2.3 1.6.8.4-.5 1-.8 1.6-.8 1.2 0 2.2 1 2.2 2.2 0 1.6-1.3 3.1-3.8 4.8z"/>',
    liveDot: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
    settingsAlt: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    tune: '<path d="M4 7h7M15 7h5M4 12h3M11 12h9M4 17h9M17 17h3"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="17" r="2"/>',
    filterX: '<path d="M4 6h12M7 12h6M10 18h1"/><path d="m15.5 14.5 5 5M20.5 14.5l-5 5"/>',
    moreGrid: '<path d="M6.5 6.5h.01M12 6.5h.01M17.5 6.5h.01M6.5 12h.01M12 12h.01M17.5 12h.01M6.5 17.5h.01M12 17.5h.01M17.5 17.5h.01"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9L6.7 20.3a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    bookmarkPlus: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16L12 16.5 5.5 20.5v-16a1 1 0 0 1 1-1z"/><path d="M12 7v5M9.5 9.5h5"/>',
    searchX: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/><path d="m9 9 4 4M13 9l-4 4"/>',
    layoutSidebar: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
    layoutTop: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18"/>',
    plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    minusCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    plusSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M12 8v8M8 12h8"/>',
    minusSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 12h8"/>',
    xSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
    checkSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
    alertOctagon: '<path d="M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z"/><path d="M12 8v4.5M12 16h.01"/>',
    keyCap: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 15.5h7"/>',
    altKey: '<path d="M3.5 6.5h4.5l6.5 11h6"/><path d="M14.5 6.5h6"/>',
    shiftKey: '<path d="m12 4.5-6.5 6.5H9v5.5h6V11h3.5z"/>',
    capsLock: '<path d="m12 3.5-6 6h3.5V14h5V9.5H18z"/><path d="M9.5 18h5"/>',
    enterKey: '<path d="M20 5.5v6a2.5 2.5 0 0 1-2.5 2.5H4.5"/><path d="M8 10.5 4.5 14 8 17.5"/>',
    backspace: '<path d="M9 5.5h9.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-6.5-6.5z"/><path d="m11.5 9.5 5 5M16.5 9.5l-5 5"/>',
    spaceBar: '<path d="M4 10v3.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10"/>',
    cursorArrow: '<path d="m4 4 6.6 15.8 2.3-6.9 6.9-2.3z"/>',
    cursorClick: '<path d="m8.5 8.5 5 12 1.7-5.3 5.3-1.7z"/><path d="M6 3.5v3M3.5 6h3M13 4l-1 2.7M4 13l2.7-1"/>',
    cursorPointer: '<path d="M9.5 12V4.8a1.6 1.6 0 0 1 3.2 0v5.7l3.9.8a2.6 2.6 0 0 1 2 3l-.5 3.3a4.2 4.2 0 0 1-4.1 3.9h-2.2a4.6 4.6 0 0 1-3.7-1.9l-3-4.2a1.5 1.5 0 0 1 .4-2.1c.7-.5 1.6-.4 2.2.2z"/>',
    cursorGrab: '<path d="M7.2 11V7.2a1.3 1.3 0 0 1 2.6 0V10M9.8 10V5.8a1.3 1.3 0 0 1 2.6 0V10M12.4 10V6.5a1.3 1.3 0 0 1 2.6 0V11M15 11V8.2a1.3 1.3 0 0 1 2.6 0v6.3a6 6 0 0 1-6 6c-2.3 0-3.8-.9-4.9-2.8l-1.5-2.7a1.6 1.6 0 0 1 .6-2.2c.7-.4 1.6-.2 2.1.4l.3.4"/>',
    cursorGrabbing: '<path d="M7.5 12.5v-1.7a1.3 1.3 0 0 1 2.6 0M10.1 10.8v-.5a1.3 1.3 0 0 1 2.6 0M12.7 10.3a1.3 1.3 0 0 1 2.6 0M15.3 10.8a1.3 1.3 0 0 1 2.6 0v3.7a6 6 0 0 1-6 6c-2.3 0-3.8-.9-4.9-2.8l-1.5-2.7a1.6 1.6 0 0 1 .6-2.2c.7-.4 1.6-.2 2.1.4"/>',
    cursorText: '<path d="M9 4.5c1.6 0 2.6.6 3 1.7.4-1.1 1.4-1.7 3-1.7M9 19.5c1.6 0 2.6-.6 3-1.7.4 1.1 1.4 1.7 3 1.7M12 6.2v11.6"/>',
    cursorCrosshair: '<path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6M12 12h.01"/>',
    cursorMove: '<circle cx="12" cy="12" r="1.5"/><path d="M12 8V3.5M9.8 5.7 12 3.5l2.2 2.2M12 16v4.5M9.8 18.3l2.2 2.2 2.2-2.2M8 12H3.5M5.7 9.8 3.5 12l2.2 2.2M16 12h4.5M18.3 9.8l2.2 2.2-2.2 2.2"/>',
    cursorCell: '<path d="M12 4.5v15M4.5 12h15"/><path d="M8.5 4.5h7M8.5 19.5h7M4.5 8.5v7M19.5 8.5v7"/>',
    cursorResizeH: '<path d="M12 6.5v11M8.5 12h-6M15.5 12h6M5.5 9l-3 3 3 3M18.5 9l3 3-3 3"/>',
    cursorResizeV: '<path d="M6.5 12h11M12 8.5v-6M12 15.5v6M9 5.5l3-3 3 3M9 18.5l3 3 3-3"/>',
    cursorResizeDiag: '<path d="M6 18 18 6"/><path d="M12.5 5.5h6v6M11.5 18.5h-6v-6"/>',
    cursorZoomIn: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M10.5 8.5v4M8.5 10.5h4M14.8 14.8l5.7 5.7"/>',
    cursorZoomOut: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M8.5 10.5h4M14.8 14.8l5.7 5.7"/>',
    cursorDraw: '<path d="m17.5 3 3.5 3.5L9.5 18l-4.5 1 1-4.5z"/><path d="M3 21.5c2.6-.1 4.6-.8 6.2-2.2"/>',
    cursorForbidden: '<path d="M4.5 4.5 9.5 16.5l1.7-4.6 4.6-1.7z"/><circle cx="17" cy="17" r="4"/><path d="m14.2 14.2 5.6 5.6"/>',
    circle: '<circle cx="12" cy="12" r="8.5"/>',
    square: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>',
    triangle: '<path d="m12 4.5 8.5 15h-17z"/>',
    pentagon: '<path d="m12 3.5 8.5 6.2-3.2 9.8H6.7L3.5 9.7z"/>',
    octagon: '<path d="M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z"/>',
    rhombus: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/>',
    squircle: '<path d="M12 3.5c6.4 0 8.5 2.1 8.5 8.5s-2.1 8.5-8.5 8.5-8.5-2.1-8.5-8.5S5.6 3.5 12 3.5z"/>',
    starHalf: '<path d="M12 3.5v13.7l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    blob: '<path d="M16.8 4.5c2.4 1.4 4.1 4 3.7 6.7-.4 2.8-2.8 5-5.4 6.6-2.6 1.6-5.4 2.6-7.5 1.5-2.1-1.1-3.4-4.2-3-7 .4-2.9 2.4-5.5 5-7.1 2.7-1.6 4.9-2 7.2-.7z"/>',
    asterisk: '<path d="M12 4.5v15M5.5 8.25 18.5 15.75M18.5 8.25 5.5 15.75"/>',
    slash: '<path d="m16.5 4-9 16"/>',
    dot: '<circle cx="12" cy="12" r="2.5"/>',
    laugh: '<circle cx="12" cy="12" r="9"/><path d="M8 13.5h8a4 4 0 0 1-8 0z"/><path d="M8 9.5c.5-.9 1.5-.9 2 0M14 9.5c.5-.9 1.5-.9 2 0"/>',
    wink: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0M15 9.5h.01M8 9.5h2.5"/>',
    angry: '<circle cx="12" cy="12" r="9"/><path d="M15.5 16.5a4.5 4.5 0 0 0-7 0M8 8.5l2.2 1.2M16 8.5l-2.2 1.2M9.3 12h.01M14.7 12h.01"/>',
    surprised: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="14.5" r="2"/><path d="M9 9h.01M15 9h.01"/>',
    cool: '<circle cx="12" cy="12" r="9"/><path d="M5.5 9.5h13"/><path d="M7 9.5c0 1.8.8 2.8 2.3 2.8s2.2-1 2.2-2.8M12.5 9.5c0 1.8.7 2.8 2.2 2.8S17 11.3 17 9.5"/><path d="M9.5 16.5c1.6.9 3.4.9 5 0"/>',
    heartEyes: '<circle cx="12" cy="12" r="9"/><path d="M8.5 15a4.5 4.5 0 0 0 7 0"/><path d="M7 9c.4-.8 1.4-.9 2-.3.6-.6 1.6-.5 2 .3.3.7-.1 1.4-2 2.7-1.9-1.3-2.3-2-2-2.7zM13 9c.4-.8 1.4-.9 2-.3.6-.6 1.6-.5 2 .3.3.7-.1 1.4-2 2.7-1.9-1.3-2.3-2-2-2.7z"/>',
    cry: '<circle cx="12" cy="12" r="9"/><path d="M15.5 16a4.5 4.5 0 0 0-7 0M9 9.5h.01M15 9.5h.01"/><path d="M16.8 12.5c.8 1 1.2 1.8 1.2 2.4a1.4 1.4 0 0 1-2.8 0c0-.6.4-1.4 1.6-2.4z"/>',
    tongue: '<circle cx="12" cy="12" r="9"/><path d="M9 9.5h.01M15 9.5h.01M8 13h8"/><path d="M10.5 13v2a1.5 1.5 0 0 0 3 0v-2"/>',
    fileImage: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><circle cx="9.8" cy="12.3" r="1.4"/><path d="m8 17.5 2.8-2.8 1.7 1.4 2-2.3 1.5 1.7"/>',
    fileVideo: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><path d="m10 12.5 5 3-5 3z"/>',
    fileAudio: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><circle cx="9.5" cy="16.5" r="1.7"/><path d="M11.2 16.5v-5l4 1"/>',
    folderX: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m9.8 10.8 4.4 4.4M14.2 10.8l-4.4 4.4"/>',
    folderSearch: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="11.3" cy="12.8" r="2.4"/><path d="m13.2 14.7 2.3 2.3"/>',
    folderStar: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m12 9.5.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z"/>',
    playCircle: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
    pauseCircle: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    stopCircle: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    musicNote: '<circle cx="9" cy="17.5" r="3"/><path d="M12 17.5V4l6 2v3.5"/>',
    cameraOff: '<path d="m4 4 16 16"/><path d="M8.3 7H5.5A1.5 1.5 0 0 0 4 8.5V18a1.5 1.5 0 0 0 1.5 1.5h12.4M20 16.5V8.5A1.5 1.5 0 0 0 18.5 7h-2L14.5 4.5h-5l-.7.9"/><path d="M9.6 12.1a3.5 3.5 0 0 0 4.9 4.9"/>',
    airplay: '<path d="M5 17.5h-.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H19"/><path d="M12 14.5 17 20.5H7z"/>',
    clapperboard: '<rect x="3.5" y="9.5" width="17" height="11" rx="2"/><path d="m4 9.5.9-3.9 15.6 1.6-.8 2.3"/><path d="m8.6 6-1 3.5M13.6 6.5l-1 3"/>',
    cartPlus: '<circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/><path d="M3 4.5h2.5L8 15.5h11l1.5-6"/><path d="M14.5 4.5v5M12 7h5"/>',
    dollarSign: '<path d="M12 3v18"/><path d="M16.5 6.5c-.9-1.1-2.4-1.8-4.2-1.8-2.4 0-4.3 1.4-4.3 3.4 0 4 8.8 2 8.8 6.2 0 2-1.9 3.4-4.5 3.4-1.9 0-3.5-.7-4.4-1.9"/>',
    euroSign: '<path d="M18 5.8A7.8 7.8 0 0 0 5.5 12 7.8 7.8 0 0 0 18 18.2"/><path d="M3.5 10.2h9M3.5 13.8h8"/>',
    cashBill: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    basket: '<path d="M4.5 9.5h15l-1.6 9a2 2 0 0 1-2 1.7H8.1a2 2 0 0 1-2-1.7z"/><path d="m8 9.5 4-6 4 6M9.7 13v4M14.3 13v4"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2.5 19h19"/>',
    gitFork: '<circle cx="12" cy="18.5" r="2.3"/><circle cx="6.5" cy="5.5" r="2.3"/><circle cx="17.5" cy="5.5" r="2.3"/><path d="M6.5 7.8v1.7a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V7.8M12 12.5v3.7"/>',
    password: '<rect x="2.5" y="8" width="19" height="8" rx="2.5"/><path d="M6.5 12h.01M10.2 12h.01M13.8 12h.01M17.5 12h.01"/>',
    shieldLock: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.9 7.5-9.5V6z"/><circle cx="12" cy="10.5" r="1.8"/><path d="M12 12.3v3.2"/>',
    tornado: '<path d="M20.5 5.5h-17M18 9.5H5M16 13.5H7.5M13.5 17.5H10M12.5 21h-1"/>',
    bus: '<rect x="4.5" y="3.5" width="15" height="14.5" rx="2.5"/><path d="M4.5 11.5h15M8.5 14.8h.01M15.5 14.8h.01M7 18v2.5M17 18v2.5"/>',
    parking: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M9.5 16.5v-9h3.7a2.8 2.8 0 0 1 0 5.6H9.5"/>',
    signpost: '<path d="M12 3v2M12 12.5V21M8.5 21h7"/><path d="M5.5 5h11.3l2.7 3.75-2.7 3.75H5.5z"/>',
    tooth: '<path d="M12 5.5c-1.5-1.3-3.5-1.8-5-1-2 1-2.7 3.5-2 6 .8 2.8 1.5 5.8 2.5 8.5.4 1 1.8 1 2.2 0l1.3-3.8c.3-.9 1.7-.9 2 0l1.3 3.8c.4 1 1.8 1 2.2 0 1-2.7 1.7-5.7 2.5-8.5.7-2.5 0-5-2-6-1.5-.8-3.5-.3-5 1z"/>',
    dna: '<path d="M7 3c0 6 10 6 10 12v6M17 3c0 6-10 6-10 12v6"/><path d="M7.6 6h8.8M9.8 9h4.4M7.6 18h8.8M9.8 15h4.4"/>',
    iceCream: '<path d="M7.5 11.5h9L12 21z"/><path d="M7.5 11.5a4.5 4.5 0 1 1 9 0"/>',
    cake: '<path d="M4.5 13.5A1.5 1.5 0 0 1 6 12h12a1.5 1.5 0 0 1 1.5 1.5V20h-15z"/><path d="M4.5 16.3c1.2 1 2.5 1 3.7 0s2.6-1 3.8 0 2.6 1 3.8 0 2.5-1 3.7 0"/><path d="M12 12V9.5"/><path d="M12 6.8c-.8-.8-.8-2.1 0-3.1.8 1 .8 2.3 0 3.1z"/>',
    cookie: '<path d="M20.5 12a8.5 8.5 0 1 1-8.5-8.5 4.5 4.5 0 0 0 4.5 4.5 4 4 0 0 0 4 4z"/><path d="M9 10h.01M14 14.5h.01M9.5 15.5h.01M12.5 11.5h.01"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.8 13.5-1.3 7L12 18l4.5 2.5-1.3-7"/>',
    backpack: '<path d="M6.5 9a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"/><path d="M9.5 6V4.8a2.3 2.3 0 0 1 2.3-2.3h.4a2.3 2.3 0 0 1 2.3 2.3V6M6.5 12.5h11M9.5 12.5V15"/>',
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01"/>',
    idCard: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><circle cx="8.5" cy="10.8" r="2"/><path d="M5.5 15.5c.7-1.4 1.7-2 3-2s2.3.6 3 2M14.5 9.5h4M14.5 13h4"/>',
    calendarDays: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/><path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01"/>',
    grin: '<circle cx="12" cy="12" r="9"/><path d="M7.5 13a4.5 4.5 0 0 0 9 0z"/><path d="M9 9h.01M15 9h.01"/>',
    grinBig: '<circle cx="12" cy="12" r="9"/><path d="M7 12.5h10a5 5 0 0 1-10 0z"/><path d="M8.2 8.7c.5-.8 1.6-.8 2.1 0M13.7 8.7c.5-.8 1.6-.8 2.1 0"/>',
    joy: '<circle cx="12" cy="12" r="9"/><path d="M8.5 13.5h7a3.5 3.5 0 0 1-7 0z"/><path d="M8 9.5c.4-.8 1.4-.8 1.8 0M14.2 9.5c.4-.8 1.4-.8 1.8 0"/><path d="M5.5 12c-.7.9-1 1.5-1 2a1.2 1.2 0 0 0 2.4 0c0-.5-.3-1.1-1.4-2zM18.5 12c.7.9 1 1.5 1 2a1.2 1.2 0 0 1-2.4 0c0-.5.3-1.1 1.4-2z"/>',
    smirk: '<circle cx="12" cy="12" r="9"/><path d="M9 15.5c1.8.8 3.8.6 5.5-.7M9 9.5h.01M15 9.5h.01"/>',
    thinking: '<circle cx="12" cy="12" r="9"/><path d="M8.5 9.3h.01M15 9.3h.01M13.5 6.5c.7-.5 1.6-.4 2.2.2M9.5 16.2l4.5-.9"/>',
    expressionless: '<circle cx="12" cy="12" r="9"/><path d="M8 9.5h2M14 9.5h2M9 15h6"/>',
    rollingEyes: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.8" r="1.9"/><circle cx="15" cy="9.8" r="1.9"/><path d="M9 8.6h.01M15 8.6h.01M9.5 15.8h5"/>',
    flushed: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/><path d="M10.5 15.5h3M5.5 12.5h1.5M17 12.5h1.5"/>',
    sleepy: '<circle cx="12" cy="13" r="8"/><path d="M8.5 11.5c.6.6 1.5.6 2.1 0M13.4 11.5c.6.6 1.5.6 2.1 0M10.5 16.5h3"/><path d="M16 2.5h4l-4 4h4"/>',
    dizzy: '<circle cx="12" cy="12" r="9"/><path d="m7.8 8 2.4 2.4M10.2 8 7.8 10.4M13.8 8l2.4 2.4M16.2 8l-2.4 2.4"/><circle cx="12" cy="15.5" r="1.8"/>',
    starStruck: '<circle cx="12" cy="12" r="9"/><path d="m8.5 7.2.7 1.4 1.5.2-1.1 1.1.3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1.1 1.5-.2zM15.5 7.2l.7 1.4 1.5.2-1.1 1.1.3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1.1 1.5-.2z"/><path d="M8.5 15a4.5 4.5 0 0 0 7 0"/>',
    moneyFace: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9.7 7.5c-.4-.4-1.5-.4-1.5.4s1.6.5 1.6 1.3-1.2.8-1.6.4M9 6.8v3.4M15.7 7.5c-.4-.4-1.5-.4-1.5.4s1.6.5 1.6 1.3-1.2.8-1.6.4M15 6.8v3.4"/>',
    nerd: '<circle cx="12" cy="12" r="9"/><circle cx="8.8" cy="10" r="2.3"/><circle cx="15.2" cy="10" r="2.3"/><path d="M11.1 10h1.8M3.5 9.5l3-.8M20.5 9.5l-3-.8M9.5 15.5c1.5 1 3.5 1 5 0"/>',
    monocle: '<circle cx="12" cy="12" r="9"/><circle cx="15" cy="10" r="2.4"/><path d="M9 10h.01M15 12.4V16M9.5 16.5h4"/>',
    mask: '<circle cx="12" cy="12" r="9"/><path d="M9 8.5h.01M15 8.5h.01"/><path d="M7 12.8c3.3-1.3 6.7-1.3 10 0v2.7c-3.3 1.4-6.7 1.4-10 0z"/><path d="m7 13.5-3.4-1M17 13.5l3.4-1"/>',
    sick: '<circle cx="12" cy="12" r="9"/><path d="M8 10c.6-.6 1.4-.6 2 0M14 10c.6-.6 1.4-.6 2 0"/><path d="M8.5 15.5c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0"/>',
    hotFace: '<circle cx="12" cy="12" r="9"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M8.5 15c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0"/><path d="M19.5 3.5c-1 1.2-1.5 2-1.5 2.7a1.5 1.5 0 0 0 3 0c0-.7-.5-1.5-1.5-2.7z"/>',
    coldFace: '<circle cx="12" cy="12" r="9"/><path d="M8 9.5h2M14 9.5h2"/><rect x="8.5" y="13.5" width="7" height="3" rx="1.5"/><path d="M12 13.5v3"/>',
    scream: '<circle cx="12" cy="12" r="9"/><rect x="10" y="12.5" width="4" height="5.5" rx="2"/><path d="M8 9.2c.5-.8 1.5-.8 2 0M14 9.2c.5-.8 1.5-.8 2 0"/>',
    fearful: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="15.5" r="1.7"/><path d="M8.9 9.5h.01M15.1 9.5h.01M7.5 7.4c.7-.6 1.7-.7 2.5-.3M14 7.1c.8-.4 1.8-.3 2.5.3"/>',
    pleading: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10.5" r="2"/><circle cx="15" cy="10.5" r="2"/><path d="M7 6.8c.8-.5 1.7-.6 2.5-.3M14.5 6.5c.8-.3 1.7-.2 2.5.3M10.8 16c.8-.4 1.6-.4 2.4 0"/>',
    zany: '<circle cx="12" cy="12" r="9"/><path d="M7.8 9.8 10 8.6M14 9h.01"/><path d="M8.5 13c1.5 1.2 3.5 1.5 5.5 1"/><path d="m12.5 14.2.6 2.3a1.5 1.5 0 0 0 2.9-.8l-.5-2"/>',
    shush: '<circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 9h.01"/><rect x="10.9" y="12.8" width="2.2" height="6.2" rx="1.1"/>',
    drool: '<circle cx="12" cy="12" r="9"/><path d="M8 10c.6.6 1.4.6 2 0M14 10c.6.6 1.4.6 2 0M9.5 14.5h5"/><path d="M14.8 14.5c.7.9 1 1.6 1 2.1a1.3 1.3 0 0 1-2.6 0c0-.5.3-1.2 1.6-2.1z"/>',
    yawn: '<circle cx="12" cy="12" r="9"/><path d="M8 9.5c.6-.6 1.4-.6 2 0M14 9.5c.6-.6 1.4-.6 2 0"/><circle cx="12" cy="15" r="2.2"/>',
    partyFace: '<circle cx="12" cy="13.5" r="7.5"/><path d="M9.3 6.9 15 2.5l1 6"/><path d="M9.5 15.5a4 4 0 0 0 5.8.6M9.5 11.5h.01M14.5 11h.01"/><path d="M4.5 5h.01M7 2.5h.01M20.5 10h.01"/>',
    angel: '<circle cx="12" cy="14" r="7.5"/><path d="M8 2.9c0 .8 1.8 1.5 4 1.5s4-.7 4-1.5-1.8-1.5-4-1.5-4 .7-4 1.5z"/><path d="M9.3 12.5h.01M14.7 12.5h.01M9.5 16.5a3.5 3.5 0 0 0 5 0"/>',
    devilFace: '<circle cx="12" cy="13.5" r="7.5"/><path d="M6 4.5c.5 1.8 1.5 3 3 3.6M18 4.5c-.5 1.8-1.5 3-3 3.6"/><path d="M9.3 12.5h.01M14.7 12.5h.01M9.5 16.5c1.6.9 3.4.9 5 0"/>',
    upsideDown: '<circle cx="12" cy="12" r="9"/><path d="M9 14.5h.01M15 14.5h.01M8.5 10a4.5 4.5 0 0 1 7 0"/>',
    kissFace: '<circle cx="12" cy="12" r="9"/><path d="M8 9.5h2M15 9.5h.01"/><path d="M11 13.2c1.1.1 1.8.6 1.8 1.2s-.7 1-1.8 1.2c1.1.2 1.8.7 1.8 1.3"/>',
    catFace: '<circle cx="12" cy="13" r="7.5"/><path d="M6 8 4.5 3.5 9 5.7M18 8l1.5-4.5L15 5.7"/><path d="M9.5 12.5h.01M14.5 12.5h.01"/><path d="M2.5 14h3M2.8 17l2.7-.8M21.5 14h-3M21.2 17l-2.7-.8"/><path d="M10.5 16c.4.5 1 .8 1.5.8s1.1-.3 1.5-.8"/>',
    smilePlus: '<circle cx="10.5" cy="12.5" r="8"/><path d="M7.5 14.5a4 4 0 0 0 6 0M8 10h.01M13 10h.01"/><path d="M19 3.5v5M16.5 6h5"/>',
    handWave: '<path d="M7.5 11.5V7.7a1.3 1.3 0 0 1 2.6 0V10M10.1 10V6.3a1.3 1.3 0 0 1 2.6 0V10M12.7 10V7a1.3 1.3 0 0 1 2.6 0v4M15.3 11.5V8.7a1.3 1.3 0 0 1 2.6 0v5.5a6 6 0 0 1-6 6c-2.3 0-3.8-.9-4.9-2.8l-1.4-2.5a1.6 1.6 0 0 1 .6-2.2c.7-.4 1.5-.2 2 .4l.3.4"/><path d="M4.3 4.3a6.5 6.5 0 0 0-1.6 3.2M20.6 3.4a6.5 6.5 0 0 1 1 2.6"/>',
    handPeace: '<path d="M9.3 12 7.5 5.3a1.35 1.35 0 0 1 2.6-.7l1.3 4.9 1.4-5.5a1.35 1.35 0 0 1 2.6.7L13.9 11"/><path d="M13.9 10.5h1.2a1.7 1.7 0 0 1 1.7 1.9l-.3 2.9a6 6 0 0 1-6 5.4h-.4a5.6 5.6 0 0 1-4.6-2.4l-1.9-2.7a1.55 1.55 0 0 1 .4-2.2c.7-.5 1.6-.3 2.1.3l1.4 1.6"/>',
    handOk: '<circle cx="9.5" cy="15" r="3.2"/><path d="M12 12.6 15.4 4.3M15 13.5l4.3-6.3M16.7 15.8l3.8-3.8"/>',
    handPoint: '<path d="M9.5 12V4.8a1.6 1.6 0 0 1 3.2 0v5.7"/><path d="M12.7 10.5h5.8a1.6 1.6 0 0 1 0 3.2h-1.3l.6 3a4.2 4.2 0 0 1-4.1 5h-1.6a4.6 4.6 0 0 1-3.7-1.9l-3-4.2a1.5 1.5 0 0 1 .4-2.1c.7-.5 1.6-.4 2.2.2l1.5 1.6"/>',
    clap: '<path d="M8.7 12.5V8.7a1.3 1.3 0 0 1 2.6 0v2.8M11.3 11.5V7.3a1.3 1.3 0 0 1 2.6 0v4.2M13.9 11.5V8a1.3 1.3 0 0 1 2.6 0v4M16.5 12.5V9.7a1.3 1.3 0 0 1 2.6 0v4.8a6 6 0 0 1-6 6c-2.3 0-3.8-.9-4.9-2.8l-1.3-2.3a1.6 1.6 0 0 1 .6-2.2c.7-.4 1.5-.2 2 .4l.2.3"/><path d="M4.5 6 2.8 4.3M6.8 4.4 6 2.2M3.4 8.8 1.2 8.5"/>',
    muscle: '<path d="M5.5 4.5H9l1.5 3.2L9 11c2.2-1.3 4.6-1.6 6.4-.7 2.1 1 3 3.4 2.1 5.4-.8 1.9-2.8 2.8-5.6 2.8H6a2 2 0 0 1-2-2.3c.4-4 .9-7.8 1.5-11.7z"/>',
    pray: '<path d="M12 3.5v14"/><path d="M12 6.5c-1.4 2.6-3.3 4.7-5.4 6.3-1.2.9-1.3 2.7-.3 3.8l2.4 2.6a2 2 0 0 0 3 .1M12 6.5c1.4 2.6 3.3 4.7 5.4 6.3 1.2.9 1.3 2.7.3 3.8l-2.4 2.6a2 2 0 0 1-3 .1"/>',
    handFist: '<path d="M6.5 14v-3.5A2.5 2.5 0 0 1 9 8h6.5A3.5 3.5 0 0 1 19 11.5v3a6 6 0 0 1-6 6h-.5a6 6 0 0 1-6-6z"/><path d="M9.7 8v2.8M12.5 8v2.8M15.3 8.1V11"/>',
    handHorns: '<path d="M8.3 11.5 6.5 5.2a1.3 1.3 0 0 1 2.5-.7l1.6 5.5M15.7 10.5l1.6-5.3a1.3 1.3 0 0 1 2.5.7l-1.8 6.1"/><path d="M8.2 11h9.6a1.7 1.7 0 0 1 1.7 1.9l-.3 2.6a5.6 5.6 0 0 1-5.6 5h-1.2a5.6 5.6 0 0 1-5.6-5l-.3-2.6A1.7 1.7 0 0 1 8.2 11z"/>',
    hundred: '<path d="m3 8.5 2.5-2v11"/><rect x="8.5" y="6.5" width="5" height="11" rx="2.5"/><rect x="15.5" y="6.5" width="5" height="11" rx="2.5"/><path d="M3.5 21h17"/>',
    heartBroken: '<path d="M12 20.5C6.5 16.7 3.5 13.4 3.5 9.9 3.5 7.2 5.6 5 8.3 5c1.5 0 2.9.7 3.7 1.9C12.8 5.7 14.2 5 15.7 5c2.7 0 4.8 2.2 4.8 4.9 0 3.5-3 6.8-8.5 10.6z"/><path d="m12 6.9-1.5 3 2.5 2-1.5 3.6"/>',
    heartSparkle: '<path d="M11 19.5C6.5 16.4 4 13.6 4 10.7 4 8.4 5.8 6.5 8 6.5c1.2 0 2.4.6 3 1.6.6-1 1.8-1.6 3-1.6 2.2 0 4 1.9 4 4.2 0 2.9-2.5 5.7-7 8.8z"/><path d="M18.5 2.5 19.3 4.7 21.5 5.5 19.3 6.3 18.5 8.5 17.7 6.3 15.5 5.5 17.7 4.7z"/>',
    balloon: '<path d="M12 3a5.5 5.5 0 0 1 5.5 5.7c0 3.3-2.4 6.3-5.5 6.3s-5.5-3-5.5-6.3A5.5 5.5 0 0 1 12 3z"/><path d="m10.9 16.3 1.1-1.3 1.1 1.3"/><path d="M12 16.3c-.7 1.7-.7 3.4 0 5.2"/>',
    partyPopper: '<path d="m3 21 5-13 8 8z"/><path d="M14 7.5c1.3-1.6 2.9-2.4 5-2.5M16.5 10.5c1.7-.5 3.2-.2 4.5.8M12 4.9c.5-1.2.5-2.3 0-3.4"/><path d="M20.5 3.5h.01M17 2.5h.01M21.5 8h.01"/>',
    bomb: '<circle cx="10" cy="14.5" r="6"/><path d="m14.3 10.3 2.4-2.4"/><path d="M16 6.5c.9-1 2.2-1.3 3.4-.8"/><path d="M21 3.5h.01M21.5 7.5h.01M18 2.5h.01"/>',
    confetti: '<path d="M5 4.5h.01M10 3h.01M20.5 5.5h.01M21 12h.01M3.5 12.5h.01M17.5 2.5h.01"/><path d="M13.5 6c-1.3 1.2-1.6 2.6-.8 4.4M6 8.5c1.8.1 3 .9 3.8 2.4M17 9c1.5-.4 2.9-.1 4 .9M12 14.5c.3 1.6 0 3-.9 4.3"/>',
    sunglasses: '<circle cx="7" cy="14.5" r="3.5"/><circle cx="17" cy="14.5" r="3.5"/><path d="M10.5 14.5c.4-.7 1-1 1.5-1s1.1.3 1.5 1"/><path d="M2 11.5c.4-1 1.2-1.7 2.3-2M22 11.5c-.4-1-1.2-1.7-2.3-2"/><path d="m5.5 12.5 3 3.5M15.5 12.5l3 3.5"/>',
    arrowTurnUp: '<path d="M4 20h9a4 4 0 0 0 4-4V4.5"/><path d="M13.5 8 17 4.5 20.5 8"/>',
    arrowTurnDown: '<path d="M4 4h9a4 4 0 0 1 4 4v11.5"/><path d="m13.5 16 3.5 3.5L20.5 16"/>',
    arrowTurnLeft: '<path d="M20 4v9a4 4 0 0 1-4 4H4.5"/><path d="M8 13.5 4.5 17 8 20.5"/>',
    arrowTurnRight: '<path d="M4 4v9a4 4 0 0 0 4 4h11.5"/><path d="M16 13.5 19.5 17 16 20.5"/>',
    arrowsMaximize: '<path d="M9.5 3.5h-6v6M3.8 3.8 9 9M14.5 3.5h6v6M20.2 3.8 15 9M9.5 20.5h-6v-6M3.8 20.2 9 15M14.5 20.5h6v-6M20.2 20.2 15 15"/>',
    arrowsMinimize: '<path d="M9 3.5V9H3.5M8.7 8.7 3.5 3.5M15 3.5V9h5.5M15.3 8.7l5.2-5.2M9 20.5V15H3.5M8.7 15.3l-5.2 5.2M15 20.5V15h5.5M15.3 15.3l5.2 5.2"/>',
    arrowSplit: '<path d="M3.5 12H8c4.5 0 4.5-5.5 8.5-5.5H20"/><path d="M8 12c4.5 0 4.5 5.5 8.5 5.5H20"/><path d="m17.5 3.5 3 3-3 3M17.5 14.5l3 3-3 3"/>',
    arrowMerge: '<path d="M3.5 6.5H7c4.5 0 4.5 5.5 8.5 5.5H20M3.5 17.5H7c4.5 0 4.5-5.5 8.5-5.5"/><path d="m17.5 9 3 3-3 3"/>',
    arrowUpFromDot: '<circle cx="12" cy="19" r="1.8"/><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/>',
    arrowUpToLine: '<path d="M4.5 4.5h15"/><path d="M12 20.5V9M7.5 13.5 12 9l4.5 4.5"/>',
    arrowDownFromLine: '<path d="M4.5 4.5h15"/><path d="M12 9v11.5M7.5 16 12 20.5 16.5 16"/>',
    userCircle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19c1.2-2.6 3.2-4 5.5-4s4.3 1.4 5.5 4"/>',
    userSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="12" cy="10" r="3"/><path d="M6.5 20.5c1-2.8 3-4.3 5.5-4.3s4.5 1.5 5.5 4.3"/>',
    userGear: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7.6 0 1.2 0 1.7.2"/><circle cx="17.5" cy="16.5" r="2"/><path d="M17.5 12.9v1.6M17.5 18.5v1.6M13.9 16.5h1.6M21.1 16.5h-1.6M15 14l1.1 1.1M20 19l-1.1-1.1M15 19l1.1-1.1M20 14l-1.1 1.1"/>',
    userStar: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7.9 0 1.7.1 2.5.4"/><path d="m17.5 13 1 2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3z"/>',
    userClock: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7.5 0 1 0 1.4.1"/><circle cx="17.5" cy="16.5" r="4"/><path d="M17.5 14.8v1.7l1.3.9"/>',
    handHeart: '<path d="M12 8.7c-1.8-1.2-2.7-2.3-2.7-3.4 0-1 .8-1.8 1.7-1.8.4 0 .8.1 1 .4.2-.3.6-.4 1-.4.9 0 1.7.8 1.7 1.8 0 1.1-.9 2.2-2.7 3.4z"/><path d="M4 14.5h3.5l3-1.2a4.5 4.5 0 0 1 3.4 0l2.9 1.2a1.6 1.6 0 0 1-.6 3.1H12"/><path d="M4 19.5h4l3.5.8c1.2.3 2.5.1 3.6-.5l4.9-2.4"/>',
    heartCheck: '<path d="M12 20.5C6.5 16.7 3.5 13.4 3.5 9.9 3.5 7.2 5.6 5 8.3 5c1.5 0 2.9.7 3.7 1.9C12.8 5.7 14.2 5 15.7 5c2.7 0 4.8 2.2 4.8 4.9 0 3.5-3 6.8-8.5 10.6z"/><path d="m9.3 10.3 2 2 3.4-3.6"/>',
    heartMinus: '<path d="M12 20.5C6.5 16.7 3.5 13.4 3.5 9.9 3.5 7.2 5.6 5 8.3 5c1.5 0 2.9.7 3.7 1.9C12.8 5.7 14.2 5 15.7 5c2.7 0 4.8 2.2 4.8 4.9 0 3.5-3 6.8-8.5 10.6z"/><path d="M9.5 11h5"/>',
    homeHeart: '<path d="m4 11 8-7.5L20 11v8.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M12 16.8c-2-1.4-3-2.5-3-3.7 0-1 .8-1.8 1.8-1.8.5 0 .9.2 1.2.6.3-.4.7-.6 1.2-.6 1 0 1.8.8 1.8 1.8 0 1.2-1 2.3-3 3.7z"/>',
    homeWifi: '<path d="m4 11 8-7.5L20 11v8.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 13.5c1.8-1.5 4.2-1.5 6 0M10.7 15.7c.8-.6 1.8-.6 2.6 0M12 17.8h.01"/>',
    homePlus: '<path d="m4 11 8-7.5L20 11v8.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M12 12v6M9 15h6"/>',
    starCircle: '<circle cx="12" cy="12" r="9"/><path d="m12 7 1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.6-3 1.6.6-3.2-2.4-2.3 3.3-.5z"/>',
    starOff: '<path d="m4 4 16 16"/><path d="M9.8 6.3 12 3.5l2.6 5.3 5.9.9-3.6 3.4M17 17.7l.3 1.9-5.3-2.7-5.2 2.7 1-5.8-4.3-4.1 3.3-.5"/>',
    shootingStar: '<path d="m15.5 3.5 1.3 2.7 3 .4-2.2 2.1.5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.2-2.1 3-.4z"/><path d="M11 13 3.5 20.5M8.5 10.5l-5 5M13.5 15.5l-5 5"/>',
    bellMinus: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/><path d="M9.75 9.75h4.5"/>',
    fileHeart: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><path d="M12 17.3c-1.8-1.2-2.7-2.2-2.7-3.3 0-.9.7-1.6 1.6-1.6.4 0 .8.2 1.1.5.3-.3.7-.5 1.1-.5.9 0 1.6.7 1.6 1.6 0 1.1-.9 2.1-2.7 3.3z"/>',
    fileLock: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><rect x="9.5" y="13.5" width="5" height="4" rx="1"/><path d="M10.5 13.5v-1a1.5 1.5 0 0 1 3 0v1"/>',
    fileUser: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><circle cx="12" cy="13" r="1.8"/><path d="M9 18.2c.6-1.3 1.7-2 3-2s2.4.7 3 2"/>',
    fileClock: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><circle cx="12" cy="14.5" r="3"/><path d="M12 13.2v1.5l1.1.8"/>',
    filePen: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><path d="m9 17 .5-2 4.2-4.2a1.1 1.1 0 0 1 1.5 1.5L11 16.5z"/>',
    fileWarning: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M12 11.5v4M12 17.5h.01"/>',
    fileDownload: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M12 11.5v6M9.5 15l2.5 2.5L14.5 15"/>',
    fileUpload: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M12 17.5v-6M9.5 14 12 11.5 14.5 14"/>',
    fileStar: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/><path d="m12 11.5.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3z"/>',
    folderLock: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><rect x="9.5" y="10.5" width="5" height="4" rx="1"/><path d="M10.5 10.5v-1a1.5 1.5 0 0 1 3 0v1"/>',
    folderHeart: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 15.3c-1.9-1.3-2.8-2.3-2.8-3.4 0-.9.7-1.7 1.7-1.7.4 0 .8.2 1.1.5.3-.3.7-.5 1.1-.5 1 0 1.7.8 1.7 1.7 0 1.1-.9 2.1-2.8 3.4z"/>',
    folderCode: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m10 10.5-2 2.3 2 2.2M14 10.5l2 2.3-2 2.2"/>',
    folderDownload: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 9.5v5M9.5 12.5l2.5 2.5 2.5-2.5"/>',
    folderUpload: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 15v-5M9.5 12 12 9.5l2.5 2.5"/>',
    folderClock: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4L12 7h6.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="2.6"/><path d="M12 11.8v1.4l1 .7"/>',
    cameraPlus: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9.5 4.5h5L16.5 7h2A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><path d="M12 10.5v5M9.5 13h5"/>',
    videoPlus: '<rect x="3" y="6.5" width="13" height="11" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/><path d="M9.5 9.5v5M7 12h5"/>',
    imagePlus: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4.5 17.5 4.5-4 3.5 3"/><path d="M16.5 9v5M14 11.5h5"/>',
    musicOff: '<path d="m4 4 16 16"/><circle cx="9" cy="17.5" r="3"/><path d="M12 17.5v-5M12 8V4l6 2v3.5"/>',
    playlistPlus: '<path d="M4 6h12M4 11h12M4 16h6"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
    volumePlus: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M17.5 9.5v5M15 12h5"/>',
    speaker: '<rect x="6" y="3.5" width="12" height="17" rx="2.5"/><circle cx="12" cy="14" r="3.5"/><path d="M12 7h.01"/>',
    waveform: '<path d="M3 10v4M6.5 7.5v9M10 5v14M13.5 8v8M17 6v12M20.5 10v4"/>',
    cloudCheck: '<path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 18.5z"/><path d="m9.5 13 2 2 3.5-3.7"/>',
    cloudAlert: '<path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 18.5z"/><path d="M12 9.5v4M12 16h.01"/>',
    cloudSync: '<path d="M7 15.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 15.5"/><path d="M9.3 18.6a3 3 0 0 1 5.1-1.2M14.7 19.4a3 3 0 0 1-5.1 1.2"/><path d="M14.9 15.9v2h-2M9.1 22.1v-2h2"/>',
    cloudX: '<path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9 5.5 5.5 0 0 1 10.7-1.2A4.3 4.3 0 0 1 17 18.5z"/><path d="m10 10.5 4 4M14 10.5l-4 4"/>',
    monitorCheck: '<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 17v3.5"/><path d="m9 10 2.2 2.2 4-4.2"/>',
    monitorPlay: '<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 17v3.5"/><path d="m10.5 8 4 2.7-4 2.7z"/>',
    laptopCode: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2.5 19h19"/><path d="m10 8-2 2.5 2 2.5M14 8l2 2.5-2 2.5"/>',
    phoneVibrate: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/><path d="M3.5 9c-.7 2-.7 4 0 6M20.5 9c.7 2 .7 4 0 6"/>',
    wifiOff: '<path d="m4 4 16 16"/><path d="M8.7 16.2c2-1.7 4.6-1.7 6.6 0M5.5 13c1.5-1.3 3.2-2.1 5-2.5M12.7 10.6c2 .2 3.9 1 5.8 2.4M2.5 9.5c1.5-1.4 3.2-2.4 5-3M10.5 5.7c4-.6 8 .7 11 3.8"/><path d="M12 19.5h.01"/>',
    bluetoothOff: '<path d="m4 4 16 16"/><path d="M12 12.7V20l5-4-2.7-2.1M12 7.3V4l5 4-1.9 1.5"/><path d="m7 8 3.2 2.6"/>',
    signalLow: '<path d="M3.5 20h.01M8 20v-4"/>',
    batteryAlert: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 11v2M10.5 10v2.5M10.5 14.5h.01"/>',
    memoryChip: '<rect x="2.5" y="7" width="19" height="9" rx="2"/><path d="M6 16v2.5M10 16v2.5M14 16v2.5M18 16v2.5M6.5 10.5v2M10.2 10.5v2M13.8 10.5v2M17.5 10.5v2"/>',
    ethernet: '<path d="M4.5 9h15v8a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 17z"/><path d="M8.5 9V6.5h7V9M10.5 6.5v-2h3v2"/><path d="M7.5 13.5v2M10.5 13.5v2M13.5 13.5v2M16.5 13.5v2"/>',
    webcam: '<circle cx="12" cy="9.5" r="6"/><circle cx="12" cy="9.5" r="2.2"/><path d="M12 15.5V18M7.5 21c1-1.9 2.5-3 4.5-3s3.5 1.1 4.5 3z"/>',
    gamepad: '<path d="M7 8.5h10a5.5 5.5 0 0 1 5.5 5.7c-.1 2.4-2 4.3-4.4 4.3-1.4 0-2.6-.6-3.4-1.7L14 15.5h-4l-.7 1.3c-.8 1.1-2 1.7-3.4 1.7-2.4 0-4.3-1.9-4.4-4.3A5.5 5.5 0 0 1 7 8.5z"/><path d="M8 11.5v3M6.5 13h3M15.5 12h.01M17.5 14h.01"/>',
    gitCompare: '<circle cx="6.5" cy="6" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="M6.5 8.3V13a3 3 0 0 0 3 3h2M17.5 15.7V11a3 3 0 0 0-3-3h-2"/><path d="m13.5 5.5-2.5 2.5 2.5 2.5M10.5 13.5 13 16l-2.5 2.5"/>',
    lockHeart: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 17.8c-1.4-1-2.1-1.8-2.1-2.6 0-.7.5-1.2 1.2-1.2.3 0 .7.1.9.4.2-.3.6-.4.9-.4.7 0 1.2.5 1.2 1.2 0 .8-.7 1.6-2.1 2.6z"/>',
    lockClock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="2.6"/><path d="M12 14.3v1.4l1 .7"/>',
    shieldStar: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.9 7.5-9.5V6z"/><path d="m12 8 1 2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3z"/>',
    shieldZap: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.9 7.5-9.5V6z"/><path d="m13 7.5-4 5h3l-1 4 4-5h-3z"/>',
    cctv: '<path d="m3 9 11-4.7 2.7 6.3-11 4.7z"/><path d="M9.7 14.9 10.5 17H15M21 7.5l-3.6 1.5"/>',
    userLock: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-3.2 3.9-4.7 7-4.7.7 0 1.4.1 2 .2"/><rect x="15" y="14.5" width="6.5" height="5" rx="1.2"/><path d="M16.5 14.5v-1.3a1.8 1.8 0 0 1 3.6 0v1.3"/>',
    calendarHeart: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/><path d="M12 18c-1.8-1.2-2.7-2.2-2.7-3.2 0-.8.6-1.5 1.5-1.5.4 0 .9.2 1.2.5.3-.3.8-.5 1.2-.5.9 0 1.5.7 1.5 1.5 0 1-.9 2-2.7 3.2z"/>',
    calendarStar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/><path d="m12 12.5.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3z"/>',
    calendarClock: '<path d="M20.5 11V7.5A2.5 2.5 0 0 0 18 5H6A2.5 2.5 0 0 0 3.5 7.5v11A2.5 2.5 0 0 0 6 21h5.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5"/><circle cx="17.5" cy="17.5" r="4"/><path d="M17.5 15.8v1.7l1.3.9"/>',
    calendarMinus: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5M9.5 15h5"/>',
    clockAlert: '<circle cx="11" cy="12" r="8.5"/><path d="M11 7v5l3 2"/><path d="M21.5 8.5v5M21.5 16.5h.01"/>',
    clockCheck: '<circle cx="11" cy="12" r="8.5"/><path d="M11 7.5V12l2 1.5"/><path d="m15.5 16.5 2 2 4-4.2"/>',
    clockPlus: '<circle cx="11" cy="12" r="8.5"/><path d="M11 7.5V12l2.5 1.7"/><path d="M18.5 15.5v6M15.5 18.5h6"/>',
    alarmPlus: '<circle cx="12" cy="13" r="7.5"/><path d="M12 10v6M9 13h6"/><path d="M5.5 4 3 6.5M18.5 4 21 6.5"/>',
    chatLock: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><rect x="9.5" y="9" width="5" height="4" rx="1"/><path d="M10.5 9V8a1.5 1.5 0 0 1 3 0v1"/>',
    chatStar: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="m12 6.5.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3z"/>',
    messageOff: '<path d="m4 4 16 16"/><path d="M8.4 5.5H18.5a2 2 0 0 1 2 2V15a2 2 0 0 1-.6 1.4M16 17H8l-4.5 4V7a2 2 0 0 1 .7-1.5"/>',
    mailLock: '<path d="M21 10.5V8a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 8v8a2.5 2.5 0 0 0 2.5 2.5H12"/><path d="m4 7.5 8 6 8-6"/><rect x="15" y="14.5" width="6" height="5" rx="1.2"/><path d="M16.3 14.5v-1.2a1.7 1.7 0 0 1 3.4 0v1.2"/>',
    mailHeart: '<path d="M21 10.5V8a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 8v8a2.5 2.5 0 0 0 2.5 2.5H12"/><path d="m4 7.5 8 6 8-6"/><path d="M18 21c-2.3-1.6-3.5-2.9-3.5-4.3 0-1.1.9-2 2-2 .6 0 1.1.3 1.5.7.4-.4.9-.7 1.5-.7 1.1 0 2 .9 2 2 0 1.4-1.2 2.7-3.5 4.3z"/>',
    mailOff: '<path d="m4 4 16 16"/><path d="M8.5 5.5h10A2.5 2.5 0 0 1 21 8v8c0 .5-.1.9-.4 1.3M17 18.5H5.5A2.5 2.5 0 0 1 3 16V8c0-.6.2-1.2.6-1.7"/><path d="m4 7.5 8 6 2.5-1.9"/>',
    phonePlus: '<path d="M6.8 3.5c.6 0 1.9 2.6 1.9 3.3 0 1.2-1.8 1.6-1.8 2.7 0 1.5 3.9 6 5.6 6 1 0 1.5-1.8 2.6-1.8.7 0 3.4 1.3 3.4 1.9 0 1.9-2 4-3.9 4-4.4 0-11.1-7.3-11.1-11.9 0-2 2-4.2 3.3-4.2z"/><path d="M17.5 3.5v5M15 6h5"/>',
    phoneX: '<path d="M6.8 3.5c.6 0 1.9 2.6 1.9 3.3 0 1.2-1.8 1.6-1.8 2.7 0 1.5 3.9 6 5.6 6 1 0 1.5-1.8 2.6-1.8.7 0 3.4 1.3 3.4 1.9 0 1.9-2 4-3.9 4-4.4 0-11.1-7.3-11.1-11.9 0-2 2-4.2 3.3-4.2z"/><path d="m15.8 3.3 4.4 4.4M20.2 3.3l-4.4 4.4"/>',
    replyAll: '<path d="M7.5 4 2 9.5 7.5 15"/><path d="M12.5 4 7 9.5l5.5 5.5"/><path d="M7 9.5h7.5a6 6 0 0 1 6 6V19.5"/>',
    mailbox: '<path d="M3.5 16.5v-6A4.5 4.5 0 0 1 8 6h8a4.5 4.5 0 0 1 4.5 4.5v6z"/><path d="M12 16.5v4M16 6V2.5h3.5V5H16"/><path d="M6.5 10.5h4"/>',
    cartCheck: '<circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/><path d="M3 4.5h2.5L8 15.5h11l1.5-6"/><path d="m11.5 7 2 2 3.5-3.7"/>',
    cartX: '<circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/><path d="M3 4.5h2.5L8 15.5h11l1.5-6"/><path d="m12 4.5 4 4M16 4.5l-4 4"/>',
    piggyBank: '<path d="M11.5 5.5c3.9 0 7 2.5 7 5.8 0 1.6-.7 3-1.9 4l-.5 2.7h-2.4l-.3-1.2h-3.8l-.3 1.2H6.9l-.5-2.6c-.9-.7-1.6-1.6-1.9-2.7H3v-2.2h1.6c.6-2.9 3.4-5 6.9-5z"/><path d="M15 10.5h.01M9.5 4.5h4"/>',
    handCoin: '<circle cx="12" cy="6" r="3"/><path d="M4 14.5h3.5l3-1.2a4.5 4.5 0 0 1 3.4 0l2.9 1.2a1.6 1.6 0 0 1-.6 3.1H12"/><path d="M4 19.5h4l3.5.8c1.2.3 2.5.1 3.6-.5l4.9-2.4"/>',
    moneyBag: '<path d="M9.5 7.5C7 9.5 5 12.5 5 15.5c0 3.2 2.8 5 7 5s7-1.8 7-5c0-3-2-6-4.5-8"/><path d="M9.5 7.5 8 4.5c2.6.8 5.4.8 8 0l-1.5 3z"/><path d="M12 10.5v7M14.2 12c-.5-.7-1.3-1.1-2.2-1.1-1.3 0-2.3.7-2.3 1.7 0 2.1 4.6 1 4.6 3 0 1-1 1.7-2.3 1.7-.9 0-1.7-.4-2.2-1.1"/>',
    tagPlus: '<path d="m3.5 12.5 8-9h9v9l-8 9z"/><path d="M10.5 10.5v5M8 13h5"/>',
    packageCheck: '<path d="m12 3 8.5 4.7v8.6L12 21l-8.5-4.7V7.7z"/><path d="m8.8 11.8 2.2 2.2 4.2-4.4"/>',
    percentCircle: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><circle cx="9.8" cy="9.8" r="1.2"/><circle cx="14.2" cy="14.2" r="1.2"/>',
    chartUp: '<path d="M3.5 4v16.5H21"/><path d="m7 15 4-4 3 2.5 5.5-6"/><path d="M15.5 7.5h4v4"/>',
    chartDown: '<path d="M3.5 4v16.5H21"/><path d="m7 9 4 4 3-2.5 5.5 6"/><path d="M15.5 16.5h4v-4"/>',
    chartMixed: '<path d="M3.5 20.5H21"/><path d="M6.5 17v-4M11.5 17V9.5M16.5 17v-6"/><path d="m5 7.5 5.5-3 4.5 2 4.5-3"/>',
    brainCircuit: '<path d="M12 5a3 3 0 0 0-5.8 1A3.4 3.4 0 0 0 4 9.3c0 .9.3 1.7.9 2.3a3.4 3.4 0 0 0 .7 5.1 3.1 3.1 0 0 0 6 .8"/><path d="M12 5v13.5"/><path d="M12 8h3.5l2-2M12 12h5.5M12 16h3.5l2 2"/><circle cx="19" cy="5.5" r="1.3"/><circle cx="19.5" cy="12" r="1.3"/><circle cx="19" cy="18.5" r="1.3"/>',
    chartRadar: '<path d="m12 3.5 8.5 6.2-3.2 9.8H6.7L3.5 9.7z"/><path d="m12 8 4.2 3-1.6 5H9.4L7.8 11z"/><path d="M12 3.5V8M20.5 9.7 16.2 11M17.3 19.5 14.6 16M6.7 19.5 9.4 16M3.5 9.7 7.8 11"/>',
    moonStar: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/><path d="m17 3.5.8 1.7 1.7.8-1.7.8L17 8.5l-.8-1.7-1.7-.8 1.7-.8z"/>',
    planet: '<circle cx="12" cy="12" r="5.5"/><path d="M17.3 9.9c2.6.1 4.4.7 4.6 1.7.3 1.5-3.2 3.5-7.8 4.4-4.6 1-8.6.5-8.9-1-.2-1 1.2-2.1 3.5-3"/>',
    cactus: '<path d="M10 21.5V7a2 2 0 0 1 4 0v14.5"/><path d="M14 12h1.5a2 2 0 0 0 2-2V8.5M10 14H8.5a2 2 0 0 1-2-2V10"/><path d="M7 21.5h10"/>',
    mushroom: '<path d="M3.5 11.5C3.5 7 7.3 3.5 12 3.5s8.5 3.5 8.5 8c-2.8 1-5.7 1.5-8.5 1.5s-5.7-.5-8.5-1.5z"/><path d="M9.5 13c-.4 2.4-.4 4.5 0 6.3a1.8 1.8 0 0 0 1.8 1.2h1.4a1.8 1.8 0 0 0 1.8-1.2c.4-1.8.4-3.9 0-6.3"/><path d="M8 8h.01M12 6.5h.01M16 8h.01"/>',
    trafficLight: '<rect x="8" y="2.5" width="8" height="19" rx="3"/><path d="M12 6.5h.01M12 12h.01M12 17.5h.01"/>',
    steeringWheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M3.5 12h6M14.5 12h6M12 14.5v6"/>',
    sailboat: '<path d="M12.5 3.5c3.8 2.6 6 6.3 6.5 11H12.5z"/><path d="M10.5 6.5c-2.4 2-3.9 4.7-4.4 8h4.4z"/><path d="M3.5 17.5h17l-1.8 2.4a2 2 0 0 1-1.6.8H6.9a2 2 0 0 1-1.6-.8z"/>',
    skateboard: '<path d="M3.5 14.5c1 1.3 2.3 2 4 2h9c1.7 0 3-.7 4-2"/><circle cx="8" cy="19" r="1.8"/><circle cx="16" cy="19" r="1.8"/>',
    doorClosed: '<path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 5v15.5"/><path d="M3 20.5h18M15.5 12h.01"/>',
    doorOpen: '<path d="M13.5 3.5H18A1.5 1.5 0 0 1 19.5 5v15.5"/><path d="M13.5 21.5 5.5 19.8V5.4l8-1.9z"/><path d="M11 11.5v2M3 21.5h18"/>',
    bridge: '<path d="M2.5 17.5c0-6 4.3-10 9.5-10s9.5 4 9.5 10"/><path d="M2 17.5h20M6 17.5v-4.7M12 17.5v-6M18 17.5v-4.7"/>',
    lighthouse: '<path d="M9.5 8.5h5l1.5 12h-8z"/><path d="M9.5 8.5 12 3.5l2.5 5M9 12.5c2 .7 4 .7 6 0"/><path d="M3.5 4.5 6.5 6M20.5 4.5 17.5 6"/>',
    wheelchair: '<circle cx="10" cy="16.5" r="5"/><circle cx="10.5" cy="4.5" r="1.8"/><path d="M10.5 6.5v5H16l2.5 6"/>',
    glasses: '<circle cx="6.5" cy="15" r="3.5"/><circle cx="17.5" cy="15" r="3.5"/><path d="M10 15c.6-.8 1.3-1.2 2-1.2s1.4.4 2 1.2"/><path d="M3 15 4.5 6.5M21 15 19.5 6.5"/>',
    burger: '<path d="M4.5 9.5C4.5 6.2 7.8 3.8 12 3.8s7.5 2.4 7.5 5.7z"/><path d="M3.5 12.5h17"/><path d="M4.5 15.5h15V17a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z"/><path d="M8 7h.01M12 6.5h.01M16 7h.01"/>',
    eggFried: '<circle cx="11.5" cy="12.5" r="3"/><path d="M11.5 3.5c4.6 0 6.6 3.2 6.9 6.2.1 1.5 1.1 2.2 1.1 3.8 0 4-3.6 7-8 7s-8-3-8-7c0-1.7.6-3.1 1.6-4.3C6.3 6.6 8 3.5 11.5 3.5z"/>',
    candy: '<circle cx="12" cy="12" r="4.5"/><path d="M16.3 10.2 20.5 7.5v9l-4.2-2.7M7.7 10.2 3.5 7.5v9l4.2-2.7"/>',
    carrot: '<path d="M13.5 10.5c2 2 3 4.2 2.4 5.9-1.6 4-9.9 5.6-12.4 4.1-1.5-2.5.1-10.8 4.1-12.4 1.7-.6 3.9.4 5.9 2.4z"/><path d="m13.5 10.5 2-2M15.5 4.5c-.6 1.5-1.3 2.6-2.4 3.6M19.5 8.5c-1.5.6-2.6 1.3-3.6 2.4"/>',
    donut: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M6.5 8.5h.01M9 16.5h.01M16 15.5h.01M15.5 7.5h.01"/>',
    abacus: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 9h16M4 15h16"/><circle cx="8" cy="6.2" r="1.2"/><circle cx="12" cy="6.2" r="1.2"/><circle cx="9.5" cy="12" r="1.2"/><circle cx="14.5" cy="12" r="1.2"/><circle cx="11" cy="17.8" r="1.2"/>',
    microscope: '<path d="M6 20.5h12"/><path d="M8.5 17.5h7"/><path d="M13.5 17.4a6 6 0 0 0 2.6-10.6"/><path d="m7.5 4.5 2-2 5 5-2 2z"/><path d="m9.5 8.5-1.5 1.5 2 2 1.5-1.5"/>',
    bookHeart: '<path d="M4.5 19.5A2.5 2.5 0 0 1 7 17h12.5"/><path d="M7 2.5h12.5v19H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5z"/><path d="M13 12.3c-1.9-1.3-2.8-2.4-2.8-3.5 0-.9.7-1.7 1.7-1.7.4 0 .8.2 1.1.5.3-.3.7-.5 1.1-.5 1 0 1.7.8 1.7 1.7 0 1.1-.9 2.2-2.8 3.5z"/>',
    lanyard: '<path d="M9.5 9.5v-2a2.5 2.5 0 0 1 5 0v2"/><rect x="6.5" y="9.5" width="11" height="11" rx="2"/><path d="M9.5 13.5h5M9.5 16.5h3"/>',
    searchHeart: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/><path d="M11 13.6c-1.5-1-2.2-1.9-2.2-2.7 0-.7.5-1.3 1.2-1.3.4 0 .7.2 1 .5.3-.3.6-.5 1-.5.7 0 1.2.6 1.2 1.3 0 .8-.7 1.7-2.2 2.7z"/>',
    searchCheck: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/><path d="m8.5 11 1.8 1.8 3.2-3.4"/>',
    linkOff: '<path d="m4 4 16 16"/><path d="M8 12l-2.2 2.2a3.8 3.8 0 0 0 5.4 5.4L13 18M16 12l2.2-2.2a3.8 3.8 0 0 0-5.4-5.4L11 6"/>',
    link2: '<path d="M8.5 7.5H8a4.5 4.5 0 0 0 0 9h.5M15.5 7.5h.5a4.5 4.5 0 0 1 0 9h-.5M8 12h8"/>',
    bookmarkX: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16L12 16.5 5.5 20.5v-16a1 1 0 0 1 1-1z"/><path d="m9.8 7.3 4.4 4.4M14.2 7.3l-4.4 4.4"/>',
    bookmarkCheck: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16L12 16.5 5.5 20.5v-16a1 1 0 0 1 1-1z"/><path d="m9 9.3 2.2 2.2 4-4.2"/>',
    copyCheck: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/><path d="m11.5 14.5 2.2 2.2 3.8-4"/>',
    copyPlus: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/><path d="M14.5 11.5v6M11.5 14.5h6"/>',
    listChecks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 5.5 1.2 1.2 2-2.2M3.5 11.5l1.2 1.2 2-2.2M3.5 17.5l1.2 1.2 2-2.2"/>',
    gridPlus: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
    textStrikethrough: '<path d="M7 6.5c.6-1.5 2.4-2.5 4.8-2.5 2.1 0 3.8.8 4.5 2.1M16.8 15c.2.4.2.8.2 1.2 0 2-2 3.3-4.7 3.3-2.4 0-4.3-1-4.9-2.6"/><path d="M4 11.5h16"/>',
    indent: '<path d="M10.5 6H20M10.5 12H20M4 18h16"/><path d="m4 7 3.5 2.5L4 12"/>',
    outdent: '<path d="M10.5 6H20M10.5 12H20M4 18h16"/><path d="M7.5 7 4 9.5 7.5 12"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
    pcTower: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 7h4M10 10.5h4M10 17h.01"/>',
    mouseDevice: '<rect x="8" y="4" width="8" height="16" rx="4"/><path d="M12 7v3"/>',
    keyboardKeys: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M6.5 10.5h.01M9.8 10.5h.01M13.1 10.5h.01M16.4 10.5h.01M7.5 13.8h9"/>',
    monitorStand: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v3M8.5 21h7"/>',
    ram: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M6.5 8v5M10 8v5M13.5 8v5M17 8v5M5 16v2M9 16v2M15 16v2M19 16v2"/>',
    ssd: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10h8M8 13.5h5M16.5 15.5h.01"/>',
    usbStick: '<rect x="9" y="8" width="6" height="13" rx="2"/><path d="M10.5 8V4.5A1.5 1.5 0 0 1 12 3a1.5 1.5 0 0 1 1.5 1.5V8M11 5.5h.01M13 5.5h.01"/>',
    motherboard: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="7" y="7" width="5" height="5" rx="1"/><circle cx="16.5" cy="9" r="1.6"/><path d="M7 16.5h4M15 14v3.5M18 14v3.5"/>',
    circuitLines: '<circle cx="6" cy="6" r="1.8"/><circle cx="18" cy="18" r="1.8"/><path d="M7.8 6H14a2 2 0 0 1 2 2v3M16.2 18H10a2 2 0 0 1-2-2v-3"/>',
    powerCable: '<path d="M9 3v5M15 3v5"/><rect x="7" y="8" width="10" height="6" rx="1.5"/><path d="M12 14v3a3 3 0 0 1-3 3H5"/>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13.5" width="4" height="6.5" rx="1.8"/><rect x="17" y="13.5" width="4" height="6.5" rx="1.8"/>',
    serverRack: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M7.5 6h.01M7.5 12h.01M7.5 18h.01M11 6h4M11 12h4M11 18h4"/>',
    routerWifi: '<rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7 16.5h.01M10 16.5h.01M12 9.5a5 5 0 0 1 5 0M10.2 7a8 8 0 0 1 8.6 0"/><path d="M16.5 13v-2"/>',
    smartwatchFace: '<rect x="7" y="6.5" width="10" height="11" rx="3"/><path d="M9 6.5 9.6 3h4.8L15 6.5M9 17.5 9.6 21h4.8l.6-3.5M12 10.5V13l1.8 1"/>',
    plugPower: '<path d="M9 3v5M15 3v5M7 8h10l-1 6a4 4 0 0 1-8 0z"/><path d="M12 18v3"/>',
    databaseGear: '<path d="M3.5 5.5a6.5 2.5 0 1 0 13 0a6.5 2.5 0 1 0 -13 0"/><path d="M3.5 5.5V17c0 1.4 2.9 2.5 6.5 2.5"/><path d="M3.5 11.2c0 1.4 2.9 2.5 6.5 2.5"/><circle cx="17.5" cy="16.5" r="2"/><path d="M17.5 12.8v1.4M17.5 18.8v1.4M20.7 14.6l-1.2.7M15.5 18.2l-1.2.7M14.3 14.6l1.2.7M19.5 18.2l1.2.7"/>',
    databaseCheck: '<path d="M4 5.5a7 2.6 0 1 0 14 0a7 2.6 0 1 0 -14 0"/><path d="M4 5.5v12c0 1.4 3.1 2.6 7 2.6"/><path d="M4 11.5c0 1.4 3.1 2.6 7 2.6"/><path d="m14.5 16.6 2 2 3.5-3.8"/>',
    databasePlus: '<path d="M4 5.5a7 2.6 0 1 0 14 0a7 2.6 0 1 0 -14 0"/><path d="M4 5.5v12c0 1.4 3.1 2.6 7 2.6"/><path d="M4 11.5c0 1.4 3.1 2.6 7 2.6"/><path d="M17.5 13.5v6M14.5 16.5h6"/>',
    databaseZap: '<path d="M4 5.5a7 2.6 0 1 0 14 0a7 2.6 0 1 0 -14 0"/><path d="M4 5.5v12c0 1.4 3.1 2.6 7 2.6"/><path d="M4 11.5c0 1.4 3.1 2.6 7 2.6"/><path d="M18.5 12.5 15.8 17h3l-2.5 4"/>',
    tableFurniture: '<path d="M3 9h18M5 9v9M19 9v9M8 13h8"/>',
    chairSeat: '<path d="M7 3v8M17 3v8M7 7h10M6 11h12v3H6zM7.5 14v6M16.5 14v6"/>',
    deskLamp: '<path d="M6 21h9M10.5 21 8 13.5 13 8"/><path d="m11.6 6.2 4.3-1.7 2.5 5.7-4.6 1.4z"/><path d="M17 12.5 19 15"/>',
    sofa: '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3.5 13.5a2 2 0 0 1 4 0V14h9v-.5a2 2 0 0 1 4 0V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z"/><path d="M5.5 18.5V20M18.5 18.5V20"/>',
    windowFrame: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M12 3.5v17M4 12h16"/>',
    shelfBooks: '<path d="M3 4h18M3 12h18M3 20h18"/><path d="M6 12V6.5M9.5 12V8M14 12l2-5"/><path d="M7 20v-5M12 20v-4"/>',
    doorHandle: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M14.8 12.5h.01"/>',
    mirrorOval: '<path d="M6 10a6 7.5 0 1 0 12 0a6 7.5 0 1 0 -12 0"/><path d="M12 17.5V21M8.5 21h7M9.3 7.2a4.4 4.4 0 0 1 2.2-1.7"/>',
    personStand: '<circle cx="12" cy="5.5" r="2.5"/><path d="M12 8v7M12 15l-3.5 5.5M12 15l3.5 5.5M7 10.5h10"/>',
    personWalk: '<circle cx="13" cy="4.5" r="2.2"/><path d="M13 7 10.5 12l1.5 3.5-2.5 5M13 7l2.5 3 3 1M12 15.5l3.4 1 1.6 4M10.5 12l-3.5 1.5"/>',
    personSit: '<circle cx="10" cy="5" r="2.2"/><path d="M10 7.5v5.5h6l2 7"/><path d="M10 13H7a2 2 0 0 0-2 2v5"/>',
    personsPair: '<circle cx="8.5" cy="6.5" r="2.4"/><circle cx="16" cy="7.5" r="2"/><path d="M4 20c.6-3.8 2.2-5.7 4.5-5.7S12.4 16.2 13 20"/><path d="M13.8 19c.4-2.9 1.3-4.5 2.9-4.6 1.7-.1 2.9 1.5 3.3 4.6"/>',
    family: '<circle cx="7" cy="6" r="2.2"/><circle cx="17" cy="6" r="2.2"/><circle cx="12" cy="11" r="1.8"/><path d="M3.5 20c.4-3.2 1.6-4.9 3.5-4.9s3.1 1.7 3.5 4.9M13.5 20c.4-3.2 1.6-4.9 3.5-4.9s3.1 1.7 3.5 4.9M9.8 15.8c.5-1.4 1.3-2.1 2.2-2.1s1.7.7 2.2 2.1"/>',
    baby: '<circle cx="12" cy="8" r="4.5"/><path d="M12 3.5V2M10.5 7.5h.01M13.5 7.5h.01M10.8 9.8a2 2 0 0 0 2.4 0"/><path d="M7 16.5a5.5 5.5 0 0 0 10 0"/>',
    breadLoaf: '<path d="M4 10a3.5 3.5 0 0 1 3.5-3.5h9A3.5 3.5 0 0 1 20 10c0 1.2-.8 2.1-1.5 2.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19v-6.5C4.8 12.1 4 11.2 4 10z"/><path d="M9 12.5 11 10M13 12.5 15 10"/>',
    cheeseWedge: '<path d="M3.5 13 19 6.5a2 2 0 0 1 1.5 2V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z"/><path d="M9 13.5h.01M14.5 15h.01M11.5 10.5h.01"/>',
    fishFood: '<path d="M3.5 12s3-5 8-5c4.5 0 7.5 3 9 5-1.5 2-4.5 5-9 5-5 0-8-5-8-5z"/><path d="M17 12h.01M3.5 12 6 9.5M3.5 12 6 14.5"/>',
    salad: '<path d="M4 13h16a8 8 0 0 1-16 0z"/><path d="M7 13c0-3 1.5-5.5 4-6.5M13 6.5c2.5 1 4 3.5 4 6.5M11 6.5h3"/>',
    soupBowl: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M8 9c0-1.2 1-1.5 1-2.6M12 9c0-1.2 1-1.5 1-2.6M16 9c0-1.2 1-1.5 1-2.6"/>',
    sushiRoll: '<path d="M4 9a8 3.2 0 1 0 16 0a8 3.2 0 1 0 -16 0"/><path d="M4 9v6c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V9"/><path d="M8.5 9a3.5 1.4 0 1 0 7 0a3.5 1.4 0 1 0 -7 0"/>',
    taco: '<path d="M3.5 17a8.5 8.5 0 0 1 17 0z"/><path d="M6.5 14.5c.8-2.5 2.9-4 5.5-4s4.7 1.5 5.5 4"/><path d="M9 13h.01M13 12h.01M15.5 14h.01"/>',
    bottleWater: '<path d="M10 3h4M10.5 5.5h3l1.5 3.5v10A1.5 1.5 0 0 1 13.5 20h-3A1.5 1.5 0 0 1 9 19V9z"/><path d="M9 12.5h6"/>',
    beerMug: '<path d="M6 7h9v13a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 6 20z"/><path d="M15 10h2.5A1.5 1.5 0 0 1 19 11.5v4a1.5 1.5 0 0 1-1.5 1.5H15M6 7c0-2 1.5-3.5 4.5-3.5S15 5 15 7M9.5 11v6M12 11v6"/>',
    teaCup: '<path d="M5 9h12v5a5 5 0 0 1-10 0z"/><path d="M17 10.5h1.5a2 2 0 0 1 0 4H16M8.5 6.5c0-1 .8-1.2.8-2.1M12.5 6.5c0-1 .8-1.2.8-2.1"/>',
    batteryHalf: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 10.5v3M5.5 10.5v3M8.5 10.5v3"/>',
    batteryEmpty: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 10.5v3"/>',
    batteryDead: '<rect x="2.5" y="8" width="16" height="8" rx="2"/><path d="M21.5 10.5v3M7 10l7 4M14 10l-7 4"/>',
    batteryWarning: '<path d="M8.5 8H4.5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4M15 8h1.5a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H15M21.5 10.5v3"/><path d="M11.8 8.5v4M11.8 15.5h.01"/>',
    batteryBroken: '<path d="M9 8H4.5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2H8M14.5 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-3M21.5 10.5v3"/><path d="m11.8 7.5-1.6 3.2 2.6 1-2 4"/>',
    windowMinimize: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 15.5h8"/>',
    windowMaximize: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    windowRestore: '<path d="M8 6V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 20 5v9a1.5 1.5 0 0 1-1.5 1.5H17"/><rect x="4" y="8" width="12" height="12" rx="1.5"/>',
    windowClose: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
    windowMode: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M6 6h.01M8.5 6h.01"/>',
    windowSplit: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M12 4v16"/>',
    bellAlert: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0M12 7v2.6M12 12h.01"/>',
    bellX: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0M10.3 8l3.4 3.4M13.7 8l-3.4 3.4"/>',
    notificationBadge: '<rect x="3.5" y="5" width="14" height="14" rx="3"/><circle cx="18.5" cy="6" r="2.6"/>',
    notificationOff: '<rect x="4.5" y="5.5" width="13" height="13" rx="3"/><circle cx="18.5" cy="6" r="2.4"/><path d="M4 4l16 16"/>',
    screenCracked: '<rect x="3" y="4.5" width="18" height="13" rx="2"/><path d="M9 21h6M12 17.5V21"/><path d="m10 4.5 2 4-3 2.5 4 3"/>',
    phoneCracked: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/><path d="m11 2.5 1.6 3.4-2.4 2.2 3.2 2.6"/>',
    serverDown: '<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/><path d="m14 6 4 3M18 6l-4 3M14 15.5l4 3M18 15.5l-4 3"/>',
    bulb: '<path d="M9 15a5.5 5.5 0 1 1 6 0c-.8.6-1 1.3-1 2.5h-4c0-1.2-.2-1.9-1-2.5z"/><path d="M10 20.5h4"/>',
    bulbOff: '<path d="M9 15a5.5 5.5 0 1 1 6 0c-.8.6-1 1.3-1 2.5h-4c0-1.2-.2-1.9-1-2.5z"/><path d="M10 20.5h4M4 4l16 16"/>',
    cameraBroken: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9.5 4.5h5L16.5 7h2A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><path d="m10 9.5 2.4 2-1.8 1.8 2.8 2.4"/>',
    toolBroken: '<path d="M13.5 6.5a4 4 0 0 1 5-1.4l-2.8 2.8 1.4 1.4L19.9 6.5a4 4 0 0 1-5.4 5z"/><path d="m13 12-6.5 6.5a1.7 1.7 0 0 1-2.4-2.4L10 10"/><path d="m15.5 15.5 2 2M19 14.5l1.5 1.5"/>',
    chainBroken: '<path d="M8.5 15.5 5.8 18.2a3.2 3.2 0 0 0 4.5 4.5l2.7-2.7"/><path d="M15.5 8.5l2.7-2.7a3.2 3.2 0 0 0-4.5-4.5"/><path d="M11 4.5 12 7M4.5 11 7 12M17 19.5 16 17M19.5 13 17 12"/>',
    fridge: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 9.5h12M9 5.5V7M9 12.5v3"/>',
    stove: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M8 3.5V6M16 3.5V6"/><circle cx="9" cy="15" r="2"/><circle cx="15" cy="15" r="2"/>',
    microwave: '<rect x="3" y="6" width="18" height="12" rx="2"/><rect x="6" y="9" width="8" height="6" rx="1"/><path d="M17.5 9.5v.01M17.5 12.5v.01M6.5 20.5v.01M17.5 20.5v.01"/>',
    blender: '<path d="M8 3h8l-1.5 10h-5z"/><path d="M9 16h6l.8 4.5H8.2z"/><path d="M12 6v4"/>',
    toaster: '<path d="M4 11a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7H4z"/><path d="M8 8V5.5M12 8V5M16 8V5.5M7.5 14h.01"/>',
    kettle: '<path d="M8 8h8l1.5 11a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19z"/><path d="M8.5 8c0-2 1.3-3.5 3.5-3.5S15.5 6 15.5 8M16.5 11H19a1.5 1.5 0 0 1 0 3h-2"/>',
    washingMachine: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M9.5 13a2.5 2.5 0 0 0 5 0M7 6h.01M10 6h4"/>',
    airConditioner: '<rect x="3" y="5" width="18" height="8" rx="2"/><path d="M6 10h8M17.5 10h.01M7 16c0 1.5-1.5 1.7-1.5 3M12 16c0 1.5-1.5 1.7-1.5 3M17 16c0 1.5-1.5 1.7-1.5 3"/>',
    fan: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2c0-3 .8-5.2 3-5.2 1.8 0 2.5 1.7 1.4 3.2-1 1.3-2.7 2-4.4 2zM13.8 12c3 0 5.2.8 5.2 3 0 1.8-1.7 2.5-3.2 1.4-1.3-1-2-2.7-2-4.4zM12 13.8c0 3-.8 5.2-3 5.2-1.8 0-2.5-1.7-1.4-3.2 1-1.3 2.7-2 4.4-2zM10.2 12c-3 0-5.2-.8-5.2-3 0-1.8 1.7-2.5 3.2-1.4 1.3 1 2 2.7 2 4.4z"/>',
    vacuum: '<circle cx="9" cy="15" r="5.5"/><circle cx="9" cy="15" r="1.5"/><path d="M14 12.5 18 5h2.5M17.5 20.5h-3"/>',
    cashRegister: '<path d="M4 12h16l1 8.5H3z"/><rect x="7" y="5" width="8" height="4" rx="1"/><path d="M11 9v3M7.5 15.5h.01M11 15.5h.01M14.5 15.5h.01M8 18h8"/>',
    bankBuilding: '<path d="m12 3 9 5H3z"/><path d="M5 8v9M9.5 8v9M14.5 8v9M19 8v9M3.5 17h17M3 20.5h18"/>',
    banknote: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    coinsStack: '<path d="M6 6.5a5.5 2.2 0 1 0 11 0a5.5 2.2 0 1 0 -11 0"/><path d="M6 6.5v4c0 1.2 2.5 2.2 5.5 2.2S17 11.7 17 10.5v-4"/><path d="M6 10.5v4c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-4M6 14.5v3c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-3"/>',
    flagCheckered: '<path d="M5 21V4"/><path d="M5 4h13l-2 4 2 4H5"/><path d="M8.5 4v8M12 4v8M15.5 4.5V12M5 7h13M5 10h12"/>',
    scooterElectric: '<circle cx="6" cy="17.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M8.5 17.5h7L14 7h-2.5"/><path d="M14 7h2l1.5 8"/><path d="m10 10-1 3.5h2l-1 3"/>',
    motorbike: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M5.5 16.5 9 10h4l2.5 4h3"/><path d="M13 10 11.5 7H9M14 5.5h2.5L18 8"/>',
    bikeElectric: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16 9.5 9h5L18 16M9.5 9 8 6h-2"/><path d="m13 10-1 2.8h1.8l-1 2.7"/>',
    hammer: '<path d="m13.5 7 3.5 3.5L7.5 20a2.1 2.1 0 0 1-3-3z"/><path d="M12 5.5 14.5 3l6 6-2.5 2.5z"/>',
    screwdriver: '<path d="m14 8.5 1.5 1.5L7 18.5 5 19l.5-2z"/><path d="M14.5 8 18 4.5a1.8 1.8 0 0 1 2.5 2.5L17 10.5z"/>',
    drill: '<path d="M4 8h11v5H8l-1 5H5l1-5H4z"/><path d="M15 9.5h3M15 11.5h3M19 9.5v2M7.5 8V6h5v2"/>',
    saw: '<path d="M3 14 14 3l4 4-11 11z"/><path d="m6 14 1.5 1.5M9 11l1.5 1.5M12 8l1.5 1.5M15.5 16.5l3 3M18 14l2.5 2.5"/>',
    guitar: '<path d="m17 3 4 4-5.5 5.5"/><path d="M12.5 9.5c2 2 2.5 4.5 1 6.5-1.2 1.6-3 1.4-4.2 2.6-1 1-2.6 1.1-3.7 0l-.7-.7c-1.1-1.1-1-2.7 0-3.7 1.2-1.2 1-3 2.6-4.2 2-1.5 4.5-1 6.5 1z"/><path d="M9 15h.01"/>',
    piano: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 13h17M8 5v8M12 5v8M16 5v8"/>',
    drum: '<path d="M4 10a8 3.2 0 1 0 16 0a8 3.2 0 1 0 -16 0"/><path d="M4 10v6c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-6"/><path d="m6 4 6 6M18 4l-6 6"/>',
    thoughtBubble: '<path d="M9 5.5a6 4.8 0 0 1 9.5 3.9c0 2.7-2.6 4.6-5.8 4.6-.8 0-1.6-.1-2.3-.4L7 15l.6-2.5A4.6 4.6 0 0 1 5.5 9c0-1.5 1.5-3 3.5-3.5z"/><circle cx="6.5" cy="18" r="1.4"/><circle cx="4" cy="21" r="0.9"/>',
    mindBlown: '<circle cx="12" cy="13" r="7"/><path d="M9.5 12h.01M14.5 12h.01M9.5 16.5a5 5 0 0 0 5 0"/><path d="M7 6.5 5.5 4M12 5.5V3M17 6.5 18.5 4"/>',
    starEyes: '<circle cx="12" cy="12" r="9"/><path d="m8.8 8.7.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2zM15.2 8.7l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z"/><path d="M9 16.5a5.5 5.5 0 0 0 6 0"/>',
    paw: '<circle cx="7" cy="8" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="17" cy="8" r="1.8"/><path d="M12 11c3 0 5.5 2.2 5.5 5 0 1.6-1.2 2.5-2.6 2.5-1.1 0-1.9-.6-2.9-.6s-1.8.6-2.9.6c-1.4 0-2.6-.9-2.6-2.5 0-2.8 2.5-5 5.5-5z"/>',
    cat: '<path d="M5.5 9V4l3.5 2.5h6L18.5 4v5"/><path d="M5.5 9a6.5 6 0 1 0 13 0"/><path d="M9.5 11h.01M14.5 11h.01M12 13.5l-1 1h2z"/><path d="M3 12.5h3M18 12.5h3"/>',
    dog: '<path d="M8 5h8l2 4-2 1.5V15a5 5 0 0 1-4 4.9A5 5 0 0 1 8 15v-4.5L6 9z"/><path d="M8 5 5.5 8M16 5l2.5 3"/><path d="M10 10.5h.01M14 10.5h.01M12 13v2M12 15c-1 0-1.5-.6-1.5-1.2M12 15c1 0 1.5-.6 1.5-1.2"/>',
    bird: '<path d="M4 18c6 0 9.5-3 10.5-8L16 6l2 1.5h3l-2.5 2c0 6-4.5 9.5-10.5 9.5z"/><path d="M17.5 8h.01M8 21l2-2.5M12 21l1.5-2.8"/>',
    butterfly: '<path d="M12 6.5v11M12 6.5 10.5 4M12 6.5 13.5 4"/><path d="M12 9C10 5.5 5.5 4.5 4 6.5s0 6 3.5 6.5C4.5 14 4 17 6 18.5s5-1 6-4.5M12 9c2-3.5 6.5-4.5 8-2.5s0 6-3.5 6.5c3 1 3.5 4 1.5 5.5s-5-1-6-4.5"/>',
    bee: '<path d="M7.5 12a4.5 5.5 0 1 0 9 0 4.5 5.5 0 1 0-9 0z"/><path d="M8 10h8M8 14h8M12 17.5V19M10 5.5 12 7l2-1.5"/><path d="M6 9C4 8 3 6.5 4 5s3 0 4 2M18 9c2-1 3-2.5 2-4s-3 0-4 2"/>',
    turtle: '<path d="M6 13a6 5 0 0 1 12 0v2H6z"/><path d="M9 10.5 12 8l3 2.5M10 15v-4.5M14 15v-4.5"/><path d="M18 13h1.5a1.5 1.5 0 0 1 0 3H18M6 15l-1.5 2.5M18 15l1.5 2.5M9 15v2.5M15 15v2.5M3.5 12.5C3.5 11 4.5 10 5.5 10"/>',
    rabbit: '<path d="M9.5 9 7.5 3.5C7 2.5 8.5 2 9 3l2 5M14.5 9l2-5.5c.5-1-1-1.5-1.5-.5l-2 5"/><path d="M7.5 14.5a4.5 5 0 1 0 9 0 4.5 5 0 1 0-9 0z"/><path d="M10.5 14h.01M13.5 14h.01M12 16.5v1M12 17.5c-.8 0-1.3-.5-1.3-1M12 17.5c.8 0 1.3-.5 1.3-1"/>',
    snail: '<circle cx="10" cy="11" r="5.5"/><path d="M10 8.5A2.5 2.5 0 0 1 12.5 11 2.5 2.5 0 0 1 10 13.5 1.6 1.6 0 0 1 8.4 12"/><path d="M15.5 16.5c2 0 3.5-1.4 3.5-3.5V9.5M19 9.5 17.5 7M19 9.5 20.5 7M4 19.5h14a2 2 0 0 0 2-2"/>',
    owl: '<path d="M5.5 8a6.5 6.5 0 0 1 13 0v6a6.5 6.5 0 0 1-13 0z"/><circle cx="9.3" cy="9.5" r="1.9"/><circle cx="14.7" cy="9.5" r="1.9"/><path d="M9.3 9.5h.01M14.7 9.5h.01M12 12.5l-1 1.2h2zM5.5 6 4 4M18.5 6 20 4M9.5 20.5V19M14.5 20.5V19"/>',
    signalFull: '<path d="M4 19v-3M8.5 19v-6M13 19v-9M17.5 19V6"/>',
    signalMid: '<path d="M4 19v-3M8.5 19v-6M13 19v-9"/><path d="M17.5 19V6" opacity=".35"/>',
    signalNone: '<path d="M4 19v-3"/><path d="M8.5 19v-6M13 19v-9M17.5 19V6" opacity=".35"/><path d="m18 14 3.5 3.5M21.5 14 18 17.5"/>',
    plugOff: '<path d="M9 3v4M15 3v5.5M7 8h10l-1 6a4 4 0 0 1-5.6 3.2M7.6 11.5 7 8M12 18v3"/><path d="M4 4l16 16"/>',
    chipWarning: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3"/><path d="M12 9.5v3M12 15h.01"/>'
  };
});

;
Dixel.define('KanbanBoard', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  class KanbanBoard extends Component {
    static defaults = {
      columns: [],
      longPress: 260,
      onMove: null
    };

    build() {
      const el = Utils.el('div', 'dx-kanban dx-reset', { role: 'group', 'aria-label': 'Tablero kanban' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return (this.options.columns || []).map((column) => this.columnMarkup(column)).join('');
    }

    columnMarkup(column) {
      const cards = (column.cards || []).map((card) => this.cardMarkup(card)).join('');
      return '<section class="dx-kanban-col">' +
        '<header class="dx-kanban-colhead"><h3 class="dx-kanban-coltitle">' + Utils.escape(column.title) + '</h3>' +
        '<span class="dx-kanban-count">' + (column.cards || []).length + '</span></header>' +
        '<div class="dx-kanban-cards" role="list">' + cards + '</div>' +
        '</section>';
    }

    cardMarkup(card) {
      const tone = card.tone || 'primary';
      const tag = card.tag ? '<span class="dx-kanban-tag dx-kanban-tag--' + tone + '">' + Utils.escape(card.tag) + '</span>' : '';
      return '<article class="dx-kanban-card dx-focusable" role="listitem" tabindex="0">' +
        tag + '<span class="dx-kanban-cardtitle">' + (card.html ? card.title : Utils.escape(card.title)) + '</span></article>';
    }

    ready() {
      this.el.classList.add('dx-kanban', 'dx-reset');
      if (!this.el.querySelector('.dx-kanban-col')) this.el.innerHTML = this.markup();
      this.live = Utils.el('span', 'dx-kanban-live', { 'aria-live': 'polite' });
      this.el.appendChild(this.live);
      this.press = null;
      this.drag = null;
      this.geo = null;
      this.grabbed = null;
      this.grabOrigin = null;
      this.listen(this.el, 'pointerdown', this.onPress);
      this.listen(this.el, 'keydown', this.onKey);
      this.addCleanup(() => {
        this.teardownPress();
        if (this.drag) this.drag.ghost.remove();
        document.body.classList.remove('dx-kanban-grabbing');
      });
    }

    columnLists() {
      return Array.from(this.el.querySelectorAll('.dx-kanban-cards'));
    }

    columnTitles() {
      return Array.from(this.el.querySelectorAll('.dx-kanban-coltitle')).map((title) => title.textContent);
    }

    cardTitle(card) {
      const title = card.querySelector('.dx-kanban-cardtitle');
      return title ? title.textContent : '';
    }

    announce(message) {
      this.live.textContent = message;
    }

    updateCounts() {
      this.el.querySelectorAll('.dx-kanban-col').forEach((column) => {
        column.querySelector('.dx-kanban-count').textContent = column.querySelectorAll('.dx-kanban-card').length;
      });
    }

    onPress(event) {
      const card = event.target.closest('.dx-kanban-card');
      if (!card || this.press || this.drag || this.grabbed) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const touch = event.pointerType === 'touch';
      const pointerId = event.pointerId;
      this.press = {
        card,
        startX: event.clientX,
        startY: event.clientY,
        touch,
        pointerId,
        timer: null,
        unbinds: [
          Utils.on(document, 'pointermove', (moveEvent) => {
            if (moveEvent.pointerId === pointerId) this.onPointerMove(moveEvent);
          }),
          Utils.on(document, 'pointerup', (upEvent) => {
            if (upEvent.pointerId === pointerId) this.onRelease();
          }),
          Utils.on(document, 'pointercancel', (cancelEvent) => {
            if (cancelEvent.pointerId === pointerId) this.abortDrag();
          }),
          Utils.on(document, 'touchmove', (touchEvent) => {
            if (this.drag) touchEvent.preventDefault();
          }, { passive: false })
        ]
      };
      if (touch) {
        this.press.timer = setTimeout(() => this.beginDrag(this.press.startX, this.press.startY), this.options.longPress);
      }
    }

    onPointerMove(event) {
      if (!this.press) return;
      if (this.drag) {
        this.followGhost(event.clientX, event.clientY);
        this.autoScroll(event.clientX, event.clientY);
        this.preview(event.clientX, event.clientY);
        return;
      }
      const deltaX = event.clientX - this.press.startX;
      const deltaY = event.clientY - this.press.startY;
      const distance = Math.hypot(deltaX, deltaY);
      if (this.press.touch) {
        if (distance > 10) this.teardownPress();
        return;
      }
      if (distance > 6) this.beginDrag(event.clientX, event.clientY);
    }

    beginDrag(pointerX, pointerY) {
      const press = this.press;
      if (!press || this.drag) return;
      clearTimeout(press.timer);
      const card = press.card;
      const rect = card.getBoundingClientRect();
      this.captureGeometry(card);
      const ghost = card.cloneNode(true);
      ghost.classList.add('dx-kanban-ghost');
      ghost.classList.remove('dx-focusable');
      ghost.removeAttribute('tabindex');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = rect.width + 'px';
      document.body.appendChild(ghost);
      this.drag = {
        card,
        ghost,
        width: rect.width,
        height: rect.height,
        offsetX: pointerX - rect.left,
        offsetY: pointerY - rect.top,
        originCol: this.geo.originCol,
        originIndex: this.geo.originIndex,
        previewCol: this.geo.originCol,
        previewIndex: this.geo.originIndex,
        shifted: []
      };
      Motion.set(ghost, { x: pointerX - this.drag.offsetX, y: pointerY - this.drag.offsetY, rotate: 2.5, scale: 1.04 });
      card.classList.add('is-origin');
      this.el.classList.add('is-dragging');
      document.body.classList.add('dx-kanban-grabbing');
    }

    captureGeometry(card) {
      const geo = { cols: [], originCol: 0, originIndex: 0, gap: 10 };
      this.columnLists().forEach((list, colIndex) => {
        const rect = list.parentElement.getBoundingClientRect();
        const items = Array.from(list.children)
          .filter((child) => child.classList.contains('dx-kanban-card'))
          .map((el, cardIndex) => {
            const cardRect = el.getBoundingClientRect();
            if (el === card) {
              geo.originCol = colIndex;
              geo.originIndex = cardIndex;
            }
            return { el, mid: cardRect.top + cardRect.height / 2, top: cardRect.top, height: cardRect.height };
          });
        geo.cols.push({ list, left: rect.left, right: rect.right, center: rect.left + rect.width / 2, items });
      });
      const sample = geo.cols.find((col) => col.items.length > 1);
      if (sample) geo.gap = Math.max(sample.items[1].top - sample.items[0].top - sample.items[0].height, 6);
      this.geo = geo;
    }

    followGhost(pointerX, pointerY) {
      Motion.set(this.drag.ghost, { x: pointerX - this.drag.offsetX, y: pointerY - this.drag.offsetY });
    }

    autoScroll(pointerX, pointerY) {
      const margin = 70;
      let scrolled = false;
      let deltaY = 0;
      if (pointerY < margin) deltaY = -14;
      else if (pointerY > innerHeight - margin) deltaY = 14;
      if (deltaY) {
        window.scrollBy(0, deltaY);
        scrolled = true;
      }
      const rect = this.el.getBoundingClientRect();
      let deltaX = 0;
      if (pointerX < rect.left + margin) deltaX = -14;
      else if (pointerX > rect.right - margin) deltaX = 14;
      if (deltaX && this.el.scrollWidth > this.el.clientWidth) {
        this.el.scrollLeft += deltaX;
        scrolled = true;
      }
      if (scrolled) this.captureGeometry(this.drag.card);
    }

    preview(pointerX, pointerY) {
      const col = this.hitColumn(pointerX);
      const index = this.hitIndex(col, pointerY);
      if (col === this.drag.previewCol && index === this.drag.previewIndex) return;
      this.applyPreview(col, index);
    }

    hitColumn(pointerX) {
      let found = -1;
      this.geo.cols.forEach((col, index) => {
        if (pointerX >= col.left && pointerX <= col.right) found = index;
      });
      if (found >= 0) return found;
      let best = 0;
      let bestDistance = Infinity;
      this.geo.cols.forEach((col, index) => {
        const distance = Math.abs(pointerX - col.center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    }

    hitIndex(colIndex, pointerY) {
      let index = 0;
      this.geo.cols[colIndex].items.forEach((item) => {
        if (item.el !== this.drag.card && pointerY > item.mid) index++;
      });
      return index;
    }

    applyPreview(col, index) {
      const drag = this.drag;
      drag.shifted.forEach((el) => {
        el.style.transform = '';
      });
      const shifted = [];
      const amount = drag.height + this.geo.gap;
      this.geo.cols.forEach((column, colIndex) => {
        column.items.forEach((item, cardIndex) => {
          if (item.el === drag.card) return;
          let shift = 0;
          if (colIndex === drag.originCol && col === colIndex) {
            const slot = cardIndex > drag.originIndex ? cardIndex - 1 : cardIndex;
            if (cardIndex < drag.originIndex && slot >= index) shift = amount;
            else if (cardIndex > drag.originIndex && slot < index) shift = -amount;
          } else if (colIndex === drag.originCol) {
            if (cardIndex > drag.originIndex) shift = -amount;
          } else if (colIndex === col) {
            if (cardIndex >= index) shift = amount;
          }
          if (shift) {
            item.el.style.transform = 'translate3d(0,' + shift + 'px,0)';
            shifted.push(item.el);
          }
        });
      });
      drag.previewCol = col;
      drag.previewIndex = index;
      drag.shifted = shifted;
    }

    onRelease() {
      if (!this.press) return;
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      this.settleDrag();
    }

    settleDrag() {
      const drag = this.drag;
      const board = this.el;
      board.classList.add('is-settling');
      drag.shifted.forEach((el) => {
        el.style.transform = '';
      });
      const moved = drag.previewCol !== drag.originCol || drag.previewIndex !== drag.originIndex;
      if (moved) {
        const list = this.geo.cols[drag.previewCol].list;
        const rest = Array.from(list.children).filter((child) => child !== drag.card && child.classList.contains('dx-kanban-card'));
        list.insertBefore(drag.card, rest[drag.previewIndex] || null);
      }
      const rect = drag.card.getBoundingClientRect();
      const ghost = drag.ghost;
      const card = drag.card;
      Motion.to(ghost, {
        x: rect.left,
        y: rect.top,
        rotate: 0,
        scale: 1,
        duration: 0.26,
        ease: 'out',
        onComplete: () => {
          ghost.remove();
          card.classList.remove('is-origin');
          Motion.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.2 });
          board.classList.remove('is-settling');
        }
      });
      board.classList.remove('is-dragging');
      document.body.classList.remove('dx-kanban-grabbing');
      this.updateCounts();
      if (moved) this.reportMove(card, drag.originCol, drag.originIndex, drag.previewCol, drag.previewIndex);
      this.drag = null;
      this.teardownPress();
    }

    abortDrag() {
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      const drag = this.drag;
      drag.shifted.forEach((el) => {
        el.style.transform = '';
      });
      const ghost = drag.ghost;
      Motion.to(ghost, { opacity: 0, scale: 0.96, duration: 0.16, ease: 'in', onComplete: () => ghost.remove() });
      drag.card.classList.remove('is-origin');
      this.el.classList.remove('is-dragging');
      document.body.classList.remove('dx-kanban-grabbing');
      this.drag = null;
      this.teardownPress();
    }

    teardownPress() {
      if (!this.press) return;
      clearTimeout(this.press.timer);
      this.press.unbinds.forEach((unbind) => unbind());
      this.press = null;
    }

    reportMove(card, fromCol, fromIndex, toCol, toIndex) {
      const titles = this.columnTitles();
      const info = {
        card: this.cardTitle(card),
        from: titles[fromCol],
        to: titles[toCol],
        fromIndex,
        toIndex
      };
      this.announce('«' + info.card + '» movida a ' + info.to + ', posición ' + (toIndex + 1) + '.');
      if (this.options.onMove) this.options.onMove(info, card);
    }

    locate(card) {
      const lists = this.columnLists();
      for (let colIndex = 0; colIndex < lists.length; colIndex++) {
        const cards = Array.from(lists[colIndex].children).filter((child) => child.classList.contains('dx-kanban-card'));
        const cardIndex = cards.indexOf(card);
        if (cardIndex >= 0) return { col: colIndex, index: cardIndex };
      }
      return { col: 0, index: 0 };
    }

    onKey(event) {
      const card = event.target.closest('.dx-kanban-card');
      if (!card) return;
      const key = event.key;
      if (key === ' ' || key === 'Enter') {
        event.preventDefault();
        if (this.grabbed === card) this.dropGrab();
        else if (!this.grabbed) this.startGrab(card);
        return;
      }
      if (this.grabbed !== card) return;
      if (key === 'Escape') {
        event.preventDefault();
        this.cancelGrab();
        return;
      }
      const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (!moves[key]) return;
      event.preventDefault();
      this.moveGrabbed(moves[key][0], moves[key][1]);
    }

    startGrab(card) {
      this.grabbed = card;
      this.grabOrigin = this.locate(card);
      card.classList.add('is-grabbed');
      this.announce('«' + this.cardTitle(card) + '» seleccionada. Usa las flechas para moverla, espacio para soltar, Escape para cancelar.');
    }

    dropGrab() {
      const card = this.grabbed;
      const position = this.locate(card);
      const origin = this.grabOrigin;
      card.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = null;
      if (position.col !== origin.col || position.index !== origin.index) {
        this.reportMove(card, origin.col, origin.index, position.col, position.index);
      } else {
        this.announce('Tarjeta soltada sin cambios.');
      }
      card.focus();
    }

    cancelGrab() {
      const card = this.grabbed;
      const origin = this.grabOrigin;
      const list = this.columnLists()[origin.col];
      const rest = Array.from(list.children).filter((child) => child !== card && child.classList.contains('dx-kanban-card'));
      list.insertBefore(card, rest[origin.index] || null);
      card.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = null;
      this.updateCounts();
      this.announce('Movimiento cancelado.');
      card.focus();
    }

    moveGrabbed(colDelta, rowDelta) {
      const card = this.grabbed;
      const lists = this.columnLists();
      const position = this.locate(card);
      if (colDelta !== 0) {
        const targetCol = position.col + colDelta;
        if (targetCol < 0 || targetCol >= lists.length) return;
        const list = lists[targetCol];
        const cards = Array.from(list.children).filter((child) => child.classList.contains('dx-kanban-card'));
        list.insertBefore(card, cards[Math.min(position.index, cards.length)] || null);
      } else {
        const list = lists[position.col];
        const rest = Array.from(list.children).filter((child) => child !== card && child.classList.contains('dx-kanban-card'));
        const target = Utils.clamp(position.index + rowDelta, 0, rest.length);
        if (target === position.index) return;
        list.insertBefore(card, rest[target] || null);
      }
      this.updateCounts();
      const landed = this.locate(card);
      this.announce('Posición ' + (landed.index + 1) + ' en ' + this.columnTitles()[landed.col] + '.');
      card.focus();
    }
  }

  return KanbanBoard;
});

;
Dixel.define('PageBuilder', ['Component', 'Draggable', 'DropZone', 'Icon', 'Motion', 'Utils'], function (Component, Draggable, DropZone, Icon, Motion, Utils) {
  'use strict';

  const defaultPalette = [
    {
      group: 'Esenciales',
      items: [
        { class: 'Button', label: 'Botón', icon: 'cursorClick', options: { label: 'Comenzar', variant: 'solid', size: 'md' } },
        { class: 'GlowButton', label: 'Botón glow', icon: 'zap', options: { label: 'Lanzar', variant: 'solid', tone: 'cyan' } },
        { class: 'Badge', label: 'Badge', icon: 'tag', options: { label: 'Nuevo', tone: 'cyan', dot: true } },
        { class: 'Alert', label: 'Alerta', icon: 'checkCircle', options: { type: 'success', title: 'Guardado', message: 'Los cambios se aplicaron.', dismissible: false } }
      ]
    },
    {
      group: 'Tarjetas',
      items: [
        { class: 'Card', label: 'Tarjeta', icon: 'square', options: { title: 'Profundidad real', body: 'Superficies que capturan la luz de la interfaz.', footer: 'DIXEL · 2026' } },
        { class: 'TiltCard', label: 'Tarjeta tilt', icon: 'layers', options: { title: 'Sigue tu mano', body: 'Física amortiguada en cada eje.', maxTilt: 10, lift: 1.03 } },
        { class: 'PricingCard', label: 'Precios', icon: 'creditCard', options: { plan: 'Pro', price: '$29', period: '/mes', features: ['Proyectos ilimitados', 'Soporte prioritario', 'Analítica avanzada'], featured: true } }
      ]
    },
    {
      group: 'Formularios',
      items: [
        { class: 'TextField', label: 'Campo de texto', icon: 'edit', options: { label: 'Nombre completo', helper: 'Como aparece en tu documento', type: 'text' } },
        { class: 'SelectField', label: 'Selector', icon: 'list', options: { label: 'País', items: ['Colombia', 'México', 'Argentina', 'Chile'] } },
        { class: 'Switch', label: 'Interruptor', icon: 'toggleRight', options: { label: 'Notificaciones', checked: true } }
      ]
    },
    {
      group: 'Navegación',
      items: [
        { class: 'Tabs', label: 'Pestañas', icon: 'columns', options: { items: [{ label: 'Diseño', content: 'Sistemas visuales.' }, { label: 'Motion', content: 'Física en pantalla.' }, { label: 'Código', content: 'Vanilla puro.' }], active: 0 } },
        { class: 'Accordion', label: 'Acordeón', icon: 'rows', options: { items: [{ title: '¿Qué es DIXEL?', content: 'Una librería gráfica vanilla con UX cinematográfico.', open: true }, { title: '¿Tiene dependencias?', content: 'Cero. Todo corre sobre el núcleo propio.' }] } }
      ]
    },
    {
      group: 'Datos',
      items: [
        { class: 'StatCounter', label: 'Contador', icon: 'trendingUp', options: { value: 128450, label: 'Usuarios activos', suffix: '+', duration: 1.8 } },
        { class: 'KpiTile', label: 'KPI', icon: 'gauge', options: { label: 'Ingresos', value: 84300, prefix: '$', delta: 12.4, data: [30, 42, 38, 55, 49, 68, 61, 84], color: 'success' } },
        { class: 'LineChart', label: 'Líneas', icon: 'chartLine', options: { labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'], series: [{ label: 'Ventas', data: [12, 19, 14, 26, 22, 34] }], pointMarkers: true, showGrid: true } },
        { class: 'BarChart', label: 'Barras', icon: 'chartBar', options: { data: [{ label: 'Lun', value: 42 }, { label: 'Mar', value: 61 }, { label: 'Mié', value: 38 }, { label: 'Jue', value: 74 }, { label: 'Vie', value: 55 }], format: 'number' } },
        { class: 'DonutProgress', label: 'Dona', icon: 'chartDonut', options: { segments: [{ label: 'Diseño', value: 34 }, { label: 'Desarrollo', value: 46 }, { label: 'QA', value: 20 }], centerLabel: 'Horas' } },
        { class: 'ProgressBar', label: 'Progreso', icon: 'loader', options: { value: 64, label: 'Subiendo archivos', showValue: true } }
      ]
    },
    {
      group: 'Texto',
      items: [
        { class: 'GradientText', label: 'Texto gradiente', icon: 'type', options: { text: 'Cinematográfico', gradient: 'hot' } },
        { class: 'Timeline', label: 'Línea de tiempo', icon: 'history', options: { items: [{ date: '2024', title: 'Idea', text: 'Nace el concepto.' }, { date: '2025', title: 'Núcleo', text: 'Ticker y Viewport compartidos.' }, { date: '2026', title: 'Lanzamiento', text: 'Constructor de templates.' }] } }
      ]
    }
  ];

  function clonePiece(piece) {
    return {
      class: piece.class,
      label: piece.label || piece.class,
      icon: piece.icon || 'box',
      options: JSON.parse(JSON.stringify(piece.options || {}))
    };
  }

  class PageBuilder extends Component {
    static defaults = {
      palette: null,
      onChange: null,
      paletteTitle: 'Piezas',
      emptyTitle: 'Arrastra tu primera pieza',
      emptyHint: 'Elige un bloque de la paleta y suéltalo en el lienzo.'
    };

    static palette() {
      return defaultPalette.map((group) => ({ group: group.group, items: group.items.map(clonePiece) }));
    }

    build() {
      return Utils.el('div', 'dx-builder dx-reset');
    }

    ready() {
      this.el.classList.add('dx-builder', 'dx-reset');
      this.pieceDraggables = [];
      this.flashTimer = null;
      this.addCleanup(() => clearTimeout(this.flashTimer));
      this.buildPalette();
      this.buildMain();
      this.live = Utils.el('span', 'dx-builder-live', { 'aria-live': 'polite' });
      this.el.appendChild(this.live);
      this.listen(this.canvas, 'click', this.onCanvasClick);
      this.addCleanup(() => {
        this.pieceDraggables.forEach((draggable) => draggable.destroy());
        this.blockElements().forEach((block) => this.disposeBlock(block));
        this.zone.destroy();
      });
      this.updateEmpty();
    }

    paletteGroups() {
      return this.options.palette || PageBuilder.palette();
    }

    buildPalette() {
      const palette = Utils.el('aside', 'dx-builder-palette', { 'aria-label': 'Paleta de piezas' });
      const head = Utils.el('header', 'dx-builder-palettehead');
      const title = Utils.el('h3', 'dx-builder-palettetitle', { text: this.options.paletteTitle });
      const toggle = Utils.el('button', 'dx-builder-palettetoggle dx-focusable', {
        type: 'button',
        'aria-label': 'Mostrar u ocultar la paleta',
        'aria-expanded': 'false'
      });
      toggle.innerHTML = Icon.svg('chevronUp', 16);
      head.appendChild(title);
      head.appendChild(toggle);
      palette.appendChild(head);
      const groups = Utils.el('div', 'dx-builder-groups');
      this.paletteGroups().forEach((group) => {
        const section = Utils.el('section', 'dx-builder-group');
        section.appendChild(Utils.el('h4', 'dx-builder-grouptitle', { text: group.group }));
        const list = Utils.el('div', 'dx-builder-pieces');
        (group.items || []).forEach((item) => {
          const piece = clonePiece(item);
          const button = Utils.el('button', 'dx-builder-piece dx-focusable', {
            type: 'button',
            'aria-label': 'Añadir ' + piece.label
          });
          button.innerHTML = '<span class="dx-builder-pieceicon">' + Icon.svg(piece.icon, 17) + '</span>' +
            '<span class="dx-builder-piecelabel">' + Utils.escape(piece.label) + '</span>';
          this.listen(button, 'click', () => this.addBlock(clonePiece(piece), this.blockElements().length));
          const draggable = new Draggable({
            mode: 'clone',
            payload: { type: 'dixel-piece', piece }
          }).attach(button);
          this.pieceDraggables.push(draggable);
          list.appendChild(button);
        });
        section.appendChild(list);
        groups.appendChild(section);
      });
      palette.appendChild(groups);
      this.listen(toggle, 'click', () => {
        const open = this.el.classList.toggle('is-palette-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      this.palette = palette;
      this.el.appendChild(palette);
    }

    buildMain() {
      const main = Utils.el('div', 'dx-builder-main');
      main.appendChild(this.buildToolbar());
      const canvas = Utils.el('div', 'dx-builder-canvas', { role: 'list', 'aria-label': 'Lienzo del template' });
      const empty = Utils.el('div', 'dx-builder-empty');
      empty.innerHTML = '<span class="dx-builder-emptyicon">' + Icon.svg('sparkles', 30) + '</span>' +
        '<span class="dx-builder-emptytitle">' + Utils.escape(this.options.emptyTitle) + '</span>' +
        '<span class="dx-builder-emptyhint">' + Utils.escape(this.options.emptyHint) + '</span>';
      canvas.appendChild(empty);
      main.appendChild(canvas);
      this.canvas = canvas;
      this.emptyState = empty;
      this.zone = new DropZone({
        axis: 'vertical',
        itemSelector: '.dx-builder-block',
        accepts: (payload) => !!payload && (payload.type === 'dixel-piece' || payload.type === 'dixel-block'),
        onDrop: (info) => this.onCanvasDrop(info)
      }).attach(canvas);
      this.el.appendChild(main);
    }

    buildToolbar() {
      const toolbar = Utils.el('div', 'dx-builder-toolbar');
      this.countLabel = Utils.el('span', 'dx-builder-count', { text: '0 piezas' });
      toolbar.appendChild(this.countLabel);
      const exportButton = Utils.el('button', 'dx-builder-action dx-focusable', { type: 'button' });
      exportButton.innerHTML = Icon.svg('copy', 15) + '<span class="dx-builder-actionlabel">Exportar JSON</span>';
      this.listen(exportButton, 'click', this.copyExport);
      this.exportButton = exportButton;
      toolbar.appendChild(exportButton);
      const clearButton = Utils.el('button', 'dx-builder-action dx-builder-action--danger dx-focusable', { type: 'button' });
      clearButton.innerHTML = Icon.svg('trash', 15) + '<span class="dx-builder-actionlabel">Limpiar</span>';
      this.listen(clearButton, 'click', () => this.toggleConfirm(true));
      toolbar.appendChild(clearButton);
      const confirm = Utils.el('div', 'dx-builder-confirm', { role: 'alertdialog', 'aria-label': 'Confirmar limpieza' });
      confirm.appendChild(Utils.el('p', 'dx-builder-confirmtext', { text: '¿Vaciar el lienzo? Se eliminarán todas las piezas.' }));
      const confirmActions = Utils.el('div', 'dx-builder-confirmactions');
      const cancelButton = Utils.el('button', 'dx-builder-action dx-focusable', { type: 'button', text: 'Cancelar' });
      const acceptButton = Utils.el('button', 'dx-builder-action dx-builder-action--danger dx-focusable', { type: 'button', text: 'Vaciar' });
      this.listen(cancelButton, 'click', () => this.toggleConfirm(false));
      this.listen(acceptButton, 'click', () => {
        this.toggleConfirm(false);
        this.clearCanvas();
        this.announce('Lienzo vaciado.');
      });
      confirmActions.appendChild(cancelButton);
      confirmActions.appendChild(acceptButton);
      confirm.appendChild(confirmActions);
      this.confirm = confirm;
      toolbar.appendChild(confirm);
      return toolbar;
    }

    toggleConfirm(open) {
      this.confirm.classList.toggle('is-open', open);
    }

    blockElements() {
      return Array.from(this.canvas.querySelectorAll('.dx-builder-block'));
    }

    onCanvasClick(event) {
      const block = event.target.closest('.dx-builder-block');
      this.blockElements().forEach((candidate) => {
        candidate.classList.toggle('is-selected', candidate === block);
      });
    }

    onCanvasDrop(info) {
      if (info.payload && info.payload.type === 'dixel-piece') {
        this.addBlock(clonePiece(info.payload.piece), info.index);
        return;
      }
      if (info.moved) {
        this.announce('Bloque movido a la posición ' + (info.index + 1) + '.');
        this.emitChange();
      }
    }

    addBlock(piece, index) {
      let instance;
      try {
        instance = Dixel.create(piece.class, Object.assign({}, piece.options));
      } catch (error) {
        this.announce('No se pudo crear la pieza ' + piece.class + '.');
        return null;
      }
      const block = Utils.el('div', 'dx-builder-block', { role: 'listitem' });
      const tools = Utils.el('div', 'dx-builder-blocktools');
      const handle = Utils.el('button', 'dx-builder-tool dx-builder-handle dx-focusable', {
        type: 'button',
        'aria-label': 'Mover bloque ' + piece.label
      });
      handle.innerHTML = Icon.svg('dragHandle', 15);
      const duplicate = Utils.el('button', 'dx-builder-tool dx-focusable', {
        type: 'button',
        'aria-label': 'Duplicar bloque ' + piece.label
      });
      duplicate.innerHTML = Icon.svg('copy', 15);
      const remove = Utils.el('button', 'dx-builder-tool dx-builder-tool--danger dx-focusable', {
        type: 'button',
        'aria-label': 'Eliminar bloque ' + piece.label
      });
      remove.innerHTML = Icon.svg('trash', 15);
      tools.appendChild(handle);
      tools.appendChild(duplicate);
      tools.appendChild(remove);
      const body = Utils.el('div', 'dx-builder-blockbody');
      block.appendChild(tools);
      block.appendChild(body);
      const reference = this.blockElements()[index] || null;
      this.canvas.insertBefore(block, reference);
      try {
        instance.mount(body);
      } catch (error) {
        instance.destroy();
        block.remove();
        this.announce('No se pudo montar la pieza ' + piece.class + '.');
        return null;
      }
      block.__dxBlock = { piece, instance };
      block.__dxBlockDraggable = new Draggable({
        mode: 'move',
        handle: '.dx-builder-handle',
        payload: { type: 'dixel-block' }
      }).attach(block);
      this.listen(remove, 'click', () => this.removeBlock(block));
      this.listen(duplicate, 'click', () => this.duplicateBlock(block));
      this.listen(handle, 'keydown', (event) => this.onHandleKey(event, block));
      Motion.fromTo(block, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'out' });
      this.updateEmpty();
      this.emitChange();
      this.announce('Pieza ' + piece.label + ' añadida en la posición ' + (this.blockElements().indexOf(block) + 1) + '.');
      return block;
    }

    onHandleKey(event, block) {
      const moves = { ArrowUp: -1, ArrowDown: 1 };
      if (moves[event.key] === undefined) return;
      event.preventDefault();
      this.moveBlock(block, moves[event.key]);
    }

    moveBlock(block, delta) {
      const rest = this.blockElements().filter((candidate) => candidate !== block);
      const current = this.blockElements().indexOf(block);
      const target = Utils.clamp(current + delta, 0, rest.length);
      if (target === current) return;
      this.canvas.insertBefore(block, rest[target] || null);
      this.emitChange();
      this.announce('Bloque en la posición ' + (this.blockElements().indexOf(block) + 1) + '.');
      block.querySelector('.dx-builder-handle').focus();
    }

    duplicateBlock(block) {
      const meta = block.__dxBlock;
      const index = this.blockElements().indexOf(block) + 1;
      this.addBlock(clonePiece(meta.piece), index);
    }

    disposeBlock(block) {
      if (block.__dxBlockDraggable) block.__dxBlockDraggable.destroy();
      if (block.__dxBlock) block.__dxBlock.instance.destroy();
      block.remove();
    }

    removeBlock(block) {
      const label = block.__dxBlock.piece.label;
      Motion.to(block, {
        opacity: 0,
        scale: 0.95,
        duration: 0.2,
        ease: 'in',
        onComplete: () => {
          this.disposeBlock(block);
          this.updateEmpty();
          this.emitChange();
        }
      });
      this.announce('Pieza ' + label + ' eliminada.');
    }

    clearCanvas(silent) {
      this.blockElements().forEach((block) => this.disposeBlock(block));
      this.updateEmpty();
      if (!silent) this.emitChange();
    }

    serialize() {
      return this.blockElements().map((block) => ({
        class: block.__dxBlock.piece.class,
        options: JSON.parse(JSON.stringify(block.__dxBlock.piece.options))
      }));
    }

    load(layout) {
      this.clearCanvas(true);
      (layout || []).forEach((entry) => {
        this.addBlock(clonePiece({ class: entry.class, label: entry.class, options: entry.options }), this.blockElements().length);
      });
      this.emitChange();
    }

    copyExport() {
      const json = JSON.stringify(this.serialize(), null, 2);
      const done = () => {
        this.flashExport();
        this.announce('JSON copiado al portapapeles.');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(done, () => this.copyFallback(json, done));
      } else {
        this.copyFallback(json, done);
      }
    }

    copyFallback(text, done) {
      const area = Utils.el('textarea', 'dx-builder-clip');
      area.value = text;
      this.el.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } catch (error) {}
      area.remove();
      done();
    }

    flashExport() {
      const label = this.exportButton.querySelector('.dx-builder-actionlabel');
      const original = label.textContent;
      label.textContent = 'Copiado';
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => {
        label.textContent = original;
      }, 1400);
    }

    updateEmpty() {
      const count = this.blockElements().length;
      this.canvas.classList.toggle('is-empty', count === 0);
      if (this.countLabel) this.countLabel.textContent = count + (count === 1 ? ' pieza' : ' piezas');
    }

    emitChange() {
      this.updateEmpty();
      if (this.options.onChange) this.options.onChange(this.serialize());
    }

    announce(message) {
      if (this.live) this.live.textContent = message;
    }
  }

  return PageBuilder;
});

;
Dixel.define('BorderSweepButton', ['Button'], function (Button) {
  'use strict';

  class BorderSweepButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      variant: 'ghost'
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--sweep');
      this.whenVisible((isVisible) => {
        this.el.classList.toggle('is-running', isVisible);
      });
    }
  }

  return BorderSweepButton;
});

;
Dixel.define('Button', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Button extends Component {
    static defaults = {
      label: 'Button',
      variant: 'solid',
      size: 'md',
      href: null,
      icon: null,
      onClick: null
    };

    build() {
      const tag = this.options.href ? 'a' : 'button';
      const el = Utils.el(tag, this.classNames());
      if (this.options.href) el.href = this.options.href;
      else el.type = 'button';
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-btn dx-focusable dx-btn--' + this.options.variant + ' dx-btn--' + this.options.size;
    }

    markup() {
      const icon = this.options.icon ? '<span class="dx-btn-icon">' + this.options.icon + '</span>' : '';
      return icon + '<span class="dx-btn-label">' + Utils.escape(this.options.label) + '</span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-btn')) this.el.className += ' ' + this.classNames();
      if (this.options.onClick) this.listen(this.el, 'click', this.options.onClick);
    }
  }

  return Button;
});

;
Dixel.define('FabButton', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const plusIcon =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  class FabButton extends Component {
    static defaults = {
      label: 'Menu',
      icon: plusIcon,
      items: [],
      radius: 84,
      angleFrom: -90,
      angleTo: -180,
      fixed: false,
      onToggle: null
    };

    build() {
      const el = Utils.el('div', 'dx-fab dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.fixed) el.classList.add('dx-fab--fixed');
      this.itemEls = this.options.items.map((item) => {
        const itemEl = Utils.el('button', 'dx-fab-item dx-focusable', {
          type: 'button',
          html: item.icon || '',
          'aria-label': item.label || 'Action',
          title: item.label || ''
        });
        el.appendChild(itemEl);
        return itemEl;
      });
      this.iconEl = Utils.el('span', 'dx-fab-icon', { html: this.options.icon, 'aria-hidden': 'true' });
      this.main = Utils.el('button', 'dx-fab-main dx-focusable', {
        type: 'button',
        'aria-label': this.options.label,
        'aria-expanded': 'false'
      });
      this.main.appendChild(this.iconEl);
      el.appendChild(this.main);
    }

    ready() {
      if (!this.main) {
        this.el.classList.add('dx-fab', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.open = false;
      this.globalCleanups = [];
      this.layer = Utils.el('div', 'dx-fab-layer');
      this.itemEls.forEach((itemEl) => this.layer.appendChild(itemEl));
      Motion.set(this.itemEls, { scale: 0.4, opacity: 0 });
      this.listen(this.main, 'click', this.toggleMenu);
      this.listen(this.layer, 'click', this.handleItemClick);
      this.listen(document, 'pointerdown', this.handleOutside);
      this.listen(document, 'keydown', this.handleEscape);
      this.addCleanup(() => {
        this.releaseGlobal();
        this.layer.remove();
      });
    }

    handleItemClick(event) {
      const itemEl = event.target.closest('.dx-fab-item');
      if (!itemEl) return;
      const item = this.options.items[this.itemEls.indexOf(itemEl)];
      if (item && item.onClick) item.onClick(item);
      this.closeMenu();
    }

    handleOutside(event) {
      if (!this.open) return;
      if (this.el.contains(event.target) || this.layer.contains(event.target)) return;
      this.closeMenu();
    }

    handleEscape(event) {
      if (this.open && event.key === 'Escape') this.closeMenu();
    }

    toggleMenu() {
      if (this.open) this.closeMenu();
      else this.openMenu();
    }

    angleAt(index) {
      const count = Math.max(this.itemEls.length - 1, 1);
      const angle =
        this.options.angleFrom +
        ((this.options.angleTo - this.options.angleFrom) * index) / count;
      return (angle * Math.PI) / 180;
    }

    placeLayer() {
      const rect = this.main.getBoundingClientRect();
      this.layer.style.left = Math.round(rect.left + rect.width / 2) + 'px';
      this.layer.style.top = Math.round(rect.top + rect.height / 2) + 'px';
    }

    openMenu() {
      if (this.open) return;
      this.open = true;
      this.el.classList.add('is-open');
      this.layer.classList.add('is-open');
      this.main.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.layer);
      this.placeLayer();
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.placeLayer(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.placeLayer(), { passive: true }));
      Motion.to(this.iconEl, { rotate: 45, duration: 0.4, ease: 'outBack' });
      this.itemEls.forEach((itemEl, index) => {
        const angle = this.angleAt(index);
        Motion.to(itemEl, {
          x: Math.cos(angle) * this.options.radius,
          y: Math.sin(angle) * this.options.radius,
          scale: 1,
          opacity: 1,
          duration: 0.5,
          ease: 'outBack',
          delay: index * 0.045
        });
      });
      if (this.options.onToggle) this.options.onToggle(true);
    }

    closeMenu() {
      if (!this.open) return;
      this.open = false;
      this.el.classList.remove('is-open');
      this.layer.classList.remove('is-open');
      this.main.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      Motion.to(this.iconEl, { rotate: 0, duration: 0.35, ease: 'out' });
      const last = this.itemEls.length - 1;
      this.itemEls.forEach((itemEl, index) => {
        Motion.to(itemEl, {
          x: 0,
          y: 0,
          scale: 0.4,
          opacity: 0,
          duration: 0.3,
          ease: 'out',
          delay: (last - index) * 0.03,
          onComplete: index === 0
            ? () => {
                if (!this.open) this.layer.remove();
              }
            : undefined
        });
      });
      if (!this.itemEls.length) this.layer.remove();
      if (this.options.onToggle) this.options.onToggle(false);
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }
  }

  return FabButton;
});

;
Dixel.define('GlowButton', ['Button', 'Utils'], function (Button, Utils) {
  'use strict';

  class GlowButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      tone: 'primary'
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--glow', 'dx-btn--glow-' + this.options.tone);
      if (!this.el.querySelector('.dx-btn-shine')) {
        this.el.appendChild(Utils.el('span', 'dx-btn-shine', { 'aria-hidden': 'true' }));
      }
    }
  }

  return GlowButton;
});

;
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

;
Dixel.define('IconButton', ['Button', 'Utils'], function (Button, Utils) {
  'use strict';

  const defaultIcon =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  class IconButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      label: 'Action',
      icon: defaultIcon,
      shape: 'circle'
    });

    markup() {
      return '<span class="dx-btn-icon">' + this.options.icon + '</span>';
    }

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--iconic', 'dx-btn--iconic-' + this.options.shape);
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', this.options.label);
      if (!this.el.querySelector('.dx-btn-icon')) {
        this.el.appendChild(Utils.el('span', 'dx-btn-icon', { html: this.options.icon }));
      }
    }
  }

  return IconButton;
});

;
Dixel.define('MagneticButton', ['Button', 'Pointer', 'Motion', 'Ticker', 'Utils'], function (Button, Pointer, Motion, Ticker, Utils) {
  'use strict';

  class MagneticButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      strength: 0.32,
      liftScale: 1.04
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--magnetic');
      if (Utils.isTouch) return;
      this.offsetX = 0;
      this.offsetY = 0;
      this.centerX = 0;
      this.centerY = 0;
      this.stopFrame = null;
      this.releasePointer = null;
      this.follow = this.follow.bind(this);
      this.listen(this.el, 'pointerenter', this.engage);
      this.listen(this.el, 'pointerleave', this.release);
      this.addCleanup(() => this.disengage());
    }

    engage() {
      if (Utils.reducedMotion) return;
      const rect = this.el.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2 - this.offsetX;
      this.centerY = rect.top + rect.height / 2 - this.offsetY;
      if (!this.releasePointer) this.releasePointer = Pointer.use();
      if (!this.stopFrame) this.stopFrame = Ticker.add(this.follow);
      Motion.to(this.el, { scale: this.options.liftScale, duration: 0.4, ease: 'outBack' });
    }

    release() {
      if (!this.stopFrame) return;
      this.disengage();
      this.offsetX = 0;
      this.offsetY = 0;
      Motion.to(this.el, { x: 0, y: 0, scale: 1, duration: 0.7, ease: 'outElastic' });
    }

    disengage() {
      if (this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
      if (this.releasePointer) {
        this.releasePointer();
        this.releasePointer = null;
      }
    }

    follow(time, delta) {
      const targetX = (Pointer.smoothX - this.centerX) * this.options.strength;
      const targetY = (Pointer.smoothY - this.centerY) * this.options.strength;
      this.offsetX = Utils.damp(this.offsetX, targetX, 11, delta);
      this.offsetY = Utils.damp(this.offsetY, targetY, 11, delta);
      Motion.set(this.el, { x: this.offsetX, y: this.offsetY });
    }
  }

  return MagneticButton;
});

;
Dixel.define('PillToggle', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class PillToggle extends Component {
    static defaults = {
      options: ['One', 'Two'],
      value: 0,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-pill dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      this.indicator = Utils.el('span', 'dx-pill-indicator', { 'aria-hidden': 'true' });
      el.appendChild(this.indicator);
      this.buttons = this.options.options.map((label) => {
        const option = Utils.el('button', 'dx-pill-option dx-focusable', {
          type: 'button',
          text: label,
          'aria-pressed': 'false'
        });
        el.appendChild(option);
        return option;
      });
    }

    ready() {
      if (!this.indicator) {
        this.el.classList.add('dx-pill', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.index = -1;
      this.baseWidth = 0;
      this.listen(this.el, 'click', this.handleClick);
      this.listen(this.el, 'keydown', this.handleKeyDown);
      this.listen(window, 'resize', this.place);
      this.whenVisible((isVisible) => {
        if (isVisible) this.place();
      });
      this.select(this.options.value, true);
    }

    handleClick(event) {
      const option = event.target.closest('.dx-pill-option');
      if (!option) return;
      this.select(this.buttons.indexOf(option));
    }

    handleKeyDown(event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = Utils.clamp(this.index + step, 0, this.buttons.length - 1);
      this.select(next);
      this.buttons[next].focus();
    }

    select(index, silent) {
      if (index === this.index || index < 0 || index >= this.buttons.length) return;
      this.index = index;
      this.buttons.forEach((button, i) => {
        button.classList.toggle('is-selected', i === index);
        button.setAttribute('aria-pressed', String(i === index));
      });
      this.place();
      if (!silent && this.options.onChange) {
        this.options.onChange(this.options.options[index], index);
      }
    }

    place() {
      const option = this.buttons[this.index];
      if (!option) return;
      const rect = option.getBoundingClientRect();
      if (!rect.width) return;
      if (!this.baseWidth) {
        this.baseWidth = rect.width;
        this.indicator.style.width = rect.width + 'px';
      }
      const pillRect = this.el.getBoundingClientRect();
      const x = rect.left - pillRect.left - this.el.clientLeft + this.el.scrollLeft;
      this.indicator.style.transform =
        'translateX(' + x + 'px) scaleX(' + rect.width / this.baseWidth + ')';
    }

    get value() {
      return this.options.options[this.index];
    }
  }

  return PillToggle;
});

;
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

;
Dixel.define('Card', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Card extends Component {
    static defaults = {
      variant: 'surface',
      padding: 'md',
      hover: true,
      media: null,
      title: null,
      body: null,
      footer: null
    };

    build() {
      return Utils.el('article', this.classNames());
    }

    classNames() {
      let names = 'dx-card dx-card--' + this.options.variant + ' dx-card--pad-' + this.options.padding;
      if (this.options.hover) names += ' dx-card--hover';
      return names;
    }

    ready() {
      if (!this.el.classList.contains('dx-card')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
      }
      if (this.el.children.length && !this.el.querySelector('.dx-card-body')) return;
      if (this.options.media) {
        this.slots.media = this.el.querySelector('.dx-card-media') || Utils.el('div', 'dx-card-media');
        if (!this.slots.media.parentNode) this.el.appendChild(this.slots.media);
        Component.applyContent(this.options.media, this.slots.media, this);
      }
      if (this.options.title) {
        const title = this.el.querySelector('.dx-card-title') || Utils.el('h3', 'dx-card-title');
        if (!title.parentNode) this.el.appendChild(title);
        title.textContent = typeof this.options.title === 'string' ? this.options.title : '';
        if (typeof this.options.title !== 'string') Component.applyContent(this.options.title, title, this);
      }
      this.slot = this.el.querySelector('.dx-card-body') || Utils.el('div', 'dx-card-body');
      if (!this.slot.parentNode) this.el.appendChild(this.slot);
      if (this.options.body) Component.applyContent(this.options.body, this.slot, this);
      if (this.options.footer) {
        this.slots.footer = this.el.querySelector('.dx-card-footer') || Utils.el('div', 'dx-card-footer');
        if (!this.slots.footer.parentNode) this.el.appendChild(this.slots.footer);
        Component.applyContent(this.options.footer, this.slots.footer, this);
      }
    }
  }

  return Card;
});

;
Dixel.define('FlipCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  class FlipCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      front: '',
      back: '',
      trigger: 'click',
      axis: 'y',
      minHeight: 220
    });

    build() {
      const el = Utils.el('div', 'dx-flip');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<div class="dx-flip-inner">' +
        '<div class="dx-flip-face dx-flip-front">' + this.options.front + '</div>' +
        '<div class="dx-flip-face dx-flip-back">' + this.options.back + '</div>' +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-flip', 'dx-flip--' + this.options.axis);
      if (!this.el.querySelector('.dx-flip-inner')) this.el.innerHTML = this.markup();
      this.inner = this.el.querySelector('.dx-flip-inner');
      this.inner.style.minHeight = this.options.minHeight + 'px';
      this.flipped = false;
      this.el.setAttribute('tabindex', '0');
      this.el.setAttribute('role', 'button');
      this.el.setAttribute('aria-pressed', 'false');
      this.el.classList.add('dx-focusable');
      if (this.options.trigger === 'hover' && !Utils.isTouch) {
        this.listen(this.el, 'pointerenter', () => this.setFlipped(true));
        this.listen(this.el, 'pointerleave', () => this.setFlipped(false));
      } else {
        this.listen(this.el, 'click', this.toggle);
      }
      this.listen(this.el, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.toggle();
      });
    }

    toggle() {
      this.setFlipped(!this.flipped);
    }

    setFlipped(flipped) {
      this.flipped = flipped;
      this.el.classList.toggle('is-flipped', flipped);
      this.el.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    }
  }

  return FlipCard;
});

;
Dixel.define('GlassCard', ['Card'], function (Card) {
  'use strict';

  class GlassCard extends Card {
    static defaults = Object.assign({}, Card.defaults, { variant: 'glass' });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--glass');
    }
  }

  return GlassCard;
});

;
Dixel.define('GradientBorderCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  class GradientBorderCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      hover: false,
      speed: 6
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--gborder');
      if (!this.el.querySelector('.dx-gborder-inner')) {
        const inner = Utils.el('div', 'dx-gborder-inner');
        while (this.el.firstChild) inner.appendChild(this.el.firstChild);
        this.el.appendChild(Utils.el('div', 'dx-gborder-spin'));
        this.el.appendChild(inner);
      }
      const spin = this.el.querySelector('.dx-gborder-spin');
      spin.style.animationDuration = this.options.speed + 's';
      this.whenVisible((visible) => {
        spin.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return GradientBorderCard;
});

;
Dixel.define('PricingCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  const checkIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';

  class PricingCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      plan: 'Pro',
      price: '$29',
      period: '/mes',
      description: '',
      features: [],
      cta: 'Empezar',
      href: null,
      featured: false,
      badge: 'Popular',
      onSelect: null
    });

    build() {
      const el = Utils.el('article', this.classNames());
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-card dx-card--pad-lg dx-pricing' + (this.options.featured ? ' dx-pricing--featured' : '');
    }

    markup() {
      const badge = this.options.featured && this.options.badge
        ? '<span class="dx-pricing-badge">' + Utils.escape(this.options.badge) + '</span>'
        : '';
      const description = this.options.description
        ? '<p class="dx-pricing-desc">' + Utils.escape(this.options.description) + '</p>'
        : '';
      const features = this.options.features
        .map((feature) => '<li>' + checkIcon + '<span>' + Utils.escape(feature) + '</span></li>')
        .join('');
      const tag = this.options.href ? 'a' : 'button';
      const attrs = this.options.href ? ' href="' + Utils.escape(this.options.href) + '"' : ' type="button"';
      return badge +
        '<span class="dx-pricing-plan">' + Utils.escape(this.options.plan) + '</span>' +
        '<div class="dx-pricing-price"><strong>' + Utils.escape(this.options.price) + '</strong><span>' + Utils.escape(this.options.period) + '</span></div>' +
        description +
        '<ul class="dx-pricing-features">' + features + '</ul>' +
        '<' + tag + attrs + ' class="dx-pricing-cta dx-focusable">' + Utils.escape(this.options.cta) + '</' + tag + '>';
    }

    ready() {
      if (!this.el.classList.contains('dx-pricing')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
      const cta = this.el.querySelector('.dx-pricing-cta');
      if (cta && this.options.onSelect) this.listen(cta, 'click', this.options.onSelect);
    }
  }

  return PricingCard;
});

;
Dixel.define('ProfileCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  class ProfileCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      name: '',
      role: '',
      bio: '',
      avatar: null,
      initials: '',
      stats: [],
      actionLabel: null,
      onAction: null
    });

    build() {
      const el = Utils.el('article', 'dx-card dx-card--hover dx-profile');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const name = Utils.escape(this.options.name);
      const avatar = this.options.avatar
        ? '<img src="' + Utils.escape(this.options.avatar) + '" alt="' + name + '">'
        : '<span>' + Utils.escape(this.options.initials) + '</span>';
      const bio = this.options.bio ? '<p class="dx-profile-bio">' + Utils.escape(this.options.bio) + '</p>' : '';
      const stats = this.options.stats.length
        ? '<div class="dx-profile-stats">' +
          this.options.stats
            .map((stat) => '<div class="dx-profile-stat"><strong>' + Utils.escape(stat.value) + '</strong><span>' + Utils.escape(stat.label) + '</span></div>')
            .join('') +
          '</div>'
        : '';
      const action = this.options.actionLabel
        ? '<button type="button" class="dx-profile-action dx-focusable">' + Utils.escape(this.options.actionLabel) + '</button>'
        : '';
      return '<div class="dx-profile-cover"></div>' +
        '<div class="dx-profile-avatar">' + avatar + '</div>' +
        '<h3 class="dx-profile-name">' + name + '</h3>' +
        '<span class="dx-profile-role">' + Utils.escape(this.options.role) + '</span>' +
        bio + stats + action;
    }

    ready() {
      if (!this.el.classList.contains('dx-profile')) {
        this.el.className += (this.el.className ? ' ' : '') + 'dx-card dx-card--hover dx-profile';
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
      const action = this.el.querySelector('.dx-profile-action');
      if (action && this.options.onAction) this.listen(action, 'click', this.options.onAction);
    }
  }

  return ProfileCard;
});

;
Dixel.define('SpotlightCard', ['Card', 'Pointer', 'Ticker', 'Utils'], function (Card, Pointer, Ticker, Utils) {
  'use strict';

  class SpotlightCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      radius: 280,
      tone: 'primary'
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--spotlight', 'dx-card--spotlight-' + this.options.tone);
      this.el.style.setProperty('--dx-spot-size', this.options.radius + 'px');
      this.rect = null;
      this.hovering = false;
      this.stopFrame = null;
      this.releasePointer = null;
      if (Utils.isTouch) return;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.addCleanup(() => this.stopLoop());
    }

    enter(event) {
      this.rect = this.el.getBoundingClientRect();
      if (Utils.reducedMotion) {
        this.applySpot(event.clientX, event.clientY);
        return;
      }
      this.hovering = true;
      this.startLoop();
    }

    leave() {
      this.hovering = false;
    }

    startLoop() {
      if (this.stopFrame) return;
      this.releasePointer = Pointer.use();
      this.stopFrame = Ticker.add(() => this.step());
    }

    stopLoop() {
      if (this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
      if (this.releasePointer) {
        this.releasePointer();
        this.releasePointer = null;
      }
    }

    step() {
      this.applySpot(Pointer.smoothX, Pointer.smoothY);
      if (!this.hovering) this.stopLoop();
    }

    applySpot(x, y) {
      if (!this.rect) return;
      this.el.style.setProperty('--dx-spot-x', (x - this.rect.left).toFixed(1) + 'px');
      this.el.style.setProperty('--dx-spot-y', (y - this.rect.top).toFixed(1) + 'px');
    }
  }

  return SpotlightCard;
});

;
Dixel.define('StackCard', ['Card', 'Motion', 'Utils'], function (Card, Motion, Utils) {
  'use strict';

  class StackCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      items: [],
      offset: 16,
      scaleStep: 0.05,
      height: 240
    });

    build() {
      const el = Utils.el('div', 'dx-stack');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return this.options.items
        .map((item) => '<article class="dx-card dx-stack-item">' + item + '</article>')
        .join('');
    }

    ready() {
      this.el.classList.add('dx-stack');
      if (!this.el.children.length && this.options.items.length) this.el.innerHTML = this.markup();
      this.order = Array.from(this.el.children);
      this.order.forEach((child) => child.classList.add('dx-stack-item'));
      this.el.style.minHeight = this.options.height + this.options.offset * 2 + 'px';
      this.animating = false;
      this.width = this.el.clientWidth || 320;
      this.el.setAttribute('role', 'group');
      this.el.setAttribute('aria-label', 'Pila de tarjetas');
      this.el.setAttribute('tabindex', '0');
      this.el.classList.add('dx-focusable');
      this.listen(window, 'resize', () => {
        this.width = this.el.clientWidth || this.width;
      });
      this.listen(this.el, 'click', this.advance);
      this.listen(this.el, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.advance();
      });
      this.applySlots(true);
    }

    slotValues(index) {
      return {
        x: 0,
        y: index * this.options.offset,
        rotate: 0,
        scale: 1 - index * this.options.scaleStep,
        opacity: index > 2 ? 0 : 1 - index * 0.12
      };
    }

    refreshDepth() {
      this.order.forEach((child, index) => {
        child.style.zIndex = this.order.length - index;
        child.classList.toggle('is-top', index === 0);
      });
    }

    applySlots(immediate) {
      this.refreshDepth();
      this.order.forEach((child, index) => {
        const values = this.slotValues(index);
        if (immediate) Motion.set(child, values);
        else Motion.to(child, Object.assign({ duration: 0.5, ease: 'outQuart' }, values));
      });
    }

    advance() {
      if (this.animating || this.order.length < 2) return;
      this.animating = true;
      const moved = this.order.shift();
      this.order.push(moved);
      if (Utils.reducedMotion) {
        this.applySlots(true);
        this.animating = false;
        return;
      }
      this.order.slice(0, -1).forEach((child, index) => {
        Motion.to(child, Object.assign({ duration: 0.5, ease: 'outQuart' }, this.slotValues(index)));
      });
      const lastSlot = this.slotValues(this.order.length - 1);
      Motion.to(moved, {
        x: this.width * 0.75,
        rotate: 9,
        opacity: 0,
        duration: 0.38,
        ease: 'outQuart',
        onComplete: () => {
          Motion.set(moved, Object.assign({}, lastSlot, { opacity: 0 }));
          this.refreshDepth();
          Motion.to(moved, { opacity: lastSlot.opacity, duration: 0.3 });
          this.animating = false;
        }
      });
    }
  }

  return StackCard;
});

;
Dixel.define('TiltCard', ['Card', 'Pointer', 'Ticker', 'Utils'], function (Card, Pointer, Ticker, Utils) {
  'use strict';

  class TiltCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      hover: false,
      maxTilt: 9,
      lift: 1.02,
      perspective: 1000
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--tilt');
      this.wrapInPerspective();
      this.rect = null;
      this.hovering = false;
      this.stopFrame = null;
      this.rotationX = 0;
      this.rotationY = 0;
      this.currentLift = 1;
      if (Utils.isTouch) return;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.addCleanup(() => this.stopLoop());
    }

    wrapInPerspective() {
      if (!this.el.parentNode) return;
      const wrapper = Utils.el('div', 'dx-tilt-wrap');
      wrapper.style.perspective = this.options.perspective + 'px';
      this.el.parentNode.insertBefore(wrapper, this.el);
      wrapper.appendChild(this.el);
      this.addCleanup(() => {
        if (!wrapper.parentNode) return;
        if (this.el) wrapper.parentNode.insertBefore(this.el, wrapper);
        wrapper.remove();
      });
    }

    enter() {
      if (Utils.reducedMotion) return;
      this.rect = this.el.getBoundingClientRect();
      this.hovering = true;
      this.startLoop();
    }

    leave() {
      this.hovering = false;
    }

    startLoop() {
      if (this.stopFrame) return;
      this.stopFrame = Ticker.add((time, delta) => this.step(delta));
    }

    stopLoop() {
      if (!this.stopFrame) return;
      this.stopFrame();
      this.stopFrame = null;
    }

    step(delta) {
      let targetX = 0;
      let targetY = 0;
      let targetLift = 1;
      if (this.hovering && this.rect) {
        const relX = Utils.clamp((Pointer.x - this.rect.left) / this.rect.width, 0, 1);
        const relY = Utils.clamp((Pointer.y - this.rect.top) / this.rect.height, 0, 1);
        targetY = (relX * 2 - 1) * this.options.maxTilt;
        targetX = (0.5 - relY) * 2 * this.options.maxTilt;
        targetLift = this.options.lift;
      }
      this.rotationX = Utils.damp(this.rotationX, targetX, 14, delta);
      this.rotationY = Utils.damp(this.rotationY, targetY, 14, delta);
      this.currentLift = Utils.damp(this.currentLift, targetLift, 14, delta);
      this.el.style.transform =
        'rotateX(' + this.rotationX.toFixed(3) + 'deg)' +
        ' rotateY(' + this.rotationY.toFixed(3) + 'deg)' +
        ' scale(' + this.currentLift.toFixed(4) + ')';
      const settled =
        !this.hovering &&
        Math.abs(this.rotationX) < 0.01 &&
        Math.abs(this.rotationY) < 0.01 &&
        Math.abs(this.currentLift - 1) < 0.001;
      if (settled) {
        this.el.style.transform = '';
        this.stopLoop();
      }
    }
  }

  return TiltCard;
});

;
Dixel.define('ChatInput', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const sendIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12L20 4.5 14.5 20l-3-6.5-7-1.5z"/><path d="M11.5 13.5L20 4.5"/></svg>';

  class ChatInput extends Component {
    static defaults = {
      placeholder: 'Escribe un mensaje…',
      sendLabel: 'Enviar mensaje',
      maxHeight: 132,
      onSend: null
    };

    build() {
      const el = Utils.el('form', 'dx-chatinput dx-reset');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<textarea class="dx-chatinput-field" rows="1" placeholder="' + Utils.escape(this.options.placeholder) + '" aria-label="' + Utils.escape(this.options.placeholder) + '"></textarea>' +
        '<button class="dx-chatinput-send dx-focusable" type="submit" aria-label="' + Utils.escape(this.options.sendLabel) + '" disabled>' + sendIcon + '</button>';
    }

    ready() {
      this.el.classList.add('dx-chatinput', 'dx-reset');
      if (!this.el.querySelector('.dx-chatinput-field')) this.el.innerHTML = this.markup();
      this.field = this.el.querySelector('.dx-chatinput-field');
      this.sendBtn = this.el.querySelector('.dx-chatinput-send');
      this.listen(this.el, 'submit', (event) => {
        event.preventDefault();
        this.send();
      });
      this.listen(this.field, 'input', () => {
        this.autosize();
        this.updateState();
      });
      this.listen(this.field, 'keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.send();
        }
      });
      this.updateState();
    }

    send() {
      const value = this.field.value.trim();
      if (!value) return;
      if (this.options.onSend) this.options.onSend(value);
      this.field.value = '';
      this.autosize();
      this.updateState();
      Motion.fromTo(this.sendBtn, { scale: 0.78 }, { scale: 1, duration: 0.35, ease: 'outBack' });
      this.field.focus();
    }

    autosize() {
      this.field.style.height = 'auto';
      this.field.style.height = Math.min(this.field.scrollHeight, this.options.maxHeight) + 'px';
    }

    updateState() {
      const hasText = this.field.value.trim().length > 0;
      this.sendBtn.disabled = !hasText;
      this.el.classList.toggle('is-ready', hasText);
    }

    focus() {
      this.field.focus();
    }
  }

  return ChatInput;
});

;
Dixel.define('ChatThread', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const tones = ['primary', 'cyan', 'magenta', 'success', 'warning'];
  const sentIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const readIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12.5l4.5 4.5L16.5 7.5"/><path d="M11 14.5l2.5 2.5L23 7.5"/></svg>';

  class ChatThread extends Component {
    static defaults = {
      messages: [],
      label: 'Conversación'
    };

    build() {
      const el = Utils.el('div', 'dx-chat dx-reset', { role: 'log', 'aria-label': this.options.label });
      el.innerHTML = '<div class="dx-chat-scroll"><div class="dx-chat-list"></div></div>';
      return el;
    }

    ready() {
      this.el.classList.add('dx-chat', 'dx-reset');
      if (!this.el.querySelector('.dx-chat-list')) {
        this.el.innerHTML = '<div class="dx-chat-scroll"><div class="dx-chat-list"></div></div>';
      }
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'log');
      this.scroller = this.el.querySelector('.dx-chat-scroll');
      this.list = this.el.querySelector('.dx-chat-list');
      this.nearBottom = true;
      this.lastKey = null;
      this.lastGroup = null;
      this.listen(this.scroller, 'scroll', this.trackScroll, { passive: true });
      (this.options.messages || []).forEach((message) => this.append(message, true));
      this.scrollToEnd(true);
    }

    trackScroll() {
      const scroller = this.scroller;
      this.nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 48;
    }

    push(message) {
      const bubble = this.append(message, false);
      if (this.nearBottom) this.scrollToEnd(false);
      return bubble;
    }

    append(message, silent) {
      const data = this.normalize(message);
      const key = (data.own ? 'own' : 'other') + '|' + data.author;
      if (!this.lastGroup || this.lastKey !== key) {
        this.lastGroup = this.createGroup(data);
        this.lastKey = key;
        this.list.appendChild(this.lastGroup.el);
      }
      const bubble = this.createBubble(data);
      this.lastGroup.stack.appendChild(bubble);
      if (!silent) {
        Motion.fromTo(bubble, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'out' });
      }
      return bubble;
    }

    normalize(message) {
      return {
        author: message.author || 'Anónimo',
        initials: message.initials || this.initialsOf(message.author || 'A'),
        text: message.text || '',
        html: !!message.html,
        time: this.formatTime(message.time),
        own: !!message.own,
        status: message.status || 'sent',
        tone: message.tone || tones[this.hashOf(message.author || '') % tones.length]
      };
    }

    initialsOf(name) {
      const parts = name.trim().split(/\s+/);
      const first = parts[0] ? parts[0][0] : '';
      const second = parts[1] ? parts[1][0] : '';
      return (first + second).toUpperCase();
    }

    hashOf(text) {
      let hash = 0;
      for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
      return hash;
    }

    formatTime(time) {
      if (typeof time === 'string') return time;
      const date = time instanceof Date ? time : new Date(time || Date.now());
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return hours + ':' + minutes;
    }

    createGroup(data) {
      const el = Utils.el('div', 'dx-chat-group dx-chat-group--' + (data.own ? 'own' : 'other'));
      let stack;
      if (data.own) {
        stack = Utils.el('div', 'dx-chat-stack');
        el.appendChild(stack);
      } else {
        const avatar = Utils.el('span', 'dx-chat-avatar dx-chat-avatar--' + data.tone, { 'aria-hidden': 'true', text: data.initials });
        const body = Utils.el('div', 'dx-chat-groupbody');
        const name = Utils.el('span', 'dx-chat-author', { text: data.author });
        stack = Utils.el('div', 'dx-chat-stack');
        body.appendChild(name);
        body.appendChild(stack);
        el.appendChild(avatar);
        el.appendChild(body);
      }
      return { el, stack };
    }

    createBubble(data) {
      const bubble = Utils.el('div', 'dx-chat-bubble');
      const status = data.own
        ? '<span class="dx-chat-status' + (data.status === 'read' ? ' is-read' : '') + '" aria-label="' + (data.status === 'read' ? 'Leído' : 'Enviado') + '">' + (data.status === 'read' ? readIcon : sentIcon) + '</span>'
        : '';
      bubble.innerHTML =
        '<div class="dx-chat-bubblebody">' + (data.html ? data.text : Utils.escape(data.text)) + '</div>' +
        '<span class="dx-chat-meta"><time>' + Utils.escape(data.time || '') + '</time>' + status + '</span>';
      return bubble;
    }

    markRead() {
      this.el.querySelectorAll('.dx-chat-group--own .dx-chat-status').forEach((status) => {
        if (status.classList.contains('is-read')) return;
        status.classList.add('is-read');
        status.setAttribute('aria-label', 'Leído');
        status.innerHTML = readIcon;
      });
    }

    scrollToEnd(instant) {
      this.scroller.scrollTo({
        top: this.scroller.scrollHeight,
        behavior: instant || Utils.reducedMotion ? 'auto' : 'smooth'
      });
      this.nearBottom = true;
    }
  }

  return ChatThread;
});

;
Dixel.define('TypingDots', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class TypingDots extends Component {
    static defaults = {
      author: ''
    };

    build() {
      const el = Utils.el('div', 'dx-typing', {
        role: 'status',
        'aria-label': this.label()
      });
      el.innerHTML = this.markup();
      return el;
    }

    label() {
      return this.options.author ? this.options.author + ' está escribiendo…' : 'Escribiendo…';
    }

    markup() {
      return '<span class="dx-typing-dot" aria-hidden="true"></span>' +
        '<span class="dx-typing-dot" aria-hidden="true"></span>' +
        '<span class="dx-typing-dot" aria-hidden="true"></span>';
    }

    ready() {
      this.el.classList.add('dx-typing');
      if (!this.el.querySelector('.dx-typing-dot')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', this.label());
      this.whenVisible((visible) => this.el.classList.toggle('is-paused', !visible));
    }
  }

  return TypingDots;
});

;
Dixel.define('AreaChart', ['LineChart', 'Utils'], function (LineChart, Utils) {
  'use strict';

  class AreaChart extends LineChart {
    static defaults = Object.assign({}, LineChart.defaults, {
      stacked: true,
      fill: true,
      glow: false,
      lineWidth: 1.6
    });

    ready() {
      this.sourceSeries = this.options.series.map((serie) => Object.assign({}, serie, { data: serie.data.slice() }));
      this.sourceHidden = this.sourceSeries.map(() => false);
      if (this.options.stacked) this.applyStacking();
      super.ready();
      this.el.classList.add('dx-areachart');
    }

    applyStacking() {
      const totals = [];
      this.options.series = this.sourceSeries.map((serie, seriesIndex) => {
        const off = this.sourceHidden[seriesIndex];
        const stackedData = serie.data.map((value, index) => {
          if (!off) totals[index] = (totals[index] || 0) + value;
          return totals[index] || 0;
        });
        return Object.assign({}, serie, { data: stackedData });
      }).reverse();
      this.stackReversed = true;
    }

    renderLegend() {
      if (!this.options.stacked) {
        super.renderLegend();
        return;
      }
      this.legendEl = Utils.el('div', 'dx-chart-legend');
      const count = this.sourceSeries.length;
      this.sourceSeries.forEach((serie, sourceIndex) => {
        const item = Utils.el('button', 'dx-chart-legend-item', { type: 'button' });
        const dot = Utils.el('span', 'dx-chart-legend-dot');
        dot.style.background = this.palette[count - 1 - sourceIndex];
        item.appendChild(dot);
        item.appendChild(Utils.el('span', null, { text: serie.label || 'Serie ' + (sourceIndex + 1) }));
        this.listen(item, 'click', () => {
          this.sourceHidden[sourceIndex] = !this.sourceHidden[sourceIndex];
          item.classList.toggle('is-off', this.sourceHidden[sourceIndex]);
          this.applyStacking();
          this.hidden = this.options.series.map((stacked, stackedIndex) => this.sourceHidden[count - 1 - stackedIndex]);
          this.computeScale();
          this.paint();
        });
        this.legendEl.appendChild(item);
      });
      this.el.appendChild(this.legendEl);
    }

    showTip() {
      if (!this.options.stacked) {
        super.showTip();
        return;
      }
      const index = this.hoverIndex;
      if (index < 0 || !this.canvasOrigin) return;
      const rows = [];
      let total = 0;
      this.sourceSeries.forEach((serie, seriesIndex) => {
        if (this.sourceHidden[seriesIndex]) return;
        rows.push({
          color: this.palette[this.palette.length - 1 - seriesIndex],
          label: serie.label || 'Serie ' + (seriesIndex + 1),
          value: this.formatter(serie.data[index])
        });
        total += serie.data[index] || 0;
      });
      rows.push({ label: 'Total', value: this.formatter(total) });
      const x = this.canvasOrigin.left + this.layout.padLeft + (index / Math.max(this.layout.pointCount - 1, 1)) * this.layout.plotWidth;
      Dixel.classes.ChartTooltip.show({
        title: this.options.labels[index] || '',
        rows,
        x,
        y: this.canvasOrigin.top + this.layout.padTop
      });
    }
  }

  return AreaChart;
});

;
Dixel.define('BarChart', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class BarChart extends Component {
    static defaults = {
      data: [],
      color: 'primary',
      duration: 0.9,
      stagger: 0.09,
      showValues: true,
      format: 'number',
      currency: 'USD',
      locale: 'es-CO',
      maxValue: null
    };

    build() {
      return Utils.el('div', 'dx-bars');
    }

    makeFormatter() {
      const locale = this.options.locale;
      if (this.options.format === 'percent') {
        const base = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
        return (value) => base.format(value) + '%';
      }
      if (this.options.format === 'currency') {
        const base = new Intl.NumberFormat(locale, { style: 'currency', currency: this.options.currency, maximumFractionDigits: 0 });
        return (value) => base.format(value);
      }
      if (this.options.format === 'compact') {
        const base = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: 'compact' });
        return (value) => base.format(value);
      }
      const base = new Intl.NumberFormat(locale);
      return (value) => base.format(value);
    }

    ready() {
      this.el.classList.add('dx-bars');
      if (!this.el.querySelector('.dx-bar')) this.render();
      this.applyTimings();
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-bars--in');
      });
    }

    render() {
      const data = this.options.data;
      const max = this.options.maxValue || Math.max.apply(null, data.map((item) => item.value).concat(1));
      const formatter = this.makeFormatter();
      const plot = Utils.el('div', 'dx-bars-plot');
      const labels = Utils.el('div', 'dx-bars-labels');
      const columns = 'repeat(' + data.length + ', minmax(0, 1fr))';
      plot.style.gridTemplateColumns = columns;
      labels.style.gridTemplateColumns = columns;
      data.forEach((item) => {
        const col = Utils.el('div', 'dx-bar-col');
        if (this.options.showValues) {
          col.appendChild(Utils.el('span', 'dx-bar-value', { text: formatter(item.value) }));
        }
        const bar = Utils.el('div', 'dx-bar dx-bar--' + (item.color || this.options.color));
        bar.style.height = ((item.value / max) * 100).toFixed(2) + '%';
        col.appendChild(bar);
        plot.appendChild(col);
        labels.appendChild(Utils.el('span', 'dx-bar-label', { text: item.label || '' }));
      });
      this.el.appendChild(plot);
      this.el.appendChild(labels);
    }

    applyTimings() {
      const duration = this.options.duration;
      const stagger = this.options.stagger;
      this.el.querySelectorAll('.dx-bar').forEach((bar, index) => {
        bar.style.transitionDuration = duration + 's';
        bar.style.transitionDelay = (index * stagger).toFixed(3) + 's';
      });
      this.el.querySelectorAll('.dx-bar-value').forEach((value, index) => {
        value.style.transitionDelay = (index * stagger + duration * 0.55).toFixed(3) + 's';
      });
    }
  }

  return BarChart;
});

;
Dixel.define('BulletChart', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class BulletChart extends Component {
    static defaults = {
      label: 'Rendimiento',
      value: 0,
      target: 0,
      max: 100,
      ranges: [0.6, 0.85, 1],
      color: 'cyan',
      format: 'number',
      locale: 'es-CO'
    };

    build() {
      return Utils.el('div', 'dx-bullet');
    }

    ready() {
      this.el.classList.add('dx-bullet');
      const formatter = new Intl.NumberFormat(this.options.locale, { maximumFractionDigits: 1 });
      const format = (value) => this.options.format === 'percent' ? formatter.format(value) + '%' : formatter.format(value);
      const head = Utils.el('div', 'dx-bullet-head');
      head.appendChild(Utils.el('span', 'dx-bullet-label', { text: this.options.label }));
      head.appendChild(Utils.el('b', 'dx-bullet-value', { text: format(this.options.value) }));
      this.el.appendChild(head);
      const track = Utils.el('div', 'dx-bullet-track');
      this.options.ranges.forEach((range, index) => {
        const band = Utils.el('span', 'dx-bullet-band dx-bullet-band--' + index);
        band.style.width = Utils.clamp(range, 0, 1) * 100 + '%';
        track.appendChild(band);
      });
      this.bar = Utils.el('span', 'dx-bullet-bar');
      this.bar.style.background = 'var(--dx-' + this.options.color + ')';
      this.bar.style.width = Utils.clamp(this.options.value / this.options.max, 0, 1) * 100 + '%';
      track.appendChild(this.bar);
      if (this.options.target > 0) {
        const marker = Utils.el('span', 'dx-bullet-target');
        marker.style.left = Utils.clamp(this.options.target / this.options.max, 0, 1) * 100 + '%';
        marker.title = 'Objetivo: ' + format(this.options.target);
        track.appendChild(marker);
      }
      this.el.appendChild(track);
      this.whenVisible((visible) => {
        this.el.classList.toggle('is-on', visible);
      });
      if (Utils.reducedMotion) this.el.classList.add('is-on');
    }
  }

  return BulletChart;
});

;
Dixel.define('ChartTooltip', ['Utils'], function (Utils) {
  'use strict';

  class ChartTooltip {
    constructor() {
      this.el = null;
      this.visible = false;
    }

    ensure() {
      if (this.el) return;
      this.el = Utils.el('div', 'dx-chart-tip');
      this.titleEl = Utils.el('div', 'dx-chart-tip-title');
      this.rowsEl = Utils.el('div', 'dx-chart-tip-rows');
      this.el.appendChild(this.titleEl);
      this.el.appendChild(this.rowsEl);
      document.body.appendChild(this.el);
    }

    show(config) {
      this.ensure();
      this.titleEl.textContent = config.title || '';
      this.titleEl.style.display = config.title ? '' : 'none';
      this.rowsEl.innerHTML = '';
      (config.rows || []).forEach((row) => {
        const line = Utils.el('div', 'dx-chart-tip-row');
        if (row.color) {
          const dot = Utils.el('span', 'dx-chart-tip-dot');
          dot.style.background = row.color;
          line.appendChild(dot);
        }
        if (row.label) line.appendChild(Utils.el('span', 'dx-chart-tip-label', { text: row.label }));
        line.appendChild(Utils.el('b', 'dx-chart-tip-value', { text: row.value }));
        this.rowsEl.appendChild(line);
      });
      this.el.classList.add('is-visible');
      this.visible = true;
      this.place(config.x, config.y);
    }

    place(x, y) {
      if (!this.el) return;
      const width = this.el.offsetWidth;
      const height = this.el.offsetHeight;
      let left = x - width / 2;
      let top = y - height - 14;
      let below = false;
      if (top < 8) {
        top = y + 16;
        below = true;
      }
      left = Utils.clamp(left, 8, innerWidth - width - 8);
      top = Utils.clamp(top, 8, innerHeight - height - 8);
      this.el.style.transform = 'translate3d(' + Math.round(left) + 'px,' + Math.round(top) + 'px,0)';
      this.el.classList.toggle('is-below', below);
    }

    hide() {
      if (!this.el || !this.visible) return;
      this.visible = false;
      this.el.classList.remove('is-visible');
    }
  }

  return new ChartTooltip();
});

;
Dixel.define('DataTable', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class DataTable extends Component {
    static defaults = {
      columns: [],
      rows: [],
      sortable: true,
      sortKey: null,
      sortDir: 'asc',
      columnLines: false,
      height: null,
      emptyText: 'Sin datos',
      onSort: null,
      stagger: 0.045,
      maxStagger: 0.5
    };

    build() {
      return Utils.el('div', 'dx-table-wrap');
    }

    ready() {
      this.el.classList.add('dx-table-wrap');
      if (this.options.columnLines) this.el.classList.add('dx-table-wrap--collines');
      if (this.options.height) this.el.style.maxHeight = this.options.height;
      this.sortKey = this.options.sortKey;
      this.sortDir = this.options.sortDir;
      if (this.options.columns.length && !this.el.querySelector('table')) this.render();
      if (this.sortKey) this.applySort();
      this.whenVisible((visible) => {
        if (!visible || this.el.classList.contains('dx-table-wrap--in')) return;
        this.el.classList.add('dx-table-wrap--in');
        const settle = setTimeout(() => {
          if (this.rowItems) this.rowItems.forEach((item) => { item.tr.style.transitionDelay = ''; });
        }, (this.options.maxStagger + 0.7) * 1000);
        this.addCleanup(() => clearTimeout(settle));
      });
    }

    render() {
      const table = Utils.el('table', 'dx-table');
      const thead = Utils.el('thead', 'dx-table-head');
      const headRow = Utils.el('tr');
      this.headCells = {};
      this.options.columns.forEach((column) => {
        const th = Utils.el('th', 'dx-table-th' + (column.align === 'right' ? ' dx-table-cell--right' : ''), { scope: 'col' });
        const trigger = Utils.el('button', 'dx-table-sort', { type: 'button' });
        trigger.appendChild(Utils.el('span', null, { text: column.label }));
        const sortable = this.options.sortable && column.sortable !== false;
        if (sortable) {
          const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          arrow.setAttribute('viewBox', '0 0 10 12');
          arrow.setAttribute('class', 'dx-table-arrow');
          arrow.setAttribute('aria-hidden', 'true');
          arrow.innerHTML = '<path d="M5 1v10M1.5 7.5 5 11l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
          trigger.appendChild(arrow);
          this.listen(trigger, 'click', () => this.sortBy(column.key));
        } else {
          trigger.disabled = true;
        }
        th.appendChild(trigger);
        this.headCells[column.key] = th;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      this.tbody = Utils.el('tbody');
      this.rowItems = this.options.rows.map((row, index) => {
        const tr = Utils.el('tr', 'dx-table-row');
        tr.style.transitionDelay = Math.min(index * this.options.stagger, this.options.maxStagger).toFixed(3) + 's';
        this.options.columns.forEach((column) => {
          const td = Utils.el('td', 'dx-table-td' + (column.align === 'right' ? ' dx-table-cell--right' : ''));
          if (column.render) {
            Component.applyContent(column.render(row, td, this), td, this);
          } else {
            td.textContent = row[column.key] === undefined ? '' : String(row[column.key]);
          }
          tr.appendChild(td);
        });
        this.tbody.appendChild(tr);
        return { row, tr };
      });
      if (!this.rowItems.length) {
        const tr = Utils.el('tr', 'dx-table-row dx-table-row--empty');
        const td = Utils.el('td', 'dx-table-td dx-table-td--empty', { text: this.options.emptyText });
        td.colSpan = Math.max(this.options.columns.length, 1);
        tr.appendChild(td);
        this.tbody.appendChild(tr);
      }
      table.appendChild(this.tbody);
      this.el.appendChild(table);
    }

    sortBy(key) {
      this.sortDir = this.sortKey === key && this.sortDir === 'asc' ? 'desc' : 'asc';
      this.sortKey = key;
      this.applySort();
      if (this.options.onSort) this.options.onSort(this.sortKey, this.sortDir, this);
    }

    applySort() {
      if (!this.rowItems) return;
      const key = this.sortKey;
      const direction = this.sortDir === 'asc' ? 1 : -1;
      const sorted = this.rowItems.slice().sort((a, b) => direction * this.compare(a.row[key], b.row[key]));
      const fragment = document.createDocumentFragment();
      sorted.forEach((item) => fragment.appendChild(item.tr));
      this.tbody.appendChild(fragment);
      Object.keys(this.headCells).forEach((columnKey) => {
        const th = this.headCells[columnKey];
        th.classList.toggle('dx-table-th--asc', columnKey === key && this.sortDir === 'asc');
        th.classList.toggle('dx-table-th--desc', columnKey === key && this.sortDir === 'desc');
      });
    }

    compare(a, b) {
      const numA = typeof a === 'number' ? a : parseFloat(a);
      const numB = typeof b === 'number' ? b : parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    }
  }

  return DataTable;
});

;
Dixel.define('DonutProgress', ['Component', 'Utils', 'Ticker', 'Motion', 'ChartTooltip'], function (Component, Utils, Ticker, Motion, ChartTooltip) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  class DonutProgress extends Component {
    static defaults = {
      segments: [],
      colors: ['primary', 'cyan', 'magenta', 'success', 'warning'],
      size: 180,
      stroke: 16,
      gap: 2.5,
      duration: 1.3,
      centerLabel: 'Total',
      legend: true,
      locale: 'es-CO'
    };

    build() {
      return Utils.el('div', 'dx-donut');
    }

    ready() {
      this.el.classList.add('dx-donut');
      this.addCleanup(() => ChartTooltip.hide());
      const styles = getComputedStyle(this.el);
      this.palette = this.options.segments.map((segment, index) =>
        styles.getPropertyValue('--dx-' + (segment.color || this.options.colors[index % this.options.colors.length])).trim()
      );
      this.formatter = new Intl.NumberFormat(this.options.locale, { maximumFractionDigits: 1 });
      this.total = this.options.segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
      this.renderRing();
      if (this.options.legend) this.renderLegend();
      this.whenVisible((visible) => {
        if (visible && !this.played) this.play();
      });
    }

    renderRing() {
      const size = this.options.size;
      const radius = (size - this.options.stroke) / 2;
      this.circumference = 2 * Math.PI * radius;
      const holder = Utils.el('div', 'dx-donut-ring');
      holder.style.width = holder.style.height = size + 'px';
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      const track = document.createElementNS(SVG_NS, 'circle');
      track.setAttribute('cx', size / 2);
      track.setAttribute('cy', size / 2);
      track.setAttribute('r', radius);
      track.setAttribute('class', 'dx-donut-track');
      track.setAttribute('stroke-width', this.options.stroke);
      svg.appendChild(track);
      this.arcs = [];
      let offsetRatio = 0;
      this.options.segments.forEach((segment, index) => {
        const ratio = segment.value / this.total;
        const arc = document.createElementNS(SVG_NS, 'circle');
        arc.setAttribute('cx', size / 2);
        arc.setAttribute('cy', size / 2);
        arc.setAttribute('r', radius);
        arc.setAttribute('class', 'dx-donut-arc');
        arc.setAttribute('stroke', this.palette[index]);
        arc.setAttribute('stroke-width', this.options.stroke);
        arc.setAttribute('stroke-dasharray', '0 ' + this.circumference);
        arc.setAttribute('stroke-dashoffset', -offsetRatio * this.circumference);
        arc.dataset.index = index;
        this.arcs.push({ el: arc, ratio, offsetRatio });
        svg.appendChild(arc);
        offsetRatio += ratio;
      });
      holder.appendChild(svg);
      this.center = Utils.el('div', 'dx-donut-center');
      this.centerValue = Utils.el('b', 'dx-donut-value', { text: '0' });
      this.center.appendChild(this.centerValue);
      this.center.appendChild(Utils.el('span', 'dx-donut-label', { text: this.options.centerLabel }));
      holder.appendChild(this.center);
      this.el.appendChild(holder);
      this.bindHover(svg);
    }

    renderLegend() {
      const legend = Utils.el('div', 'dx-donut-legend');
      this.options.segments.forEach((segment, index) => {
        const item = Utils.el('div', 'dx-donut-legend-item');
        const dot = Utils.el('span', 'dx-chart-legend-dot');
        dot.style.background = this.palette[index];
        item.appendChild(dot);
        item.appendChild(Utils.el('span', 'dx-donut-legend-name', { text: segment.label }));
        item.appendChild(Utils.el('b', null, { text: Math.round((segment.value / this.total) * 100) + '%' }));
        legend.appendChild(item);
      });
      this.el.appendChild(legend);
    }

    bindHover(svg) {
      this.listen(svg, 'pointerover', (event) => {
        const arc = event.target.closest('.dx-donut-arc');
        if (!arc) return;
        const index = +arc.dataset.index;
        arc.classList.add('is-hot');
        const segment = this.options.segments[index];
        ChartTooltip.show({
          rows: [{
            color: this.palette[index],
            label: segment.label,
            value: this.formatter.format(segment.value) + ' · ' + Math.round((segment.value / this.total) * 100) + '%'
          }],
          x: event.clientX,
          y: event.clientY - 8
        });
      });
      this.listen(svg, 'pointerout', (event) => {
        const arc = event.target.closest('.dx-donut-arc');
        if (arc) arc.classList.remove('is-hot');
        ChartTooltip.hide();
      });
    }

    play() {
      this.played = true;
      if (Utils.reducedMotion) {
        this.applyProgress(1);
        return;
      }
      let elapsed = 0;
      const stop = Ticker.add((time, delta) => {
        elapsed += delta;
        const progress = Motion.eases.inOut(Utils.clamp(elapsed / this.options.duration, 0, 1));
        this.applyProgress(progress);
        if (progress >= 1) stop();
      });
      this.addCleanup(stop);
    }

    applyProgress(progress) {
      const gapLength = this.options.gap;
      this.arcs.forEach((arc) => {
        const visible = Math.max(arc.ratio * this.circumference * progress - gapLength, 0);
        arc.el.setAttribute('stroke-dasharray', visible + ' ' + (this.circumference - visible));
      });
      this.centerValue.textContent = this.formatter.format(Math.round(this.total * progress));
    }
  }

  return DonutProgress;
});

;
Dixel.define('HeatmapGrid', ['Component', 'Utils', 'ChartTooltip'], function (Component, Utils, ChartTooltip) {
  'use strict';

  const DAY_MS = 86400000;

  class HeatmapGrid extends Component {
    static defaults = {
      weeks: 26,
      data: null,
      color: 'primary',
      levels: 5,
      unit: 'actividades',
      dayLabels: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
      locale: 'es-CO'
    };

    build() {
      return Utils.el('div', 'dx-heatmap');
    }

    ready() {
      this.el.classList.add('dx-heatmap');
      if (this.options.color && this.options.color !== 'primary') {
        this.el.style.setProperty('--dx-heat-color', 'var(--dx-' + this.options.color + ', ' + this.options.color + ')');
      }
      this.dateFormatter = new Intl.DateTimeFormat(this.options.locale, { day: 'numeric', month: 'short', year: 'numeric' });
      this.values = this.options.data || this.generateDemoData();
      this.maxValue = Math.max.apply(null, this.values.map((entry) => entry.value).concat([1]));
      this.renderGrid();
      this.bindHover();
      this.settled = false;
      this.whenVisible((visible) => {
        this.el.classList.toggle('is-on', visible);
        if (visible && !this.settled) {
          this.settled = true;
          const settle = setTimeout(() => {
            Array.from(this.grid.children).forEach((cell) => { cell.style.transitionDelay = ''; });
          }, 1400);
          this.addCleanup(() => clearTimeout(settle));
        }
      });
      this.addCleanup(() => ChartTooltip.hide());
    }

    generateDemoData() {
      const total = this.options.weeks * 7;
      const today = Date.now();
      const entries = [];
      let seed = 7;
      for (let i = 0; i < total; i++) {
        seed = (seed * 16807) % 2147483647;
        const noise = (seed / 2147483647);
        const weekly = Math.sin((i % 7) * 0.9) * 0.3 + 0.5;
        entries.push({
          date: new Date(today - (total - 1 - i) * DAY_MS),
          value: Math.max(0, Math.round(noise * weekly * 12 - 2))
        });
      }
      return entries;
    }

    levelOf(value) {
      if (value <= 0) return 0;
      return Math.min(this.options.levels - 1, 1 + Math.floor((value / this.maxValue) * (this.options.levels - 2)));
    }

    renderGrid() {
      const wrap = Utils.el('div', 'dx-heatmap-wrap dx-scroll-x dx-scroll-thin');
      const days = Utils.el('div', 'dx-heatmap-days');
      this.options.dayLabels.forEach((label, index) => {
        if (index % 2 === 0) days.appendChild(Utils.el('span', null, { text: label }));
        else days.appendChild(Utils.el('span'));
      });
      wrap.appendChild(days);
      this.grid = Utils.el('div', 'dx-heatmap-grid');
      this.grid.style.gridTemplateColumns = 'repeat(' + this.options.weeks + ', 1fr)';
      this.values.forEach((entry, index) => {
        const cell = Utils.el('span', 'dx-heatmap-cell dx-heatmap-cell--' + this.levelOf(entry.value));
        cell.dataset.index = index;
        cell.style.transitionDelay = Math.min(index * 2, 600) + 'ms';
        this.grid.appendChild(cell);
      });
      wrap.appendChild(this.grid);
      this.el.appendChild(wrap);
      const scale = Utils.el('div', 'dx-heatmap-scale');
      scale.appendChild(Utils.el('span', null, { text: 'Menos' }));
      for (let level = 0; level < this.options.levels; level++) {
        scale.appendChild(Utils.el('i', 'dx-heatmap-cell dx-heatmap-cell--' + level));
      }
      scale.appendChild(Utils.el('span', null, { text: 'Más' }));
      this.el.appendChild(scale);
    }

    bindHover() {
      this.listen(this.grid, 'pointerover', (event) => {
        const cell = event.target.closest('.dx-heatmap-cell');
        if (!cell || cell.dataset.index === undefined) return;
        const entry = this.values[+cell.dataset.index];
        const rect = cell.getBoundingClientRect();
        ChartTooltip.show({
          title: this.dateFormatter.format(entry.date),
          rows: [{ value: entry.value + ' ' + this.options.unit }],
          x: rect.left + rect.width / 2,
          y: rect.top
        });
      });
      this.listen(this.grid, 'pointerleave', () => ChartTooltip.hide());
    }
  }

  return HeatmapGrid;
});

;
Dixel.define('KpiTile', ['Component', 'Utils', 'StatCounter', 'Sparkline'], function (Component, Utils, StatCounter, Sparkline) {
  'use strict';

  class KpiTile extends Component {
    static defaults = {
      label: 'KPI',
      value: 0,
      prefix: '',
      suffix: '',
      decimals: 0,
      locale: 'es-CO',
      delta: null,
      deltaSuffix: '%',
      data: null,
      color: 'primary',
      duration: 1.6
    };

    build() {
      return Utils.el('div', 'dx-kpi');
    }

    ready() {
      this.el.classList.add('dx-kpi');
      const head = Utils.el('div', 'dx-kpi-head');
      head.appendChild(Utils.el('span', 'dx-kpi-label', { text: this.options.label }));
      if (this.options.delta !== null) head.appendChild(this.buildDelta());
      this.el.appendChild(head);
      const valueHost = Utils.el('div', 'dx-kpi-value');
      this.el.appendChild(valueHost);
      this.counter = new StatCounter({
        value: this.options.value,
        prefix: this.options.prefix,
        suffix: this.options.suffix,
        decimals: this.options.decimals,
        locale: this.options.locale,
        duration: this.options.duration
      }).mount(valueHost);
      this.addCleanup(() => this.counter.destroy());
      if (this.options.data && this.options.data.length > 1) {
        const sparkHost = Utils.el('div', 'dx-kpi-spark');
        this.el.appendChild(sparkHost);
        this.spark = new Sparkline({ data: this.options.data, color: this.options.color }).mount(sparkHost);
        this.addCleanup(() => this.spark.destroy());
      }
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-kpi--in');
      });
    }

    buildDelta() {
      const delta = this.options.delta;
      const positive = delta >= 0;
      const badge = Utils.el('span', 'dx-kpi-delta ' + (positive ? 'dx-kpi-delta--up' : 'dx-kpi-delta--down'));
      badge.innerHTML =
        '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5 9 8.5H1Z"/></svg>' +
        '<span>' + Math.abs(delta) + Utils.escape(this.options.deltaSuffix) + '</span>';
      return badge;
    }
  }

  return KpiTile;
});

;
Dixel.define('LineChart', ['Component', 'Utils', 'Ticker', 'Motion', 'ChartTooltip'], function (Component, Utils, Ticker, Motion, ChartTooltip) {
  'use strict';

  function channelsOf(hex) {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const num = parseInt(full, 16);
    return ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255);
  }

  function niceCeil(value) {
    if (value <= 0) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const unit = value / power;
    const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
    return nice * power;
  }

  function traceSmooth(ctx, path) {
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length - 1; i++) {
      const midX = (path[i].x + path[i + 1].x) / 2;
      const midY = (path[i].y + path[i + 1].y) / 2;
      ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY);
    }
    const last = path[path.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  class LineChart extends Component {
    static defaults = {
      labels: [],
      series: [],
      colors: ['primary', 'cyan', 'magenta', 'warning'],
      curve: 'smooth',
      lineWidth: 2,
      showGrid: true,
      gridColor: 'line',
      labelRotation: 0,
      pointMarkers: false,
      yTicks: 4,
      duration: 1.5,
      stagger: 0.18,
      fill: true,
      glow: true,
      legend: true,
      tooltip: true,
      markExtremes: false,
      format: 'compact',
      currency: 'USD',
      locale: 'es-CO'
    };

    build() {
      return Utils.el('div', 'dx-linechart');
    }

    makeFormatter() {
      const locale = this.options.locale;
      if (this.options.format === 'percent') {
        const base = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
        return (value) => base.format(value) + '%';
      }
      if (this.options.format === 'currency') {
        const base = new Intl.NumberFormat(locale, { style: 'currency', currency: this.options.currency, maximumFractionDigits: 0 });
        return (value) => base.format(value);
      }
      if (this.options.format === 'number') {
        const base = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
        return (value) => base.format(value);
      }
      const base = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: 'compact' });
      return (value) => base.format(value);
    }

    ready() {
      this.el.classList.add('dx-linechart');
      this.addCleanup(() => ChartTooltip.hide());
      this.canvasHost = Utils.el('div', 'dx-linechart-frame');
      this.canvas = Utils.el('canvas', 'dx-linechart-canvas');
      this.canvasHost.appendChild(this.canvas);
      this.el.appendChild(this.canvasHost);
      this.context = this.canvas.getContext('2d');
      this.hidden = this.options.series.map(() => false);
      this.resolveColors();
      this.formatter = this.makeFormatter();
      this.elapsed = 0;
      this.played = false;
      this.stopFrames = null;
      this.hoverIndex = -1;
      this.layout = null;
      this.canvasOrigin = null;
      this.computeScale();
      if (this.options.legend && this.options.series.length > 1) this.renderLegend();
      this.fit();
      this.listen(window, 'resize', () => {
        this.fit();
        this.canvasOrigin = null;
        this.paint();
      });
      if (this.options.tooltip) this.bindPointer();
      this.observeTheme();
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible && !this.played) this.play();
        if (!visible) this.clearHover();
      });
    }

    resolveColors() {
      const styles = getComputedStyle(this.el);
      this.palette = this.options.series.map((serie, index) =>
        styles.getPropertyValue('--dx-' + (serie.color || this.options.colors[index % this.options.colors.length])).trim()
      );
      this.inkDim = styles.getPropertyValue('--dx-ink-dim').trim();
      this.inkColor = styles.getPropertyValue('--dx-ink').trim();
      this.gridColor = styles.getPropertyValue('--dx-' + this.options.gridColor).trim() ||
        styles.getPropertyValue('--dx-line').trim();
      this.fontFamily = styles.getPropertyValue('--dx-font-sans').trim() || 'sans-serif';
    }

    observeTheme() {
      const observer = new MutationObserver(() => {
        this.resolveColors();
        if (this.legendEl) {
          this.legendEl.querySelectorAll('.dx-chart-legend-dot').forEach((dot, index) => {
            dot.style.background = this.palette[index];
          });
        }
        this.paint();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dx-theme'] });
      this.addCleanup(() => observer.disconnect());
    }

    computeScale() {
      const values = [];
      this.options.series.forEach((serie, index) => {
        if (this.hidden[index]) return;
        serie.data.forEach((value) => values.push(value));
      });
      const rawMax = values.length ? Math.max.apply(null, values) : 1;
      const rawMin = values.length ? Math.min.apply(null, values) : 0;
      this.minValue = Math.min(0, rawMin);
      this.maxValue = niceCeil(rawMax);
      if (this.maxValue === this.minValue) this.maxValue = this.minValue + 1;
    }

    renderLegend() {
      this.legendEl = Utils.el('div', 'dx-chart-legend');
      this.options.series.forEach((serie, index) => {
        const item = Utils.el('button', 'dx-chart-legend-item', { type: 'button' });
        const dot = Utils.el('span', 'dx-chart-legend-dot');
        dot.style.background = this.palette[index];
        item.appendChild(dot);
        item.appendChild(Utils.el('span', null, { text: serie.label || 'Serie ' + (index + 1) }));
        this.listen(item, 'click', () => {
          this.hidden[index] = !this.hidden[index];
          item.classList.toggle('is-off', this.hidden[index]);
          this.computeScale();
          this.paint();
        });
        this.legendEl.appendChild(item);
      });
      this.el.appendChild(this.legendEl);
    }

    fit() {
      this.size = Utils.fitCanvas(this.canvas, this.context);
    }

    bindPointer() {
      this.listen(this.canvas, 'pointerenter', () => {
        this.canvasOrigin = this.canvas.getBoundingClientRect();
      });
      this.listen(this.canvas, 'pointermove', (event) => {
        if (!this.layout || !this.canvasOrigin) return;
        const localX = event.clientX - this.canvasOrigin.left;
        const ratio = (localX - this.layout.padLeft) / Math.max(this.layout.plotWidth, 1);
        const index = Math.round(ratio * (this.layout.pointCount - 1));
        const clamped = Utils.clamp(index, 0, this.layout.pointCount - 1);
        if (clamped === this.hoverIndex) return;
        this.hoverIndex = clamped;
        this.paint();
        this.showTip();
      });
      this.listen(this.canvas, 'pointerleave', () => this.clearHover());
    }

    clearHover() {
      if (this.hoverIndex === -1) return;
      this.hoverIndex = -1;
      ChartTooltip.hide();
      this.paint();
    }

    showTip() {
      const index = this.hoverIndex;
      if (index < 0 || !this.canvasOrigin) return;
      const rows = [];
      this.options.series.forEach((serie, seriesIndex) => {
        if (this.hidden[seriesIndex] || serie.data[index] === undefined) return;
        rows.push({
          color: this.palette[seriesIndex],
          label: serie.label || 'Serie ' + (seriesIndex + 1),
          value: this.formatter(serie.data[index])
        });
      });
      if (!rows.length) return;
      const x = this.canvasOrigin.left + this.layout.padLeft + (index / Math.max(this.layout.pointCount - 1, 1)) * this.layout.plotWidth;
      ChartTooltip.show({
        title: this.options.labels[index] || '',
        rows,
        x,
        y: this.canvasOrigin.top + this.layout.padTop
      });
    }

    totalDuration() {
      return this.options.duration + this.options.stagger * Math.max(this.options.series.length - 1, 0);
    }

    play() {
      this.played = true;
      if (Utils.reducedMotion) {
        this.elapsed = this.totalDuration();
        this.paint();
        return;
      }
      this.halt();
      this.stopFrames = Ticker.add((time, delta) => {
        this.elapsed += delta;
        this.paint();
        if (this.elapsed >= this.totalDuration()) this.halt();
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    seriesProgress(index) {
      const local = (this.elapsed - index * this.options.stagger) / this.options.duration;
      return Motion.eases.inOut(Utils.clamp(local, 0, 1));
    }

    pointsFor(serie, pad, plotWidth, plotHeight, pointCount) {
      const range = this.maxValue - this.minValue;
      return serie.data.map((value, index) => ({
        x: pad.left + (index / Math.max(pointCount - 1, 1)) * plotWidth,
        y: pad.top + plotHeight - ((value - this.minValue) / range) * plotHeight
      }));
    }

    paint() {
      const ctx = this.context;
      const width = this.size.width;
      const height = this.size.height;
      ctx.clearRect(0, 0, width, height);
      if (!this.options.series.length) return;
      ctx.font = '10px ' + this.fontFamily;
      const ticks = [];
      for (let i = 0; i <= this.options.yTicks; i++) {
        ticks.push(this.minValue + ((this.maxValue - this.minValue) * i) / this.options.yTicks);
      }
      let labelWidth = 0;
      ticks.forEach((tick) => {
        labelWidth = Math.max(labelWidth, ctx.measureText(this.formatter(tick)).width);
      });
      const rotation = this.options.labelRotation;
      const pad = { left: labelWidth + 12, right: 8, top: 8, bottom: this.options.labels.length ? (rotation ? 36 : 22) : 8 };
      const plotWidth = width - pad.left - pad.right;
      const plotHeight = height - pad.top - pad.bottom;
      if (plotWidth <= 0 || plotHeight <= 0) return;
      const pointCount = Math.max.apply(null, this.options.series.map((serie) => serie.data.length));
      this.layout = { padLeft: pad.left, padTop: pad.top, plotWidth, plotHeight, pointCount };
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.inkDim;
      ctx.strokeStyle = this.gridColor;
      ctx.lineWidth = 1;
      ticks.forEach((tick, index) => {
        const y = pad.top + plotHeight - (index / this.options.yTicks) * plotHeight;
        if (this.options.showGrid) {
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(width - pad.right, y);
          ctx.stroke();
        }
        ctx.fillText(this.formatter(tick), pad.left - 6, y);
      });
      if (this.options.labels.length) {
        ctx.textBaseline = 'alphabetic';
        const minGap = rotation ? 28 : 46;
        const step = Math.max(1, Math.ceil((this.options.labels.length * minGap) / Math.max(plotWidth, 1)));
        this.options.labels.forEach((label, index) => {
          if (index % step !== 0) return;
          const x = pad.left + (index / Math.max(pointCount - 1, 1)) * plotWidth;
          if (rotation) {
            ctx.save();
            ctx.translate(x, height - 6);
            ctx.rotate((-rotation * Math.PI) / 180);
            ctx.textAlign = 'right';
            ctx.fillText(label, 0, 0);
            ctx.restore();
          } else {
            ctx.textAlign = 'center';
            ctx.fillText(label, x, height - 6);
          }
        });
      }
      if (this.hoverIndex >= 0) {
        const hoverX = pad.left + (this.hoverIndex / Math.max(pointCount - 1, 1)) * plotWidth;
        ctx.strokeStyle = this.inkDim;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(hoverX, pad.top);
        ctx.lineTo(hoverX, pad.top + plotHeight);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const smooth = this.options.curve !== 'linear';
      this.options.series.forEach((serie, seriesIndex) => {
        if (this.hidden[seriesIndex]) return;
        const progress = this.seriesProgress(seriesIndex);
        if (progress <= 0 || serie.data.length < 2) return;
        const pts = this.pointsFor(serie, pad, plotWidth, plotHeight, pointCount);
        const visibleCount = 1 + (pts.length - 1) * progress;
        const wholeCount = Math.floor(visibleCount);
        const partial = visibleCount - wholeCount;
        const path = pts.slice(0, wholeCount);
        if (wholeCount < pts.length && partial > 0) {
          const prev = pts[wholeCount - 1];
          const next = pts[wholeCount];
          path.push({ x: prev.x + (next.x - prev.x) * partial, y: prev.y + (next.y - prev.y) * partial });
        }
        if (path.length < 2) return;
        const color = this.palette[seriesIndex];
        if (this.options.fill) {
          const baseline = pad.top + plotHeight;
          const gradient = ctx.createLinearGradient(0, pad.top, 0, baseline);
          gradient.addColorStop(0, 'rgba(' + channelsOf(color) + ',' + 0.2 * progress + ')');
          gradient.addColorStop(1, 'rgba(' + channelsOf(color) + ',0)');
          ctx.beginPath();
          ctx.moveTo(path[0].x, baseline);
          if (smooth) traceSmooth(ctx, path);
          else path.forEach((pt) => ctx.lineTo(pt.x, pt.y));
          ctx.lineTo(path[path.length - 1].x, baseline);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();
        }
        const strokeWidth = serie.lineWidth || this.options.lineWidth;
        ctx.beginPath();
        if (smooth) traceSmooth(ctx, path);
        else path.forEach((pt, index) => (index ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        if (this.options.glow) {
          ctx.save();
          ctx.shadowColor = 'rgba(' + channelsOf(color) + ',0.5)';
          ctx.shadowBlur = 8;
          ctx.strokeStyle = color;
          ctx.lineWidth = strokeWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = strokeWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
        }
        if (this.options.pointMarkers) {
          const markerCount = Math.min(wholeCount, pts.length);
          ctx.fillStyle = color;
          for (let p = 0; p < markerCount; p++) {
            ctx.beginPath();
            ctx.arc(pts[p].x, pts[p].y, strokeWidth + 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (this.hoverIndex >= 0 && this.hoverIndex < pts.length && progress >= 1) {
          const pt = pts[this.hoverIndex];
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.stroke();
        }
        if (this.options.markExtremes && progress >= 1) this.drawExtremes(ctx, serie, pts, color);
      });
    }

    drawExtremes(ctx, serie, pts, color) {
      let maxIndex = 0;
      let minIndex = 0;
      serie.data.forEach((value, index) => {
        if (value > serie.data[maxIndex]) maxIndex = index;
        if (value < serie.data[minIndex]) minIndex = index;
      });
      ctx.font = '600 10px ' + this.fontFamily;
      [{ idx: maxIndex, mark: '▲ ', dy: -10 }, { idx: minIndex, mark: '▼ ', dy: 16 }].forEach((extreme) => {
        const pt = pts[extreme.idx];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(extreme.mark + this.formatter(serie.data[extreme.idx]), pt.x, pt.y + extreme.dy);
      });
    }
  }

  return LineChart;
});

;
Dixel.define('LiveChart', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class LiveChart extends Component {
    static defaults = {
      capacity: 60,
      min: 0,
      max: 100,
      color: 'cyan',
      fill: true,
      demo: false,
      demoInterval: 0.35,
      label: null
    };

    build() {
      return Utils.el('div', 'dx-livechart');
    }

    ready() {
      this.el.classList.add('dx-livechart');
      if (this.options.label) {
        const head = Utils.el('div', 'dx-livechart-head');
        head.appendChild(Utils.el('span', 'dx-livechart-label', { text: this.options.label }));
        this.valueEl = Utils.el('b', 'dx-livechart-value', { text: '—' });
        head.appendChild(this.valueEl);
        this.el.appendChild(head);
      }
      this.frame = Utils.el('div', 'dx-livechart-frame');
      this.canvas = Utils.el('canvas', 'dx-livechart-canvas');
      this.frame.appendChild(this.canvas);
      this.dot = Utils.el('span', 'dx-livechart-dot');
      this.frame.appendChild(this.dot);
      this.el.appendChild(this.frame);
      this.context = this.canvas.getContext('2d');
      this.buffer = [];
      this.demoClock = 0;
      this.demoPhase = Math.random() * 10;
      this.dirty = true;
      const styles = getComputedStyle(this.el);
      this.color = styles.getPropertyValue('--dx-' + this.options.color).trim();
      this.gridColor = styles.getPropertyValue('--dx-line').trim();
      this.dot.style.background = this.color;
      this.fit();
      this.listen(window, 'resize', () => {
        this.fit();
        this.dirty = true;
      });
      this.stopFrame = null;
      this.whenVisible((visible) => {
        if (visible && !this.stopFrame) {
          this.stopFrame = Ticker.add((time, delta) => this.tick(delta));
        } else if (!visible && this.stopFrame) {
          this.stopFrame();
          this.stopFrame = null;
        }
      });
      this.addCleanup(() => {
        if (this.stopFrame) this.stopFrame();
      });
    }

    fit() {
      this.size = Utils.fitCanvas(this.canvas, this.context);
    }

    push(value) {
      this.buffer.push(Utils.clamp(value, this.options.min, this.options.max));
      if (this.buffer.length > this.options.capacity) this.buffer.shift();
      if (this.valueEl) this.valueEl.textContent = Math.round(value);
      this.dirty = true;
    }

    tick(delta) {
      if (!this.visible) return;
      if (this.options.demo && !Utils.reducedMotion) {
        this.demoClock += delta;
        if (this.demoClock >= this.options.demoInterval) {
          this.demoClock = 0;
          this.demoPhase += 0.4;
          const span = this.options.max - this.options.min;
          const wave = Math.sin(this.demoPhase) * 0.25 + Math.sin(this.demoPhase * 2.7) * 0.12;
          this.push(this.options.min + span * (0.5 + wave + (Math.random() - 0.5) * 0.12));
        }
      }
      if (!this.dirty) return;
      this.dirty = false;
      this.paint();
    }

    paint() {
      const ctx = this.context;
      const width = this.size.width;
      const height = this.size.height;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = this.gridColor;
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      if (this.buffer.length < 2) return;
      const span = this.options.max - this.options.min;
      const stepX = width / (this.options.capacity - 1);
      const offset = (this.options.capacity - this.buffer.length) * stepX;
      const points = this.buffer.map((value, index) => ({
        x: offset + index * stepX,
        y: height - 6 - ((value - this.options.min) / span) * (height - 12)
      }));
      if (this.options.fill) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, Utils.withAlpha(this.color, 0.2));
        gradient.addColorStop(1, Utils.withAlpha(this.color, 0));
        ctx.beginPath();
        ctx.moveTo(points[0].x, height);
        points.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(points[points.length - 1].x, height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      ctx.beginPath();
      points.forEach((pt, index) => (index ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.save();
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 7;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
      const tip = points[points.length - 1];
      this.dot.style.transform = 'translate3d(' + (tip.x - 4) + 'px,' + (tip.y - 4) + 'px,0)';
    }
  }

  return LiveChart;
});

;
Dixel.define('Meter', ['Component', 'Utils', 'Ticker', 'Motion'], function (Component, Utils, Ticker, Motion) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attributes) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes).forEach((key) => node.setAttribute(key, attributes[key]));
    return node;
  }

  class Meter extends Component {
    static defaults = {
      value: 0,
      min: 0,
      max: 100,
      label: null,
      suffix: '',
      decimals: 0,
      locale: 'es-CO',
      color: 'primary',
      colorEnd: 'cyan',
      gradient: true,
      thickness: 9,
      duration: 1.4
    };

    build() {
      return Utils.el('div', 'dx-meter');
    }

    ready() {
      this.el.classList.add('dx-meter');
      this.formatter = new Intl.NumberFormat(this.options.locale, {
        minimumFractionDigits: this.options.decimals,
        maximumFractionDigits: this.options.decimals
      });
      this.render();
      this.played = false;
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible && !this.played) this.play();
      });
    }

    fraction() {
      return Utils.clamp((this.options.value - this.options.min) / (this.options.max - this.options.min || 1), 0, 1);
    }

    render() {
      const arc = 'M 9 51 A 41 41 0 0 1 91 51';
      const svg = svgEl('svg', { viewBox: '0 0 100 58', class: 'dx-meter-svg', role: 'img' });
      let stroke = 'var(--dx-' + this.options.color + ')';
      if (this.options.gradient) {
        const gradientId = Utils.uid();
        const defs = svgEl('defs', {});
        const gradient = svgEl('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '1', y2: '0' });
        const startStop = svgEl('stop', { offset: '0%' });
        startStop.style.stopColor = 'var(--dx-' + this.options.color + ')';
        const endStop = svgEl('stop', { offset: '100%' });
        endStop.style.stopColor = 'var(--dx-' + this.options.colorEnd + ')';
        gradient.appendChild(startStop);
        gradient.appendChild(endStop);
        defs.appendChild(gradient);
        svg.appendChild(defs);
        stroke = 'url(#' + gradientId + ')';
      }
      svg.appendChild(svgEl('path', {
        d: arc, fill: 'none', stroke: 'var(--dx-line)',
        'stroke-width': this.options.thickness, 'stroke-linecap': 'round'
      }));
      this.valuePath = svgEl('path', {
        d: arc, fill: 'none', stroke: stroke,
        'stroke-width': this.options.thickness, 'stroke-linecap': 'round'
      });
      svg.appendChild(this.valuePath);
      this.el.appendChild(svg);
      this.arcLength = this.valuePath.getTotalLength();
      this.valuePath.setAttribute('stroke-dasharray', this.arcLength);
      this.valuePath.setAttribute('stroke-dashoffset', this.arcLength);
      this.valuePath.style.transition = 'stroke-dashoffset ' + this.options.duration + 's var(--dx-ease)';
      const readout = Utils.el('div', 'dx-meter-readout');
      this.numberEl = Utils.el('span', 'dx-meter-value', { text: this.formatter.format(this.options.min) + this.options.suffix });
      readout.appendChild(this.numberEl);
      if (this.options.label) readout.appendChild(Utils.el('span', 'dx-meter-label', { text: this.options.label }));
      this.el.appendChild(readout);
      const bounds = Utils.el('div', 'dx-meter-bounds');
      bounds.appendChild(Utils.el('span', null, { text: this.formatter.format(this.options.min) }));
      bounds.appendChild(Utils.el('span', null, { text: this.formatter.format(this.options.max) }));
      this.el.appendChild(bounds);
    }

    play() {
      this.played = true;
      const target = this.arcLength * (1 - this.fraction());
      if (Utils.reducedMotion) {
        this.valuePath.style.transition = 'none';
        this.valuePath.style.strokeDashoffset = target;
        this.numberEl.textContent = this.formatter.format(this.options.value) + this.options.suffix;
        return;
      }
      this.valuePath.style.strokeDashoffset = target;
      const duration = Math.max(this.options.duration, 0.001);
      const from = this.options.min;
      const to = this.options.value;
      let elapsed = 0;
      this.halt();
      this.stopFrames = Ticker.add((time, delta) => {
        elapsed += delta;
        const progress = Motion.eases.inOut(Utils.clamp(elapsed / duration, 0, 1));
        this.numberEl.textContent = this.formatter.format(from + (to - from) * progress) + this.options.suffix;
        if (elapsed >= duration) this.halt();
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return Meter;
});

;
Dixel.define('RadarChart', ['Component', 'Utils', 'Ticker', 'Motion', 'ChartTooltip'], function (Component, Utils, Ticker, Motion, ChartTooltip) {
  'use strict';

  class RadarChart extends Component {
    static defaults = {
      axes: [],
      series: [],
      colors: ['primary', 'cyan', 'magenta'],
      max: 100,
      rings: 4,
      duration: 1.2,
      legend: true,
      locale: 'es-CO'
    };

    build() {
      return Utils.el('div', 'dx-radar');
    }

    ready() {
      this.el.classList.add('dx-radar');
      this.addCleanup(() => ChartTooltip.hide());
      this.frame = Utils.el('div', 'dx-radar-frame');
      this.canvas = Utils.el('canvas', 'dx-radar-canvas');
      this.frame.appendChild(this.canvas);
      this.el.appendChild(this.frame);
      this.context = this.canvas.getContext('2d');
      const styles = getComputedStyle(this.el);
      this.palette = this.options.series.map((serie, index) =>
        styles.getPropertyValue('--dx-' + (serie.color || this.options.colors[index % this.options.colors.length])).trim()
      );
      this.inkDim = styles.getPropertyValue('--dx-ink-dim').trim();
      this.gridColor = styles.getPropertyValue('--dx-line').trim();
      this.fontFamily = styles.getPropertyValue('--dx-font-sans').trim() || 'sans-serif';
      this.formatter = new Intl.NumberFormat(this.options.locale, { maximumFractionDigits: 1 });
      this.elapsed = 0;
      this.played = false;
      this.stopFrames = null;
      this.hoverAxis = -1;
      this.origin = null;
      if (this.options.legend && this.options.series.length > 1) this.renderLegend();
      this.fit();
      this.listen(window, 'resize', () => {
        this.fit();
        this.origin = null;
        this.paint();
      });
      this.bindPointer();
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible && !this.played) this.play();
        if (!visible) this.clearHover();
      });
    }

    renderLegend() {
      const legend = Utils.el('div', 'dx-chart-legend');
      this.options.series.forEach((serie, index) => {
        const item = Utils.el('span', 'dx-chart-legend-item');
        const dot = Utils.el('span', 'dx-chart-legend-dot');
        dot.style.background = this.palette[index];
        item.appendChild(dot);
        item.appendChild(Utils.el('span', null, { text: serie.label || 'Serie ' + (index + 1) }));
        legend.appendChild(item);
      });
      this.el.appendChild(legend);
    }

    fit() {
      this.size = Utils.fitCanvas(this.canvas, this.context);
    }

    play() {
      this.played = true;
      if (Utils.reducedMotion) {
        this.elapsed = this.options.duration;
        this.paint();
        return;
      }
      this.halt();
      this.stopFrames = Ticker.add((time, delta) => {
        this.elapsed += delta;
        this.paint();
        if (this.elapsed >= this.options.duration) this.halt();
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    angleOf(index) {
      return -Math.PI / 2 + (index / this.options.axes.length) * Math.PI * 2;
    }

    bindPointer() {
      this.listen(this.canvas, 'pointerenter', () => {
        this.origin = this.canvas.getBoundingClientRect();
      });
      this.listen(this.canvas, 'pointermove', (event) => {
        if (!this.origin || !this.options.axes.length) return;
        const centerX = this.origin.left + this.origin.width / 2;
        const centerY = this.origin.top + this.origin.height / 2;
        const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) + Math.PI / 2;
        const slice = (Math.PI * 2) / this.options.axes.length;
        const index = ((Math.round(angle / slice) % this.options.axes.length) + this.options.axes.length) % this.options.axes.length;
        if (index === this.hoverAxis) return;
        this.hoverAxis = index;
        this.paint();
        this.showTip(event.clientX, event.clientY);
      });
      this.listen(this.canvas, 'pointerleave', () => this.clearHover());
    }

    clearHover() {
      if (this.hoverAxis === -1) return;
      this.hoverAxis = -1;
      ChartTooltip.hide();
      this.paint();
    }

    showTip(x, y) {
      const index = this.hoverAxis;
      if (index < 0) return;
      ChartTooltip.show({
        title: this.options.axes[index],
        rows: this.options.series.map((serie, seriesIndex) => ({
          color: this.palette[seriesIndex],
          label: serie.label || 'Serie ' + (seriesIndex + 1),
          value: this.formatter.format(serie.data[index] || 0)
        })),
        x,
        y: y - 10
      });
    }

    paint() {
      const ctx = this.context;
      const width = this.size.width;
      const height = this.size.height;
      const axes = this.options.axes;
      ctx.clearRect(0, 0, width, height);
      if (axes.length < 3) return;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 28;
      const progress = Motion.eases.outBack(Utils.clamp(this.elapsed / this.options.duration, 0, 1));
      ctx.strokeStyle = this.gridColor;
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= this.options.rings; ring++) {
        const ringRadius = (radius * ring) / this.options.rings;
        ctx.beginPath();
        axes.forEach((axis, index) => {
          const angle = this.angleOf(index);
          const x = centerX + Math.cos(angle) * ringRadius;
          const y = centerY + Math.sin(angle) * ringRadius;
          index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.font = '10px ' + this.fontFamily;
      axes.forEach((axis, index) => {
        const angle = this.angleOf(index);
        const endX = centerX + Math.cos(angle) * radius;
        const endY = centerY + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = index === this.hoverAxis ? this.inkDim : this.gridColor;
        ctx.stroke();
        ctx.fillStyle = this.inkDim;
        ctx.textAlign = Math.abs(Math.cos(angle)) < 0.3 ? 'center' : Math.cos(angle) > 0 ? 'left' : 'right';
        ctx.textBaseline = Math.sin(angle) > 0.3 ? 'top' : Math.sin(angle) < -0.3 ? 'bottom' : 'middle';
        ctx.fillText(axis, centerX + Math.cos(angle) * (radius + 10), centerY + Math.sin(angle) * (radius + 10));
      });
      this.options.series.forEach((serie, seriesIndex) => {
        const color = this.palette[seriesIndex];
        ctx.beginPath();
        axes.forEach((axis, index) => {
          const angle = this.angleOf(index);
          const value = Utils.clamp((serie.data[index] || 0) / this.options.max, 0, 1) * progress;
          const x = centerX + Math.cos(angle) * radius * value;
          const y = centerY + Math.sin(angle) * radius * value;
          index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = Utils.withAlpha(color, 0.18);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();
        axes.forEach((axis, index) => {
          const angle = this.angleOf(index);
          const value = Utils.clamp((serie.data[index] || 0) / this.options.max, 0, 1) * progress;
          ctx.beginPath();
          ctx.arc(centerX + Math.cos(angle) * radius * value, centerY + Math.sin(angle) * radius * value, index === this.hoverAxis ? 4 : 2.6, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      });
    }
  }

  return RadarChart;
});

;
Dixel.define('RingChart', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attributes) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes).forEach((key) => node.setAttribute(key, attributes[key]));
    return node;
  }

  class RingChart extends Component {
    static defaults = {
      data: [],
      colors: ['primary', 'cyan', 'magenta', 'warning', 'success'],
      thickness: 12,
      duration: 1,
      stagger: 0.14,
      centerLabel: null,
      centerValue: null,
      legend: true,
      locale: 'es-CO'
    };

    build() {
      return Utils.el('div', 'dx-ring');
    }

    ready() {
      this.el.classList.add('dx-ring');
      this.render();
      this.played = false;
      this.whenVisible((visible) => {
        if (visible && !this.played) this.play();
      });
    }

    colorVar(item, index) {
      return 'var(--dx-' + (item.color || this.options.colors[index % this.options.colors.length]) + ')';
    }

    render() {
      const data = this.options.data;
      const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
      const radius = 50 - this.options.thickness / 2;
      const circumference = 2 * Math.PI * radius;
      const figure = Utils.el('div', 'dx-ring-figure');
      const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'dx-ring-svg', role: 'img' });
      svg.appendChild(svgEl('circle', {
        cx: 50, cy: 50, r: radius, fill: 'none',
        stroke: 'var(--dx-line)', 'stroke-width': this.options.thickness
      }));
      let cumulative = 0;
      this.segments = data.map((item, index) => {
        const fraction = item.value / total;
        const dash = fraction * circumference;
        const segment = svgEl('circle', {
          cx: 50, cy: 50, r: radius, fill: 'none',
          stroke: this.colorVar(item, index),
          'stroke-width': this.options.thickness,
          'stroke-dasharray': dash + ' ' + (circumference - dash),
          'stroke-dashoffset': dash,
          transform: 'rotate(' + (cumulative * 360 - 90) + ' 50 50)'
        });
        segment.style.transition = 'stroke-dashoffset ' + this.options.duration + 's var(--dx-ease) ' + (index * this.options.stagger).toFixed(3) + 's';
        cumulative += fraction;
        svg.appendChild(segment);
        return segment;
      });
      figure.appendChild(svg);
      if (this.options.centerValue !== null || this.options.centerLabel) {
        const center = Utils.el('div', 'dx-ring-center');
        if (this.options.centerValue !== null) {
          center.appendChild(Utils.el('span', 'dx-ring-center-value', { text: String(this.options.centerValue) }));
        }
        if (this.options.centerLabel) {
          center.appendChild(Utils.el('span', 'dx-ring-center-label', { text: this.options.centerLabel }));
        }
        figure.appendChild(center);
      }
      this.el.appendChild(figure);
      if (this.options.legend) this.renderLegend(total);
    }

    renderLegend(total) {
      const formatter = new Intl.NumberFormat(this.options.locale, { maximumFractionDigits: 1 });
      const legend = Utils.el('ul', 'dx-ring-legend');
      this.options.data.forEach((item, index) => {
        const row = Utils.el('li', 'dx-ring-legend-item');
        const dot = Utils.el('span', 'dx-ring-legend-dot');
        dot.style.background = this.colorVar(item, index);
        row.appendChild(dot);
        row.appendChild(Utils.el('span', 'dx-ring-legend-label', { text: item.label }));
        row.appendChild(Utils.el('span', 'dx-ring-legend-value', { text: formatter.format((item.value / total) * 100) + '%' }));
        legend.appendChild(row);
      });
      this.el.appendChild(legend);
    }

    play() {
      this.played = true;
      this.segments.forEach((segment) => {
        if (Utils.reducedMotion) segment.style.transition = 'none';
        segment.style.strokeDashoffset = '0';
      });
    }
  }

  return RingChart;
});

;
Dixel.define('Sparkline', ['Component', 'Utils', 'Ticker', 'Motion'], function (Component, Utils, Ticker, Motion) {
  'use strict';

  function channelsOf(hex) {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const num = parseInt(full, 16);
    return ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255);
  }

  class Sparkline extends Component {
    static defaults = {
      data: [],
      color: 'primary',
      lineWidth: 2,
      fill: true,
      pointMarkers: false,
      duration: 1.4,
      padding: 3
    };

    build() {
      return Utils.el('div', 'dx-spark');
    }

    ready() {
      this.el.classList.add('dx-spark');
      this.canvas = this.el.querySelector('canvas') || this.el.appendChild(Utils.el('canvas', 'dx-spark-canvas'));
      this.context = this.canvas.getContext('2d');
      this.color = getComputedStyle(this.el).getPropertyValue('--dx-' + this.options.color).trim();
      this.channels = channelsOf(this.color);
      this.progress = 0;
      this.played = false;
      this.stopFrames = null;
      this.fit();
      this.listen(window, 'resize', () => {
        this.fit();
        this.paint();
      });
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible && !this.played) this.play();
      });
    }

    fit() {
      this.size = Utils.fitCanvas(this.canvas, this.context);
    }

    play() {
      this.played = true;
      if (Utils.reducedMotion) {
        this.progress = 1;
        this.paint();
        return;
      }
      const duration = Math.max(this.options.duration, 0.001);
      let elapsed = 0;
      this.halt();
      this.stopFrames = Ticker.add((time, delta) => {
        elapsed += delta;
        this.progress = Motion.eases.inOut(Utils.clamp(elapsed / duration, 0, 1));
        this.paint();
        if (elapsed >= duration) this.halt();
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    points() {
      const data = this.options.data;
      const pad = this.options.padding;
      const width = this.size.width - pad * 2;
      const height = this.size.height - pad * 2;
      const min = Math.min(...data);
      const max = Math.max(...data);
      const span = max - min || 1;
      return data.map((value, index) => ({
        x: pad + (index / (data.length - 1)) * width,
        y: pad + height - ((value - min) / span) * height
      }));
    }

    paint() {
      const ctx = this.context;
      const width = this.size.width;
      const height = this.size.height;
      ctx.clearRect(0, 0, width, height);
      if (this.options.data.length < 2 || this.progress <= 0) return;
      const pts = this.points();
      const visibleCount = 1 + (pts.length - 1) * this.progress;
      const wholeCount = Math.floor(visibleCount);
      const partial = visibleCount - wholeCount;
      const path = pts.slice(0, wholeCount);
      if (wholeCount < pts.length && partial > 0) {
        const prev = pts[wholeCount - 1];
        const next = pts[wholeCount];
        path.push({ x: prev.x + (next.x - prev.x) * partial, y: prev.y + (next.y - prev.y) * partial });
      }
      if (path.length < 2) return;
      if (this.options.fill) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(' + this.channels + ',' + 0.3 * this.progress + ')');
        gradient.addColorStop(1, 'rgba(' + this.channels + ',0)');
        ctx.beginPath();
        ctx.moveTo(path[0].x, height);
        path.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(path[path.length - 1].x, height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      ctx.beginPath();
      path.forEach((pt, index) => (index ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.options.lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      if (this.options.pointMarkers) {
        ctx.fillStyle = this.color;
        for (let p = 0; p < wholeCount && p < pts.length; p++) {
          ctx.beginPath();
          ctx.arc(pts[p].x, pts[p].y, this.options.lineWidth, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const tip = path[path.length - 1];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, this.options.lineWidth + 1, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  return Sparkline;
});

;
Dixel.define('StatCounter', ['Component', 'Utils', 'Ticker', 'Motion'], function (Component, Utils, Ticker, Motion) {
  'use strict';

  class StatCounter extends Component {
    static defaults = {
      value: 0,
      from: 0,
      duration: 1.6,
      decimals: 0,
      locale: 'es-CO',
      prefix: '',
      suffix: '',
      label: null,
      ease: 'outExpo'
    };

    build() {
      const el = Utils.el('div', 'dx-stat');
      return el;
    }

    ready() {
      this.el.classList.add('dx-stat');
      this.formatter = new Intl.NumberFormat(this.options.locale, {
        minimumFractionDigits: this.options.decimals,
        maximumFractionDigits: this.options.decimals
      });
      if (!this.el.querySelector('.dx-stat-number')) this.el.innerHTML = this.markup();
      this.numberEl = this.el.querySelector('.dx-stat-number');
      this.played = false;
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible && !this.played) this.play();
      });
    }

    markup() {
      const label = this.options.label ? '<span class="dx-stat-label">' + Utils.escape(this.options.label) + '</span>' : '';
      const prefix = this.options.prefix ? '<span class="dx-stat-affix">' + Utils.escape(this.options.prefix) + '</span>' : '';
      const suffix = this.options.suffix ? '<span class="dx-stat-affix">' + Utils.escape(this.options.suffix) + '</span>' : '';
      return label + '<span class="dx-stat-value">' + prefix + '<span class="dx-stat-number">' + this.format(this.options.from) + '</span>' + suffix + '</span>';
    }

    format(value) {
      return this.formatter.format(value);
    }

    play() {
      this.played = true;
      if (Utils.reducedMotion) {
        this.numberEl.textContent = this.format(this.options.value);
        return;
      }
      const ease = Motion.eases[this.options.ease] || Motion.eases.outExpo;
      const from = this.options.from;
      const to = this.options.value;
      const duration = Math.max(this.options.duration, 0.001);
      let elapsed = 0;
      this.halt();
      this.stopFrames = Ticker.add((time, delta) => {
        elapsed += delta;
        const progress = Utils.clamp(elapsed / duration, 0, 1);
        this.numberEl.textContent = this.format(from + (to - from) * ease(progress));
        if (progress >= 1) this.halt();
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return StatCounter;
});

;
Dixel.define('Alert', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const icons = {
    info: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    success: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>'
  };

  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class Alert extends Component {
    static defaults = {
      type: 'info',
      title: '',
      message: '',
      dismissible: true,
      animateIn: true
    };

    build() {
      const role = this.options.type === 'danger' || this.options.type === 'warning' ? 'alert' : 'status';
      const el = Utils.el('div', 'dx-alert dx-alert--' + this.options.type, { role });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const safeTitle = this.options.html ? this.options.title : Utils.escape(this.options.title);
      const safeMessage = this.options.html ? this.options.message : Utils.escape(this.options.message);
      const title = this.options.title ? '<strong class="dx-alert-title">' + safeTitle + '</strong>' : '';
      const message = this.options.message ? '<span class="dx-alert-message">' + safeMessage + '</span>' : '';
      const close = this.options.dismissible
        ? '<button class="dx-alert-close dx-focusable" type="button" aria-label="Cerrar aviso">' + closeIcon + '</button>'
        : '';
      return '<span class="dx-alert-icon" aria-hidden="true">' + (icons[this.options.type] || icons.info) + '</span>' +
        '<div class="dx-alert-content">' + title + message + '</div>' + close;
    }

    ready() {
      this.el.classList.add('dx-alert', 'dx-alert--' + this.options.type);
      if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      this.dismissing = false;
      const close = this.el.querySelector('.dx-alert-close');
      if (close) this.listen(close, 'click', this.dismiss);
      if (this.options.animateIn) {
        Motion.fromTo(this.el, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'outQuart' });
      }
    }

    dismiss() {
      if (this.dismissing) return;
      this.dismissing = true;
      Motion.to(this.el, {
        y: -8,
        opacity: 0,
        duration: 0.2,
        ease: 'in',
        onComplete: () => this.destroy()
      });
    }
  }

  return Alert;
});

;
Dixel.define('Badge', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Badge extends Component {
    static defaults = {
      label: 'Badge',
      tone: 'primary',
      variant: 'soft',
      dot: false
    };

    build() {
      const el = Utils.el('span', this.classNames());
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-badge dx-badge--' + this.options.tone + ' dx-badge--' + this.options.variant;
    }

    markup() {
      const dot = this.options.dot ? '<span class="dx-badge-dot" aria-hidden="true"></span>' : '';
      return dot + '<span>' + Utils.escape(this.options.label) + '</span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-badge')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
    }
  }

  return Badge;
});

;
Dixel.define('Chip', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const closeIcon = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class Chip extends Component {
    static defaults = {
      label: 'Chip',
      icon: null,
      tone: 'neutral',
      removable: true,
      onRemove: null
    };

    build() {
      const el = Utils.el('span', 'dx-chip dx-chip--' + this.options.tone);
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const label = Utils.escape(this.options.label);
      const icon = this.options.icon ? '<span class="dx-chip-icon" aria-hidden="true">' + this.options.icon + '</span>' : '';
      const remove = this.options.removable
        ? '<button class="dx-chip-remove dx-focusable" type="button" aria-label="Quitar ' + label + '">' + closeIcon + '</button>'
        : '';
      return icon + '<span class="dx-chip-label">' + label + '</span>' + remove;
    }

    ready() {
      this.el.classList.add('dx-chip', 'dx-chip--' + this.options.tone);
      if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      this.removing = false;
      const removeButton = this.el.querySelector('.dx-chip-remove');
      if (removeButton) this.listen(removeButton, 'click', this.remove);
    }

    remove() {
      if (this.removing) return;
      this.removing = true;
      Motion.to(this.el, {
        scale: 0.5,
        opacity: 0,
        duration: 0.2,
        ease: 'in',
        onComplete: () => {
          if (this.options.onRemove) this.options.onRemove(this);
          this.destroy();
        }
      });
    }
  }

  return Chip;
});

;
Dixel.define('EmptyState', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const defaultIcon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7z"/><path d="M4 8.5l8 4.5 8-4.5M12 13v7"/></svg>';

  class EmptyState extends Component {
    static defaults = {
      icon: defaultIcon,
      title: 'Nada por aquí',
      description: '',
      actionLabel: null,
      onAction: null
    };

    build() {
      const el = Utils.el('section', 'dx-empty');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const description = this.options.description ? '<p class="dx-empty-desc">' + Utils.escape(this.options.description) + '</p>' : '';
      const action = this.options.actionLabel
        ? '<button class="dx-empty-action dx-focusable" type="button">' + Utils.escape(this.options.actionLabel) + '</button>'
        : '';
      return '<div class="dx-empty-icon" aria-hidden="true">' + this.options.icon + '</div>' +
        '<h3 class="dx-empty-title">' + Utils.escape(this.options.title) + '</h3>' +
        description + action;
    }

    ready() {
      this.el.classList.add('dx-empty');
      if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      const action = this.el.querySelector('.dx-empty-action');
      if (action && this.options.onAction) this.listen(action, 'click', this.options.onAction);
      this.revealed = false;
      this.whenVisible((visible) => {
        if (!visible || this.revealed) return;
        this.revealed = true;
        Motion.fromTo(this.el.children, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'outQuart', stagger: 0.08 });
      });
    }
  }

  return EmptyState;
});

;
Dixel.define('LoaderBar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderBar extends Component {
    static defaults = {
      fixed: true,
      color: 'primary'
    };

    build() {
      const el = Utils.el('div', 'dx-loadbar', { role: 'progressbar', 'aria-hidden': 'true', 'aria-label': 'Cargando' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadbar-runner"></span>';
    }

    ready() {
      this.el.classList.add('dx-loadbar');
      if (!this.el.querySelector('.dx-loadbar-runner')) this.el.innerHTML = this.markup();
      this.el.classList.toggle('dx-loadbar--fixed', !!this.options.fixed);
      this.el.style.setProperty('--dx-loadbar-color', 'var(--dx-' + this.options.color + ')');
      this.runner = this.el.querySelector('.dx-loadbar-runner');
      this.active = false;
      this.doneTimer = null;
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
      this.addCleanup(() => {
        if (this.doneTimer) clearTimeout(this.doneTimer);
      });
    }

    start() {
      if (this.doneTimer) {
        clearTimeout(this.doneTimer);
        this.doneTimer = null;
      }
      this.active = true;
      this.el.classList.remove('is-done');
      this.el.classList.add('is-active');
      this.el.setAttribute('aria-hidden', 'false');
    }

    done() {
      if (!this.active) return;
      this.active = false;
      this.el.classList.add('is-done');
      this.doneTimer = setTimeout(() => {
        this.el.classList.remove('is-active', 'is-done');
        this.el.setAttribute('aria-hidden', 'true');
        this.doneTimer = null;
      }, 450);
    }
  }

  return LoaderBar;
});

;
Dixel.define('LoaderDots', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderDots extends Component {
    static defaults = {
      count: 5,
      color: 'primary',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', 'dx-loaddots', { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      let dots = '';
      for (let i = 0; i < this.options.count; i++) {
        dots += '<span class="dx-loaddots-dot" style="animation-delay:' + (i * 0.12).toFixed(2) + 's"></span>';
      }
      return dots;
    }

    ready() {
      this.el.classList.add('dx-loaddots');
      if (!this.el.querySelector('.dx-loaddots-dot')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.el.style.setProperty('--dx-loader-color', 'var(--dx-' + this.options.color + ')');
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return LoaderDots;
});

;
Dixel.define('LoaderOrbit', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderOrbit extends Component {
    static defaults = {
      size: 'md',
      color: 'primary',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', 'dx-loadorbit dx-loadorbit--' + this.options.size, { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadorbit-core"></span>' +
        '<span class="dx-loadorbit-ring dx-loadorbit-ring--a"><span class="dx-loadorbit-sat"></span></span>' +
        '<span class="dx-loadorbit-ring dx-loadorbit-ring--b"><span class="dx-loadorbit-sat"></span></span>' +
        '<span class="dx-loadorbit-ring dx-loadorbit-ring--c"><span class="dx-loadorbit-sat"></span></span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-loadorbit')) {
        this.el.classList.add('dx-loadorbit', 'dx-loadorbit--' + this.options.size);
      }
      if (!this.el.querySelector('.dx-loadorbit-ring')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.el.style.setProperty('--dx-loader-color', 'var(--dx-' + this.options.color + ')');
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return LoaderOrbit;
});

;
Dixel.define('LoaderOverlay', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderOverlay extends Component {
    static defaults = {
      label: 'Cargando',
      fullscreen: false,
      open: false
    };

    build() {
      const el = Utils.el('div', 'dx-loadover', { role: 'status', 'aria-live': 'polite', 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadover-spinner" aria-hidden="true"></span>' +
        (this.options.label ? '<span class="dx-loadover-label">' + this.options.label + '</span>' : '');
    }

    ready() {
      this.el.classList.add('dx-loadover');
      if (!this.el.querySelector('.dx-loadover-spinner')) this.el.innerHTML = this.markup();
      this.el.classList.toggle('dx-loadover--fullscreen', !!this.options.fullscreen);
      if (!this.options.fullscreen) this.anchorHost();
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
      if (this.options.open) this.show();
    }

    anchorHost() {
      const host = this.el.parentElement;
      if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    }

    show() {
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      if (this.el.parentElement) this.el.parentElement.setAttribute('aria-busy', 'true');
    }

    hide() {
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      if (this.el.parentElement) this.el.parentElement.removeAttribute('aria-busy');
    }

    setLabel(label) {
      const labelEl = this.el.querySelector('.dx-loadover-label');
      if (labelEl) labelEl.textContent = label;
    }
  }

  return LoaderOverlay;
});

;
Dixel.define('LoaderPulse', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderPulse extends Component {
    static defaults = {
      size: 'md',
      color: 'primary',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', 'dx-loadpulse dx-loadpulse--' + this.options.size, { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadpulse-ring" style="animation-delay:0s"></span>' +
        '<span class="dx-loadpulse-ring" style="animation-delay:0.5s"></span>' +
        '<span class="dx-loadpulse-ring" style="animation-delay:1s"></span>' +
        '<span class="dx-loadpulse-core"></span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-loadpulse')) {
        this.el.classList.add('dx-loadpulse', 'dx-loadpulse--' + this.options.size);
      }
      if (!this.el.querySelector('.dx-loadpulse-ring')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.el.style.setProperty('--dx-loader-color', 'var(--dx-' + this.options.color + ')');
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return LoaderPulse;
});

;
Dixel.define('Modal', ['Component', 'Utils', 'Overlays'], function (Component, Utils, Overlays) {
  'use strict';

  const closeIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class Modal extends Component {
    static defaults = {
      title: '',
      content: '',
      footer: '',
      dismissible: true
    };

    build() {
      const el = Utils.el('div', 'dx-modal', { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const content = typeof this.options.content === 'string' ? this.options.content : '';
      const footer = typeof this.options.footer === 'string' && this.options.footer
        ? '<footer class="dx-modal-foot">' + this.options.footer + '</footer>'
        : '';
      return '<div class="dx-modal-overlay"></div>' +
        '<div class="dx-modal-panel" role="dialog" aria-modal="true" aria-labelledby="' + id + '" tabindex="-1">' +
        '<header class="dx-modal-head">' +
        '<h2 class="dx-modal-title" id="' + id + '">' + Utils.escape(this.options.title) + '</h2>' +
        '<button class="dx-modal-close dx-focusable" type="button" aria-label="Cerrar diálogo">' + closeIcon + '</button>' +
        '</header>' +
        '<div class="dx-modal-body dx-scroll-thin">' + content + '</div>' +
        footer +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-modal');
      if (!this.el.querySelector('.dx-modal-panel')) this.el.innerHTML = this.markup();
      this.el.setAttribute('aria-hidden', 'true');
      this.panel = this.el.querySelector('.dx-modal-panel');
      this.overlay = this.el.querySelector('.dx-modal-overlay');
      this.closeButton = this.el.querySelector('.dx-modal-close');
      this.slot = this.el.querySelector('.dx-modal-body');
      if (this.options.content && typeof this.options.content !== 'string') {
        Component.applyContent(this.options.content, this.slot, this);
      }
      if (this.options.footer && typeof this.options.footer !== 'string') {
        this.slots.footer = Utils.el('footer', 'dx-modal-foot');
        this.panel.appendChild(this.slots.footer);
        Component.applyContent(this.options.footer, this.slots.footer, this);
      }
      this.isOpen = false;
      this.lastFocus = null;
      this.unbindKeys = null;
      this.previousOverflow = '';
      this.listen(this.closeButton, 'click', this.close);
      this.listen(this.overlay, 'click', () => {
        if (this.options.dismissible) this.close();
      });
      this.addCleanup(() => this.releaseGlobal());
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.unlockScroll = Overlays.lock(this);
      this.popEscape = this.options.dismissible ? Overlays.pushEscape(() => this.close()) : null;
      this.unbindKeys = Utils.on(document, 'keydown', (event) => {
        if (event.key === 'Tab') this.trapFocus(event);
      });
      const first = this.panel.querySelector(focusableSelector);
      (first || this.panel).focus();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      this.releaseGlobal();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    trapFocus(event) {
      const focusables = Array.from(this.panel.querySelectorAll(focusableSelector));
      if (!focusables.length) {
        event.preventDefault();
        this.panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    releaseGlobal() {
      if (this.unbindKeys) {
        this.unbindKeys();
        this.unbindKeys = null;
      }
      if (this.popEscape) {
        this.popEscape();
        this.popEscape = null;
      }
      if (this.unlockScroll) {
        this.unlockScroll();
        this.unlockScroll = null;
      }
    }
  }

  return Modal;
});

;
Dixel.define('ProgressBar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ProgressBar extends Component {
    static defaults = {
      value: 0,
      max: 100,
      label: null,
      showValue: true,
      indeterminate: false
    };

    build() {
      const el = Utils.el('div', 'dx-progress');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const header = this.options.label || this.options.showValue
        ? '<div class="dx-progress-head">' +
          (this.options.label ? '<span class="dx-progress-label">' + this.options.label + '</span>' : '') +
          (this.options.showValue && !this.options.indeterminate ? '<span class="dx-progress-value">0%</span>' : '') +
          '</div>'
        : '';
      return header + '<div class="dx-progress-track"><span class="dx-progress-fill"></span></div>';
    }

    ready() {
      this.el.classList.add('dx-progress');
      if (!this.el.querySelector('.dx-progress-track')) this.el.innerHTML = this.markup();
      this.track = this.el.querySelector('.dx-progress-track');
      this.fill = this.el.querySelector('.dx-progress-fill');
      this.valueText = this.el.querySelector('.dx-progress-value');
      this.track.setAttribute('role', 'progressbar');
      this.track.setAttribute('aria-valuemin', '0');
      this.track.setAttribute('aria-valuemax', String(this.options.max));
      if (this.options.label) this.track.setAttribute('aria-label', this.options.label);
      if (this.options.indeterminate) {
        this.el.classList.add('is-indeterminate');
        this.whenVisible((visible) => {
          this.fill.classList.toggle('dx-anim-paused', !visible);
        });
        return;
      }
      this.set(this.options.value);
    }

    set(value) {
      const clamped = Utils.clamp(value, 0, this.options.max);
      const ratio = this.options.max ? clamped / this.options.max : 0;
      this.value = clamped;
      this.fill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
      this.track.setAttribute('aria-valuenow', String(Math.round(clamped)));
      if (this.valueText) this.valueText.textContent = Math.round(ratio * 100) + '%';
    }
  }

  return ProgressBar;
});

;
Dixel.define('ProgressRing', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ProgressRing extends Component {
    static defaults = {
      value: 0,
      max: 100,
      size: 96,
      stroke: 8,
      showValue: true,
      label: 'Progreso'
    };

    build() {
      const el = Utils.el('div', 'dx-ring');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const size = this.options.size;
      const stroke = this.options.stroke;
      const radius = (size - stroke) / 2;
      this.circumference = 2 * Math.PI * radius;
      const gradientId = Utils.uid();
      const center = size / 2;
      const value = this.options.showValue ? '<span class="dx-ring-value">0%</span>' : '';
      return '<svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="var(--dx-primary)"/><stop offset="1" stop-color="var(--dx-cyan)"/>' +
        '</linearGradient></defs>' +
        '<circle class="dx-ring-track" cx="' + center + '" cy="' + center + '" r="' + radius + '" stroke-width="' + stroke + '"/>' +
        '<circle class="dx-ring-fill" cx="' + center + '" cy="' + center + '" r="' + radius + '" stroke-width="' + stroke +
        '" stroke="url(#' + gradientId + ')" stroke-dasharray="' + this.circumference.toFixed(2) +
        '" stroke-dashoffset="' + this.circumference.toFixed(2) + '" transform="rotate(-90 ' + center + ' ' + center + ')"/>' +
        '</svg>' + value;
    }

    ready() {
      this.el.classList.add('dx-ring');
      if (!this.el.querySelector('svg')) this.el.innerHTML = this.markup();
      if (this.circumference === undefined) {
        this.circumference = 2 * Math.PI * ((this.options.size - this.options.stroke) / 2);
      }
      this.el.style.setProperty('--dx-ring-size', this.options.size + 'px');
      this.fill = this.el.querySelector('.dx-ring-fill');
      this.valueText = this.el.querySelector('.dx-ring-value');
      this.el.setAttribute('role', 'progressbar');
      this.el.setAttribute('aria-label', this.options.label);
      this.el.setAttribute('aria-valuemin', '0');
      this.el.setAttribute('aria-valuemax', String(this.options.max));
      this.set(this.options.value);
    }

    set(value) {
      const clamped = Utils.clamp(value, 0, this.options.max);
      const ratio = this.options.max ? clamped / this.options.max : 0;
      this.value = clamped;
      this.fill.style.strokeDashoffset = (this.circumference * (1 - ratio)).toFixed(2);
      this.el.setAttribute('aria-valuenow', String(Math.round(clamped)));
      if (this.valueText) this.valueText.textContent = Math.round(ratio * 100) + '%';
    }
  }

  return ProgressRing;
});

;
Dixel.define('Skeleton', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Skeleton extends Component {
    static defaults = {
      variant: 'text',
      lines: 3,
      height: 160,
      sheenAngle: null,
      sheenSpeed: null,
      sheenColor: null
    };

    build() {
      const el = Utils.el('div', 'dx-skeleton dx-skeleton--' + this.options.variant, { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const lines = (count) => {
        let html = '';
        for (let i = 0; i < count; i++) {
          html += '<div class="dx-skeleton-piece dx-skeleton-line' + (i === count - 1 ? ' is-short' : '') + '"></div>';
        }
        return html;
      };
      if (this.options.variant === 'avatar') {
        return '<div class="dx-skeleton-piece dx-skeleton-circle"></div><div class="dx-skeleton-group">' + lines(2) + '</div>';
      }
      if (this.options.variant === 'card') {
        return '<div class="dx-skeleton-piece dx-skeleton-block" style="height:' + this.options.height + 'px"></div>' + lines(this.options.lines);
      }
      return lines(this.options.lines);
    }

    ready() {
      this.el.classList.add('dx-skeleton', 'dx-skeleton--' + this.options.variant);
      this.el.setAttribute('aria-hidden', 'true');
      if (this.options.sheenAngle !== null) this.el.style.setProperty('--dx-skeleton-angle', this.options.sheenAngle + 'deg');
      if (this.options.sheenSpeed !== null) this.el.style.setProperty('--dx-skeleton-speed', this.options.sheenSpeed + 's');
      if (this.options.sheenColor) this.el.style.setProperty('--dx-skeleton-sheen', this.options.sheenColor);
      if (!this.el.querySelector('.dx-skeleton-piece')) this.el.innerHTML = this.markup();
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return Skeleton;
});

;
Dixel.define('Spinner', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Spinner extends Component {
    static defaults = {
      variant: 'ring',
      size: 'md',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', this.classNames(), { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-spinner dx-spinner--' + this.options.variant + ' dx-spinner--' + this.options.size;
    }

    markup() {
      if (this.options.variant === 'dots') {
        return '<span class="dx-spinner-dot"></span><span class="dx-spinner-dot"></span><span class="dx-spinner-dot"></span>';
      }
      if (this.options.variant === 'pulse') {
        return '<span class="dx-spinner-pulse"></span><span class="dx-spinner-core"></span>';
      }
      return '<span class="dx-spinner-ring"></span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-spinner')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', this.options.label);
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return Spinner;
});

;
Dixel.define('Toast', ['Component', 'Motion', 'Ticker', 'Utils'], function (Component, Motion, Ticker, Utils) {
  'use strict';

  const icons = {
    info: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    success: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>'
  };

  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class Toast extends Component {
    static defaults = {
      position: 'bottom-right',
      duration: 4.5,
      max: 5
    };

    build() {
      return Utils.el('div', 'dx-toasts dx-toasts--' + this.options.position, { 'aria-live': 'polite' });
    }

    ready() {
      this.el.classList.add('dx-toasts', 'dx-toasts--' + this.options.position);
      if (!this.el.getAttribute('aria-live')) this.el.setAttribute('aria-live', 'polite');
      this.active = new Map();
      this.fromTop = this.options.position.indexOf('top') === 0;
      this.addCleanup(() => {
        this.active.forEach((stop) => stop());
        this.active.clear();
      });
    }

    push(config) {
      const settings = Object.assign({ type: 'info', title: '', message: '', duration: this.options.duration }, config);
      while (this.active.size >= this.options.max) {
        this.dismiss(this.active.keys().next().value, true);
      }
      const toast = Utils.el('div', 'dx-toast dx-toast--' + settings.type, { role: 'status' });
      const safeTitle = settings.html ? settings.title : Utils.escape(settings.title);
      const safeMessage = settings.html ? settings.message : Utils.escape(settings.message);
      const title = settings.title ? '<strong class="dx-toast-title">' + safeTitle + '</strong>' : '';
      const message = settings.message ? '<span class="dx-toast-message">' + safeMessage + '</span>' : '';
      const action = settings.action && settings.action.label
        ? '<button class="dx-toast-action dx-focusable" type="button">' + Utils.escape(settings.action.label) + '</button>'
        : '';
      toast.innerHTML =
        '<span class="dx-toast-icon" aria-hidden="true">' + (icons[settings.type] || icons.info) + '</span>' +
        '<div class="dx-toast-content">' + title + message + action + '</div>' +
        '<button class="dx-toast-close dx-focusable" type="button" aria-label="Cerrar notificación">' + closeIcon + '</button>' +
        '<span class="dx-toast-life"><span class="dx-toast-life-fill"></span></span>';
      this.el.appendChild(toast);
      Motion.fromTo(toast, { y: this.fromTop ? -18 : 18, scale: 0.94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'outBack' });
      const fill = toast.querySelector('.dx-toast-life-fill');
      let elapsed = 0;
      let paused = false;
      const stop = Ticker.add((time, delta) => {
        if (paused) return;
        elapsed += delta;
        const progress = Math.min(elapsed / settings.duration, 1);
        fill.style.transform = 'scaleX(' + (1 - progress).toFixed(4) + ')';
        if (progress >= 1) this.dismiss(toast);
      });
      this.active.set(toast, stop);
      toast.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') paused = true; });
      toast.addEventListener('pointerleave', () => { paused = false; });
      toast.querySelector('.dx-toast-close').addEventListener('click', () => this.dismiss(toast));
      const actionButton = toast.querySelector('.dx-toast-action');
      if (actionButton) {
        actionButton.addEventListener('click', () => {
          if (settings.action.onClick) settings.action.onClick(toast, this);
          if (settings.action.dismiss !== false) this.dismiss(toast);
        });
      }
      return toast;
    }

    dismiss(toast, immediate) {
      if (!toast || !this.active.has(toast)) return;
      this.active.get(toast)();
      this.active.delete(toast);
      if (immediate) {
        toast.remove();
        return;
      }
      Motion.to(toast, {
        x: 28,
        opacity: 0,
        duration: 0.22,
        ease: 'in',
        onComplete: () => toast.remove()
      });
    }

    info(config) {
      return this.push(Object.assign({}, config, { type: 'info' }));
    }

    success(config) {
      return this.push(Object.assign({}, config, { type: 'success' }));
    }

    warning(config) {
      return this.push(Object.assign({}, config, { type: 'warning' }));
    }

    danger(config) {
      return this.push(Object.assign({}, config, { type: 'danger' }));
    }
  }

  return Toast;
});

;
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

;
Dixel.define('FlowGraph', ['Component', 'Utils', 'IconSet'], function (Component, Utils, IconSet) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NODE_WIDTH = 180;
  const HEADER_HEIGHT = 36;
  const ROW_HEIGHT = 26;
  const FLOW_SHAPES = { dash: '6 14', dots: '0.1 12', 'dash-dots': '12 8 0.1 8' };
  const FLOW_PERIODS = { dash: 20, dots: 12.1, 'dash-dots': 28.1 };

  class FlowGraph extends Component {
    static defaults = {
      nodes: [],
      edges: [],
      groups: [],
      wireStyle: 'bezier',
      flow: true,
      flowShape: 'dash',
      flowSpeed: 40,
      glow: false,
      grid: true,
      zoom: true,
      minZoom: 0.5,
      maxZoom: 1.6,
      removable: true,
      nodeWidth: null,
      renderNode: null,
      accepts: null,
      onConnect: null,
      onDisconnect: null,
      onNodeRemove: null,
      onChange: null
    };

    build() {
      return Utils.el('div', 'dx-flow');
    }

    ready() {
      this.el.classList.add('dx-flow');
      if (this.options.grid) this.el.classList.add('dx-flow--grid');
      this.world = Utils.el('div', 'dx-flow-world');
      this.groupLayer = Utils.el('div', 'dx-flow-groups');
      this.svg = document.createElementNS(SVG_NS, 'svg');
      this.svg.setAttribute('class', 'dx-flow-wires');
      this.ghostPath = document.createElementNS(SVG_NS, 'path');
      this.ghostPath.setAttribute('class', 'dx-flow-wire dx-flow-wire--ghost');
      this.world.appendChild(this.groupLayer);
      this.world.appendChild(this.svg);
      this.el.appendChild(this.world);
      this.pan = { x: 40, y: 30 };
      this.scale = 1;
      this.nodes = new Map();
      this.edges = [];
      this.groups = [];
      this.hoverPort = null;
      this.viewRect = null;
      this.flowOffset = 0;
      this.activeDragStops = new Set();
      this.addCleanup(() => {
        this.activeDragStops.forEach((stop) => stop());
        this.activeDragStops.clear();
      });
      this.setGlow(this.options.glow);
      this.setFlowShape(this.options.flowShape, true);
      (this.options.groups || []).forEach((group) => this.addGroup(group, true));
      (this.options.nodes || []).forEach((node) => this.addNode(node, true));
      (this.options.edges || []).forEach((edge) => this.connect(edge.from, edge.to, true));
      this.applyTransform();
      this.bindPan();
      if (this.options.zoom) this.bindZoom();
      this.whenVisible(() => {});
      if (this.options.flow && !Utils.reducedMotion) {
        this.onFrame((time, delta) => {
          if (!this.visible) return;
          this.flowOffset = (this.flowOffset + delta * this.options.flowSpeed) % (FLOW_PERIODS[this.options.flowShape] || 20);
          this.svg.style.setProperty('--dx-flow-dash', -this.flowOffset + 'px');
        });
      }
    }

    setGlow(enabled) {
      this.options.glow = !!enabled;
      this.el.classList.toggle('dx-flow--glow', this.options.glow);
    }

    setFlowShape(shape, silent) {
      this.options.flowShape = FLOW_SHAPES[shape] ? shape : 'dash';
      this.svg.style.setProperty('--dx-flow-dasharray', FLOW_SHAPES[this.options.flowShape]);
      if (!silent) this.emitChange();
    }

    applyTransform() {
      this.world.style.transform = 'translate3d(' + this.pan.x + 'px,' + this.pan.y + 'px,0) scale(' + this.scale + ')';
    }

    trackDrag(pointerId, onMove, onEnd) {
      const move = (ev) => {
        if (pointerId !== undefined && ev.pointerId !== pointerId) return;
        onMove(ev);
      };
      const end = (ev) => {
        if (ev && pointerId !== undefined && ev.pointerId !== undefined && ev.pointerId !== pointerId) return;
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', end);
        removeEventListener('pointercancel', end);
        this.activeDragStops.delete(end);
        if (onEnd) onEnd(ev);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', end);
      addEventListener('pointercancel', end);
      this.activeDragStops.add(end);
    }

    bindPan() {
      this.listen(this.el, 'pointerdown', (event) => {
        if (event.target !== this.el && event.target !== this.world && event.target !== this.svg && event.target !== this.groupLayer) return;
        const startX = event.clientX - this.pan.x;
        const startY = event.clientY - this.pan.y;
        this.trackDrag(event.pointerId, (ev) => {
          this.pan.x = ev.clientX - startX;
          this.pan.y = ev.clientY - startY;
          this.applyTransform();
        });
      });
    }

    bindZoom() {
      this.listen(this.el, 'wheel', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const factor = event.deltaY > 0 ? 0.92 : 1.08;
        const previous = this.scale;
        this.scale = Utils.clamp(this.scale * factor, this.options.minZoom, this.options.maxZoom);
        const ratio = this.scale / previous;
        const rect = this.el.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        this.pan.x = cursorX - (cursorX - this.pan.x) * ratio;
        this.pan.y = cursorY - (cursorY - this.pan.y) * ratio;
        this.applyTransform();
      }, { passive: false });
    }

    addGroup(config, silent) {
      const group = {
        id: config.id || Utils.uid(),
        title: config.title || 'Grupo',
        x: config.x || 0,
        y: config.y || 0,
        width: config.width || 320,
        height: config.height || 220,
        color: config.color || 'primary'
      };
      const elGroup = Utils.el('div', 'dx-flow-group');
      elGroup.style.setProperty('--dx-group-color', 'var(--dx-' + group.color + ')');
      elGroup.style.width = group.width + 'px';
      elGroup.style.height = group.height + 'px';
      elGroup.innerHTML = '<div class="dx-flow-group-head">' + Utils.escape(group.title) + '</div>';
      group.el = elGroup;
      this.groupLayer.appendChild(elGroup);
      this.placeGroup(group);
      this.bindGroupDrag(group, elGroup.querySelector('.dx-flow-group-head'));
      this.groups.push(group);
      if (!silent) this.emitChange();
      return group;
    }

    placeGroup(group) {
      group.el.style.transform = 'translate3d(' + group.x + 'px,' + group.y + 'px,0)';
    }

    bindGroupDrag(group, handle) {
      handle.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const originX = group.x;
        const originY = group.y;
        const captured = [];
        this.nodes.forEach((node) => {
          const centerX = node.x + NODE_WIDTH / 2;
          const centerY = node.y + HEADER_HEIGHT;
          if (centerX >= group.x && centerX <= group.x + group.width && centerY >= group.y && centerY <= group.y + group.height) {
            captured.push({ node, originX: node.x, originY: node.y });
          }
        });
        group.el.classList.add('is-dragging');
        this.trackDrag(event.pointerId, (ev) => {
          const deltaX = (ev.clientX - startX) / this.scale;
          const deltaY = (ev.clientY - startY) / this.scale;
          group.x = originX + deltaX;
          group.y = originY + deltaY;
          this.placeGroup(group);
          captured.forEach((entry) => {
            entry.node.x = entry.originX + deltaX;
            entry.node.y = entry.originY + deltaY;
            this.placeNode(entry.node);
            this.updateEdgesFor(entry.node.id);
          });
        }, () => {
          group.el.classList.remove('is-dragging');
          this.emitChange();
        });
      });
    }

    addNode(config, silent) {
      const node = {
        id: config.id || Utils.uid(),
        title: config.title || 'Nodo',
        icon: config.icon || null,
        type: config.type || 'default',
        x: config.x || 0,
        y: config.y || 0,
        inputs: config.inputs || [],
        outputs: config.outputs || [],
        data: config.data || {}
      };
      const elNode = Utils.el('div', 'dx-flow-node');
      const iconSvg = node.icon && IconSet[node.icon]
        ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IconSet[node.icon] + '</svg>'
        : '';
      const removeButton = this.options.removable
        ? '<button type="button" class="dx-flow-node-remove" aria-label="Eliminar nodo">×</button>'
        : '';
      elNode.innerHTML =
        '<div class="dx-flow-node-head">' + iconSvg + '<span>' + Utils.escape(node.title) + '</span>' + removeButton + '</div>' +
        '<div class="dx-flow-node-body"></div>';
      const body = elNode.querySelector('.dx-flow-node-body');
      const rows = Math.max(node.inputs.length, node.outputs.length);
      for (let i = 0; i < rows; i++) {
        const row = Utils.el('div', 'dx-flow-row');
        row.appendChild(this.buildPort(node, 'in', i));
        row.appendChild(Utils.el('span', 'dx-flow-row-label', { text: node.inputs[i] || node.outputs[i] || '' }));
        row.appendChild(this.buildPort(node, 'out', i));
        body.appendChild(row);
      }
      elNode.style.width = (config.width || this.options.nodeWidth || NODE_WIDTH) + 'px';
      node.el = elNode;
      if (config.content || this.options.renderNode) {
        const slot = Utils.el('div', 'dx-flow-node-content');
        body.appendChild(slot);
        node.slot = slot;
        if (config.content) Component.applyContent(config.content, slot, this);
        if (this.options.renderNode) this.options.renderNode(node, slot, this);
      }
      this.world.appendChild(elNode);
      this.measureNode(node);
      this.placeNode(node);
      this.bindNodeDrag(node, elNode.querySelector('.dx-flow-node-head'));
      const remover = elNode.querySelector('.dx-flow-node-remove');
      if (remover) {
        remover.addEventListener('pointerdown', (event) => event.stopPropagation());
        remover.addEventListener('click', (event) => {
          event.stopPropagation();
          this.removeNode(node.id);
        });
      }
      this.nodes.set(node.id, node);
      if (!silent) this.emitChange();
      return node;
    }

    removeNode(nodeId) {
      const node = this.nodes.get(nodeId);
      if (!node) return;
      this.edges.slice().forEach((edge) => {
        if (edge.from.node === nodeId || edge.to.node === nodeId) {
          this.disconnect(edge, true);
          if (this.options.onDisconnect) this.options.onDisconnect(edge.from, edge.to, this);
        }
      });
      node.el.remove();
      this.nodes.delete(nodeId);
      if (this.options.onNodeRemove) this.options.onNodeRemove(nodeId, this);
      this.emitChange();
    }

    buildPort(node, kind, index) {
      const exists = kind === 'in' ? node.inputs[index] !== undefined : node.outputs[index] !== undefined;
      const port = Utils.el('span', 'dx-flow-port dx-flow-port--' + kind + (exists ? '' : ' is-empty'));
      if (!exists) return port;
      port.dataset.kind = kind;
      port.dataset.index = index;
      this.bindPort(port, node, kind, index);
      return port;
    }

    bindPort(port, node, kind, index) {
      port.__dxPort = { node, kind, index, el: port };
      port.addEventListener('pointerenter', () => {
        this.hoverPort = { node, kind, index, el: port };
        port.classList.add('is-hot');
      });
      port.addEventListener('pointerleave', () => {
        if (this.hoverPort && this.hoverPort.el === port) this.hoverPort = null;
        port.classList.remove('is-hot');
      });
      port.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (kind === 'out') {
          this.startWireDrag(node, index, event.pointerId);
          return;
        }
        const connected = this.edges.find((edge) => edge.to.node === node.id && edge.to.port === index);
        if (connected) {
          const source = this.nodes.get(connected.from.node);
          const sourcePort = connected.from.port;
          this.disconnect(connected, true);
          this.emitChange();
          if (this.options.onDisconnect) this.options.onDisconnect(connected.from, connected.to, this);
          if (source) this.startWireDrag(source, sourcePort, event.pointerId);
        }
      });
    }

    startWireDrag(fromNode, fromIndex, pointerId) {
      this.viewRect = this.el.getBoundingClientRect();
      this.svg.appendChild(this.ghostPath);
      this.trackDrag(pointerId, (ev) => {
        const worldX = (ev.clientX - this.viewRect.left - this.pan.x) / this.scale;
        const worldY = (ev.clientY - this.viewRect.top - this.pan.y) / this.scale;
        const from = this.portPoint(fromNode, 'out', fromIndex);
        this.ghostPath.setAttribute('d', this.wirePath(from.x, from.y, worldX, worldY));
      }, (ev) => {
        if (this.ghostPath.parentNode) this.svg.removeChild(this.ghostPath);
        this.ghostPath.removeAttribute('d');
        let target = this.hoverPort && this.hoverPort.kind === 'in' ? this.hoverPort : null;
        if (!target && ev && ev.clientX !== undefined) {
          const hit = document.elementFromPoint(ev.clientX, ev.clientY);
          const portEl = hit && hit.closest ? hit.closest('.dx-flow-port--in') : null;
          if (portEl && portEl.__dxPort) target = portEl.__dxPort;
        }
        if (target) {
          this.connect(
            { node: fromNode.id, port: fromIndex },
            { node: target.node.id, port: target.index }
          );
        }
      });
    }

    bindNodeDrag(node, handle) {
      handle.addEventListener('pointerdown', (event) => {
        if (event.target.classList.contains('dx-flow-node-remove')) return;
        event.stopPropagation();
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const originX = node.x;
        const originY = node.y;
        node.el.classList.add('is-dragging');
        this.trackDrag(event.pointerId, (ev) => {
          node.x = originX + (ev.clientX - startX) / this.scale;
          node.y = originY + (ev.clientY - startY) / this.scale;
          this.placeNode(node);
          this.updateEdgesFor(node.id);
        }, () => {
          node.el.classList.remove('is-dragging');
          this.emitChange();
        });
      });
    }

    placeNode(node) {
      node.el.style.transform = 'translate3d(' + node.x + 'px,' + node.y + 'px,0)';
    }

    measureNode(node) {
      const scale = this.scale || 1;
      const nodeRect = node.el.getBoundingClientRect();
      node.metrics = { width: nodeRect.width / scale, ports: { in: [], out: [] } };
      node.el.querySelectorAll('.dx-flow-port').forEach((port) => {
        const info = port.__dxPort;
        if (!info || port.classList.contains('is-empty')) return;
        const rect = port.getBoundingClientRect();
        node.metrics.ports[info.kind][info.index] = (rect.top + rect.height / 2 - nodeRect.top) / scale;
      });
    }

    portPoint(node, kind, index) {
      const metrics = node.metrics;
      if (metrics && metrics.ports[kind][index] !== undefined) {
        return {
          x: node.x + (kind === 'out' ? metrics.width : 0),
          y: node.y + metrics.ports[kind][index]
        };
      }
      return {
        x: node.x + (kind === 'out' ? NODE_WIDTH : 0),
        y: node.y + HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2
      };
    }

    wirePath(x1, y1, x2, y2) {
      const style = this.options.wireStyle;
      if (style === 'straight') {
        return 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2;
      }
      if (style === 'step') {
        const midX = (x1 + x2) / 2;
        return 'M' + x1 + ' ' + y1 + ' L' + midX + ' ' + y1 + ' L' + midX + ' ' + y2 + ' L' + x2 + ' ' + y2;
      }
      if (style === 'wavy') {
        const segments = 14;
        const amplitude = Math.min(14, Math.abs(x2 - x1) * 0.08 + 4);
        let path = 'M' + x1 + ' ' + y1;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t + Math.sin(t * Math.PI * 3) * amplitude * Math.sin(t * Math.PI);
          path += ' L' + px.toFixed(1) + ' ' + py.toFixed(1);
        }
        return path;
      }
      const bend = Math.max(Math.abs(x2 - x1) * 0.5, 40);
      return 'M' + x1 + ' ' + y1 + ' C' + (x1 + bend) + ' ' + y1 + ' ' + (x2 - bend) + ' ' + y2 + ' ' + x2 + ' ' + y2;
    }

    connect(from, to, silent) {
      const fromNode = this.nodes.get(from.node);
      const toNode = this.nodes.get(to.node);
      if (!fromNode || !toNode || fromNode === toNode) return null;
      const duplicated = this.edges.some((edge) =>
        edge.from.node === from.node && edge.from.port === from.port &&
        edge.to.node === to.node && edge.to.port === to.port
      );
      if (duplicated) return null;
      if (this.options.accepts && !this.options.accepts(fromNode, toNode, from, to)) return null;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'dx-flow-wire');
      const flowPath = document.createElementNS(SVG_NS, 'path');
      flowPath.setAttribute('class', 'dx-flow-wire dx-flow-wire--flow');
      this.svg.appendChild(path);
      if (this.options.flow) this.svg.appendChild(flowPath);
      const edge = { from: { node: from.node, port: from.port }, to: { node: to.node, port: to.port }, el: path, flowEl: flowPath };
      this.edges.push(edge);
      this.drawEdge(edge);
      path.addEventListener('dblclick', () => this.disconnect(edge));
      if (!silent) {
        if (this.options.onConnect) this.options.onConnect(edge.from, edge.to, this);
        this.emitChange();
      }
      return edge;
    }

    disconnect(edge, silent) {
      this.edges = this.edges.filter((existing) => existing !== edge);
      edge.el.remove();
      if (edge.flowEl) edge.flowEl.remove();
      if (!silent) {
        if (this.options.onDisconnect) this.options.onDisconnect(edge.from, edge.to, this);
        this.emitChange();
      }
    }

    drawEdge(edge) {
      const fromNode = this.nodes.get(edge.from.node);
      const toNode = this.nodes.get(edge.to.node);
      if (!fromNode || !toNode) return;
      const from = this.portPoint(fromNode, 'out', edge.from.port);
      const to = this.portPoint(toNode, 'in', edge.to.port);
      const d = this.wirePath(from.x, from.y, to.x, to.y);
      edge.el.setAttribute('d', d);
      if (edge.flowEl) edge.flowEl.setAttribute('d', d);
    }

    updateEdgesFor(nodeId) {
      for (let i = 0; i < this.edges.length; i++) {
        const edge = this.edges[i];
        if (edge.from.node === nodeId || edge.to.node === nodeId) this.drawEdge(edge);
      }
    }

    setWireStyle(style) {
      this.options.wireStyle = style;
      this.edges.forEach((edge) => this.drawEdge(edge));
    }

    serialize() {
      return {
        nodes: Array.from(this.nodes.values()).map((node) => ({
          id: node.id,
          title: node.title,
          type: node.type,
          icon: node.icon,
          x: Math.round(node.x),
          y: Math.round(node.y),
          inputs: node.inputs,
          outputs: node.outputs,
          data: node.data
        })),
        edges: this.edges.map((edge) => ({ from: edge.from, to: edge.to })),
        groups: this.groups.map((group) => ({
          id: group.id,
          title: group.title,
          x: Math.round(group.x),
          y: Math.round(group.y),
          width: group.width,
          height: group.height,
          color: group.color
        }))
      };
    }

    load(graph) {
      this.edges.slice().forEach((edge) => this.disconnect(edge, true));
      this.nodes.forEach((node) => node.el.remove());
      this.nodes.clear();
      this.groups.forEach((group) => group.el.remove());
      this.groups = [];
      (graph.groups || []).forEach((group) => this.addGroup(group, true));
      (graph.nodes || []).forEach((node) => this.addNode(node, true));
      (graph.edges || []).forEach((edge) => this.connect(edge.from, edge.to, true));
      this.emitChange();
    }

    emitChange() {
      if (this.options.onChange) this.options.onChange(this.serialize(), this);
    }
  }

  return FlowGraph;
});

;
Dixel.define('Checkbox', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const checkMarkup =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="dx-check-mark" d="M5 12.5l4.6 4.6L19 7.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  class Checkbox extends Component {
    static defaults = {
      label: 'Checkbox',
      checked: false,
      name: '',
      value: 'on',
      disabled: false,
      onChange: null
    };

    build() {
      const el = Utils.el('label', 'dx-check dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      this.input = Utils.el('input', 'dx-check-input', { type: 'checkbox' });
      if (this.options.name) this.input.name = this.options.name;
      this.input.value = this.options.value;
      this.input.checked = this.options.checked;
      this.input.disabled = this.options.disabled;
      this.box = Utils.el('span', 'dx-check-box', { html: checkMarkup, 'aria-hidden': 'true' });
      this.text = Utils.el('span', 'dx-check-text', { text: this.options.label });
      el.appendChild(this.input);
      el.appendChild(this.box);
      el.appendChild(this.text);
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-check', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.listen(this.input, 'change', this.handleChange);
    }

    handleChange() {
      if (this.input.checked && !Utils.reducedMotion) {
        Motion.fromTo(this.box, { scale: 0.75 }, { scale: 1, duration: 0.4, ease: 'outBack' });
      }
      if (this.options.onChange) this.options.onChange(this.input.checked, this);
    }

    get checked() {
      return this.input.checked;
    }

    set checked(next) {
      this.input.checked = next;
    }
  }

  return Checkbox;
});

;
Dixel.define('CheckboxGroup', ['Component', 'Utils', 'Checkbox'], function (Component, Utils, Checkbox) {
  'use strict';

  class CheckboxGroup extends Component {
    static defaults = {
      label: '',
      name: null,
      items: [],
      values: [],
      inline: false,
      disabled: false,
      onChange: null
    };

    build() {
      return Utils.el('fieldset', 'dx-checkgroup');
    }

    ready() {
      this.el.classList.add('dx-checkgroup');
      if (this.options.inline) this.el.classList.add('dx-checkgroup--inline');
      if (this.options.label) {
        this.el.appendChild(Utils.el('legend', 'dx-checkgroup-legend', { text: this.options.label }));
      }
      this.selected = new Set(this.options.values);
      this.boxes = this.options.items.map((item) => {
        const label = typeof item === 'string' ? item : item.label;
        const value = typeof item === 'string' ? item : item.value;
        const box = new Checkbox({
          label,
          checked: this.selected.has(value),
          disabled: this.options.disabled,
          onChange: (checked) => {
            if (checked) this.selected.add(value);
            else this.selected.delete(value);
            if (this.options.onChange) this.options.onChange(this.values(), this);
          }
        }).mount(this.el);
        if (this.options.name) {
          const input = box.el.querySelector('input');
          if (input) {
            input.name = this.options.name;
            input.value = value;
          }
        }
        this.addCleanup(() => box.destroy());
        return { box, value };
      });
    }

    values() {
      return this.options.items
        .map((item) => (typeof item === 'string' ? item : item.value))
        .filter((value) => this.selected.has(value));
    }

    setValues(values) {
      this.selected = new Set(values);
      this.boxes.forEach((entry) => {
        const input = entry.box.el.querySelector('input');
        if (input) input.checked = this.selected.has(entry.value);
      });
    }
  }

  return CheckboxGroup;
});

;
Dixel.define('Field', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Field extends Component {
    static defaults = {
      label: 'Label',
      name: '',
      value: '',
      helper: '',
      required: false,
      disabled: false,
      onInput: null,
      onChange: null
    };

    build() {
      const el = Utils.el('div', this.rootClassNames());
      this.populate(el);
      return el;
    }

    rootClassNames() {
      return 'dx-field dx-reset dx-motion';
    }

    populate(el) {
      this.controlId = Utils.uid();
      this.shell = Utils.el('div', 'dx-field-shell');
      this.control = this.buildControl();
      this.control.id = this.controlId;
      if (this.options.name) this.control.name = this.options.name;
      if (this.options.required) this.control.required = true;
      if (this.options.disabled) this.control.disabled = true;
      this.labelEl = Utils.el('label', 'dx-field-label', {
        for: this.controlId,
        text: this.options.label
      });
      this.message = Utils.el('p', 'dx-field-msg', { text: this.options.helper || '' });
      this.shell.appendChild(this.control);
      this.shell.appendChild(this.labelEl);
      el.appendChild(this.shell);
      this.decorate(el);
      el.appendChild(this.message);
    }

    buildControl() {
      const input = Utils.el('input', 'dx-field-input', { type: 'text' });
      input.value = this.options.value || '';
      return input;
    }

    decorate() {}

    ready() {
      if (!this.shell) {
        this.el.className += ' ' + this.rootClassNames();
        this.populate(this.el);
      }
      this.bindControl();
      this.refresh();
    }

    bindControl() {
      this.listen(this.control, 'input', this.handleInput);
      this.listen(this.control, 'change', this.handleChange);
    }

    handleInput() {
      this.refresh();
      if (this.options.onInput) this.options.onInput(this.value, this);
    }

    handleChange() {
      if (this.options.onChange) this.options.onChange(this.value, this);
    }

    refresh() {
      this.el.classList.toggle('is-filled', this.isFilled());
    }

    isFilled() {
      const current = this.value;
      return current !== null && current !== undefined && String(current).length > 0;
    }

    get value() {
      return this.control.value;
    }

    set value(next) {
      this.control.value = next;
      this.refresh();
    }

    setError(text) {
      this.el.classList.remove('is-success');
      this.el.classList.add('is-error');
      this.message.textContent = text || '';
      this.shake();
    }

    setSuccess(text) {
      this.el.classList.remove('is-error');
      this.el.classList.add('is-success');
      this.message.textContent = text || this.options.helper || '';
    }

    clearStatus() {
      this.el.classList.remove('is-error', 'is-success');
      this.message.textContent = this.options.helper || '';
    }

    shake() {
      if (Utils.reducedMotion) return;
      this.shell.classList.remove('dx-shake');
      void this.shell.offsetWidth;
      this.shell.classList.add('dx-shake');
    }
  }

  return Field;
});

;
Dixel.define('FileDrop', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const uploadIcon =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';

  class FileDrop extends Component {
    static defaults = {
      label: 'Drop files here',
      hint: 'or click to browse',
      accept: '',
      multiple: true,
      name: '',
      onFiles: null
    };

    build() {
      const el = Utils.el('div', 'dx-drop dx-reset dx-motion', {
        tabindex: '0',
        role: 'button',
        'aria-label': this.options.label
      });
      this.populate(el);
      return el;
    }

    populate(el) {
      el.appendChild(Utils.el('span', 'dx-drop-icon', { html: uploadIcon, 'aria-hidden': 'true' }));
      el.appendChild(Utils.el('span', 'dx-drop-title', { text: this.options.label }));
      el.appendChild(Utils.el('span', 'dx-drop-hint', { text: this.options.hint }));
      this.filesEl = Utils.el('span', 'dx-drop-files');
      el.appendChild(this.filesEl);
      this.input = Utils.el('input', 'dx-drop-input', { type: 'file' });
      if (this.options.accept) this.input.accept = this.options.accept;
      if (this.options.multiple) this.input.multiple = true;
      if (this.options.name) this.input.name = this.options.name;
      el.appendChild(this.input);
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-drop', 'dx-reset', 'dx-motion');
        this.el.setAttribute('tabindex', '0');
        this.el.setAttribute('role', 'button');
        this.el.setAttribute('aria-label', this.options.label);
        this.populate(this.el);
      }
      this.dragDepth = 0;
      this.listen(this.el, 'click', this.openPicker);
      this.listen(this.el, 'keydown', this.handleKeyDown);
      this.listen(this.el, 'dragenter', this.handleDragEnter);
      this.listen(this.el, 'dragover', this.handleDragOver);
      this.listen(this.el, 'dragleave', this.handleDragLeave);
      this.listen(this.el, 'drop', this.handleDrop);
      this.listen(this.input, 'change', this.handlePicked);
    }

    openPicker(event) {
      if (event.target === this.input) return;
      this.input.click();
    }

    handleKeyDown(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.input.click();
      }
    }

    handleDragEnter(event) {
      event.preventDefault();
      this.dragDepth++;
      this.el.classList.add('is-over');
    }

    handleDragOver(event) {
      event.preventDefault();
    }

    handleDragLeave() {
      this.dragDepth = Math.max(this.dragDepth - 1, 0);
      if (!this.dragDepth) this.el.classList.remove('is-over');
    }

    handleDrop(event) {
      event.preventDefault();
      this.dragDepth = 0;
      this.el.classList.remove('is-over');
      this.acceptFiles(event.dataTransfer.files);
    }

    handlePicked() {
      this.acceptFiles(this.input.files);
      this.input.value = '';
    }

    acceptFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      this.filesEl.textContent = files.map((file) => file.name).join(', ');
      this.el.classList.add('is-loaded');
      if (!Utils.reducedMotion) {
        Motion.fromTo(this.filesEl, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'out' });
      }
      if (this.options.onFiles) this.options.onFiles(files, this);
    }
  }

  return FileDrop;
});

;
Dixel.define('NumberStepper', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const minusIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  const plusIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  class NumberStepper extends Component {
    static defaults = {
      label: '',
      value: 0,
      min: null,
      max: null,
      step: 1,
      name: '',
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-stepper dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-stepper-label', { text: this.options.label }));
      }
      const body = Utils.el('div', 'dx-stepper-body');
      this.minus = Utils.el('button', 'dx-stepper-btn dx-focusable', {
        type: 'button',
        'aria-label': 'Decrease',
        html: minusIcon
      });
      this.input = Utils.el('input', 'dx-stepper-value', { type: 'text', inputmode: 'decimal' });
      if (this.options.name) this.input.name = this.options.name;
      if (this.options.label) this.input.setAttribute('aria-label', this.options.label);
      this.plus = Utils.el('button', 'dx-stepper-btn dx-focusable', {
        type: 'button',
        'aria-label': 'Increase',
        html: plusIcon
      });
      body.appendChild(this.minus);
      body.appendChild(this.input);
      body.appendChild(this.plus);
      el.appendChild(body);
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-stepper', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.currentValue = this.clampValue(this.options.value);
      this.sync();
      this.listen(this.minus, 'click', () => this.step(-1));
      this.listen(this.plus, 'click', () => this.step(1));
      this.listen(this.input, 'change', this.commitTyped);
      this.listen(this.input, 'keydown', this.handleKeyDown);
    }

    handleKeyDown(event) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.step(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.step(-1);
      }
    }

    clampValue(raw) {
      let next = Number(raw);
      if (!Number.isFinite(next)) next = 0;
      if (this.options.min !== null) next = Math.max(next, this.options.min);
      if (this.options.max !== null) next = Math.min(next, this.options.max);
      const decimals = (String(this.options.step).split('.')[1] || '').length;
      return Number(next.toFixed(decimals));
    }

    step(direction) {
      const next = this.clampValue(this.currentValue + direction * this.options.step);
      if (next === this.currentValue) return;
      this.currentValue = next;
      this.sync();
      if (!Utils.reducedMotion) {
        Motion.fromTo(
          this.input,
          { y: direction > 0 ? 10 : -10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.3, ease: 'out' }
        );
      }
      if (this.options.onChange) this.options.onChange(this.currentValue, this);
    }

    commitTyped() {
      const next = this.clampValue(this.input.value);
      const changed = next !== this.currentValue;
      this.currentValue = next;
      this.sync();
      if (changed && this.options.onChange) this.options.onChange(this.currentValue, this);
    }

    sync() {
      this.input.value = this.currentValue;
      this.minus.disabled = this.options.min !== null && this.currentValue <= this.options.min;
      this.plus.disabled = this.options.max !== null && this.currentValue >= this.options.max;
    }

    get value() {
      return this.currentValue;
    }

    set value(next) {
      this.currentValue = this.clampValue(next);
      this.sync();
    }
  }

  return NumberStepper;
});

;
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

;
Dixel.define('PinInput', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  class PinInput extends Component {
    static defaults = {
      label: '',
      length: 4,
      numeric: true,
      name: '',
      onChange: null,
      onComplete: null
    };

    build() {
      const el = Utils.el('div', 'dx-pin dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-pin-label', { text: this.options.label }));
      }
      const row = Utils.el('div', 'dx-pin-row');
      this.cells = [];
      for (let i = 0; i < this.options.length; i++) {
        const cell = Utils.el('input', 'dx-pin-cell', {
          type: 'text',
          maxlength: '1',
          autocomplete: i === 0 ? 'one-time-code' : 'off',
          'aria-label': (this.options.label || 'Code') + ' ' + (i + 1)
        });
        if (this.options.numeric) cell.setAttribute('inputmode', 'numeric');
        row.appendChild(cell);
        this.cells.push(cell);
      }
      if (this.options.name) {
        this.hidden = Utils.el('input', '', { type: 'hidden' });
        this.hidden.name = this.options.name;
        row.appendChild(this.hidden);
      }
      el.appendChild(row);
    }

    ready() {
      if (!this.cells) {
        this.el.classList.add('dx-pin', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.cells.forEach((cell, index) => {
        this.listen(cell, 'input', () => this.handleInput(index));
        this.listen(cell, 'keydown', (event) => this.handleKeyDown(event, index));
        this.listen(cell, 'focus', () => cell.select());
        this.listen(cell, 'paste', (event) => this.handlePaste(event, index));
      });
    }

    sanitize(text) {
      return this.options.numeric ? text.replace(/\D/g, '') : text.trim();
    }

    handleInput(index) {
      const cell = this.cells[index];
      const clean = this.sanitize(cell.value);
      cell.value = clean.slice(-1);
      if (!cell.value) {
        this.emitChange();
        return;
      }
      if (!Utils.reducedMotion) {
        Motion.fromTo(cell, { y: -9, scale: 1.08 }, { y: 0, scale: 1, duration: 0.4, ease: 'outBack' });
      }
      if (index < this.cells.length - 1) this.cells[index + 1].focus();
      this.emitChange();
    }

    handleKeyDown(event, index) {
      if (event.key === 'Backspace' && !this.cells[index].value && index > 0) {
        event.preventDefault();
        this.cells[index - 1].value = '';
        this.cells[index - 1].focus();
        this.emitChange();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        this.cells[index - 1].focus();
      } else if (event.key === 'ArrowRight' && index < this.cells.length - 1) {
        event.preventDefault();
        this.cells[index + 1].focus();
      }
    }

    handlePaste(event, index) {
      event.preventDefault();
      const text = this.sanitize(event.clipboardData.getData('text'));
      if (!text) return;
      let cursor = index;
      for (const char of text) {
        if (cursor >= this.cells.length) break;
        this.cells[cursor].value = char;
        cursor++;
      }
      this.cells[Math.min(cursor, this.cells.length - 1)].focus();
      this.emitChange();
    }

    emitChange(silent) {
      const current = this.value;
      if (this.hidden) this.hidden.value = current;
      if (silent) return;
      if (this.options.onChange) this.options.onChange(current, this);
      if (current.length === this.cells.length) {
        if (!Utils.reducedMotion) {
          Motion.fromTo(
            this.cells,
            { y: -8 },
            { y: 0, duration: 0.45, ease: 'outBack', stagger: 0.05 }
          );
        }
        if (this.options.onComplete) this.options.onComplete(current, this);
      }
    }

    get value() {
      return this.cells.map((cell) => cell.value).join('');
    }

    set value(next) {
      const clean = this.sanitize(String(next));
      this.cells.forEach((cell, index) => {
        cell.value = clean[index] || '';
      });
      this.emitChange(true);
    }
  }

  return PinInput;
});

;
Dixel.define('RadioGroup', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  function normalize(items) {
    return items.map((item) =>
      typeof item === 'object' ? item : { value: String(item), label: String(item) }
    );
  }

  class RadioGroup extends Component {
    static defaults = {
      label: '',
      name: '',
      items: [],
      value: null,
      inline: false,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-radios dx-reset dx-motion', { role: 'radiogroup' });
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.inline) el.classList.add('dx-radios--inline');
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-radios-label', { text: this.options.label }));
        el.setAttribute('aria-label', this.options.label);
      }
      const groupName = this.options.name || Utils.uid();
      this.items = normalize(this.options.items);
      this.inputs = [];
      this.dots = [];
      this.items.forEach((item) => {
        const radio = Utils.el('label', 'dx-radio');
        const input = Utils.el('input', 'dx-radio-input', { type: 'radio' });
        input.name = groupName;
        input.value = item.value;
        input.checked = item.value === this.options.value;
        const dot = Utils.el('span', 'dx-radio-dot', { 'aria-hidden': 'true' });
        radio.appendChild(input);
        radio.appendChild(dot);
        radio.appendChild(Utils.el('span', 'dx-radio-text', { text: item.label }));
        el.appendChild(radio);
        this.inputs.push(input);
        this.dots.push(dot);
      });
    }

    ready() {
      if (!this.inputs) {
        this.el.classList.add('dx-radios', 'dx-reset', 'dx-motion');
        this.el.setAttribute('role', 'radiogroup');
        this.populate(this.el);
      }
      this.listen(this.el, 'change', this.handleChange);
    }

    handleChange(event) {
      const index = this.inputs.indexOf(event.target);
      if (index < 0) return;
      if (!Utils.reducedMotion) {
        Motion.fromTo(this.dots[index], { scale: 0.7 }, { scale: 1, duration: 0.4, ease: 'outBack' });
      }
      if (this.options.onChange) this.options.onChange(this.items[index].value, this);
    }

    get value() {
      const checked = this.inputs.find((input) => input.checked);
      return checked ? checked.value : null;
    }

    set value(next) {
      this.inputs.forEach((input) => {
        input.checked = input.value === next;
      });
    }
  }

  return RadioGroup;
});

;
Dixel.define('RangeSlider', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  class RangeSlider extends Component {
    static defaults = {
      label: '',
      min: 0,
      max: 100,
      step: 1,
      value: 50,
      unit: '',
      onInput: null,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-slider dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        const head = Utils.el('div', 'dx-slider-head');
        head.appendChild(Utils.el('span', 'dx-slider-label', { text: this.options.label }));
        this.readout = Utils.el('span', 'dx-slider-readout');
        head.appendChild(this.readout);
        el.appendChild(head);
      }
      this.track = Utils.el('div', 'dx-slider-track');
      this.fill = Utils.el('span', 'dx-slider-fill', { 'aria-hidden': 'true' });
      this.thumb = Utils.el('span', 'dx-slider-thumb', { 'aria-hidden': 'true' });
      this.tip = Utils.el('span', 'dx-slider-tip');
      this.thumb.appendChild(this.tip);
      this.input = Utils.el('input', 'dx-slider-input', { type: 'range' });
      this.input.min = this.options.min;
      this.input.max = this.options.max;
      this.input.step = this.options.step;
      this.input.value = this.options.value;
      if (this.options.label) this.input.setAttribute('aria-label', this.options.label);
      this.track.appendChild(this.fill);
      this.track.appendChild(this.thumb);
      this.track.appendChild(this.input);
      el.appendChild(this.track);
    }

    ready() {
      if (!this.track) {
        this.el.classList.add('dx-slider', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.trackWidth = 0;
      this.thumbWidth = 0;
      this.listen(this.input, 'input', this.handleInput);
      this.listen(this.input, 'change', this.handleChange);
      this.listen(this.input, 'pointerdown', this.activate);
      this.listen(this.input, 'focus', this.activate);
      this.listen(this.input, 'pointerup', this.deactivate);
      this.listen(this.input, 'pointercancel', this.deactivate);
      this.listen(this.input, 'blur', this.deactivate);
      this.listen(window, 'resize', this.remeasure);
      this.whenVisible((isVisible) => {
        if (isVisible) this.remeasure();
      });
      this.remeasure();
    }

    activate() {
      this.el.classList.add('is-active');
    }

    deactivate() {
      this.el.classList.remove('is-active');
    }

    remeasure() {
      this.trackWidth = this.track.clientWidth;
      this.thumbWidth = this.thumb.offsetWidth;
      this.paint();
    }

    handleInput() {
      this.paint();
      if (this.options.onInput) this.options.onInput(this.value, this);
    }

    handleChange() {
      if (this.options.onChange) this.options.onChange(this.value, this);
    }

    paint() {
      const span = this.options.max - this.options.min || 1;
      const ratio = (this.value - this.options.min) / span;
      Motion.set(this.fill, { scaleX: ratio });
      Motion.set(this.thumb, { x: ratio * Math.max(this.trackWidth - this.thumbWidth, 0) });
      const text = this.value + this.options.unit;
      this.tip.textContent = text;
      if (this.readout) this.readout.textContent = text;
    }

    get value() {
      return Number(this.input.value);
    }

    set value(next) {
      this.input.value = next;
      this.paint();
    }
  }

  return RangeSlider;
});

;
Dixel.define('RatingStars', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const starIcon =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

  class RatingStars extends Component {
    static defaults = {
      label: 'Rating',
      count: 5,
      value: 0,
      allowClear: true,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-rating dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-rating-label', { text: this.options.label }));
      }
      this.row = Utils.el('div', 'dx-rating-stars', {
        role: 'radiogroup',
        'aria-label': this.options.label || 'Rating'
      });
      this.stars = [];
      for (let i = 0; i < this.options.count; i++) {
        const star = Utils.el('button', 'dx-rating-star', {
          type: 'button',
          role: 'radio',
          'aria-checked': 'false',
          'aria-label': i + 1 + ' of ' + this.options.count,
          html: starIcon
        });
        this.row.appendChild(star);
        this.stars.push(star);
      }
      el.appendChild(this.row);
    }

    ready() {
      if (!this.stars) {
        this.el.classList.add('dx-rating', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.current = Utils.clamp(this.options.value, 0, this.stars.length);
      this.paint();
      this.listen(this.row, 'click', this.handleClick);
      this.listen(this.row, 'keydown', this.handleKeyDown);
      if (!Utils.isTouch) {
        this.listen(this.row, 'pointerover', this.handlePreview);
        this.listen(this.row, 'pointerleave', this.clearPreview);
      }
    }

    handleClick(event) {
      const star = event.target.closest('.dx-rating-star');
      if (!star) return;
      const rating = this.stars.indexOf(star) + 1;
      this.setValue(rating === this.current && this.options.allowClear ? 0 : rating);
    }

    handleKeyDown(event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.setValue(Math.min(this.current + 1, this.stars.length));
        this.stars[this.current - 1].focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.setValue(Math.max(this.current - 1, 0));
        if (this.current > 0) this.stars[this.current - 1].focus();
      }
    }

    handlePreview(event) {
      const star = event.target.closest('.dx-rating-star');
      if (!star) return;
      const until = this.stars.indexOf(star);
      this.stars.forEach((each, index) => {
        each.classList.toggle('is-hot', index <= until);
      });
    }

    clearPreview() {
      this.stars.forEach((star) => star.classList.remove('is-hot'));
    }

    setValue(rating) {
      if (rating === this.current) return;
      const grew = rating > this.current;
      this.current = rating;
      this.paint();
      if (grew && !Utils.reducedMotion) {
        Motion.fromTo(
          this.stars.slice(0, rating),
          { scale: 0.6 },
          { scale: 1, duration: 0.4, ease: 'outBack', stagger: 0.04 }
        );
      }
      if (this.options.onChange) this.options.onChange(rating, this);
    }

    paint() {
      this.stars.forEach((star, index) => {
        star.classList.toggle('is-filled', index < this.current);
        star.setAttribute('aria-checked', String(index + 1 === this.current));
      });
    }

    get value() {
      return this.current;
    }

    set value(next) {
      this.setValue(Utils.clamp(next, 0, this.stars.length));
    }
  }

  return RatingStars;
});

;
Dixel.define('SearchField', ['TextField', 'Utils'], function (TextField, Utils) {
  'use strict';

  const searchIcon =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';
  const clearIcon =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  class SearchField extends TextField {
    static defaults = Object.assign({}, TextField.defaults, {
      label: 'Search',
      type: 'search',
      shortcut: '/'
    });

    rootClassNames() {
      return super.rootClassNames() + ' dx-field--search';
    }

    decorate() {
      this.shell.insertBefore(
        Utils.el('span', 'dx-field-lead', { html: searchIcon, 'aria-hidden': 'true' }),
        this.control
      );
      this.clear = Utils.el('button', 'dx-field-affix dx-field-clear', {
        type: 'button',
        'aria-label': 'Clear search',
        tabindex: '-1',
        html: clearIcon
      });
      this.shell.appendChild(this.clear);
      if (this.options.shortcut) {
        this.kbd = Utils.el('kbd', 'dx-field-kbd', {
          text: this.options.shortcut,
          'aria-hidden': 'true'
        });
        this.shell.appendChild(this.kbd);
      }
    }

    ready() {
      super.ready();
      this.listen(this.clear, 'click', this.clearValue);
      if (this.options.shortcut) this.listen(document, 'keydown', this.handleShortcut);
    }

    clearValue() {
      this.value = '';
      this.control.focus();
      this.control.dispatchEvent(new Event('input', { bubbles: true }));
    }

    handleShortcut(event) {
      if (event.key !== this.options.shortcut || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target === this.control) return;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      this.control.focus();
    }
  }

  return SearchField;
});

;
Dixel.define('SelectField', ['Field', 'Motion', 'Utils'], function (Field, Motion, Utils) {
  'use strict';

  const chevronIcon =
    '<svg class="dx-select-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function normalize(items) {
    return items.map((item) =>
      typeof item === 'object' ? item : { value: String(item), label: String(item) }
    );
  }

  class SelectField extends Field {
    static defaults = Object.assign({}, Field.defaults, {
      label: 'Select',
      items: [],
      value: null
    });

    rootClassNames() {
      return super.rootClassNames() + ' dx-field--select';
    }

    buildControl() {
      const trigger = Utils.el('button', 'dx-field-input dx-select-trigger', {
        type: 'button',
        role: 'combobox',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false'
      });
      this.valueEl = Utils.el('span', 'dx-select-value');
      trigger.appendChild(this.valueEl);
      trigger.insertAdjacentHTML('beforeend', chevronIcon);
      return trigger;
    }

    decorate() {
      this.items = normalize(this.options.items);
      this.hidden = Utils.el('input', '', { type: 'hidden' });
      if (this.options.name) this.hidden.name = this.options.name;
      this.panel = Utils.el('div', 'dx-select-panel dx-scroll-thin', { role: 'listbox', id: Utils.uid() });
      this.control.setAttribute('aria-controls', this.panel.id);
      this.optionEls = this.items.map((item) => {
        const optionEl = Utils.el('div', 'dx-select-option', {
          role: 'option',
          id: Utils.uid(),
          text: item.label,
          'aria-selected': 'false'
        });
        this.panel.appendChild(optionEl);
        return optionEl;
      });
      this.shell.appendChild(this.panel);
      this.shell.appendChild(this.hidden);
    }

    ready() {
      super.ready();
      this.openState = false;
      this.activeIndex = -1;
      this.selectedIndex = -1;
      this.globalCleanups = [];
      Motion.set(this.panel, { y: -8, scale: 0.98, opacity: 0 });
      this.listen(this.control, 'click', this.togglePanel);
      this.listen(this.control, 'keydown', this.handleKeyDown);
      this.listen(this.panel, 'click', this.handlePanelClick);
      this.listen(this.panel, 'pointermove', this.handlePanelHover);
      this.listen(document, 'pointerdown', this.handleOutside);
      this.addCleanup(() => {
        this.releaseGlobal();
        if (this.panel && this.panel.parentNode === document.body) this.panel.remove();
      });
      if (this.options.value !== null) {
        const initial = this.items.findIndex((item) => item.value === this.options.value);
        if (initial >= 0) this.choose(initial, true);
      }
    }

    isFilled() {
      return this.selectedIndex >= 0;
    }

    get value() {
      return this.selectedIndex >= 0 ? this.items[this.selectedIndex].value : null;
    }

    set value(next) {
      const index = this.items.findIndex((item) => item.value === next);
      if (index >= 0) this.choose(index, true);
    }

    togglePanel() {
      if (this.openState) this.closePanel();
      else this.openPanel();
    }

    openPanel() {
      if (this.openState) return;
      this.openState = true;
      this.el.classList.add('is-open');
      this.panel.classList.add('is-open');
      this.control.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.panel);
      this.place();
      this.highlight(this.selectedIndex >= 0 ? this.selectedIndex : 0);
      Motion.to(this.panel, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'outBack' });
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.place(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.place(), { passive: true }));
    }

    closePanel() {
      if (!this.openState) return;
      this.openState = false;
      this.el.classList.remove('is-open');
      this.control.setAttribute('aria-expanded', 'false');
      this.control.removeAttribute('aria-activedescendant');
      this.releaseGlobal();
      Motion.to(this.panel, {
        y: -8,
        scale: 0.98,
        opacity: 0,
        duration: 0.22,
        ease: 'out',
        onComplete: () => {
          if (!this.openState) this.retractPanel();
        }
      });
    }

    retractPanel() {
      if (!this.shell || !this.panel) return;
      this.panel.classList.remove('is-open', 'is-up');
      this.panel.style.left = '';
      this.panel.style.top = '';
      this.panel.style.width = '';
      this.shell.appendChild(this.panel);
    }

    place() {
      if (!this.openState) return;
      const rect = this.control.getBoundingClientRect();
      this.panel.style.width = Math.round(rect.width) + 'px';
      const panelHeight = this.panel.offsetHeight;
      const spaceBelow = innerHeight - rect.bottom;
      const openUp = spaceBelow < panelHeight + 12 && rect.top > spaceBelow;
      this.panel.classList.toggle('is-up', openUp);
      const left = Utils.clamp(rect.left, 8, Math.max(8, innerWidth - rect.width - 8));
      const top = openUp ? rect.top - panelHeight - 6 : rect.bottom + 6;
      this.panel.style.left = Math.round(left) + 'px';
      this.panel.style.top = Math.round(top) + 'px';
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }

    handleOutside(event) {
      if (this.openState && !this.el.contains(event.target) && !this.panel.contains(event.target)) this.closePanel();
    }

    handlePanelClick(event) {
      const optionEl = event.target.closest('.dx-select-option');
      if (optionEl) this.choose(this.optionEls.indexOf(optionEl));
    }

    handlePanelHover(event) {
      const optionEl = event.target.closest('.dx-select-option');
      if (optionEl) this.highlight(this.optionEls.indexOf(optionEl));
    }

    handleKeyDown(event) {
      if (!this.openState) {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          this.openPanel();
        }
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.highlight(Utils.clamp(this.activeIndex + step, 0, this.items.length - 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.highlight(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        this.highlight(this.items.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.choose(this.activeIndex);
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        this.closePanel();
      }
    }

    highlight(index) {
      if (index < 0 || index >= this.optionEls.length) return;
      if (this.activeIndex >= 0) this.optionEls[this.activeIndex].classList.remove('is-active');
      this.activeIndex = index;
      const optionEl = this.optionEls[index];
      optionEl.classList.add('is-active');
      this.control.setAttribute('aria-activedescendant', optionEl.id);
      optionEl.scrollIntoView({ block: 'nearest' });
    }

    choose(index, silent) {
      if (index < 0 || index >= this.items.length) return;
      if (this.selectedIndex >= 0) {
        this.optionEls[this.selectedIndex].classList.remove('is-selected');
        this.optionEls[this.selectedIndex].setAttribute('aria-selected', 'false');
      }
      this.selectedIndex = index;
      const item = this.items[index];
      this.optionEls[index].classList.add('is-selected');
      this.optionEls[index].setAttribute('aria-selected', 'true');
      this.valueEl.textContent = item.label;
      this.hidden.value = item.value;
      this.refresh();
      this.closePanel();
      if (!silent && this.options.onChange) this.options.onChange(item.value, this);
    }
  }

  return SelectField;
});

;
Dixel.define('Switch', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';


  class Switch extends Component {
    static defaults = {
      label: '',
      checked: false,
      name: '',
      disabled: false,
      elastic: true,
      onChange: null
    };

    thumbEase() {
      return this.options.elastic ? { duration: 0.55, ease: 'outElastic' } : { duration: 0.22, ease: 'out' };
    }

    build() {
      const el = Utils.el('label', 'dx-switch dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      this.input = Utils.el('input', 'dx-switch-input', { type: 'checkbox', role: 'switch' });
      if (this.options.name) this.input.name = this.options.name;
      this.input.checked = this.options.checked;
      this.input.disabled = this.options.disabled;
      this.track = Utils.el('span', 'dx-switch-track', { 'aria-hidden': 'true' });
      this.thumb = Utils.el('span', 'dx-switch-thumb');
      this.thumb.appendChild(Utils.el('span', 'dx-switch-core'));
      this.track.appendChild(this.thumb);
      el.appendChild(this.input);
      el.appendChild(this.track);
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-switch-text', { text: this.options.label }));
      }
    }

    travel() {
      if (this.travelPx === undefined) {
        const trackWidth = this.track.offsetWidth;
        const thumbWidth = this.thumb.offsetWidth;
        this.travelPx = trackWidth && thumbWidth ? trackWidth - thumbWidth - 4 : 20;
      }
      return this.travelPx;
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-switch', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      Motion.set(this.thumb, { x: this.input.checked ? this.travel() : 0 });
      this.listen(this.input, 'change', this.handleChange);
    }

    handleChange() {
      Motion.to(this.thumb, Object.assign({ x: this.input.checked ? this.travel() : 0 }, this.thumbEase()));
      if (this.options.onChange) this.options.onChange(this.input.checked, this);
    }

    get checked() {
      return this.input.checked;
    }

    set checked(next) {
      this.input.checked = next;
      Motion.to(this.thumb, Object.assign({ x: next ? this.travel() : 0 }, this.thumbEase()));
    }
  }

  return Switch;
});

;
Dixel.define('TagInput', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const closeIcon =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  class TagInput extends Component {
    static defaults = {
      label: 'Tags',
      tags: [],
      max: null,
      name: '',
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-field dx-field--tags dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      const inputId = Utils.uid();
      this.tags = [];
      this.shell = Utils.el('div', 'dx-field-shell dx-tags-shell');
      this.input = Utils.el('input', 'dx-tags-input', { type: 'text', id: inputId });
      this.labelEl = Utils.el('label', 'dx-field-label', {
        for: inputId,
        text: this.options.label
      });
      this.shell.appendChild(this.input);
      this.shell.appendChild(this.labelEl);
      el.appendChild(this.shell);
      if (this.options.name) {
        this.hidden = Utils.el('input', '', { type: 'hidden' });
        this.hidden.name = this.options.name;
        el.appendChild(this.hidden);
      }
    }

    ready() {
      if (!this.shell) {
        this.el.classList.add('dx-field', 'dx-field--tags', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.options.tags.forEach((tag) => this.addTag(tag, false, true));
      this.listen(this.input, 'keydown', this.handleKeyDown);
      this.listen(this.input, 'input', this.refresh);
      this.listen(this.shell, 'click', this.handleShellClick);
      this.refresh();
    }

    handleShellClick(event) {
      const chipButton = event.target.closest('.dx-chip-x');
      if (chipButton) {
        this.removeTag(chipButton.closest('.dx-chip'));
        return;
      }
      this.input.focus();
    }

    handleKeyDown(event) {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        this.addTag(this.input.value, true);
        this.input.value = '';
        this.refresh();
      } else if (event.key === 'Backspace' && !this.input.value && this.tags.length) {
        this.removeTag(this.shell.querySelectorAll('.dx-chip')[this.tags.length - 1]);
      }
    }

    addTag(raw, animate, silent) {
      const text = String(raw || '').trim();
      if (!text || this.tags.includes(text)) return;
      if (this.options.max && this.tags.length >= this.options.max) return;
      const chip = Utils.el('span', 'dx-chip');
      chip.appendChild(Utils.el('span', 'dx-chip-text', { text }));
      chip.appendChild(
        Utils.el('button', 'dx-chip-x', {
          type: 'button',
          'aria-label': 'Remove ' + text,
          html: closeIcon
        })
      );
      this.shell.insertBefore(chip, this.input);
      this.tags.push(text);
      if (animate && !Utils.reducedMotion) {
        Motion.fromTo(chip, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'outBack' });
      }
      this.emitChange(silent);
    }

    removeTag(chip) {
      if (!chip) return;
      const text = chip.querySelector('.dx-chip-text').textContent;
      this.tags = this.tags.filter((tag) => tag !== text);
      Motion.to(chip, {
        scale: 0.5,
        opacity: 0,
        duration: 0.18,
        ease: 'out',
        onComplete: () => chip.remove()
      });
      this.emitChange();
    }

    emitChange(silent) {
      if (this.hidden) this.hidden.value = this.tags.join(',');
      this.refresh();
      if (!silent && this.options.onChange) this.options.onChange(this.tags.slice(), this);
    }

    refresh() {
      this.el.classList.toggle('is-filled', this.tags.length > 0 || this.input.value.length > 0);
    }

    get value() {
      return this.tags.slice();
    }
  }

  return TagInput;
});

;
Dixel.define('TextArea', ['Field', 'Utils'], function (Field, Utils) {
  'use strict';

  class TextArea extends Field {
    static defaults = Object.assign({}, Field.defaults, {
      label: 'Message',
      rows: 3,
      maxRows: null,
      wrap: true
    });

    rootClassNames() {
      return super.rootClassNames() + ' dx-field--area';
    }

    buildControl() {
      const area = Utils.el('textarea', 'dx-field-input dx-scroll-thin');
      area.rows = this.options.rows;
      area.value = this.options.value || '';
      if (this.options.wrap === false) {
        area.wrap = 'off';
        area.classList.add('dx-field-input--nowrap');
      }
      return area;
    }

    ready() {
      super.ready();
      this.maxHeight = 0;
      this.computeMaxHeight();
      this.listen(this.control, 'input', this.autosize);
      this.listen(window, 'resize', () => {
        this.computeMaxHeight();
        this.autosize();
      });
      this.whenVisible((isVisible) => {
        if (!isVisible) return;
        this.computeMaxHeight();
        this.autosize();
      });
    }

    computeMaxHeight() {
      if (!this.options.maxRows) {
        this.maxHeight = 0;
        return;
      }
      const style = getComputedStyle(this.control);
      const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.5;
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      this.maxHeight = Math.round(lineHeight * this.options.maxRows + padding);
    }

    autosize() {
      this.control.style.height = 'auto';
      const full = this.control.scrollHeight;
      const viewportCap = Math.round(innerHeight * 0.4);
      const cap = this.maxHeight ? Math.min(this.maxHeight, viewportCap) : viewportCap;
      const clipped = full > cap;
      this.control.style.height = (clipped ? cap : full) + 'px';
      this.control.style.overflowY = clipped ? 'auto' : 'hidden';
    }
  }

  return TextArea;
});

;
Dixel.define('TextField', ['Field'], function (Field) {
  'use strict';

  class TextField extends Field {
    static defaults = Object.assign({}, Field.defaults, {
      type: 'text',
      autocomplete: null,
      maxLength: null
    });

    buildControl() {
      const input = super.buildControl();
      input.type = this.options.type;
      if (this.options.autocomplete) input.setAttribute('autocomplete', this.options.autocomplete);
      if (this.options.maxLength) input.maxLength = this.options.maxLength;
      return input;
    }
  }

  return TextField;
});

;
Dixel.define('Accordion', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Accordion extends Component {
    static defaults = {
      items: [],
      multiple: false,
      stagger: 0.07
    };

    build() {
      return Utils.el('div', 'dx-acc');
    }

    ready() {
      this.el.classList.add('dx-acc');
      if (this.options.items.length && !this.el.querySelector('.dx-acc-item')) this.render();
      Array.from(this.el.querySelectorAll('.dx-acc-inner')).forEach((inner) => {
        if (inner.querySelector('.dx-acc-content')) return;
        const content = Utils.el('div', 'dx-acc-content');
        while (inner.firstChild) content.appendChild(inner.firstChild);
        inner.appendChild(content);
      });
      this.items = Array.from(this.el.querySelectorAll('.dx-acc-item'));
      this.items.forEach((item, index) => {
        item.style.transitionDelay = (index * this.options.stagger).toFixed(3) + 's';
        const head = item.querySelector('.dx-acc-head');
        if (head) this.listen(head, 'click', () => this.toggle(item));
      });
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-acc--in');
      });
    }

    render() {
      this.options.items.forEach((data) => {
        const item = Utils.el('div', 'dx-acc-item' + (data.open ? ' dx-acc-item--open' : ''));
        const head = Utils.el('button', 'dx-acc-head dx-focusable', {
          type: 'button',
          'aria-expanded': data.open ? 'true' : 'false'
        });
        head.appendChild(Utils.el('span', 'dx-acc-title', { text: data.title }));
        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('viewBox', '0 0 14 8');
        chevron.setAttribute('class', 'dx-acc-chevron');
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = '<path d="M1 1l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        head.appendChild(chevron);
        const body = Utils.el('div', 'dx-acc-body');
        const inner = Utils.el('div', 'dx-acc-inner');
        const content = Utils.el('div', 'dx-acc-content');
        content.innerHTML = data.content || '';
        inner.appendChild(content);
        body.appendChild(inner);
        item.appendChild(head);
        item.appendChild(body);
        this.el.appendChild(item);
      });
    }

    toggle(item) {
      const willOpen = !item.classList.contains('dx-acc-item--open');
      if (willOpen && !this.options.multiple) {
        this.items.forEach((other) => {
          if (other !== item) this.setOpen(other, false);
        });
      }
      this.setOpen(item, willOpen);
    }

    setOpen(item, open) {
      item.classList.toggle('dx-acc-item--open', open);
      const head = item.querySelector('.dx-acc-head');
      if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  return Accordion;
});

;
Dixel.define('MasonryGrid', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class MasonryGrid extends Component {
    static defaults = {
      minWidth: 260,
      gap: null,
      stagger: 0.06,
      maxStagger: 0.7,
      items: []
    };

    build() {
      return Utils.el('div', 'dx-masonry');
    }

    ready() {
      this.el.classList.add('dx-masonry');
      if (!this.el.children.length && this.options.items.length) {
        this.options.items.forEach((html) => {
          const item = Utils.el('div', 'dx-masonry-card');
          item.innerHTML = html;
          this.el.appendChild(item);
        });
      }
      this.el.style.columnWidth = this.options.minWidth + 'px';
      if (this.options.gap) this.el.style.columnGap = this.options.gap;
      Array.from(this.el.children).forEach((child, index) => {
        child.classList.add('dx-masonry-item');
        child.style.transitionDelay = Math.min(index * this.options.stagger, this.options.maxStagger).toFixed(3) + 's';
      });
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-masonry--in');
        return;
      }
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-masonry--in');
      });
    }
  }

  return MasonryGrid;
});

;
Dixel.define('SectionWave', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  const SHAPES = {
    wave: 'M0,64 C240,96 480,16 720,40 C960,64 1200,88 1440,48 L1440,100 L0,100 Z',
    curve: 'M0,84 Q720,-16 1440,84 L1440,100 L0,100 Z',
    tilt: 'M0,92 L1440,16 L1440,100 L0,100 Z'
  };
  class SectionWave extends Component {
    static defaults = {
      shape: 'wave',
      color: 'surface',
      flip: false,
      height: null
    };

    build() {
      const el = Utils.el('div', 'dx-wave');
      el.innerHTML = this.svgMarkup();
      return el;
    }

    svgMarkup() {
      const path = SHAPES[this.options.shape] || SHAPES.wave;
      return '<svg class="dx-wave-svg" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="' + path + '" fill="var(--dx-' + this.options.color + ')"></path></svg>';
    }

    ready() {
      this.el.classList.add('dx-wave');
      this.el.classList.toggle('dx-wave--flip', !!this.options.flip);
      if (this.options.height) this.el.style.setProperty('--dx-wave-h', this.options.height);
      this.el.setAttribute('aria-hidden', 'true');
      if (!this.el.querySelector('.dx-wave-svg')) this.el.innerHTML = this.svgMarkup();
    }
  }

  return SectionWave;
});

;
Dixel.define('SplitView', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  const HANDLE_STYLES = ['pill', 'line', 'dots', 'chevrons'];
  const chevron = '<svg viewBox="0 0 8 14" aria-hidden="true"><path d="M7 1 1 7l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  class SplitView extends Component {
    static defaults = {
      start: 0.5,
      min: 0.2,
      max: 0.8,
      step: 0.03,
      orientation: 'horizontal',
      handleStyle: 'pill',
      panes: []
    };

    build() {
      const el = Utils.el('div', 'dx-splitview');
      for (let i = 0; i < 2; i++) {
        const pane = Utils.el('div');
        if (this.options.panes[i]) {
          pane.classList.add('dx-splitview-pane--pad');
          pane.innerHTML = this.options.panes[i];
        }
        el.appendChild(pane);
      }
      return el;
    }

    ready() {
      this.horizontal = this.options.orientation !== 'vertical';
      this.el.classList.add('dx-splitview', this.horizontal ? 'dx-splitview--h' : 'dx-splitview--v');
      const panes = Array.from(this.el.children);
      panes.forEach((pane) => pane.classList.add('dx-splitview-pane'));
      const handleStyle = HANDLE_STYLES.indexOf(this.options.handleStyle) === -1 ? 'pill' : this.options.handleStyle;
      this.handle = Utils.el('div', 'dx-splitview-handle dx-splitview-handle--' + handleStyle + ' dx-focusable', {
        role: 'separator',
        'aria-orientation': this.horizontal ? 'vertical' : 'horizontal',
        tabindex: '0',
        'aria-valuemin': String(Math.round(this.options.min * 100)),
        'aria-valuemax': String(Math.round(this.options.max * 100))
      });
      const grip = Utils.el('span', 'dx-splitview-grip', { 'aria-hidden': 'true' });
      if (handleStyle === 'chevrons') {
        grip.innerHTML = '<span class="dx-splitview-chev dx-splitview-chev--prev">' + chevron + '</span>' +
          '<span class="dx-splitview-chev dx-splitview-chev--next">' + chevron + '</span>';
      }
      this.handle.appendChild(grip);
      if (panes[1]) this.el.insertBefore(this.handle, panes[1]);
      else this.el.appendChild(this.handle);
      this.fraction = Utils.clamp(this.options.start, this.options.min, this.options.max);
      this.pending = null;
      this.bounds = null;
      this.stopFrames = null;
      this.apply();
      this.listen(this.handle, 'pointerdown', this.onDown);
      this.listen(this.handle, 'pointermove', this.onMove);
      this.listen(this.handle, 'pointerup', this.onUp);
      this.listen(this.handle, 'pointercancel', this.onUp);
      this.listen(this.handle, 'keydown', this.onKey);
      this.addCleanup(() => this.halt());
    }

    pointerPosition(event) {
      return this.horizontal ? event.clientX : event.clientY;
    }

    onDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      this.handle.setPointerCapture(event.pointerId);
      this.bounds = this.el.getBoundingClientRect();
      this.el.classList.add('dx-splitview--dragging');
      this.pending = this.pointerPosition(event);
      this.run();
    }

    onMove(event) {
      if (this.bounds === null) return;
      this.pending = this.pointerPosition(event);
    }

    onUp(event) {
      if (this.bounds === null) return;
      if (this.handle.hasPointerCapture(event.pointerId)) this.handle.releasePointerCapture(event.pointerId);
      this.bounds = null;
      this.el.classList.remove('dx-splitview--dragging');
      this.halt();
    }

    onKey(event) {
      const step = this.options.step;
      const decrease = this.horizontal ? 'ArrowLeft' : 'ArrowUp';
      const increase = this.horizontal ? 'ArrowRight' : 'ArrowDown';
      if (event.key === decrease) this.setFraction(this.fraction - step);
      else if (event.key === increase) this.setFraction(this.fraction + step);
      else if (event.key === 'Home') this.setFraction(this.options.min);
      else if (event.key === 'End') this.setFraction(this.options.max);
      else return;
      event.preventDefault();
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add(() => {
        if (this.pending === null || !this.bounds) return;
        const fraction = this.horizontal
          ? (this.pending - this.bounds.left) / (this.bounds.width || 1)
          : (this.pending - this.bounds.top) / (this.bounds.height || 1);
        this.pending = null;
        this.setFraction(fraction);
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    setFraction(fraction) {
      const next = Utils.clamp(fraction, this.options.min, this.options.max);
      if (next === this.fraction) return;
      this.fraction = next;
      this.apply();
    }

    apply() {
      const template = this.fraction.toFixed(4) + 'fr auto ' + (1 - this.fraction).toFixed(4) + 'fr';
      if (this.horizontal) this.el.style.gridTemplateColumns = template;
      else this.el.style.gridTemplateRows = template;
      this.handle.setAttribute('aria-valuenow', String(Math.round(this.fraction * 100)));
    }
  }

  return SplitView;
});

;
Dixel.define('Steps', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Steps extends Component {
    static defaults = {
      steps: [],
      current: 0,
      stagger: 0.14,
      colors: null
    };

    colorFor(index) {
      if (!this.options.colors || !this.options.colors.length) return null;
      const token = this.options.colors[index % this.options.colors.length];
      return token.indexOf('#') === 0 || token.indexOf('rgb') === 0 ? token : 'var(--dx-' + token + ')';
    }

    build() {
      return Utils.el('ol', 'dx-steps');
    }

    ready() {
      this.el.classList.add('dx-steps');
      if (this.options.steps.length && !this.el.querySelector('.dx-steps-item')) this.render();
      this.items = Array.from(this.el.querySelectorAll('.dx-steps-item'));
      this.current = Utils.clamp(this.options.current, 0, Math.max(this.items.length - 1, 0));
      this.applyState();
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-steps--in');
      });
    }

    render() {
      this.options.steps.forEach((label, index) => {
        const item = Utils.el('li', 'dx-steps-item');
        const stepColor = this.colorFor(index);
        if (stepColor) item.style.setProperty('--dx-step-color', stepColor);
        if (index > 0) {
          const connector = Utils.el('span', 'dx-steps-connector', { 'aria-hidden': 'true' });
          const fill = Utils.el('span', 'dx-steps-connector-fill');
          fill.style.transitionDelay = (index * this.options.stagger).toFixed(3) + 's';
          connector.appendChild(fill);
          item.appendChild(connector);
        }
        const dot = Utils.el('span', 'dx-steps-dot');
        dot.style.transitionDelay = (index * this.options.stagger).toFixed(3) + 's';
        dot.appendChild(Utils.el('span', 'dx-steps-num', { text: String(index + 1) }));
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        check.setAttribute('viewBox', '0 0 12 10');
        check.setAttribute('class', 'dx-steps-check');
        check.setAttribute('aria-hidden', 'true');
        check.innerHTML = '<path d="M1 5.5 4.5 9 11 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        dot.appendChild(check);
        item.appendChild(dot);
        item.appendChild(Utils.el('span', 'dx-steps-label', { text: label }));
        this.el.appendChild(item);
      });
    }

    applyState() {
      this.items.forEach((item, index) => {
        item.classList.toggle('dx-steps-item--done', index < this.current);
        item.classList.toggle('dx-steps-item--active', index === this.current);
        item.classList.toggle('dx-steps-item--reached', index <= this.current);
      });
    }

    go(index) {
      this.clearStagger();
      this.current = Utils.clamp(index, 0, this.items.length - 1);
      this.applyState();
    }

    clearStagger() {
      if (this.staggerCleared) return;
      this.staggerCleared = true;
      this.el.querySelectorAll('.dx-steps-dot, .dx-steps-connector-fill').forEach((node) => {
        node.style.transitionDelay = '0s';
      });
    }

    next() {
      this.go(this.current + 1);
    }

    prev() {
      this.go(this.current - 1);
    }
  }

  return Steps;
});

;
Dixel.define('StickyStack', ['Component', 'Utils', 'ScrollWatch'], function (Component, Utils, ScrollWatch) {
  'use strict';

  class StickyStack extends Component {
    static defaults = {
      top: 24,
      scaleStep: 0.05,
      items: []
    };

    build() {
      return Utils.el('div', 'dx-stack');
    }

    ready() {
      this.el.classList.add('dx-stack');
      if (!this.el.children.length && this.options.items.length) {
        this.options.items.forEach((html) => {
          const card = Utils.el('div', 'dx-stack-panel');
          card.innerHTML = html;
          this.el.appendChild(card);
        });
      }
      this.cards = Array.from(this.el.children);
      this.cards.forEach((card, index) => {
        card.classList.add('dx-stack-card');
        card.style.top = this.options.top + 'px';
        card.style.zIndex = String(index + 1);
      });
      if (Utils.reducedMotion || this.cards.length < 2) return;
      this.addCleanup(ScrollWatch.watch(this.el, {
        progress: (progress) => this.paint(progress)
      }));
    }

    paint(progress) {
      const count = this.cards.length;
      for (let i = 0; i < count - 1; i++) {
        const covered = Utils.clamp(progress * count - (i + 1), 0, 1);
        const scale = 1 - covered * this.options.scaleStep;
        this.cards[i].style.transform = 'scale(' + scale.toFixed(4) + ')';
      }
    }
  }

  return StickyStack;
});

;
Dixel.define('Timeline', ['Component', 'Utils', 'ScrollWatch'], function (Component, Utils, ScrollWatch) {
  'use strict';

  class Timeline extends Component {
    static defaults = {
      items: []
    };

    build() {
      return Utils.el('div', 'dx-timeline');
    }

    ready() {
      this.el.classList.add('dx-timeline');
      if (this.options.items.length && !this.el.querySelector('.dx-timeline-item')) this.render();
      this.fill = this.el.querySelector('.dx-timeline-fill');
      this.items = Array.from(this.el.querySelectorAll('.dx-timeline-item'));
      this.ratios = [];
      this.measure();
      this.listen(window, 'resize', () => this.measure());
      if (Utils.reducedMotion) {
        if (this.fill) this.fill.style.transform = 'scaleY(1)';
        this.items.forEach((item) => item.classList.add('dx-timeline-item--lit'));
        return;
      }
      this.addCleanup(ScrollWatch.watch(this.el, {
        progress: (progress) => this.paint(progress)
      }));
    }

    render() {
      const rail = Utils.el('div', 'dx-timeline-rail', { 'aria-hidden': 'true' });
      rail.appendChild(Utils.el('div', 'dx-timeline-fill'));
      this.el.appendChild(rail);
      const list = Utils.el('ol', 'dx-timeline-list');
      this.options.items.forEach((data) => {
        const item = Utils.el('li', 'dx-timeline-item');
        item.appendChild(Utils.el('span', 'dx-timeline-node', { 'aria-hidden': 'true' }));
        const card = Utils.el('div', 'dx-timeline-card');
        if (data.date) card.appendChild(Utils.el('span', 'dx-timeline-date', { text: data.date }));
        if (data.title) card.appendChild(Utils.el('h4', 'dx-timeline-title', { text: data.title }));
        if (data.text) card.appendChild(Utils.el('p', 'dx-timeline-text', { text: data.text }));
        item.appendChild(card);
        list.appendChild(item);
      });
      this.el.appendChild(list);
    }

    measure() {
      const total = this.el.offsetHeight || 1;
      this.ratios = this.items.map((item) => (item.offsetTop + 14) / total);
    }

    paint(progress) {
      if (this.fill) this.fill.style.transform = 'scaleY(' + progress.toFixed(4) + ')';
      for (let i = 0; i < this.items.length; i++) {
        this.items[i].classList.toggle('dx-timeline-item--lit', this.ratios[i] <= progress);
      }
    }
  }

  return Timeline;
});

;
Dixel.define('Carousel', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  const EFFECTS = ['slide', 'coverflow', 'fade', 'ring'];

  class Carousel extends Component {
    static defaults = {
      dots: true,
      arrows: true,
      loop: true,
      startIndex: 0,
      snapStrength: 9,
      dragThreshold: 6,
      effect: 'slide',
      coverflowRotate: 35,
      coverflowDepth: 140,
      autoSpeed: 12,
      pauseOnHover: false,
      ringRadius: null,
      ringInterval: 3,
      ringSettle: 5,
      ringTilt: 58,
      ringScaleStep: 0.07,
      ringDepth: 0.55,
      ringGap: 0.72,
      ringFriction: 3.2,
      onChange: null,
      slides: []
    };

    build() {
      return Utils.el('div', 'dx-carousel');
    }

    ready() {
      this.effect = EFFECTS.indexOf(this.options.effect) === -1 ? 'slide' : this.options.effect;
      this.el.classList.add('dx-carousel', 'dx-carousel--' + this.effect);
      if (!this.el.children.length && this.options.slides.length) {
        this.options.slides.forEach((html) => {
          const slide = Utils.el('div');
          slide.innerHTML = html;
          this.el.appendChild(slide);
        });
      }
      this.viewport = Utils.el('div', 'dx-carousel-viewport');
      this.track = Utils.el('div', 'dx-carousel-track');
      const slides = Array.from(this.el.children);
      slides.forEach((slide) => {
        slide.classList.add('dx-carousel-slide');
        this.track.appendChild(slide);
      });
      this.slides = slides;
      this.viewport.appendChild(this.track);
      this.el.appendChild(this.viewport);
      this.index = Utils.clamp(this.options.startIndex, 0, Math.max(slides.length - 1, 0));
      this.x = 0;
      this.target = 0;
      this.velocity = 0;
      this.dragging = false;
      this.moved = false;
      this.pendingX = null;
      this.stopFrames = null;
      this.measureQueued = false;
      this.stopMeasure = null;
      this.snapPoints = [];
      this.addCleanup(() => {
        if (this.stopMeasure) this.stopMeasure();
      });
      this.slides.forEach((slide) => {
        slide.querySelectorAll('img').forEach((img) => {
          if (!img.complete) this.listen(img, 'load', () => this.queueMeasure());
        });
      });
      if (this.effect === 'ring') {
        this.setupRing();
        return;
      }
      if (this.options.arrows && slides.length > 1) this.buildArrows();
      if (this.options.dots && slides.length > 1) this.buildDots();
      this.measure();
      this.jumpTo(this.index);
      this.listen(window, 'resize', () => this.queueMeasure());
      this.listen(window, 'load', () => this.queueMeasure());
      this.listen(this.viewport, 'pointerdown', this.onDown);
      this.listen(this.viewport, 'pointermove', this.onMove);
      this.listen(this.viewport, 'pointerup', this.onUp);
      this.listen(this.viewport, 'pointercancel', this.onUp);
      this.listen(this.viewport, 'click', this.onClick, true);
      this.listen(this.el, 'keydown', this.onKey);
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (!visible) {
          this.halt();
          return;
        }
        this.queueMeasure();
        if (!this.dragging && this.x !== this.target) this.run();
      });
    }

    buildArrows() {
      const chevron = '<svg viewBox="0 0 8 14" aria-hidden="true"><path d="M7 1 1 7l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      this.prevBtn = Utils.el('button', 'dx-carousel-arrow dx-carousel-arrow--prev dx-focusable', { type: 'button', 'aria-label': 'Anterior' });
      this.prevBtn.innerHTML = chevron;
      this.nextBtn = Utils.el('button', 'dx-carousel-arrow dx-carousel-arrow--next dx-focusable', { type: 'button', 'aria-label': 'Siguiente' });
      this.nextBtn.innerHTML = chevron;
      this.listen(this.prevBtn, 'click', () => this.prev());
      this.listen(this.nextBtn, 'click', () => this.next());
      this.el.appendChild(this.prevBtn);
      this.el.appendChild(this.nextBtn);
    }

    buildDots() {
      this.dotsEl = Utils.el('div', 'dx-carousel-dots', { role: 'tablist' });
      this.dots = this.slides.map((slide, index) => {
        const dot = Utils.el('button', 'dx-carousel-dot', { type: 'button', 'aria-label': 'Ir a ' + (index + 1) });
        this.listen(dot, 'click', () => this.go(index));
        this.dotsEl.appendChild(dot);
        return dot;
      });
      this.el.appendChild(this.dotsEl);
    }

    setupRing() {
      this.angle = 0;
      this.spinVelocity = 0;
      this.hoverPaused = false;
      this.grabStartX = 0;
      this.ringTarget = null;
      this.ringWait = 0;
      this.measure();
      this.paintRing();
      this.listen(window, 'resize', () => this.queueMeasure());
      this.listen(window, 'load', () => this.queueMeasure());
      this.addCleanup(() => this.halt());
      if (this.options.arrows && this.slides.length > 1) this.buildArrows();
      if (this.options.dots && this.slides.length > 1) this.buildDots();
      if (!this.el.hasAttribute('tabindex')) this.el.setAttribute('tabindex', '0');
      this.el.setAttribute('role', 'region');
      this.el.setAttribute('aria-roledescription', 'carrusel');
      this.listen(this.el, 'keydown', this.onRingKey);
      this.syncRingUi();
      if (Utils.reducedMotion) return;
      this.listen(this.viewport, 'pointerdown', this.onRingDown);
      this.listen(this.viewport, 'pointermove', this.onRingMove);
      this.listen(this.viewport, 'pointerup', this.onRingUp);
      this.listen(this.viewport, 'pointercancel', this.onRingUp);
      this.listen(this.viewport, 'click', this.onClick, true);
      if (this.options.pauseOnHover) {
        this.listen(this.el, 'pointerenter', (event) => {
          if (event.pointerType === 'mouse') this.hoverPaused = true;
        });
        this.listen(this.el, 'pointerleave', () => {
          this.hoverPaused = false;
          this.run();
        });
      }
      this.whenVisible((visible) => {
        if (!visible) {
          this.halt();
          return;
        }
        this.queueMeasure();
        this.run();
      });
    }

    ringIndex() {
      const count = this.slides.length;
      if (!count) return 0;
      return ((Math.round(-this.angle / this.ringStep) % count) + count) % count;
    }

    goRing(index) {
      const count = this.slides.length;
      if (!count) return;
      const full = count * this.ringStep;
      let target = -index * this.ringStep;
      target += Math.round((this.angle - target) / full) * full;
      this.spinVelocity = 0;
      this.ringWait = 0;
      this.ringTarget = target;
      if (Utils.reducedMotion) {
        this.angle = target;
        this.paintRing();
        this.syncRingUi();
        return;
      }
      this.run();
    }

    onRingKey(event) {
      if (event.target !== this.el) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.goRing(this.ringIndex() + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.goRing(this.ringIndex() - 1);
      }
    }

    syncRingUi() {
      const active = this.ringIndex();
      if (this.dots) {
        this.dots.forEach((dot, index) => dot.classList.toggle('dx-carousel-dot--active', index === active));
      }
      if (this.lastRingIndex !== active) {
        this.lastRingIndex = active;
        if (this.options.onChange) this.options.onChange(active, this);
      }
    }

    onRingDown(event) {
      this.viewport.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.moved = false;
      this.grabX = event.clientX;
      this.grabStartX = event.clientX;
      this.pendingX = null;
      this.spinVelocity = 0;
      this.el.classList.add('dx-carousel--dragging');
      this.run();
    }

    onRingMove(event) {
      if (!this.dragging) return;
      this.pendingX = event.clientX;
      if (Math.abs(event.clientX - this.grabStartX) > this.options.dragThreshold) this.moved = true;
    }

    onRingUp(event) {
      if (!this.dragging) return;
      if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
      this.dragging = false;
      this.el.classList.remove('dx-carousel--dragging');
    }

    stepRing(delta) {
      const safeDelta = Math.max(delta, 0.001);
      if (this.dragging) {
        this.ringTarget = null;
        if (this.pendingX === null) return;
        const turned = (this.pendingX - this.grabX) * this.ringDragFactor;
        this.grabX = this.pendingX;
        this.pendingX = null;
        this.angle += turned;
        this.spinVelocity = Utils.clamp(turned / safeDelta, -420, 420);
        this.paintRing();
        return;
      }
      if (this.spinVelocity) {
        this.spinVelocity = Utils.damp(this.spinVelocity, 0, this.options.ringFriction, safeDelta);
        this.angle += this.spinVelocity * safeDelta;
        if (Math.abs(this.spinVelocity) < 14) this.spinVelocity = 0;
        this.paintRing();
        return;
      }
      if (this.ringTarget === null || this.ringTarget === undefined) {
        this.ringTarget = Math.round(this.angle / this.ringStep) * this.ringStep;
        this.ringWait = 0;
      }
      if (Math.abs(this.ringTarget - this.angle) > 0.04) {
        this.angle = Utils.damp(this.angle, this.ringTarget, this.options.ringSettle, safeDelta);
        this.paintRing();
        this.ringWait = 0;
        return;
      }
      if (this.angle !== this.ringTarget) {
        this.angle = this.ringTarget;
        this.paintRing();
        this.syncRingUi();
      }
      if (this.hoverPaused || this.options.ringInterval <= 0) {
        this.halt();
        return;
      }
      this.ringWait += safeDelta;
      if (this.ringWait >= this.options.ringInterval) {
        this.ringTarget -= this.ringStep;
        this.ringWait = 0;
      }
    }

    paintRing() {
      const count = this.slides.length;
      const edge = count / 2;
      for (let i = 0; i < count; i++) {
        let offset = this.angle / this.ringStep + i;
        offset -= Math.round(offset / count) * count;
        const distance = Math.abs(offset);
        const turn = -Utils.clamp(offset, -1, 1) * this.options.ringTilt;
        const x = offset * this.cardGapX;
        const z = -distance * this.cardDepth;
        const scale = 1 - Math.min(distance, 2.5) * this.options.ringScaleStep;
        const fade = Utils.clamp((edge - distance) * 2, 0, 1);
        this.slides[i].style.transform =
          'translateX(-50%) translate3d(' + x.toFixed(1) + 'px,0,' + z.toFixed(1) + 'px)' +
          ' rotateY(' + turn.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
        this.slides[i].style.opacity = fade.toFixed(3);
        this.slides[i].style.zIndex = String(100 - Math.round(distance * 10));
      }
    }

    measure() {
      const viewportWidth = this.viewport.clientWidth;
      this.viewportWidth = viewportWidth;
      if (this.effect === 'ring') {
        const count = Math.max(this.slides.length, 1);
        const slideWidth = this.slides[0] ? this.slides[0].offsetWidth : 0;
        let maxHeight = 0;
        this.slides.forEach((slide) => {
          maxHeight = Math.max(maxHeight, slide.offsetHeight);
        });
        this.ringStep = 360 / count;
        this.cardGapX = this.options.ringRadius || Math.min(slideWidth * this.options.ringGap, viewportWidth * 0.3);
        this.cardDepth = Math.round(slideWidth * this.options.ringDepth);
        this.ringDragFactor = this.ringStep / Math.max(this.cardGapX, 60);
        this.track.style.transform = '';
        if (maxHeight) this.track.style.height = maxHeight + 'px';
        this.paintRing();
        return;
      }
      if (this.effect === 'fade') {
        this.maxX = 0;
        this.minX = -Math.max(this.slides.length - 1, 0) * viewportWidth;
        this.snapPoints = this.slides.map((slide, index) => -index * viewportWidth);
        return;
      }
      if (this.effect === 'coverflow') {
        this.slideMetrics = this.slides.map((slide) => ({
          center: slide.offsetLeft + slide.offsetWidth / 2,
          width: slide.offsetWidth || 1
        }));
        this.snapPoints = this.slideMetrics.map((metric) => viewportWidth / 2 - metric.center);
        this.maxX = this.snapPoints.length ? Math.max.apply(null, this.snapPoints) : 0;
        this.minX = this.snapPoints.length ? Math.min.apply(null, this.snapPoints) : 0;
        return;
      }
      const trackWidth = this.track.scrollWidth;
      this.minX = Math.min(viewportWidth - trackWidth, 0);
      this.maxX = 0;
      this.snapPoints = this.slides.map((slide) => Utils.clamp(-slide.offsetLeft, this.minX, this.maxX));
    }

    queueMeasure() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      this.stopMeasure = Ticker.add(() => {
        this.stopMeasure();
        this.stopMeasure = null;
        this.measureQueued = false;
        this.measure();
        if (this.effect === 'ring') this.paintRing();
        else this.jumpTo(this.index);
      });
    }

    wrapIndex(index) {
      const count = this.slides.length;
      if (!count) return 0;
      if (this.options.loop) return ((index % count) + count) % count;
      return Utils.clamp(index, 0, count - 1);
    }

    prev() {
      this.go((this.effect === 'ring' ? this.ringIndex() : this.index) - 1);
    }

    next() {
      this.go((this.effect === 'ring' ? this.ringIndex() : this.index) + 1);
    }

    go(index) {
      if (this.effect === 'ring') {
        this.goRing(index);
        return;
      }
      this.index = this.wrapIndex(index);
      this.target = this.snapPoints[this.index] || 0;
      this.syncUi();
      if (Utils.reducedMotion) {
        this.x = this.target;
        this.paint();
        return;
      }
      this.run();
    }

    jumpTo(index) {
      if (this.effect === 'ring') {
        this.angle = -this.wrapIndex(index) * this.ringStep;
        this.ringTarget = this.angle;
        this.paintRing();
        this.syncRingUi();
        return;
      }
      this.index = this.wrapIndex(index);
      this.target = this.snapPoints[this.index] || 0;
      this.x = this.target;
      this.paint();
      this.syncUi();
    }

    syncUi() {
      if (this.dots) {
        this.dots.forEach((dot, index) => dot.classList.toggle('dx-carousel-dot--active', index === this.index));
      }
      if (this.prevBtn && !this.options.loop) {
        this.prevBtn.disabled = this.index === 0;
        this.nextBtn.disabled = this.index === this.slides.length - 1;
      }
      if (this.lastIndex !== this.index) {
        this.lastIndex = this.index;
        if (this.options.onChange) this.options.onChange(this.index, this);
      }
    }

    onDown(event) {
      if (this.slides.length < 2) return;
      this.viewport.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.moved = false;
      this.grabX = event.clientX;
      this.startX = this.x;
      this.pendingX = event.clientX;
      this.velocity = 0;
      this.el.classList.add('dx-carousel--dragging');
      this.run();
    }

    onMove(event) {
      if (!this.dragging) return;
      this.pendingX = event.clientX;
      if (Math.abs(event.clientX - this.grabX) > this.options.dragThreshold) this.moved = true;
    }

    onUp(event) {
      if (!this.dragging) return;
      if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
      this.dragging = false;
      this.el.classList.remove('dx-carousel--dragging');
      this.settle();
    }

    onClick(event) {
      if (!this.moved) return;
      event.preventDefault();
      event.stopPropagation();
      this.moved = false;
    }

    onKey(event) {
      if (event.key === 'ArrowLeft') this.go(this.index - 1);
      else if (event.key === 'ArrowRight') this.go(this.index + 1);
      else return;
      event.preventDefault();
    }

    settle() {
      const projected = this.x + this.velocity * 0.16;
      let nearest = 0;
      let nearestDistance = Infinity;
      this.snapPoints.forEach((point, index) => {
        const distance = Math.abs(point - projected);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      });
      if (nearest === this.index && Math.abs(this.velocity) > 260) {
        nearest = this.wrapIndex(this.index + (this.velocity < 0 ? 1 : -1));
        if (!this.options.loop) nearest = Utils.clamp(nearest, 0, this.slides.length - 1);
      }
      this.index = nearest;
      this.target = this.snapPoints[this.index] || 0;
      this.syncUi();
      if (Utils.reducedMotion) {
        this.x = this.target;
        this.paint();
        this.halt();
        return;
      }
      this.run();
    }

    rubber(value) {
      if (value > this.maxX) return this.maxX + (value - this.maxX) * 0.28;
      if (value < this.minX) return this.minX + (value - this.minX) * 0.28;
      return value;
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add((time, delta) => this.step(delta));
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    step(delta) {
      if (this.effect === 'ring') {
        this.stepRing(delta);
        return;
      }
      const safeDelta = Math.max(delta, 0.001);
      if (this.dragging) {
        if (this.pendingX === null) return;
        const desired = this.startX + (this.pendingX - this.grabX);
        const bounded = this.rubber(desired);
        this.velocity = (bounded - this.x) / safeDelta;
        this.x = bounded;
        this.paint();
        return;
      }
      this.x = Utils.damp(this.x, this.target, this.options.snapStrength, safeDelta);
      this.paint();
      if (Math.abs(this.target - this.x) < 0.4) {
        this.x = this.target;
        this.paint();
        this.halt();
      }
    }

    paint() {
      if (this.effect === 'fade') {
        this.paintFade();
        return;
      }
      this.track.style.transform = 'translate3d(' + this.x.toFixed(2) + 'px,0,0)';
      if (this.effect === 'coverflow') this.paintCoverflow();
    }

    paintCoverflow() {
      if (!this.slideMetrics) return;
      const half = this.viewportWidth / 2;
      for (let i = 0; i < this.slides.length; i++) {
        const metric = this.slideMetrics[i];
        const distance = (metric.center + this.x - half) / metric.width;
        const turn = Utils.clamp(distance, -1, 1);
        const depth = Math.min(Math.abs(distance), 2.5);
        this.slides[i].style.transform =
          'translateZ(' + (-this.options.coverflowDepth * depth).toFixed(1) + 'px)' +
          ' rotateY(' + (-this.options.coverflowRotate * turn).toFixed(2) + 'deg)';
        this.slides[i].style.zIndex = String(100 - Math.round(depth * 10));
      }
    }

    paintFade() {
      this.track.style.transform = '';
      const progress = this.viewportWidth ? -this.x / this.viewportWidth : 0;
      for (let i = 0; i < this.slides.length; i++) {
        const opacity = Utils.clamp(1 - Math.abs(progress - i), 0, 1);
        this.slides[i].style.opacity = opacity.toFixed(3);
        this.slides[i].style.zIndex = opacity > 0.5 ? '2' : '1';
      }
    }
  }

  return Carousel;
});

;
Dixel.define('CompareSlider', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class CompareSlider extends Component {
    static defaults = {
      start: 0.5,
      labelBefore: null,
      labelAfter: null,
      step: 0.03,
      before: null,
      after: null
    };

    build() {
      return Utils.el('div', 'dx-compare');
    }

    ready() {
      this.el.classList.add('dx-compare');
      if (!this.el.children.length && (this.options.before || this.options.after)) {
        const beforePane = Utils.el('div', 'dx-compare-panel dx-compare-panel--before');
        beforePane.innerHTML = this.options.before || '';
        const afterPane = Utils.el('div', 'dx-compare-panel dx-compare-panel--after');
        afterPane.innerHTML = this.options.after || '';
        this.el.appendChild(beforePane);
        this.el.appendChild(afterPane);
      }
      const layers = Array.from(this.el.children);
      if (layers[0]) layers[0].classList.add('dx-compare-before');
      this.after = Utils.el('div', 'dx-compare-after');
      if (layers[1]) this.after.appendChild(layers[1]);
      this.el.appendChild(this.after);
      this.handle = Utils.el('div', 'dx-compare-handle dx-focusable', {
        role: 'slider',
        tabindex: '0',
        'aria-label': 'Comparar',
        'aria-valuemin': '0',
        'aria-valuemax': '100'
      });
      this.handle.innerHTML =
        '<span class="dx-compare-grip" aria-hidden="true">' +
        '<svg viewBox="0 0 14 10"><path d="M5 1 1 5l4 4M9 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</span>';
      this.el.appendChild(this.handle);
      if (this.options.labelBefore) this.el.appendChild(Utils.el('span', 'dx-compare-label dx-compare-label--before', { text: this.options.labelBefore }));
      if (this.options.labelAfter) this.el.appendChild(Utils.el('span', 'dx-compare-label dx-compare-label--after', { text: this.options.labelAfter }));
      this.fraction = Utils.clamp(this.options.start, 0, 1);
      this.width = 0;
      this.left = 0;
      this.pendingX = null;
      this.stopFrames = null;
      this.measureQueued = false;
      this.measure();
      this.apply();
      this.listen(window, 'resize', () => this.queueMeasure());
      this.listen(window, 'load', () => this.queueMeasure());
      this.listen(this.el, 'pointerdown', this.onDown);
      this.listen(this.el, 'pointermove', this.onMove);
      this.listen(this.el, 'pointerup', this.onUp);
      this.listen(this.el, 'pointercancel', this.onUp);
      this.listen(this.handle, 'keydown', this.onKey);
      this.addCleanup(() => this.halt());
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.width = rect.width || 1;
      this.left = rect.left;
    }

    queueMeasure() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      if (!this.stopMeasureRegistered) {
        this.stopMeasureRegistered = true;
        this.addCleanup(() => {
          if (this.stopMeasure) this.stopMeasure();
        });
      }
      this.stopMeasure = Ticker.add(() => {
        this.stopMeasure();
        this.stopMeasure = null;
        this.measureQueued = false;
        this.measure();
        this.apply();
      });
    }

    onDown(event) {
      event.preventDefault();
      this.el.setPointerCapture(event.pointerId);
      this.el.classList.add('dx-compare--dragging');
      this.measure();
      this.pendingX = event.clientX;
      this.run();
    }

    onMove(event) {
      if (!this.stopFrames) return;
      this.pendingX = event.clientX;
    }

    onUp(event) {
      if (this.el.hasPointerCapture(event.pointerId)) this.el.releasePointerCapture(event.pointerId);
      this.el.classList.remove('dx-compare--dragging');
      this.halt();
    }

    onKey(event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') this.setFraction(this.fraction - this.options.step);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') this.setFraction(this.fraction + this.options.step);
      else if (event.key === 'Home') this.setFraction(0);
      else if (event.key === 'End') this.setFraction(1);
      else return;
      event.preventDefault();
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add(() => {
        if (this.pendingX === null) return;
        const fraction = (this.pendingX - this.left) / this.width;
        this.pendingX = null;
        this.setFraction(fraction);
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    setFraction(fraction) {
      const next = Utils.clamp(fraction, 0, 1);
      if (next === this.fraction) return;
      this.fraction = next;
      this.apply();
    }

    apply() {
      this.after.style.clipPath = 'inset(0 ' + ((1 - this.fraction) * 100).toFixed(3) + '% 0 0)';
      this.handle.style.transform = 'translate3d(' + (this.fraction * this.width).toFixed(2) + 'px,0,0)';
      this.handle.setAttribute('aria-valuenow', String(Math.round(this.fraction * 100)));
    }
  }

  return CompareSlider;
});

;
Dixel.define('ImageReveal', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ImageReveal extends Component {
    static defaults = {
      direction: 'left',
      duration: 1,
      delay: 0,
      zoom: true,
      src: null,
      alt: ''
    };

    build() {
      return Utils.el('div', 'dx-imgreveal');
    }

    ready() {
      this.el.classList.add('dx-imgreveal', 'dx-imgreveal--' + this.options.direction);
      let media = this.el.querySelector('img, video');
      if (!media && this.options.src) {
        media = Utils.el('img', '', { src: this.options.src, alt: this.options.alt });
        this.el.insertBefore(media, this.el.firstChild);
      }
      if (media) {
        media.classList.add('dx-imgreveal-media');
        if (this.options.zoom) media.classList.add('dx-imgreveal-media--zoom');
        media.style.transitionDuration = this.options.duration * 1.4 + 's';
        media.style.transitionDelay = this.options.delay + 's';
      }
      this.panel = Utils.el('span', 'dx-imgreveal-panel', { 'aria-hidden': 'true' });
      this.panel.style.transitionDuration = this.options.duration + 's';
      this.panel.style.transitionDelay = this.options.delay + 's';
      this.el.appendChild(this.panel);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-imgreveal--in');
        return;
      }
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-imgreveal--in');
      });
    }
  }

  return ImageReveal;
});

;
Dixel.define('Lightbox', ['Component', 'Utils', 'Ticker', 'Overlays'], function (Component, Utils, Ticker, Overlays) {
  'use strict';

  class Lightbox extends Component {
    static defaults = {
      duration: 0.45,
      images: []
    };

    build() {
      return Utils.el('div', 'dx-lightbox-group');
    }

    ready() {
      this.overlay = null;
      this.source = null;
      this.closing = false;
      this.pendingStops = [];
      if (this.el.tagName !== 'IMG' && !this.el.querySelector('img') && this.options.images.length) {
        this.el.classList.add('dx-lightbox-grid');
        this.options.images.forEach((image) => {
          const data = image && typeof image === 'object' ? image : { src: image, alt: '' };
          this.el.appendChild(Utils.el('img', '', { src: data.src, alt: data.alt || '' }));
        });
      }
      const images = this.el.tagName === 'IMG' ? [this.el] : Array.from(this.el.querySelectorAll('img'));
      images.forEach((img) => {
        img.classList.add('dx-lightbox-thumb');
        img.setAttribute('tabindex', '0');
        img.setAttribute('role', 'button');
        this.listen(img, 'click', (event) => {
          event.preventDefault();
          this.open(img);
        });
        this.listen(img, 'keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.open(img);
          }
        });
      });
      this.addCleanup(() => this.teardown());
    }

    clearPending() {
      this.pendingStops.forEach((stop) => stop());
      this.pendingStops = [];
    }

    open(img) {
      if (this.overlay) return;
      this.source = img;
      this.closing = false;
      const thumbRect = img.getBoundingClientRect();
      this.overlay = Utils.el('div', 'dx-lightbox', { role: 'dialog', 'aria-modal': 'true' });
      this.backdrop = Utils.el('div', 'dx-lightbox-backdrop');
      this.clone = Utils.el('img', 'dx-lightbox-img', { src: img.currentSrc || img.src, alt: img.alt || '' });
      this.overlay.appendChild(this.backdrop);
      this.overlay.appendChild(this.clone);
      document.body.appendChild(this.overlay);
      this.unlockScroll = Overlays.lock(this);
      this.popEscape = Overlays.pushEscape(() => this.close());
      this.overlayClickStop = Utils.on(this.overlay, 'click', () => this.close());
      if (Utils.reducedMotion) {
        this.overlay.classList.add('dx-lightbox--open', 'dx-lightbox--instant');
        img.classList.add('dx-lightbox-thumb--hidden');
        return;
      }
      this.clone.style.transitionDuration = this.options.duration + 's';
      this.backdrop.style.transitionDuration = this.options.duration + 's';
      const finalRect = this.clone.getBoundingClientRect();
      this.clone.style.transform = this.flipTransform(thumbRect, finalRect);
      img.classList.add('dx-lightbox-thumb--hidden');
      const stop = Ticker.add(() => {
        stop();
        if (!this.overlay || this.closing) return;
        this.overlay.classList.add('dx-lightbox--open');
        this.clone.style.transform = 'translate3d(0,0,0) scale(1)';
      });
      this.pendingStops.push(stop);
    }

    flipTransform(fromRect, toRect) {
      const dx = fromRect.left - toRect.left;
      const dy = fromRect.top - toRect.top;
      const scale = toRect.width ? fromRect.width / toRect.width : 1;
      return 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')';
    }

    close() {
      if (!this.overlay || this.closing) return;
      this.closing = true;
      if (Utils.reducedMotion || this.options.duration <= 0) {
        this.teardown();
        return;
      }
      const thumbRect = this.source.getBoundingClientRect();
      const finalRect = this.clone.getBoundingClientRect();
      this.overlay.classList.remove('dx-lightbox--open');
      this.clone.style.transform = this.flipTransform(thumbRect, finalRect);
      const finish = () => {
        done();
        clearTimeout(fallback);
        this.teardown();
      };
      const done = Utils.on(this.clone, 'transitionend', finish);
      const fallback = setTimeout(finish, this.options.duration * 1000 + 120);
      this.pendingStops.push(() => {
        done();
        clearTimeout(fallback);
      });
    }

    teardown() {
      if (!this.overlay) return;
      this.clearPending();
      if (this.popEscape) {
        this.popEscape();
        this.popEscape = null;
      }
      if (this.unlockScroll) {
        this.unlockScroll();
        this.unlockScroll = null;
      }
      if (this.overlayClickStop) this.overlayClickStop();
      if (this.source) this.source.classList.remove('dx-lightbox-thumb--hidden');
      this.overlay.remove();
      this.overlay = null;
      this.source = null;
      this.closing = false;
    }
  }

  return Lightbox;
});

;
Dixel.define('LogoMarquee', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class LogoMarquee extends Component {
    static defaults = {
      speed: 55,
      direction: 'left',
      pauseOnHover: true,
      logos: []
    };

    build() {
      return Utils.el('div', 'dx-logos');
    }

    ready() {
      this.el.classList.add('dx-logos');
      if (!this.el.children.length && this.options.logos.length) {
        this.options.logos.forEach((logo) => {
          if (logo && typeof logo === 'object' && logo.src) {
            const item = Utils.el('div');
            item.appendChild(Utils.el('img', '', { src: logo.src, alt: logo.alt || '' }));
            this.el.appendChild(item);
          } else {
            this.el.appendChild(Utils.el('span', 'dx-logos-text', { text: String(logo) }));
          }
        });
      }
      this.track = Utils.el('div', 'dx-logos-track');
      this.group = Utils.el('div', 'dx-logos-group');
      Array.from(this.el.children).forEach((item) => {
        item.classList.add('dx-logos-item');
        this.group.appendChild(item);
      });
      this.track.appendChild(this.group);
      this.el.appendChild(this.track);
      this.offset = 0;
      this.groupWidth = 0;
      this.paused = false;
      this.stopFrames = null;
      this.measureQueued = false;
      this.rebuild();
      if (Utils.reducedMotion) return;
      this.listen(window, 'resize', () => this.queueRebuild());
      this.listen(window, 'load', () => this.queueRebuild());
      if (this.options.pauseOnHover && !Utils.isTouch) {
        this.listen(this.el, 'pointerenter', () => {
          this.paused = true;
        });
        this.listen(this.el, 'pointerleave', () => {
          this.paused = false;
        });
      }
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible) this.run();
        else this.halt();
      });
    }

    queueRebuild() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      if (!this.stopRebuildRegistered) {
        this.stopRebuildRegistered = true;
        this.addCleanup(() => {
          if (this.stopRebuild) this.stopRebuild();
        });
      }
      this.stopRebuild = Ticker.add(() => {
        this.stopRebuild();
        this.stopRebuild = null;
        this.measureQueued = false;
        this.rebuild();
      });
    }

    rebuild() {
      Array.from(this.track.children).forEach((child) => {
        if (child !== this.group) child.remove();
      });
      const containerWidth = this.el.clientWidth;
      this.groupWidth = this.group.getBoundingClientRect().width;
      if (!this.groupWidth) return;
      const copies = Math.max(Math.ceil(containerWidth / this.groupWidth) + 1, 2);
      for (let i = 1; i < copies; i++) {
        const clone = this.group.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        this.track.appendChild(clone);
      }
      this.paint();
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add((time, delta) => {
        if (this.paused || !this.groupWidth) return;
        const step = this.options.speed * delta;
        this.offset += this.options.direction === 'right' ? step : -step;
        this.offset %= this.groupWidth;
        this.paint();
      });
    }

    paint() {
      const x = this.offset > 0 ? this.offset - this.groupWidth : this.offset;
      this.track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return LogoMarquee;
});

;
Dixel.define('ParallaxImage', ['Component', 'Utils', 'ScrollWatch'], function (Component, Utils, ScrollWatch) {
  'use strict';

  class ParallaxImage extends Component {
    static defaults = {
      range: 40,
      src: null,
      alt: ''
    };

    build() {
      return Utils.el('div', 'dx-parallax');
    }

    ready() {
      this.el.classList.add('dx-parallax');
      this.media = this.el.querySelector('img, video');
      if (!this.media && this.options.src) {
        this.media = Utils.el('img', '', { src: this.options.src, alt: this.options.alt });
        this.el.appendChild(this.media);
      }
      if (!this.media) return;
      this.media.classList.add('dx-parallax-media');
      if (Utils.reducedMotion) {
        this.media.style.height = '100%';
        this.media.style.top = '0';
        return;
      }
      const range = this.options.range;
      this.media.style.height = 'calc(100% + ' + range * 2 + 'px)';
      this.media.style.top = -range + 'px';
      this.addCleanup(ScrollWatch.watch(this.el, {
        progress: (progress) => {
          const y = (0.5 - progress) * 2 * range;
          this.media.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
        }
      }));
    }
  }

  return ParallaxImage;
});

;
Dixel.define('Breadcrumb', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  const separator = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  class Breadcrumb extends Component {
    static defaults = {
      items: []
    };

    build() {
      const el = Utils.el('nav', 'dx-breadcrumb', { 'aria-label': 'Ruta de navegación' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const last = this.options.items.length - 1;
      const items = this.options.items
        .map((item, index) => {
          const content = index === last || !item.href
            ? '<span class="dx-breadcrumb-current" aria-current="page">' + Utils.escape(item.label) + '</span>'
            : '<a class="dx-breadcrumb-link" href="' + Utils.escape(item.href) + '">' + Utils.escape(item.label) + '</a>';
          const divider = index < last ? '<span class="dx-breadcrumb-sep" aria-hidden="true">' + separator + '</span>' : '';
          return '<li>' + content + divider + '</li>';
        })
        .join('');
      return '<ol class="dx-breadcrumb-list">' + items + '</ol>';
    }

    ready() {
      this.el.classList.add('dx-breadcrumb');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', 'Ruta de navegación');
      if (!this.el.querySelector('.dx-breadcrumb-list') && this.options.items.length) {
        this.el.innerHTML = this.markup();
      }
    }
  }

  return Breadcrumb;
});

;
Dixel.define('CommandBar', ['Component', 'Motion', 'Utils', 'Overlays'], function (Component, Motion, Utils, Overlays) {
  'use strict';

  const searchIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';

  class CommandBar extends Component {
    static defaults = {
      commands: [],
      placeholder: 'Escribe un comando…',
      emptyText: 'Sin resultados',
      hotkey: true
    };

    build() {
      const el = Utils.el('div', 'dx-cmdbar', { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      this.listId = Utils.uid();
      return '<div class="dx-cmdbar-overlay"></div>' +
        '<div class="dx-cmdbar-panel" role="dialog" aria-modal="true" aria-label="Barra de comandos">' +
        '<header class="dx-cmdbar-head">' + searchIcon +
        '<input class="dx-cmdbar-input" type="text" placeholder="' + Utils.escape(this.options.placeholder) +
        '" aria-label="Buscar comandos" role="combobox" aria-expanded="true" aria-controls="' + this.listId + '" aria-autocomplete="list">' +
        '<kbd class="dx-cmdbar-kbd">Esc</kbd>' +
        '</header>' +
        '<ul class="dx-cmdbar-list dx-scroll-thin" id="' + this.listId + '" role="listbox" aria-label="Comandos"></ul>' +
        '<footer class="dx-cmdbar-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> ejecutar</span></footer>' +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-cmdbar');
      if (!this.el.querySelector('.dx-cmdbar-panel')) this.el.innerHTML = this.markup();
      this.el.setAttribute('aria-hidden', 'true');
      this.panel = this.el.querySelector('.dx-cmdbar-panel');
      this.overlay = this.el.querySelector('.dx-cmdbar-overlay');
      this.input = this.el.querySelector('.dx-cmdbar-input');
      this.list = this.el.querySelector('.dx-cmdbar-list');
      this.filtered = [];
      this.activeIndex = 0;
      this.isOpen = false;
      this.lastFocus = null;
      this.previousOverflow = '';
      this.listen(this.overlay, 'click', this.close);
      this.listen(this.input, 'input', () => this.renderList(this.input.value));
      this.listen(this.input, 'keydown', this.onKeydown);
      this.listen(this.list, 'click', (event) => {
        const option = event.target.closest('[data-index]');
        if (option) this.run(Number(option.getAttribute('data-index')));
      });
      this.listen(this.list, 'pointerover', (event) => {
        const option = event.target.closest('[data-index]');
        if (option) this.setActive(Number(option.getAttribute('data-index')), true);
      });
      if (this.options.hotkey) {
        this.listen(window, 'keydown', (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            this.toggle();
          }
        });
      }
      this.addCleanup(() => this.unlockScroll());
    }

    onKeydown(event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.setActive(this.activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.setActive(this.activeIndex - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.run(this.activeIndex);
      }
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.releaseScroll = Overlays.lock(this);
      this.popEscape = Overlays.pushEscape(() => this.close());
      this.input.value = '';
      this.renderList('');
      Motion.fromTo(this.panel, { scale: 0.94, y: 12, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.32, ease: 'outQuart' });
      const options = Array.from(this.list.children).slice(0, 8);
      if (options.length) Motion.fromTo(options, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'outQuart', stagger: 0.03 });
      this.input.focus();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.unlockScroll();
      Motion.to(this.panel, {
        scale: 0.96,
        y: 8,
        opacity: 0,
        duration: 0.16,
        ease: 'in',
        onComplete: () => {
          if (this.isOpen || !this.el) return;
          this.el.classList.remove('is-open');
          this.el.setAttribute('aria-hidden', 'true');
        }
      });
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    unlockScroll() {
      if (this.popEscape) {
        this.popEscape();
        this.popEscape = null;
      }
      if (this.releaseScroll) {
        this.releaseScroll();
        this.releaseScroll = null;
      }
    }

    renderList(query) {
      const normalized = query.trim().toLowerCase();
      this.filtered = this.options.commands.filter((command) => {
        if (!normalized) return true;
        return (command.label + ' ' + (command.keywords || '')).toLowerCase().includes(normalized);
      });
      if (!this.filtered.length) {
        this.list.innerHTML = '<li class="dx-cmdbar-empty">' + Utils.escape(this.options.emptyText) + '</li>';
        this.input.removeAttribute('aria-activedescendant');
        return;
      }
      this.list.innerHTML = this.filtered
        .map((command, index) => {
          const icon = command.icon ? '<span class="dx-cmdbar-icon" aria-hidden="true">' + command.icon + '</span>' : '';
          const hint = command.hint ? '<kbd class="dx-cmdbar-hint">' + Utils.escape(command.hint) + '</kbd>' : '';
          return '<li class="dx-cmdbar-option" role="option" aria-selected="false" id="' + this.listId + '-' + index +
            '" data-index="' + index + '">' + icon + '<span class="dx-cmdbar-label">' + Utils.escape(command.label) + '</span>' + hint + '</li>';
        })
        .join('');
      this.setActive(0, true);
    }

    setActive(index, skipScroll) {
      if (!this.filtered.length) return;
      this.activeIndex = Utils.clamp(index, 0, this.filtered.length - 1);
      Array.from(this.list.children).forEach((option, i) => {
        const active = i === this.activeIndex;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this.input.setAttribute('aria-activedescendant', this.listId + '-' + this.activeIndex);
      const activeOption = this.list.children[this.activeIndex];
      if (activeOption && !skipScroll) activeOption.scrollIntoView({ block: 'nearest' });
    }

    run(index) {
      const command = this.filtered[index];
      if (!command) return;
      this.close();
      if (command.onSelect) command.onSelect(command);
    }
  }

  return CommandBar;
});

;
Dixel.define('ContextMenu', ['Component', 'Utils', 'Motion', 'IconSet'], function (Component, Utils, Motion, IconSet) {
  'use strict';

  class ContextMenu extends Component {
    static defaults = {
      items: [],
      longPress: 450,
      onSelect: null
    };

    ready() {
      this.scope = this.el;
      this.menus = [];
      this.listen(this.scope, 'contextmenu', (event) => {
        event.preventDefault();
        this.openAt(event.clientX, event.clientY);
      });
      if (Utils.isTouch) this.bindLongPress();
      this.outsideHandler = (event) => {
        if (!this.menus.length) return;
        if (this.menus.some((menu) => menu.contains(event.target))) return;
        this.closeAll();
      };
      this.keyHandler = (event) => {
        if (event.key === 'Escape') this.closeAll();
      };
      this.addCleanup(Utils.on(document, 'pointerdown', this.outsideHandler));
      this.addCleanup(Utils.on(document, 'keydown', this.keyHandler));
      this.addCleanup(() => this.closeAll());
    }

    bindLongPress() {
      let timer = null;
      this.listen(this.scope, 'touchstart', (event) => {
        const touch = event.touches[0];
        timer = setTimeout(() => this.openAt(touch.clientX, touch.clientY), this.options.longPress);
      }, { passive: true });
      const cancel = () => clearTimeout(timer);
      this.listen(this.scope, 'touchend', cancel, { passive: true });
      this.listen(this.scope, 'touchmove', cancel, { passive: true });
    }

    iconMarkup(name) {
      if (!name || !IconSet[name]) return '';
      return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IconSet[name] + '</svg>';
    }

    buildMenu(items, depth) {
      const menu = Utils.el('div', 'dx-ctx');
      menu.setAttribute('role', 'menu');
      items.forEach((item) => {
        if (item.divider) {
          menu.appendChild(Utils.el('span', 'dx-ctx-divider'));
          return;
        }
        const row = Utils.el('button', 'dx-ctx-item' + (item.danger ? ' dx-ctx-item--danger' : '') + (item.disabled ? ' is-disabled' : ''), { type: 'button', role: 'menuitem' });
        row.innerHTML =
          this.iconMarkup(item.icon) +
          '<span class="dx-ctx-label">' + Utils.escape(item.label) + '</span>' +
          (item.hint ? '<kbd class="dx-ctx-hint">' + Utils.escape(item.hint) + '</kbd>' : '') +
          (item.children ? '<span class="dx-ctx-arrow">›</span>' : '');
        if (item.disabled) {
          row.disabled = true;
          row.setAttribute('aria-disabled', 'true');
        }
        if (!item.disabled) {
          if (item.children) {
            row.addEventListener('pointerenter', () => {
              this.closeFrom(depth + 1);
              const rect = row.getBoundingClientRect();
              this.spawn(this.buildMenu(item.children, depth + 1), rect.right - 4, rect.top - 6, depth + 1);
            });
          } else {
            row.addEventListener('pointerenter', () => this.closeFrom(depth + 1));
            row.addEventListener('click', () => {
              if (item.onClick) item.onClick(item, this);
              if (item.onSelect) item.onSelect(item, this);
              if (this.options.onSelect) this.options.onSelect(item, this);
              this.closeAll();
            });
          }
        }
        menu.appendChild(row);
      });
      return menu;
    }

    openAt(x, y) {
      this.closeAll();
      this.spawn(this.buildMenu(this.options.items, 0), x, y, 0);
    }

    spawn(menu, x, y, depth) {
      document.body.appendChild(menu);
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const left = Utils.clamp(x + width > innerWidth - 8 ? x - width : x, 8, innerWidth - width - 8);
      const top = Utils.clamp(y + height > innerHeight - 8 ? y - height : y, 8, innerHeight - height - 8);
      menu.style.left = Math.round(left) + 'px';
      menu.style.top = Math.round(top) + 'px';
      this.menus[depth] = menu;
      this.menus.length = depth + 1;
      Motion.fromTo(menu, { opacity: 0, scale: 0.92, y: -6 }, { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'outBack' });
      const first = menu.querySelector('.dx-ctx-item:not(.is-disabled)');
      if (first) first.focus();
    }

    closeFrom(depth) {
      for (let i = this.menus.length - 1; i >= depth; i--) {
        if (this.menus[i]) this.menus[i].remove();
      }
      this.menus.length = depth;
    }

    closeAll() {
      this.closeFrom(0);
    }
  }

  return ContextMenu;
});

;
Dixel.define('Dock', ['Component', 'Pointer', 'Ticker', 'Motion', 'Utils', 'IconSet'], function (Component, Pointer, Ticker, Motion, Utils, IconSet) {
  'use strict';

  const ANIMATIONS = ['wave', 'scale', 'lift', 'bounce'];

  function iconMarkup(icon) {
    if (icon && IconSet[icon]) {
      return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + IconSet[icon] + '</svg>';
    }
    return icon || '';
  }

  class Dock extends Component {
    static defaults = {
      items: [],
      magnify: 1.6,
      range: 120,
      lift: 12,
      animation: 'wave'
    };

    build() {
      const el = Utils.el('nav', 'dx-dock', { 'aria-label': 'Dock' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-dock-rail" aria-hidden="true"></span>' + this.options.items
        .map((item) => {
          const tag = item.href ? 'a' : 'button';
          const attrs = item.href ? ' href="' + Utils.escape(item.href) + '"' : ' type="button"';
          const label = Utils.escape(item.label || '');
          return '<' + tag + attrs + ' class="dx-dock-item dx-focusable" aria-label="' + label + '">' +
            '<span class="dx-dock-icon" aria-hidden="true">' + iconMarkup(item.icon) + '</span>' +
            '<span class="dx-dock-tip" aria-hidden="true">' + label + '</span>' +
            '</' + tag + '>';
        })
        .join('');
    }

    ready() {
      this.el.classList.add('dx-dock');
      if (!this.el.querySelector('.dx-dock-item') && this.options.items.length) this.el.innerHTML = this.markup();
      if (!this.el.querySelector('.dx-dock-rail')) {
        this.el.insertBefore(Utils.el('span', 'dx-dock-rail', { 'aria-hidden': 'true' }), this.el.firstChild);
      }
      this.animation = ANIMATIONS.indexOf(this.options.animation) === -1 ? 'wave' : this.options.animation;
      this.items = Array.from(this.el.querySelectorAll('.dx-dock-item'));
      this.scales = this.items.map(() => 1);
      this.lifts = this.items.map(() => 0);
      this.centers = null;
      this.hovering = false;
      this.hoveredIndex = -1;
      this.stopFrame = null;
      this.releasePointer = null;
      this.listen(this.el, 'click', (event) => {
        const item = event.target.closest('.dx-dock-item');
        if (!item) return;
        const config = this.options.items[this.items.indexOf(item)];
        if (config && config.onClick) config.onClick(event, config);
      });
      if (Utils.isTouch || Utils.reducedMotion) return;
      if (this.animation === 'bounce') {
        this.bindBounce();
        return;
      }
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      if (this.animation === 'scale') {
        this.listen(this.el, 'pointerover', (event) => {
          const item = event.target.closest('.dx-dock-item');
          this.hoveredIndex = item ? this.items.indexOf(item) : -1;
        });
        this.listen(this.el, 'pointerout', (event) => {
          if (event.target.closest('.dx-dock-item')) this.hoveredIndex = -1;
        });
      }
      this.addCleanup(() => this.stopLoop());
    }

    bindBounce() {
      this.items.forEach((item) => {
        this.listen(item, 'pointerenter', () => {
          Motion.to(item, { scale: this.options.magnify, y: -this.options.lift * 0.4, duration: 0.6, ease: 'outElastic' });
        });
        this.listen(item, 'pointerleave', () => {
          Motion.to(item, { scale: 1, y: 0, duration: 0.28, ease: 'out' });
        });
      });
      this.addCleanup(() => Motion.kill(this.items));
    }

    enter() {
      this.centers = this.items.map((item) => {
        const rect = item.getBoundingClientRect();
        return rect.left + rect.width / 2;
      });
      this.hovering = true;
      this.startLoop();
    }

    leave() {
      this.hovering = false;
      this.hoveredIndex = -1;
    }

    startLoop() {
      if (this.stopFrame) return;
      this.releasePointer = Pointer.use();
      this.stopFrame = Ticker.add((time, delta) => this.step(delta));
    }

    stopLoop() {
      if (this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
      if (this.releasePointer) {
        this.releasePointer();
        this.releasePointer = null;
      }
    }

    targets(index, spread) {
      if (!this.hovering || !this.centers) return { scale: 1, y: 0 };
      if (this.animation === 'scale') {
        return index === this.hoveredIndex ? { scale: this.options.magnify, y: 0 } : { scale: 1, y: 0 };
      }
      const distance = Math.abs(Pointer.smoothX - this.centers[index]);
      const influence = Math.max(0, 1 - distance / this.options.range);
      const eased = influence * influence;
      if (this.animation === 'lift') return { scale: 1, y: -this.options.lift * eased };
      const scale = 1 + spread * eased;
      return { scale, y: -((scale - 1) / spread) * this.options.lift };
    }

    step(delta) {
      const spread = Math.max(this.options.magnify - 1, 0.001);
      let active = false;
      for (let i = 0; i < this.items.length; i++) {
        const target = this.targets(i, spread);
        this.scales[i] = Utils.damp(this.scales[i], target.scale, 16, delta);
        this.lifts[i] = Utils.damp(this.lifts[i], target.y, 16, delta);
        this.items[i].style.transform = 'translateY(' + this.lifts[i].toFixed(2) + 'px) scale(' + this.scales[i].toFixed(4) + ')';
        if (Math.abs(this.scales[i] - 1) > 0.002 || Math.abs(this.lifts[i]) > 0.1) active = true;
      }
      if (!this.hovering && !active) {
        this.items.forEach((item) => {
          item.style.transform = '';
        });
        this.stopLoop();
      }
    }
  }

  return Dock;
});

;
Dixel.define('Drawer', ['Component', 'Utils', 'Overlays'], function (Component, Utils, Overlays) {
  'use strict';

  const closeIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class Drawer extends Component {
    static defaults = {
      side: 'right',
      title: '',
      content: '',
      width: null
    };

    build() {
      const el = Utils.el('div', 'dx-drawer dx-drawer--' + this.options.side, { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const content = typeof this.options.content === 'string' ? this.options.content : '';
      return '<div class="dx-drawer-overlay"></div>' +
        '<aside class="dx-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
        '<header class="dx-drawer-head">' +
        '<h2 class="dx-drawer-title" id="' + id + '">' + Utils.escape(this.options.title) + '</h2>' +
        '<button class="dx-drawer-close dx-focusable" type="button" aria-label="Cerrar panel">' + closeIcon + '</button>' +
        '</header>' +
        '<div class="dx-drawer-body dx-scroll-thin">' + content + '</div>' +
        '</aside>';
    }

    ready() {
      this.el.classList.add('dx-drawer', 'dx-drawer--' + this.options.side);
      if (!this.el.querySelector('.dx-drawer-panel')) this.el.innerHTML = this.markup();
      this.el.setAttribute('aria-hidden', 'true');
      this.panel = this.el.querySelector('.dx-drawer-panel');
      this.overlay = this.el.querySelector('.dx-drawer-overlay');
      this.closeButton = this.el.querySelector('.dx-drawer-close');
      this.slot = this.el.querySelector('.dx-drawer-body');
      if (this.options.content && typeof this.options.content !== 'string') {
        Component.applyContent(this.options.content, this.slot, this);
      }
      if (this.options.width) this.panel.style.setProperty('--dx-drawer-w', this.options.width + 'px');
      this.isOpen = false;
      this.lastFocus = null;
      this.unbindKeys = null;
      this.previousOverflow = '';
      this.listen(this.overlay, 'click', this.close);
      this.listen(this.closeButton, 'click', this.close);
      this.addCleanup(() => this.releaseGlobal());
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.unlockScroll = Overlays.lock(this);
      this.popEscape = Overlays.pushEscape(() => this.close());
      this.unbindKeys = Utils.on(document, 'keydown', (event) => {
        if (event.key === 'Tab') this.trapFocus(event);
      });
      this.closeButton.focus();
    }

    trapFocus(event) {
      const focusables = Array.from(this.panel.querySelectorAll(focusableSelector));
      if (!focusables.length) {
        event.preventDefault();
        this.closeButton.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      this.releaseGlobal();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    releaseGlobal() {
      if (this.unbindKeys) {
        this.unbindKeys();
        this.unbindKeys = null;
      }
      if (this.popEscape) {
        this.popEscape();
        this.popEscape = null;
      }
      if (this.unlockScroll) {
        this.unlockScroll();
        this.unlockScroll = null;
      }
    }
  }

  return Drawer;
});

;
Dixel.define('DropdownMenu', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const chevronDown = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const chevronRight = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  class DropdownMenu extends Component {
    static defaults = {
      label: 'Opciones',
      items: [],
      align: 'left',
      hoverOpenDelay: 0.08,
      hoverCloseDelay: 0.3
    };

    build() {
      const el = Utils.el('div', 'dx-dropdown dx-dropdown--' + this.options.align);
      el.innerHTML = this.markup();
      return el;
    }

    itemsMarkup(items, path) {
      return items
        .map((item, index) => {
          if (item.divider) return '<span class="dx-dropdown-divider" role="separator"></span>';
          const key = path ? path + '.' + index : String(index);
          const icon = item.icon ? '<span class="dx-dropdown-icon" aria-hidden="true">' + item.icon + '</span>' : '';
          const nested = !!(item.children && item.children.length);
          const caret = nested ? '<span class="dx-dropdown-caret" aria-hidden="true">' + chevronRight + '</span>' : '';
          const flags = (item.danger ? ' is-danger' : '') + (nested ? ' dx-dropdown-item--parent' : '');
          const expand = nested ? ' aria-haspopup="menu" aria-expanded="false"' : '';
          return '<button class="dx-dropdown-item' + flags + '" type="button" role="menuitem" tabindex="-1" data-path="' + key + '"' + expand + '>' +
            icon + '<span class="dx-dropdown-item-label">' + Utils.escape(item.label) + '</span>' + caret + '</button>';
        })
        .join('');
    }

    markup() {
      const id = Utils.uid();
      return '<button class="dx-dropdown-trigger dx-focusable" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="' + id + '">' +
        '<span>' + Utils.escape(this.options.label) + '</span>' + chevronDown + '</button>' +
        '<div class="dx-dropdown-menu dx-scroll-thin" id="' + id + '" role="menu">' + this.itemsMarkup(this.options.items, '') + '</div>';
    }

    ready() {
      this.el.classList.add('dx-dropdown', 'dx-dropdown--' + this.options.align);
      if (!this.el.querySelector('.dx-dropdown-menu')) this.el.innerHTML = this.markup();
      this.trigger = this.el.querySelector('.dx-dropdown-trigger');
      this.menu = this.el.querySelector('.dx-dropdown-menu');
      this.menu.classList.toggle('dx-dropdown-menu--right', this.options.align === 'right');
      this.isOpen = false;
      this.chain = [];
      this.hoverTimer = null;
      this.globalCleanups = [];
      this.rootCleanups = this.bindMenu(this.menu, 0);
      this.listen(this.trigger, 'click', this.toggle);
      this.listen(this.el, 'keydown', (event) => this.onKeydown(event, this.menu, 0));
      this.addCleanup(() => {
        this.clearHoverTimer();
        this.trimTo(0);
        this.releaseGlobal();
        this.rootCleanups.forEach((cleanup) => cleanup());
        if (this.menu && this.menu.parentNode === document.body) this.menu.remove();
      });
    }

    resolve(path) {
      let list = this.options.items;
      let item = null;
      path.split('.').forEach((part) => {
        item = list ? list[Number(part)] : null;
        list = item ? item.children : null;
      });
      return item;
    }

    bindMenu(menu, depth) {
      const cleanups = [];
      cleanups.push(Utils.on(menu, 'click', (event) => {
        const item = event.target.closest('.dx-dropdown-item');
        if (!item) return;
        if (item.hasAttribute('aria-haspopup')) {
          if (item.getAttribute('aria-expanded') === 'true') this.trimTo(depth);
          else this.openSubmenu(item, depth, false);
          return;
        }
        const config = this.resolve(item.getAttribute('data-path'));
        this.closeAll();
        this.trigger.focus();
        if (config && config.onSelect) config.onSelect(config);
      }));
      cleanups.push(Utils.on(menu, 'pointerenter', () => this.clearHoverTimer()));
      cleanups.push(Utils.on(menu, 'pointerover', (event) => {
        if (Utils.isTouch) return;
        const item = event.target.closest('.dx-dropdown-item');
        if (!item) return;
        this.clearHoverTimer();
        if (item.hasAttribute('aria-haspopup')) {
          if (item.getAttribute('aria-expanded') === 'true') return;
          this.hoverTimer = setTimeout(() => this.openSubmenu(item, depth, false), this.options.hoverOpenDelay * 1000);
        } else if (this.chain.length > depth) {
          this.hoverTimer = setTimeout(() => this.trimTo(depth), this.options.hoverCloseDelay * 1000);
        }
      }));
      cleanups.push(Utils.on(menu, 'keydown', (event) => this.onKeydown(event, menu, depth)));
      return cleanups;
    }

    onKeydown(event, menu, depth) {
      if (event.key === 'Escape' && this.isOpen) {
        this.closeAll();
        this.trigger.focus();
        return;
      }
      if (event.key === 'ArrowRight') {
        const item = document.activeElement;
        if (item && menu.contains(item) && item.hasAttribute('aria-haspopup')) {
          event.preventDefault();
          this.openSubmenu(item, depth, true);
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        if (depth < 1) return;
        event.preventDefault();
        const entry = this.chain[depth - 1];
        const parentItem = entry ? entry.parentItem : null;
        this.trimTo(depth - 1);
        if (parentItem) parentItem.focus();
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      if (!this.isOpen) {
        this.open();
        return;
      }
      const items = Array.from(menu.querySelectorAll('.dx-dropdown-item'));
      const focused = items.indexOf(document.activeElement);
      const next = focused === -1
        ? (direction === 1 ? 0 : items.length - 1)
        : (focused + direction + items.length) % items.length;
      if (items[next]) items[next].focus();
    }

    openSubmenu(item, depth, focusFirst) {
      this.clearHoverTimer();
      this.trimTo(depth);
      const config = this.resolve(item.getAttribute('data-path'));
      if (!config || !config.children || !config.children.length) return;
      const menu = Utils.el('div', 'dx-dropdown-menu dx-dropdown-submenu dx-scroll-thin', { role: 'menu' });
      menu.innerHTML = this.itemsMarkup(config.children, item.getAttribute('data-path'));
      const cleanups = this.bindMenu(menu, depth + 1);
      document.body.appendChild(menu);
      menu.classList.add('is-open');
      item.setAttribute('aria-expanded', 'true');
      item.classList.add('is-active');
      this.chain.push({ menu, parentItem: item, cleanups });
      const flipped = this.placeSubmenu(menu, item);
      Motion.fromTo(menu, { scale: 0.95, x: flipped ? 6 : -6, opacity: 0 }, { scale: 1, x: 0, opacity: 1, duration: 0.24, ease: 'outQuart' });
      if (focusFirst) {
        const first = menu.querySelector('.dx-dropdown-item');
        if (first) first.focus();
      }
    }

    placeSubmenu(menu, item) {
      const rect = item.getBoundingClientRect();
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      let left = rect.right + 6;
      const flipped = left + menuWidth > innerWidth - 8;
      if (flipped) left = Math.max(8, rect.left - menuWidth - 6);
      menu.classList.toggle('is-flip', flipped);
      const top = Utils.clamp(rect.top - 6, 8, Math.max(8, innerHeight - menuHeight - 8));
      menu.style.left = Math.round(left) + 'px';
      menu.style.top = Math.round(top) + 'px';
      return flipped;
    }

    trimTo(depth) {
      while (this.chain.length > depth) {
        const entry = this.chain.pop();
        entry.cleanups.forEach((cleanup) => cleanup());
        entry.parentItem.setAttribute('aria-expanded', 'false');
        entry.parentItem.classList.remove('is-active');
        const menu = entry.menu;
        Motion.to(menu, { opacity: 0, scale: 0.96, duration: 0.12, ease: 'in', onComplete: () => menu.remove() });
      }
    }

    clearHoverTimer() {
      if (this.hoverTimer) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
      }
    }

    toggle() {
      if (this.isOpen) this.closeAll();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.el.classList.add('is-open');
      this.menu.classList.add('is-open');
      this.trigger.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.menu);
      this.place();
      Motion.fromTo(this.menu, { scale: 0.92, y: -6, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.3, ease: 'outBack' });
      const items = Array.from(this.menu.querySelectorAll('.dx-dropdown-item'));
      if (items.length) {
        Motion.fromTo(items, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: 'outQuart', stagger: 0.035 });
        items[0].focus();
      }
      this.globalCleanups.push(Utils.on(document, 'pointerdown', (event) => {
        const target = event.target;
        const inside = this.el.contains(target) || this.menu.contains(target) ||
          this.chain.some((entry) => entry.menu.contains(target));
        if (!inside) this.closeAll();
      }));
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.reflow(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.reflow(), { passive: true }));
    }

    reflow() {
      this.trimTo(0);
      this.place();
    }

    closeAll() {
      this.clearHoverTimer();
      this.trimTo(0);
      this.close();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.trigger.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      Motion.to(this.menu, {
        scale: 0.95,
        y: -4,
        opacity: 0,
        duration: 0.16,
        ease: 'in',
        onComplete: () => {
          if (!this.isOpen) this.retractMenu();
        }
      });
    }

    retractMenu() {
      if (!this.el || !this.menu) return;
      this.el.classList.remove('is-open');
      this.menu.classList.remove('is-open', 'is-up');
      this.menu.style.left = '';
      this.menu.style.top = '';
      this.menu.style.minWidth = '';
      this.el.appendChild(this.menu);
    }

    place() {
      if (!this.isOpen) return;
      const rect = this.trigger.getBoundingClientRect();
      this.menu.style.minWidth = Math.round(Math.max(rect.width, 200)) + 'px';
      const menuWidth = this.menu.offsetWidth;
      const menuHeight = this.menu.offsetHeight;
      const spaceBelow = innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight + 16 && rect.top > spaceBelow;
      this.menu.classList.toggle('is-up', openUp);
      let left = this.options.align === 'right' ? rect.right - menuWidth : rect.left;
      left = Utils.clamp(left, 8, Math.max(8, innerWidth - menuWidth - 8));
      const top = openUp ? rect.top - menuHeight - 8 : rect.bottom + 8;
      this.menu.style.left = Math.round(left) + 'px';
      this.menu.style.top = Math.round(top) + 'px';
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }
  }

  return DropdownMenu;
});

;
Dixel.define('Navbar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Navbar extends Component {
    static defaults = {
      brand: 'DIXEL',
      href: '#',
      links: [],
      actions: '',
      hideOnScroll: true,
      glassAt: 24
    };

    build() {
      const el = Utils.el('header', 'dx-navbar');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const links = this.options.links
        .map((link) => '<a class="dx-navbar-link" href="' + Utils.escape(link.href) + '">' + Utils.escape(link.label) + '</a>')
        .join('');
      return '<div class="dx-navbar-inner">' +
        '<a class="dx-navbar-brand" href="' + Utils.escape(this.options.href) + '">' + Utils.escape(this.options.brand) + '</a>' +
        '<nav class="dx-navbar-links" aria-label="Principal">' + links + '</nav>' +
        '<div class="dx-navbar-actions">' + this.options.actions + '</div>' +
        '<button class="dx-navbar-burger dx-focusable" type="button" aria-label="Abrir menú" aria-expanded="false"><span></span><span></span></button>' +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-navbar');
      if (!this.el.querySelector('.dx-navbar-inner')) this.el.innerHTML = this.markup();
      this.burger = this.el.querySelector('.dx-navbar-burger');
      this.menuOpen = false;
      this.hidden = false;
      this.glass = false;
      this.lastY = window.scrollY;
      if (this.burger) this.listen(this.burger, 'click', this.toggleMenu);
      this.listen(this.el, 'click', (event) => {
        if (this.menuOpen && event.target.closest('.dx-navbar-link')) this.setMenu(false);
      });
      this.listen(window, 'scroll', this.onScroll, { passive: true });
      this.onScroll();
    }

    onScroll() {
      const y = window.scrollY;
      const glass = y > this.options.glassAt;
      if (glass !== this.glass) {
        this.glass = glass;
        this.el.classList.toggle('is-glass', glass);
      }
      if (this.options.hideOnScroll && !this.menuOpen) {
        if (y > this.lastY + 6 && y > 90) this.setHidden(true);
        else if (y < this.lastY - 6 || y <= 90) this.setHidden(false);
      }
      this.lastY = y;
    }

    setHidden(hidden) {
      if (hidden === this.hidden) return;
      this.hidden = hidden;
      this.el.classList.toggle('is-hidden', hidden);
    }

    toggleMenu() {
      this.setMenu(!this.menuOpen);
    }

    setMenu(open) {
      this.menuOpen = open;
      this.el.classList.toggle('is-open', open);
      if (this.burger) {
        this.burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      }
      if (open) this.setHidden(false);
    }
  }

  return Navbar;
});

;
Dixel.define('Pagination', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const arrow = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  class Pagination extends Component {
    static defaults = {
      total: 10,
      page: 1,
      siblings: 1,
      onChange: null
    };

    build() {
      return Utils.el('nav', 'dx-pagination', { 'aria-label': 'Paginación' });
    }

    ready() {
      this.el.classList.add('dx-pagination');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', 'Paginación');
      this.page = Utils.clamp(this.options.page, 1, this.options.total);
      this.listen(this.el, 'click', (event) => {
        const button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        this.setPage(Number(button.getAttribute('data-page')));
      });
      this.render();
    }

    visiblePages() {
      const total = this.options.total;
      const start = Math.max(2, this.page - this.options.siblings);
      const end = Math.min(total - 1, this.page + this.options.siblings);
      const pages = [1];
      if (start > 2) pages.push(null);
      for (let page = start; page <= end; page++) pages.push(page);
      if (end < total - 1) pages.push(null);
      if (total > 1) pages.push(total);
      return pages;
    }

    render() {
      const total = this.options.total;
      const numbers = this.visiblePages()
        .map((page) => {
          if (page === null) return '<span class="dx-pagination-gap" aria-hidden="true">…</span>';
          const active = page === this.page;
          return '<button class="dx-pagination-page dx-focusable' + (active ? ' is-active' : '') +
            '" type="button" data-page="' + page + '"' + (active ? ' aria-current="page"' : '') +
            ' aria-label="Página ' + page + '">' + page + '</button>';
        })
        .join('');
      this.el.innerHTML =
        '<button class="dx-pagination-nav dx-pagination-prev dx-focusable" type="button" data-page="' + (this.page - 1) +
        '" aria-label="Página anterior"' + (this.page === 1 ? ' disabled' : '') + '>' + arrow + '</button>' +
        numbers +
        '<button class="dx-pagination-nav dx-pagination-next dx-focusable" type="button" data-page="' + (this.page + 1) +
        '" aria-label="Página siguiente"' + (this.page === total ? ' disabled' : '') + '>' + arrow + '</button>';
    }

    setPage(page) {
      const next = Utils.clamp(page, 1, this.options.total);
      if (next === this.page) return;
      this.page = next;
      this.render();
      const active = this.el.querySelector('.is-active');
      if (active) Motion.fromTo(active, { scale: 0.6 }, { scale: 1, duration: 0.4, ease: 'outBack' });
      if (this.options.onChange) this.options.onChange(next);
    }
  }

  return Pagination;
});

;
Dixel.define('ScrollSpyDots', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ScrollSpyDots extends Component {
    static defaults = {
      sections: 'section[id]',
      offset: 0.35
    };

    build() {
      return Utils.el('nav', 'dx-spydots', { 'aria-label': 'Secciones' });
    }

    ready() {
      this.el.classList.add('dx-spydots');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', 'Secciones');
      this.sections = Array.from(document.querySelectorAll(this.options.sections));
      this.tops = [];
      this.active = -1;
      if (!this.el.children.length) this.render();
      this.dots = Array.from(this.el.querySelectorAll('.dx-spydots-dot'));
      this.listen(this.el, 'click', (event) => {
        const dot = event.target.closest('.dx-spydots-dot');
        if (!dot) return;
        this.scrollToSection(Number(dot.getAttribute('data-index')));
      });
      this.listen(window, 'scroll', this.update, { passive: true });
      this.listen(window, 'resize', this.measure, { passive: true });
      this.listen(window, 'load', this.measure);
      this.measure();
    }

    labelFor(section) {
      return section.getAttribute('data-spy-label') || section.id || 'Sección';
    }

    render() {
      this.el.innerHTML = this.sections
        .map((section, index) =>
          '<button class="dx-spydots-dot dx-focusable" type="button" data-index="' + index +
          '" aria-label="' + Utils.escape(this.labelFor(section)) + '">' +
          '<span class="dx-spydots-label" aria-hidden="true">' + Utils.escape(this.labelFor(section)) + '</span>' +
          '<span class="dx-spydots-point" aria-hidden="true"></span>' +
          '</button>')
        .join('');
    }

    measure() {
      const scrollY = window.scrollY;
      this.tops = this.sections.map((section) => section.getBoundingClientRect().top + scrollY);
      this.update();
    }

    update() {
      if (!this.tops.length) return;
      const line = window.scrollY + innerHeight * this.options.offset;
      let index = 0;
      for (let i = 0; i < this.tops.length; i++) {
        if (this.tops[i] <= line) index = i;
      }
      if (index === this.active) return;
      this.active = index;
      this.dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    scrollToSection(index) {
      const top = this.tops[index];
      if (top === undefined) return;
      window.scrollTo({ top, behavior: Utils.reducedMotion ? 'auto' : 'smooth' });
    }
  }

  return ScrollSpyDots;
});

;
Dixel.define('Tabs', ['Component', 'Motion', 'Ticker', 'Utils'], function (Component, Motion, Ticker, Utils) {
  'use strict';

  class Tabs extends Component {
    static defaults = {
      items: [],
      active: 0,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-tabs');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const tabs = this.options.items
        .map((item, index) =>
          '<button class="dx-tabs-tab dx-focusable" type="button" role="tab" id="' + id + '-tab-' + index +
          '" aria-controls="' + id + '-panel-' + index + '" aria-selected="false" tabindex="-1">' + Utils.escape(item.label) + '</button>')
        .join('');
      const panels = this.options.items
        .map((item, index) =>
          '<div class="dx-tabs-panel" role="tabpanel" id="' + id + '-panel-' + index +
          '" aria-labelledby="' + id + '-tab-' + index + '" hidden>' + (typeof item.content === 'string' ? item.content : '') + '</div>')
        .join('');
      return '<div class="dx-tabs-list" role="tablist">' + tabs + '<span class="dx-tabs-indicator"></span></div>' +
        '<div class="dx-tabs-panels">' + panels + '</div>';
    }

    ready() {
      this.el.classList.add('dx-tabs');
      if (!this.el.querySelector('.dx-tabs-list')) this.el.innerHTML = this.markup();
      this.list = this.el.querySelector('.dx-tabs-list');
      this.indicator = this.el.querySelector('.dx-tabs-indicator');
      if (!this.indicator) {
        this.indicator = Utils.el('span', 'dx-tabs-indicator');
        this.list.appendChild(this.indicator);
      }
      this.buttons = Array.from(this.list.querySelectorAll('.dx-tabs-tab, [role="tab"]'));
      this.panels = Array.from(this.el.querySelectorAll('.dx-tabs-panel, [role="tabpanel"]'));
      this.options.items.forEach((item, index) => {
        if (item.content && typeof item.content !== 'string' && this.panels[index]) {
          Component.applyContent(item.content, this.panels[index], this);
        }
      });
      this.active = undefined;
      this.listen(this.list, 'click', (event) => {
        const button = event.target.closest('[role="tab"]');
        if (!button) return;
        this.select(this.buttons.indexOf(button));
      });
      this.listen(this.list, 'keydown', (event) => {
        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!direction) return;
        event.preventDefault();
        const next = (this.active + direction + this.buttons.length) % this.buttons.length;
        this.select(next);
        this.buttons[next].focus();
      });
      this.listen(window, 'resize', this.moveIndicator);
      this.listen(window, 'load', this.moveIndicator);
      this.select(Utils.clamp(Math.round(this.options.active) || 0, 0, Math.max(this.buttons.length - 1, 0)));
      const enable = Ticker.add(() => {
        this.el.classList.add('is-ready');
        enable();
      });
      this.addCleanup(enable);
    }

    select(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.buttons.length) return;
      const previous = this.active;
      if (previous === index) return;
      this.active = index;
      this.buttons.forEach((button, i) => {
        const selected = i === index;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.setAttribute('tabindex', selected ? '0' : '-1');
      });
      this.panels.forEach((panel, i) => {
        panel.hidden = i !== index;
      });
      this.moveIndicator();
      if (previous !== undefined) {
        const panel = this.panels[index];
        if (panel) Motion.fromTo(panel, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'outQuart' });
        if (this.options.onChange) this.options.onChange(index);
      }
    }

    moveIndicator() {
      const button = this.buttons[this.active];
      if (!button) return;
      this.indicator.style.transform = 'translateX(' + button.offsetLeft + 'px) scaleX(' + button.offsetWidth + ')';
    }
  }

  return Tabs;
});

;
Dixel.define('InlineBanner', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const icons = {
    info: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    upgrade: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.4 5.6L20 9.5l-4.2 4 1 6L12 16.6 7.2 19.5l1-6L4 9.5l5.6-.9L12 3z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>'
  };
  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class InlineBanner extends Component {
    static defaults = {
      type: 'info',
      title: '',
      text: '',
      ctaLabel: null,
      dismissible: true,
      onCta: null,
      onClose: null
    };

    build() {
      const el = Utils.el('div', 'dx-banner dx-banner--' + this.options.type + ' dx-reset', { role: 'status' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const icon = icons[this.options.type] || icons.info;
      const safeTitle = this.options.html ? this.options.title : Utils.escape(this.options.title || '');
      const safeText = this.options.html ? this.options.text : Utils.escape(this.options.text || '');
      const title = this.options.title ? '<strong class="dx-banner-title">' + safeTitle + '</strong>' : '';
      const text = this.options.text ? '<span class="dx-banner-text">' + safeText + '</span>' : '';
      const cta = this.options.ctaLabel
        ? '<button class="dx-banner-cta dx-focusable" type="button">' + Utils.escape(this.options.ctaLabel) + '</button>'
        : '';
      const close = this.options.dismissible
        ? '<button class="dx-banner-close dx-focusable" type="button" aria-label="Cerrar anuncio">' + closeIcon + '</button>'
        : '';
      return '<span class="dx-banner-icon" aria-hidden="true">' + icon + '</span>' +
        '<div class="dx-banner-content">' + title + text + '</div>' + cta + close;
    }

    ready() {
      this.el.classList.add('dx-banner', 'dx-banner--' + this.options.type, 'dx-reset');
      if (!this.el.querySelector('.dx-banner-content')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.closed = false;
      const cta = this.el.querySelector('.dx-banner-cta');
      const close = this.el.querySelector('.dx-banner-close');
      if (cta) {
        this.listen(cta, 'click', () => {
          if (this.options.onCta) this.options.onCta();
        });
      }
      if (close) this.listen(close, 'click', () => this.dismiss());
      Motion.fromTo(this.el, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'out' });
    }

    dismiss() {
      if (this.closed) return;
      this.closed = true;
      const el = this.el;
      Motion.to(el, {
        y: -10,
        opacity: 0,
        duration: 0.22,
        ease: 'in',
        onComplete: () => {
          el.style.display = 'none';
          if (this.options.onClose) this.options.onClose();
        }
      });
    }
  }

  return InlineBanner;
});

;
Dixel.define('NotificationCenter', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const bellIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 9.5a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19a2.2 2.2 0 004 0"/></svg>';
  const icons = {
    info: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    success: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>',
    message: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-8 8H4l1.5-3A8 8 0 1121 12z"/></svg>'
  };
  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class NotificationCenter extends Component {
    static defaults = {
      notifications: [],
      label: 'Notificaciones',
      emptyTitle: 'Todo al día',
      emptyText: 'No tienes notificaciones nuevas.',
      markAllLabel: 'Marcar leídas',
      clearLabel: 'Limpiar',
      onRead: null,
      onClear: null
    };

    build() {
      const el = Utils.el('button', 'dx-notify-bell dx-focusable', {
        type: 'button',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'aria-label': this.options.label
      });
      el.innerHTML = bellIcon + '<span class="dx-notify-badge" aria-hidden="true">0</span>';
      return el;
    }

    ready() {
      this.el.classList.add('dx-notify-bell', 'dx-focusable');
      if (!this.el.querySelector('.dx-notify-badge')) {
        this.el.innerHTML = bellIcon + '<span class="dx-notify-badge" aria-hidden="true">0</span>';
      }
      this.badge = this.el.querySelector('.dx-notify-badge');
      this.isOpen = false;
      this.lastFocus = null;
      this.timeTimer = null;
      this.unbindKeys = null;
      this.unbindOutside = null;
      this.panel = this.buildPanel();
      document.body.appendChild(this.panel);
      this.list = this.panel.querySelector('.dx-notify-list');
      this.emptyEl = this.panel.querySelector('.dx-notify-empty');
      this.listen(this.el, 'click', () => this.toggle());
      this.listen(this.panel.querySelector('.dx-notify-markall'), 'click', () => this.markAllRead());
      this.listen(this.panel.querySelector('.dx-notify-clear'), 'click', () => this.clearAll());
      this.listen(this.panel.querySelector('.dx-notify-close'), 'click', () => this.close());
      this.listen(this.list, 'click', (event) => {
        const item = event.target.closest('.dx-notify-item');
        if (item) this.markRead(item);
      });
      this.listen(this.list, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const item = event.target.closest('.dx-notify-item');
        if (!item) return;
        event.preventDefault();
        this.markRead(item);
      });
      this.listen(window, 'resize', () => {
        if (this.isOpen) this.position();
      });
      (this.options.notifications || []).forEach((notification) => this.render(notification, true));
      this.toggleEmpty();
      this.updateBadge(false);
      this.addCleanup(() => {
        this.releaseGlobal();
        this.panel.remove();
      });
    }

    buildPanel() {
      const panel = Utils.el('div', 'dx-notify-panel dx-reset', {
        role: 'dialog',
        'aria-label': this.options.label,
        tabindex: '-1'
      });
      panel.innerHTML =
        '<header class="dx-notify-head"><h3 class="dx-notify-title">' + Utils.escape(this.options.label) + '</h3>' +
        '<div class="dx-notify-tools">' +
        '<button class="dx-notify-tool dx-notify-markall dx-focusable" type="button">' + Utils.escape(this.options.markAllLabel) + '</button>' +
        '<button class="dx-notify-tool dx-notify-clear dx-focusable" type="button">' + Utils.escape(this.options.clearLabel) + '</button>' +
        '<button class="dx-notify-close dx-focusable" type="button" aria-label="Cerrar panel">' + closeIcon + '</button>' +
        '</div></header>' +
        '<div class="dx-notify-list"></div>' +
        '<div class="dx-notify-empty"><span class="dx-notify-emptyicon" aria-hidden="true">' + icons.success + '</span>' +
        '<strong>' + Utils.escape(this.options.emptyTitle) + '</strong><span>' + Utils.escape(this.options.emptyText) + '</span></div>';
      return panel;
    }

    normalize(notification) {
      const minutes = notification.minutesAgo || 0;
      return {
        id: notification.id || Utils.uid(),
        type: icons[notification.type] ? notification.type : 'info',
        title: notification.title || '',
        text: notification.text || '',
        html: !!notification.html,
        at: notification.at || Date.now() - minutes * 60000,
        unread: notification.unread !== false
      };
    }

    render(notification, silent) {
      const data = this.normalize(notification);
      const item = Utils.el('article', 'dx-notify-item' + (data.unread ? ' is-unread' : ''), {
        tabindex: '0',
        'data-id': data.id,
        'data-at': data.at
      });
      item.innerHTML =
        '<span class="dx-notify-icon dx-notify-icon--' + data.type + '" aria-hidden="true">' + icons[data.type] + '</span>' +
        '<div class="dx-notify-body"><strong class="dx-notify-itemtitle">' + (data.html ? data.title : Utils.escape(data.title)) + '</strong>' +
        '<span class="dx-notify-itemtext">' + (data.html ? data.text : Utils.escape(data.text)) + '</span>' +
        '<time class="dx-notify-time">' + this.relative(data.at) + '</time></div>' +
        '<span class="dx-notify-dot" aria-hidden="true"></span>';
      if (silent) {
        this.list.appendChild(item);
      } else {
        this.list.prepend(item);
        Motion.fromTo(item, { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'out' });
      }
      return item;
    }

    push(notification) {
      const item = this.render(notification, false);
      this.toggleEmpty();
      this.updateBadge(true);
      return item;
    }

    relative(at) {
      const diff = Date.now() - Number(at);
      const minutes = Math.round(diff / 60000);
      if (minutes < 1) return 'ahora';
      if (minutes < 60) return 'hace ' + minutes + ' min';
      const hours = Math.round(minutes / 60);
      if (hours < 24) return 'hace ' + hours + ' h';
      const days = Math.round(hours / 24);
      if (days === 1) return 'hace 1 día';
      return 'hace ' + days + ' días';
    }

    refreshTimes() {
      this.list.querySelectorAll('.dx-notify-item').forEach((item) => {
        item.querySelector('.dx-notify-time').textContent = this.relative(item.getAttribute('data-at'));
      });
    }

    unreadCount() {
      return this.list.querySelectorAll('.dx-notify-item.is-unread').length;
    }

    updateBadge(pop) {
      const count = this.unreadCount();
      this.badge.textContent = count > 99 ? '99+' : String(count);
      this.el.classList.toggle('has-unread', count > 0);
      this.el.setAttribute('aria-label', this.options.label + (count ? ', ' + count + ' sin leer' : ''));
      if (pop && count > 0) Motion.fromTo(this.badge, { scale: 0.4 }, { scale: 1, duration: 0.4, ease: 'outBack' });
    }

    toggleEmpty() {
      this.emptyEl.classList.toggle('is-visible', !this.list.children.length);
    }

    markRead(item) {
      if (!item.classList.contains('is-unread')) return;
      item.classList.remove('is-unread');
      const dot = item.querySelector('.dx-notify-dot');
      Motion.to(dot, { scale: 0, opacity: 0, duration: 0.25, ease: 'in' });
      this.updateBadge(false);
      if (this.options.onRead) this.options.onRead(item.getAttribute('data-id'));
    }

    markAllRead() {
      this.list.querySelectorAll('.dx-notify-item.is-unread').forEach((item) => this.markRead(item));
    }

    clearAll() {
      if (this.clearing) return;
      const items = Array.from(this.list.children);
      if (!items.length) return;
      this.clearing = true;
      Motion.to(items, {
        x: 36,
        opacity: 0,
        duration: 0.25,
        ease: 'in',
        stagger: 0.04,
        onComplete: () => {
          this.clearing = false;
          items.forEach((item) => item.remove());
          this.toggleEmpty();
          this.updateBadge(false);
        }
      });
      if (this.options.onClear) this.options.onClear();
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.setAttribute('aria-expanded', 'true');
      const mobile = this.position();
      this.panel.classList.add('is-open');
      this.refreshTimes();
      this.scheduleRefresh();
      Motion.fromTo(this.panel, { y: mobile ? 28 : -10, scale: mobile ? 1 : 0.98, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'out' });
      this.panel.focus({ preventScroll: true });
      this.unbindKeys = Utils.on(document, 'keydown', (event) => {
        if (event.key === 'Escape') this.close();
        else if (event.key === 'Tab') this.trapFocus(event);
      });
      this.unbindOutside = Utils.on(document, 'pointerdown', (event) => {
        if (!this.panel.contains(event.target) && !this.el.contains(event.target)) this.close();
      });
    }

    position() {
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const mobile = viewW < 640;
      this.panel.classList.toggle('dx-notify-panel--sheet', mobile);
      if (mobile) {
        this.panel.style.left = '';
        this.panel.style.top = '';
        return true;
      }
      const bellRect = this.el.getBoundingClientRect();
      const panelW = this.panel.offsetWidth;
      const panelH = this.panel.offsetHeight;
      const x = Utils.clamp(bellRect.right - panelW, 12, Math.max(viewW - panelW - 12, 12));
      let y = bellRect.bottom + 10;
      if (y + panelH > viewH - 12) y = Math.max(bellRect.top - panelH - 10, 12);
      this.panel.style.left = Math.round(x) + 'px';
      this.panel.style.top = Math.round(y) + 'px';
      return false;
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      const panel = this.panel;
      const mobile = panel.classList.contains('dx-notify-panel--sheet');
      Motion.to(panel, {
        y: mobile ? 28 : -10,
        opacity: 0,
        duration: 0.2,
        ease: 'in',
        onComplete: () => panel.classList.remove('is-open')
      });
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    scheduleRefresh() {
      this.timeTimer = setTimeout(() => {
        this.refreshTimes();
        this.scheduleRefresh();
      }, 60000);
    }

    trapFocus(event) {
      const focusables = Array.from(this.panel.querySelectorAll(focusableSelector));
      if (!focusables.length) {
        event.preventDefault();
        this.panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === this.panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!this.panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    releaseGlobal() {
      clearTimeout(this.timeTimer);
      this.timeTimer = null;
      if (this.unbindKeys) {
        this.unbindKeys();
        this.unbindKeys = null;
      }
      if (this.unbindOutside) {
        this.unbindOutside();
        this.unbindOutside = null;
      }
    }
  }

  return NotificationCenter;
});

;
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

;
Dixel.define('OnboardingTour', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class OnboardingTour extends Component {
    static defaults = {
      steps: [],
      padding: 10,
      launcherLabel: 'Iniciar recorrido',
      prevLabel: 'Anterior',
      nextLabel: 'Siguiente',
      doneLabel: 'Terminar',
      skipLabel: 'Saltar',
      onStep: null,
      onFinish: null,
      onSkip: null
    };

    build() {
      const el = Utils.el('button', 'dx-tour-launcher dx-focusable', { type: 'button' });
      el.innerHTML = '<span class="dx-tour-launcher-dot" aria-hidden="true"></span><span>' + Utils.escape(this.options.launcherLabel) + '</span>';
      return el;
    }

    ready() {
      this.el.classList.add('dx-tour-launcher', 'dx-focusable');
      this.steps = this.options.steps || [];
      this.index = 0;
      this.isOpen = false;
      this.lastFocus = null;
      this.unbindKeys = null;
      this.viewW = 0;
      this.viewH = 0;
      this.layer = this.buildLayer();
      document.body.appendChild(this.layer);
      this.pieces = ['top', 'bottom', 'left', 'right'].map((side) => this.layer.querySelector('.dx-tour-veil--' + side));
      this.ring = this.layer.querySelector('.dx-tour-ring');
      this.card = this.layer.querySelector('.dx-tour-card');
      this.titleEl = this.layer.querySelector('.dx-tour-title');
      this.textEl = this.layer.querySelector('.dx-tour-text');
      this.countEl = this.layer.querySelector('.dx-tour-count');
      this.dotsEl = this.layer.querySelector('.dx-tour-dots');
      this.prevBtn = this.layer.querySelector('.dx-tour-prev');
      this.nextBtn = this.layer.querySelector('.dx-tour-next');
      this.skipBtn = this.layer.querySelector('.dx-tour-skip');
      this.listen(this.el, 'click', () => this.start());
      this.listen(this.prevBtn, 'click', () => this.prev());
      this.listen(this.nextBtn, 'click', () => this.next());
      this.listen(this.skipBtn, 'click', () => this.finish(true));
      this.listen(this.layer, 'wheel', (event) => event.preventDefault(), { passive: false });
      this.listen(this.layer, 'touchmove', (event) => event.preventDefault(), { passive: false });
      this.listen(window, 'resize', () => {
        if (this.isOpen) this.showStep(this.index, false);
      });
      this.addCleanup(() => {
        this.releaseKeys();
        this.layer.remove();
      });
    }

    buildLayer() {
      const layer = Utils.el('div', 'dx-tour dx-reset', { 'aria-hidden': 'true' });
      const titleId = Utils.uid();
      const veils = ['top', 'bottom', 'left', 'right'].map((side) => '<div class="dx-tour-veil dx-tour-veil--' + side + '"></div>').join('');
      const dots = (this.options.steps || []).map(() => '<span class="dx-tour-dot"></span>').join('');
      layer.innerHTML = veils +
        '<div class="dx-tour-ring" aria-hidden="true"></div>' +
        '<div class="dx-tour-card" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '" tabindex="-1">' +
        '<div class="dx-tour-head"><span class="dx-tour-count"></span>' +
        '<button class="dx-tour-skip dx-focusable" type="button">' + Utils.escape(this.options.skipLabel) + '</button></div>' +
        '<h3 class="dx-tour-title dx-text-balance" id="' + titleId + '"></h3>' +
        '<p class="dx-tour-text"></p>' +
        '<div class="dx-tour-foot"><div class="dx-tour-dots" aria-hidden="true">' + dots + '</div>' +
        '<div class="dx-tour-nav">' +
        '<button class="dx-tour-btn dx-tour-prev dx-focusable" type="button">' + Utils.escape(this.options.prevLabel) + '</button>' +
        '<button class="dx-tour-btn dx-tour-btn--primary dx-tour-next dx-focusable" type="button">' + Utils.escape(this.options.nextLabel) + '</button>' +
        '</div></div></div>';
      return layer;
    }

    measureView() {
      this.viewW = window.innerWidth;
      this.viewH = window.innerHeight;
    }

    start(startIndex) {
      if (this.isOpen || !this.steps.length) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.measureView();
      this.layer.classList.add('is-open');
      this.layer.setAttribute('aria-hidden', 'false');
      Motion.set(this.pieces[0], { x: 0, y: 0, scaleX: 1, scaleY: 1 });
      Motion.set(this.pieces[1], { x: 0, y: this.viewH, scaleX: 1, scaleY: 0 });
      Motion.set(this.pieces[2], { x: 0, y: 0, scaleX: 0, scaleY: 0 });
      Motion.set(this.pieces[3], { x: this.viewW, y: 0, scaleX: 0, scaleY: 0 });
      Motion.set(this.ring, { opacity: 0 });
      Motion.set(this.card, { opacity: 0 });
      this.unbindKeys = Utils.on(document, 'keydown', (event) => this.onKey(event));
      this.showStep(startIndex || 0, true);
    }

    onKey(event) {
      if (event.key === 'Escape') this.finish(true);
      else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prev();
      } else if (event.key === 'Tab') this.trapFocus(event);
    }

    showStep(index, entering) {
      const step = this.steps[index];
      if (!step) return;
      this.index = index;
      this.measureView();
      const target = this.resolveTarget(step.target);
      if (target) this.bringIntoView(target);
      const box = this.focusBox(target);
      this.moveVeil(box);
      this.moveRing(box, !!target);
      this.fillCard(step, index);
      this.placeCard(box, step.placement || 'bottom', entering, !!target);
      if (this.options.onStep) this.options.onStep(index, step);
    }

    resolveTarget(target) {
      if (!target) return null;
      if (target instanceof Element) return target;
      return document.querySelector(target);
    }

    bringIntoView(target) {
      const rect = target.getBoundingClientRect();
      if (rect.top < 72 || rect.bottom > this.viewH - 72) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    }

    focusBox(target) {
      if (!target) {
        const cx = Math.round(this.viewW / 2);
        const cy = Math.round(this.viewH / 2);
        return { left: cx, top: cy, right: cx, bottom: cy };
      }
      const rect = target.getBoundingClientRect();
      const pad = this.options.padding;
      return {
        left: Math.round(Utils.clamp(rect.left - pad, 0, this.viewW)),
        top: Math.round(Utils.clamp(rect.top - pad, 0, this.viewH)),
        right: Math.round(Utils.clamp(rect.right + pad, 0, this.viewW)),
        bottom: Math.round(Utils.clamp(rect.bottom + pad, 0, this.viewH))
      };
    }

    moveVeil(box) {
      const w = this.viewW;
      const h = this.viewH;
      const bandY = (box.bottom - box.top) / h;
      const move = { duration: 0.55, ease: 'inOut' };
      Motion.to(this.pieces[0], Object.assign({ x: 0, y: 0, scaleX: 1, scaleY: box.top / h }, move));
      Motion.to(this.pieces[1], Object.assign({ x: 0, y: box.bottom, scaleX: 1, scaleY: (h - box.bottom) / h }, move));
      Motion.to(this.pieces[2], Object.assign({ x: 0, y: box.top, scaleX: box.left / w, scaleY: bandY }, move));
      Motion.to(this.pieces[3], Object.assign({ x: box.right, y: box.top, scaleX: (w - box.right) / w, scaleY: bandY }, move));
    }

    moveRing(box, hasTarget) {
      if (!hasTarget) {
        Motion.to(this.ring, { opacity: 0, duration: 0.15 });
        return;
      }
      const ring = this.ring;
      Motion.to(ring, {
        opacity: 0,
        duration: 0.16,
        onComplete: () => {
          ring.style.left = box.left + 'px';
          ring.style.top = box.top + 'px';
          ring.style.width = (box.right - box.left) + 'px';
          ring.style.height = (box.bottom - box.top) + 'px';
          Motion.to(ring, { opacity: 1, duration: 0.3 });
        }
      });
    }

    fillCard(step, index) {
      const last = index === this.steps.length - 1;
      this.countEl.textContent = (index + 1) + ' de ' + this.steps.length;
      this.titleEl.innerHTML = step.title ? Utils.escape(step.title) : '';
      this.textEl.innerHTML = step.text || '';
      this.prevBtn.disabled = index === 0;
      this.nextBtn.textContent = last ? this.options.doneLabel : this.options.nextLabel;
      Array.from(this.dotsEl.children).forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.classList.toggle('is-done', i < index);
      });
    }

    placeCard(box, placement, entering, hasTarget) {
      const mobile = this.viewW < 640;
      this.card.classList.toggle('dx-tour-card--sheet', mobile);
      const cardW = this.card.offsetWidth;
      const cardH = this.card.offsetHeight;
      let x = 0;
      let y = 0;
      if (!mobile) {
        const pos = this.cardPosition(box, hasTarget ? placement : 'center', cardW, cardH);
        x = pos.x;
        y = pos.y;
      }
      if (entering) {
        Motion.fromTo(this.card, { x, y: y + 14, opacity: 0 }, { x, y, opacity: 1, duration: 0.45, ease: 'out' });
      } else {
        Motion.to(this.card, { x, y, opacity: 1, duration: 0.5, ease: 'inOut' });
      }
      this.card.focus({ preventScroll: true });
    }

    cardPosition(box, placement, cardW, cardH) {
      const edge = 12;
      const gap = 16;
      const maxX = this.viewW - cardW - edge;
      const maxY = this.viewH - cardH - edge;
      const centerX = (box.left + box.right) / 2;
      const centerY = (box.top + box.bottom) / 2;
      let side = placement;
      if (side === 'bottom' && box.bottom + gap + cardH > this.viewH - edge) side = 'top';
      if (side === 'top' && box.top - gap - cardH < edge) side = 'bottom';
      if (side === 'right' && box.right + gap + cardW > this.viewW - edge) side = 'left';
      if (side === 'left' && box.left - gap - cardW < edge) side = 'right';
      if (side === 'center') return { x: Utils.clamp((this.viewW - cardW) / 2, edge, maxX), y: Utils.clamp((this.viewH - cardH) / 2, edge, maxY) };
      if (side === 'top') return { x: Utils.clamp(centerX - cardW / 2, edge, maxX), y: Utils.clamp(box.top - gap - cardH, edge, maxY) };
      if (side === 'left') return { x: Utils.clamp(box.left - gap - cardW, edge, maxX), y: Utils.clamp(centerY - cardH / 2, edge, maxY) };
      if (side === 'right') return { x: Utils.clamp(box.right + gap, edge, maxX), y: Utils.clamp(centerY - cardH / 2, edge, maxY) };
      return { x: Utils.clamp(centerX - cardW / 2, edge, maxX), y: Utils.clamp(box.bottom + gap, edge, maxY) };
    }

    next() {
      if (!this.isOpen) return;
      if (this.index >= this.steps.length - 1) this.finish(false);
      else this.showStep(this.index + 1, false);
    }

    prev() {
      if (!this.isOpen || this.index === 0) return;
      this.showStep(this.index - 1, false);
    }

    goTo(index) {
      if (this.isOpen) this.showStep(Utils.clamp(index, 0, this.steps.length - 1), false);
      else this.start(index);
    }

    finish(skipped) {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.layer.classList.remove('is-open');
      this.layer.setAttribute('aria-hidden', 'true');
      this.releaseKeys();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
      if (skipped && this.options.onSkip) this.options.onSkip(this.index);
      if (!skipped && this.options.onFinish) this.options.onFinish();
    }

    trapFocus(event) {
      const focusables = Array.from(this.card.querySelectorAll(focusableSelector));
      if (!focusables.length) {
        event.preventDefault();
        this.card.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === this.card)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!this.card.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    releaseKeys() {
      if (this.unbindKeys) {
        this.unbindKeys();
        this.unbindKeys = null;
      }
    }
  }

  return OnboardingTour;
});

;
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

;
Dixel.define('DatePicker', ['PickerBase', 'Motion', 'Utils'], function (PickerBase, Motion, Utils) {
  'use strict';

  const calendarIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/></svg>';
  const arrow = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function pad(value) {
    return value < 10 ? '0' + value : '' + value;
  }

  function keyOf(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function dateOf(key) {
    const parts = key.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  class DatePicker extends PickerBase {
    static defaults = Object.assign({}, PickerBase.defaults, {
      placeholder: 'Elegir fecha',
      value: null,
      range: false,
      format: 'dd/mm/yyyy',
      firstDay: 1,
      min: null,
      max: null,
      isDisabled: null,
      months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
      days: ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']
    });

    triggerIcon() {
      return calendarIcon;
    }

    panelMarkup() {
      const week = Array.from({ length: 7 }, (unused, index) => {
        const weekday = (this.options.firstDay + index) % 7;
        return '<span class="dx-cal-weekday" aria-hidden="true">' + this.options.days[(weekday + 6) % 7] + '</span>';
      }).join('');
      return '<div class="dx-cal-head">' +
        '<button class="dx-cal-nav dx-cal-prev dx-focusable" type="button" aria-label="Anterior">' + arrow + '</button>' +
        '<button class="dx-cal-title dx-focusable" type="button" aria-live="polite" aria-label="Cambiar de vista"></button>' +
        '<button class="dx-cal-nav dx-cal-next dx-focusable" type="button" aria-label="Siguiente">' + arrow + '</button>' +
        '</div>' +
        '<div class="dx-cal-week">' + week + '</div>' +
        '<div class="dx-cal-viewport"><div class="dx-cal-grid" role="grid" aria-label="Calendario"></div></div>';
    }

    setupPanel() {
      this.todayKey = keyOf(new Date());
      if (this.options.range) {
        const initial = this.options.value || {};
        this.rangeStart = initial.start || null;
        this.rangeEnd = initial.end || null;
      } else {
        this.value = this.options.value || null;
      }
      const anchor = dateOf(this.options.range ? this.rangeStart || this.todayKey : this.value || this.todayKey);
      this.viewYear = anchor.getFullYear();
      this.viewMonth = anchor.getMonth();
      this.view = 'days';
      this.gridAnimating = false;
      this.title = this.panel.querySelector('.dx-cal-title');
      this.weekRow = this.panel.querySelector('.dx-cal-week');
      this.viewport = this.panel.querySelector('.dx-cal-viewport');
      this.grid = this.panel.querySelector('.dx-cal-grid');
      this.listen(this.title, 'click', this.drillUp);
      this.listen(this.panel.querySelector('.dx-cal-prev'), 'click', () => this.navigate(-1));
      this.listen(this.panel.querySelector('.dx-cal-next'), 'click', () => this.navigate(1));
      this.listen(this.viewport, 'click', this.handleGridClick);
      this.listen(this.viewport, 'keydown', this.onGridKeydown);
      this.renderGrid();
      this.updateDisplay();
    }

    onOpen() {
      const target = this.grid.querySelector('[tabindex="0"]');
      if (target) target.focus();
    }

    handleGridClick(event) {
      const day = event.target.closest('.dx-cal-day');
      if (day) {
        this.select(day.getAttribute('data-date'));
        return;
      }
      const month = event.target.closest('.dx-cal-month');
      if (month) {
        this.viewMonth = Number(month.getAttribute('data-month'));
        this.setView('days', 1);
        return;
      }
      const year = event.target.closest('.dx-cal-year');
      if (year) {
        this.viewYear = Number(year.getAttribute('data-year'));
        this.setView('months', 1);
      }
    }

    drillUp() {
      if (this.view === 'days') this.setView('months', -1);
      else if (this.view === 'months') this.setView('years', -1);
      else this.setView('days', 1);
    }

    setView(view, direction) {
      if (this.gridAnimating || view === this.view) return;
      this.view = view;
      this.swapGrid(direction, 'y');
      const target = this.grid.querySelector('[tabindex="0"]');
      if (target && this.isOpen) target.focus();
    }

    yearBase() {
      return Math.floor(this.viewYear / 12) * 12;
    }

    titleText() {
      if (this.view === 'months') return String(this.viewYear);
      if (this.view === 'years') return this.yearBase() + ' – ' + (this.yearBase() + 11);
      return this.options.months[this.viewMonth] + ' ' + this.viewYear;
    }

    selectedKey() {
      return this.options.range ? this.rangeStart : this.value;
    }

    gridClassNames() {
      return this.view === 'days' ? 'dx-cal-grid' : 'dx-cal-grid dx-cal-grid--cells';
    }

    gridMarkup() {
      if (this.view === 'months') return this.monthsMarkup();
      if (this.view === 'years') return this.yearsMarkup();
      return this.daysMarkup();
    }

    daysMarkup() {
      const first = new Date(this.viewYear, this.viewMonth, 1);
      const offset = (first.getDay() - this.options.firstDay + 7) % 7;
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const date = new Date(this.viewYear, this.viewMonth, 1 - offset + i);
        const key = keyOf(date);
        let classes = 'dx-cal-day';
        let disabled = false;
        if ((this.options.min && key < this.options.min) ||
            (this.options.max && key > this.options.max) ||
            (this.options.isDisabled && this.options.isDisabled(date, key))) {
          classes += ' is-disabled';
          disabled = true;
        }
        if (date.getMonth() !== this.viewMonth) classes += ' is-outside';
        if (key === this.todayKey) classes += ' is-today';
        let selected = false;
        if (this.options.range) {
          if (key === this.rangeStart) {
            classes += ' is-selected is-range-start';
            selected = true;
          }
          if (key === this.rangeEnd) {
            classes += ' is-selected is-range-end';
            selected = true;
          }
          if (this.rangeStart && this.rangeEnd && key > this.rangeStart && key < this.rangeEnd) {
            classes += ' is-in-range';
          }
        } else if (key === this.value) {
          classes += ' is-selected';
          selected = true;
        }
        cells += '<button type="button" class="' + classes + '"' + (disabled ? ' disabled aria-disabled="true"' : '') +
          ' role="gridcell" tabindex="-1" data-date="' + key +
          '" aria-label="' + date.getDate() + ' de ' + this.options.months[date.getMonth()] + ' de ' + date.getFullYear() +
          '" aria-selected="' + selected + '">' + date.getDate() + '</button>';
      }
      return cells;
    }

    monthsMarkup() {
      const today = new Date();
      const selected = this.selectedKey() ? dateOf(this.selectedKey()) : null;
      let cells = '';
      for (let month = 0; month < 12; month++) {
        let classes = 'dx-cal-cell dx-cal-month';
        if (today.getFullYear() === this.viewYear && today.getMonth() === month) classes += ' is-today';
        const isSelected = Boolean(selected) &&
          selected.getFullYear() === this.viewYear &&
          selected.getMonth() === month;
        if (isSelected) classes += ' is-selected';
        cells += '<button type="button" class="' + classes + '" role="gridcell" tabindex="-1" data-month="' + month +
          '" aria-label="' + this.options.months[month] + ' de ' + this.viewYear +
          '" aria-selected="' + isSelected + '">' + this.options.months[month].slice(0, 3) + '</button>';
      }
      return cells;
    }

    yearsMarkup() {
      const base = this.yearBase();
      const currentYear = new Date().getFullYear();
      const selected = this.selectedKey() ? dateOf(this.selectedKey()).getFullYear() : null;
      let cells = '';
      for (let i = 0; i < 12; i++) {
        const year = base + i;
        let classes = 'dx-cal-cell dx-cal-year';
        if (year === currentYear) classes += ' is-today';
        const isSelected = year === selected;
        if (isSelected) classes += ' is-selected';
        cells += '<button type="button" class="' + classes + '" role="gridcell" tabindex="-1" data-year="' + year +
          '" aria-selected="' + isSelected + '">' + year + '</button>';
      }
      return cells;
    }

    renderGrid() {
      this.grid.className = this.gridClassNames();
      this.grid.innerHTML = this.gridMarkup();
      this.title.textContent = this.titleText();
      this.weekRow.classList.toggle('is-hidden', this.view !== 'days');
      this.updateRoving();
    }

    updateRoving() {
      const target = this.grid.querySelector('.is-selected:not(.is-outside)') ||
        this.grid.querySelector('.is-today:not(.is-outside)') ||
        this.grid.querySelector('[role="gridcell"]:not(.is-outside)');
      if (target) target.setAttribute('tabindex', '0');
    }

    navigate(direction, focusKey) {
      if (this.gridAnimating) return;
      if (this.view === 'days') {
        const next = new Date(this.viewYear, this.viewMonth + direction, 1);
        this.viewYear = next.getFullYear();
        this.viewMonth = next.getMonth();
      } else if (this.view === 'months') {
        this.viewYear += direction;
      } else {
        this.viewYear += direction * 12;
      }
      this.swapGrid(direction, 'x', focusKey);
    }

    swapGrid(direction, axis, focusKey) {
      const oldGrid = this.grid;
      const newGrid = Utils.el('div', this.gridClassNames() + ' is-incoming', { role: 'grid', 'aria-label': 'Calendario' });
      newGrid.innerHTML = this.gridMarkup();
      this.viewport.appendChild(newGrid);
      this.grid = newGrid;
      this.title.textContent = this.titleText();
      this.weekRow.classList.toggle('is-hidden', this.view !== 'days');
      this.updateRoving();
      const finish = () => {
        oldGrid.remove();
        newGrid.classList.remove('is-incoming');
        this.gridAnimating = false;
        if (focusKey) {
          const cell = newGrid.querySelector('[data-date="' + focusKey + '"]');
          if (cell) cell.focus();
        }
      };
      if (Utils.reducedMotion) {
        finish();
        return;
      }
      this.gridAnimating = true;
      const shift = axis === 'y' ? { y: direction * 26 } : { x: direction * 36 };
      const back = axis === 'y' ? { y: -direction * 26 } : { x: -direction * 36 };
      Motion.fromTo(newGrid, Object.assign({ opacity: 0 }, shift), { x: 0, y: 0, opacity: 1, duration: 0.3, ease: 'outQuart' });
      Motion.to(oldGrid, Object.assign({ opacity: 0, duration: 0.3, ease: 'outQuart', onComplete: finish }, back));
    }

    onGridKeydown(event) {
      if (this.view !== 'days') {
        this.onCellsKeydown(event);
        return;
      }
      const focused = document.activeElement;
      if (!focused || !focused.hasAttribute('data-date')) return;
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let targetDate = null;
      if (steps[event.key] !== undefined) {
        targetDate = dateOf(focused.getAttribute('data-date'));
        targetDate.setDate(targetDate.getDate() + steps[event.key]);
      } else if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault();
        this.navigate(event.key === 'PageUp' ? -1 : 1);
        return;
      } else {
        return;
      }
      event.preventDefault();
      const targetKey = keyOf(targetDate);
      const inView = targetDate.getMonth() === this.viewMonth && targetDate.getFullYear() === this.viewYear;
      if (inView) {
        const cell = this.grid.querySelector('[data-date="' + targetKey + '"]:not(.is-outside)');
        if (cell) cell.focus();
        return;
      }
      const direction = targetKey < keyOf(new Date(this.viewYear, this.viewMonth, 1)) ? -1 : 1;
      this.navigate(direction, targetKey);
    }

    onCellsKeydown(event) {
      if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault();
        this.navigate(event.key === 'PageUp' ? -1 : 1);
        return;
      }
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
      if (steps[event.key] === undefined) return;
      const focused = document.activeElement;
      if (!focused || !this.grid.contains(focused)) return;
      event.preventDefault();
      const cells = Array.from(this.grid.querySelectorAll('[role="gridcell"]'));
      const index = Utils.clamp(cells.indexOf(focused) + steps[event.key], 0, cells.length - 1);
      cells[index].focus();
    }

    select(key) {
      if (this.options.range) {
        if (!this.rangeStart || (this.rangeStart && this.rangeEnd)) {
          this.rangeStart = key;
          this.rangeEnd = null;
        } else if (key < this.rangeStart) {
          this.rangeStart = key;
        } else {
          this.rangeEnd = key;
        }
      } else {
        this.value = key;
      }
      const selectedDate = dateOf(key);
      if (selectedDate.getMonth() !== this.viewMonth || selectedDate.getFullYear() !== this.viewYear) {
        this.viewYear = selectedDate.getFullYear();
        this.viewMonth = selectedDate.getMonth();
      }
      this.renderGrid();
      const cell = this.grid.querySelector('[data-date="' + key + '"]:not(.is-outside)');
      if (cell) {
        cell.focus();
        Motion.fromTo(cell, { scale: 0.6 }, { scale: 1, duration: 0.35, ease: 'outBack' });
      }
      this.updateDisplay();
      this.emitChange();
      if (!this.options.range || (this.rangeStart && this.rangeEnd)) this.finishSelection();
    }

    finishSelection() {
      this.close();
      this.trigger.focus();
    }

    formatKey(key) {
      const date = dateOf(key);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const fullYear = String(date.getFullYear());
      const monthName = this.options.months[date.getMonth()].slice(0, 3);
      return String(this.options.format)
        .replace('yyyy', fullYear)
        .replace('yy', fullYear.slice(2))
        .replace('mon', monthName)
        .replace('mm', month)
        .replace('dd', day);
    }

    updateDisplay() {
      if (this.options.range) {
        if (this.rangeStart && this.rangeEnd) {
          this.setDisplay(this.formatKey(this.rangeStart) + ' — ' + this.formatKey(this.rangeEnd));
        } else if (this.rangeStart) {
          this.setDisplay(this.formatKey(this.rangeStart) + ' — …');
        } else {
          this.setDisplay(null);
        }
        return;
      }
      this.setDisplay(this.value ? this.formatKey(this.value) : null);
    }

    emitChange() {
      if (!this.options.onChange) return;
      if (this.options.range) this.options.onChange({ start: this.rangeStart, end: this.rangeEnd }, this);
      else this.options.onChange(this.value, this);
    }

    getValue() {
      return this.options.range ? { start: this.rangeStart, end: this.rangeEnd } : this.value;
    }

    setValue(value) {
      if (this.options.range) {
        const next = value || {};
        this.rangeStart = next.start || null;
        this.rangeEnd = next.end || null;
      } else {
        this.value = value || null;
      }
      const anchorKey = this.options.range ? this.rangeStart || this.todayKey : this.value || this.todayKey;
      const anchor = dateOf(anchorKey);
      this.viewYear = anchor.getFullYear();
      this.viewMonth = anchor.getMonth();
      this.view = 'days';
      this.renderGrid();
      this.updateDisplay();
    }
  }

  return DatePicker;
});

;
Dixel.define('PickerBase', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const chevron = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const sheetQuery = matchMedia('(max-width: 520px)');

  class PickerBase extends Component {
    static defaults = {
      label: '',
      placeholder: 'Seleccionar',
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-picker');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const label = this.options.label ? '<span class="dx-picker-label">' + this.options.label + '</span>' : '';
      return label +
        '<button class="dx-picker-trigger dx-focusable" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="' + id + '">' +
        '<span class="dx-picker-value is-placeholder">' + this.options.placeholder + '</span>' +
        '<span class="dx-picker-caret" aria-hidden="true">' + this.triggerIcon() + '</span>' +
        '</button>' +
        '<div class="dx-picker-panel dx-scroll-thin" id="' + id + '" role="dialog" aria-label="' + (this.options.label || this.options.placeholder) + '">' +
        this.panelMarkup() +
        '</div>';
    }

    triggerIcon() {
      return chevron;
    }

    panelMarkup() {
      return '';
    }

    ready() {
      this.el.classList.add('dx-picker');
      if (!this.el.querySelector('.dx-picker-panel')) this.el.innerHTML = this.markup();
      this.trigger = this.el.querySelector('.dx-picker-trigger');
      this.valueEl = this.el.querySelector('.dx-picker-value');
      this.panel = this.el.querySelector('.dx-picker-panel');
      this.isOpen = false;
      this.globalCleanups = [];
      this.listen(this.trigger, 'click', this.toggle);
      this.addCleanup(() => {
        this.releaseGlobal();
        if (this.panel && this.panel.parentNode === document.body) this.panel.remove();
      });
      this.setupPanel();
    }

    setupPanel() {}

    onOpen() {}

    setDisplay(text) {
      if (text) {
        this.valueEl.textContent = text;
        this.valueEl.classList.remove('is-placeholder');
      } else {
        this.valueEl.textContent = this.options.placeholder;
        this.valueEl.classList.add('is-placeholder');
      }
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.sheet = sheetQuery.matches;
      this.el.classList.add('is-open');
      this.panel.classList.add('is-open');
      this.panel.classList.toggle('is-sheet', this.sheet);
      this.trigger.setAttribute('aria-expanded', 'true');
      document.body.appendChild(this.panel);
      this.positionPanel();
      const from = this.sheet
        ? { y: 40, opacity: 0 }
        : { scale: 0.94, y: this.panel.classList.contains('is-up') ? 6 : -6, opacity: 0 };
      Motion.fromTo(this.panel, from, { scale: 1, y: 0, opacity: 1, duration: 0.28, ease: 'outQuart' });
      this.globalCleanups.push(Utils.on(document, 'pointerdown', (event) => {
        if (!this.el.contains(event.target) && !this.panel.contains(event.target)) this.close();
      }));
      this.globalCleanups.push(Utils.on(document, 'keydown', (event) => {
        if (event.key !== 'Escape') return;
        this.close();
        this.trigger.focus();
      }));
      this.globalCleanups.push(Utils.on(window, 'scroll', () => this.positionPanel(), { passive: true, capture: true }));
      this.globalCleanups.push(Utils.on(window, 'resize', () => this.positionPanel(), { passive: true }));
      this.onOpen();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.trigger.setAttribute('aria-expanded', 'false');
      this.releaseGlobal();
      const to = this.sheet
        ? { y: 30, opacity: 0, duration: 0.16, ease: 'in' }
        : { scale: 0.96, opacity: 0, duration: 0.15, ease: 'in' };
      to.onComplete = () => {
        if (!this.isOpen) this.retractPanel();
      };
      Motion.to(this.panel, to);
    }

    retractPanel() {
      if (!this.el || !this.panel) return;
      this.el.classList.remove('is-open');
      this.panel.classList.remove('is-open', 'is-sheet', 'is-up');
      this.panel.style.left = '';
      this.panel.style.top = '';
      this.el.appendChild(this.panel);
    }

    positionPanel() {
      if (!this.isOpen || this.sheet) return;
      const rect = this.trigger.getBoundingClientRect();
      const panelWidth = this.panel.offsetWidth;
      const panelHeight = this.panel.offsetHeight;
      const spaceBelow = innerHeight - rect.bottom;
      const openUp = spaceBelow < panelHeight + 16 && rect.top > spaceBelow;
      this.panel.classList.toggle('is-up', openUp);
      const left = Utils.clamp(rect.left, 8, Math.max(8, innerWidth - panelWidth - 8));
      const top = openUp ? rect.top - panelHeight - 8 : rect.bottom + 8;
      this.panel.style.left = Math.round(left) + 'px';
      this.panel.style.top = Math.round(top) + 'px';
    }

    releaseGlobal() {
      this.globalCleanups.forEach((cleanup) => cleanup());
      this.globalCleanups = [];
    }
  }

  return PickerBase;
});

;
Dixel.define('TimePicker', ['PickerBase', 'Motion', 'Utils'], function (PickerBase, Motion, Utils) {
  'use strict';

  const clockIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const upIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const downIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function pad(value) {
    return value < 10 ? '0' + value : '' + value;
  }

  class TimePicker extends PickerBase {
    static defaults = Object.assign({}, PickerBase.defaults, {
      placeholder: 'Elegir hora',
      value: null,
      format: 24,
      stepMinutes: 5,
      formatToggle: false,
      quickMinutes: [0, 15, 30, 45]
    });

    triggerIcon() {
      return clockIcon;
    }

    panelMarkup() {
      const unit = (name, label) =>
        '<div class="dx-time-unit" data-unit="' + name + '">' +
        '<button class="dx-time-step dx-focusable" type="button" data-dir="1" aria-label="Aumentar ' + label.toLowerCase() + '">' + upIcon + '</button>' +
        '<div class="dx-time-value dx-focusable" role="spinbutton" tabindex="0" aria-label="' + label + '"></div>' +
        '<button class="dx-time-step dx-focusable" type="button" data-dir="-1" aria-label="Reducir ' + label.toLowerCase() + '">' + downIcon + '</button>' +
        '</div>';
      const quick = this.options.quickMinutes && this.options.quickMinutes.length
        ? '<div class="dx-time-quick" role="group" aria-label="Minutos rápidos">' +
          this.options.quickMinutes
            .map((minute) => '<button class="dx-time-chip dx-focusable" type="button" data-minute="' + minute + '">:' + pad(minute) + '</button>')
            .join('') +
          '</div>'
        : '';
      const toggle = this.options.formatToggle
        ? '<button class="dx-time-format dx-focusable" type="button"></button>'
        : '';
      return '<div class="dx-time-units">' +
        unit('h', 'Horas') +
        '<span class="dx-time-sep" aria-hidden="true">:</span>' +
        unit('m', 'Minutos') +
        '<div class="dx-time-ampm" role="group" aria-label="Meridiano">' +
        '<button class="dx-time-ap dx-focusable" type="button" data-ap="0">AM</button>' +
        '<button class="dx-time-ap dx-focusable" type="button" data-ap="1">PM</button>' +
        '</div>' +
        '</div>' + quick + toggle;
    }

    setupPanel() {
      const now = new Date();
      const step = this.options.stepMinutes;
      this.format = this.options.format === 12 ? 12 : 24;
      this.hour = now.getHours();
      this.minute = (Math.round(now.getMinutes() / step) * step) % 60;
      if (this.options.value) {
        const parts = this.options.value.split(':');
        this.hour = Utils.clamp(Number(parts[0]) || 0, 0, 23);
        this.minute = Utils.clamp(Number(parts[1]) || 0, 0, 59);
      }
      this.hasValue = Boolean(this.options.value);
      this.units = {
        h: this.panel.querySelector('[data-unit="h"] .dx-time-value'),
        m: this.panel.querySelector('[data-unit="m"] .dx-time-value')
      };
      this.ampm = this.panel.querySelector('.dx-time-ampm');
      this.formatBtn = this.panel.querySelector('.dx-time-format');
      ['h', 'm'].forEach((name) => {
        const unitEl = this.panel.querySelector('[data-unit="' + name + '"]');
        this.listen(unitEl, 'click', (event) => {
          const button = event.target.closest('.dx-time-step');
          if (button) this.spin(name, Number(button.getAttribute('data-dir')));
        });
        this.listen(unitEl, 'wheel', (event) => {
          event.preventDefault();
          this.spin(name, event.deltaY < 0 ? 1 : -1);
        }, { passive: false });
        this.listen(this.units[name], 'keydown', (event) => {
          const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
          if (!direction) return;
          event.preventDefault();
          this.spin(name, direction);
        });
      });
      this.listen(this.ampm, 'click', (event) => {
        const button = event.target.closest('.dx-time-ap');
        if (!button) return;
        this.setMeridiem(button.getAttribute('data-ap') === '1');
      });
      const quick = this.panel.querySelector('.dx-time-quick');
      if (quick) {
        this.listen(quick, 'click', (event) => {
          const chip = event.target.closest('.dx-time-chip');
          if (!chip) return;
          this.minute = Number(chip.getAttribute('data-minute'));
          this.bump(this.units.m, 1);
          this.commit();
        });
      }
      if (this.formatBtn) {
        this.listen(this.formatBtn, 'click', () => {
          this.format = this.format === 12 ? 24 : 12;
          this.render();
          if (this.hasValue) this.updateDisplay();
        });
      }
      this.render();
      if (this.hasValue) this.updateDisplay();
    }

    onOpen() {
      this.units.h.focus();
    }

    spin(name, direction) {
      if (name === 'h') this.hour = (this.hour + direction + 24) % 24;
      else this.minute = (this.minute + direction * this.options.stepMinutes + 60) % 60;
      this.bump(this.units[name], direction);
      this.commit();
    }

    setMeridiem(pm) {
      const base = this.hour % 12;
      const next = pm ? base + 12 : base;
      if (next === this.hour) return;
      this.hour = next;
      this.commit();
    }

    bump(el, direction) {
      if (Utils.reducedMotion) return;
      Motion.fromTo(
        el,
        { y: direction > 0 ? -12 : 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.26, ease: 'out' }
      );
    }

    commit() {
      this.hasValue = true;
      this.render();
      this.updateDisplay();
      if (this.options.onChange) this.options.onChange(pad(this.hour) + ':' + pad(this.minute), this);
    }

    getValue() {
      return this.hasValue ? pad(this.hour) + ':' + pad(this.minute) : null;
    }

    setValue(value) {
      const parts = String(value || '').split(':');
      const hour = Number(parts[0]);
      const minute = Number(parts[1]);
      if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;
      this.hour = Utils.clamp(hour, 0, 23);
      this.minute = Utils.clamp(minute, 0, 59);
      this.hasValue = true;
      this.render();
      this.updateDisplay();
    }

    render() {
      const twelve = this.format === 12;
      this.panel.classList.toggle('is-12h', twelve);
      this.units.h.textContent = pad(twelve ? this.hour % 12 || 12 : this.hour);
      this.units.m.textContent = pad(this.minute);
      this.units.h.setAttribute('aria-valuemin', '0');
      this.units.h.setAttribute('aria-valuemax', '23');
      this.units.h.setAttribute('aria-valuenow', String(this.hour));
      this.units.h.setAttribute('aria-valuetext', this.units.h.textContent + (twelve ? (this.hour < 12 ? ' AM' : ' PM') : ' horas'));
      this.units.m.setAttribute('aria-valuemin', '0');
      this.units.m.setAttribute('aria-valuemax', '59');
      this.units.m.setAttribute('aria-valuenow', String(this.minute));
      this.units.m.setAttribute('aria-valuetext', pad(this.minute) + ' minutos');
      Array.from(this.ampm.querySelectorAll('.dx-time-ap')).forEach((button) => {
        const active = (button.getAttribute('data-ap') === '1') === this.hour >= 12;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const chips = this.panel.querySelectorAll('.dx-time-chip');
      for (let i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('is-active', Number(chips[i].getAttribute('data-minute')) === this.minute);
      }
      if (this.formatBtn) this.formatBtn.textContent = twelve ? 'Usar formato 24 h' : 'Usar formato 12 h';
    }

    updateDisplay() {
      if (this.format === 12) {
        const hour12 = this.hour % 12 || 12;
        this.setDisplay(pad(hour12) + ':' + pad(this.minute) + ' ' + (this.hour < 12 ? 'AM' : 'PM'));
        return;
      }
      this.setDisplay(pad(this.hour) + ':' + pad(this.minute));
    }
  }

  return TimePicker;
});

;
Dixel.define('CountUp', ['Component', 'Utils', 'Ticker', 'Motion'], function (Component, Utils, Ticker, Motion) {
  'use strict';

  class CountUp extends Component {
    static defaults = {
      value: null,
      from: 0,
      duration: 1.8,
      decimals: 0,
      locale: 'es-CO',
      ease: 'outExpo'
    };

    build() {
      return Utils.el('span', 'dx-countup', this.options.value !== null ? { text: String(this.options.value) } : null);
    }

    ready() {
      this.el.classList.add('dx-countup');
      this.formatter = new Intl.NumberFormat(this.options.locale, {
        minimumFractionDigits: this.options.decimals,
        maximumFractionDigits: this.options.decimals
      });
      const parsed = parseFloat(this.el.textContent.replace(/[^\d.-]/g, ''));
      this.target = this.options.value !== null ? this.options.value : isNaN(parsed) ? 0 : parsed;
      if (Utils.reducedMotion) {
        this.el.textContent = this.formatter.format(this.target);
        return;
      }
      this.el.textContent = this.formatter.format(this.options.from);
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible, entry) => {
        if (visible) this.play();
        else if (entry.boundingClientRect.top < 0) this.revert();
      });
    }

    play() {
      if (this.stopFrames) return;
      const ease = Motion.eases[this.options.ease] || Motion.eases.outExpo;
      const from = this.options.from;
      const to = this.target;
      const duration = Math.max(this.options.duration, 0.001);
      let elapsed = 0;
      this.stopFrames = Ticker.add((time, delta) => {
        elapsed += delta;
        const progress = Utils.clamp(elapsed / duration, 0, 1);
        this.el.textContent = this.formatter.format(from + (to - from) * ease(progress));
        if (progress >= 1) this.halt();
      });
    }

    revert() {
      this.halt();
      this.el.textContent = this.formatter.format(this.options.from);
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return CountUp;
});

;
Dixel.define('GradientText', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class GradientText extends Component {
    static defaults = {
      text: null,
      gradient: 'text',
      animateIn: true,
      duration: 0.9,
      delay: 0
    };

    build() {
      return Utils.el('span', null, this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-gtext', 'dx-gtext--' + this.options.gradient);
      if (!this.options.animateIn || Utils.reducedMotion) {
        this.el.classList.add('dx-gtext--in');
        return;
      }
      this.el.style.transitionDuration = this.options.duration + 's';
      this.el.style.transitionDelay = this.options.delay + 's';
      this.whenVisible((visible, entry) => {
        if (visible) this.el.classList.add('dx-gtext--in');
        else if (entry.boundingClientRect.top < 0) this.el.classList.remove('dx-gtext--in');
      });
    }
  }

  return GradientText;
});

;
Dixel.define('HighlightText', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class HighlightText extends Component {
    static defaults = {
      text: null,
      type: 'marker',
      color: 'primary',
      duration: 0.8,
      delay: 0.1
    };

    build() {
      return Utils.el('span', null, this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-hl', 'dx-hl--' + this.options.type, 'dx-hl--' + this.options.color);
      const textWrap = Utils.el('span', 'dx-hl-text');
      while (this.el.firstChild) textWrap.appendChild(this.el.firstChild);
      this.el.appendChild(textWrap);
      this.ink = Utils.el('span', 'dx-hl-ink', { 'aria-hidden': 'true' });
      this.el.insertBefore(this.ink, textWrap);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-hl--in');
        return;
      }
      this.ink.style.transitionDuration = this.options.duration + 's';
      this.ink.style.transitionDelay = this.options.delay + 's';
      this.whenVisible((visible, entry) => {
        if (visible) this.el.classList.add('dx-hl--in');
        else if (entry.boundingClientRect.top < 0) this.el.classList.remove('dx-hl--in');
      });
    }
  }

  return HighlightText;
});

;
Dixel.define('MarqueeText', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class MarqueeText extends Component {
    static defaults = {
      text: null,
      speed: 70,
      direction: 'left',
      separator: '—',
      pauseOnHover: true
    };

    build() {
      return Utils.el('div', 'dx-marquee');
    }

    ready() {
      this.el.classList.add('dx-marquee');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.textContent = '';
      this.el.setAttribute('aria-label', this.sourceText);
      this.track = Utils.el('div', 'dx-marquee-track', { 'aria-hidden': 'true' });
      this.el.appendChild(this.track);
      this.offset = 0;
      this.groupWidth = 0;
      this.paused = false;
      this.stopFrames = null;
      this.measureQueued = false;
      this.rebuild();
      if (Utils.reducedMotion) return;
      this.listen(window, 'resize', () => this.queueRebuild());
      if (this.options.pauseOnHover && !Utils.isTouch) {
        this.listen(this.el, 'pointerenter', () => {
          this.paused = true;
        });
        this.listen(this.el, 'pointerleave', () => {
          this.paused = false;
        });
      }
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible) this.run();
        else this.halt();
      });
    }

    buildGroup() {
      const group = Utils.el('span', 'dx-marquee-group');
      group.appendChild(Utils.el('span', 'dx-marquee-item', { text: this.sourceText }));
      if (this.options.separator) {
        group.appendChild(Utils.el('span', 'dx-marquee-sep', { text: this.options.separator }));
      }
      return group;
    }

    queueRebuild() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      if (!this.stopRebuildRegistered) {
        this.stopRebuildRegistered = true;
        this.addCleanup(() => {
          if (this.stopRebuild) this.stopRebuild();
        });
      }
      this.stopRebuild = Ticker.add(() => {
        this.stopRebuild();
        this.stopRebuild = null;
        this.measureQueued = false;
        this.rebuild();
      });
    }

    rebuild() {
      this.track.textContent = '';
      const probe = this.buildGroup();
      this.track.appendChild(probe);
      const containerWidth = this.el.clientWidth;
      this.groupWidth = probe.getBoundingClientRect().width;
      if (!this.groupWidth) return;
      const copies = Math.max(Math.ceil(containerWidth / this.groupWidth) + 1, 2);
      for (let i = 1; i < copies; i++) this.track.appendChild(this.buildGroup());
      this.paint();
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add((time, delta) => {
        if (this.paused || !this.groupWidth) return;
        const step = this.options.speed * delta;
        this.offset += this.options.direction === 'right' ? step : -step;
        this.offset %= this.groupWidth;
        this.paint();
      });
    }

    paint() {
      const x = this.offset > 0 ? this.offset - this.groupWidth : this.offset;
      this.track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return MarqueeText;
});

;
Dixel.define('OutlineFillText', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class OutlineFillText extends Component {
    static defaults = {
      text: null,
      gradient: false,
      duration: 1.1,
      delay: 0
    };

    build() {
      return Utils.el('span', 'dx-outline', this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-outline');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.textContent = '';
      this.el.setAttribute('aria-label', this.sourceText);
      this.el.appendChild(Utils.el('span', 'dx-outline-stroke', { text: this.sourceText, 'aria-hidden': 'true' }));
      this.fillMask = Utils.el('span', 'dx-outline-fill', { 'aria-hidden': 'true' });
      const fillText = Utils.el('span', 'dx-outline-fill-text' + (this.options.gradient ? ' dx-gradient-text' : ''), { text: this.sourceText });
      this.fillMask.appendChild(fillText);
      this.el.appendChild(this.fillMask);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-outline--in');
        return;
      }
      const timing = this.options.duration + 's';
      const delay = this.options.delay + 's';
      this.fillMask.style.transitionDuration = timing;
      this.fillMask.style.transitionDelay = delay;
      fillText.style.transitionDuration = timing;
      fillText.style.transitionDelay = delay;
      this.whenVisible((visible, entry) => {
        if (visible) this.el.classList.add('dx-outline--in');
        else if (entry.boundingClientRect.top < 0) this.el.classList.remove('dx-outline--in');
      });
    }
  }

  return OutlineFillText;
});

;
Dixel.define('ScrambleText', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  const CHARSET = '!<>-_\\/[]{}=+*^?#abcdefghijklmnopqrstuvwxyz0123456789';

  class ScrambleText extends Component {
    static defaults = {
      text: null,
      duration: 1.2,
      delay: 0,
      fps: 30
    };

    build() {
      return Utils.el('span', 'dx-scramble', this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-scramble');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.setAttribute('aria-label', this.sourceText);
      this.el.textContent = this.sourceText;
      if (Utils.reducedMotion) return;
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible, entry) => {
        if (visible) this.play();
        else if (entry.boundingClientRect.top < 0) this.revert();
      });
    }

    play() {
      if (this.stopFrames) return;
      const duration = Math.max(this.options.duration, 0.001);
      const frameStep = 1 / this.options.fps;
      let elapsed = -this.options.delay;
      let sinceFrame = frameStep;
      this.stopFrames = Ticker.add((time, delta) => {
        elapsed += delta;
        sinceFrame += delta;
        if (elapsed < 0 || sinceFrame < frameStep) return;
        sinceFrame = 0;
        const progress = Utils.clamp(elapsed / duration, 0, 1);
        this.el.textContent = this.scrambled(progress);
        if (progress >= 1) this.halt();
      });
    }

    scrambled(progress) {
      const source = this.sourceText;
      const lockCount = Math.floor(source.length * progress);
      let output = source.slice(0, lockCount);
      for (let i = lockCount; i < source.length; i++) {
        const char = source[i];
        output += char === ' ' ? ' ' : CHARSET[(Math.random() * CHARSET.length) | 0];
      }
      return output;
    }

    revert() {
      this.halt();
      this.el.textContent = this.sourceText;
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return ScrambleText;
});

;
Dixel.define('SplitText', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class SplitText extends Component {
    static defaults = {
      text: null,
      split: 'chars',
      stagger: 0.03,
      duration: 0.9,
      delay: 0,
      maxStagger: 1.1
    };

    build() {
      return Utils.el('span', 'dx-split', this.options.text ? { text: this.options.text } : null);
    }

    ready() {
      this.el.classList.add('dx-split');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.setAttribute('aria-label', this.sourceText);
      this.resplitQueued = false;
      this.splitUnits(false);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-split--in');
        return;
      }
      if (this.options.split === 'lines') {
        this.listen(window, 'resize', () => this.queueResplit());
      }
      this.whenVisible((visible, entry) => {
        if (visible) {
          this.el.classList.add('dx-split--in');
        } else if (entry.boundingClientRect.top < 0) {
          this.applyTimings(false);
          this.el.classList.remove('dx-split--in');
        }
      });
    }

    queueResplit() {
      if (this.resplitQueued) return;
      this.resplitQueued = true;
      if (!this.stopResplitRegistered) {
        this.stopResplitRegistered = true;
        this.addCleanup(() => {
          if (this.stopResplit) this.stopResplit();
        });
      }
      this.stopResplit = Ticker.add(() => {
        this.stopResplit();
        this.stopResplit = null;
        this.resplitQueued = false;
        this.splitUnits(this.el.classList.contains('dx-split--in'));
      });
    }

    splitUnits(instant) {
      this.units = [];
      if (this.options.split === 'lines') this.splitLines();
      else this.splitInline();
      this.applyTimings(instant);
    }

    splitLines() {
      const words = this.sourceText.split(/\s+/).filter(Boolean);
      this.el.textContent = '';
      const probes = words.map((word, index) => {
        const probe = Utils.el('span', 'dx-split-word', { text: word });
        this.el.appendChild(probe);
        if (index < words.length - 1) this.el.appendChild(document.createTextNode(' '));
        return probe;
      });
      const lines = [];
      let currentTop = null;
      probes.forEach((probe) => {
        if (probe.offsetTop !== currentTop) {
          currentTop = probe.offsetTop;
          lines.push([]);
        }
        lines[lines.length - 1].push(probe.textContent);
      });
      this.el.textContent = '';
      lines.forEach((lineWords) => {
        const mask = Utils.el('span', 'dx-split-mask dx-split-mask--line', { 'aria-hidden': 'true' });
        const unit = Utils.el('span', 'dx-split-unit', { text: lineWords.join(' ') });
        mask.appendChild(unit);
        this.el.appendChild(mask);
        this.units.push(unit);
      });
    }

    splitInline() {
      const words = this.sourceText.split(/\s+/).filter(Boolean);
      this.el.textContent = '';
      words.forEach((word, wordIndex) => {
        const wordWrap = Utils.el('span', 'dx-split-word', { 'aria-hidden': 'true' });
        if (this.options.split === 'chars') {
          Array.from(word).forEach((char) => wordWrap.appendChild(this.buildUnit(char)));
        } else {
          wordWrap.appendChild(this.buildUnit(word));
        }
        this.el.appendChild(wordWrap);
        if (wordIndex < words.length - 1) this.el.appendChild(document.createTextNode(' '));
      });
    }

    buildUnit(text) {
      const mask = Utils.el('span', 'dx-split-mask');
      const unit = Utils.el('span', 'dx-split-unit', { text });
      mask.appendChild(unit);
      this.units.push(unit);
      return mask;
    }

    applyTimings(instant) {
      this.units.forEach((unit, index) => {
        if (instant) {
          unit.style.transition = 'none';
          return;
        }
        unit.style.transition = '';
        unit.style.transitionDuration = this.options.duration + 's';
        unit.style.transitionDelay = (this.options.delay + Math.min(index * this.options.stagger, this.options.maxStagger)).toFixed(3) + 's';
      });
    }
  }

  return SplitText;
});

;
Dixel.define('TypeWriter', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class TypeWriter extends Component {
    static defaults = {
      phrases: [],
      typeSpeed: 16,
      deleteSpeed: 34,
      hold: 1.7,
      gap: 0.4,
      loop: true,
      caret: true
    };

    build() {
      return Utils.el('span', 'dx-type');
    }

    ready() {
      this.el.classList.add('dx-type');
      const initial = this.el.textContent.trim();
      this.phrases = this.options.phrases.length ? this.options.phrases : initial ? [initial] : [];
      this.el.textContent = '';
      this.textEl = Utils.el('span', 'dx-type-text');
      this.el.appendChild(this.textEl);
      if (this.phrases.length) this.el.setAttribute('aria-label', this.phrases[0]);
      if (this.options.caret) {
        this.el.appendChild(Utils.el('span', 'dx-type-caret', { 'aria-hidden': 'true' }));
      }
      if (Utils.reducedMotion || !this.phrases.length) {
        this.textEl.textContent = this.phrases[0] || '';
        return;
      }
      this.phraseIndex = 0;
      this.charCount = 0;
      this.buffer = 0;
      this.wait = 0;
      this.mode = 'typing';
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-type--paused', !visible);
        if (visible) this.run();
        else this.halt();
      });
    }

    run() {
      if (this.stopFrames || this.finished) return;
      this.stopFrames = Ticker.add((time, delta) => this.step(delta));
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    step(delta) {
      if (this.wait > 0) {
        this.wait -= delta;
        return;
      }
      const phrase = this.phrases[this.phraseIndex];
      const speed = this.mode === 'typing' ? this.options.typeSpeed : this.options.deleteSpeed;
      this.buffer += delta * speed;
      if (this.buffer < 1) return;
      const steps = Math.floor(this.buffer);
      this.buffer -= steps;
      if (this.mode === 'typing') {
        this.charCount = Math.min(this.charCount + steps, phrase.length);
        this.textEl.textContent = phrase.slice(0, this.charCount);
        if (this.charCount >= phrase.length) {
          const last = this.phraseIndex === this.phrases.length - 1;
          if (this.phrases.length === 1 || (last && !this.options.loop)) {
            this.finished = true;
            this.halt();
            return;
          }
          this.mode = 'deleting';
          this.wait = this.options.hold;
        }
      } else {
        this.charCount = Math.max(this.charCount - steps, 0);
        this.textEl.textContent = phrase.slice(0, this.charCount);
        if (this.charCount <= 0) {
          this.phraseIndex = (this.phraseIndex + 1) % this.phrases.length;
          this.mode = 'typing';
          this.wait = this.options.gap;
        }
      }
    }
  }

  return TypeWriter;
});

;
Dixel.define('WizardForm', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const checkIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const bigCheckIcon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const chevronIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  class WizardForm extends Component {
    static defaults = {
      steps: [],
      summaryTitle: 'Revisa tu información',
      summaryText: 'Confirma que todo esté correcto antes de enviar.',
      summaryLabel: 'Resumen',
      successTitle: '¡Todo listo!',
      successText: 'Recibimos tu información correctamente.',
      prevLabel: 'Anterior',
      nextLabel: 'Siguiente',
      confirmLabel: 'Confirmar',
      requiredMessage: 'Este campo es obligatorio.',
      emailMessage: 'Ingresa un correo válido.',
      minLengthMessage: 'Usa al menos {n} caracteres.',
      onComplete: null
    };

    build() {
      const el = Utils.el('form', 'dx-wizard dx-reset', { novalidate: '' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const steps = this.options.steps || [];
      const dotLabels = steps.map((step) => step.title).concat([this.options.summaryLabel]);
      const dots = dotLabels.map((label, index) =>
        '<div class="dx-wizard-dot"><span class="dx-wizard-dotmark"><span class="dx-wizard-dotnum">' + (index + 1) + '</span>' +
        '<span class="dx-wizard-dotcheck">' + checkIcon + '</span></span>' +
        '<span class="dx-wizard-dotlabel">' + Utils.escape(label) + '</span></div>'
      ).join('');
      const sections = steps.map((step) => this.stepMarkup(step)).join('');
      return '<header class="dx-wizard-head">' +
        '<div class="dx-wizard-dots">' + dots + '</div>' +
        '<div class="dx-wizard-progress" aria-hidden="true"><span class="dx-wizard-progressfill"></span></div>' +
        '</header>' +
        '<div class="dx-wizard-viewport"><div class="dx-wizard-track">' + sections +
        '<section class="dx-wizard-step dx-wizard-step--summary">' +
        '<h3 class="dx-wizard-steptitle" tabindex="-1">' + Utils.escape(this.options.summaryTitle) + '</h3>' +
        '<p class="dx-wizard-stepdesc">' + Utils.escape(this.options.summaryText) + '</p>' +
        '<dl class="dx-wizard-summary"></dl></section>' +
        '<section class="dx-wizard-step dx-wizard-step--success">' +
        '<span class="dx-wizard-check" aria-hidden="true">' + bigCheckIcon + '</span>' +
        '<h3 class="dx-wizard-steptitle" tabindex="-1">' + Utils.escape(this.options.successTitle) + '</h3>' +
        '<p class="dx-wizard-stepdesc">' + Utils.escape(this.options.successText) + '</p></section>' +
        '</div></div>' +
        '<footer class="dx-wizard-foot">' +
        '<button class="dx-wizard-btn dx-wizard-prev dx-focusable" type="button">' + Utils.escape(this.options.prevLabel) + '</button>' +
        '<span class="dx-wizard-countinfo"></span>' +
        '<button class="dx-wizard-btn dx-wizard-btn--primary dx-wizard-next dx-focusable" type="submit">' + Utils.escape(this.options.nextLabel) + '</button>' +
        '</footer>';
    }

    stepMarkup(step) {
      const description = step.description ? '<p class="dx-wizard-stepdesc">' + Utils.escape(step.description) + '</p>' : '';
      const fields = (step.fields || []).map((field) => this.fieldMarkup(field)).join('');
      return '<section class="dx-wizard-step">' +
        '<h3 class="dx-wizard-steptitle" tabindex="-1">' + Utils.escape(step.title) + '</h3>' + description +
        '<div class="dx-wizard-fields">' + fields + '</div></section>';
    }

    fieldMarkup(field) {
      const id = Utils.uid();
      const errorId = id + '-error';
      const required = field.required ? ' <span class="dx-wizard-req" aria-hidden="true">*</span>' : '';
      let control;
      if (field.type === 'select') {
        const optionList = (field.options || []).map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const label = typeof option === 'string' ? option : option.label;
          const selected = field.value === value ? ' selected' : '';
          return '<option value="' + Utils.escape(value) + '"' + selected + '>' + Utils.escape(label) + '</option>';
        }).join('');
        const placeholder = field.placeholder ? '<option value="" disabled' + (field.value ? '' : ' selected') + '>' + Utils.escape(field.placeholder) + '</option>' : '';
        control = '<span class="dx-wizard-selectwrap"><select class="dx-wizard-input dx-wizard-select" id="' + id + '" name="' + field.name + '" aria-describedby="' + errorId + '">' +
          placeholder + optionList + '</select><span class="dx-wizard-chevron" aria-hidden="true">' + chevronIcon + '</span></span>';
      } else {
        const type = field.type === 'email' ? 'email' : 'text';
        control = '<input class="dx-wizard-input" id="' + id + '" type="' + type + '" name="' + field.name + '"' +
          (field.placeholder ? ' placeholder="' + Utils.escape(field.placeholder) + '"' : '') +
          (field.value ? ' value="' + Utils.escape(field.value) + '"' : '') +
          ' aria-describedby="' + errorId + '" autocomplete="off">';
      }
      return '<div class="dx-wizard-field" data-name="' + field.name + '">' +
        '<label class="dx-wizard-label" for="' + id + '">' + Utils.escape(field.label) + required + '</label>' +
        control + '<span class="dx-wizard-error" id="' + errorId + '" role="alert"></span></div>';
    }

    ready() {
      this.el.classList.add('dx-wizard', 'dx-reset');
      if (!this.el.querySelector('.dx-wizard-track')) this.el.innerHTML = this.markup();
      this.steps = this.options.steps || [];
      this.data = {};
      this.index = 0;
      this.viewport = this.el.querySelector('.dx-wizard-viewport');
      this.track = this.el.querySelector('.dx-wizard-track');
      this.sections = Array.from(this.track.children);
      this.dots = Array.from(this.el.querySelectorAll('.dx-wizard-dot'));
      this.progressFill = this.el.querySelector('.dx-wizard-progressfill');
      this.summaryEl = this.el.querySelector('.dx-wizard-summary');
      this.prevBtn = this.el.querySelector('.dx-wizard-prev');
      this.nextBtn = this.el.querySelector('.dx-wizard-next');
      this.countEl = this.el.querySelector('.dx-wizard-countinfo');
      this.listen(this.el, 'submit', (event) => {
        event.preventDefault();
        this.next();
      });
      this.listen(this.prevBtn, 'click', () => this.prev());
      this.listen(this.el, 'input', (event) => {
        const wrap = event.target.closest('.dx-wizard-field');
        if (wrap) this.clearError(wrap);
      });
      this.listen(window, 'resize', () => this.relayout());
      this.sync(true);
    }

    measureWidth() {
      return this.viewport.clientWidth || 0;
    }

    relayout() {
      const width = this.measureWidth();
      Motion.set(this.track, { x: -this.index * width });
      this.viewport.classList.add('is-instant');
      this.setHeight();
      this.viewport.classList.remove('is-instant');
    }

    setHeight() {
      const section = this.sections[this.index];
      this.viewport.style.height = section.offsetHeight + 'px';
    }

    sync(instant) {
      const total = this.sections.length;
      const lastNavigable = total - 2;
      const success = this.index === total - 1;
      this.sections.forEach((section, index) => {
        const active = index === this.index;
        section.classList.toggle('is-active', active);
        if ('inert' in section) section.inert = !active;
        section.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      this.dots.forEach((dot, index) => {
        dot.classList.toggle('is-active', index === this.index && !success);
        dot.classList.toggle('is-done', index < this.index || success);
      });
      this.progressFill.style.transform = 'scaleX(' + Utils.clamp(this.index / (total - 1), 0, 1) + ')';
      this.el.classList.toggle('is-complete', success);
      this.prevBtn.disabled = this.index === 0;
      this.nextBtn.textContent = this.index === lastNavigable ? this.options.confirmLabel : this.options.nextLabel;
      this.countEl.textContent = success ? '' : 'Paso ' + (this.index + 1) + ' de ' + (lastNavigable + 1);
      if (instant) {
        Motion.set(this.track, { x: -this.index * this.measureWidth() });
        this.setHeight();
      }
    }

    next() {
      const summaryIndex = this.sections.length - 2;
      if (this.index < this.steps.length) {
        if (!this.validate(this.index)) return;
        this.collect(this.index);
        if (this.index + 1 === summaryIndex) this.fillSummary();
        this.goTo(this.index + 1);
      } else if (this.index === summaryIndex) {
        if (this.options.onComplete) this.options.onComplete(Object.assign({}, this.data));
        this.goTo(this.index + 1);
      }
    }

    prev() {
      if (this.index === 0 || this.index === this.sections.length - 1) return;
      this.goTo(this.index - 1);
    }

    goTo(index) {
      this.index = index;
      const width = this.measureWidth();
      Motion.to(this.track, { x: -index * width, duration: 0.5, ease: 'inOut' });
      this.setHeight();
      this.sync(false);
      const heading = this.sections[index].querySelector('.dx-wizard-steptitle');
      if (heading) heading.focus({ preventScroll: true });
    }

    fieldsOf(stepIndex) {
      return Array.from(this.sections[stepIndex].querySelectorAll('.dx-wizard-field')).map((wrap) => {
        const name = wrap.getAttribute('data-name');
        const config = (this.steps[stepIndex].fields || []).find((field) => field.name === name) || {};
        return { wrap, config, input: wrap.querySelector('.dx-wizard-input'), errorEl: wrap.querySelector('.dx-wizard-error') };
      });
    }

    validate(stepIndex) {
      let firstInvalid = null;
      this.fieldsOf(stepIndex).forEach((field) => {
        const value = field.input.value.trim();
        let message = '';
        if (field.config.required && !value) message = this.options.requiredMessage;
        else if (value && field.config.type === 'email' && !emailPattern.test(value)) message = this.options.emailMessage;
        else if (value && field.config.minLength && value.length < field.config.minLength) {
          message = this.options.minLengthMessage.replace('{n}', field.config.minLength);
        }
        if (message) {
          this.showError(field, message);
          if (!firstInvalid) firstInvalid = field;
        } else {
          this.clearError(field.wrap);
        }
      });
      if (firstInvalid) {
        this.shake(this.sections[stepIndex]);
        firstInvalid.input.focus();
        return false;
      }
      return true;
    }

    showError(field, message) {
      field.errorEl.textContent = message;
      field.wrap.classList.add('is-invalid');
      field.input.setAttribute('aria-invalid', 'true');
    }

    clearError(wrap) {
      if (!wrap.classList.contains('is-invalid')) return;
      wrap.classList.remove('is-invalid');
      wrap.querySelector('.dx-wizard-error').textContent = '';
      wrap.querySelector('.dx-wizard-input').removeAttribute('aria-invalid');
    }

    shake(section) {
      if (Utils.reducedMotion) return;
      section.classList.remove('is-shake');
      void section.offsetWidth;
      section.classList.add('is-shake');
      const unbind = Utils.on(section, 'animationend', () => {
        section.classList.remove('is-shake');
        unbind();
      });
    }

    collect(stepIndex) {
      this.fieldsOf(stepIndex).forEach((field) => {
        this.data[field.config.name] = field.input.value.trim();
      });
    }

    displayValue(field) {
      const value = this.data[field.name] || '';
      if (field.type === 'select' && value) {
        const option = (field.options || []).find((item) => (typeof item === 'string' ? item : item.value) === value);
        if (option) return typeof option === 'string' ? option : option.label;
      }
      return value || '—';
    }

    fillSummary() {
      this.summaryEl.innerHTML = this.steps.map((step) =>
        (step.fields || []).map((field) =>
          '<div class="dx-wizard-sumrow"><dt>' + Utils.escape(field.label) + '</dt><dd>' + Utils.escape(this.displayValue(field)) + '</dd></div>'
        ).join('')
      ).join('');
      this.setHeight();
    }
  }

  return WizardForm;
});

;
Dixel.define('AuroraVeil', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class AuroraVeil extends Component {
    static defaults = { veils: 3, drift: 40, speed: 0.1 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.el.classList.add('dx-aurora');
      this.veils = [];
      for (let i = 0; i < this.options.veils; i++) {
        const node = Utils.el('div', 'dx-aurora-veil dx-aurora-veil--' + ((i % 3) + 1));
        this.el.appendChild(node);
        this.veils.push({
          node,
          angle: -24 + i * 12,
          phase: Math.random() * Math.PI * 2,
          speed: this.options.speed * (0.7 + i * 0.25)
        });
      }
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      if (Utils.reducedMotion) {
        for (let i = 0; i < this.veils.length; i++) {
          this.veils[i].node.style.transform = 'rotate(' + this.veils[i].angle + 'deg)';
        }
        return;
      }
      this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.range = rect.width * 0.08 + this.options.drift;
    }

    update(time) {
      if (!this.visible) return;
      for (let i = 0; i < this.veils.length; i++) {
        const veil = this.veils[i];
        const x = Math.sin(time * veil.speed + veil.phase) * this.range;
        const stretch = 1 + 0.18 * Math.sin(time * veil.speed * 0.8 + veil.phase * 2);
        veil.node.style.transform =
          'translate3d(' + x + 'px,0,0) rotate(' + veil.angle + 'deg) scaleY(' + stretch + ')';
      }
    }
  }

  return AuroraVeil;
});

;
Dixel.define('GradientMesh', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class GradientMesh extends Component {
    static defaults = { blobs: 4, range: 0.16 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.el.classList.add('dx-mesh');
      this.blobs = [];
      for (let i = 0; i < this.options.blobs; i++) {
        const node = Utils.el('div', 'dx-mesh-blob dx-mesh-blob--' + ((i % 4) + 1));
        this.el.appendChild(node);
        this.blobs.push({
          node,
          phase: Math.random() * Math.PI * 2,
          speedX: 0.05 + Math.random() * 0.07,
          speedY: 0.04 + Math.random() * 0.06,
          speedS: 0.03 + Math.random() * 0.05
        });
      }
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      if (!Utils.reducedMotion) this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.rangeX = rect.width * this.options.range;
      this.rangeY = rect.height * this.options.range;
    }

    update(time) {
      if (!this.visible) return;
      for (let i = 0; i < this.blobs.length; i++) {
        const blob = this.blobs[i];
        const x = Math.sin(time * blob.speedX + blob.phase) * this.rangeX;
        const y = Math.cos(time * blob.speedY + blob.phase * 1.4) * this.rangeY;
        const scale = 1 + 0.1 * Math.sin(time * blob.speedS + blob.phase * 2);
        blob.node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + scale + ')';
      }
    }
  }

  return GradientMesh;
});

;
Dixel.define('GridPulse', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class GridPulse extends Component {
    static defaults = { gap: 46, dotSize: 2.2, speed: 2.4, wavelength: 150, mode: 'pointer' };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.color = Utils.token('primary', '#6d5cff');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.docLeft = 0;
      this.docTop = 0;
      this.usePointer = this.options.mode === 'pointer' && !Utils.isTouch;
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw(0, this.width / 2, this.height / 2);
      });
      if (!Utils.reducedMotion) {
        if (this.usePointer) this.addCleanup(Pointer.use());
        this.onFrame(this.update);
      }
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const rect = this.canvas.getBoundingClientRect();
      this.docLeft = rect.left;
      this.docTop = rect.top + window.scrollY;
      const areaScale = Math.max(1, Math.sqrt((this.width * this.height) / (1440 * 810)));
      this.gap = this.options.gap * areaScale * (Utils.isTouch ? 1.3 : 1);
      this.cols = Math.ceil(this.width / this.gap) + 1;
      this.rows = Math.ceil(this.height / this.gap) + 1;
      this.context.fillStyle = this.color;
    }

    update(time) {
      if (!this.visible) return;
      let originX = this.width / 2;
      let originY = this.height / 2;
      if (this.usePointer) {
        originX = Utils.clamp(Pointer.smoothX - this.docLeft, 0, this.width);
        originY = Utils.clamp(Pointer.smoothY - (this.docTop - window.scrollY), 0, this.height);
      }
      this.draw(time, originX, originY);
    }

    draw(time, originX, originY) {
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      const wave = (Math.PI * 2) / this.options.wavelength;
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const x = col * this.gap;
          const y = row * this.gap;
          const dx = x - originX;
          const dy = y - originY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const lit = Math.max(Math.sin(dist * wave - time * this.options.speed), 0);
          ctx.globalAlpha = 0.12 + 0.5 * lit;
          const radius = this.options.dotSize * (0.6 + 0.7 * lit);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  return GridPulse;
});

;
Dixel.define('NoiseGrain', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class NoiseGrain extends Component {
    static defaults = { opacity: 0.08 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.el.classList.add('dx-noise');
      this.layer = Utils.el('div', 'dx-noise-layer');
      this.layer.style.opacity = String(this.options.opacity);
      this.el.appendChild(this.layer);
      this.whenVisible((visible) => {
        this.layer.classList.toggle('is-paused', !visible);
      });
    }
  }

  return NoiseGrain;
});

;
Dixel.define('ParticleField', ['Component', 'Pointer', 'Utils', 'ShapeMask'], function (Component, Pointer, Utils, ShapeMask) {
  'use strict';

  class ParticleField extends Component {
    static defaults = {
      density: 14000,
      maxParticles: 90,
      linkDistance: 110,
      repelRadius: 130,
      repelForce: 900,
      speed: 18,
      shape: null,
      shapeTarget: null,
      shapeParticles: 260,
      shapeSpring: 26,
      shapeWander: 3
    };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.color = Utils.token('primary', '#6d5cff');
        this.linkColor = Utils.token('cyan', '#2ee6d6');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.particles = [];
      this.docLeft = 0;
      this.docTop = 0;
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw();
      });
      if (!Utils.reducedMotion) {
        if (!Utils.isTouch) this.addCleanup(Pointer.use());
        this.onFrame(this.update);
      }
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const rect = this.canvas.getBoundingClientRect();
      this.docLeft = rect.left;
      this.docTop = rect.top + window.scrollY;
      if (this.options.shape === 'text') {
        this.seedShape();
        return;
      }
      const divisor = Utils.isTouch ? this.options.density * 2 : this.options.density;
      const count = Math.min(
        Math.max(Math.round((this.width * this.height) / divisor), 12),
        this.options.maxParticles
      );
      while (this.particles.length < count) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          bx: (Math.random() - 0.5) * this.options.speed * 2,
          by: (Math.random() - 0.5) * this.options.speed * 2,
          vx: 0,
          vy: 0,
          radius: 1 + Math.random() * 1.6
        });
      }
      this.particles.length = count;
    }

    seedShape() {
      const target = this.options.shapeTarget
        ? (typeof this.options.shapeTarget === 'string'
          ? this.el.parentElement.querySelector(this.options.shapeTarget)
          : this.options.shapeTarget)
        : this.el.parentElement || this.el;
      if (!target) return;
      const mask = ShapeMask.textMask(target, 1);
      let step = 3;
      let points = ShapeMask.samplePoints(mask.canvas, step);
      while (points.length > this.options.shapeParticles && step < 24) {
        step += 1;
        points = ShapeMask.samplePoints(mask.canvas, step);
      }
      const hostRect = this.el.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetX = targetRect.left - hostRect.left;
      const offsetY = targetRect.top - hostRect.top;
      this.particles = points.map((point) => {
        const hx = offsetX + point.x * targetRect.width;
        const hy = offsetY + point.y * targetRect.height;
        return {
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          hx,
          hy,
          phase: Math.random() * Math.PI * 2,
          wobble: 0.6 + Math.random() * 0.9,
          bx: 0,
          by: 0,
          vx: 0,
          vy: 0,
          radius: 1 + Math.random() * 1.4
        };
      });
    }

    update(time, delta) {
      if (!this.visible) return;
      const usePointer = !Utils.isTouch;
      const pointerX = Pointer.smoothX - this.docLeft;
      const pointerY = Pointer.smoothY - (this.docTop - window.scrollY);
      const repelRadius = this.options.repelRadius;
      const friction = Math.exp(-2.5 * delta);
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        if (usePointer) {
          const dx = particle.x - pointerX;
          const dy = particle.y - pointerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < repelRadius && dist > 0.001) {
            const push = (1 - dist / repelRadius) * this.options.repelForce * delta;
            particle.vx += (dx / dist) * push;
            particle.vy += (dy / dist) * push;
          }
        }
        if (particle.hx !== undefined) {
          const wander = this.options.shapeWander;
          const homeX = particle.hx + Math.sin(time * particle.wobble + particle.phase) * wander;
          const homeY = particle.hy + Math.cos(time * particle.wobble * 0.8 + particle.phase) * wander;
          particle.vx += (homeX - particle.x) * this.options.shapeSpring * delta;
          particle.vy += (homeY - particle.y) * this.options.shapeSpring * delta;
          particle.vx *= Math.exp(-4.5 * delta);
          particle.vy *= Math.exp(-4.5 * delta);
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          continue;
        }
        particle.x += (particle.bx + particle.vx) * delta;
        particle.y += (particle.by + particle.vy) * delta;
        particle.vx *= friction;
        particle.vy *= friction;
        if (particle.x < -12) particle.x = this.width + 12;
        else if (particle.x > this.width + 12) particle.x = -12;
        if (particle.y < -12) particle.y = this.height + 12;
        else if (particle.y > this.height + 12) particle.y = -12;
      }
      this.draw();
    }

    draw() {
      const ctx = this.context;
      const list = this.particles;
      ctx.clearRect(0, 0, this.width, this.height);
      const linkDistance = this.options.linkDistance;
      const linkSq = linkDistance * linkDistance;
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.linkColor;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const dx = list[i].x - list[j].x;
          const dy = list[i].y - list[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq > linkSq) continue;
          ctx.globalAlpha = (1 - Math.sqrt(distSq) / linkDistance) * 0.35;
          ctx.beginPath();
          ctx.moveTo(list[i].x, list[i].y);
          ctx.lineTo(list[j].x, list[j].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = this.color;
      for (let i = 0; i < list.length; i++) {
        ctx.beginPath();
        ctx.arc(list[i].x, list[i].y, list[i].radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  return ParticleField;
});

;
Dixel.define('StarField', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class StarField extends Component {
    static defaults = { density: 9000, maxStars: 220, parallax: 26, twinkle: 1.6 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.color = Utils.token('ink', '#f2f2fa');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.stars = [];
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw(0, 0, 0);
      });
      if (!Utils.reducedMotion) {
        if (!Utils.isTouch) this.addCleanup(Pointer.use());
        this.onFrame(this.update);
      }
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const divisor = Utils.isTouch ? this.options.density * 1.8 : this.options.density;
      const count = Math.min(
        Math.max(Math.round((this.width * this.height) / divisor), 24),
        this.options.maxStars
      );
      while (this.stars.length < count) {
        this.stars.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          depth: 0.25 + Math.random() * 0.75,
          phase: Math.random() * Math.PI * 2,
          radius: 0.4 + Math.random() * 1.3
        });
      }
      this.stars.length = count;
    }

    update(time) {
      if (!this.visible) return;
      let normalX = 0;
      let normalY = 0;
      if (!Utils.isTouch) {
        normalX = (Pointer.smoothX / Math.max(innerWidth, 1)) * 2 - 1;
        normalY = (Pointer.smoothY / Math.max(innerHeight, 1)) * 2 - 1;
      }
      this.draw(time, normalX, normalY);
    }

    draw(time, normalX, normalY) {
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.fillStyle = this.color;
      const parallax = this.options.parallax;
      const twinkle = this.options.twinkle;
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];
        const x = (star.x - normalX * parallax * star.depth + this.width) % this.width;
        const y = (star.y - normalY * parallax * star.depth + this.height) % this.height;
        const pulse = 0.5 + 0.5 * Math.sin(time * twinkle * (0.6 + star.depth) + star.phase);
        ctx.globalAlpha = 0.25 + 0.75 * pulse * star.depth;
        ctx.beginPath();
        ctx.arc(x, y, star.radius * star.depth, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  return StarField;
});

;
Dixel.define('WaveLines', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class WaveLines extends Component {
    static defaults = { lines: 5, amplitude: 16, wavelength: 320, speed: 0.9 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.colorA = Utils.token('primary', '#6d5cff');
        this.colorB = Utils.token('cyan', '#2ee6d6');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw(0);
      });
      if (!Utils.reducedMotion) this.onFrame(this.update);
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      this.segments = Math.max(24, Math.round(this.width / (Utils.isTouch ? 40 : 26)));
      const gradient = this.context.createLinearGradient(0, 0, size.width, 0);
      gradient.addColorStop(0, this.colorA);
      gradient.addColorStop(1, this.colorB);
      this.context.strokeStyle = gradient;
      this.context.lineWidth = 1.2;
    }

    update(time) {
      if (!this.visible) return;
      this.draw(time);
    }

    draw(time) {
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      const lines = this.options.lines;
      const step = this.width / this.segments;
      const wave = (Math.PI * 2) / this.options.wavelength;
      for (let line = 0; line < lines; line++) {
        const baseY = (this.height * (line + 1)) / (lines + 1);
        const phase = line * 0.85;
        const amplitude = this.options.amplitude * (1 - line * 0.06);
        ctx.globalAlpha = 0.55 - (line / lines) * 0.35;
        ctx.beginPath();
        for (let segment = 0; segment <= this.segments; segment++) {
          const x = segment * step;
          const y = baseY + Math.sin(x * wave + time * this.options.speed + phase) * amplitude;
          if (segment === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  return WaveLines;
});

;
Dixel.define('ClickBurst', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  function outExpo(progress) {
    return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
  }

  class ClickBurst extends Component {
    static defaults = {
      bursts: 3,
      sparks: 5,
      ringSize: 90,
      spread: 130,
      friction: 3.4,
      duration: 0.6,
      sparkLength: 34
    };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.slots = [];
      for (let i = 0; i < this.options.bursts; i++) {
        this.slots.push(this.createSlot());
      }
      this.nextSlot = 0;
      this.running = false;
      this.addCleanup(Pointer.use());
      this.listen(window, 'pointerdown', (event) => this.spawn(event.clientX, event.clientY));
      this.onFrame(this.update, true);
    }

    createSlot() {
      const ringNode = Utils.el('div', 'dx-burst-ring');
      ringNode.style.width = ringNode.style.height = this.options.ringSize + 'px';
      this.el.appendChild(ringNode);
      const sparks = [];
      for (let i = 0; i < this.options.sparks; i++) {
        const node = Utils.el('div', 'dx-burst-spark');
        node.style.width = this.options.sparkLength + 'px';
        this.el.appendChild(node);
        sparks.push({ node, life: 0, total: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
      }
      return { ring: { node: ringNode, life: 0, total: 1, x: 0, y: 0 }, sparks };
    }

    spawn(x, y) {
      const slot = this.slots[this.nextSlot];
      this.nextSlot = (this.nextSlot + 1) % this.slots.length;
      const duration = this.options.duration;
      const spread = this.options.spread;
      slot.ring.life = slot.ring.total = duration;
      slot.ring.x = x;
      slot.ring.y = y;
      const base = Math.random() * Math.PI * 2;
      for (let i = 0; i < slot.sparks.length; i++) {
        const spark = slot.sparks[i];
        const angle = base + (i / slot.sparks.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = spread * (2.6 + Math.random() * 1.4);
        spark.x = x;
        spark.y = y;
        spark.vx = Math.cos(angle) * speed;
        spark.vy = Math.sin(angle) * speed;
        spark.angle = (angle * 180) / Math.PI;
        spark.life = spark.total = duration * (0.55 + Math.random() * 0.25);
      }
      this.running = true;
    }

    update(time, delta) {
      if (!this.running) return;
      const drag = Math.exp(-this.options.friction * delta);
      const ringHalf = this.options.ringSize / 2;
      let alive = 0;
      for (let s = 0; s < this.slots.length; s++) {
        const slot = this.slots[s];
        const ring = slot.ring;
        if (ring.life > 0) {
          ring.life -= delta;
          if (ring.life <= 0) {
            ring.node.style.opacity = '0';
          } else {
            alive++;
            const progress = 1 - ring.life / ring.total;
            const eased = outExpo(progress);
            ring.node.style.transform =
              'translate3d(' + (ring.x - ringHalf) + 'px,' + (ring.y - ringHalf) + 'px,0) scale(' + (0.15 + eased * 1.05) + ')';
            ring.node.style.opacity = String(0.9 * (1 - progress));
          }
        }
        for (let i = 0; i < slot.sparks.length; i++) {
          const spark = slot.sparks[i];
          if (spark.life <= 0) continue;
          spark.life -= delta;
          if (spark.life <= 0) {
            spark.node.style.opacity = '0';
            continue;
          }
          alive++;
          spark.vx *= drag;
          spark.vy *= drag;
          spark.x += spark.vx * delta;
          spark.y += spark.vy * delta;
          const progress = 1 - spark.life / spark.total;
          const shrink = Math.max(1 - outExpo(progress), 0.02);
          spark.node.style.transform =
            'translate3d(' + spark.x + 'px,' + (spark.y - 1) + 'px,0) rotate(' + spark.angle + 'deg) scaleX(' + shrink + ')';
          spark.node.style.opacity = String(1 - progress);
        }
      }
      if (!alive) this.running = false;
    }
  }

  return ClickBurst;
});

;
Dixel.define('CursorDot', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorDot extends Component {
    static defaults = {
      size: 8,
      ringSize: 38,
      lag: 15,
      hoverScale: 1.8,
      blend: true,
      hideNative: false
    };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      const blend = this.options.blend ? ' dx-cursor-blend' : '';
      this.ring = Utils.el('div', 'dx-cursor-ring' + blend);
      this.dot = Utils.el('div', 'dx-cursor-dot' + blend);
      this.ring.style.width = this.ring.style.height = this.options.ringSize + 'px';
      this.dot.style.width = this.dot.style.height = this.options.size + 'px';
      this.el.appendChild(this.ring);
      this.el.appendChild(this.dot);
      this.ringX = Pointer.x;
      this.ringY = Pointer.y;
      this.scale = 1;
      this.targetScale = 1;
      this.settled = false;
      if (this.options.hideNative) {
        document.documentElement.classList.add('dx-cursor-hide');
        this.addCleanup(() => document.documentElement.classList.remove('dx-cursor-hide'));
      }
      this.addCleanup(Pointer.use());
      this.listen(document, 'pointerover', (event) => {
        const target = event.target.closest ? event.target.closest('[data-cursor="hover"]') : null;
        this.targetScale = target ? this.options.hoverScale : 1;
      });
      this.listen(document.documentElement, 'pointerleave', () => this.el.classList.add('is-out'));
      this.listen(document.documentElement, 'pointerenter', () => this.el.classList.remove('is-out'));
      this.onFrame(this.update, true);
    }

    update(time, delta) {
      const targetX = Pointer.x;
      const targetY = Pointer.y;
      this.ringX = Utils.damp(this.ringX, targetX, this.options.lag, delta);
      this.ringY = Utils.damp(this.ringY, targetY, this.options.lag, delta);
      this.scale = Utils.damp(this.scale, this.targetScale, 10, delta);
      const idle =
        Math.abs(this.ringX - targetX) < 0.05 &&
        Math.abs(this.ringY - targetY) < 0.05 &&
        Math.abs(this.scale - this.targetScale) < 0.002;
      if (idle && this.settled) return;
      this.settled = idle;
      const dotHalf = this.options.size / 2;
      const ringHalf = this.options.ringSize / 2;
      this.dot.style.transform = 'translate3d(' + (targetX - dotHalf) + 'px,' + (targetY - dotHalf) + 'px,0)';
      this.ring.style.transform =
        'translate3d(' + (this.ringX - ringHalf) + 'px,' + (this.ringY - ringHalf) + 'px,0) scale(' + this.scale + ')';
    }
  }

  return CursorDot;
});

;
Dixel.define('CursorGlow', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorGlow extends Component {
    static defaults = { size: 520, lag: 10, opacity: 0.6, tint: 'primary' };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.glow = Utils.el('div', 'dx-cursor-glow dx-cursor-glow--' + this.options.tint);
      this.glow.style.width = this.glow.style.height = this.options.size + 'px';
      this.glow.style.opacity = String(this.options.opacity);
      this.el.appendChild(this.glow);
      this.x = Pointer.x;
      this.y = Pointer.y;
      this.settled = false;
      this.addCleanup(Pointer.use());
      this.onFrame(this.update, true);
    }

    update(time, delta) {
      const targetX = Pointer.x;
      const targetY = Pointer.y;
      this.x = Utils.damp(this.x, targetX, this.options.lag, delta);
      this.y = Utils.damp(this.y, targetY, this.options.lag, delta);
      const idle = Math.abs(this.x - targetX) < 0.05 && Math.abs(this.y - targetY) < 0.05;
      if (idle && this.settled) return;
      this.settled = idle;
      const half = this.options.size / 2;
      this.glow.style.transform = 'translate3d(' + (this.x - half) + 'px,' + (this.y - half) + 'px,0)';
    }
  }

  return CursorGlow;
});

;
Dixel.define('CursorRibbon', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorRibbon extends Component {
    static defaults = { points: 26, width: 9, lag: 22 };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.canvas = Utils.el('canvas', 'dx-cursor-ribbon');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.colorA = Utils.token('primary', '#6d5cff');
        this.colorB = Utils.token('cyan', '#2ee6d6');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.trail = [];
      for (let i = 0; i < this.options.points; i++) {
        this.trail.push({ x: Pointer.x, y: Pointer.y });
      }
      this.cleared = true;
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.addCleanup(Pointer.use());
      this.onFrame(this.update, true);
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const gradient = this.context.createLinearGradient(0, 0, size.width, size.height);
      gradient.addColorStop(0, this.colorA);
      gradient.addColorStop(1, this.colorB);
      this.context.strokeStyle = gradient;
      this.context.lineCap = 'round';
      this.context.lineJoin = 'round';
    }

    update(time, delta) {
      const trail = this.trail;
      const first = trail[0];
      first.x = Pointer.x;
      first.y = Pointer.y;
      let leadX = first.x;
      let leadY = first.y;
      let spread = 0;
      for (let i = 1; i < trail.length; i++) {
        const point = trail[i];
        point.x = Utils.damp(point.x, leadX, this.options.lag, delta);
        point.y = Utils.damp(point.y, leadY, this.options.lag, delta);
        spread = Math.max(spread, Math.abs(point.x - leadX), Math.abs(point.y - leadY));
        leadX = point.x;
        leadY = point.y;
      }
      if (spread < 0.4) {
        if (!this.cleared) {
          this.context.clearRect(0, 0, this.width, this.height);
          this.cleared = true;
        }
        return;
      }
      this.cleared = false;
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      const count = trail.length - 1;
      for (let i = 0; i < count; i++) {
        const fade = 1 - i / count;
        ctx.globalAlpha = fade;
        ctx.lineWidth = Math.max(this.options.width * fade, 0.5);
        ctx.beginPath();
        ctx.moveTo(trail[i].x, trail[i].y);
        ctx.lineTo(trail[i + 1].x, trail[i + 1].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  return CursorRibbon;
});

;
Dixel.define('CursorStyle', ['Component', 'Pointer', 'Icon', 'Utils'], function (Component, Pointer, Icon, Utils) {
  'use strict';

  const stateIcons = { pointer: 'target', grab: 'move', text: 'type', zoom: 'zoomIn' };

  class CursorStyle extends Component {
    static defaults = {
      icon: 'navigation',
      size: 22,
      strokeWidth: 2,
      tint: 'primary',
      rotate: false,
      scope: null,
      states: null
    };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.scope = this.resolveScope();
      this.states = Object.assign({}, stateIcons, this.options.states || {});
      this.current = null;
      this.icon = Utils.el('div', 'dx-cursor-style dx-cursor-style--' + this.options.tint);
      this.el.appendChild(this.icon);
      this.swap(this.options.icon);
      this.angle = 0;
      this.scope.classList.add('dx-cursor-hide');
      this.addCleanup(() => this.scope.classList.remove('dx-cursor-hide'));
      this.addCleanup(Pointer.use());
      const global = this.scope === document.documentElement;
      const edge = global ? document.documentElement : this.scope;
      if (!global) this.el.classList.add('is-out');
      this.listen(edge, 'pointerenter', () => this.el.classList.remove('is-out'));
      this.listen(edge, 'pointerleave', () => this.el.classList.add('is-out'));
      this.listen(this.scope, 'pointerover', (event) => {
        const target = event.target.closest ? event.target.closest('[data-cursor]') : null;
        const state = target ? this.states[target.getAttribute('data-cursor')] : null;
        this.swap(state || this.options.icon);
      });
      this.onFrame(this.update, true);
    }

    resolveScope() {
      const scope = this.options.scope;
      if (!scope) return document.documentElement;
      if (typeof scope === 'string') return document.querySelector(scope) || document.documentElement;
      return scope.el || scope;
    }

    swap(name) {
      if (name === this.current) return;
      this.current = name;
      this.icon.innerHTML = Icon.svg(name, this.options.size, this.options.strokeWidth);
    }

    update(time, delta) {
      const half = this.options.size / 2;
      let rotation = '';
      if (this.options.rotate) {
        const target = Utils.clamp(Pointer.velocityX * 0.02, -24, 24);
        this.angle = Utils.damp(this.angle, target, 8, delta);
        rotation = ' rotate(' + this.angle.toFixed(2) + 'deg)';
      }
      this.icon.style.transform = 'translate3d(' + (Pointer.x - half) + 'px,' + (Pointer.y - half) + 'px,0)' + rotation;
    }
  }

  return CursorStyle;
});

;
Dixel.define('CursorTrail', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorTrail extends Component {
    static defaults = { count: 12, size: 9, lag: 17, blend: false };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      const blend = this.options.blend ? ' dx-cursor-blend' : '';
      this.points = [];
      for (let i = 0; i < this.options.count; i++) {
        const node = Utils.el('div', 'dx-cursor-trail-dot' + blend);
        node.style.width = node.style.height = this.options.size + 'px';
        node.style.opacity = String(1 - i / this.options.count);
        this.el.appendChild(node);
        this.points.push({ node, x: Pointer.x, y: Pointer.y });
      }
      this.settled = false;
      this.addCleanup(Pointer.use());
      this.onFrame(this.update, true);
    }

    update(time, delta) {
      const first = this.points[0];
      let maxMove = Math.max(Math.abs(Pointer.x - first.x), Math.abs(Pointer.y - first.y));
      first.x = Pointer.x;
      first.y = Pointer.y;
      let leadX = first.x;
      let leadY = first.y;
      for (let i = 1; i < this.points.length; i++) {
        const point = this.points[i];
        const nextX = Utils.damp(point.x, leadX, this.options.lag, delta);
        const nextY = Utils.damp(point.y, leadY, this.options.lag, delta);
        maxMove = Math.max(maxMove, Math.abs(nextX - point.x), Math.abs(nextY - point.y));
        point.x = nextX;
        point.y = nextY;
        leadX = point.x;
        leadY = point.y;
      }
      if (maxMove < 0.02) {
        if (this.settled) return;
        this.settled = true;
      } else {
        this.settled = false;
      }
      const half = this.options.size / 2;
      for (let i = 0; i < this.points.length; i++) {
        const point = this.points[i];
        const shrink = 1 - (i / this.points.length) * 0.75;
        point.node.style.transform =
          'translate3d(' + (point.x - half) + 'px,' + (point.y - half) + 'px,0) scale(' + shrink + ')';
      }
    }
  }

  return CursorTrail;
});

;
Dixel.define('DragManager', ['Utils'], function (Utils) {
  'use strict';

  const zones = [];
  let drag = null;
  let currentZone = null;
  let originZone = null;
  let unbindScroll = null;
  let measureDirty = false;

  function register(zone) {
    zones.push(zone);
    return () => {
      const index = zones.indexOf(zone);
      if (index >= 0) zones.splice(index, 1);
      if (currentZone === zone) currentZone = null;
      if (originZone === zone) originZone = null;
      if (drag) drag.zones = drag.zones.filter((active) => active !== zone);
    };
  }

  function measureAll() {
    drag.zones = zones.filter((zone) => zone.el && zone.el.isConnected && zone.acceptsDrag(drag));
    drag.zones.forEach((zone) => zone.measure(drag));
    measureDirty = false;
  }

  function zoneAt(x, y) {
    let best = null;
    let bestArea = Infinity;
    drag.zones.forEach((zone) => {
      const rect = zone.zoneRect;
      if (!rect) return;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
      const area = (rect.right - rect.left) * (rect.bottom - rect.top);
      if (area < bestArea) {
        bestArea = area;
        best = zone;
      }
    });
    return best;
  }

  function start(state) {
    if (drag) cancel();
    drag = state;
    currentZone = null;
    measureAll();
    originZone = drag.mode === 'move' && drag.el
      ? drag.zones.find((zone) => zone.el.contains(drag.el)) || null
      : null;
    if (originZone) originZone.showCollapsed(drag);
    unbindScroll = Utils.on(window, 'scroll', () => {
      measureDirty = true;
    }, { capture: true, passive: true });
  }

  function move(x, y) {
    if (!drag) return;
    if (measureDirty) measureAll();
    const zone = zoneAt(x, y);
    if (zone !== currentZone) {
      if (currentZone) currentZone.dragLeave(drag);
      currentZone = zone;
      if (zone) zone.dragEnter(drag);
      else if (originZone) originZone.showCollapsed(drag);
    }
    if (zone) zone.dragOver(drag, x, y);
  }

  function drop(x, y) {
    if (!drag) return null;
    if (measureDirty) measureAll();
    const zone = zoneAt(x, y);
    const others = drag.zones.filter((active) => active !== zone);
    const result = zone ? zone.receiveDrop(drag, x, y) : null;
    others.forEach((active) => active.resetPreview(!result));
    end();
    return result;
  }

  function cancel() {
    if (!drag) return;
    drag.zones.forEach((zone) => zone.resetPreview(true));
    end();
  }

  function end() {
    if (unbindScroll) {
      unbindScroll();
      unbindScroll = null;
    }
    drag = null;
    currentZone = null;
    originZone = null;
    measureDirty = false;
  }

  return {
    register,
    start,
    move,
    drop,
    cancel,
    get active() {
      return !!drag;
    }
  };
});

;
Dixel.define('Draggable', ['Component', 'DragManager', 'Motion', 'Utils'], function (Component, DragManager, Motion, Utils) {
  'use strict';

  class Draggable extends Component {
    static defaults = {
      handle: null,
      payload: null,
      mode: 'move',
      ghost: null,
      longPress: 260,
      tilt: true,
      disabled: false,
      onStart: null,
      onEnd: null
    };

    build() {
      return Utils.el('div', 'dx-draggable');
    }

    attach(el) {
      return super.attach(el && el.el instanceof Element ? el.el : el);
    }

    ready() {
      const host = this.el;
      host.__dxDraggable = this;
      host.classList.add('dx-draggable');
      this.press = null;
      this.drag = null;
      this.listen(host, 'pointerdown', this.onPress);
      this.addCleanup(() => {
        this.teardownPress();
        if (this.drag) {
          DragManager.cancel();
          this.drag.ghost.remove();
          this.drag = null;
        }
        document.body.classList.remove('dx-dragging');
        host.classList.remove('dx-draggable', 'dx-drag-origin');
        delete host.__dxDraggable;
      });
    }

    destroy() {
      if (this.destroyed) return;
      this.owned = false;
      super.destroy();
    }

    onPress(event) {
      if (this.options.disabled || this.press || this.drag || DragManager.active) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (this.options.handle && !event.target.closest(this.options.handle)) return;
      const touch = event.pointerType === 'touch';
      const pointerId = event.pointerId;
      this.press = {
        startX: event.clientX,
        startY: event.clientY,
        touch,
        pointerId,
        timer: null,
        unbinds: [
          Utils.on(document, 'pointermove', (moveEvent) => {
            if (moveEvent.pointerId === pointerId) this.onPointerMove(moveEvent);
          }),
          Utils.on(document, 'pointerup', (upEvent) => {
            if (upEvent.pointerId === pointerId) this.onRelease(upEvent);
          }),
          Utils.on(document, 'pointercancel', (cancelEvent) => {
            if (cancelEvent.pointerId === pointerId) this.abortDrag();
          }),
          Utils.on(document, 'touchmove', (touchEvent) => {
            if (this.drag) touchEvent.preventDefault();
          }, { passive: false })
        ]
      };
      if (touch) {
        this.press.timer = setTimeout(() => this.beginDrag(this.press.startX, this.press.startY), this.options.longPress);
      }
    }

    onPointerMove(event) {
      if (!this.press) return;
      if (this.drag) {
        this.followGhost(event.clientX, event.clientY);
        DragManager.move(event.clientX, event.clientY);
        return;
      }
      const distance = Math.hypot(event.clientX - this.press.startX, event.clientY - this.press.startY);
      if (this.press.touch) {
        if (distance > 10) this.teardownPress();
        return;
      }
      if (distance > 6) this.beginDrag(event.clientX, event.clientY);
    }

    beginDrag(pointerX, pointerY) {
      const press = this.press;
      if (!press || this.drag || !this.el) return;
      if (DragManager.active) {
        this.teardownPress();
        return;
      }
      clearTimeout(press.timer);
      const rect = this.el.getBoundingClientRect();
      const ghost = this.buildGhost(rect);
      document.body.appendChild(ghost);
      this.drag = {
        source: this,
        mode: this.options.mode,
        el: this.options.mode === 'move' ? this.el : null,
        payload: typeof this.options.payload === 'function' ? this.options.payload(this.el) : this.options.payload,
        ghost,
        width: rect.width,
        height: rect.height,
        originX: rect.left,
        originY: rect.top,
        offsetX: pointerX - rect.left,
        offsetY: pointerY - rect.top,
        lastX: pointerX,
        lastTime: performance.now(),
        tilt: 0,
        zones: []
      };
      Motion.set(ghost, { x: pointerX - this.drag.offsetX, y: pointerY - this.drag.offsetY, scale: 1.03 });
      if (this.options.mode === 'move') this.el.classList.add('dx-drag-origin');
      document.body.classList.add('dx-dragging');
      DragManager.start(this.drag);
      DragManager.move(pointerX, pointerY);
      if (this.options.onStart) this.options.onStart(this.drag.payload, this);
    }

    buildGhost(rect) {
      let ghost;
      if (typeof this.options.ghost === 'function') ghost = this.options.ghost(this.el, rect);
      else if (this.options.ghost instanceof Element) ghost = this.options.ghost;
      else {
        ghost = this.el.cloneNode(true);
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
      }
      ghost.classList.add('dx-drag-ghost');
      ghost.classList.remove('dx-draggable', 'dx-focusable');
      ghost.removeAttribute('tabindex');
      ghost.setAttribute('aria-hidden', 'true');
      return ghost;
    }

    followGhost(pointerX, pointerY) {
      const drag = this.drag;
      const now = performance.now();
      const delta = Math.max(now - drag.lastTime, 1);
      const velocityX = (pointerX - drag.lastX) / delta;
      drag.lastX = pointerX;
      drag.lastTime = now;
      if (this.options.tilt && !Utils.reducedMotion) {
        drag.tilt = Utils.lerp(drag.tilt, Utils.clamp(velocityX * 6, -8, 8), 0.22);
      }
      Motion.set(drag.ghost, {
        x: pointerX - drag.offsetX,
        y: pointerY - drag.offsetY,
        rotate: drag.tilt,
        scale: 1.03
      });
    }

    onRelease(event) {
      if (!this.press) return;
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      this.settleDrag(event.clientX, event.clientY);
    }

    settleDrag(pointerX, pointerY) {
      const drag = this.drag;
      const host = this.el;
      const result = DragManager.drop(pointerX, pointerY);
      const ghost = drag.ghost;
      document.body.classList.remove('dx-dragging');
      if (result && drag.mode === 'move' && drag.el) {
        const target = drag.el;
        const rect = target.getBoundingClientRect();
        Motion.to(ghost, {
          x: rect.left,
          y: rect.top,
          rotate: 0,
          scale: 1,
          duration: 0.26,
          ease: 'out',
          onComplete: () => {
            ghost.remove();
            target.classList.remove('dx-drag-origin');
            Motion.fromTo(target, { opacity: 0 }, { opacity: 1, duration: 0.2 });
          }
        });
      } else if (result) {
        Motion.to(ghost, { opacity: 0, scale: 0.9, duration: 0.18, ease: 'in', onComplete: () => ghost.remove() });
      } else {
        const origin = drag.el;
        Motion.to(ghost, {
          x: drag.originX,
          y: drag.originY,
          rotate: 0,
          scale: 1,
          duration: 0.4,
          ease: 'outBack',
          onComplete: () => {
            ghost.remove();
            if (origin) origin.classList.remove('dx-drag-origin');
          }
        });
      }
      if (host) {
        const suppress = Utils.on(host, 'click', (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopImmediatePropagation();
        }, { capture: true });
        setTimeout(suppress, 0);
      }
      this.drag = null;
      this.teardownPress();
      if (this.options.onEnd) this.options.onEnd(result, this);
    }

    abortDrag() {
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      const drag = this.drag;
      DragManager.cancel();
      document.body.classList.remove('dx-dragging');
      const ghost = drag.ghost;
      const origin = drag.el;
      Motion.to(ghost, {
        opacity: 0,
        scale: 0.96,
        duration: 0.16,
        ease: 'in',
        onComplete: () => {
          ghost.remove();
          if (origin) origin.classList.remove('dx-drag-origin');
        }
      });
      this.drag = null;
      this.teardownPress();
      if (this.options.onEnd) this.options.onEnd(null, this);
    }

    teardownPress() {
      if (!this.press) return;
      clearTimeout(this.press.timer);
      this.press.unbinds.forEach((unbind) => unbind());
      this.press = null;
    }
  }

  return Draggable;
});

;
Dixel.define('DropZone', ['Component', 'DragManager', 'Draggable', 'Utils'], function (Component, DragManager, Draggable, Utils) {
  'use strict';

  class DropZone extends Component {
    static defaults = {
      accepts: null,
      axis: 'vertical',
      sortable: false,
      itemSelector: null,
      gap: 10,
      highlight: true,
      onEnter: null,
      onLeave: null,
      onDrop: null
    };

    build() {
      return Utils.el('div', 'dx-dropzone');
    }

    ready() {
      const host = this.el;
      host.classList.add('dx-dropzone');
      this.placeholder = Utils.el('div', 'dx-drop-placeholder', { 'aria-hidden': 'true' });
      this.items = [];
      this.zoneRect = null;
      this.dragIndex = -1;
      this.currentIndex = -1;
      this.gapSize = this.options.gap;
      this.pad = { top: 0, left: 0, right: 0, bottom: 0 };
      this.inset = { left: 0, top: 0 };
      this.settleTimer = null;
      this.grabbed = null;
      this.grabOrigin = -1;
      this.sortables = [];
      this.addCleanup(DragManager.register(this));
      if (this.options.sortable) this.enableSortable();
      this.addCleanup(() => {
        clearTimeout(this.settleTimer);
        this.placeholder.remove();
        this.clearShifts();
        host.classList.remove('dx-dropzone', 'is-over', 'is-drag-active', 'is-settling');
      });
    }

    destroy() {
      if (this.destroyed) return;
      this.owned = false;
      super.destroy();
    }

    vertical() {
      return this.options.axis !== 'horizontal';
    }

    itemElements() {
      const selector = this.options.itemSelector;
      return Array.from(this.el.children).filter((child) => {
        if (child === this.placeholder || child.classList.contains('dx-drop-placeholder')) return false;
        if (child.classList.contains('dx-drop-live')) return false;
        return selector ? child.matches(selector) : true;
      });
    }

    acceptsDrag(drag) {
      const accepts = this.options.accepts;
      if (typeof accepts === 'function') return !!accepts(drag.payload, drag);
      if (typeof accepts === 'string') return !!(drag.payload && drag.payload.type === accepts);
      return true;
    }

    measure(drag) {
      const rect = this.el.getBoundingClientRect();
      const style = getComputedStyle(this.el);
      this.zoneRect = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      this.pad = {
        top: parseFloat(style.paddingTop) || 0,
        left: parseFloat(style.paddingLeft) || 0,
        right: parseFloat(style.paddingRight) || 0,
        bottom: parseFloat(style.paddingBottom) || 0
      };
      this.inset = { left: this.el.clientLeft, top: this.el.clientTop };
      this.dragIndex = -1;
      this.items = this.itemElements().map((el, index) => {
        const itemRect = el.getBoundingClientRect();
        if (el === drag.el) this.dragIndex = index;
        return {
          el,
          top: itemRect.top,
          left: itemRect.left,
          bottom: itemRect.bottom,
          right: itemRect.right,
          midX: itemRect.left + itemRect.width / 2,
          midY: itemRect.top + itemRect.height / 2
        };
      });
      this.gapSize = this.computeGap();
      this.currentIndex = -1;
    }

    computeGap() {
      if (this.items.length < 2) return this.options.gap;
      const first = this.items[0];
      const second = this.items[1];
      const gap = this.vertical() ? second.top - first.bottom : second.left - first.right;
      return Math.max(gap, 4);
    }

    dragEnter(drag) {
      this.el.classList.add('is-drag-active');
      this.el.classList.remove('is-settling');
      if (this.options.highlight) this.el.classList.add('is-over');
      this.showPlaceholder(drag);
      if (this.options.onEnter) this.options.onEnter(drag.payload, drag);
    }

    dragOver(drag, x, y) {
      const index = this.hitIndex(x, y);
      if (index === this.currentIndex) return;
      this.applyPreview(drag, index);
    }

    dragLeave(drag) {
      this.el.classList.remove('is-over');
      this.placeholder.remove();
      this.currentIndex = -1;
      if (this.dragIndex >= 0 && drag.mode === 'move') this.showCollapsed(drag);
      else this.clearShifts();
      if (this.options.onLeave) this.options.onLeave(drag.payload, drag);
    }

    hitIndex(x, y) {
      const vertical = this.vertical();
      let index = 0;
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        if (vertical ? y > item.midY : x > item.midX) index++;
      });
      return index;
    }

    shiftAmount(drag) {
      return (this.vertical() ? drag.height : drag.width) + this.gapSize;
    }

    applyPreview(drag, index) {
      this.currentIndex = index;
      const vertical = this.vertical();
      const amount = this.shiftAmount(drag);
      let slot = 0;
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        let shift = 0;
        if (this.dragIndex >= 0 && itemIndex > this.dragIndex) shift -= amount;
        if (slot >= index) shift += amount;
        item.el.style.transform = shift
          ? (vertical ? 'translate3d(0,' + shift + 'px,0)' : 'translate3d(' + shift + 'px,0,0)')
          : '';
        slot++;
      });
      this.movePlaceholder(drag, index);
    }

    showCollapsed(drag) {
      if (this.dragIndex < 0) return;
      this.el.classList.add('is-drag-active');
      const vertical = this.vertical();
      const amount = this.shiftAmount(drag);
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        item.el.style.transform = itemIndex > this.dragIndex
          ? (vertical ? 'translate3d(0,' + -amount + 'px,0)' : 'translate3d(' + -amount + 'px,0,0)')
          : '';
      });
      this.currentIndex = -1;
    }

    showPlaceholder(drag) {
      const vertical = this.vertical();
      const contentWidth = this.zoneRect.right - this.zoneRect.left - this.pad.left - this.pad.right - this.inset.left * 2;
      const contentHeight = this.zoneRect.bottom - this.zoneRect.top - this.pad.top - this.pad.bottom - this.inset.top * 2;
      this.placeholder.style.width = (vertical ? Math.max(contentWidth, 20) : drag.width) + 'px';
      this.placeholder.style.height = (vertical ? drag.height : Math.max(contentHeight, 20)) + 'px';
      this.el.appendChild(this.placeholder);
    }

    movePlaceholder(drag, index) {
      const position = this.slotPosition(drag, index);
      this.placeholder.style.transform = 'translate3d(' + position.x + 'px,' + position.y + 'px,0)';
    }

    slotPosition(drag, index) {
      const vertical = this.vertical();
      const amount = this.shiftAmount(drag);
      const rest = [];
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        rest.push({ item, after: this.dragIndex >= 0 && itemIndex > this.dragIndex });
      });
      const originX = this.zoneRect.left + this.inset.left;
      const originY = this.zoneRect.top + this.inset.top;
      let main;
      if (!rest.length) {
        main = vertical ? this.pad.top : this.pad.left;
      } else if (index < rest.length) {
        const entry = rest[index];
        main = (vertical ? entry.item.top - originY : entry.item.left - originX) - (entry.after ? amount : 0);
      } else {
        const entry = rest[rest.length - 1];
        main = (vertical ? entry.item.bottom - originY : entry.item.right - originX) - (entry.after ? amount : 0) + this.gapSize;
      }
      const cross = rest.length
        ? (vertical ? rest[0].item.left - originX : rest[0].item.top - originY)
        : (vertical ? this.pad.left : this.pad.top);
      return vertical ? { x: cross, y: main } : { x: main, y: cross };
    }

    receiveDrop(drag, x, y) {
      const index = this.currentIndex >= 0 ? this.currentIndex : this.hitIndex(x, y);
      this.settle();
      let moved = false;
      if (drag.mode === 'move' && drag.el) {
        if (!(this.dragIndex >= 0 && index === this.dragIndex)) {
          const rest = this.itemElements().filter((el) => el !== drag.el);
          this.el.insertBefore(drag.el, rest[index] || null);
          moved = true;
        }
        if (this.options.sortable) this.refreshSortable();
      }
      const result = { payload: drag.payload, index, source: drag.source, zone: this, moved };
      if (this.options.onDrop) this.options.onDrop(result);
      return result;
    }

    settle() {
      this.el.classList.add('is-settling');
      this.el.classList.remove('is-over');
      this.placeholder.remove();
      this.clearShifts();
      this.currentIndex = -1;
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        if (this.el) this.el.classList.remove('is-settling', 'is-drag-active');
      }, 80);
    }

    resetPreview(restore) {
      if (!this.el) return;
      if (!restore) this.el.classList.add('is-settling');
      this.el.classList.remove('is-over');
      this.placeholder.remove();
      this.clearShifts();
      this.currentIndex = -1;
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        if (this.el) this.el.classList.remove('is-settling', 'is-drag-active');
      }, restore ? 340 : 80);
    }

    clearShifts() {
      this.items.forEach((item) => {
        item.el.style.transform = '';
      });
    }

    enableSortable() {
      this.live = Utils.el('span', 'dx-drop-live', { 'aria-live': 'polite' });
      this.el.appendChild(this.live);
      this.refreshSortable();
      this.listen(this.el, 'keydown', this.onKey);
      this.addCleanup(() => {
        this.live.remove();
        this.sortables.forEach((draggable) => draggable.destroy());
        this.sortables = [];
      });
    }

    sortablePayload(el) {
      const type = typeof this.options.accepts === 'string' ? this.options.accepts : 'dx-item';
      return { type, el };
    }

    refreshSortable() {
      this.itemElements().forEach((el) => {
        if (el.__dxDraggable) return;
        if (!el.hasAttribute('tabindex')) {
          el.setAttribute('tabindex', '0');
          el.classList.add('dx-focusable');
        }
        const draggable = new Draggable({ mode: 'move', payload: this.sortablePayload(el) }).attach(el);
        this.sortables.push(draggable);
      });
    }

    announce(message) {
      if (this.live) this.live.textContent = message;
    }

    onKey(event) {
      const items = this.itemElements();
      const item = items.find((el) => el === event.target);
      if (!item) return;
      const key = event.key;
      if (key === ' ' || key === 'Enter') {
        event.preventDefault();
        if (this.grabbed === item) this.dropGrab(item, items);
        else if (!this.grabbed) this.startGrab(item, items);
        return;
      }
      if (this.grabbed !== item) return;
      if (key === 'Escape') {
        event.preventDefault();
        this.cancelGrab(item);
        return;
      }
      const vertical = this.vertical();
      const backward = vertical ? 'ArrowUp' : 'ArrowLeft';
      const forward = vertical ? 'ArrowDown' : 'ArrowRight';
      if (key !== backward && key !== forward) return;
      event.preventDefault();
      this.moveGrabbed(item, key === forward ? 1 : -1);
    }

    startGrab(item, items) {
      this.grabbed = item;
      this.grabOrigin = items.indexOf(item);
      item.classList.add('is-grabbed');
      this.announce('Elemento seleccionado. Usa las flechas para moverlo, espacio para soltar, Escape para cancelar.');
    }

    dropGrab(item, items) {
      const index = items.indexOf(item);
      const origin = this.grabOrigin;
      item.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = -1;
      if (index !== origin && this.options.onDrop) {
        this.options.onDrop({ payload: this.sortablePayload(item), index, source: null, zone: this, moved: true });
      }
      this.announce(index !== origin ? 'Soltado en la posición ' + (index + 1) + '.' : 'Soltado sin cambios.');
      item.focus();
    }

    cancelGrab(item) {
      const rest = this.itemElements().filter((el) => el !== item);
      this.el.insertBefore(item, rest[this.grabOrigin] || null);
      item.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = -1;
      this.announce('Movimiento cancelado.');
      item.focus();
    }

    moveGrabbed(item, delta) {
      const rest = this.itemElements().filter((el) => el !== item);
      const current = this.itemElements().indexOf(item);
      const target = Utils.clamp(current + delta, 0, rest.length);
      if (target === current) return;
      this.el.insertBefore(item, rest[target] || null);
      this.announce('Posición ' + (this.itemElements().indexOf(item) + 1) + ' de ' + (rest.length + 1) + '.');
      item.focus();
    }
  }

  return DropZone;
});

;
Dixel.define('Resizable', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  const AXES = {
    e: { x: 1, y: 0 },
    w: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    n: { x: 0, y: -1 },
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 },
    ne: { x: 1, y: -1 },
    nw: { x: -1, y: -1 }
  };

  class Resizable extends Component {
    static defaults = {
      handles: ['e', 's', 'se'],
      minWidth: 60,
      minHeight: 40,
      maxWidth: Infinity,
      maxHeight: Infinity,
      aspect: false,
      enabled: true,
      onResizeStart: null,
      onResize: null,
      onResizeEnd: null
    };

    ready() {
      this.host = this.el;
      this.host.classList.add('dx-resizable');
      const position = getComputedStyle(this.host).position;
      if (position === 'static') this.host.style.position = 'relative';
      this.handleNodes = [];
      this.options.handles.forEach((direction) => {
        if (!AXES[direction]) return;
        const handle = Utils.el('span', 'dx-resize-handle dx-resize-handle--' + direction);
        handle.setAttribute('aria-hidden', 'true');
        this.bindHandle(handle, AXES[direction]);
        this.host.appendChild(handle);
        this.handleNodes.push(handle);
      });
      this.setEnabled(this.options.enabled);
      this.activeStops = new Set();
      this.addCleanup(() => {
        this.activeStops.forEach((stop) => stop());
        this.activeStops.clear();
        this.handleNodes.forEach((node) => node.remove());
      });
    }

    setEnabled(enabled) {
      this.enabled = enabled !== false;
      this.host.classList.toggle('dx-resizable--on', this.enabled);
    }

    enable() {
      this.setEnabled(true);
    }

    disable() {
      this.setEnabled(false);
    }

    fitAspect(width, ratio) {
      width = Utils.clamp(width, this.options.minWidth, this.options.maxWidth);
      let height = width / ratio;
      if (height < this.options.minHeight) {
        height = this.options.minHeight;
        width = height * ratio;
      }
      if (height > this.options.maxHeight) {
        height = this.options.maxHeight;
        width = height * ratio;
      }
      return { width: Utils.clamp(width, this.options.minWidth, this.options.maxWidth), height };
    }

    bindHandle(handle, axis) {
      handle.addEventListener('pointerdown', (event) => {
        if (!this.enabled || event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const pointerId = event.pointerId;
        const rect = this.host.getBoundingClientRect();
        const startWidth = rect.width;
        const startHeight = rect.height;
        const startX = event.clientX;
        const startY = event.clientY;
        const ratio = startWidth / Math.max(startHeight, 1);
        const style = getComputedStyle(this.host);
        const anchored = style.position === 'absolute' || style.position === 'fixed';
        const startLeft = this.host.offsetLeft;
        const startTop = this.host.offsetTop;
        this.host.classList.add('is-resizing');
        if (this.options.onResizeStart) this.options.onResizeStart(startWidth, startHeight, this);
        const move = (ev) => {
          if (ev.pointerId !== pointerId) return;
          let width = startWidth + (ev.clientX - startX) * axis.x;
          let height = startHeight + (ev.clientY - startY) * axis.y;
          if (this.options.aspect) {
            if (axis.y && !axis.x) width = height * ratio;
            const fitted = this.fitAspect(width, ratio);
            width = fitted.width;
            height = fitted.height;
          } else {
            width = Utils.clamp(width, this.options.minWidth, this.options.maxWidth);
            height = Utils.clamp(height, this.options.minHeight, this.options.maxHeight);
          }
          width = Math.round(width);
          height = Math.round(height);
          if (axis.x) this.host.style.width = width + 'px';
          if (axis.y || this.options.aspect) this.host.style.height = height + 'px';
          if (anchored && axis.x === -1) this.host.style.left = (startLeft + (startWidth - width)) + 'px';
          if (anchored && axis.y === -1) this.host.style.top = (startTop + (startHeight - height)) + 'px';
          if (this.options.onResize) this.options.onResize(width, height, this);
        };
        const up = (ev) => {
          if (ev && ev.pointerId !== undefined && ev.pointerId !== pointerId) return;
          removeEventListener('pointermove', move);
          removeEventListener('pointerup', up);
          removeEventListener('pointercancel', up);
          this.activeStops.delete(up);
          this.host.classList.remove('is-resizing');
          const finalRect = this.host.getBoundingClientRect();
          if (this.options.onResizeEnd) this.options.onResizeEnd(finalRect.width, finalRect.height, this);
        };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up);
        addEventListener('pointercancel', up);
        this.activeStops.add(up);
      });
    }
  }

  return Resizable;
});

;
Dixel.define('Glitch', ['Component', 'Ticker', 'Utils'], function (Component, Ticker, Utils) {
  'use strict';

  class Glitch extends Component {
    static defaults = {
      intensity: 1,
      interval: 2.6,
      burstDuration: 0.32,
      slices: 4,
      rgbSplit: true,
      colorA: 'cyan',
      colorB: 'magenta',
      angle: 0,
      lift: 0,
      trigger: 'always'
    };

    ready() {
      this.el.classList.add('dx-glitch');
      if (getComputedStyle(this.el).position === 'static') {
        this.el.style.position = 'relative';
        this.addCleanup(() => {
          this.el.style.position = '';
        });
      }
      this.layers = [];
      this.buildLayers();
      this.addCleanup(() => {
        this.el.classList.remove('dx-glitch', 'is-glitching');
        this.layers.forEach((layer) => layer.remove());
      });
      if (Utils.reducedMotion) return;
      this.timer = Math.random() * this.options.interval;
      this.bursting = false;
      this.stopFrame = null;
      if (this.options.trigger === 'hover') {
        this.listen(this.el, 'pointerenter', () => this.glitch());
      } else if (this.options.trigger === 'always') {
        this.whenVisible((visible) => {
          if (visible && !this.stopFrame) this.stopFrame = Ticker.add(this.update.bind(this));
          else if (!visible && this.stopFrame) {
            this.stopFrame();
            this.stopFrame = null;
          }
        });
      }
      this.addCleanup(() => {
        if (this.stopFrame) this.stopFrame();
      });
    }

    buildLayers() {
      const source = this.el.innerHTML;
      const hostStyle = getComputedStyle(this.el);
      const count = this.options.rgbSplit ? 2 : 0;
      for (let i = 0; i < count + this.options.slices; i++) {
        const layer = Utils.el('div', 'dx-glitch-layer', { 'aria-hidden': 'true' });
        layer.innerHTML = source;
        layer.style.padding = hostStyle.padding;
        layer.style.textAlign = hostStyle.textAlign;
        layer.style.lineHeight = hostStyle.lineHeight;
        if (i < count) {
          layer.classList.add('dx-glitch-layer--tint');
          layer.style.color = 'var(--dx-' + (i === 0 ? this.options.colorA : this.options.colorB) + ')';
        } else {
          const from = ((i - count) / this.options.slices) * 100;
          const to = 100 - ((i - count + 1) / this.options.slices) * 100;
          layer.style.clipPath = 'inset(' + from.toFixed(1) + '% 0 ' + to.toFixed(1) + '% 0)';
          layer.classList.add('dx-glitch-layer--slice');
        }
        this.el.appendChild(layer);
        this.layers.push(layer);
      }
    }

    glitch() {
      if (Utils.reducedMotion) return;
      this.bursting = true;
      this.burstLeft = this.options.burstDuration;
      this.el.classList.add('is-glitching');
      if (!this.stopFrame) {
        this.stopFrame = Ticker.add(this.update.bind(this));
      }
    }

    calm() {
      this.bursting = false;
      this.el.classList.remove('is-glitching');
      this.layers.forEach((layer) => {
        layer.style.transform = '';
        layer.style.opacity = '';
      });
      if (this.options.trigger !== 'always' && this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
    }

    update(time, delta) {
      if (this.options.trigger === 'always' && !this.bursting) {
        this.timer += delta;
        if (this.timer >= this.options.interval) {
          this.timer = 0;
          this.glitch();
        }
        return;
      }
      if (!this.bursting) return;
      this.burstLeft -= delta;
      if (this.burstLeft <= 0) {
        this.calm();
        return;
      }
      const power = this.options.intensity;
      const spin = this.options.angle ? ' rotate(' + this.options.angle + 'deg)' : '';
      this.layers.forEach((layer, index) => {
        const wave = (Math.random() - 0.5) * 2;
        const rise = (Math.random() - 0.5) * 2 * this.options.lift * power;
        if (layer.classList.contains('dx-glitch-layer--tint')) {
          const direction = index === 0 ? -1 : 1;
          layer.style.transform = 'translate3d(' + (direction * (2 + Math.random() * 3) * power) + 'px,' + rise.toFixed(1) + 'px,0)' + spin;
          layer.style.opacity = String(0.55 + Math.random() * 0.35);
        } else {
          layer.style.transform = 'translate3d(' + (wave * 9 * power).toFixed(1) + 'px,' + rise.toFixed(1) + 'px,0)' + spin;
          layer.style.opacity = Math.random() > 0.12 ? '1' : '0';
        }
      });
    }
  }

  return Glitch;
});

;
Dixel.define('LiftHover', ['Component'], function (Component) {
  'use strict';

  class LiftHover extends Component {
    static defaults = { lift: 8, scale: 1.02 };

    ready() {
      this.el.classList.add('dx-lift');
      this.el.style.setProperty('--dx-lift-y', -this.options.lift + 'px');
      this.el.style.setProperty('--dx-lift-scale', String(this.options.scale));
    }
  }

  return LiftHover;
});

;
Dixel.define('Magnetic', ['Component', 'Pointer', 'Utils', 'Motion'], function (Component, Pointer, Utils, Motion) {
  'use strict';

  class Magnetic extends Component {
    static defaults = { strength: 0.35, scale: 1.04, stiffness: 170, damping: 14 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-magnetic');
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.zoom = 1;
      this.centerX = 0;
      this.centerY = 0;
      this.hovering = false;
      this.active = false;
      this.fx = Motion.channel(this.el, 'magnetic');
      this.addCleanup(() => this.fx.clear());
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    enter() {
      const rect = this.el.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      const targetX = this.hovering ? (Pointer.x - this.centerX) * this.options.strength : 0;
      const targetY = this.hovering ? (Pointer.y - this.centerY) * this.options.strength : 0;
      const drag = Math.exp(-this.options.damping * delta);
      this.vx = (this.vx + (targetX - this.x) * this.options.stiffness * delta) * drag;
      this.vy = (this.vy + (targetY - this.y) * this.options.stiffness * delta) * drag;
      this.x += this.vx * delta;
      this.y += this.vy * delta;
      this.zoom = Utils.damp(this.zoom, this.hovering ? this.options.scale : 1, 10, delta);
      if (
        !this.hovering &&
        Math.abs(this.x) < 0.05 &&
        Math.abs(this.y) < 0.05 &&
        Math.abs(this.vx) < 0.5 &&
        Math.abs(this.vy) < 0.5 &&
        Math.abs(this.zoom - 1) < 0.002
      ) {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.zoom = 1;
        this.fx.set({ x: 0, y: 0, scale: 1 });
        this.active = false;
        return;
      }
      this.fx.set({ x: this.x, y: this.y, scale: this.zoom });
    }
  }

  return Magnetic;
});

;
Dixel.define('Spotlight', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class Spotlight extends Component {
    static defaults = { size: 240, opacity: 0.4, lag: 20 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-spotlight-host');
      this.el.style.setProperty('--dx-spotlight-opacity', String(this.options.opacity));
      this.light = Utils.el('div', 'dx-spotlight-light');
      this.light.style.width = this.light.style.height = this.options.size + 'px';
      this.el.appendChild(this.light);
      this.addCleanup(() => {
        this.light.remove();
        this.el.classList.remove('dx-spotlight-host');
        this.el.style.removeProperty('--dx-spotlight-opacity');
      });
      this.rect = null;
      this.x = 0;
      this.y = 0;
      this.hovering = false;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    hostOffset() {
      return {
        left: this.rect.docLeft - window.scrollX,
        top: this.rect.docTop - window.scrollY
      };
    }

    enter() {
      const rect = this.el.getBoundingClientRect();
      this.rect = { docLeft: rect.left + window.scrollX, docTop: rect.top + window.scrollY };
      const offset = this.hostOffset();
      const half = this.options.size / 2;
      this.x = Pointer.x - offset.left - half;
      this.y = Pointer.y - offset.top - half;
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
      this.light.classList.add('is-on');
      this.hovering = true;
    }

    leave() {
      this.hovering = false;
      this.light.classList.remove('is-on');
    }

    update(time, delta) {
      if (!this.hovering || !this.rect) return;
      const offset = this.hostOffset();
      const half = this.options.size / 2;
      const targetX = Pointer.x - offset.left - half;
      const targetY = Pointer.y - offset.top - half;
      this.x = Utils.damp(this.x, targetX, this.options.lag, delta);
      this.y = Utils.damp(this.y, targetY, this.options.lag, delta);
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
    }
  }

  return Spotlight;
});

;
Dixel.define('TextWave', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class TextWave extends Component {
    static defaults = { amplitude: 14, radius: 90, lag: 13 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-textwave');
      this.chars = [];
      this.split();
      this.measure();
      this.rectLeft = 0;
      this.hovering = false;
      this.active = false;
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    split() {
      const text = this.el.textContent;
      this.el.textContent = '';
      const fragment = document.createDocumentFragment();
      for (const char of text) {
        const span = Utils.el('span', 'dx-textwave-char');
        span.textContent = char;
        fragment.appendChild(span);
        this.chars.push({ span, center: 0, y: 0 });
      }
      this.el.appendChild(fragment);
    }

    measure() {
      const base = this.el.getBoundingClientRect().left;
      for (let i = 0; i < this.chars.length; i++) {
        const rect = this.chars[i].span.getBoundingClientRect();
        this.chars[i].center = rect.left - base + rect.width / 2;
      }
    }

    enter() {
      this.rectLeft = this.el.getBoundingClientRect().left;
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      const pointerX = Pointer.x - this.rectLeft;
      const sigma = this.options.radius;
      let moving = false;
      for (let i = 0; i < this.chars.length; i++) {
        const char = this.chars[i];
        let target = 0;
        if (this.hovering) {
          const distance = (pointerX - char.center) / sigma;
          target = -this.options.amplitude * Math.exp(-distance * distance);
        }
        char.y = Utils.damp(char.y, target, this.options.lag, delta);
        if (Math.abs(char.y - target) > 0.04 || target !== 0) moving = true;
        char.span.style.transform = char.y ? 'translate3d(0,' + char.y + 'px,0)' : '';
      }
      if (!this.hovering && !moving) {
        for (let i = 0; i < this.chars.length; i++) {
          this.chars[i].y = 0;
          this.chars[i].span.style.transform = '';
        }
        this.active = false;
      }
    }
  }

  return TextWave;
});

;
Dixel.define('Tilt', ['Component', 'Pointer', 'Utils', 'Motion'], function (Component, Pointer, Utils, Motion) {
  'use strict';

  class Tilt extends Component {
    static defaults = { max: 10, perspective: 900, scale: 1.02, shine: true, lag: 12 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-tilt');
      if (this.options.shine) this.el.classList.add('dx-tilt--shine');
      this.rect = null;
      this.relX = 0.5;
      this.relY = 0.5;
      this.zoom = 1;
      this.hovering = false;
      this.active = false;
      this.fx = Motion.channel(this.el, 'tilt');
      this.addCleanup(() => this.fx.clear());
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    enter() {
      const rect = this.el.getBoundingClientRect();
      this.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      let targetRelX = 0.5;
      let targetRelY = 0.5;
      if (this.hovering && this.rect) {
        targetRelX = Utils.clamp((Pointer.x - this.rect.left) / this.rect.width, 0, 1);
        targetRelY = Utils.clamp((Pointer.y - this.rect.top) / this.rect.height, 0, 1);
      }
      this.relX = Utils.damp(this.relX, targetRelX, this.options.lag, delta);
      this.relY = Utils.damp(this.relY, targetRelY, this.options.lag, delta);
      this.zoom = Utils.damp(this.zoom, this.hovering ? this.options.scale : 1, 10, delta);
      const rotateX = (0.5 - this.relY) * 2 * this.options.max;
      const rotateY = (this.relX - 0.5) * 2 * this.options.max;
      if (!this.hovering && Math.abs(rotateX) < 0.02 && Math.abs(rotateY) < 0.02 && Math.abs(this.zoom - 1) < 0.002) {
        this.relX = 0.5;
        this.relY = 0.5;
        this.zoom = 1;
        this.fx.set({ perspective: 0, rotateX: 0, rotateY: 0, scale: 1 });
        this.el.style.removeProperty('--dx-shine-x');
        this.el.style.removeProperty('--dx-shine-y');
        this.active = false;
        return;
      }
      this.fx.set({ perspective: this.options.perspective, rotateX, rotateY, scale: this.zoom });
      if (this.options.shine && this.rect) {
        this.el.style.setProperty('--dx-shine-x', (this.relX - 0.5) * this.rect.width * 0.7 + 'px');
        this.el.style.setProperty('--dx-shine-y', (this.relY - 0.5) * this.rect.height * 0.7 + 'px');
      }
    }
  }

  return Tilt;
});

;
Dixel.define('WarpHover', ['Component', 'Pointer', 'Utils', 'Motion'], function (Component, Pointer, Utils, Motion) {
  'use strict';

  class WarpHover extends Component {
    static defaults = {
      stretch: 0.00045,
      skew: 0.02,
      maxStretch: 0.1,
      maxSkew: 6,
      stiffness: 190,
      damping: 16
    };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-warp');
      this.sx = 1;
      this.sy = 1;
      this.sk = 0;
      this.vsx = 0;
      this.vsy = 0;
      this.vsk = 0;
      this.hovering = false;
      this.active = false;
      this.fx = Motion.channel(this.el, 'warp');
      this.addCleanup(() => this.fx.clear());
      this.addCleanup(Pointer.use());
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    enter() {
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      let targetSx = 1;
      let targetSy = 1;
      let targetSk = 0;
      if (this.hovering) {
        targetSx = 1 + Utils.clamp(Math.abs(Pointer.velocityX) * this.options.stretch, 0, this.options.maxStretch);
        targetSy = 1 + Utils.clamp(Math.abs(Pointer.velocityY) * this.options.stretch, 0, this.options.maxStretch);
        targetSk = Utils.clamp(Pointer.velocityX * this.options.skew, -this.options.maxSkew, this.options.maxSkew);
      }
      const drag = Math.exp(-this.options.damping * delta);
      this.vsx = (this.vsx + (targetSx - this.sx) * this.options.stiffness * delta) * drag;
      this.vsy = (this.vsy + (targetSy - this.sy) * this.options.stiffness * delta) * drag;
      this.vsk = (this.vsk + (targetSk - this.sk) * this.options.stiffness * delta) * drag;
      this.sx += this.vsx * delta;
      this.sy += this.vsy * delta;
      this.sk += this.vsk * delta;
      if (
        !this.hovering &&
        Math.abs(this.sx - 1) < 0.001 &&
        Math.abs(this.sy - 1) < 0.001 &&
        Math.abs(this.sk) < 0.02 &&
        Math.abs(this.vsx) < 0.01 &&
        Math.abs(this.vsy) < 0.01 &&
        Math.abs(this.vsk) < 0.2
      ) {
        this.sx = 1;
        this.sy = 1;
        this.sk = 0;
        this.vsx = 0;
        this.vsy = 0;
        this.vsk = 0;
        this.fx.set({ skewX: 0, scaleX: 1, scaleY: 1 });
        this.active = false;
        return;
      }
      this.fx.set({ skewX: this.sk, scaleX: this.sx, scaleY: this.sy });
    }
  }

  return WarpHover;
});

;
Dixel.define('AmbientPulse', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class AmbientPulse extends Component {
    static defaults = { period: 6, min: 0.15, max: 0.45, tint: 'primary' };

    build() {
      return Utils.el('div', 'dx-ambient');
    }

    ready() {
      if (this.owned) {
        this.el.classList.add('dx-ambient');
        this.host = this.el;
      } else {
        if (getComputedStyle(this.el).position === 'static') {
          this.el.style.position = 'relative';
          this.addCleanup(() => {
            this.el.style.position = '';
          });
        }
        this.host = Utils.el('div', 'dx-ambient');
        this.el.appendChild(this.host);
        this.addCleanup(() => this.host.remove());
      }
      this.layer = Utils.el('div', 'dx-ambient-layer dx-ambient-layer--' + this.options.tint);
      this.host.appendChild(this.layer);
      if (Utils.reducedMotion) {
        this.layer.style.opacity = String((this.options.min + this.options.max) / 2);
        return;
      }
      this.phase = Math.random() * Math.PI * 2;
      this.last = -1;
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update(time) {
      if (!this.visible) return;
      const wave = Math.sin((time * Math.PI * 2) / this.options.period + this.phase) * 0.5 + 0.5;
      const opacity = this.options.min + wave * (this.options.max - this.options.min);
      if (Math.abs(opacity - this.last) < 0.002) return;
      this.last = opacity;
      this.layer.style.opacity = opacity.toFixed(3);
    }
  }

  return AmbientPulse;
});

;
Dixel.define('GlowOrbs', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class GlowOrbs extends Component {
    static defaults = { orbs: 3, drift: 34, speed: 0.2, parallax: 22 };

    build() {
      return Utils.el('div', 'dx-orbs');
    }

    ready() {
      this.el.classList.add('dx-orbs');
      this.items = [];
      const count = Utils.clamp(this.options.orbs, 2, 4);
      for (let i = 0; i < count; i++) {
        const node = Utils.el('div', 'dx-orb dx-orb--' + (i + 1));
        this.el.appendChild(node);
        this.items.push({
          node,
          phase: Math.random() * Math.PI * 2,
          speed: this.options.speed * (0.6 + i * 0.3),
          depth: 0.35 + (i / count) * 0.65
        });
      }
      this.whenVisible(() => {});
      if (Utils.reducedMotion) return;
      this.pointerActive = !Utils.isTouch;
      if (this.pointerActive) this.addCleanup(Pointer.use());
      this.onFrame(this.update);
    }

    update(time) {
      if (!this.visible) return;
      const drift = this.options.drift;
      const parallax = this.pointerActive ? this.options.parallax : 0;
      const normalX = this.pointerActive ? (Pointer.smoothX / innerWidth) * 2 - 1 : 0;
      const normalY = this.pointerActive ? (Pointer.smoothY / innerHeight) * 2 - 1 : 0;
      for (let i = 0; i < this.items.length; i++) {
        const orb = this.items[i];
        const x = Math.sin(time * orb.speed + orb.phase) * drift + normalX * parallax * orb.depth;
        const y = Math.cos(time * orb.speed * 0.8 + orb.phase) * drift * 0.7 + normalY * parallax * orb.depth;
        orb.node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      }
    }
  }

  return GlowOrbs;
});

;
Dixel.define('LightSweep', ['Component', 'ScrollWatch', 'Utils'], function (Component, ScrollWatch, Utils) {
  'use strict';

  class LightSweep extends Component {
    static defaults = { duration: 1.1, angle: -18, strength: 0.22, enterAt: 0.85, once: false };

    ready() {
      this.el.classList.add('dx-sweep');
      this.addCleanup(() => {
        this.el.classList.remove('dx-sweep');
        if (this.band) this.band.remove();
      });
      if (Utils.reducedMotion) return;
      this.band = Utils.el('div', 'dx-sweep-band');
      this.band.style.setProperty('--dx-sweep-duration', this.options.duration + 's');
      this.band.style.setProperty('--dx-sweep-skew', this.options.angle + 'deg');
      this.band.style.opacity = String(this.options.strength);
      this.el.appendChild(this.band);
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          enterAt: this.options.enterAt,
          once: this.options.once,
          enter: () => this.band.classList.add('is-run'),
          leave: () => this.band.classList.remove('is-run')
        })
      );
    }
  }

  return LightSweep;
});

;
Dixel.define('RimLight', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class RimLight extends Component {
    static defaults = { shift: 0.3, lag: 12 };

    ready() {
      this.el.classList.add('dx-rimlight');
      this.addCleanup(() => this.el && this.el.classList.remove('dx-rimlight'));
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.rect = null;
      this.offsetX = 0;
      this.offsetY = 0;
      this.hovering = false;
      this.active = false;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    enter() {
      const rect = this.el.getBoundingClientRect();
      this.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      let targetX = 0;
      let targetY = 0;
      if (this.hovering && this.rect) {
        const relX = Utils.clamp((Pointer.x - this.rect.left) / this.rect.width, 0, 1) - 0.5;
        const relY = Utils.clamp((Pointer.y - this.rect.top) / this.rect.height, 0, 1) - 0.5;
        targetX = relX * this.rect.width * this.options.shift;
        targetY = relY * this.rect.height * this.options.shift * 0.6;
      }
      this.offsetX = Utils.damp(this.offsetX, targetX, this.options.lag, delta);
      this.offsetY = Utils.damp(this.offsetY, targetY, this.options.lag, delta);
      if (!this.hovering && Math.abs(this.offsetX) < 0.05 && Math.abs(this.offsetY) < 0.05) {
        this.offsetX = 0;
        this.offsetY = 0;
        this.el.style.removeProperty('--dx-rim-x');
        this.el.style.removeProperty('--dx-rim-y');
        this.active = false;
        return;
      }
      this.el.style.setProperty('--dx-rim-x', this.offsetX.toFixed(2) + 'px');
      this.el.style.setProperty('--dx-rim-y', this.offsetY.toFixed(2) + 'px');
    }
  }

  return RimLight;
});

;
Dixel.define('SpotStage', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class SpotStage extends Component {
    static defaults = { size: 420, opacity: 0.5, lag: 12, dim: 0.55, orbit: 90, orbitSpeed: 0.4 };

    ready() {
      this.el.classList.add('dx-spotstage');
      this.el.style.setProperty('--dx-stage-dim', String(this.options.dim));
      this.light = Utils.el('div', 'dx-spotstage-light');
      this.light.style.width = this.light.style.height = this.options.size + 'px';
      this.light.style.opacity = String(this.options.opacity);
      this.el.appendChild(this.light);
      this.rect = { left: 0, width: 0, height: 0 };
      this.docTop = 0;
      this.x = 0;
      this.y = 0;
      this.measure();
      this.centerLight();
      this.listen(window, 'resize', this.measure);
      this.whenVisible((visible) => {
        if (visible) this.measure();
      });
      if (Utils.reducedMotion) return;
      this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.rect = { left: rect.left, width: rect.width, height: rect.height };
      this.docTop = rect.top + window.scrollY;
    }

    centerLight() {
      const half = this.options.size / 2;
      this.x = this.rect.width / 2 - half;
      this.y = this.rect.height / 2 - half;
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
    }

    update(time, delta) {
      if (!this.visible) return;
      const half = this.options.size / 2;
      let targetX;
      let targetY;
      if (Utils.isTouch) {
        targetX = this.rect.width / 2 + Math.cos(time * this.options.orbitSpeed) * this.options.orbit - half;
        targetY = this.rect.height / 2 + Math.sin(time * this.options.orbitSpeed * 0.8) * this.options.orbit * 0.6 - half;
      } else {
        targetX = Pointer.x - this.rect.left - half;
        targetY = Pointer.y - (this.docTop - window.scrollY) - half;
      }
      if (Math.abs(this.x - targetX) < 0.05 && Math.abs(this.y - targetY) < 0.05) return;
      this.x = Utils.damp(this.x, targetX, this.options.lag, delta);
      this.y = Utils.damp(this.y, targetY, this.options.lag, delta);
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
    }
  }

  return SpotStage;
});

;
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

;
Dixel.define('BorderBeam', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class BorderBeam extends Component {
    static defaults = { color: 'cyan', size: 56, speed: 4, thickness: 2, glow: true };

    ready() {
      if (Utils.reducedMotion) return;
      const color = this.options.tint || this.options.color;
      this.speed = this.options.lap || this.options.speed;
      this.thickness = this.options.thickness;
      this.host = this.resolveHost();
      this.host.classList.add('dx-beamhost');
      this.layer = Utils.el('div', 'dx-beamlayer');
      this.trail = Utils.el('div', 'dx-beam-trail dx-beam-trail--' + color);
      this.trail.style.width = this.options.size + 'px';
      this.trail.style.height = this.thickness + 'px';
      this.layer.appendChild(this.trail);
      this.head = null;
      if (this.options.glow) {
        const headSize = Math.max(this.thickness * 2.5, 5);
        this.headHalf = headSize / 2;
        this.head = Utils.el('div', 'dx-beam-head dx-beam-head--' + color);
        this.head.style.width = this.head.style.height = headSize.toFixed(1) + 'px';
        this.layer.appendChild(this.head);
      }
      this.host.appendChild(this.layer);
      this.addCleanup(() => this.layer.remove());
      this.width = 0;
      this.height = 0;
      this.timer = Math.random() * this.speed;
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible((visible) => {
        if (visible) this.measure();
      });
      this.onFrame(this.update);
    }

    resolveHost() {
      if (getComputedStyle(this.el).display !== 'inline') return this.el;
      const wrap = Utils.el('span', 'dx-beamwrap');
      this.el.parentNode.insertBefore(wrap, this.el);
      wrap.appendChild(this.el);
      this.addCleanup(() => {
        if (wrap.parentNode) wrap.parentNode.insertBefore(this.el, wrap);
        wrap.remove();
      });
      return wrap;
    }

    measure() {
      const rect = this.host.getBoundingClientRect();
      this.width = Math.max(rect.width - this.thickness, 1);
      this.height = Math.max(rect.height - this.thickness, 1);
    }

    update(time, delta) {
      if (!this.visible || !this.width) return;
      this.timer = (this.timer + delta) % this.speed;
      const perimeter = 2 * (this.width + this.height);
      const distance = (this.timer / this.speed) * perimeter;
      const inset = this.thickness / 2;
      let x;
      let y;
      let angle;
      if (distance < this.width) {
        x = inset + distance;
        y = inset;
        angle = 0;
      } else if (distance < this.width + this.height) {
        x = inset + this.width;
        y = inset + distance - this.width;
        angle = 90;
      } else if (distance < this.width * 2 + this.height) {
        x = inset + this.width - (distance - this.width - this.height);
        y = inset + this.height;
        angle = 180;
      } else {
        x = inset;
        y = inset + perimeter - distance;
        angle = 270;
      }
      this.trail.style.transform =
        'translate3d(' + (x - this.options.size) + 'px,' + (y - inset) + 'px,0) rotate(' + angle + 'deg)';
      if (this.head) {
        this.head.style.transform = 'translate3d(' + (x - this.headHalf) + 'px,' + (y - this.headHalf) + 'px,0)';
      }
    }
  }

  return BorderBeam;
});

;
Dixel.define('Confetti', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Confetti extends Component {
    static defaults = {
      count: 40,
      power: 520,
      gravity: 1150,
      friction: 1.6,
      duration: 1.6,
      spreadAngle: 75
    };

    build() {
      return Utils.el('span', 'dx-confetti-anchor');
    }

    ready() {
      this.layer = Utils.el('div', 'dx-confetti-layer');
      document.body.appendChild(this.layer);
      this.addCleanup(() => this.layer.remove());
      this.pieces = [];
      for (let i = 0; i < this.options.count; i++) {
        const node = Utils.el('div', 'dx-confetti-piece dx-confetti-piece--' + ((i % 5) + 1));
        node.style.width = (6 + Math.random() * 5).toFixed(1) + 'px';
        node.style.height = (4 + Math.random() * 4).toFixed(1) + 'px';
        this.layer.appendChild(node);
        this.pieces.push({
          node, life: 0, total: 1, x: 0, y: 0, vx: 0, vy: 0,
          rotation: 0, spin: 0, tumbleAngle: 0, tumble: 0
        });
      }
      this.running = false;
      this.onFrame(this.update);
    }

    origin() {
      if (this.el && this.el.getBoundingClientRect) {
        const rect = this.el.getBoundingClientRect();
        if (rect.width || rect.height) {
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      }
      return { x: innerWidth / 2, y: innerHeight * 0.4 };
    }

    burst(x, y) {
      if (Utils.reducedMotion) return this;
      const from = x === undefined ? this.origin() : { x, y };
      const spread = (this.options.spreadAngle * Math.PI) / 180;
      for (let i = 0; i < this.pieces.length; i++) {
        const piece = this.pieces[i];
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2 * spread;
        const speed = this.options.power * (0.5 + Math.random() * 0.7);
        piece.x = from.x;
        piece.y = from.y;
        piece.vx = Math.cos(angle) * speed;
        piece.vy = Math.sin(angle) * speed;
        piece.rotation = Math.random() * 360;
        piece.spin = (Math.random() - 0.5) * 900;
        piece.tumbleAngle = Math.random() * 360;
        piece.tumble = (Math.random() - 0.5) * 720;
        piece.life = piece.total = this.options.duration * (0.7 + Math.random() * 0.5);
      }
      this.running = true;
      return this;
    }

    update(time, delta) {
      if (!this.running) return;
      const drag = Math.exp(-this.options.friction * delta);
      let alive = 0;
      for (let i = 0; i < this.pieces.length; i++) {
        const piece = this.pieces[i];
        if (piece.life <= 0) continue;
        piece.life -= delta;
        if (piece.life <= 0) {
          piece.node.style.opacity = '0';
          continue;
        }
        alive++;
        piece.vx *= drag;
        piece.vy = piece.vy * drag + this.options.gravity * delta;
        piece.x += piece.vx * delta;
        piece.y += piece.vy * delta;
        piece.rotation += piece.spin * delta;
        piece.tumbleAngle += piece.tumble * delta;
        const progress = 1 - piece.life / piece.total;
        piece.node.style.transform =
          'translate3d(' + piece.x + 'px,' + piece.y + 'px,0) rotate(' + piece.rotation +
          'deg) rotateX(' + piece.tumbleAngle + 'deg)';
        piece.node.style.opacity = String(Utils.clamp((1 - progress) * 3, 0, 1));
      }
      if (!alive) this.running = false;
    }
  }

  return Confetti;
});

;
Dixel.define('Float', ['Component', 'Utils', 'Motion'], function (Component, Utils, Motion) {
  'use strict';

  class Float extends Component {
    static defaults = { amplitude: 8, speed: 1.2, rotate: 1.5 };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-float');
      this.phase = Math.random() * Math.PI * 2;
      this.fx = Motion.channel(this.el, 'float');
      this.addCleanup(() => this.fx.clear());
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update(time) {
      if (!this.visible) return;
      const lift = Math.sin(time * this.options.speed + this.phase) * this.options.amplitude;
      const tilt = this.options.rotate
        ? Math.sin(time * this.options.speed * 0.8 + this.phase) * this.options.rotate
        : 0;
      this.fx.set({ y: lift, rotate: tilt });
    }
  }

  return Float;
});

;
Dixel.define('PulseRing', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class PulseRing extends Component {
    static defaults = { interval: 2.2, duration: 1.4, spread: 1.9, strength: 0.7, tint: 'primary' };

    ready() {
      this.el.classList.add('dx-pulsehost');
      if (Utils.reducedMotion) return;
      this.rings = [];
      for (let i = 0; i < 2; i++) {
        const node = Utils.el('div', 'dx-pulse-ring dx-pulse-ring--' + this.options.tint);
        this.el.appendChild(node);
        this.rings.push({ node, offset: (this.options.interval / 2) * i, hidden: true });
      }
      this.timer = 0;
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible((visible) => {
        if (visible) this.measure();
      });
      this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      const diameter = Math.max(rect.width, rect.height);
      if (diameter === this.diameter) return;
      this.diameter = diameter;
      for (let i = 0; i < this.rings.length; i++) {
        const node = this.rings[i].node;
        node.style.width = node.style.height = diameter + 'px';
      }
    }

    update(time, delta) {
      if (!this.visible) return;
      this.timer += delta;
      for (let i = 0; i < this.rings.length; i++) {
        const ring = this.rings[i];
        const local = (this.timer + ring.offset) % this.options.interval;
        const progress = local / this.options.duration;
        if (progress >= 1) {
          if (!ring.hidden) {
            ring.hidden = true;
            ring.node.style.opacity = '0';
          }
          continue;
        }
        ring.hidden = false;
        const scale = 1 + progress * (this.options.spread - 1);
        ring.node.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
        ring.node.style.opacity = String((1 - progress) * this.options.strength);
      }
    }
  }

  return PulseRing;
});

;
Dixel.define('Shimmer', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Shimmer extends Component {
    static defaults = { interval: 3.2, duration: 1.1, angle: -18, strength: 0.35, delay: 0 };

    ready() {
      this.el.classList.add('dx-shimmer');
      this.addCleanup(() => {
        this.el.classList.remove('dx-shimmer');
        if (this.band) this.band.remove();
      });
      if (Utils.reducedMotion) return;
      this.band = Utils.el('div', 'dx-shimmer-band');
      this.band.style.opacity = '0';
      this.el.appendChild(this.band);
      this.timer = -this.options.delay;
      this.sweeping = false;
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update(time, delta) {
      if (!this.visible) return;
      this.timer += delta;
      if (this.timer < this.options.interval) return;
      const progress = (this.timer - this.options.interval) / this.options.duration;
      if (progress >= 1) {
        this.timer = 0;
        this.sweeping = false;
        this.band.style.opacity = '0';
        return;
      }
      if (!this.sweeping) {
        this.sweeping = true;
        this.band.style.opacity = String(this.options.strength);
      }
      const travel = -220 + progress * 540;
      this.band.style.transform = 'translate3d(' + travel + '%,0,0) skewX(' + this.options.angle + 'deg)';
    }
  }

  return Shimmer;
});

;
Dixel.define('TickNumber', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class TickNumber extends Component {
    static defaults = { duration: 0.6, stagger: 0.04, value: null };

    build() {
      return Utils.el('span', 'dx-ticknumber');
    }

    ready() {
      this.el.classList.add('dx-ticknumber');
      this.pattern = '';
      this.text = '';
      this.columns = [];
      const initial = this.options.value !== null
        ? String(this.options.value)
        : (this.el.textContent || '0').trim() || '0';
      this.el.textContent = '';
      this.set(initial);
    }

    set(value) {
      const text = String(value);
      if (text === this.text) return this;
      this.text = text;
      const pattern = text.replace(/[0-9]/g, 'd');
      if (pattern !== this.pattern) this.buildColumns(text, pattern);
      let digitIndex = 0;
      for (let i = 0; i < text.length; i++) {
        const column = this.columns[i];
        if (column.strip) {
          const digit = text.charCodeAt(i) - 48;
          column.strip.style.transitionDelay = (digitIndex * this.options.stagger).toFixed(2) + 's';
          column.strip.style.transform = 'translate3d(0,' + -digit + 'em,0)';
          digitIndex++;
        } else {
          column.node.textContent = text[i];
        }
      }
      return this;
    }

    buildColumns(text, pattern) {
      this.pattern = pattern;
      this.el.textContent = '';
      this.columns = [];
      for (let i = 0; i < text.length; i++) {
        if (text[i] >= '0' && text[i] <= '9') {
          const column = Utils.el('span', 'dx-tick-col');
          const strip = Utils.el('span', 'dx-tick-strip');
          strip.style.setProperty('--dx-tick-duration', this.options.duration + 's');
          for (let digit = 0; digit <= 9; digit++) {
            strip.appendChild(Utils.el('span', 'dx-tick-cell', { text: String(digit) }));
          }
          column.appendChild(strip);
          this.el.appendChild(column);
          this.columns.push({ node: column, strip });
        } else {
          const node = Utils.el('span', 'dx-tick-char', { text: text[i] });
          this.el.appendChild(node);
          this.columns.push({ node, strip: null });
        }
      }
    }
  }

  return TickNumber;
});

;
Dixel.define('ParallaxLayer', ['Component', 'Motion', 'ScrollWatch', 'Utils'], function (Component, Motion, ScrollWatch, Utils) {
  'use strict';

  class ParallaxLayer extends Component {
    static defaults = { speed: 0.25, axis: 'y' };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-parallax');
      this.viewHeight = innerHeight;
      this.fx = Motion.channel(this.el, 'parallax');
      this.addCleanup(() => this.fx.clear());
      this.listen(window, 'resize', () => {
        this.viewHeight = innerHeight;
      });
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          progress: (progress) => {
            const offset = (progress - 0.5) * this.options.speed * this.viewHeight;
            this.fx.set(this.options.axis === 'x' ? { x: offset } : { y: offset });
          }
        })
      );
    }
  }

  return ParallaxLayer;
});

;
Dixel.define('Reveal', ['Component', 'Motion', 'ScrollWatch', 'Utils'], function (Component, Motion, ScrollWatch, Utils) {
  'use strict';

  const origins = {
    up: (distance) => ({ y: distance }),
    down: (distance) => ({ y: -distance }),
    left: (distance) => ({ x: distance }),
    right: (distance) => ({ x: -distance }),
    scale: () => ({ scale: 0.9 }),
    fade: () => ({})
  };

  class Reveal extends Component {
    static defaults = {
      direction: 'up',
      distance: 44,
      duration: 0.9,
      ease: 'outQuart',
      stagger: 0.09,
      enterAt: 0.86,
      once: false
    };

    ready() {
      if (Utils.reducedMotion) return;
      const children = this.el.querySelectorAll('[data-reveal-child]');
      this.targets = children.length ? Array.from(children) : [this.el];
      const origin = origins[this.options.direction] || origins.up;
      this.hiddenState = Object.assign({ opacity: 0 }, origin(this.options.distance));
      this.hide();
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          enterAt: this.options.enterAt,
          once: this.options.once,
          enter: () => this.show(),
          leave: () => this.hide()
        })
      );
    }

    hide() {
      Motion.set(this.targets, this.hiddenState);
    }

    show() {
      Motion.to(this.targets, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        duration: this.options.duration,
        ease: this.options.ease,
        stagger: this.targets.length > 1 ? this.options.stagger : 0
      });
    }
  }

  return Reveal;
});

;
Dixel.define('ScrollProgressBar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ScrollProgressBar extends Component {
    static defaults = { tint: 'gradient' };

    build() {
      return Utils.el('div', 'dx-scrollprogress');
    }

    ready() {
      this.el.classList.add('dx-scrollprogress');
      this.el.classList.add('dx-scrollprogress--' + this.options.tint);
      this.max = 1;
      this.lastY = -1;
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.measure();
      this.onFrame(this.update);
    }

    measure() {
      this.max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
      this.lastY = -1;
    }

    update() {
      const y = window.scrollY;
      if (y === this.lastY) return;
      this.lastY = y;
      this.el.style.transform = 'scaleX(' + Utils.clamp(y / this.max, 0, 1) + ')';
    }
  }

  return ScrollProgressBar;
});

;
Dixel.define('SmoothAnchorNav', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class SmoothAnchorNav extends Component {
    static defaults = { offset: 0, line: 0.35 };

    ready() {
      this.el.classList.add('dx-anchor-nav');
      this.items = [];
      this.el.querySelectorAll('a[href^="#"]').forEach((link) => {
        const id = decodeURIComponent(link.getAttribute('href').slice(1));
        const section = document.getElementById(id);
        if (section) this.items.push({ link, section, top: 0 });
      });
      this.lastY = -1;
      this.current = null;
      this.viewHeight = innerHeight;
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.listen(this.el, 'click', this.onClick);
      if (this.items.length) this.onFrame(this.update);
    }

    measure() {
      const scrolled = window.scrollY;
      this.viewHeight = innerHeight;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        item.top = item.section.getBoundingClientRect().top + scrolled;
      }
      this.lastY = -1;
    }

    onClick(event) {
      const link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
      if (!link || !this.el.contains(link)) return;
      let item = null;
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].link === link) item = this.items[i];
      }
      if (!item) return;
      event.preventDefault();
      const top = item.section.getBoundingClientRect().top + window.scrollY - this.options.offset;
      window.scrollTo({ top, behavior: Utils.reducedMotion ? 'auto' : 'smooth' });
    }

    update() {
      const y = window.scrollY;
      if (y === this.lastY) return;
      this.lastY = y;
      const line = y + this.viewHeight * this.options.line;
      let active = this.items[0];
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].top <= line) active = this.items[i];
      }
      if (active === this.current) return;
      if (this.current) this.current.link.classList.remove('is-active');
      this.current = active;
      this.current.link.classList.add('is-active');
    }
  }

  return SmoothAnchorNav;
});

;
Dixel.define('StickyReveal', ['Component', 'Motion', 'ScrollWatch', 'Utils'], function (Component, Motion, ScrollWatch, Utils) {
  'use strict';

  class StickyReveal extends Component {
    static defaults = { pages: 2, shift: 48 };

    ready() {
      this.el.classList.add('dx-sticky');
      this.el.style.setProperty('--dx-sticky-pages', String(this.options.pages));
      let frame = this.el.querySelector('.dx-sticky-frame');
      if (!frame) {
        frame = Utils.el('div', 'dx-sticky-frame');
        while (this.el.firstChild) frame.appendChild(this.el.firstChild);
        this.el.appendChild(frame);
      }
      this.steps = Array.from(frame.querySelectorAll('[data-sticky-step]'));
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      if (this.steps.length) {
        this.apply(0);
        this.addCleanup(
          ScrollWatch.watch(this.el, {
            progress: (progress) => this.apply(this.localProgress(progress))
          })
        );
      }
    }

    measure() {
      this.viewHeight = innerHeight;
      this.height = this.el.getBoundingClientRect().height;
    }

    localProgress(progress) {
      const total = this.viewHeight + this.height;
      const track = Math.max(this.height - this.viewHeight, 1);
      return Utils.clamp((progress * total - this.viewHeight) / track, 0, 1);
    }

    apply(local) {
      const segment = 1 / this.steps.length;
      for (let i = 0; i < this.steps.length; i++) {
        const center = (i + 0.5) * segment;
        let offset = (local - center) / segment;
        if (i === 0 && offset < 0) offset = 0;
        if (i === this.steps.length - 1 && offset > 0) offset = 0;
        const opacity = Utils.clamp(1 - Math.abs(offset) * 1.4, 0, 1);
        Motion.set(this.steps[i], { opacity, y: offset * -this.options.shift });
      }
    }
  }

  return StickyReveal;
});

;
Dixel.define('VelocityWarp', ['Component', 'Ticker', 'Utils', 'Motion'], function (Component, Ticker, Utils, Motion) {
  'use strict';

  const scroll = { velocity: 0, lastY: 0, users: 0, stop: null, idle: 0, bound: false };

  function wakeVelocity() {
    if (scroll.stop || !scroll.users) return;
    scroll.lastY = window.scrollY;
    scroll.idle = 0;
    scroll.stop = Ticker.add((time, delta) => {
      const y = window.scrollY;
      const raw = (y - scroll.lastY) / Math.max(delta, 0.001);
      scroll.lastY = y;
      scroll.velocity = Utils.damp(scroll.velocity, raw, 8, delta);
      if (Math.abs(raw) < 1 && Math.abs(scroll.velocity) < 1) {
        scroll.idle += 1;
        if (scroll.idle > 20) {
          scroll.velocity = 0;
          scroll.stop();
          scroll.stop = null;
        }
      } else {
        scroll.idle = 0;
      }
    });
  }

  function useScrollVelocity() {
    scroll.users++;
    if (!scroll.bound) {
      scroll.bound = true;
      addEventListener('scroll', wakeVelocity, { passive: true });
    }
    wakeVelocity();
    return () => {
      scroll.users--;
      if (scroll.users <= 0 && scroll.stop) {
        scroll.stop();
        scroll.stop = null;
        scroll.users = 0;
        scroll.velocity = 0;
      }
    };
  }

  class VelocityWarp extends Component {
    static defaults = { skew: 0.0035, stretch: 0.00025, maxSkew: 4, maxStretch: 0.05 };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-velocity-warp');
      this.settled = true;
      this.fx = Motion.channel(this.el, 'velocity');
      this.addCleanup(() => this.fx.clear());
      this.addCleanup(useScrollVelocity());
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update() {
      if (!this.visible) return;
      const velocity = scroll.velocity;
      const skew = Utils.clamp(velocity * this.options.skew, -this.options.maxSkew, this.options.maxSkew);
      const stretch = 1 + Utils.clamp(Math.abs(velocity) * this.options.stretch, 0, this.options.maxStretch);
      if (Math.abs(skew) < 0.01 && stretch - 1 < 0.001) {
        if (this.settled) return;
        this.settled = true;
        this.fx.set({ skewY: 0, scaleY: 1 });
        return;
      }
      this.settled = false;
      this.fx.set({ skewY: skew, scaleY: stretch });
    }
  }

  return VelocityWarp;
});

;
Dixel.define('ColorFlow', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  function parseColor(value) {
    const text = String(value || '').trim();
    if (text[0] === '#') {
      const hex = text.slice(1);
      const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
      const int = parseInt(full, 16);
      if (Number.isNaN(int)) return null;
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
    }
    const match = text.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map(parseFloat);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }

  class ColorFlow extends Component {
    static defaults = { selector: '[data-flow-color]', property: '--dx-flow-bg', stops: null };

    ready() {
      this.root = document.documentElement;
      this.stops = [];
      this.lastY = -1;
      this.lastValue = '';
      this.fallback = parseColor(getComputedStyle(this.root).getPropertyValue('--dx-bg')) || [7, 7, 13];
      this.root.classList.add('dx-colorflow');
      this.addCleanup(() => {
        this.root.classList.remove('dx-colorflow');
        this.root.style.removeProperty(this.options.property);
      });
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.onFrame(this.update);
    }

    measure() {
      const scrollY = window.scrollY;
      const sections = this.el.querySelectorAll(this.options.selector);
      const declared = this.options.stops || [];
      this.stops = [];
      for (let i = 0; i < sections.length; i++) {
        const rect = sections[i].getBoundingClientRect();
        const raw = sections[i].getAttribute('data-flow-color') || declared[i];
        this.stops.push({
          center: rect.top + scrollY + rect.height / 2,
          color: parseColor(raw) || this.fallback
        });
      }
      this.stops.sort((a, b) => a.center - b.center);
      this.lastY = -1;
    }

    blend(from, to, amount) {
      return [
        Math.round(Utils.lerp(from[0], to[0], amount)),
        Math.round(Utils.lerp(from[1], to[1], amount)),
        Math.round(Utils.lerp(from[2], to[2], amount))
      ];
    }

    update() {
      const stops = this.stops;
      if (!stops.length) return;
      const y = window.scrollY;
      if (y === this.lastY) return;
      this.lastY = y;
      const sample = y + innerHeight / 2;
      let color = stops[stops.length - 1].color;
      if (sample <= stops[0].center) {
        color = stops[0].color;
      } else if (sample < stops[stops.length - 1].center) {
        for (let i = 0; i < stops.length - 1; i++) {
          if (sample < stops[i + 1].center) {
            const amount = (sample - stops[i].center) / (stops[i + 1].center - stops[i].center);
            color = this.blend(stops[i].color, stops[i + 1].color, amount);
            break;
          }
        }
      }
      const value = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
      if (value === this.lastValue) return;
      this.lastValue = value;
      this.root.style.setProperty(this.options.property, value);
    }
  }

  return ColorFlow;
});

;
Dixel.define('SectionFade', ['Component'], function (Component) {
  'use strict';

  class SectionFade extends Component {
    static defaults = { edges: 'both', size: 0 };

    ready() {
      this.el.classList.add('dx-sectionfade');
      if (this.options.edges !== 'bottom') this.el.classList.add('dx-sectionfade--top');
      if (this.options.edges !== 'top') this.el.classList.add('dx-sectionfade--bottom');
      if (this.options.size) this.el.style.setProperty('--dx-fade-size', this.options.size + 'px');
      this.addCleanup(() => {
        this.el.classList.remove('dx-sectionfade', 'dx-sectionfade--top', 'dx-sectionfade--bottom');
      });
    }
  }

  return SectionFade;
});

;
Dixel.define('WipeReveal', ['Component', 'ScrollWatch', 'Utils'], function (Component, ScrollWatch, Utils) {
  'use strict';

  const directions = ['up', 'down', 'left', 'right'];

  class WipeReveal extends Component {
    static defaults = { direction: 'up', duration: 0.9, enterAt: 0.82, once: false };

    ready() {
      this.el.classList.add('dx-wipe');
      if (Utils.reducedMotion) return;
      const direction = directions.indexOf(this.options.direction) === -1 ? 'up' : this.options.direction;
      this.panel = Utils.el('div', 'dx-wipe-panel dx-wipe-panel--' + direction);
      this.panel.style.setProperty('--dx-wipe-duration', this.options.duration + 's');
      this.el.appendChild(this.panel);
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          enterAt: this.options.enterAt,
          once: this.options.once,
          enter: () => this.panel.classList.add('is-open'),
          leave: () => this.panel.classList.remove('is-open')
        })
      );
    }
  }

  return WipeReveal;
});

;
Dixel.define('ZoomFlow', ['Component', 'ScrollWatch', 'Utils', 'Motion'], function (Component, ScrollWatch, Utils, Motion) {
  'use strict';

  class ZoomFlow extends Component {
    static defaults = { from: 0.96, fadeFrom: 1, range: 0.32 };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-zoomflow');
      this.active = false;
      this.fx = Motion.channel(this.el, 'zoomflow');
      this.addCleanup(() => this.fx.clear());
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          progress: (progress) => this.apply(progress)
        })
      );
      this.addCleanup(() => this.setActive(false));
    }

    setActive(active) {
      if (this.active === active) return;
      this.active = active;
      this.el.style.willChange = active ? 'transform' : '';
    }

    apply(progress) {
      const linear = Utils.clamp(progress / this.options.range, 0, 1);
      const eased = 1 - (1 - linear) * (1 - linear);
      const settled = eased >= 0.999;
      this.setActive(!settled && eased > 0);
      const scale = this.options.from + (1 - this.options.from) * eased;
      this.fx.set({ scale: settled ? 1 : scale });
      if (this.options.fadeFrom < 1) {
        this.el.style.opacity = settled
          ? ''
          : String(this.options.fadeFrom + (1 - this.options.fadeFrom) * eased);
      }
    }
  }

  return ZoomFlow;
});

;
Dixel.define('FancyScrollbar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  let nativeHideUsers = 0;
  let nativeHideStyle = null;

  function hideNativePageScrollbar() {
    nativeHideUsers++;
    if (!nativeHideStyle) {
      nativeHideStyle = document.createElement('style');
      nativeHideStyle.textContent =
        'html{scrollbar-width:none;-ms-overflow-style:none}' +
        'html::-webkit-scrollbar,body::-webkit-scrollbar{width:0;height:0;display:none}';
      document.head.appendChild(nativeHideStyle);
    }
    return () => {
      nativeHideUsers--;
      if (nativeHideUsers <= 0 && nativeHideStyle) {
        nativeHideStyle.remove();
        nativeHideStyle = null;
        nativeHideUsers = 0;
      }
    };
  }

  class FancyScrollbar extends Component {
    static defaults = { autoHide: true, hideDelay: 1.4, minThumb: 40 };

    build() {
      return Utils.el('div', 'dx-scrollbar');
    }

    ready() {
      const isRail = this.el.classList.contains('dx-scrollbar');
      this.host = isRail ? null : this.el;
      this.rail = isRail ? this.el : Utils.el('div', 'dx-scrollbar dx-scrollbar--inset');
      this.thumb = Utils.el('div', 'dx-scrollbar-thumb');
      this.rail.appendChild(this.thumb);
      if (this.host) {
        const host = this.host;
        host.classList.add('dx-scrollhost');
        host.appendChild(this.rail);
        this.addCleanup(() => host.classList.remove('dx-scrollhost'));
      } else {
        this.addCleanup(hideNativePageScrollbar());
      }
      this.dirty = true;
      this.needMeasure = true;
      this.dragging = false;
      this.hovering = false;
      this.idle = false;
      this.lastActivity = 0;
      this.dragPointerY = 0;
      this.dragStartY = 0;
      this.dragStartScroll = 0;
      this.max = 0;
      this.railHeight = 0;
      this.thumbHeight = this.options.minThumb;
      this.listen(this.host || window, 'scroll', () => {
        this.dirty = true;
      }, { passive: true });
      this.listen(window, 'resize', () => {
        this.needMeasure = true;
      });
      this.listen(window, 'load', () => {
        this.needMeasure = true;
      });
      this.listen(this.rail, 'pointerenter', () => {
        this.hovering = true;
        this.wake();
      });
      this.listen(this.rail, 'pointerleave', () => {
        this.hovering = false;
      });
      this.listen(this.rail, 'pointerdown', this.jump);
      this.listen(this.thumb, 'pointerdown', this.startDrag);
      this.listen(this.thumb, 'pointermove', (event) => {
        if (this.dragging) this.dragPointerY = event.clientY;
      });
      this.listen(this.thumb, 'pointerup', this.endDrag);
      this.listen(this.thumb, 'pointercancel', this.endDrag);
      if (this.host) this.whenVisible(() => {
        this.dirty = true;
      });
      this.onFrame(this.update);
    }

    wake() {
      this.lastActivity = performance.now() / 1000;
      if (this.idle) {
        this.idle = false;
        this.rail.classList.remove('is-idle');
      }
    }

    currentScroll() {
      return this.host ? this.host.scrollTop : window.scrollY;
    }

    setScroll(value) {
      if (this.host) this.host.scrollTop = value;
      else window.scrollTo(0, value);
    }

    startDrag(event) {
      event.preventDefault();
      event.stopPropagation();
      this.dragging = true;
      this.dragStartY = event.clientY;
      this.dragPointerY = event.clientY;
      this.dragStartScroll = this.currentScroll();
      this.thumb.setPointerCapture(event.pointerId);
      this.rail.classList.add('is-drag');
      this.wake();
    }

    endDrag() {
      this.dragging = false;
      this.rail.classList.remove('is-drag');
    }

    jump(event) {
      if (event.target !== this.rail) return;
      const rect = this.rail.getBoundingClientRect();
      const travel = Math.max(this.railHeight - this.thumbHeight, 1);
      const ratio = Utils.clamp((event.clientY - rect.top - this.thumbHeight / 2) / travel, 0, 1);
      this.setScroll(ratio * this.max);
      this.dirty = true;
    }

    measure() {
      this.needMeasure = false;
      const total = this.host ? this.host.scrollHeight : document.documentElement.scrollHeight;
      const view = this.host ? this.host.clientHeight : innerHeight;
      this.max = Math.max(total - view, 0);
      this.railHeight = this.rail.clientHeight;
      this.thumbHeight = Math.max(this.options.minThumb, this.railHeight * (view / Math.max(total, 1)));
      this.thumb.style.height = this.thumbHeight + 'px';
      this.rail.classList.toggle('is-off', this.max <= 0);
      this.dirty = true;
    }

    update(time) {
      if (this.host && !this.visible) return;
      if (this.needMeasure) this.measure();
      if (this.dragging) {
        const travel = Math.max(this.railHeight - this.thumbHeight, 1);
        const target = this.dragStartScroll + (this.dragPointerY - this.dragStartY) * (this.max / travel);
        this.setScroll(Utils.clamp(target, 0, this.max));
        this.dirty = true;
      }
      if (this.dirty) {
        this.dirty = false;
        this.lastActivity = time;
        const position = this.currentScroll();
        const progress = this.max > 0 ? Utils.clamp(position / this.max, 0, 1) : 0;
        const travel = Math.max(this.railHeight - this.thumbHeight, 0);
        this.thumb.style.transform = 'translate3d(0,' + progress * travel + 'px,0)';
        if (this.host) this.rail.style.transform = 'translate3d(0,' + position + 'px,0)';
        if (this.idle) {
          this.idle = false;
          this.rail.classList.remove('is-idle');
        }
        return;
      }
      if (
        this.options.autoHide &&
        !this.idle &&
        !this.dragging &&
        !this.hovering &&
        time - this.lastActivity > this.options.hideDelay
      ) {
        this.idle = true;
        this.rail.classList.add('is-idle');
      }
    }
  }

  return FancyScrollbar;
});

;
Dixel.define('AuroraShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class AuroraShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.6,
      intensity: 1,
      scale: 1.1,
      resolutionScale: 0.75,
      frozenTime: 26
    });

    fragmentShader() {
      return `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
float curtain(vec2 p, float t, float seed, float sharpness) {
  float ripple = fbm(vec2(p.x * 1.6 + seed, t + seed));
  float center = 0.3 + seed * 0.04 + (ripple - 0.5) * 0.9;
  float body = exp(-abs(p.y - center) * sharpness);
  float beams = 0.55 + 0.45 * noise(vec2(p.x * 6.0 + seed * 2.0, t * 0.5));
  return body * beams;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = vec2(uv.x * (u_resolution.x / u_resolution.y), uv.y) * u_scale;
  p += (u_pointer - 0.5) * 0.12;
  p.y += u_scroll * 0.06;
  float t = u_time * 0.16;
  vec3 col = mix(vec3(0.012, 0.012, 0.03), vec3(0.05, 0.03, 0.09), uv.y);
  col += u_colorB * curtain(p, t, 0.0, 5.5) * 0.85 * u_intensity;
  col += u_colorA * curtain(p * 1.2 + vec2(2.3, 0.1), t * 1.25, 4.0, 4.2) * 0.75 * u_intensity;
  col += u_colorC * curtain(p * 0.9 + vec2(5.1, -0.05), t * 0.8, 9.0, 7.0) * 0.4 * u_intensity;
  col += u_colorB * 0.05 * (1.0 - uv.y);
  float vignette = smoothstep(1.6, 0.4, length(uv - 0.5) * 1.6);
  col *= 0.75 + 0.25 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return AuroraShader;
});

;
Dixel.define('BlackHoleShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class BlackHoleShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      pull: true,
      tilt: 0.35,
      tiltSpeed: 0.5,
      resolutionScale: 0.8,
      frozenTime: 20
    });

    onDraw(gl) {
      const tilt = this.uniforms.u_tilt;
      if (tilt) gl.uniform1f(tilt, this.options.tilt);
      const tiltSpeed = this.uniforms.u_tiltSpeed;
      if (tiltSpeed) gl.uniform1f(tiltSpeed, this.options.tiltSpeed);
    }

    fragmentShader() {
      const pullBlock = this.options.pull
        ? [
            '  vec2 threadStart = (u_pointer * 2.0 - 1.0) * aspect;',
            '  float startDist = length(threadStart);',
            '  if (startDist > R * 1.6) {',
            '    vec2 pa = p - threadStart;',
            '    vec2 ba = -threadStart;',
            '    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
            '    float curve = sin(h * 3.1416) * 0.12 * sin(t * 0.7);',
            '    vec2 side = normalize(vec2(-ba.y, ba.x));',
            '    float threadDist = length(pa - ba * h + side * curve) + (noise(vec2(h * 9.0 - t * 2.4, 4.3)) - 0.5) * 0.035 * h;',
            '    float streamR = length(threadStart) * (1.0 - h);',
            '    float stripes = pow(0.5 + 0.5 * sin(h * 46.0 - t * 9.0), 3.0);',
            '    float thickness = mix(1400.0, 5200.0, h);',
            '    float thread = exp(-threadDist * threadDist * thickness) * (0.35 + 0.75 * stripes);',
            '    thread *= smoothstep(0.0, 0.2, h) * smoothstep(R * 0.99, R * 1.2, max(streamR, r));',
            '    thread *= smoothstep(1.7, 0.9, startDist);',
            '    col += mix(u_colorB, vec3(1.0), 0.4) * thread * (0.8 + 1.6 * (1.0 - streamR / max(startDist, 0.001))) * u_intensity;',
            '  }'
          ].join('\n')
        : '';
      return `
uniform float u_tilt;
uniform float u_tiltSpeed;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(2.9, 6.1);
    amplitude *= 0.5;
  }
  return value;
}
float starLayer(vec2 sp, float t) {
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float rnd = hash2(cell);
  vec2 jitter = (vec2(fract(rnd * 17.0), fract(rnd * 43.0)) - 0.5) * 0.8;
  vec2 d = f - jitter;
  float star = exp(-dot(d, d) * mix(240.0, 700.0, fract(rnd * 5.7)));
  float twinkle = 0.65 + 0.35 * sin(t * (0.8 + fract(rnd * 3.3) * 2.0) + rnd * 6.28);
  return star * step(0.82, rnd) * twinkle * (0.35 + 0.65 * fract(rnd * 7.1));
}
vec3 accretionDisk(vec2 dp, float R, float t) {
  float dr = max(length(dp), 0.0001);
  float da = atan(dp.y, dp.x);
  float inner = R * 1.45;
  float outer = R * 4.6;
  float ring = smoothstep(inner, inner * 1.3, dr) * (1.0 - smoothstep(outer * 0.5, outer, dr));
  if (ring < 0.001) return vec3(0.0);
  float flow = t * 1.5 / (dr * 3.0);
  float ldr = log(dr / R);
  float tex = 0.55 + 0.28 * sin(da * 9.0 + ldr * 16.0 - flow * 5.0);
  tex += 0.22 * sin(da * 17.0 + ldr * 26.0 - flow * 9.0);
  tex += (noise(vec2(dr * 24.0 - t * 0.7, ldr * 8.0)) - 0.5) * 0.5;
  float doppler = 1.0 + 0.8 * cos(da);
  float heat = 1.0 - smoothstep(inner, outer * 0.9, dr);
  vec3 warm = mix(u_colorA, mix(u_colorB, vec3(1.0), 0.75), heat * heat);
  vec3 cool = u_colorC * 0.55;
  vec3 col = mix(cool, warm, heat);
  return col * ring * max(tex, 0.0) * doppler * (0.55 + heat * 1.3);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time * 0.6;
  float R = 0.15 * u_scale;
  float r = max(length(p), 0.0001);
  float a = atan(p.y, p.x);
  float lens = (R * R * 2.4) / (dot(p, p) + 0.0015);
  vec2 sp = p * (1.0 - lens);
  float dragging = (R * 0.55) / (r + 0.05);
  float cd = cos(dragging);
  float sd = sin(dragging);
  sp = vec2(sp.x * cd - sp.y * sd, sp.x * sd + sp.y * cd);
  vec3 col = vec3(0.002, 0.003, 0.008);
  float stars = starLayer(sp * 13.0, t) + starLayer(sp * 24.0 + 37.0, t * 1.2) * 0.6;
  float smear = smoothstep(R * 3.2, R * 1.5, r);
  col += vec3(0.85, 0.9, 1.0) * stars * (1.0 + smear * 1.6);
  col += u_colorA * fbm(sp * 2.2 + vec2(0.0, t * 0.02)) * 0.05;
  col += u_colorC * fbm(sp * 1.4 + 9.0) * 0.035;
  float theta = u_tilt + t * u_tiltSpeed;
  float ct = cos(theta);
  float st = sin(theta);
  vec2 pr = vec2(p.x * ct - p.y * st, p.x * st + p.y * ct);
  float cosInc = 0.32 + 0.22 * sin(t * u_tiltSpeed * 1.3 + 1.0);
  col += accretionDisk(vec2(pr.x, pr.y / cosInc), R, t) * u_intensity;
  vec2 farSide = vec2(pr.x, (abs(pr.y) + R * 0.12) / (cosInc * 0.345));
  col += accretionDisk(farSide, R, t) * smoothstep(R * 2.9, R * 1.1, r) * 0.75 * u_intensity;
  float photon = exp(-pow((r - R * 1.28) / (R * 0.055), 2.0));
  col += mix(u_colorB, vec3(1.0), 0.7) * photon * 1.5 * u_intensity;
  col += u_colorB * exp(-pow((r - R * 1.28) / (R * 0.22), 2.0)) * 0.35;
  float spiralPhase = a + 4.2 * log(r / R) + t * (0.9 / r);
  float veins = pow(0.5 + 0.5 * sin(spiralPhase * 3.0), 5.0);
  veins += pow(0.5 + 0.5 * sin(spiralPhase * 5.0 + 2.1), 7.0) * 0.6;
  float veinMod = 0.5 + 0.5 * noise(vec2(r * 26.0 - t * 2.2, veins * 3.0));
  float accel = clamp((R * 1.6) / max(r - R * 0.75, 0.02), 0.0, 2.6);
  float infall = veins * veinMod * smoothstep(R * 4.4, R * 1.6, r) * smoothstep(R * 0.99, R * 1.24, r);
  col += mix(u_colorC, u_colorA, clamp(accel * 0.5, 0.0, 1.0)) * infall * accel * 0.4 * u_intensity;
${pullBlock}
  col *= smoothstep(R * 0.99, R * 1.045, r);
  float vignette = smoothstep(1.9, 0.55, r);
  col *= 0.8 + 0.2 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.01;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return BlackHoleShader;
});

;
Dixel.define('ChromeShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class ChromeShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.8,
      frozenTime: 9
    });

    fragmentShader() {
      return `
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float surfaceHeight(vec2 q, float t) {
  float h = sin(q.x * 1.6 + t * 0.8) * 0.5 + sin(q.y * 1.9 - t * 0.6) * 0.42;
  h += sin((q.x + q.y) * 1.2 + t * 0.5) * 0.3;
  h += noise(q * 1.7 + vec2(t * 0.18, -t * 0.12)) * 0.85;
  h += noise(q * 3.6 - vec2(t * 0.1, t * 0.15)) * 0.3;
  return h;
}
vec3 studioEnvironment(vec2 m, float t) {
  vec3 col = mix(u_colorA * 0.14, mix(u_colorB, vec3(1.0), 0.55), smoothstep(-0.9, 0.95, m.y));
  col += vec3(1.0) * exp(-abs(m.y + 0.1) * 15.0) * 0.85;
  col += mix(u_colorC, vec3(1.0), 0.35) * exp(-abs(m.y - 0.55) * 9.0) * 0.6;
  col += u_colorA * exp(-abs(m.y + 0.6) * 11.0) * 0.5;
  col += mix(u_colorB, vec3(1.0), 0.5) * exp(-abs(m.x - 0.4 - sin(t * 0.2) * 0.15) * 7.0) * 0.18;
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time * 0.55;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect;
  vec2 away = p - pointer;
  float ripple = exp(-dot(away, away) * 3.5);
  vec2 q = p * 1.9 * u_scale;
  float e = 0.055;
  float hC = surfaceHeight(q, t) + ripple * 0.5;
  float hR = surfaceHeight(q + vec2(e, 0.0), t) + exp(-dot(away + vec2(e / (1.9 * u_scale), 0.0), away) * 3.5) * 0.5;
  float hU = surfaceHeight(q + vec2(0.0, e), t) + exp(-dot(away + vec2(0.0, e / (1.9 * u_scale)), away) * 3.5) * 0.5;
  vec2 slope = vec2(hR - hC, hU - hC) / e;
  vec3 n = normalize(vec3(-slope * 0.55, 1.0));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 reflected = reflect(-viewDir, n);
  vec3 col = studioEnvironment(reflected.xy, t) * (0.5 + 0.5 * u_intensity);
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
  col += mix(u_colorB, vec3(1.0), 0.45) * fresnel * 1.5 * u_intensity;
  col += u_colorC * fresnel * fresnel * 0.8;
  vec3 lightDir = normalize(vec3(-0.4, 0.75, 0.6));
  float spec = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 60.0);
  col += vec3(1.0) * spec * 0.9;
  float spec2 = pow(max(dot(reflect(-normalize(vec3(0.6, 0.3, 0.5)), n), viewDir), 0.0), 28.0);
  col += mix(u_colorA, vec3(1.0), 0.6) * spec2 * 0.35;
  col *= 0.92 + 0.08 * hC;
  float vignette = smoothstep(1.8, 0.5, length(p));
  col *= 0.78 + 0.22 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return ChromeShader;
});

;
Dixel.define('FireShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class FireShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      colorA: '#ffc46b',
      colorB: '#ff6a1f',
      colorC: '#8a1200',
      speed: 1,
      intensity: 1,
      scale: 1,
      height: 1,
      wind: 0,
      sparks: true,
      resolutionScale: 0.75,
      frozenTime: 6
    });

    onDraw(gl) {
      const wind = this.uniforms.u_wind;
      if (wind) gl.uniform1f(wind, this.options.wind);
      const height = this.uniforms.u_height;
      if (height) gl.uniform1f(height, this.options.height);
    }

    fragmentShader() {
      const sparksBlock = this.options.sparks
        ? [
            '  float emberGlow = sparkLayer(vec2(p.x, uv.y), t, 9.0, 3.0) + sparkLayer(vec2(p.x, uv.y), t * 1.25, 14.0, 29.0) * 0.7;',
            '  col += mix(u_colorA, vec3(1.0, 0.9, 0.7), 0.5) * emberGlow * u_intensity;'
          ].join('\n')
        : '';
      return `
uniform float u_wind;
uniform float u_height;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(2.3, 7.7);
    amplitude *= 0.5;
  }
  return value;
}
float sparkLayer(vec2 p, float t, float cellScale, float seed) {
  vec2 q = vec2(p.x * cellScale + seed + u_wind * p.y * 2.0, (p.y - t * 0.34) * cellScale);
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float rnd = hash2(cell + seed);
  vec2 jitter = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.6;
  jitter.x += sin(t * (3.0 + fract(rnd * 5.0) * 3.0) + rnd * 6.28) * 0.14;
  vec2 d = f - jitter;
  float worldY = (cell.y + 0.5) / cellScale + t * 0.34;
  float life = smoothstep(0.15, 0.3, worldY) * (1.0 - smoothstep(0.55, 0.95, worldY));
  float spark = exp(-dot(d, d) * mix(240.0, 620.0, fract(rnd * 5.3)));
  float flicker = 0.5 + 0.5 * sin(t * (6.0 + fract(rnd * 3.1) * 8.0) + rnd * 6.28);
  return spark * step(0.55, rnd) * life * flicker;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float t = u_time * 1.15;
  float shimmerBand = smoothstep(0.35, 0.85, uv.y);
  vec2 q = p;
  q.x += (noise(vec2(p.y * 7.0 - t * 3.2, p.x * 5.0)) - 0.5) * 0.06 * shimmerBand;
  q.x -= u_wind * uv.y * uv.y * 0.35;
  q.x += sin(t * 0.8) * 0.02 * uv.y;
  float body = fbm(vec2(q.x * 3.2 * u_scale, q.y * 2.1 * u_scale - t * 1.05));
  float tongues = noise(vec2(q.x * 6.5 * u_scale, q.y * 3.6 * u_scale - t * 1.9));
  float shape = body * 1.15 + tongues * 0.55;
  float flameWidth = abs(q.x) * (1.5 + uv.y * 2.2);
  float density = shape - (uv.y / max(u_height, 0.15)) * (1.05 + flameWidth * 2.2) - flameWidth * 0.85 + 0.46;
  float d = clamp(density * 1.6, 0.0, 1.0);
  vec3 col = mix(vec3(0.012, 0.005, 0.01), vec3(0.03, 0.012, 0.02), uv.y * 0.5);
  col += u_colorC * smoothstep(0.02, 0.3, d) * 0.85;
  col = mix(col, u_colorB, smoothstep(0.22, 0.58, d));
  col = mix(col, u_colorA, smoothstep(0.5, 0.82, d));
  col += vec3(1.0, 0.94, 0.8) * smoothstep(0.76, 0.98, d) * 0.9 * u_intensity;
  col += u_colorB * exp(-uv.y * 3.4) * exp(-abs(p.x) * 4.2) * 0.4 * u_intensity;
  col += u_colorC * exp(-uv.y * 1.6) * exp(-abs(p.x) * 1.8) * 0.22;
${sparksBlock}
  float vignette = smoothstep(1.5, 0.4, length(vec2(p.x, uv.y - 0.42)));
  col *= 0.8 + 0.2 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return FireShader;
});

;
Dixel.define('FlowFieldShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class FlowFieldShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.9,
      intensity: 1,
      scale: 1.3,
      resolutionScale: 0.75,
      frozenTime: 18
    });

    fragmentShader() {
      return `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
float flowStrand(vec2 p, float t, float seed) {
  vec2 warp = vec2(fbm(p * 1.1 + vec2(seed, t * 0.35)), noise(p * 1.3 + vec2(seed + 4.7, -t * 0.3)));
  vec2 q = p + (warp - 0.5) * 1.6;
  float lanes = fbm(vec2(q.x * 1.3 - t * 1.4 + seed * 3.0, q.y * 7.0));
  return smoothstep(0.5, 0.74, lanes) * smoothstep(0.95, 0.74, lanes);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide * u_scale;
  float t = u_time;
  p += (u_pointer - 0.5) * 0.15;
  p.y += u_scroll * 0.08;
  vec3 col = mix(vec3(0.01, 0.01, 0.028), vec3(0.02, 0.014, 0.05), uv.y);
  col += u_colorA * flowStrand(p, t, 0.0) * 0.9 * u_intensity;
  col += u_colorB * flowStrand(p * 1.3 + vec2(3.1, 1.7), t * 1.2, 8.0) * 0.75 * u_intensity;
  col += u_colorC * flowStrand(p * 0.8 + vec2(-2.0, 4.0), t * 0.8, 15.0) * 0.5 * u_intensity;
  col += u_colorB * noise(p * 0.8 + t * 0.05) * 0.05;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return FlowFieldShader;
});

;
Dixel.define('GlassShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class GlassShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      refraction: 1,
      frost: 1,
      resolutionScale: 0.75,
      frozenTime: 7
    });

    onDraw(gl) {
      const refraction = this.uniforms.u_refraction;
      if (refraction) gl.uniform1f(refraction, this.options.refraction);
      const frost = this.uniforms.u_frost;
      if (frost) gl.uniform1f(frost, this.options.frost);
    }

    fragmentShader() {
      return `
uniform float u_refraction;
uniform float u_frost;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.05 + vec2(5.2, 1.3);
    amplitude *= 0.5;
  }
  return value;
}
vec3 backdrop(vec2 p, float t) {
  vec3 col = mix(vec3(0.012, 0.012, 0.03), vec3(0.03, 0.025, 0.06), p.y * 0.5 + 0.5);
  vec2 d;
  d = p - vec2(sin(t * 0.5) * 0.55, cos(t * 0.4) * 0.35);
  col += u_colorA * exp(-dot(d, d) * 4.2) * 0.85;
  d = p - vec2(cos(t * 0.35 + 2.0) * 0.5, sin(t * 0.55 + 1.0) * 0.4);
  col += u_colorB * exp(-dot(d, d) * 5.0) * 0.7;
  d = p - vec2(sin(t * 0.45 + 4.0) * 0.6, cos(t * 0.3 + 3.0) * 0.45);
  col += u_colorC * exp(-dot(d, d) * 4.6) * 0.6;
  d = p - vec2(cos(t * 0.6 + 5.0) * 0.35, sin(t * 0.4 + 5.5) * 0.5);
  col += mix(u_colorA, u_colorB, 0.5) * exp(-dot(d, d) * 6.5) * 0.55;
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time * 0.6;
  vec2 q = p * 2.6 * u_scale;
  float e = 0.09;
  float hCenter = fbm(q + vec2(t * 0.12, -t * 0.08));
  float hRight = fbm(q + vec2(e, 0.0) + vec2(t * 0.12, -t * 0.08));
  float hUp = fbm(q + vec2(0.0, e) + vec2(t * 0.12, -t * 0.08));
  vec2 normal = vec2(hRight - hCenter, hUp - hCenter) / e;
  vec2 pointerShift = (u_pointer - 0.5) * 0.22 * u_refraction;
  vec2 refracted = p + normal * 0.14 * u_refraction + pointerShift;
  vec3 seen = backdrop(refracted, t);
  seen += backdrop(refracted + normal * 0.05, t) * 0.35;
  seen /= 1.35;
  float grain = hash2(gl_FragCoord.xy + fract(t) * 100.0) - 0.5;
  seen += grain * 0.055 * u_frost;
  float film = fbm(q * 0.6 + 8.0);
  seen = mix(seen, seen * 0.85 + vec3(0.045) * u_frost, film * 0.5);
  float slope = length(normal);
  float spec = pow(clamp(slope * 0.9 - 0.15, 0.0, 1.0), 2.4);
  seen += vec3(1.0) * spec * 0.28 * u_intensity;
  float streakCoord = p.x * 0.8 - p.y * 1.1;
  float streak = pow(max(sin(streakCoord * 2.2 + t * 0.5), 0.0), 14.0);
  streak += pow(max(sin(streakCoord * 1.4 - 1.8 + t * 0.35), 0.0), 22.0) * 0.7;
  seen += mix(u_colorB, vec3(1.0), 0.75) * streak * 0.13 * u_intensity;
  vec2 edge = abs(uv - 0.5) * 2.0;
  float border = max(edge.x, edge.y);
  float edgeGlow = smoothstep(0.86, 1.0, border);
  seen += mix(u_colorA, u_colorB, uv.y) * edgeGlow * 0.3 * u_intensity;
  seen += vec3(1.0) * smoothstep(0.965, 1.0, border) * 0.16;
  gl_FragColor = vec4(seen, 1.0);
}`;
    }
  }

  return GlassShader;
});

;
Dixel.define('GlitchShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class GlitchShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      resolutionScale: 0.7,
      frozenTime: 3.2
    });

    fragmentShader() {
      return `
float hash(float n) {
  return fract(sin(n * 43758.5453) * 12345.6789);
}
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = floor(u_time * 9.0);
  float burst = step(0.62, hash(t * 0.37));
  float band = floor(uv.y * (8.0 + hash(t) * 22.0));
  float shift = (hash(band + t) - 0.5) * 0.16 * u_intensity * burst;
  float micro = (hash2(vec2(band, t + 1.0)) - 0.5) * 0.012 * u_intensity;
  vec2 p = uv + vec2(shift + micro, 0.0);
  float split = (0.004 + 0.02 * burst) * u_intensity;
  float rowJitter = step(0.94, hash2(vec2(floor(uv.y * 90.0), t))) * burst;
  p.x += rowJitter * (hash(uv.y * 51.0 + t) - 0.5) * 0.3;
  float rBase = smoothstep(0.2, 0.8, fract(p.x * 3.0 + u_time * 0.21));
  float gBase = smoothstep(0.2, 0.8, fract(p.x * 3.0 + 0.33 + u_time * 0.17));
  float bBase = smoothstep(0.2, 0.8, fract(p.y * 2.0 + 0.66 + u_time * 0.13));
  vec3 colR = u_colorA * smoothstep(0.15, 0.9, fract((p.x - split) * 2.2 + p.y + u_time * 0.2));
  vec3 colG = u_colorB * smoothstep(0.15, 0.9, fract(p.x * 2.2 + p.y + u_time * 0.2));
  vec3 colB = u_colorC * smoothstep(0.15, 0.9, fract((p.x + split) * 2.2 + p.y + u_time * 0.2));
  vec3 col = vec3(colR.r + rBase * 0.18, colG.g + gBase * 0.18, colB.b + bBase * 0.18);
  col += vec3(0.9) * step(0.985, hash2(uv * (40.0 + t))) * burst * u_intensity;
  float scan = 0.92 + 0.08 * sin(uv.y * u_resolution.y * 1.6);
  col *= scan;
  col = mix(vec3(0.02, 0.02, 0.05), col, 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return GlitchShader;
});

;
Dixel.define('HaloShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class HaloShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 1,
      frozenTime: 5
    });

    fragmentShader() {
      return `
void main() {
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide / u_scale;
  p -= (u_pointer - 0.5) * 0.12;
  float t = u_time;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float breath = 0.42 + 0.05 * sin(t * 0.7) + 0.02 * sin(t * 1.7);
  float ring = exp(-pow((r - breath) * 10.0, 2.0));
  float innerGlow = exp(-r * 3.2) * 0.5;
  float core = exp(-r * 9.0);
  float rays = 0.5 + 0.5 * sin(angle * 9.0 + t * 0.35) * sin(angle * 5.0 - t * 0.22);
  rays = pow(rays, 3.0) * exp(-r * 1.7) * smoothstep(breath * 0.45, breath * 1.4, r);
  float travel = fract(t * 0.12);
  float pulse = exp(-pow((r - breath - travel * 1.2) * 8.0, 2.0)) * (1.0 - travel) * 0.4;
  vec3 col = vec3(0.012, 0.01, 0.028);
  col += u_colorA * innerGlow * 1.2;
  col += mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(angle + t * 0.25)) * ring * 1.5 * u_intensity;
  col += u_colorB * rays * 0.5 * u_intensity;
  col += u_colorC * pulse;
  col += (u_colorB * 0.6 + 0.4) * core;
  col *= smoothstep(1.9, 0.5, r);
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return HaloShader;
});

;
Dixel.define('LiquidShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class LiquidShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      hero: false,
      resolutionScale: 0.75,
      frozenTime: 8
    });

    ready() {
      if (this.options.hero) {
        this.options.intensity *= 1.3;
        this.options.scale *= 0.78;
      }
      super.ready();
    }

    fragmentShader() {
      return `
float field(vec2 p, float t, out vec3 tint) {
  float f = 0.0;
  tint = vec3(0.0);
  vec2 d;
  float g;
  d = p - vec2(sin(t * 0.6) * 0.55, cos(t * 0.45) * 0.4);
  g = 0.10 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  d = p - vec2(cos(t * 0.5 + 2.0) * 0.6, sin(t * 0.7 + 1.0) * 0.45);
  g = 0.13 / (dot(d, d) + 0.003); f += g; tint += u_colorB * g;
  d = p - vec2(sin(t * 0.8 + 4.0) * 0.45, cos(t * 0.6 + 3.0) * 0.5);
  g = 0.07 / (dot(d, d) + 0.003); f += g; tint += u_colorC * g;
  d = p - vec2(cos(t * 0.35 + 1.0) * 0.3, sin(t * 0.5 + 5.0) * 0.32);
  g = 0.15 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  d = p - vec2(sin(t * 0.4 + 2.5) * 0.7, cos(t * 0.3 + 0.5) * 0.25);
  g = 0.06 / (dot(d, d) + 0.003); f += g; tint += u_colorB * g;
  d = p - vec2(cos(t * 0.7 + 5.2) * 0.5, sin(t * 0.55 + 2.2) * 0.55);
  g = 0.09 / (dot(d, d) + 0.003); f += g; tint += u_colorC * g;
  d = p - vec2(sin(t * 0.3 + 1.4) * 0.75, cos(t * 0.65 + 4.4) * 0.35);
  g = 0.05 / (dot(d, d) + 0.003); f += g; tint += u_colorB * g;
  d = p - vec2(cos(t * 0.45 + 3.6) * 0.4, sin(t * 0.35 + 0.8) * 0.6);
  g = 0.11 / (dot(d, d) + 0.003); f += g; tint += u_colorC * g;
  d = p - vec2(sin(t * 0.9 + 6.0) * 0.3, cos(t * 0.8 + 1.8) * 0.22);
  g = 0.045 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  d = p - vec2(0.0, sin(t * 0.25) * 0.1);
  g = 0.12 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  return f;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time * 0.55;
  vec2 away = p - pointer;
  float pull = exp(-dot(away, away) * 4.0);
  p -= normalize(away + 0.0001) * pull * 0.16 * u_intensity;
  vec3 tint;
  vec3 tintLit;
  float f = field(p, t, tint);
  vec2 cursorDelta = p - pointer;
  float cursorBlob = 0.03 / (dot(cursorDelta, cursorDelta) + 0.005);
  f += cursorBlob;
  tint += mix(u_colorB, u_colorA, 0.5) * cursorBlob;
  vec2 lightDir = normalize(vec2(-0.6, 0.8));
  float fLit = field(p + lightDir * 0.045, t, tintLit);
  vec3 liquid = tint / max(f, 0.001);
  float body = smoothstep(0.9, 1.12, f);
  float core = smoothstep(1.7, 3.4, f);
  float rim = smoothstep(0.9, 1.03, f) * (1.0 - smoothstep(1.03, 1.6, f));
  float slope = clamp((fLit - f) * 2.4, 0.0, 1.0);
  float spec = pow(slope, 2.2) * smoothstep(0.85, 1.05, f) * (1.0 - smoothstep(1.4, 2.6, f));
  vec3 col = mix(vec3(0.01, 0.01, 0.03), vec3(0.03, 0.02, 0.06), uv.y);
  col += liquid * smoothstep(0.32, 0.9, f) * 0.14;
  col += liquid * body * (0.65 + 0.4 * u_intensity);
  col += liquid * core * 0.4;
  col += (u_colorB * 0.6 + 0.4) * rim * 0.4;
  col += vec3(1.0) * spec * 0.75 * u_intensity;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return LiquidShader;
});

;
Dixel.define('NebulaShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class NebulaShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.8,
      intensity: 1,
      scale: 1.2,
      resolutionScale: 0.75,
      frozenTime: 30
    });

    fragmentShader() {
      return `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
float starLayer(vec2 p, float density, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash(cell);
  vec2 offset = vec2(hash(cell + 17.0), hash(cell + 43.0)) - 0.5;
  float d = length(f - offset * 0.7);
  float twinkle = 0.6 + 0.4 * sin(t * 2.0 + h * 40.0);
  return smoothstep(0.08, 0.0, d) * step(1.0 - density, h) * twinkle;
}
void main() {
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide * u_scale;
  float t = u_time * 0.1;
  vec2 parallax = (u_pointer - 0.5) * 0.12;
  parallax.y += u_scroll * 0.05;
  vec2 q1 = p * 0.9 + parallax * 0.4 + vec2(t * 0.3, -t * 0.15);
  vec2 q2 = p * 1.6 + parallax * 0.8 + vec2(-t * 0.2, t * 0.25);
  float n1 = fbm(q1);
  float n2 = fbm(q2 + n1 * 0.9);
  float n3 = fbm(q1 * 2.2 - n2 * 0.7);
  vec3 col = vec3(0.008, 0.008, 0.024);
  col += u_colorA * pow(n1, 2.1) * 1.1;
  col += u_colorB * pow(n2, 2.6) * 0.9;
  col += u_colorC * pow(n3, 3.2) * 0.8;
  col += (u_colorA + u_colorB) * 0.5 * pow(n1 * n2, 2.0) * 1.4;
  col *= u_intensity;
  col += vec3(0.9, 0.95, 1.0) * starLayer(p * 22.0 + parallax * 3.0, 0.06, u_time);
  col += vec3(0.8, 0.85, 1.0) * 0.7 * starLayer(p * 45.0 + parallax * 6.0 + 31.0, 0.05, u_time * 1.3);
  float vignette = smoothstep(1.9, 0.45, length(p / u_scale));
  col *= 0.55 + 0.45 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return NebulaShader;
});

;
Dixel.define('OceanShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class OceanShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.8,
      frozenTime: 14
    });

    fragmentShader() {
      return `
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(3.1, 1.7);
    amplitude *= 0.5;
  }
  return value;
}
float surfaceLine(float x, float t) {
  return 0.9 + sin(x * 5.0 + t * 1.5) * 0.012 + sin(x * 9.3 - t * 2.3) * 0.007 + sin(x * 16.0 + t * 3.4) * 0.004;
}
vec3 waterBase(vec2 p, float t) {
  float surf = surfaceLine(p.x, t);
  float up = clamp(p.y / surf, 0.0, 1.0);
  vec3 abyss = u_colorA * 0.05 + vec3(0.004, 0.007, 0.018);
  vec3 mid = mix(u_colorA, u_colorB, 0.35) * 0.17;
  vec3 shallow = mix(u_colorA, u_colorB, 0.72) * 0.4;
  vec3 col = mix(abyss, mid, smoothstep(0.0, 0.6, up));
  float high = smoothstep(0.5, 1.0, up);
  col = mix(col, shallow, high * high);
  vec2 cp = p * 7.0 * u_scale;
  float ca = sin(cp.x + sin(cp.y + t * 1.5) * 1.5) * sin(cp.y * 1.3 + sin(cp.x - t * 1.2) * 1.3);
  float caustics = pow(abs(ca), 3.0) * smoothstep(surf - 0.5, surf, p.y);
  col += mix(u_colorB, vec3(1.0), 0.4) * caustics * 0.13 * u_intensity;
  return col;
}
vec3 waterBody(vec2 p, float t) {
  vec3 col = waterBase(p, t);
  float surf = surfaceLine(p.x, t);
  float up = clamp(p.y / surf, 0.0, 1.0);
  float body = fbm(p * 1.7 * u_scale + vec2(t * 0.07, -t * 0.04));
  col *= 0.86 + body * 0.28;
  float w1 = sin(p.x * 5.5 + t * 1.2 + sin(p.y * 4.0 + t * 0.7) * 1.4);
  float w2 = sin(p.x * 10.5 - t * 1.9 + sin(p.y * 6.5 - t * 1.1) * 1.2);
  col += u_colorB * (0.5 + 0.5 * w1 * w2) * 0.04 * up;
  return col;
}
vec3 bubbles(vec3 col, vec2 p, vec2 pointer, float t, float cellScale, float rise, float seed, float strength) {
  vec2 q = vec2(p.x * cellScale + seed, (p.y - t * rise) * cellScale);
  vec2 base = floor(q);
  for (int cy = -1; cy <= 1; cy++) {
    for (int cx = -1; cx <= 1; cx++) {
      vec2 cell = base + vec2(float(cx), float(cy));
      float rnd = hash2(cell + seed * 0.31);
      if (rnd < 0.5) continue;
      float r = mix(0.1, 0.24, fract(rnd * 7.31));
      vec2 jitter = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.3;
      float worldY = (cell.y + 0.5 + jitter.y) / cellScale + t * rise;
      float sway = sin(worldY * 10.0 + rnd * 6.2831 + t * 1.4) * 0.09;
      float cellX = cell.x + 0.5 + jitter.x + sway;
      vec2 worldCenter = vec2((cellX - seed) / cellScale, worldY);
      vec2 away = worldCenter - pointer;
      float push = exp(-dot(away, away) * 20.0);
      worldCenter += (away / max(length(away), 0.05)) * push * (r * 1.1 / cellScale) * u_intensity;
      float rw = r / cellScale;
      vec2 off = p - worldCenter;
      float dist = length(off);
      if (dist > rw * 2.4) continue;
      float surf = surfaceLine(worldCenter.x, t);
      float fadeIn = smoothstep(-0.02, 0.1, worldCenter.y);
      float atSurf = smoothstep(surf + 0.005, surf - 0.04, worldCenter.y);
      float pop = atSurf * (1.0 - atSurf) * 4.0;
      float alpha = fadeIn * atSurf * strength;
      if (alpha < 0.004) continue;
      float nd = clamp(dist / rw, 0.0, 1.0);
      float inside = 1.0 - smoothstep(rw * 0.94, rw, dist);
      float bulge = sqrt(max(1.0 - nd * nd, 0.0));
      vec2 dir = off / max(dist, 0.0001);
      vec2 shift = dir * (1.0 - bulge) * rw * 1.15;
      vec3 interior = waterBase(p + shift, t) * (0.98 + bulge * 0.1);
      col = mix(col, interior, inside * 0.9 * alpha);
      float edgeDark = smoothstep(rw * 0.6, rw * 0.88, dist) * inside;
      col = mix(col, col * 0.7, edgeDark * 0.45 * alpha);
      float rim = smoothstep(rw * 0.76, rw * 0.93, dist) * inside;
      float rimLight = rim * (0.4 + 0.6 * max(dir.y, 0.0) + 0.22 * max(-dir.y, 0.0));
      col += mix(u_colorB, vec3(1.0), 0.6) * rimLight * (0.75 + pop * 0.7) * alpha;
      vec2 g1 = off - vec2(-0.34, 0.42) * rw;
      col += vec3(1.0) * exp(-dot(g1, g1) / (rw * rw * 0.012)) * 1.1 * alpha;
      vec2 g2 = off - vec2(0.3, -0.36) * rw;
      col += mix(u_colorB, vec3(1.0), 0.5) * exp(-dot(g2, g2) / (rw * rw * 0.02)) * 0.3 * alpha;
      float wake = exp(-off.x * off.x / (rw * rw * 0.32)) * smoothstep(-rw * 2.4, -rw * 1.3, off.y) * (1.0 - smoothstep(-rw * 1.25, -rw * 1.0, off.y));
      col += u_colorB * wake * 0.05 * alpha;
    }
  }
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 pointer = vec2(u_pointer.x * aspect, u_pointer.y);
  float t = u_time * 0.5;
  vec3 col = waterBody(p, t);
  float surf = surfaceLine(p.x, t);
  float rays = fbm(vec2(p.x * 2.6 + (surf - p.y) * 0.7 - t * 0.3, (surf - p.y) * 0.5));
  rays = pow(max(rays * 1.3 - 0.3, 0.0), 2.4) * smoothstep(surf - 1.1, surf, p.y);
  col += mix(u_colorB, vec3(1.0), 0.5) * rays * 0.38 * u_intensity;
  col *= 1.0 + rays * 0.35;
  col = bubbles(col, p, pointer, t, 9.0 * u_scale, 0.055, 11.0, 0.5);
  col = bubbles(col, p, pointer, t, 5.8 * u_scale, 0.085, 37.0, 0.75);
  col = bubbles(col, p, pointer, t, 3.4 * u_scale, 0.125, 71.0, 1.0);
  float above = smoothstep(surf, surf + 0.014, uv.y);
  vec3 sky = mix(u_colorB, vec3(1.0), 0.5) * 0.42 + u_colorB * fbm(vec2(p.x * 8.0, t)) * 0.22;
  col = mix(col, sky, above);
  float glint = exp(-abs(uv.y - surf) * 95.0);
  col += mix(u_colorB, vec3(1.0), 0.6) * glint * 0.55 * u_intensity;
  float vignette = smoothstep(1.5, 0.45, length(uv - vec2(0.5, 0.42)));
  col *= 0.82 + 0.18 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return OceanShader;
});

;
Dixel.define('PlasmaShader', ['ShaderCanvas', 'Utils'], function (ShaderCanvas, Utils) {
  'use strict';

  class PlasmaShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      bolts: 6,
      chaos: 1,
      core: true,
      resolutionScale: 0.75,
      frozenTime: 4
    });

    onDraw(gl) {
      const chaos = this.uniforms.u_chaos;
      if (chaos) gl.uniform1f(chaos, this.options.chaos);
    }

    fragmentShader() {
      const bolts = Math.round(Utils.clamp(this.options.bolts, 1, 12));
      const coreBlock = this.options.core
        ? [
            '  float pulse = 0.75 + 0.25 * sin(t * 3.2) + (noise(vec2(t * 5.0, 2.7)) - 0.5) * 0.35;',
            '  col += mix(u_colorB, vec3(1.0), 0.6) * exp(-r * r * 55.0) * pulse * 1.6 * u_intensity;',
            '  col += u_colorA * exp(-r * r * 14.0) * pulse * 0.55;',
            '  float shell = exp(-pow((r - 0.16) * 26.0, 2.0));',
            '  col += u_colorB * shell * (0.35 + 0.25 * sin(t * 4.1 + r * 8.0));'
          ].join('\n')
        : '';
      return `
uniform float u_chaos;
const int BOLTS = ${bolts};
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm3(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.1 + vec2(3.7, 1.9);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time;
  float r = max(length(p), 0.0001);
  float a = atan(p.y, p.x);
  float pointerAngle = atan(pointer.y, pointer.x);
  float pointerWeight = smoothstep(1.6, 0.3, length(pointer)) * 0.3;
  vec3 col = vec3(0.008, 0.006, 0.02);
  col += u_colorA * exp(-r * 1.9) * 0.3;
  col += u_colorC * exp(-r * 1.1) * 0.12;
${coreBlock}
  float boltsGlow = 0.0;
  float boltsCore = 0.0;
  for (int i = 0; i < BOLTS; i++) {
    float fi = float(i);
    float crackle = noise(vec2(t * 5.5 + fi * 17.3, fi * 7.9));
    float alive = smoothstep(0.3, 0.72, crackle);
    float baseAngle = fi * 6.2831853 / float(BOLTS) + t * 0.2 + (noise(vec2(t * 0.9 + fi * 3.1, fi * 11.0)) - 0.5) * 1.4;
    float toPointer = atan(sin(pointerAngle - baseAngle), cos(pointerAngle - baseAngle));
    baseAngle += toPointer * pointerWeight;
    float wiggle = (fbm3(vec2(r * 5.5 - t * 3.4, fi * 9.1)) - 0.5) * 1.7 * u_chaos / (r * 2.4 + 0.35);
    float angleDelta = atan(sin(a - baseAngle - wiggle), cos(a - baseAngle - wiggle));
    float arcDist = abs(angleDelta) * r;
    float reach = smoothstep(1.25, 0.12, r) * smoothstep(0.02, 0.08, r);
    float jag = 0.75 + 0.5 * noise(vec2(r * 14.0 - t * 7.0, fi * 5.3));
    boltsCore += exp(-arcDist * arcDist * 2600.0) * alive * reach * jag;
    boltsGlow += exp(-arcDist * arcDist * 130.0) * alive * reach;
  }
  col += mix(u_colorB, vec3(1.0), 0.55) * boltsCore * 1.3 * u_intensity;
  col += u_colorA * boltsGlow * 0.4 * u_intensity;
  col += u_colorC * boltsGlow * boltsGlow * 0.12;
  float haze = fbm3(p * 2.0 + vec2(t * 0.25, -t * 0.2));
  col += u_colorA * haze * exp(-r * 1.6) * 0.14;
  float vignette = smoothstep(1.9, 0.5, r);
  col *= 0.75 + 0.25 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return PlasmaShader;
});

;
Dixel.define('RippleClickShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  const MAX_RIPPLES = 8;

  class RippleClickShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.85,
      interactive: true,
      frozenTime: 9
    });

    ready() {
      this.ripples = new Float32Array(MAX_RIPPLES * 4);
      this.rippleIndex = 0;
      super.ready();
      this.listen(this.el, 'click', this.launchRipple);
    }

    launchRipple(event) {
      if (!this.gl) return;
      const minSide = Math.min(this.cssWidth, this.cssHeight);
      const top = this.rectTopDocument - (window.scrollY || 0);
      const localX = (event.clientX - this.rectLeft) / this.cssWidth;
      const localY = (event.clientY - top) / this.cssHeight;
      const slot = this.rippleIndex * 4;
      this.ripples[slot] = (localX * 2 - 1) * (this.cssWidth / minSide);
      this.ripples[slot + 1] = (1 - localY * 2) * (this.cssHeight / minSide);
      this.ripples[slot + 2] = this.time;
      this.ripples[slot + 3] = 1;
      this.rippleIndex = (this.rippleIndex + 1) % MAX_RIPPLES;
    }

    onDraw(gl) {
      const location = this.uniforms.u_ripples;
      if (location) gl.uniform4fv(location, this.ripples);
    }

    fragmentShader() {
      return `
uniform vec4 u_ripples[8];
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time;
  float height = 0.0;
  vec2 flowOffset = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 ripple = u_ripples[i];
    float age = t - ripple.z;
    float alive = ripple.w * step(0.0, age) * smoothstep(3.4, 0.5, age);
    float radius = age * 0.55;
    vec2 d = p - ripple.xy;
    float dist = length(d);
    float band = dist - radius;
    float wave = cos(band * 34.0) * exp(-band * band * 46.0) * alive;
    height += wave;
    flowOffset += normalize(d + 0.0001) * wave * 0.03;
  }
  vec2 q = (p + flowOffset * 2.5) * 2.2 * u_scale;
  float shimmer = fbm(q + vec2(t * 0.12, -t * 0.08));
  float shimmer2 = fbm(q * 1.8 - vec2(t * 0.07, t * 0.1));
  float depthMix = clamp(uv.y * 0.7 + shimmer * 0.3 + height * 0.4, 0.0, 1.0);
  vec3 col = mix(u_colorA * 0.16, u_colorB * 0.26, depthMix);
  col += u_colorB * pow(shimmer * shimmer2, 2.0) * 0.4;
  col += u_colorC * max(height, 0.0) * 0.5 * u_intensity;
  col += vec3(1.0) * pow(max(height, 0.0), 2.0) * 0.55;
  col += u_colorA * max(-height, 0.0) * 0.25;
  float vignette = smoothstep(1.9, 0.5, length(p));
  col *= 0.8 + 0.2 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return RippleClickShader;
});

;
Dixel.define('ShaderCanvas', ['Component', 'Utils', 'Pointer', 'Ticker'], function (Component, Utils, Pointer, Ticker) {
  'use strict';

  const VERTEX_SOURCE = [
    'attribute vec2 a_position;',
    'void main() {',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}'
  ].join('\n');

  const FRAGMENT_HEADER = [
    'precision mediump float;',
    'uniform float u_time;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_pointer;',
    'uniform float u_scroll;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform vec3 u_colorC;',
    'uniform float u_intensity;',
    'uniform float u_scale;',
    'uniform vec3 u_background;'
  ].join('\n');

  function hexToVec3(hex) {
    const parts = Utils.channels(Utils.color(hex, 'primary'));
    if (!parts) return [0.5, 0.5, 0.5];
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }

  class ShaderCanvas extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.75,
      touchResolutionScale: 0.75,
      interactive: true,
      background: null,
      frozenTime: 12
    };

    fragmentShader() {
      return `
float blend(vec2 uv, float t) {
  return 0.5 + 0.5 * sin(uv.x * 4.0 + t) * cos(uv.y * 3.0 - t * 0.7);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.4;
  vec3 col = mix(u_colorA, u_colorB, blend(uv * u_scale, t));
  col = mix(col, u_colorC, 0.3 * blend(uv * u_scale + 3.0, t * 0.8));
  gl_FragColor = vec4(col * (0.3 + 0.3 * u_intensity), 1.0);
}`;
    }

    onDraw() {}

    ready() {
      this.el.classList.add('dx-shader');
      if (this.options.interactive) this.el.classList.add('dx-shader--interactive');
      this.time = 0;
      this.sizeDirty = true;
      this.contextLost = false;
      this.staticDrawn = false;
      this.colorA = hexToVec3(this.options.colorA);
      this.colorB = hexToVec3(this.options.colorB);
      this.colorC = hexToVec3(this.options.colorC);
      this.background = hexToVec3(this.options.background || 'bg');
      this.canvas = Utils.el('canvas', 'dx-shader-canvas');
      this.el.appendChild(this.canvas);
      this.gl = this.createContext();
      if (!this.gl) {
        this.enableFallback();
        return;
      }
      this.setupProgram();
      this.measure();
      this.addCleanup(() => this.dispose());
      this.listen(window, 'resize', this.measure);
      this.listen(this.canvas, 'webglcontextlost', this.handleContextLost);
      this.listen(this.canvas, 'webglcontextrestored', this.handleContextRestored);
      this.frameBound = this.frame.bind(this);
      this.stopFrame = null;
      this.fpsAccumulated = 0;
      this.fpsSamples = 0;
      this.whenVisible((visible, entry) => {
        if (entry) {
          const rect = entry.boundingClientRect;
          this.rectLeft = rect.left;
          this.rectTopDocument = rect.top + (window.scrollY || 0);
        }
        if (visible && !this.stopFrame) {
          this.stopFrame = Ticker.add(this.frameBound);
        } else if (!visible && this.stopFrame) {
          this.stopFrame();
          this.stopFrame = null;
        }
      });
      this.addCleanup(() => {
        if (this.stopFrame) {
          this.stopFrame();
          this.stopFrame = null;
        }
      });
    }

    createContext() {
      const attributes = {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false
      };
      try {
        return (
          this.canvas.getContext('webgl', attributes) ||
          this.canvas.getContext('experimental-webgl', attributes)
        );
      } catch (error) {
        return null;
      }
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Dixel ' + this.constructor.name + ' shader compile failed: ' + log);
      }
      return shader;
    }

    setupProgram() {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_HEADER + '\n' + this.fragmentShader());
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.bindAttribLocation(program, 0, 'a_position');
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Dixel ' + this.constructor.name + ' program link failed: ' + log);
      }
      this.program = program;
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(program);
      this.cacheUniforms();
    }

    cacheUniforms() {
      const gl = this.gl;
      this.uniforms = {};
      const total = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < total; i++) {
        const info = gl.getActiveUniform(this.program, i);
        if (!info) continue;
        const name = info.name.replace('[0]', '');
        this.uniforms[name] = gl.getUniformLocation(this.program, info.name);
      }
    }

    setFloat(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform1f(location, value);
    }

    setVec2(name, x, y) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform2f(location, x, y);
    }

    setVec3(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform3f(location, value[0], value[1], value[2]);
    }

    handleContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
    }

    handleContextRestored() {
      this.contextLost = false;
      try {
        this.setupProgram();
      } catch (error) {
        this.dispose();
        this.enableFallback();
        return;
      }
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      this.rectLeft = rect.left;
      this.rectTopDocument = rect.top + (window.scrollY || 0);
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    applySize() {
      const touchFactor = Utils.isTouch ? this.options.touchResolutionScale : 1;
      this.lastDpr = Utils.dpr;
      const scale = this.lastDpr * this.options.resolutionScale * touchFactor;
      const width = Math.max(1, Math.round(this.cssWidth * scale));
      const height = Math.max(1, Math.round(this.cssHeight * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.gl.viewport(0, 0, width, height);
      this.drawWidth = width;
      this.drawHeight = height;
      this.sizeDirty = false;
    }

    frame(time, delta) {
      if (!this.gl || this.contextLost || !this.visible || document.hidden) return;
      if (this.lastDpr !== undefined && Utils.dpr !== this.lastDpr) this.sizeDirty = true;
      if (Utils.reducedMotion) {
        if (this.staticDrawn && !this.sizeDirty) return;
        this.time = this.options.frozenTime;
        this.draw(delta);
        this.staticDrawn = true;
        return;
      }
      this.fpsAccumulated += delta;
      this.fpsSamples += 1;
      if (this.fpsSamples >= 60) {
        const average = this.fpsAccumulated / this.fpsSamples;
        this.fpsAccumulated = 0;
        this.fpsSamples = 0;
        if (average > 0.022 && this.options.resolutionScale > 0.4) {
          this.options.resolutionScale = Math.max(0.4, this.options.resolutionScale * 0.75);
          this.sizeDirty = true;
        }
      }
      this.time += delta * this.options.speed;
      this.draw(delta);
    }

    draw(delta) {
      const gl = this.gl;
      if (this.sizeDirty) this.applySize();
      const scrollTop = window.scrollY || 0;
      const top = this.rectTopDocument - scrollTop;
      const pointerX = this.options.interactive ? Utils.clamp((Pointer.x - this.rectLeft) / this.cssWidth, 0, 1) : 0.5;
      const pointerY = this.options.interactive ? Utils.clamp(1 - (Pointer.y - top) / this.cssHeight, 0, 1) : 0.5;
      this.setFloat('u_time', this.time);
      this.setVec2('u_resolution', this.drawWidth, this.drawHeight);
      this.setVec2('u_pointer', pointerX, pointerY);
      this.setFloat('u_scroll', scrollTop / Math.max(window.innerHeight, 1));
      this.setVec3('u_colorA', this.colorA);
      this.setVec3('u_colorB', this.colorB);
      this.setVec3('u_colorC', this.colorC);
      this.setVec3('u_background', this.background);
      this.setFloat('u_intensity', this.options.intensity);
      this.setFloat('u_scale', this.options.scale);
      this.onDraw(gl, delta);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    enableFallback() {
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
      const fallback = Utils.el('div', 'dx-shader-fallback');
      fallback.style.setProperty('--dx-shader-a', Utils.color(this.options.colorA, 'primary'));
      fallback.style.setProperty('--dx-shader-b', Utils.color(this.options.colorB, 'cyan'));
      fallback.style.setProperty('--dx-shader-c', Utils.color(this.options.colorC, 'magenta'));
      this.el.appendChild(fallback);
      this.fallback = fallback;
    }

    dispose() {
      const gl = this.gl;
      if (!gl) return;
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext && !gl.isContextLost()) loseContext.loseContext();
      this.gl = null;
      this.program = null;
      this.buffer = null;
      this.uniforms = {};
    }
  }

  return ShaderCanvas;
});

;
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

;
Dixel.define('ShapeMask', ['Utils'], function (Utils) {
  'use strict';

  function textMask(host, scale) {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(scale || Utils.dpr, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    const range = document.createRange();
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement || host;
      const style = getComputedStyle(parent);
      ctx.font = style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const spacing = parseFloat(style.letterSpacing);
      const text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        if (!text[i].trim()) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const glyph = range.getBoundingClientRect();
        if (!glyph.width) continue;
        const baseline = glyph.bottom - rect.top - (glyph.height - parseFloat(style.fontSize)) * 0.34;
        ctx.fillText(text[i], glyph.left - rect.left + (isNaN(spacing) ? 0 : 0), baseline);
      }
    }
    return { canvas, width, height };
  }

  function ringMask(host, thickness) {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const radius = parseFloat(getComputedStyle(host).borderRadius) || 0;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    roundRect(ctx, thickness, thickness, width - thickness * 2, height - thickness * 2, Math.max(radius - thickness, 0));
    ctx.fill();
    return { canvas, width, height };
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function samplePoints(maskCanvas, step) {
    const ctx = maskCanvas.getContext('2d');
    const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    const points = [];
    const stride = Math.max(1, Math.round(step || 4));
    for (let y = 0; y < maskCanvas.height; y += stride) {
      for (let x = 0; x < maskCanvas.width; x += stride) {
        if (data[(y * maskCanvas.width + x) * 4 + 3] > 96) {
          points.push({ x: x / maskCanvas.width, y: y / maskCanvas.height });
        }
      }
    }
    return points;
  }

  function toMaskImage(el, maskCanvas) {
    const url = 'url(' + maskCanvas.canvas.toDataURL('image/png') + ')';
    el.style.webkitMaskImage = url;
    el.style.maskImage = url;
    el.style.webkitMaskSize = '100% 100%';
    el.style.maskSize = '100% 100%';
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.maskRepeat = 'no-repeat';
  }

  return { textMask, ringMask, samplePoints, toMaskImage };
});

;
Dixel.define('ShapeMorph', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  const TAU = Math.PI * 2;

  function segmentedOutline(points) {
    return function (t) {
      const segment = t * points.length;
      const index = Math.floor(segment) % points.length;
      const local = segment - Math.floor(segment);
      const a = points[index];
      const b = points[(index + 1) % points.length];
      return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
    };
  }

  function regularPolygon(sides) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * TAU - Math.PI / 2;
      points.push([Math.cos(angle), Math.sin(angle)]);
    }
    return segmentedOutline(points);
  }

  function starOutline() {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? 1 : 0.42;
      const angle = (i / 10) * TAU - Math.PI / 2;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    return segmentedOutline(points);
  }

  const OUTLINES = {
    circle: (t) => [Math.cos(t * TAU), Math.sin(t * TAU)],
    star: starOutline(),
    triangle: regularPolygon(3),
    hexagon: regularPolygon(6),
    diamond: segmentedOutline([[0, -1], [0.72, 0], [0, 1], [-0.72, 0]]),
    bolt: segmentedOutline([[-0.24, -1], [0.3, -1], [0.02, -0.18], [0.44, -0.18], [-0.22, 1], [0.02, 0.16], [-0.4, 0.16]]),
    heart(t) {
      const a = t * TAU;
      return [
        (16 * Math.pow(Math.sin(a), 3)) / 17,
        -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17
      ];
    },
    moon(t) {
      if (t < 0.5) {
        const a = -Math.PI / 2 + (t / 0.5) * Math.PI;
        return [Math.cos(a), Math.sin(a)];
      }
      const a = Math.PI / 2 - ((t - 0.5) / 0.5) * Math.PI;
      return [Math.cos(a) * 0.55 + 0.35, Math.sin(a)];
    },
    infinity(t) {
      const a = t * TAU;
      const d = 1 + Math.sin(a) * Math.sin(a);
      return [Math.cos(a) / d, (Math.sin(a) * Math.cos(a)) / d];
    }
  };

  class ShapeMorph extends Component {
    static shapeNames() {
      return ['constellation'].concat(Object.keys(OUTLINES));
    }

    static defaults = {
      shapes: ['constellation', 'star', 'heart', 'bolt', 'hexagon', 'moon'],
      hold: 2.6,
      morph: 1.8,
      density: 1,
      fillRatio: 0.62,
      depth: 0.5,
      autoRotate: 0.4,
      autoCycle: true,
      colors: ['primary', 'cyan', 'magenta'],
      trail: 0.25,
      swirl: 1.1,
      repelRadius: 90,
      lines: true,
      scale: 0.38
    };

    build() {
      return Utils.el('div', 'dx-shapemorph');
    }

    ready() {
      this.el.classList.add('dx-shapemorph');
      this.canvas = this.el.querySelector('canvas') || Utils.el('canvas', 'dx-shapemorph-canvas');
      if (!this.canvas.parentNode) this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.sampler = document.createElement('canvas');
      this.sampler.width = this.sampler.height = 200;
      this.samplerContext = this.sampler.getContext('2d', { willReadFrequently: true });
      this.resolvePalette();
      this.buildSprites();
      this.addCleanup(Utils.onTheme(() => {
        this.resolvePalette();
        this.buildSprites();
      }));
      this.particles = [];
      this.links = [];
      this.shapeIndex = 0;
      this.phase = 'hold';
      this.clock = 0;
      this.time = 0;
      this.rotation = 0;
      this.rotationVelocity = 0;
      this.dragging = false;
      this.dragLastX = 0;
      this.origin = null;
      this.releasePointer = null;
      this.fit();
      this.spawnParticles();
      this.setTargets(this.currentShapeName(), true);
      this.bindDrag();
      this.listen(window, 'resize', () => {
        this.fit();
        this.spawnParticles();
        this.setTargets(this.currentShapeName(), true);
        this.origin = null;
        if (Utils.reducedMotion) this.paintStatic();
      });
      this.whenVisible((visible) => {
        if (visible && !this.releasePointer && !Utils.isTouch) this.releasePointer = Pointer.use();
        if (!visible && this.releasePointer) {
          this.releasePointer();
          this.releasePointer = null;
        }
        if (visible) this.origin = null;
      });
      if (Utils.reducedMotion) {
        const firstNamed = this.options.shapes.find((name) => name !== 'constellation') || 'star';
        this.setTargets(firstNamed, true);
        this.paintStatic();
        return;
      }
      this.onFrame((time, delta) => this.step(Math.min(delta, 0.05)));
    }

    bindDrag() {
      this.listen(this.canvas, 'pointerdown', (event) => {
        this.dragging = true;
        this.dragLastX = event.clientX;
        this.canvas.setPointerCapture(event.pointerId);
      });
      this.listen(this.canvas, 'pointermove', (event) => {
        if (!this.dragging) return;
        const deltaX = event.clientX - this.dragLastX;
        this.dragLastX = event.clientX;
        this.rotation += deltaX * 0.012;
        this.rotationVelocity = deltaX * 0.6;
      });
      const stop = () => {
        this.dragging = false;
      };
      this.listen(this.canvas, 'pointerup', stop);
      this.listen(this.canvas, 'pointercancel', stop);
    }

    resolvePalette() {
      const styles = getComputedStyle(this.el);
      this.palette = this.options.colors.map((token) => styles.getPropertyValue('--dx-' + token).trim() || '#8b7cf6');
    }

    buildSprites() {
      this.sprites = this.palette.map((color) => {
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = 32;
        const ctx = sprite.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        return sprite;
      });
    }

    fit() {
      this.size = Utils.fitCanvas(this.canvas, this.context);
    }

    particleBudget() {
      const area = this.size.width * this.size.height;
      const base = Utils.clamp(Math.round(area / 560), 360, 1600);
      return Math.round(base * (Utils.isTouch ? 0.55 : 1) * this.options.density);
    }

    spawnParticles() {
      const count = this.particleBudget();
      const centerX = this.size.width / 2;
      const centerY = this.size.height / 2;
      while (this.particles.length > count) this.particles.pop();
      while (this.particles.length < count) {
        this.particles.push({
          x: centerX + (Math.random() - 0.5) * this.size.width,
          y: centerY + (Math.random() - 0.5) * this.size.height,
          fromX: 0,
          fromY: 0,
          fromZ: 0,
          relX: 0,
          relY: 0,
          relZ: 0,
          offsetX: 0,
          offsetY: 0,
          velocityX: 0,
          velocityY: 0,
          size: 0.5 + Math.random() * Math.random() * 1.8,
          sprite: (Math.random() * 3) | 0,
          phase: Math.random() * TAU,
          stagger: Math.random(),
          twinkle: 0.5 + Math.random() * 0.5
        });
      }
    }

    currentShapeName() {
      return this.options.shapes[this.shapeIndex % this.options.shapes.length];
    }

    shapePoints(name, count) {
      const points = [];
      const outline = OUTLINES[name];
      if (name === 'constellation' || !outline) {
        let seed = 421;
        for (let i = 0; i < count; i++) {
          seed = (seed * 16807) % 2147483647;
          const radius = Math.sqrt(seed / 2147483647);
          seed = (seed * 16807) % 2147483647;
          const angle = (seed / 2147483647) * TAU;
          points.push([Math.cos(angle) * radius * 1.3, Math.sin(angle) * radius * 1.05]);
        }
        return points;
      }
      const edgeCount = Math.round(count * (1 - this.options.fillRatio));
      for (let i = 0; i < edgeCount; i++) {
        const point = outline(i / edgeCount);
        points.push([point[0], point[1]]);
      }
      const ctx = this.samplerContext;
      const half = 100;
      ctx.clearRect(0, 0, 200, 200);
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const point = outline(i / 160);
        const px = half + point[0] * 82;
        const py = half + point[1] * 82;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      const pixels = ctx.getImageData(0, 0, 200, 200).data;
      const inside = [];
      for (let sy = 0; sy < 200; sy += 2) {
        for (let sx = 0; sx < 200; sx += 2) {
          if (pixels[(sy * 200 + sx) * 4 + 3] > 60) inside.push([sx, sy]);
        }
      }
      const needed = count - edgeCount;
      for (let i = 0; i < needed; i++) {
        const pick = inside[Math.floor((i / needed) * inside.length)] || inside[inside.length - 1] || [half, half];
        const jitterX = (Math.random() - 0.5) * 2;
        const jitterY = (Math.random() - 0.5) * 2;
        points.push([(pick[0] + jitterX - half) / 82, (pick[1] + jitterY - half) / 82]);
      }
      return points;
    }

    applyTargets(points) {
      const centerAngle = (point) => Math.atan2(point[1], point[0]);
      points.sort((a, b) => centerAngle(a) - centerAngle(b) || (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
      const depth = this.options.depth;
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        const point = points[i % points.length];
        particle.fromX = particle.relX;
        particle.fromY = particle.relY;
        particle.fromZ = particle.relZ;
        particle.relX = point[0];
        particle.relY = point[1];
        particle.relZ = (Math.sin(particle.phase * 3.7) * 0.5 + (Math.random() - 0.5)) * depth * 0.5;
      }
      this.linksDirty = true;
    }

    setTargets(name, immediate) {
      this.applyTargets(this.shapePoints(name, this.particles.length));
      this.isConstellation = name === 'constellation';
      if (immediate) {
        for (let i = 0; i < this.particles.length; i++) {
          this.particles[i].fromX = this.particles[i].relX;
          this.particles[i].fromY = this.particles[i].relY;
          this.particles[i].fromZ = this.particles[i].relZ;
        }
      }
    }

    morphTo(target) {
      if (Array.isArray(target)) {
        this.applyTargets(target.map((point) => point.slice()));
        this.isConstellation = false;
      } else {
        const index = this.options.shapes.indexOf(target);
        if (index !== -1) this.shapeIndex = index;
        this.setTargets(target, false);
      }
      this.phase = 'morph';
      this.clock = 0;
    }

    buildLinks() {
      this.links = [];
      if (!this.isConstellation || !this.options.lines) return;
      const step = Math.max(1, (this.particles.length / 80) | 0);
      const chosen = [];
      for (let i = 0; i < this.particles.length; i += step) chosen.push(this.particles[i]);
      for (let i = 0; i < chosen.length; i++) {
        let best = null;
        let bestDist = Infinity;
        for (let j = 0; j < chosen.length; j++) {
          if (i === j) continue;
          const dx = chosen[i].relX - chosen[j].relX;
          const dy = chosen[i].relY - chosen[j].relY;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            best = chosen[j];
          }
        }
        if (best) this.links.push([chosen[i], best]);
      }
    }

    step(delta) {
      if (!this.visible) return;
      this.time += delta;
      this.clock += delta;
      if (!this.dragging) {
        this.rotationVelocity = Utils.damp(this.rotationVelocity, this.options.autoRotate, 2.2, delta);
        this.rotation += this.rotationVelocity * delta;
      }
      if (this.options.autoCycle && this.phase === 'hold' && this.clock >= this.options.hold) {
        this.shapeIndex++;
        this.setTargets(this.currentShapeName(), false);
        this.phase = 'morph';
        this.clock = 0;
      } else if (this.phase === 'morph' && this.clock >= this.options.morph) {
        this.phase = 'hold';
        this.clock = 0;
      }
      this.paint(delta);
    }

    paint(delta) {
      const ctx = this.context;
      const width = this.size.width;
      const height = this.size.height;
      if (this.origin === null && this.el.isConnected) {
        this.origin = this.canvas.getBoundingClientRect();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - this.options.trail) + ')';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      const centerX = width / 2;
      const centerY = height / 2;
      const scaleBase = Math.min(width, height) * this.options.scale;
      const morphing = this.phase === 'morph';
      const duration = this.options.morph;
      const cosR = Math.cos(this.rotation);
      const sinR = Math.sin(this.rotation);
      const pointerX = this.origin ? Pointer.x - this.origin.left : -9999;
      const pointerY = this.origin ? Pointer.y - this.origin.top : -9999;
      const repelRadius = this.options.repelRadius;
      const repelSq = repelRadius * repelRadius;
      const damping = Math.exp(-4.5 * delta);
      if (this.linksDirty && !morphing) {
        this.buildLinks();
        this.linksDirty = false;
      }
      if (this.links.length && !morphing && this.isConstellation) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < this.links.length; i++) {
          const a = this.links[i][0];
          const b = this.links[i][1];
          ctx.moveTo(centerX + (a.relX * cosR + a.relZ * sinR) * scaleBase, centerY + a.relY * scaleBase);
          ctx.lineTo(centerX + (b.relX * cosR + b.relZ * sinR) * scaleBase, centerY + b.relY * scaleBase);
        }
        ctx.stroke();
      }
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        let relX = particle.relX;
        let relY = particle.relY;
        let relZ = particle.relZ;
        if (morphing) {
          const local = Utils.clamp((this.clock / duration - particle.stagger * 0.25) / 0.75, 0, 1);
          const eased = local < 0.5 ? 4 * local * local * local : 1 - Math.pow(-2 * local + 2, 3) / 2;
          relX = particle.fromX + (particle.relX - particle.fromX) * eased;
          relY = particle.fromY + (particle.relY - particle.fromY) * eased;
          relZ = particle.fromZ + (particle.relZ - particle.fromZ) * eased;
          const swirlAngle = Math.sin(local * Math.PI) * this.options.swirl * 0.5;
          const sx = relX * Math.cos(swirlAngle) - relY * Math.sin(swirlAngle);
          relY = relX * Math.sin(swirlAngle) + relY * Math.cos(swirlAngle);
          relX = sx;
        } else {
          relX += Math.sin(this.time * 0.7 + particle.phase) * 0.008;
          relY += Math.cos(this.time * 0.5 + particle.phase * 1.7) * 0.008;
        }
        const rotatedX = relX * cosR + relZ * sinR;
        const depthCue = -relX * sinR + relZ * cosR;
        const perspective = 1 + depthCue * 0.35;
        let baseX = centerX + rotatedX * scaleBase * perspective;
        let baseY = centerY + relY * scaleBase * perspective;
        const dx = baseX + particle.offsetX - pointerX;
        const dy = baseY + particle.offsetY - pointerY;
        const distSq = dx * dx + dy * dy;
        if (distSq < repelSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const push = ((repelRadius - dist) / repelRadius) * 640;
          particle.velocityX += (dx / dist) * push * delta;
          particle.velocityY += (dy / dist) * push * delta;
        }
        particle.velocityX -= particle.offsetX * 8 * delta;
        particle.velocityY -= particle.offsetY * 8 * delta;
        particle.velocityX *= damping;
        particle.velocityY *= damping;
        particle.offsetX += particle.velocityX * delta;
        particle.offsetY += particle.velocityY * delta;
        baseX += particle.offsetX;
        baseY += particle.offsetY;
        const depthLight = Utils.clamp(0.55 + depthCue * 0.9, 0.18, 1.25);
        const twinkle = particle.twinkle * (0.72 + 0.28 * Math.sin(this.time * 2.2 + particle.phase));
        const drawSize = particle.size * 7 * twinkle * perspective;
        ctx.globalAlpha = Utils.clamp(twinkle * depthLight, 0.08, 1);
        ctx.drawImage(this.sprites[particle.sprite % this.sprites.length], baseX - drawSize / 2, baseY - drawSize / 2, drawSize, drawSize);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    paintStatic() {
      const ctx = this.context;
      const centerX = this.size.width / 2;
      const centerY = this.size.height / 2;
      const scaleBase = Math.min(this.size.width, this.size.height) * this.options.scale;
      ctx.clearRect(0, 0, this.size.width, this.size.height);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        const drawSize = particle.size * 6;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(
          this.sprites[particle.sprite % this.sprites.length],
          centerX + particle.relX * scaleBase - drawSize / 2,
          centerY + particle.relY * scaleBase - drawSize / 2,
          drawSize,
          drawSize
        );
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  return ShapeMorph;
});

;
Dixel.define('SilkShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class SilkShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.7,
      intensity: 1,
      scale: 1.1,
      resolutionScale: 0.75,
      frozenTime: 14
    });

    fragmentShader() {
      return `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
vec2 silkWarp(vec2 p, float t) {
  return vec2(fbm(p * 1.4 + vec2(0.0, t * 0.22)), fbm(p * 1.4 + vec2(5.2, -t * 0.18)));
}
float silkHeight(vec2 q, float t) {
  return sin(q.x * 2.4 + q.y * 3.4 + fbm(q * 2.2) * 5.0 + t * 0.6) * 0.5 + 0.5;
}
void main() {
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide * u_scale;
  float t = u_time;
  p += (u_pointer - 0.5) * 0.22;
  vec2 q = p + (silkWarp(p, t) - 0.5) * 1.3;
  float eps = 0.035;
  float h = silkHeight(q, t);
  float hx = silkHeight(q + vec2(eps, 0.0), t);
  float hy = silkHeight(q + vec2(0.0, eps), t);
  vec3 normal = normalize(vec3(h - hx, h - hy, eps * 2.2));
  vec3 lightDir = normalize(vec3(0.45 + (u_pointer.x - 0.5) * 0.6, 0.55 + (u_pointer.y - 0.5) * 0.6, 0.55));
  float diffuse = max(dot(normal, lightDir), 0.0);
  vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float specular = pow(max(dot(normal, halfDir), 0.0), 42.0);
  vec3 base = mix(u_colorA * 0.5, u_colorB * 0.55, h);
  base = mix(base, u_colorC * 0.45, smoothstep(0.75, 1.0, h) * 0.35);
  vec3 col = base * (0.2 + diffuse * 0.95);
  col += specular * 0.85 * u_intensity * mix(vec3(1.0), u_colorB, 0.35);
  col += u_colorA * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return SilkShader;
});

;
Dixel.define('SmokeShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class SmokeShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      density: 1,
      drift: 0.15,
      resolutionScale: 0.7,
      frozenTime: 16
    });

    onDraw(gl) {
      const density = this.uniforms.u_density;
      if (density) gl.uniform1f(density, this.options.density);
      const drift = this.uniforms.u_drift;
      if (drift) gl.uniform1f(drift, this.options.drift);
    }

    fragmentShader() {
      return `
uniform float u_density;
uniform float u_drift;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.04 + vec2(1.6, 8.2);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float t = u_time * 0.3;
  vec2 q = p * 2.1 * u_scale + vec2(-u_drift * t, -t * 0.55);
  float warpA = fbm(q);
  vec2 warped = q + vec2(warpA * 1.7 - 0.85, warpA * 0.9) + vec2(sin(t * 0.5) * 0.2, 0.0);
  float warpB = fbm(warped * 1.25 + 5.0);
  vec2 sq = warped + vec2(warpB * 2.1 - 1.05, warpB * 1.3 - t * 0.3);
  float smoke = fbm(sq);
  float curl = 1.0 - abs(smoke * 2.0 - 1.0);
  float ridged = 1.0 - abs(fbm(sq * 2.3 + 11.0) * 2.0 - 1.0);
  float wisps = pow(curl, 2.0) * (0.35 + 0.65 * pow(ridged, 3.0));
  float dissipate = 1.0 - smoothstep(0.35, 1.05, uv.y + (warpA - 0.5) * 0.35);
  float feed = smoothstep(-0.15, 0.25, uv.y);
  float body = pow(smoothstep(0.28, 0.85, smoke), 1.35) * dissipate * feed * u_density;
  vec2 lightDir = vec2(-0.075, 0.11);
  float smokeLit = fbm(sq + lightDir);
  float shade = clamp(0.62 + (smoke - smokeLit) * 3.4, 0.25, 1.35);
  vec3 col = mix(vec3(0.008, 0.008, 0.02), vec3(0.02, 0.018, 0.045), uv.y);
  vec3 ink = mix(u_colorA, u_colorB, clamp(warpB * 1.4 - 0.2, 0.0, 1.0));
  col += ink * body * shade * (0.5 + 0.5 * u_intensity);
  col += u_colorC * wisps * body * 0.5;
  col += mix(ink, vec3(1.0), 0.6) * pow(curl, 6.0) * ridged * body * shade * 0.5 * u_intensity;
  col += ink * smoothstep(0.15, 0.55, smoke) * dissipate * feed * 0.08;
  float vignette = smoothstep(1.6, 0.45, length(vec2(p.x, uv.y - 0.5)));
  col *= 0.78 + 0.22 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return SmokeShader;
});

;
Dixel.define('StudioShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class StudioShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      warmth: 1,
      resolutionScale: 0.7,
      frozenTime: 6
    });

    onDraw(gl) {
      const location = this.uniforms.u_warmth;
      if (location) gl.uniform1f(location, this.options.warmth);
    }

    fragmentShader() {
      return `
uniform float u_warmth;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = u_time * 0.35;
  vec2 lightPos = vec2((u_pointer.x - 0.5) * aspect, u_pointer.y - 0.5) * 0.55;
  lightPos += vec2(sin(t) * 0.05, cos(t * 0.8) * 0.04);
  float floorLine = -0.18;
  float aboveFloor = smoothstep(floorLine - 0.22, floorLine + 0.3, p.y);
  vec3 wall = mix(u_colorA * 0.10, u_colorA * 0.22, smoothstep(-0.5, 0.6, p.y));
  vec3 ground = mix(u_colorA * 0.16, u_colorA * 0.05, smoothstep(floorLine, floorLine - 0.45, p.y));
  vec3 col = mix(ground, wall, aboveFloor);
  vec2 toLight = p - lightPos;
  toLight.y *= 1.15;
  float key = exp(-dot(toLight, toLight) * (3.2 / u_scale));
  vec3 warm = mix(vec3(1.0), vec3(1.0, 0.86, 0.7), 0.45 * u_warmth);
  col += warm * key * 0.34 * u_intensity;
  col += mix(u_colorA, warm, 0.5) * key * key * 0.22;
  float bounce = exp(-abs(p.y - floorLine) * 6.0) * exp(-dot(toLight, toLight) * 1.2);
  col += mix(u_colorB, vec3(1.0), 0.4) * bounce * 0.12 * u_intensity;
  float rimLeft = exp(-pow((p.x + aspect * 0.52), 2.0) * 9.0) * smoothstep(-0.45, 0.35, p.y);
  col += u_colorB * rimLeft * 0.16 * u_intensity;
  float rimRight = exp(-pow((p.x - aspect * 0.52), 2.0) * 9.0) * smoothstep(-0.45, 0.35, p.y);
  col += u_colorC * rimRight * 0.14 * u_intensity;
  float glow = exp(-abs(p.y - floorLine) * 26.0);
  col += mix(u_colorA, u_colorB, 0.5) * glow * 0.08;
  float vignette = smoothstep(1.25, 0.35, length(p * vec2(0.85, 1.15)));
  col *= 0.55 + 0.45 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return StudioShader;
});

;
Dixel.define('VolumetricShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  const CORNERS = {
    'top-left': [-0.12, 1.12],
    'top-right': [1.12, 1.12],
    'bottom-left': [-0.12, -0.12],
    'bottom-right': [1.12, -0.12]
  };

  class VolumetricShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      corner: 'top-left',
      angle: 0,
      resolutionScale: 0.7,
      frozenTime: 11
    });

    ready() {
      this.rayOrigin = CORNERS[this.options.corner] || CORNERS['top-left'];
      this.rayAngle = (this.options.angle * Math.PI) / 180;
      super.ready();
    }

    onDraw(gl) {
      const origin = this.uniforms.u_rayOrigin;
      if (origin) gl.uniform2f(origin, this.rayOrigin[0], this.rayOrigin[1]);
      const angle = this.uniforms.u_rayAngle;
      if (angle) gl.uniform1f(angle, this.rayAngle);
    }

    fragmentShader() {
      return `
uniform vec2 u_rayOrigin;
uniform float u_rayAngle;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.9, 4.7);
    amplitude *= 0.5;
  }
  return value;
}
float dust(vec2 p, float t, float scale, float seed) {
  vec2 q = p * scale + vec2(t * 0.35 * (0.5 + fract(seed * 0.37)), t * (0.4 + fract(seed * 0.71)) * 0.5) + seed;
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float rnd = hash2(cell + seed);
  vec2 jitter = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.7;
  jitter += vec2(sin(t * 0.8 + rnd * 6.28), cos(t * 0.6 + rnd * 4.2)) * 0.12;
  vec2 d = f - jitter;
  float size = mix(90.0, 380.0, fract(rnd * 5.3));
  float particle = exp(-dot(d, d) * size);
  float twinkle = 0.6 + 0.4 * sin(t * (1.0 + fract(rnd * 3.1) * 2.0) + rnd * 6.28);
  return particle * step(0.45, rnd) * twinkle;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 origin = vec2(u_rayOrigin.x * aspect, u_rayOrigin.y);
  float t = u_time * 0.4;
  vec2 toPixel = p - origin;
  float dist = length(toPixel);
  float ang = atan(toPixel.y, toPixel.x) + u_rayAngle;
  float breath = 0.82 + 0.18 * sin(t * 0.9);
  float shafts = fbm(vec2(ang * 7.0 * u_scale, dist * 0.4 - t * 0.28));
  shafts = pow(shafts, 3.4);
  float shafts2 = fbm(vec2(ang * 13.0 * u_scale + 40.0, dist * 0.6 - t * 0.2));
  shafts += pow(shafts2, 4.2) * 0.6;
  float reach = exp(-dist * 0.85) * smoothstep(0.02, 0.35, dist);
  float beam = shafts * reach * breath;
  vec3 col = mix(u_colorA * 0.045, u_colorA * 0.11, uv.y) + vec3(0.003, 0.004, 0.01);
  vec3 lightColor = mix(u_colorB, vec3(1.0), 0.35);
  col += lightColor * beam * 1.35 * u_intensity;
  col += u_colorA * beam * 0.45;
  float sourceGlow = exp(-dist * 2.6);
  col += mix(lightColor, vec3(1.0), 0.5) * sourceGlow * 0.5 * u_intensity;
  float inBeam = 0.25 + shafts * reach * 3.0;
  float motes = dust(p, t, 9.0, 3.0) * 0.5 + dust(p, t, 16.0, 17.0) * 0.3 + dust(p, t * 1.3, 26.0, 51.0) * 0.2;
  col += mix(u_colorB, vec3(1.0), 0.55) * motes * inBeam * 0.65 * u_intensity;
  col += u_colorC * motes * beam * 0.4;
  float vignette = smoothstep(1.7, 0.5, length(vec2(p.x - aspect * 0.5, uv.y - 0.5)));
  col *= 0.72 + 0.28 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.01;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return VolumetricShader;
});

;
Dixel.define('VortexShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class VortexShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      direction: 1,
      tilt: 0.4,
      tiltSpeed: 0.42,
      resolutionScale: 0.75,
      frozenTime: 12
    });

    onDraw(gl) {
      const direction = this.uniforms.u_direction;
      if (direction) gl.uniform1f(direction, this.options.direction >= 0 ? 1 : -1);
      const tilt = this.uniforms.u_tilt;
      if (tilt) gl.uniform1f(tilt, this.options.tilt);
      const tiltSpeed = this.uniforms.u_tiltSpeed;
      if (tiltSpeed) gl.uniform1f(tiltSpeed, this.options.tiltSpeed);
    }

    fragmentShader() {
      return `
uniform float u_direction;
uniform float u_tilt;
uniform float u_tiltSpeed;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.05 + vec2(4.2, 2.6);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time;
  float theta = u_tilt + t * u_tiltSpeed;
  float ct = cos(theta);
  float st = sin(theta);
  vec2 pr = vec2(p.x * ct - p.y * st, p.x * st + p.y * ct);
  float squash = 0.74 + 0.12 * sin(t * u_tiltSpeed * 1.3 + 0.7);
  pr.y /= squash;
  float r0 = length(pr);
  pr.y += (1.0 - squash) * 0.5 / (r0 + 0.4);
  p = pr;
  float r = max(length(p), 0.0001);
  float a = atan(p.y, p.x) * u_direction;
  float accel = 1.0 / (r + 0.14);
  float phase = a + log(r) * 3.4 - t * 1.15 * accel;
  float armsWide = pow(0.5 + 0.5 * sin(phase * 3.0), 2.0);
  float armsFine = pow(0.5 + 0.5 * sin(phase * 8.0 + 1.3), 3.5);
  float spin = t * 0.9 * accel * u_direction;
  float cs = cos(spin);
  float sn = sin(spin);
  vec2 sheared = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
  float turbulence = fbm(sheared * 2.6 + vec2(3.0, 7.0));
  float striae = (armsWide * 0.65 + armsFine * 0.55) * (0.45 + turbulence * 0.9);
  float inward = smoothstep(1.7, 0.05, r);
  float suction = clamp(accel * 0.42, 0.0, 1.8);
  vec3 outerTone = mix(u_colorC, u_colorA, smoothstep(1.4, 0.5, r));
  vec3 innerTone = mix(u_colorA, u_colorB, smoothstep(0.7, 0.12, r));
  vec3 tone = mix(outerTone, innerTone, smoothstep(1.0, 0.25, r));
  vec3 col = vec3(0.006, 0.006, 0.016);
  col += tone * striae * inward * (0.35 + suction * 0.75) * u_intensity;
  col += u_colorB * pow(armsFine, 2.0) * smoothstep(0.85, 0.2, r) * suction * 0.4;
  float funnel = smoothstep(0.6, 0.06, r);
  col *= mix(1.0, 0.28, funnel);
  float eye = exp(-r * r * 42.0);
  col += mix(u_colorB, vec3(1.0), 0.55) * eye * (0.45 + 0.12 * sin(t * 2.4)) * u_intensity;
  col += u_colorA * exp(-r * r * 7.0) * 0.18;
  float rim = exp(-pow((r - 0.24) * 12.0, 2.0));
  col += u_colorB * rim * striae * 0.55;
  float dimming = smoothstep(0.2, 1.55, r);
  col *= 1.0 - dimming * 0.55;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.01;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return VortexShader;
});

;
Dixel.define('WaterDropShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  const MAX_DROPS = 3;

  class WaterDropShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.85,
      interactive: false,
      frozenTime: 10.6
    });

    ready() {
      this.drops = new Float32Array(MAX_DROPS * 4);
      this.dropIndex = 0;
      super.ready();
      if (this.options.interactive) this.listen(this.el, 'click', this.launchDrop);
    }

    launchDrop(event) {
      if (!this.gl) return;
      const minSide = Math.min(this.cssWidth, this.cssHeight);
      const localX = (event.clientX - this.rectLeft) / this.cssWidth;
      const slot = this.dropIndex * 4;
      this.drops[slot] = (localX * 2 - 1) * (this.cssWidth / minSide) * this.options.scale;
      this.drops[slot + 1] = 0;
      this.drops[slot + 2] = this.time;
      this.drops[slot + 3] = 1;
      this.dropIndex = (this.dropIndex + 1) % MAX_DROPS;
    }

    onDraw(gl) {
      const location = this.uniforms.u_drops;
      if (location) gl.uniform4fv(location, this.drops);
    }

    fragmentShader() {
      return `
uniform vec4 u_drops[${MAX_DROPS}];
const float REST = -0.28;
const float PERIOD = 4.6;
const float FALL = 0.9;
float hash1(float n) {
  return fract(sin(n) * 43758.5453123);
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float circleField(vec2 p, vec2 c, float r) {
  return length(p - c) - r;
}
float capsuleField(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float dropHeight(float x, float x0, float age) {
  float s = age - FALL;
  if (s < 0.0) return 0.0;
  float d = abs(x - x0);
  float amp = 0.075 * exp(-s * 1.15) * smoothstep(0.0, 0.07, s) * (1.0 - smoothstep(1.9, 2.7, s));
  float h = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float w = (d - (s * 0.5 - fk * 0.17)) / 0.075;
    h += amp * w * exp(-w * w) / (1.0 + fk * 0.9);
  }
  float crater = -0.13 * exp(-d * d * 150.0) * exp(-s * 7.0);
  float mound = 0.045 * exp(-d * d * 70.0) * exp(-s * 4.5) * smoothstep(0.0, 0.2, s);
  return h + crater + mound;
}
float dropBlobs(vec2 p, float x0, float age, float seed) {
  float d = 1000.0;
  float prog = age / FALL;
  if (prog < 1.0) {
    float fallY = 1.15 - (1.15 - REST) * prog * prog;
    vec2 q = p - vec2(x0, fallY);
    q.y /= 1.0 + prog * 0.3;
    q.x *= 1.0 + prog * 0.14;
    d = min(d, length(q) - 0.075);
  }
  float sc = age - FALL;
  if (sc > 0.0) {
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float side = sign(fi - 1.5);
      float inner = mod(fi, 2.0);
      float vx = side * mix(0.42, 0.2, inner) * (0.9 + hash1(seed + fi) * 0.2);
      float vy = mix(0.75, 1.0, inner) * (0.9 + hash1(seed + fi + 9.0) * 0.2);
      float bx = x0 + vx * sc;
      float by = REST + 0.02 + vy * sc - 1.9 * sc * sc;
      float br = 0.035 * smoothstep(0.0, 0.05, sc) * smoothstep(1.5, 0.9, sc) * (1.0 - inner * 0.3);
      d = min(d, circleField(p, vec2(bx, by), max(br, 0.001)));
    }
    float jn = (sc - 0.38) / 0.19;
    float jh = exp(-jn * jn) * 0.38;
    float jr = 0.05 * smoothstep(0.08, 0.3, sc) * smoothstep(1.05, 0.6, sc);
    d = min(d, capsuleField(p, vec2(x0, REST - 0.05), vec2(x0, REST + jh), max(jr, 0.001)));
    float u = sc - 0.5;
    if (u > 0.0 && u < 1.6) {
      float vy2 = 1.35 - 2.6 * u;
      float sy = REST + 0.3 + 1.35 * u - 1.3 * u * u;
      float sq = 1.0 + min(abs(vy2), 1.3) * 0.24;
      vec2 q2 = p - vec2(x0 + sin(u * 2.4) * 0.015, sy);
      q2.y /= sq;
      q2.x *= sqrt(sq);
      float sr = 0.052 * smoothstep(0.0, 0.06, u) * smoothstep(1.6, 1.35, u);
      d = min(d, length(q2) - max(sr, 0.001));
    }
  }
  return d;
}
float field(vec2 p, float t, vec2 pointer, float pointerNear) {
  float h = REST + sin(p.x * 3.1 + t * 0.9) * 0.008 + sin(p.x * 6.7 - t * 1.4) * 0.005;
  float cycle = floor(t / PERIOD);
  float age = t - cycle * PERIOD;
  float x0 = (hash1(cycle * 17.3 + 3.7) - 0.5) * 0.9;
  float settle = 1.0 - smoothstep(PERIOD * 0.52, PERIOD * 0.78, age);
  h += dropHeight(p.x, x0, age) * settle;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec4 drop = u_drops[i];
    float clickAge = t - drop.z;
    if (drop.w > 0.5 && clickAge > 0.0 && clickAge < PERIOD) {
      float clickSettle = 1.0 - smoothstep(PERIOD * 0.52, PERIOD * 0.78, clickAge);
      h += dropHeight(p.x, drop.x, clickAge) * clickSettle;
    }
  }
  float spread = exp(-(p.x - pointer.x) * (p.x - pointer.x) * 9.0);
  float lift = clamp(pointer.y - REST, -0.3, 0.6) * exp(-abs(pointer.y - REST) * 1.6);
  h += spread * lift * 0.55 * u_intensity;
  float d = p.y - h;
  d = smin(d, dropBlobs(p, x0, age, cycle), 0.14);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec4 drop = u_drops[i];
    float clickAge = t - drop.z;
    if (drop.w > 0.5 && clickAge > 0.0 && clickAge < PERIOD) d = smin(d, dropBlobs(p, drop.x, clickAge, drop.z), 0.14);
  }
  float pointerBlob = circleField(p, pointer, 0.05) + (1.0 - pointerNear) * 4.0;
  d = smin(d, pointerBlob, 0.3);
  return d;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time;
  float pointerNear = smoothstep(0.85, 0.2, abs(pointer.y - REST));
  float d = field(p, t, pointer, pointerNear);
  vec2 lightDir = normalize(vec2(-0.55, 0.85));
  float dl = field(p + lightDir * 0.03, t, pointer, pointerNear);
  float mask = smoothstep(0.012, -0.012, d);
  vec3 col = mix(vec3(0.012, 0.014, 0.03), vec3(0.03, 0.028, 0.07), uv.y);
  vec2 glowAt = p - vec2(0.0, 1.05);
  col += u_colorC * exp(-dot(glowAt, glowAt) * 1.4) * 0.06;
  float glow = exp(-max(d, 0.0) * 26.0);
  col += mix(u_colorA, u_colorB, 0.5) * glow * 0.1;
  float depth = clamp((REST - p.y) * 1.5, 0.0, 1.0);
  vec3 water = mix(mix(u_colorA, u_colorB, 0.65) * 0.5, u_colorA * 0.16, depth);
  float slope = clamp((dl - d) * 34.0, 0.0, 1.0);
  water *= 0.8 + slope * 0.5;
  float inner = smoothstep(-0.012, -0.09, d);
  water += mix(u_colorB, vec3(1.0), 0.4) * (1.0 - inner) * 0.35;
  col = mix(col, water, mask);
  float rim = exp(-abs(d) * 90.0);
  col += mix(u_colorB, vec3(1.0), 0.6) * rim * 0.4 * u_intensity;
  col += vec3(1.0) * pow(slope, 3.0) * mask * 0.8 * u_intensity;
  float vignette = smoothstep(1.9, 0.5, length(p));
  col *= 0.82 + 0.18 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return WaterDropShader;
});

;
Dixel.define('WaveGridShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class WaveGridShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 1,
      frozenTime: 7
    });

    fragmentShader() {
      return `
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  float t = u_time;
  float horizon = 0.16 + (u_pointer.y - 0.5) * 0.06;
  float sunGlow = exp(-pow(length(vec2(p.x * 0.7, p.y - horizon)) * 2.2, 2.0));
  vec3 col;
  if (p.y > horizon) {
    float sky = smoothstep(horizon, 1.2, p.y);
    col = mix(u_colorA * 0.16, vec3(0.008, 0.008, 0.03), sky);
    col += u_colorC * sunGlow * 0.55;
    col += u_colorB * exp(-abs(p.y - horizon) * 22.0) * 0.5;
  } else {
    float dist = horizon - p.y;
    float depth = 1.0 / (dist + 0.045);
    vec2 world = vec2(p.x * depth * 1.4 + (u_pointer.x - 0.5) * 0.8, depth * 1.4 + t * 2.0) * u_scale;
    float px = 2.0 / u_resolution.y;
    float dd = depth * depth * px;
    float aaX = 1.4 * u_scale * (depth * px + abs(p.x) * dd) + 0.0001;
    float aaY = 1.4 * u_scale * dd + 0.0001;
    float lw = 0.04;
    float gx = 1.0 - smoothstep(lw, lw + aaX, abs(fract(world.x + 0.5) - 0.5));
    float gy = 1.0 - smoothstep(lw, lw + aaY, abs(fract(world.y + 0.5) - 0.5));
    gx *= clamp(lw * 2.4 / aaX, 0.0, 1.0);
    gy *= clamp(lw * 2.4 / aaY, 0.0, 1.0);
    float grid = max(gx, gy);
    float fog = exp(-depth * 0.17) * smoothstep(0.0, 0.055, dist);
    float wave = sin(world.y * 0.6 - t * 1.3 + sin(world.x * 0.5 + t * 0.4) * 1.4) * fog;
    vec3 lineColor = mix(u_colorB, u_colorA, smoothstep(-1.0, 1.0, wave));
    col = mix(vec3(0.01, 0.01, 0.025), vec3(0.02, 0.015, 0.05), fog);
    col += lineColor * grid * fog * (0.62 + 0.5 * wave) * u_intensity;
    col += u_colorC * exp(-abs(p.y - horizon) * 14.0) * 0.4;
    col += u_colorA * fog * 0.05;
  }
  float vignette = smoothstep(1.9, 0.6, length(p * vec2(0.7, 1.0)));
  col *= 0.8 + 0.2 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return WaveGridShader;
});

;
Dixel.define('BoxMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  function scaled(axis, factor) {
    return [axis[0] * factor, axis[1] * factor, axis[2] * factor];
  }

  function sum3(a, b, c) {
    return [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
  }

  class BoxMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      size: 1.7,
      bevel: 0.14,
      initialRotationX: 0.5,
      initialRotationY: 0.75
    });

    createGeometry() {
      const half = this.options.size / 2;
      const bevel = Math.min(Math.max(this.options.bevel, 0), half * 0.45);
      const inner = half - bevel;
      const polygons = [];
      for (let axis = 0; axis < 3; axis++) {
        const u = AXES[(axis + 1) % 3];
        const v = AXES[(axis + 2) % 3];
        for (let sign = -1; sign <= 1; sign += 2) {
          const face = scaled(AXES[axis], sign * half);
          polygons.push(CORNERS.map(([su, sv]) => sum3(face, scaled(u, su * inner), scaled(v, sv * inner))));
        }
      }
      if (bevel > 0.001) {
        const pairs = [[0, 1, 2], [0, 2, 1], [1, 2, 0]];
        pairs.forEach(([a1, a2, w]) => {
          for (let s1 = -1; s1 <= 1; s1 += 2) {
            for (let s2 = -1; s2 <= 1; s2 += 2) {
              const edgeA = sum3(scaled(AXES[a1], s1 * half), scaled(AXES[a2], s2 * inner), [0, 0, 0]);
              const edgeB = sum3(scaled(AXES[a1], s1 * inner), scaled(AXES[a2], s2 * half), [0, 0, 0]);
              polygons.push([
                sum3(edgeA, scaled(AXES[w], -inner), [0, 0, 0]),
                sum3(edgeA, scaled(AXES[w], inner), [0, 0, 0]),
                sum3(edgeB, scaled(AXES[w], inner), [0, 0, 0]),
                sum3(edgeB, scaled(AXES[w], -inner), [0, 0, 0])
              ]);
            }
          }
        });
        for (let sx = -1; sx <= 1; sx += 2) {
          for (let sy = -1; sy <= 1; sy += 2) {
            for (let sz = -1; sz <= 1; sz += 2) {
              polygons.push([
                [sx * half, sy * inner, sz * inner],
                [sx * inner, sy * half, sz * inner],
                [sx * inner, sy * inner, sz * half]
              ]);
            }
          }
        }
      }
      return Mesh3D.buildFacets(polygons);
    }
  }

  return BoxMesh;
});

;
Dixel.define('ConeMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class ConeMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 1,
      height: 1.8,
      radialSegments: 30,
      initialRotationX: 0.45
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const edges = [];
      const segments = options.radialSegments;
      const radius = options.radius;
      const height = options.height;
      const baseY = -height * 0.42;
      const apexY = height * 0.58;
      const slant = Math.hypot(height, radius);
      const ny = radius / slant;
      const scale = height / slant;
      for (let column = 0; column <= segments; column++) {
        const theta = (column / segments) * Math.PI * 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        positions.push(cos * radius, baseY, sin * radius);
        normals.push(cos * scale, ny, sin * scale);
      }
      const apexBase = positions.length / 3;
      for (let column = 0; column < segments; column++) {
        const theta = ((column + 0.5) / segments) * Math.PI * 2;
        positions.push(0, apexY, 0);
        normals.push(Math.cos(theta) * scale, ny, Math.sin(theta) * scale);
      }
      for (let column = 0; column < segments; column++) {
        indices.push(column, apexBase + column, column + 1);
        edges.push(column, column + 1);
        if (column % 2 === 0) edges.push(column, apexBase + column);
      }
      const center = positions.length / 3;
      positions.push(0, baseY, 0);
      normals.push(0, -1, 0);
      for (let column = 0; column <= segments; column++) {
        const theta = (column / segments) * Math.PI * 2;
        positions.push(Math.cos(theta) * radius, baseY, Math.sin(theta) * radius);
        normals.push(0, -1, 0);
      }
      for (let column = 0; column < segments; column++) {
        indices.push(center, center + 1 + column, center + 2 + column);
      }
      return { positions, normals, indices, edges };
    }
  }

  return ConeMesh;
});

;
Dixel.define('CylinderMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class CylinderMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 0.85,
      height: 1.7,
      radialSegments: 30,
      initialRotationX: 0.55
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const edges = [];
      const segments = options.radialSegments;
      const radius = options.radius;
      const halfHeight = options.height / 2;
      const stride = segments + 1;
      for (let row = 0; row < 2; row++) {
        const y = row === 0 ? -halfHeight : halfHeight;
        for (let column = 0; column <= segments; column++) {
          const theta = (column / segments) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          positions.push(cos * radius, y, sin * radius);
          normals.push(cos, 0, sin);
        }
      }
      for (let column = 0; column < segments; column++) {
        const a = column;
        const b = column + stride;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
        edges.push(a, a + 1, b, b + 1, a, b);
      }
      for (let side = -1; side <= 1; side += 2) {
        const y = side * halfHeight;
        const center = positions.length / 3;
        positions.push(0, y, 0);
        normals.push(0, side, 0);
        for (let column = 0; column <= segments; column++) {
          const theta = (column / segments) * Math.PI * 2;
          positions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
          normals.push(0, side, 0);
        }
        for (let column = 0; column < segments; column++) {
          indices.push(center, center + 1 + column, center + 2 + column);
        }
      }
      return { positions, normals, indices, edges };
    }
  }

  return CylinderMesh;
});

;
Dixel.define('GemMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class GemMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      facets: 8,
      radius: 1.05,
      tableRatio: 0.52,
      crownHeight: 0.38,
      pavilionDepth: 0.95,
      initialRotationX: 0.55
    });

    createGeometry() {
      const options = this.options;
      const count = Math.max(5, Math.round(options.facets));
      const radius = options.radius;
      const offsetY = (options.pavilionDepth - options.crownHeight) / 2;
      const girdleY = offsetY;
      const tableY = options.crownHeight + offsetY;
      const culet = [0, -options.pavilionDepth + offsetY, 0];
      const girdle = [];
      const table = [];
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        const thetaTable = ((i + 0.5) / count) * Math.PI * 2;
        girdle.push([Math.cos(theta) * radius, girdleY, Math.sin(theta) * radius]);
        table.push([
          Math.cos(thetaTable) * radius * options.tableRatio,
          tableY,
          Math.sin(thetaTable) * radius * options.tableRatio
        ]);
      }
      const polygons = [table.slice()];
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        polygons.push([girdle[i], girdle[next], table[i]]);
        polygons.push([table[i], girdle[next], table[next]]);
        polygons.push([girdle[i], girdle[next], culet]);
      }
      return Mesh3D.buildFacets(polygons);
    }
  }

  return GemMesh;
});

;
Dixel.define('IcosaMesh', ['Mesh3D', 'Utils'], function (Mesh3D, Utils) {
  'use strict';

  function buildIcosahedron() {
    const golden = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
      [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
      [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1]
    ];
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    return { vertices, faces };
  }

  class IcosaMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      detail: 1,
      radius: 1.15,
      initialRotationX: 0.35
    });

    createGeometry() {
      const base = buildIcosahedron();
      const vertices = base.vertices.map((v) => v.slice());
      let faces = base.faces;
      const detail = Math.round(Utils.clamp(this.options.detail, 0, 4));
      const midpointCache = new Map();
      const midpoint = (a, b) => {
        const key = Math.min(a, b) + '_' + Math.max(a, b);
        if (midpointCache.has(key)) return midpointCache.get(key);
        const va = vertices[a];
        const vb = vertices[b];
        vertices.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
        const index = vertices.length - 1;
        midpointCache.set(key, index);
        return index;
      };
      for (let level = 0; level < detail; level++) {
        const next = [];
        faces.forEach((face) => {
          const ab = midpoint(face[0], face[1]);
          const bc = midpoint(face[1], face[2]);
          const ca = midpoint(face[2], face[0]);
          next.push([face[0], ab, ca], [face[1], bc, ab], [face[2], ca, bc], [ab, bc, ca]);
        });
        faces = next;
      }
      const radius = this.options.radius;
      const positions = [];
      const normals = [];
      vertices.forEach((v) => {
        const length = Math.hypot(v[0], v[1], v[2]) || 1;
        const nx = v[0] / length;
        const ny = v[1] / length;
        const nz = v[2] / length;
        positions.push(nx * radius, ny * radius, nz * radius);
        normals.push(nx, ny, nz);
      });
      const indices = [];
      faces.forEach((face) => indices.push(face[0], face[1], face[2]));
      return { positions, normals, indices };
    }
  }

  return IcosaMesh;
});

;
Dixel.define('IsoField', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  function hexToRgb(hex) {
    return Utils.channels(Utils.color(hex, 'primary')) || [109, 92, 255];
  }

  function shade(rgb, factor, mixWhite) {
    const white = mixWhite || 0;
    const r = Math.round(Utils.clamp((rgb[0] * factor) * (1 - white) + 255 * white, 0, 255));
    const g = Math.round(Utils.clamp((rgb[1] * factor) * (1 - white) + 255 * white, 0, 255));
    const b = Math.round(Utils.clamp((rgb[2] * factor) * (1 - white) + 255 * white, 0, 255));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  const TONE_STEPS = 20;

  class IsoField extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      background: 'bg',
      columns: 15,
      rows: 15,
      speed: 1,
      amplitude: 1,
      lift: 1.5,
      liftRadius: 3,
      frozenTime: 5
    };

    ready() {
      this.el.classList.add('dx-mesh', 'dx-mesh--flat');
      this.time = 0;
      this.staticDrawn = false;
      this.canvas = Utils.el('canvas', 'dx-mesh-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.buildPalette();
      this.measure();
      this.addCleanup(Pointer.use());
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      this.onFrame(this.frame);
    }

    buildPalette() {
      const top = hexToRgb(this.options.colorB);
      const left = hexToRgb(this.options.colorA);
      const right = hexToRgb(this.options.colorC);
      this.topTones = [];
      this.leftTones = [];
      this.rightTones = [];
      for (let step = 0; step < TONE_STEPS; step++) {
        const level = step / (TONE_STEPS - 1);
        this.topTones.push(shade(top, 0.55 + level * 0.55, level * 0.25));
        this.leftTones.push(shade(left, 0.4 + level * 0.5, 0));
        this.rightTones.push(shade(right, 0.22 + level * 0.3, 0));
      }
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      this.rectLeft = rect.left;
      this.rectTopDocument = rect.top + (window.scrollY || 0);
      const dpr = Utils.dpr;
      this.canvas.width = Math.round(this.cssWidth * dpr);
      this.canvas.height = Math.round(this.cssHeight * dpr);
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const columns = this.options.columns;
      const rows = this.options.rows;
      this.tileWidth = (this.cssWidth * 0.92) / ((columns + rows) / 2);
      this.tileHeight = this.tileWidth * 0.5;
      this.waveHeight = this.tileWidth * 0.55 * this.options.amplitude;
      this.originX = this.cssWidth / 2;
      this.originY = this.cssHeight / 2 - ((columns + rows) / 4) * this.tileHeight + this.tileHeight;
      this.staticDrawn = false;
    }

    frame(time, delta) {
      if (!this.visible || document.hidden) return;
      if (Utils.reducedMotion) {
        if (this.staticDrawn) return;
        this.time = this.options.frozenTime;
        this.draw(false);
        this.staticDrawn = true;
        return;
      }
      this.time += delta * this.options.speed;
      this.draw(true);
    }

    pointerCell() {
      const top = this.rectTopDocument - (window.scrollY || 0);
      const localX = Pointer.smoothX - this.rectLeft - this.originX;
      const localY = Pointer.smoothY - top - this.originY;
      const halfW = this.tileWidth / 2;
      const halfH = this.tileHeight / 2;
      return {
        i: (localX / halfW + localY / halfH) / 2,
        j: (localY / halfH - localX / halfW) / 2
      };
    }

    draw(interactive) {
      const ctx = this.context;
      const options = this.options;
      const t = this.time;
      ctx.fillStyle = Utils.color(options.background, 'bg');
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
      const halfW = this.tileWidth / 2;
      const halfH = this.tileHeight / 2;
      const pointer = interactive ? this.pointerCell() : null;
      const liftRadius = options.liftRadius;
      const maxTone = TONE_STEPS - 1;
      for (let j = 0; j < options.rows; j++) {
        for (let i = 0; i < options.columns; i++) {
          let wave = Math.sin(i * 0.55 + t * 1.7) * 0.5 + Math.cos(j * 0.5 + t * 1.35) * 0.4;
          wave += Math.sin((i + j) * 0.38 - t * 1.1) * 0.6;
          let height = (wave * 0.5 + 0.75) * this.waveHeight;
          if (pointer) {
            const di = i - pointer.i;
            const dj = j - pointer.j;
            const falloff = Math.exp(-(di * di + dj * dj) / (liftRadius * liftRadius));
            height += falloff * this.waveHeight * options.lift;
          }
          const x = this.originX + (i - j) * halfW;
          const baseY = this.originY + (i + j) * halfH;
          const topY = baseY - height;
          const tone = Math.round(Utils.clamp(height / (this.waveHeight * (1.5 + options.lift)), 0, 1) * maxTone);
          ctx.fillStyle = this.leftTones[tone];
          ctx.beginPath();
          ctx.moveTo(x - halfW, topY + halfH);
          ctx.lineTo(x, topY + this.tileHeight);
          ctx.lineTo(x, baseY + this.tileHeight);
          ctx.lineTo(x - halfW, baseY + halfH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = this.rightTones[tone];
          ctx.beginPath();
          ctx.moveTo(x + halfW, topY + halfH);
          ctx.lineTo(x, topY + this.tileHeight);
          ctx.lineTo(x, baseY + this.tileHeight);
          ctx.lineTo(x + halfW, baseY + halfH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = this.topTones[tone];
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x + halfW, topY + halfH);
          ctx.lineTo(x, topY + this.tileHeight);
          ctx.lineTo(x - halfW, topY + halfH);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  return IsoField;
});

;
Dixel.define('KnotMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  function knotPoint(t, p, q, scale) {
    const r = 2 + Math.cos(q * t);
    return [
      r * Math.cos(p * t) * scale,
      Math.sin(q * t) * scale * 1.2,
      r * Math.sin(p * t) * scale
    ];
  }

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  class KnotMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      p: 2,
      q: 3,
      tubeRadius: 0.24,
      pathSegments: 150,
      tubeSegments: 12,
      distance: 3.8,
      initialRotationX: 0.5
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const paths = options.pathSegments;
      const tubes = options.tubeSegments;
      const scale = 0.42;
      const epsilon = 0.001;
      for (let step = 0; step <= paths; step++) {
        const t = (step / paths) * Math.PI * 2;
        const center = knotPoint(t, options.p, options.q, scale);
        const ahead = knotPoint(t + epsilon, options.p, options.q, scale);
        const tangent = normalize(subtract(ahead, center));
        const binormal = normalize(cross(tangent, normalize(center)));
        const normal = normalize(cross(binormal, tangent));
        for (let tube = 0; tube <= tubes; tube++) {
          const angle = (tube / tubes) * Math.PI * 2;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const nx = normal[0] * cosA + binormal[0] * sinA;
          const ny = normal[1] * cosA + binormal[1] * sinA;
          const nz = normal[2] * cosA + binormal[2] * sinA;
          positions.push(
            center[0] + nx * options.tubeRadius,
            center[1] + ny * options.tubeRadius,
            center[2] + nz * options.tubeRadius
          );
          normals.push(nx, ny, nz);
        }
      }
      const stride = tubes + 1;
      for (let step = 0; step < paths; step++) {
        for (let tube = 0; tube < tubes; tube++) {
          const a = step * stride + tube;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return { positions, normals, indices, edges: Mesh3D.gridEdges(paths, tubes) };
    }
  }

  return KnotMesh;
});

;
Dixel.define('Mesh3D', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  function hexToVec3(hex) {
    const parts = Utils.channels(Utils.color(hex, 'primary'));
    if (!parts) return [0.5, 0.5, 0.5];
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }

  function mat4Identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  function mat4Perspective(fovDegrees, aspect, near, far) {
    const m = new Float32Array(16);
    const f = 1 / Math.tan((fovDegrees * Math.PI) / 360);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }

  function mat4LookAt(eye, target, up) {
    const zx = eye[0] - target[0];
    const zy = eye[1] - target[1];
    const zz = eye[2] - target[2];
    const zl = 1 / Math.hypot(zx, zy, zz);
    const z = [zx * zl, zy * zl, zz * zl];
    const xx = up[1] * z[2] - up[2] * z[1];
    const xy = up[2] * z[0] - up[0] * z[2];
    const xz = up[0] * z[1] - up[1] * z[0];
    const xl = 1 / Math.hypot(xx, xy, xz);
    const x = [xx * xl, xy * xl, xz * xl];
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const m = mat4Identity();
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    return m;
  }

  function mat4RotationX(angle) {
    const m = mat4Identity();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m[5] = c; m[9] = -s;
    m[6] = s; m[10] = c;
    return m;
  }

  function mat4RotationY(angle) {
    const m = mat4Identity();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m[0] = c; m[8] = s;
    m[2] = -s; m[10] = c;
    return m;
  }

  function mat4Multiply(a, b) {
    const m = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
        m[column * 4 + row] = sum;
      }
    }
    return m;
  }

  function uniqueEdges(positions, pairs) {
    const keyOf = (index) =>
      positions[index * 3].toFixed(3) + ',' + positions[index * 3 + 1].toFixed(3) + ',' + positions[index * 3 + 2].toFixed(3);
    const seen = new Set();
    const edges = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const a = keyOf(pairs[i]);
      const b = keyOf(pairs[i + 1]);
      if (a === b) continue;
      const key = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(pairs[i], pairs[i + 1]);
    }
    return edges;
  }

  function gridEdges(rows, columns) {
    const stride = columns + 1;
    const edges = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const index = row * stride + column;
        if (column < columns) edges.push(index, index + 1);
        if (row < rows) edges.push(index, index + stride);
      }
    }
    return edges;
  }

  function buildFacets(polygons) {
    const positions = [];
    const normals = [];
    const indices = [];
    const outline = [];
    polygons.forEach((polygon) => {
      const [a, b, c] = polygon;
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      polygon.forEach((point) => {
        cx += point[0];
        cy += point[1];
        cz += point[2];
      });
      let points = polygon;
      if (nx * cx + ny * cy + nz * cz < 0) {
        points = polygon.slice().reverse();
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const base = positions.length / 3;
      points.forEach((point) => {
        positions.push(point[0], point[1], point[2]);
        normals.push(nx, ny, nz);
      });
      for (let i = 1; i < points.length - 1; i++) indices.push(base, base + i, base + i + 1);
      for (let i = 0; i < points.length; i++) outline.push(base + i, base + ((i + 1) % points.length));
    });
    return { positions, normals, indices, edges: uniqueEdges(positions, outline) };
  }

  const VERTEX_TEMPLATE = [
    'attribute vec3 a_position;',
    'attribute vec3 a_normal;',
    'uniform mat4 u_mvp;',
    'uniform mat4 u_model;',
    'uniform float u_time;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    '{{CHUNK}}',
    'void main() {',
    '  vec3 pos = displace(a_position);',
    '  vec3 nor = displaceNormal(a_position, a_normal);',
    '  mat3 rotation = mat3(u_model[0].xyz, u_model[1].xyz, u_model[2].xyz);',
    '  v_normal = normalize(rotation * nor);',
    '  vec4 world = u_model * vec4(pos, 1.0);',
    '  v_world = world.xyz;',
    '  vec4 clip = u_mvp * vec4(pos, 1.0);',
    '  v_viewZ = clip.w;',
    '  gl_Position = clip;',
    '}'
  ].join('\n');

  const DEFAULT_CHUNK = [
    'vec3 displace(vec3 p) { return p; }',
    'vec3 displaceNormal(vec3 p, vec3 n) { return n; }'
  ].join('\n');

  const WIREFRAME_FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform float u_intensity;',
    'uniform vec2 u_depthRange;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    'void main() {',
    '  float depth = smoothstep(u_depthRange.x, u_depthRange.y, v_viewZ);',
    '  float fade = mix(1.0, 0.12, depth);',
    '  vec3 col = mix(mix(u_colorB, vec3(1.0), 0.42), u_colorA, depth);',
    '  gl_FragColor = vec4(col * fade * u_intensity * 1.25, 1.0);',
    '}'
  ].join('\n');

  const SOLID_FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform vec3 u_colorC;',
    'uniform vec3 u_eye;',
    'uniform float u_intensity;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    'void main() {',
    '  vec3 n = normalize(v_normal);',
    '  if (!gl_FrontFacing) n = -n;',
    '  vec3 lightDir = normalize(vec3(-0.45, 0.85, 0.55));',
    '  vec3 viewDir = normalize(u_eye - v_world);',
    '  float diffuse = max(dot(n, lightDir), 0.0);',
    '  float fill = max(dot(n, normalize(vec3(0.6, -0.35, 0.35))), 0.0);',
    '  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);',
    '  float specular = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 26.0);',
    '  vec3 col = mix(u_colorA * 0.16, mix(u_colorA, u_colorB, 0.5), diffuse);',
    '  col += u_colorB * fill * 0.22;',
    '  col += u_colorC * fresnel * 0.85 * u_intensity;',
    '  col += vec3(1.0) * specular * 0.32;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  const CHROME_FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform vec3 u_colorC;',
    'uniform vec3 u_eye;',
    'uniform float u_intensity;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    'vec3 studioEnvironment(vec2 m) {',
    '  vec3 col = mix(u_colorA * 0.18, mix(u_colorB, vec3(1.0), 0.55), smoothstep(-0.85, 0.9, m.y));',
    '  col += vec3(1.0) * exp(-abs(m.y + 0.12) * 16.0) * 0.75;',
    '  col += mix(u_colorC, vec3(1.0), 0.35) * exp(-abs(m.y - 0.58) * 10.0) * 0.55;',
    '  col += u_colorA * exp(-abs(m.y + 0.62) * 12.0) * 0.4;',
    '  col *= 0.9 + 0.1 * sin(m.x * 3.0);',
    '  return col;',
    '}',
    'void main() {',
    '  vec3 n = normalize(v_normal);',
    '  if (!gl_FrontFacing) n = -n;',
    '  vec3 viewDir = normalize(u_eye - v_world);',
    '  vec3 reflected = reflect(-viewDir, n);',
    '  vec3 col = studioEnvironment(reflected.xy) * (0.55 + 0.45 * u_intensity);',
    '  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);',
    '  col += mix(u_colorB, vec3(1.0), 0.5) * fresnel * 0.9;',
    '  vec3 lightDir = normalize(vec3(-0.45, 0.85, 0.55));',
    '  float specular = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 70.0);',
    '  col += vec3(1.0) * specular * 0.85;',
    '  float grazing = pow(max(dot(reflect(-normalize(vec3(0.7, 0.2, 0.5)), n), viewDir), 0.0), 30.0);',
    '  col += u_colorC * grazing * 0.35;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  class Mesh3D extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      background: 'bg',
      mode: 'wireframe',
      speed: 1,
      intensity: 1,
      fov: 42,
      distance: 3.4,
      autoRotateX: 0.1,
      autoRotateY: 0.32,
      initialRotationX: 0.4,
      initialRotationY: 0.6,
      drag: true,
      dragStrength: 0.006,
      inertia: 1.6,
      parallax: 0.16,
      resolutionScale: 1,
      touchResolutionScale: 0.8,
      frozenRotationY: 0.9
    };

    createGeometry() {
      const faces = [
        { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
        { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
        { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
        { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
        { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
      ];
      const size = 0.85;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const polygons = faces.map((face) =>
        corners.map(([su, sv]) => [
          (face.normal[0] + face.u[0] * su + face.v[0] * sv) * size,
          (face.normal[1] + face.u[1] * su + face.v[1] * sv) * size,
          (face.normal[2] + face.u[2] * su + face.v[2] * sv) * size
        ])
      );
      return buildFacets(polygons);
    }

    vertexChunk() {
      return DEFAULT_CHUNK;
    }

    ready() {
      const mode = String(this.options.mode || 'wireframe').toLowerCase();
      this.renderMode = mode === 'solid' || mode === 'chrome' ? mode : 'wireframe';
      this.el.classList.add('dx-mesh');
      if (this.options.drag && !Utils.reducedMotion) this.el.classList.add('dx-mesh--drag');
      this.time = 0;
      this.sizeDirty = true;
      this.contextLost = false;
      this.staticDrawn = false;
      this.dragging = false;
      this.dragDX = 0;
      this.dragDY = 0;
      this.rotationX = this.options.initialRotationX;
      this.rotationY = this.options.initialRotationY;
      this.velocityX = this.options.autoRotateX * this.options.speed;
      this.velocityY = this.options.autoRotateY * this.options.speed;
      this.parallaxX = 0;
      this.parallaxY = 0;
      this.colorA = hexToVec3(this.options.colorA);
      this.colorB = hexToVec3(this.options.colorB);
      this.colorC = hexToVec3(this.options.colorC);
      this.backgroundColor = hexToVec3(this.options.background);
      this.canvas = Utils.el('canvas', 'dx-mesh-canvas');
      this.el.appendChild(this.canvas);
      this.gl = this.createContext();
      if (!this.gl) {
        this.enableFallback();
        return;
      }
      this.buildGeometry();
      this.setupProgram();
      this.uploadBuffers();
      this.measure();
      this.addCleanup(Pointer.use());
      this.addCleanup(() => this.dispose());
      this.listen(window, 'resize', this.measure);
      this.listen(this.canvas, 'webglcontextlost', this.handleContextLost);
      this.listen(this.canvas, 'webglcontextrestored', this.handleContextRestored);
      if (this.options.drag) {
        this.listen(this.el, 'pointerdown', this.handleDragStart);
        this.listen(window, 'pointermove', this.handleDragMove);
        this.listen(window, 'pointerup', this.handleDragEnd);
        this.listen(window, 'pointercancel', this.handleDragEnd);
      }
      this.whenVisible(() => {});
      this.onFrame(this.frame);
    }

    createContext() {
      const attributes = {
        alpha: false,
        antialias: true,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false
      };
      try {
        return (
          this.canvas.getContext('webgl', attributes) ||
          this.canvas.getContext('experimental-webgl', attributes)
        );
      } catch (error) {
        return null;
      }
    }

    buildGeometry() {
      const geometry = this.createGeometry();
      this.positions = geometry.positions instanceof Float32Array ? geometry.positions : new Float32Array(geometry.positions);
      this.normals = geometry.normals instanceof Float32Array ? geometry.normals : new Float32Array(geometry.normals);
      this.indices = geometry.indices instanceof Uint16Array ? geometry.indices : new Uint16Array(geometry.indices);
      this.vertexCount = this.positions.length / 3;
      let maxRadius = 0;
      for (let i = 0; i < this.positions.length; i += 3) {
        const length = Math.hypot(this.positions[i], this.positions[i + 1], this.positions[i + 2]);
        if (length > maxRadius) maxRadius = length;
      }
      this.radius = Math.max(maxRadius, 0.001);
      if (this.renderMode === 'wireframe') {
        const edges = geometry.edges || this.buildEdges(this.indices);
        this.edges = edges instanceof Uint16Array ? edges : new Uint16Array(edges);
      }
    }

    buildEdges(indices) {
      const seen = new Set();
      const edges = [];
      for (let i = 0; i < indices.length; i += 3) {
        for (let corner = 0; corner < 3; corner++) {
          const a = indices[i + corner];
          const b = indices[i + ((corner + 1) % 3)];
          const key = Math.min(a, b) * 65536 + Math.max(a, b);
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push(a, b);
        }
      }
      return new Uint16Array(edges);
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Dixel ' + this.constructor.name + ' shader compile failed: ' + log);
      }
      return shader;
    }

    setupProgram() {
      const gl = this.gl;
      const vertexSource = VERTEX_TEMPLATE.replace('{{CHUNK}}', this.vertexChunk());
      const mode = this.renderMode;
      const fragmentSource = mode === 'solid' ? SOLID_FRAGMENT : mode === 'chrome' ? CHROME_FRAGMENT : WIREFRAME_FRAGMENT;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.bindAttribLocation(program, 0, 'a_position');
      gl.bindAttribLocation(program, 1, 'a_normal');
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Dixel ' + this.constructor.name + ' program link failed: ' + log);
      }
      this.program = program;
      gl.useProgram(program);
      this.cacheUniforms();
    }

    cacheUniforms() {
      const gl = this.gl;
      this.uniforms = {};
      const total = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < total; i++) {
        const info = gl.getActiveUniform(this.program, i);
        if (!info) continue;
        const name = info.name.replace('[0]', '');
        this.uniforms[name] = gl.getUniformLocation(this.program, info.name);
      }
    }

    uploadBuffers() {
      const gl = this.gl;
      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      this.normalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      const elements = this.renderMode === 'wireframe' ? this.edges : this.indices;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, elements, gl.STATIC_DRAW);
      this.elementCount = elements.length;
    }

    setFloat(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform1f(location, value);
    }

    setVec2(name, x, y) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform2f(location, x, y);
    }

    setVec3(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform3f(location, value[0], value[1], value[2]);
    }

    setMat4(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniformMatrix4fv(location, false, value);
    }

    handleContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
    }

    handleContextRestored() {
      this.contextLost = false;
      this.setupProgram();
      this.uploadBuffers();
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    handleDragStart(event) {
      if (Utils.reducedMotion || this.dragging) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.dragging = true;
      this.dragPointerId = event.pointerId;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      this.dragDX = 0;
      this.dragDY = 0;
      this.el.classList.add('dx-mesh--dragging');
    }

    handleDragMove(event) {
      if (!this.dragging || event.pointerId !== this.dragPointerId) return;
      this.dragDX += event.clientX - this.dragLastX;
      this.dragDY += event.clientY - this.dragLastY;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
    }

    handleDragEnd(event) {
      if (!this.dragging) return;
      if (event && event.pointerId !== undefined && event.pointerId !== this.dragPointerId) return;
      this.dragging = false;
      this.el.classList.remove('dx-mesh--dragging');
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    applySize() {
      const touchFactor = Utils.isTouch ? this.options.touchResolutionScale : 1;
      const scale = Utils.dpr * this.options.resolutionScale * touchFactor;
      const width = Math.max(1, Math.round(this.cssWidth * scale));
      const height = Math.max(1, Math.round(this.cssHeight * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.gl.viewport(0, 0, width, height);
      this.drawWidth = width;
      this.drawHeight = height;
      this.projection = mat4Perspective(this.options.fov, width / height, 0.1, this.options.distance + this.radius * 4);
      this.sizeDirty = false;
    }

    frame(time, delta) {
      if (!this.gl || this.contextLost || !this.visible || document.hidden) return;
      if (Utils.reducedMotion) {
        if (this.staticDrawn && !this.sizeDirty) return;
        this.rotationX = this.options.initialRotationX;
        this.rotationY = this.options.frozenRotationY;
        this.parallaxX = 0;
        this.parallaxY = 0;
        this.time = 4;
        this.draw();
        this.staticDrawn = true;
        return;
      }
      const options = this.options;
      if (this.dragging) {
        const stepY = this.dragDX * options.dragStrength;
        const stepX = this.dragDY * options.dragStrength;
        this.rotationY += stepY;
        this.rotationX += stepX;
        this.velocityY = stepY / Math.max(delta, 0.001);
        this.velocityX = stepX / Math.max(delta, 0.001);
        this.dragDX = 0;
        this.dragDY = 0;
      } else {
        this.velocityY = Utils.damp(this.velocityY, options.autoRotateY * options.speed, options.inertia, delta);
        this.velocityX = Utils.damp(this.velocityX, options.autoRotateX * options.speed, options.inertia, delta);
        this.rotationY += this.velocityY * delta;
        this.rotationX += this.velocityX * delta;
      }
      const parallaxTargetY = this.dragging ? 0 : Pointer.normalX * options.parallax;
      const parallaxTargetX = this.dragging ? 0 : Pointer.normalY * options.parallax;
      this.parallaxY = Utils.damp(this.parallaxY, parallaxTargetY, 3, delta);
      this.parallaxX = Utils.damp(this.parallaxX, parallaxTargetX, 3, delta);
      this.time += delta * options.speed;
      this.draw();
    }

    draw() {
      const gl = this.gl;
      if (this.sizeDirty) this.applySize();
      const distance = this.options.distance;
      const eye = [0, 0, distance];
      const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
      const model = mat4Multiply(
        mat4RotationY(this.rotationY + this.parallaxY),
        mat4RotationX(this.rotationX + this.parallaxX)
      );
      const mvp = mat4Multiply(mat4Multiply(this.projection, view), model);
      gl.useProgram(this.program);
      this.setMat4('u_mvp', mvp);
      this.setMat4('u_model', model);
      this.setFloat('u_time', this.time);
      this.setFloat('u_intensity', this.options.intensity);
      this.setVec3('u_colorA', this.colorA);
      this.setVec3('u_colorB', this.colorB);
      this.setVec3('u_colorC', this.colorC);
      this.setVec3('u_eye', eye);
      this.setVec2('u_depthRange', distance - this.radius, distance + this.radius);
      const bg = this.backgroundColor;
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      if (this.renderMode !== 'wireframe') {
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, this.elementCount, gl.UNSIGNED_SHORT, 0);
      } else {
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.lineWidth(1.5);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.LINES, this.elementCount, gl.UNSIGNED_SHORT, 0);
      }
    }

    enableFallback() {
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
      const fallback = Utils.el('div', 'dx-mesh-fallback');
      fallback.style.setProperty('--dx-mesh-a', Utils.color(this.options.colorA, 'primary'));
      fallback.style.setProperty('--dx-mesh-b', Utils.color(this.options.colorB, 'cyan'));
      fallback.style.setProperty('--dx-mesh-c', Utils.color(this.options.colorC, 'magenta'));
      this.el.appendChild(fallback);
      this.fallback = fallback;
    }

    dispose() {
      const gl = this.gl;
      if (!gl) return;
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.normalBuffer) gl.deleteBuffer(this.normalBuffer);
      if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
      if (this.program) gl.deleteProgram(this.program);
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext && !gl.isContextLost()) loseContext.loseContext();
      this.gl = null;
      this.program = null;
      this.positionBuffer = null;
      this.normalBuffer = null;
      this.indexBuffer = null;
      this.uniforms = {};
    }
  }

  Mesh3D.mat4Identity = mat4Identity;
  Mesh3D.mat4Perspective = mat4Perspective;
  Mesh3D.mat4LookAt = mat4LookAt;
  Mesh3D.mat4RotationX = mat4RotationX;
  Mesh3D.mat4RotationY = mat4RotationY;
  Mesh3D.mat4Multiply = mat4Multiply;
  Mesh3D.uniqueEdges = uniqueEdges;
  Mesh3D.gridEdges = gridEdges;
  Mesh3D.buildFacets = buildFacets;

  return Mesh3D;
});

;
Dixel.define('OctahedronMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class OctahedronMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 1.3,
      initialRotationX: 0.45,
      initialRotationY: 0.35
    });

    createGeometry() {
      const radius = this.options.radius;
      const polygons = [];
      for (let sx = -1; sx <= 1; sx += 2) {
        for (let sy = -1; sy <= 1; sy += 2) {
          for (let sz = -1; sz <= 1; sz += 2) {
            polygons.push([
              [sx * radius, 0, 0],
              [0, sy * radius, 0],
              [0, 0, sz * radius]
            ]);
          }
        }
      }
      return Mesh3D.buildFacets(polygons);
    }
  }

  return OctahedronMesh;
});

;
Dixel.define('OrbitRings', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  function hexToRgb(hex) {
    return Utils.channels(Utils.color(hex, 'primary')) || [109, 92, 255];
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  const SPRITE_SIZE = 64;

  class OrbitRings extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      rings: 5,
      dotsPerRing: 3,
      tilt: 0.38,
      speed: 1,
      parallax: 14,
      frozenTime: 3
    };

    ready() {
      this.el.classList.add('dx-mesh', 'dx-mesh--flat');
      this.time = 0;
      this.staticDrawn = false;
      this.parallaxX = 0;
      this.parallaxY = 0;
      this.canvas = Utils.el('canvas', 'dx-mesh-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.colors = [
        hexToRgb(this.options.colorA),
        hexToRgb(this.options.colorB),
        hexToRgb(this.options.colorC)
      ];
      this.buildRings();
      this.buildSprites();
      this.measure();
      this.addCleanup(Pointer.use());
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      this.onFrame(this.frame);
    }

    buildRings() {
      const count = Math.max(2, this.options.rings);
      this.ringData = [];
      for (let index = 0; index < count; index++) {
        const level = index / (count - 1);
        const dots = [];
        const dotCount = Math.max(1, Math.round(this.options.dotsPerRing * (0.6 + level)));
        for (let dot = 0; dot < dotCount; dot++) {
          dots.push({
            offset: (dot / dotCount) * Math.PI * 2 + index * 1.3,
            color: (index + dot) % 3
          });
        }
        this.ringData.push({
          radiusFactor: 0.3 + 0.7 * level,
          rotation: (level - 0.5) * 0.9,
          squash: this.options.tilt * (0.75 + level * 0.5),
          angularSpeed: (1.6 - level) * 0.55,
          color: index % 3,
          dots
        });
      }
    }

    buildSprites() {
      this.sprites = this.colors.map((rgb) => {
        const sprite = document.createElement('canvas');
        sprite.width = SPRITE_SIZE;
        sprite.height = SPRITE_SIZE;
        const ctx = sprite.getContext('2d');
        const half = SPRITE_SIZE / 2;
        const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.22, rgba(rgb, 0.9));
        gradient.addColorStop(0.55, rgba(rgb, 0.28));
        gradient.addColorStop(1, rgba(rgb, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
        return sprite;
      });
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      const dpr = Utils.dpr;
      this.canvas.width = Math.round(this.cssWidth * dpr);
      this.canvas.height = Math.round(this.cssHeight * dpr);
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.maxRadius = Math.min(this.cssWidth, this.cssHeight) * 0.42;
      this.staticDrawn = false;
    }

    frame(time, delta) {
      if (!this.visible || document.hidden) return;
      if (Utils.reducedMotion) {
        if (this.staticDrawn) return;
        this.time = this.options.frozenTime;
        this.parallaxX = 0;
        this.parallaxY = 0;
        this.draw();
        this.staticDrawn = true;
        return;
      }
      this.time += delta * this.options.speed;
      this.parallaxX = Utils.damp(this.parallaxX, Pointer.normalX * this.options.parallax, 3, delta);
      this.parallaxY = Utils.damp(this.parallaxY, Pointer.normalY * this.options.parallax, 3, delta);
      this.draw();
    }

    draw() {
      const ctx = this.context;
      const t = this.time;
      ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
      const centerX = this.cssWidth / 2 + this.parallaxX;
      const centerY = this.cssHeight / 2 + this.parallaxY;
      const coreSize = this.maxRadius * 0.34;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.sprites[0], centerX - coreSize / 2, centerY - coreSize / 2, coreSize, coreSize);
      ctx.globalAlpha = 1;
      this.ringData.forEach((ring) => {
        const radiusX = this.maxRadius * ring.radiusFactor;
        const radiusY = radiusX * ring.squash;
        const wobble = ring.rotation + Math.sin(t * 0.3 + ring.radiusFactor * 5) * 0.06;
        const rgb = this.colors[ring.color];
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(rgb, 0.16);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, wobble, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = rgba(rgb, 0.42);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, wobble, 0, Math.PI);
        ctx.stroke();
        const cosR = Math.cos(wobble);
        const sinR = Math.sin(wobble);
        ring.dots.forEach((dot) => {
          const angle = dot.offset + t * ring.angularSpeed;
          const ex = Math.cos(angle) * radiusX;
          const ey = Math.sin(angle) * radiusY;
          const x = centerX + ex * cosR - ey * sinR;
          const y = centerY + ex * sinR + ey * cosR;
          const depth = 0.5 + 0.5 * Math.sin(angle);
          const size = this.maxRadius * (0.045 + 0.075 * depth);
          ctx.globalAlpha = 0.25 + 0.75 * depth;
          ctx.drawImage(this.sprites[dot.color], x - size / 2, y - size / 2, size, size);
        });
        ctx.globalAlpha = 1;
      });
    }
  }

  return OrbitRings;
});

;
Dixel.define('SphereMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class SphereMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 1.15,
      widthSegments: 28,
      heightSegments: 18,
      initialRotationX: 0.35
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const edges = [];
      const widths = options.widthSegments;
      const heights = options.heightSegments;
      const radius = options.radius;
      for (let row = 0; row <= heights; row++) {
        const phi = (row / heights) * Math.PI;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        for (let column = 0; column <= widths; column++) {
          const theta = (column / widths) * Math.PI * 2;
          const nx = sinPhi * Math.cos(theta);
          const ny = cosPhi;
          const nz = sinPhi * Math.sin(theta);
          positions.push(nx * radius, ny * radius, nz * radius);
          normals.push(nx, ny, nz);
        }
      }
      const stride = widths + 1;
      for (let row = 0; row < heights; row++) {
        for (let column = 0; column < widths; column++) {
          const a = row * stride + column;
          const b = a + stride;
          if (row > 0) indices.push(a, b, a + 1);
          if (row < heights - 1) indices.push(a + 1, b, b + 1);
          edges.push(a, b);
          if (row > 0) edges.push(a, a + 1);
        }
      }
      return { positions, normals, indices, edges };
    }
  }

  return SphereMesh;
});

;
Dixel.define('TextMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class TextMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      text: 'DIXEL',
      font: 'Inter, system-ui, sans-serif',
      weight: 800,
      rows: 15,
      width: 3.6,
      depth: 0.5,
      wave: 0.18,
      waveSpeed: 1.4,
      initialRotationX: 0.12,
      initialRotationY: -0.3
    });

    rasterizeText() {
      const rows = Math.max(8, this.options.rows | 0);
      const probe = document.createElement('canvas');
      const probeContext = probe.getContext('2d', { willReadFrequently: true });
      const fontSize = 100;
      probeContext.font = this.options.weight + ' ' + fontSize + 'px ' + this.options.font;
      const metrics = probeContext.measureText(this.options.text);
      const textWidth = Math.max(metrics.width, 1);
      const columns = Math.max(4, Math.round((textWidth / fontSize) * rows * 1.02));
      probe.width = columns;
      probe.height = rows;
      probeContext.font = this.options.weight + ' ' + fontSize + 'px ' + this.options.font;
      probeContext.textAlign = 'center';
      probeContext.textBaseline = 'middle';
      probeContext.save();
      probeContext.scale(columns / textWidth, rows / (fontSize * 1.04));
      probeContext.fillStyle = '#fff';
      probeContext.fillText(this.options.text, textWidth / 2, fontSize * 0.54);
      probeContext.restore();
      const pixels = probeContext.getImageData(0, 0, columns, rows).data;
      const filled = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          if (pixels[(row * columns + column) * 4 + 3] > 96) filled.push([column, row]);
        }
      }
      return { filled, columns, rows };
    }

    createGeometry() {
      const raster = this.rasterizeText();
      const columns = raster.columns;
      const rows = raster.rows;
      const cell = this.options.width / columns;
      const halfWidth = this.options.width / 2;
      const halfHeight = (rows * cell) / 2;
      const halfDepth = this.options.depth / 2;
      const occupied = new Set(raster.filled.map((entry) => entry[0] + ':' + entry[1]));
      const polygons = [];
      raster.filled.forEach((entry) => {
        const column = entry[0];
        const row = entry[1];
        const x0 = -halfWidth + column * cell;
        const x1 = x0 + cell;
        const y1 = halfHeight - row * cell;
        const y0 = y1 - cell;
        polygons.push([[x0, y0, halfDepth], [x1, y0, halfDepth], [x1, y1, halfDepth], [x0, y1, halfDepth]]);
        polygons.push([[x1, y0, -halfDepth], [x0, y0, -halfDepth], [x0, y1, -halfDepth], [x1, y1, -halfDepth]]);
        if (!occupied.has(column + ':' + (row - 1))) {
          polygons.push([[x0, y1, halfDepth], [x1, y1, halfDepth], [x1, y1, -halfDepth], [x0, y1, -halfDepth]]);
        }
        if (!occupied.has(column + ':' + (row + 1))) {
          polygons.push([[x1, y0, halfDepth], [x0, y0, halfDepth], [x0, y0, -halfDepth], [x1, y0, -halfDepth]]);
        }
        if (!occupied.has(column - 1 + ':' + row)) {
          polygons.push([[x0, y0, -halfDepth], [x0, y0, halfDepth], [x0, y1, halfDepth], [x0, y1, -halfDepth]]);
        }
        if (!occupied.has(column + 1 + ':' + row)) {
          polygons.push([[x1, y0, halfDepth], [x1, y0, -halfDepth], [x1, y1, -halfDepth], [x1, y1, halfDepth]]);
        }
      });
      return Mesh3D.buildFacets(polygons);
    }

    vertexChunk() {
      if (!this.options.wave) {
        return [
          'vec3 displace(vec3 p) { return p; }',
          'vec3 displaceNormal(vec3 p, vec3 n) { return n; }'
        ].join('\n');
      }
      const amplitude = Number(this.options.wave).toFixed(4);
      const speed = Number(this.options.waveSpeed).toFixed(4);
      return [
        'vec3 displace(vec3 p) {',
        '  float wave = sin(p.x * 2.1 + u_time * ' + speed + ') * ' + amplitude + ';',
        '  float twist = sin(p.x * 1.3 + u_time * ' + speed + ' * 0.7) * ' + amplitude + ' * 0.5;',
        '  return vec3(p.x, p.y + wave, p.z + twist);',
        '}',
        'vec3 displaceNormal(vec3 p, vec3 n) {',
        '  float slope = cos(p.x * 2.1 + u_time * ' + speed + ') * ' + amplitude + ' * 2.1;',
        '  return normalize(vec3(n.x - slope * n.y, n.y, n.z));',
        '}'
      ].join('\n');
    }
  }

  return TextMesh;
});

;
Dixel.define('TorusMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class TorusMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      ringRadius: 1,
      tubeRadius: 0.38,
      ringSegments: 48,
      tubeSegments: 22,
      initialRotationX: 0.7
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const rings = options.ringSegments;
      const tubes = options.tubeSegments;
      for (let ring = 0; ring <= rings; ring++) {
        const u = (ring / rings) * Math.PI * 2;
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);
        for (let tube = 0; tube <= tubes; tube++) {
          const v = (tube / tubes) * Math.PI * 2;
          const cosV = Math.cos(v);
          const sinV = Math.sin(v);
          const centerDistance = options.ringRadius + options.tubeRadius * cosV;
          positions.push(centerDistance * cosU, options.tubeRadius * sinV, centerDistance * sinU);
          normals.push(cosV * cosU, sinV, cosV * sinU);
        }
      }
      const stride = tubes + 1;
      for (let ring = 0; ring < rings; ring++) {
        for (let tube = 0; tube < tubes; tube++) {
          const a = ring * stride + tube;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return { positions, normals, indices, edges: Mesh3D.gridEdges(rings, tubes) };
    }
  }

  return TorusMesh;
});

;
Dixel.define('WavePlaneMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class WavePlaneMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      size: 2.8,
      segments: 52,
      amplitude: 0.2,
      waveScale: 1,
      initialRotationX: -1.05,
      initialRotationY: 0.3,
      autoRotateX: 0,
      autoRotateY: 0.1,
      distance: 3.6
    });

    vertexChunk() {
      const amplitude = Number(this.options.amplitude).toFixed(4);
      const waveScale = Number(this.options.waveScale).toFixed(4);
      return [
        'const float WAVE_AMP = ' + amplitude + ';',
        'const float WAVE_SCALE = ' + waveScale + ';',
        'float waveHeight(vec2 q, float t) {',
        '  q *= WAVE_SCALE;',
        '  return (sin(q.x * 2.4 + t * 1.2) * 0.9 + sin(q.y * 2.0 + t * 0.9) * 0.8 + sin((q.x + q.y) * 3.3 + t * 1.6) * 0.4) * WAVE_AMP;',
        '}',
        'vec3 displace(vec3 p) {',
        '  return vec3(p.x, p.y, waveHeight(p.xy, u_time));',
        '}',
        'vec3 displaceNormal(vec3 p, vec3 n) {',
        '  vec2 q = p.xy * WAVE_SCALE;',
        '  float t = u_time;',
        '  float dzdx = (cos(q.x * 2.4 + t * 1.2) * 0.9 * 2.4 + cos((q.x + q.y) * 3.3 + t * 1.6) * 0.4 * 3.3) * WAVE_AMP * WAVE_SCALE;',
        '  float dzdy = (cos(q.y * 2.0 + t * 0.9) * 0.8 * 2.0 + cos((q.x + q.y) * 3.3 + t * 1.6) * 0.4 * 3.3) * WAVE_AMP * WAVE_SCALE;',
        '  return normalize(vec3(-dzdx, -dzdy, 1.0));',
        '}'
      ].join('\n');
    }

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const segments = options.segments;
      const size = options.size;
      for (let row = 0; row <= segments; row++) {
        const y = (row / segments - 0.5) * size;
        for (let column = 0; column <= segments; column++) {
          const x = (column / segments - 0.5) * size;
          positions.push(x, y, 0);
          normals.push(0, 0, 1);
        }
      }
      const stride = segments + 1;
      for (let row = 0; row < segments; row++) {
        for (let column = 0; column < segments; column++) {
          const a = row * stride + column;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return { positions, normals, indices, edges: Mesh3D.gridEdges(segments, segments) };
    }
  }

  return WavePlaneMesh;
});

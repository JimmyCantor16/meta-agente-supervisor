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

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

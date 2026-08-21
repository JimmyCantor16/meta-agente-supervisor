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

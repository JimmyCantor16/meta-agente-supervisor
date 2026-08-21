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

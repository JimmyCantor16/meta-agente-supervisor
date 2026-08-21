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

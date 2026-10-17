// Minimal DOM helpers shared by the views.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});

  const $ = (selector) => document.querySelector(selector);

  /** Creates an element: props are attributes ('class', 'on<event>' for listeners), kids are nodes or strings. */
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) n.setAttribute(k, v);
    }
    n.append(...kids.flat().filter((c) => c != null && c !== false));
    return n;
  }

  Explorer.dom = { $, el };
  Explorer.ui = Explorer.ui || {};
})();

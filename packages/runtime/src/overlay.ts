/**
 * Overlay script injected into the sandbox iframe's srcdoc.
 *
 * Two responsibilities:
 *  1. Element selection (mouseover outline + click → ELEMENT_SELECTED postMessage).
 *  2. Error reporting (window.onerror + unhandledrejection → IFRAME_ERROR postMessage).
 *
 * Defence in depth (C11): generated HTML may attach its own click handlers,
 * call `removeEventListener`, or freeze prototypes. We use `capture: true` so
 * we run before bubble-phase user handlers, AND we re-attach the listeners
 * every 200ms via `setInterval` in case user code stripped them. Re-attach is
 * idempotent because addEventListener with the same fn+capture is a no-op
 * when already attached.
 *
 * Bundled as a string at build time; do NOT import from anywhere except
 * the runtime's iframe HTML builder.
 */

export const OVERLAY_SCRIPT = `(function() {
  'use strict';
  var hovered = null;
  var pinned = null;
  var warned = Object.create(null);
  function warnOnce(key, err) {
    if (warned[key]) return;
    warned[key] = true;
    try { console.warn('[overlay] ' + key, err); } catch (_) { /* noop */ }
  }
  var currentMode = 'default';

  var HOVER_OUTLINE = '2px solid #c96442';
  var PINNED_OUTLINE = '2.5px solid #b5441a';

  function clearHover() {
    // Don't clear if this element is pinned — pinned takes precedence.
    if (hovered && hovered !== pinned) {
      try { hovered.style.outline = ''; } catch (_) {}
    }
    hovered = null;
  }

  function clearPinned() {
    if (pinned) {
      try { pinned.style.outline = ''; } catch (_) {}
    }
    pinned = null;
  }


  function getXPath(el) {
    if (el.dataset && el.dataset.codesignId) return '[data-codesign-id="' + el.dataset.codesignId + '"]';
    if (el.id) return '#' + el.id;
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var idx = 1;
      var sib = el.previousElementSibling;
      while (sib) { if (sib.tagName === el.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(el.tagName.toLowerCase() + '[' + idx + ']');
      el = el.parentElement;
    }
    return '/' + parts.join('/');
  }

  function onMouseOver(e) {
    if (currentMode !== 'comment') return;
    // Don't override pinned outline on hover-in of a different element.
    if (hovered && hovered !== pinned) {
      try { hovered.style.outline = ''; } catch (_) {}
    }
    hovered = e.target;
    if (hovered && hovered !== pinned) {
      try { hovered.style.outline = HOVER_OUTLINE; } catch (_) {}
    }
  }
  function onMouseOut() {
    if (currentMode !== 'comment') return;
    clearHover();
  }
  function onClick(e) {
    if (currentMode === 'comment') {
      e.preventDefault();
      e.stopPropagation();
      var el = e.target;
      // Pin the clicked element — its outline will persist until parent
      // sends CLEAR_PIN (bubble closed).
      if (pinned && pinned !== el) {
        try { pinned.style.outline = ''; } catch (_) {}
      }
      pinned = el;
      try { el.style.outline = PINNED_OUTLINE; } catch (_) {}
      var rect = el.getBoundingClientRect();
      var parentHtml = '';
      try {
        if (el.parentElement && el.parentElement.outerHTML) {
          parentHtml = String(el.parentElement.outerHTML).slice(0, 600);
        }
      } catch (_) { /* parent inaccessible — leave blank */ }
      try {
        window.parent.postMessage({
          __codesign: true,
          type: 'ELEMENT_SELECTED',
          selector: getXPath(el),
          tag: el.tagName.toLowerCase(),
          outerHTML: (el.outerHTML || '').slice(0, 800),
          parentOuterHTML: parentHtml,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, '*');
      } catch (err) { console.warn('[overlay] postMessage ELEMENT_SELECTED failed:', err); }
      return;
    }
    // Default mode: block ALL navigating links — the sandbox iframe has no
    // routing and any real navigation (including hash jumps to non-existent
    // ids) would blank the preview. Agent should use React view-state for
    // multi-page designs; see agent.ts AGENTIC_TOOL_GUIDANCE.
    var anchor = e.target;
    while (anchor && anchor.tagName !== 'A') anchor = anchor.parentElement;
    if (anchor && (anchor.href || anchor.getAttribute('href'))) {
      var href = anchor.getAttribute('href') || '';
      // Allow hash-jump ONLY when it resolves to an existing element on page.
      if (href.charAt(0) === '#' && href.length > 1) {
        var id = href.slice(1);
        var target = null;
        try { target = document.getElementById(id); } catch (_) {}
        if (target) return; // let the browser scroll
      }
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function onParentMessage(ev) {
    // Trust boundary: control messages must originate from the embedding
    // window. Untrusted in-iframe scripts can synthesise MessageEvent-shaped
    // calls into this handler (or, via window.postMessage(self,...), bounce
    // events off the iframe itself); both paths are rejected here so any
    // future control type added to the switch is structurally protected.
    if (!ev || ev.source !== window.parent) return;
    var data = ev.data;
    if (!data || data.__codesign !== true) return;
    if (data.type === 'SET_MODE') {
      var next = data.mode === 'comment' ? 'comment' : 'default';
      if (next === currentMode) return;
      currentMode = next;
      if (currentMode === 'default') {
        clearHover();
        clearPinned();
      }
      return;
    }
    if (data.type === 'CLEAR_PIN') {
      clearPinned();
      return;
    }
  }
  function onError(ev) {
    try {
      window.parent.postMessage({
        __codesign: true,
        type: 'IFRAME_ERROR',
        kind: 'error',
        message: (ev && ev.message) ? String(ev.message) : 'Unknown iframe error',
        source: ev && ev.filename ? String(ev.filename) : undefined,
        lineno: ev && typeof ev.lineno === 'number' ? ev.lineno : undefined,
        colno: ev && typeof ev.colno === 'number' ? ev.colno : undefined,
        stack: ev && ev.error && ev.error.stack ? String(ev.error.stack) : undefined,
        timestamp: Date.now()
      }, '*');
    } catch (err) { console.warn('[overlay] postMessage IFRAME_ERROR (error) failed:', err); }
  }
  function onRejection(ev) {
    try {
      var reason = ev && ev.reason;
      var msg = (reason && reason.message) ? String(reason.message) : String(reason);
      window.parent.postMessage({
        __codesign: true,
        type: 'IFRAME_ERROR',
        kind: 'unhandledrejection',
        message: msg,
        stack: (reason && reason.stack) ? String(reason.stack) : undefined,
        timestamp: Date.now()
      }, '*');
    } catch (err) { console.warn('[overlay] postMessage IFRAME_ERROR (unhandledrejection) failed:', err); }
  }

  // Install + reinstall every 200ms. User code may call removeEventListener
  // or replace document.addEventListener; re-attaching is the cheapest defence.
  // addEventListener with the same fn+capture is a no-op when already present.
  var installs = [
    { evt: 'mouseover', fn: onMouseOver },
    { evt: 'mouseout', fn: onMouseOut },
    { evt: 'click', fn: onClick },
    { evt: 'submit', fn: function(e) { e.preventDefault(); } }
  ];
  function reattach() {
    for (var i = 0; i < installs.length; i++) {
      var spec = installs[i];
      try { document.removeEventListener(spec.evt, spec.fn, true); } catch (err) { warnOnce('removeEventListener failed for ' + spec.evt, err); }
      try { document.addEventListener(spec.evt, spec.fn, true); } catch (err) { warnOnce('addEventListener failed for ' + spec.evt, err); }
    }
    if (!window.__cs_err) {
      try { window.addEventListener('error', onError, true); window.__cs_err = true; } catch (err) { warnOnce('attach window error listener failed', err); }
    }
    if (!window.__cs_rej) {
      try { window.addEventListener('unhandledrejection', onRejection, true); window.__cs_rej = true; } catch (err) { warnOnce('attach unhandledrejection listener failed', err); }
    }
    if (!window.__cs_msg) {
      try { window.addEventListener('message', onParentMessage, false); window.__cs_msg = true; } catch (_) {}
    }
  }
  reattach();
  try { setInterval(reattach, 200); } catch (err) { console.warn('[overlay] setInterval reattach failed:', err); }

  // Neutralize programmatic navigation — generated code may call
  // window.location = '/foo', location.assign('/x'), or window.open(...)
  // in button onclick handlers. None of those routes exist in the sandbox and
  // they'd all blank the preview. We no-op them once, idempotently.
  try {
    if (!window.__cs_navguard) {
      window.__cs_navguard = true;
      var nopNav = function() { /* navigation suppressed in preview sandbox */ };
      try { window.open = function() { return null; }; } catch (_) {}
      try {
        var loc = window.location;
        try { loc.assign = nopNav; } catch (_) {}
        try { loc.replace = nopNav; } catch (_) {}
        try { loc.reload = nopNav; } catch (_) {}
      } catch (_) {}
    }
  } catch (err) { try { console.warn('[overlay] navguard install failed:', err); } catch (_) {} }
})();`;

export interface OverlayMessage {
  __codesign: true;
  type: 'ELEMENT_SELECTED';
  selector: string;
  tag: string;
  outerHTML: string;
  /** Optional v2 enrichment — parent element's outerHTML, truncated to 600
   *  chars. Older overlays may omit this; consumers must treat it as optional. */
  parentOuterHTML?: string;
  rect: { top: number; left: number; width: number; height: number };
}

export function isOverlayMessage(data: unknown): data is OverlayMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { __codesign?: boolean }).__codesign === true &&
    (data as { type?: string }).type === 'ELEMENT_SELECTED'
  );
}

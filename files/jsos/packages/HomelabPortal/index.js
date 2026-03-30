/**
 * HomelabPortal — jsOS package for service dashboard & iframe launcher.
 *
 * Reads the service registry from /api/homelab/services, renders a
 * navigable grid of tiles, and opens individual service UIs inside a
 * sandboxed iframe.  Designed to run inside the jsOS window manager.
 *
 * @module HomelabPortal
 */

/* global document, fetch, console */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

var PORTAL_VERSION = '0.2.0';

var CATEGORY_COLORS = {
  infra: '#58a6ff',
  observability: '#3fb950',
  iiab: '#d29922',
  devops: '#bc8cff',
  b2b: '#f0883e',
  voip: '#f85149',
  engineering: '#79c0ff',
  data: '#56d364'
};

var DEFAULT_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-modals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove all child nodes from an element.
 */
function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

/**
 * Create a DOM element with optional attributes and children.
 */
function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      if (k === 'className') {
        node.className = attrs[k];
      } else if (k === 'textContent') {
        node.textContent = attrs[k];
      } else if (k.indexOf('on') === 0) {
        node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else {
        node.setAttribute(k, attrs[k]);
      }
    });
  }
  if (Array.isArray(children)) {
    children.forEach(function (c) {
      if (typeof c === 'string') {
        node.appendChild(document.createTextNode(c));
      } else if (c) {
        node.appendChild(c);
      }
    });
  }
  return node;
}

/**
 * Return CSS colour for a stack/category name.
 */
function categoryColor(name) {
  return CATEGORY_COLORS[name] || '#8b949e';
}

/**
 * Format port number into a human-readable badge.
 */
function portBadge(port) {
  return el('span', {
    className: 'port-badge',
    textContent: ':' + port,
    title: 'TCP port ' + port
  });
}

// ---------------------------------------------------------------------------
// Tile grid
// ---------------------------------------------------------------------------

/**
 * Render a single service tile.
 */
function renderTile(svc, container, onOpen) {
  var tile = el('div', { className: 'portal-tile' }, [
    el('div', {
      className: 'tile-color',
      style: 'background:' + categoryColor(svc.stack)
    }),
    el('div', { className: 'tile-body' }, [
      el('strong', { className: 'tile-name', textContent: svc.name }),
      el('span', { className: 'tile-desc', textContent: svc.description || '' }),
      svc.port ? portBadge(svc.port) : null
    ])
  ]);

  tile.addEventListener('click', function () {
    onOpen(svc);
  });

  container.appendChild(tile);
}

/**
 * Render the full tile grid from a list of services.
 */
function renderGrid(services, container, onOpen) {
  clearNode(container);
  services.forEach(function (svc) {
    renderTile(svc, container, onOpen);
  });
}

// ---------------------------------------------------------------------------
// Iframe viewer
// ---------------------------------------------------------------------------

/**
 * Open a service URL in a sandboxed iframe panel.
 */
function openServiceFrame(svc, panel) {
  clearNode(panel);

  var header = el('div', { className: 'frame-header' }, [
    el('span', { textContent: svc.name }),
    el('button', { textContent: 'Close', className: 'frame-close' })
  ]);

  var iframe = document.createElement('iframe');
  iframe.src = svc.url || ('http://localhost:' + svc.port);
  iframe.setAttribute('sandbox', DEFAULT_SANDBOX);
  iframe.className = 'portal-iframe';

  header.querySelector('.frame-close').addEventListener('click', function () {
    clearNode(panel);
    panel.style.display = 'none';
  });

  panel.appendChild(header);
  panel.appendChild(iframe);
  panel.style.display = 'block';
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function renderStatusBar(count, container) {
  container.textContent = count + ' services loaded — HomelabPortal v' + PORTAL_VERSION;
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function renderError(msg, container) {
  clearNode(container);
  container.appendChild(
    el('div', { className: 'portal-error', textContent: msg })
  );
}

// ---------------------------------------------------------------------------
// Main init
// ---------------------------------------------------------------------------

function initPortal(root) {
  var grid = el('div', { className: 'portal-grid' });
  var framePanel = el('div', { className: 'portal-frame-panel' });
  var statusBar = el('div', { className: 'portal-status' });

  framePanel.style.display = 'none';

  root.appendChild(statusBar);
  root.appendChild(grid);
  root.appendChild(framePanel);

  fetch('/api/homelab/services')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (services) {
      renderStatusBar(services.length, statusBar);
      renderGrid(services, grid, function (svc) {
        openServiceFrame(svc, framePanel);
      });
    })
    .catch(function (err) {
      console.error('[HomelabPortal] load failed:', err);
      renderError('Failed to load services: ' + err.message, grid);
    });
}

// ---------------------------------------------------------------------------
// Export / auto-init
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initPortal: initPortal,
    renderGrid: renderGrid,
    openServiceFrame: openServiceFrame,
    PORTAL_VERSION: PORTAL_VERSION
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('homelab-portal');
    if (root) {
      initPortal(root);
    }
  });
}

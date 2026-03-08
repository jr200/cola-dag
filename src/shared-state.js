// ---------------------------------------------------------------------------
// Shared state store with event-emitter pattern.
// Holds logical state synchronised between renderers (collapsed, colorMap,
// selectedDagIndex, selectedNode).  Each subscriber registers with a source
// ID; updates skip the subscriber whose source matches the update source,
// preventing circular notifications.
// ---------------------------------------------------------------------------

var _listeners = [];
var _state = {
  collapsed: {},
  colorMap: {},
  nodeOverrides: {},
  edgeColorMode: "source",
  selectedDagIndex: 0,
  selectedNode: null,
};

var SharedState = {
  // Return current state reference (callers must not mutate directly).
  get: function () { return _state; },

  // Overwrite specific keys.  `changes` is a partial object.
  // `source` identifies who triggered the change ("2d", "3d", "controls").
  update: function (changes, source) {
    var changedKeys = [];
    for (var key in changes) {
      if (Object.hasOwn(changes, key)) {
        _state[key] = changes[key];
        changedKeys.push(key);
      }
    }
    _listeners.forEach(function (l) {
      if (l.source !== source) {
        l.fn(changes, changedKeys, source);
      }
    });
  },

  // Subscribe to state changes.  Returns an unsubscribe function.
  subscribe: function (source, fn) {
    var entry = { source: source, fn: fn };
    _listeners.push(entry);
    return function () {
      var idx = _listeners.indexOf(entry);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  },

  // One-time initialisation (does not notify listeners).
  init: function (collapsed, colorMap, selectedDagIndex, nodeOverrides) {
    _state.collapsed = collapsed;
    _state.colorMap = colorMap;
    _state.nodeOverrides = nodeOverrides || {};
    _state.selectedDagIndex = selectedDagIndex;
    _state.selectedNode = null;
  },
};

export default SharedState;

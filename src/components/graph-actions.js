// ---------------------------------------------------------------------------
// Graph action buttons: Cluster, Expand, Recolor, Edge color, Re-layout,
// Reset, Direction select (2D), Recenter (3D).
// Returns { el, destroy }.
// ---------------------------------------------------------------------------

import Renderer2D from "../renderer-2d.js";
import Renderer3D from "../renderer-3d.js";
import { assignGroupColors } from "../styling.js";

export function createGraphActions(graphData, sharedState, callbacks) {
  var el = document.createDocumentFragment();
  var listeners = [];

  function listen(target, event, fn) {
    target.addEventListener(event, fn);
    listeners.push({ target: target, event: event, fn: fn });
  }

  function btn(text) {
    var b = document.createElement("button");
    b.textContent = text;
    return b;
  }

  function sep() {
    var s = document.createElement("span");
    s.className = "controls-sep";
    return s;
  }

  // --- Cluster all ---
  var clusterBtn = btn("Cluster all");
  listen(clusterBtn, "click", function () {
    var c = {};
    Object.keys(graphData.spec.groups).forEach(function (g) { c[g] = true; });
    sharedState.update({ collapsed: c }, "controls");
  });
  el.appendChild(clusterBtn);

  // --- Expand all ---
  var expandBtn = btn("Expand all");
  listen(expandBtn, "click", function () {
    var c = {};
    Object.keys(graphData.spec.groups).forEach(function (g) { c[g] = false; });
    sharedState.update({ collapsed: c }, "controls");
  });
  el.appendChild(expandBtn);

  // --- Recolor ---
  var recolorBtn = btn("Recolor");
  listen(recolorBtn, "click", function () {
    var newColorMap = assignGroupColors(
      graphData.spec.groups, graphData.spec.fixedColors, Math.random() * 360
    );
    sharedState.update({ colorMap: newColorMap, nodeOverrides: {} }, "controls");
  });
  el.appendChild(recolorBtn);

  // --- Edge color toggle ---
  var edgeColorBtn = btn("Edges: source");
  edgeColorBtn.title = "Toggle edge colour between target and source node";
  listen(edgeColorBtn, "click", function () {
    var cur = sharedState.get().edgeColorMode;
    var next = cur === "target" ? "source" : "target";
    edgeColorBtn.textContent = "Edges: " + next;
    sharedState.update({ edgeColorMode: next }, "controls");
  });
  el.appendChild(edgeColorBtn);

  // --- Re-layout ---
  var relayoutBtn = btn("Re-layout");
  listen(relayoutBtn, "click", function () {
    Renderer2D.render();
    Renderer3D.render();
  });
  el.appendChild(relayoutBtn);

  // --- Reset ---
  var resetBtn = btn("Reset");
  listen(resetBtn, "click", function () {
    Renderer2D.setConfig(JSON.parse(JSON.stringify(Renderer2D.getConfigDefaults())));
    Renderer3D.setConfig(JSON.parse(JSON.stringify(Renderer3D.getConfigDefaults())));
    directionSelect.value = "TB";
    var cfg2d = Renderer2D.getConfig();
    cfg2d.flowDirection = "y";

    var newCollapsed = {};
    Object.keys(graphData.spec.groups).forEach(function (g) { newCollapsed[g] = true; });
    var newColorMap = assignGroupColors(graphData.spec.groups, graphData.spec.fixedColors);
    edgeColorBtn.textContent = "Edges: source";
    sharedState.update({
      collapsed: newCollapsed,
      colorMap: newColorMap,
      nodeOverrides: {},
      edgeColorMode: "source",
      selectedDagIndex: 0,
      selectedNode: null,
    }, "controls");

    Renderer3D.resetView();
    Renderer2D.render();
    Renderer3D.render();
    if (callbacks.onResetPhysics) callbacks.onResetPhysics();
  });
  el.appendChild(resetBtn);

  el.appendChild(sep());

  // --- 2D-specific: direction select ---
  var controls2d = document.createElement("span");
  controls2d.id = "controls2d";
  var dirLabel = document.createElement("label");
  dirLabel.textContent = "Direction:";
  var directionSelect = document.createElement("select");
  directionSelect.id = "directionSelect";
  [["TB", "Top-Down"], ["LR", "Left-Right"]].forEach(function (pair) {
    var opt = document.createElement("option");
    opt.value = pair[0];
    opt.textContent = pair[1];
    if (pair[0] === "TB") opt.selected = true;
    directionSelect.appendChild(opt);
  });
  dirLabel.appendChild(document.createTextNode("\u00a0"));
  dirLabel.appendChild(directionSelect);
  controls2d.appendChild(dirLabel);

  listen(directionSelect, "change", function () {
    var val = directionSelect.value;
    var cfg = Renderer2D.getConfig();
    if (val === "none") cfg.flowDirection = null;
    else if (val === "TB") cfg.flowDirection = "y";
    else if (val === "BT") cfg.flowDirection = "y";
    else if (val === "LR") cfg.flowDirection = "x";
    else if (val === "RL") cfg.flowDirection = "x";
    Renderer2D.render();
  });
  el.appendChild(controls2d);

  // --- 3D-specific: recenter ---
  var controls3d = document.createElement("span");
  controls3d.id = "controls3d";
  var recenterBtn = btn("Recenter");
  listen(recenterBtn, "click", function () {
    Renderer3D.resetView();
  });
  controls3d.appendChild(recenterBtn);
  el.appendChild(controls3d);

  return {
    el: el,
    destroy: function () {
      listeners.forEach(function (l) {
        l.target.removeEventListener(l.event, l.fn);
      });
    }
  };
}

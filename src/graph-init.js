// ---------------------------------------------------------------------------
// Entry point: fetch DOT data, parse, compute DAGs, initialise shared state,
// renderers, and controls.  Listens for live graph updates via SSE.
// ---------------------------------------------------------------------------

import "./style.css";
import { parseDot } from "./dot-parser.js";
import { assignGroupColors } from "./styling.js";
import SharedState from "./shared-state.js";
import Renderer2D from "./renderer-2d.js";
import Renderer3D from "./renderer-3d.js";
import { initControls } from "./controls.js";

// ---------------------------------------------------------------------------
// Pure computation: spec → { spec, nodeRoles, nodeToGroup, dags }
// ---------------------------------------------------------------------------
function buildGraphData(spec) {
  var hasIncoming = {};
  var hasOutgoing = {};
  spec.edges.forEach(function (e) {
    hasIncoming[e.to] = true;
    hasOutgoing[e.from] = true;
  });
  var nodeRoles = {};
  spec.nodes.forEach(function (n) {
    if (!hasIncoming[n.id]) nodeRoles[n.id] = "root";
    else if (!hasOutgoing[n.id]) nodeRoles[n.id] = "leaf";
  });

  var nodeToGroup = {};
  spec.nodes.forEach(function (n) { nodeToGroup[n.id] = n.group; });

  var groupAdj = {};
  spec.edges.forEach(function (e) {
    var srcGroup = nodeToGroup[e.from];
    var dstGroup = nodeToGroup[e.to];
    if (srcGroup && dstGroup && srcGroup !== dstGroup) {
      if (!groupAdj[srcGroup]) groupAdj[srcGroup] = {};
      groupAdj[srcGroup][dstGroup] = true;
    }
  });
  var rootGroups = Object.keys(spec.groups).filter(function (g) {
    return spec.groupRoles[g] === "root";
  });
  var dags = rootGroups.map(function (rootGroup) {
    var visitedGroups = {};
    var queue = [rootGroup];
    visitedGroups[rootGroup] = true;
    while (queue.length > 0) {
      var cur = queue.shift();
      var neighbors = groupAdj[cur] ? Object.keys(groupAdj[cur]) : [];
      neighbors.forEach(function (nb) {
        if (!visitedGroups[nb]) { visitedGroups[nb] = true; queue.push(nb); }
      });
    }
    var nodeSet = {};
    var size = 0;
    spec.nodes.forEach(function (n) {
      if (visitedGroups[n.group]) { nodeSet[n.id] = true; size++; }
    });
    return { root: rootGroup, groupSet: visitedGroups, nodeSet: nodeSet, size: size };
  });
  dags.sort(function (a, b) { return b.size - a.size; });

  return { spec: spec, nodeRoles: nodeRoles, nodeToGroup: nodeToGroup, dags: dags };
}

// ---------------------------------------------------------------------------
// Apply new DOT text to an existing graphData + sharedState (reused by SSE
// handler and the Load button in controls).
// ---------------------------------------------------------------------------
export function applyNewDot(dotText, graphData, sharedState) {
  var newSpec = parseDot(dotText);
  var newData = buildGraphData(newSpec);

  graphData.spec = newData.spec;
  graphData.nodeRoles = newData.nodeRoles;
  graphData.nodeToGroup = newData.nodeToGroup;
  graphData.dags = newData.dags;

  if (newSpec.meta && newSpec.meta.title) {
    document.title = newSpec.meta.title;
  }

  var newCollapsed = {};
  Object.keys(newSpec.groups).forEach(function (g) { newCollapsed[g] = true; });
  var newColorMap = assignGroupColors(newSpec.groups, newSpec.fixedColors);
  sharedState.update({
    collapsed: newCollapsed,
    colorMap: newColorMap,
    nodeOverrides: {},
    selectedDagIndex: 0,
    selectedNode: null,
  }, "graph-update");

  var errEl = document.getElementById("error");
  errEl.style.display = "none";
}

/* global __APP_VERSION__ */

async function main() {
  var params = new URLSearchParams(window.location.search);
  var dataUrl = params.get("data") || "default.dot";

  var response;
  try {
    response = await fetch(dataUrl);
  } catch (err) {
    showError("Failed to fetch " + dataUrl + ": " + err.message);
    return;
  }
  if (!response.ok) {
    showError("Failed to load " + dataUrl + ": " + response.statusText);
    return;
  }

  var spec;
  try {
    var dotText = await response.text();
    spec = parseDot(dotText);
  } catch (err) {
    showError("Failed to parse " + dataUrl + ": " + err.message);
    return;
  }

  if (spec.meta && spec.meta.title) {
    document.title = spec.meta.title;
  }

  var graphData = buildGraphData(spec);

  // -----------------------------------------------------------------------
  // Initialise shared state
  // -----------------------------------------------------------------------
  var initialCollapsed = {};
  Object.keys(spec.groups).forEach(function (g) { initialCollapsed[g] = true; });
  var initialColorMap = assignGroupColors(spec.groups, spec.fixedColors);
  SharedState.init(initialCollapsed, initialColorMap, 0, {});

  // -----------------------------------------------------------------------
  // Initialise renderers
  // -----------------------------------------------------------------------
  Renderer2D.init(document.getElementById("view-2d"), graphData, SharedState);
  Renderer3D.init(document.getElementById("view-3d"), graphData, SharedState);

  // -----------------------------------------------------------------------
  // Initialise controls (toolbar, physics panel, legend, DAG selector,
  // view mode switcher — all managed as components).
  // -----------------------------------------------------------------------
  initControls(graphData, SharedState);
  document.getElementById("app-version").textContent = "v" + __APP_VERSION__;

  // -----------------------------------------------------------------------
  // Live updates via SSE
  // -----------------------------------------------------------------------
  var evtSource = new EventSource("/api/graph-events");
  evtSource.onmessage = function (event) {
    try {
      var newDotText = JSON.parse(event.data);
      applyNewDot(newDotText, graphData, SharedState);
    } catch (err) {
      showError("Graph update failed: " + err.message);
    }
  };
  evtSource.addEventListener("color-update", function (event) {
    try {
      var data = JSON.parse(event.data);
      var updatePayload = {};
      if (data.colorMap) updatePayload.colorMap = data.colorMap;
      if (data.nodeOverrides) updatePayload.nodeOverrides = data.nodeOverrides;
      if (Object.keys(updatePayload).length > 0) {
        SharedState.update(updatePayload, "api");
      }
    } catch (err) {
      console.warn("Color update failed:", err.message);
    }
  });

  evtSource.onerror = function () {
    console.warn("SSE connection lost, will auto-reconnect");
  };

  function showError(msg) {
    var el = document.getElementById("error");
    el.textContent = msg;
    el.style.display = "block";
  }
}

main();

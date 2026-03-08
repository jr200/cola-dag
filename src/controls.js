// ---------------------------------------------------------------------------
// Unified controls: shared toolbar, per-renderer physics panels, legend,
// DAG selector, and view mode switcher.
// ---------------------------------------------------------------------------

import Renderer2D from "./renderer-2d.js";
import Renderer3D from "./renderer-3d.js";
import { assignGroupColors } from "./styling.js";
import { applyNewDot } from "./graph-init.js";

export function initControls(graphData, sharedState) {
  // Load DOT file from disk
  var dotFileInput = document.getElementById("dotFileInput");
  document.getElementById("loadBtn").addEventListener("click", function () {
    dotFileInput.click();
  });
  dotFileInput.addEventListener("change", function () {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        applyNewDot(e.target.result, graphData, sharedState);
      } catch (err) {
        document.getElementById("error").textContent = "Failed to parse DOT file: " + err.message;
        document.getElementById("error").style.display = "block";
      }
    };
    reader.readAsText(file);
    this.value = ""; // allow re-loading the same file
  });

  document.getElementById("clusterBtn").addEventListener("click", function () {
    var newCollapsed = {};
    Object.keys(graphData.spec.groups).forEach(function (g) { newCollapsed[g] = true; });
    sharedState.update({ collapsed: newCollapsed }, "controls");
  });

  document.getElementById("expandBtn").addEventListener("click", function () {
    var newCollapsed = {};
    Object.keys(graphData.spec.groups).forEach(function (g) { newCollapsed[g] = false; });
    sharedState.update({ collapsed: newCollapsed }, "controls");
  });

  document.getElementById("recolorBtn").addEventListener("click", function () {
    var newColorMap = assignGroupColors(
      graphData.spec.groups, graphData.spec.fixedColors, Math.random() * 360
    );
    sharedState.update({ colorMap: newColorMap, nodeOverrides: {} }, "controls");
  });

  var edgeColorBtn = document.getElementById("edgeColorBtn");
  edgeColorBtn.addEventListener("click", function () {
    var cur = sharedState.get().edgeColorMode;
    var next = cur === "target" ? "source" : "target";
    edgeColorBtn.textContent = "Edges: " + next;
    sharedState.update({ edgeColorMode: next }, "controls");
  });

  document.getElementById("relayoutBtn").addEventListener("click", function () {
    Renderer2D.render();
    Renderer3D.render();
  });

  document.getElementById("resetBtn").addEventListener("click", function () {
    // Reset renderer-specific configs
    Renderer2D.setConfig(JSON.parse(JSON.stringify(Renderer2D.getConfigDefaults())));
    Renderer3D.setConfig(JSON.parse(JSON.stringify(Renderer3D.getConfigDefaults())));
    document.getElementById("directionSelect").value = "TB";
    var cfg2d = Renderer2D.getConfig();
    cfg2d.flowDirection = "y";

    // Reset shared state
    var newCollapsed = {};
    Object.keys(graphData.spec.groups).forEach(function (g) { newCollapsed[g] = true; });
    var newColorMap = assignGroupColors(graphData.spec.groups, graphData.spec.fixedColors);
    document.getElementById("edgeColorBtn").textContent = "Edges: source";
    sharedState.update({
      collapsed: newCollapsed,
      colorMap: newColorMap,
      nodeOverrides: {},
      edgeColorMode: "source",
      selectedDagIndex: 0,
      selectedNode: null,
    }, "controls");

    Renderer3D.resetView();
    // Renderers react via SharedState subscriptions; force re-render for config changes
    Renderer2D.render();
    Renderer3D.render();
    buildPhysicsPanel2D();
    buildPhysicsPanel3D();
  });

  // 2D-specific: direction select
  document.getElementById("directionSelect").addEventListener("change", function () {
    var val = this.value;
    var cfg = Renderer2D.getConfig();
    if (val === "none") cfg.flowDirection = null;
    else if (val === "TB") cfg.flowDirection = "y";
    else if (val === "BT") cfg.flowDirection = "y";
    else if (val === "LR") cfg.flowDirection = "x";
    else if (val === "RL") cfg.flowDirection = "x";
    Renderer2D.render();
  });

  // 3D-specific: recenter button
  document.getElementById("recenterBtn").addEventListener("click", function () {
    Renderer3D.resetView();
  });

  // Physics panel toggle
  document.getElementById("physicsToggle").addEventListener("click", function () {
    var panel = document.getElementById("physicsPanel");
    panel.classList.toggle("open");
    this.textContent = panel.classList.contains("open") ? "Layout \u25be" : "Layout \u25b8";
  });

  buildPhysicsPanel2D();
  buildPhysicsPanel3D();
  buildLegend(graphData, sharedState);
  buildDagSelector(graphData, sharedState);

  // Subscribe to rebuild UI on any state change from renderers
  sharedState.subscribe("controls-ui", function (changes, changedKeys) {
    buildLegend(graphData, sharedState);
    if (changedKeys.indexOf("selectedDagIndex") >= 0 || changedKeys.indexOf("colorMap") >= 0) {
      buildDagSelector(graphData, sharedState);
    }
  });
}

// ---------------------------------------------------------------------------
// Physics panels (per-renderer)
// ---------------------------------------------------------------------------
function buildPhysicsPanel2D() {
  var panel = document.getElementById("physicsPanel2D");
  panel.innerHTML = "<div class='physics-section-title'>2D</div>";
  var cfg = Renderer2D.getConfig();
  addSlider(panel, "Link distance", cfg.linkDistance, 50, 400, 10, function (v) {
    cfg.linkDistance = v;
  });
  addCheckbox(panel, "Avoid overlaps", cfg.avoidOverlaps, function (v) {
    cfg.avoidOverlaps = v;
  });
}

function buildPhysicsPanel3D() {
  var panel = document.getElementById("physicsPanel3D");
  panel.innerHTML = "<div class='physics-section-title'>3D</div>";
  var cfg = Renderer3D.getConfig();
  addSlider(panel, "Link length", cfg.idealLength, 5, 80, 1, function (v) {
    cfg.idealLength = v;
  });
  addSlider(panel, "Constraint gap", cfg.constraintGap, 2, 60, 1, function (v) {
    cfg.constraintGap = v;
  });
}

function addSlider(panel, labelText, value, min, max, step, onChange) {
  var row = document.createElement("div");
  row.className = "physics-row";
  var lbl = document.createElement("label");
  lbl.textContent = labelText;
  var input = document.createElement("input");
  input.type = "range";
  input.min = min; input.max = max; input.step = step; input.value = value;
  var val = document.createElement("span");
  val.className = "val";
  val.textContent = value;
  input.addEventListener("input", function () {
    val.textContent = this.value;
    onChange(parseFloat(this.value));
  });
  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(val);
  panel.appendChild(row);
}

function addCheckbox(panel, labelText, checked, onChange) {
  var row = document.createElement("div");
  row.className = "physics-row";
  var lbl = document.createElement("label");
  lbl.textContent = labelText;
  var input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", function () {
    onChange(this.checked);
  });
  row.appendChild(lbl);
  row.appendChild(input);
  panel.appendChild(row);
}

// ---------------------------------------------------------------------------
// Legend (single, shared)
// ---------------------------------------------------------------------------
function buildLegend(graphData, sharedState) {
  var el = document.getElementById("legend");
  el.innerHTML = "";

  var ss = sharedState.get();
  var dagNodeSet = graphData.dags.length > 0
    ? graphData.dags[ss.selectedDagIndex].nodeSet : null;
  var visibleGroups = null;
  if (dagNodeSet) {
    visibleGroups = {};
    graphData.spec.nodes.forEach(function (n) {
      if (dagNodeSet[n.id]) visibleGroups[n.group] = true;
    });
  }

  var groupNames = Object.keys(graphData.spec.groups).sort().filter(function (g) {
    return !visibleGroups || visibleGroups[g];
  });
  groupNames.forEach(function (g) {
    var colors = ss.colorMap[g] || { fill: "#e0e0e0", border: "#999" };
    var item = document.createElement("div");
    item.className = "legend-item";
    item.dataset.sg = g;

    var dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.background = colors.fill;
    dot.style.border = "2px solid " + colors.border;

    var label = document.createElement("span");
    label.textContent = g + (ss.collapsed[g] ? " [+]" : "");

    item.appendChild(dot);
    item.appendChild(label);
    item.addEventListener("click", function () {
      var cur = sharedState.get();
      var newCollapsed = JSON.parse(JSON.stringify(cur.collapsed));
      newCollapsed[g] = !newCollapsed[g];
      sharedState.update({ collapsed: newCollapsed }, "controls");
    });
    el.appendChild(item);
  });

  var sep = document.createElement("div");
  sep.className = "legend-sep";
  el.appendChild(sep);

  var rootHint = document.createElement("div");
  rootHint.className = "legend-hint";
  var rootSwatch = document.createElement("div");
  rootSwatch.className = "legend-swatch legend-swatch-root";
  rootHint.appendChild(rootSwatch);
  rootHint.appendChild(document.createTextNode(" Root group"));
  el.appendChild(rootHint);

  var leafHint = document.createElement("div");
  leafHint.className = "legend-hint";
  var leafSwatch = document.createElement("div");
  leafSwatch.className = "legend-swatch legend-swatch-leaf";
  leafHint.appendChild(leafSwatch);
  leafHint.appendChild(document.createTextNode(" Leaf group"));
  el.appendChild(leafHint);

  var dblHint = document.createElement("div");
  dblHint.className = "legend-hint";
  dblHint.textContent = "Double-click to expand/collapse";
  el.appendChild(dblHint);

  var clickHint = document.createElement("div");
  clickHint.className = "legend-hint";
  clickHint.textContent = "Click to select";
  el.appendChild(clickHint);
}

// ---------------------------------------------------------------------------
// DAG selector (single, shared)
// ---------------------------------------------------------------------------
function buildDagSelector(graphData, sharedState) {
  var el = document.getElementById("dagSelector");
  el.innerHTML = "";

  if (graphData.dags.length <= 1) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  var ss = sharedState.get();

  var title = document.createElement("div");
  title.className = "dag-title";
  title.textContent = "DAG roots";
  el.appendChild(title);

  graphData.dags.forEach(function (dag, i) {
    var item = document.createElement("div");
    item.className = "dag-item" + (i === ss.selectedDagIndex ? " selected" : "");

    var groupColor = ss.colorMap[dag.root] || null;

    var dot = document.createElement("div");
    dot.className = "legend-dot";
    if (groupColor) {
      dot.style.background = groupColor.fill;
      dot.style.border = "2px solid " + groupColor.border;
    }

    var label = document.createElement("span");
    label.textContent = dag.root;

    var count = document.createElement("span");
    count.className = "dag-count";
    count.textContent = "(" + dag.size + ")";

    item.appendChild(dot);
    item.appendChild(label);
    item.appendChild(count);

    item.addEventListener("click", function () {
      sharedState.update({ selectedDagIndex: i }, "controls");
    });

    el.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// View mode switcher
// ---------------------------------------------------------------------------
export function initViewMode() {
  var buttons = document.querySelectorAll(".view-mode-btn");
  var currentMode = "split";
  var viewContainer = document.getElementById("viewer-container");
  var panel2d = document.getElementById("view-2d");
  var panel3d = document.getElementById("view-3d");
  var splitter = document.getElementById("splitter");
  var splitRatio = 0.5; // 0..1, fraction of space for the 2D panel

  function applySplitRatio() {
    if (currentMode !== "split") return;
    var splitterWidth = splitter.offsetWidth;
    var totalWidth = viewContainer.clientWidth - splitterWidth;
    panel2d.style.flex = "none";
    panel3d.style.flex = "none";
    panel2d.style.width = Math.round(totalWidth * splitRatio) + "px";
    panel3d.style.width = Math.round(totalWidth * (1 - splitRatio)) + "px";
  }

  function resetSplitFlex() {
    panel2d.style.flex = "";
    panel3d.style.flex = "";
    panel2d.style.width = "";
    panel3d.style.width = "";
  }

  function setMode(mode) {
    currentMode = mode;
    document.body.className = "mode-" + mode;
    buttons.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    if (mode === "split") {
      applySplitRatio();
    } else {
      resetSplitFlex();
    }

    // Manage 3D animation loop
    if (mode === "3d" || mode === "split") {
      Renderer3D.start();
      setTimeout(function () { Renderer3D.onResize(); }, 50);
    } else {
      Renderer3D.stop();
    }

    // Trigger 2D resize if needed
    if (mode === "2d" || mode === "split") {
      setTimeout(function () { Renderer2D.onResize(); }, 50);
    }
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setMode(btn.dataset.mode);
    });
  });

  // --- Splitter drag logic ---
  splitter.addEventListener("mousedown", function (e) {
    if (currentMode !== "split") return;
    e.preventDefault();
    splitter.classList.add("dragging");
    document.body.classList.add("splitter-dragging");

    function onMouseMove(e) {
      var rect = viewContainer.getBoundingClientRect();
      var splitterWidth = splitter.offsetWidth;
      var x = e.clientX - rect.left - splitterWidth / 2;
      var totalWidth = rect.width - splitterWidth;
      splitRatio = Math.max(0.1, Math.min(0.9, x / totalWidth));
      applySplitRatio();
      Renderer2D.onResize();
      Renderer3D.onResize();
    }

    function onMouseUp() {
      splitter.classList.remove("dragging");
      document.body.classList.remove("splitter-dragging");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  // Re-apply split ratio on window resize
  window.addEventListener("resize", function () {
    if (currentMode === "split") {
      applySplitRatio();
    }
  });

  setMode("split");
}

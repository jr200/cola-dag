// ---------------------------------------------------------------------------
// Controls orchestrator: creates and mounts all UI components.
// Each component is a self-contained module with { el, destroy }.
// ---------------------------------------------------------------------------

import Renderer2D from "./renderer-2d.js";
import Renderer3D from "./renderer-3d.js";
import { createFileLoader } from "./components/file-loader.js";
import { createDotEditor } from "./components/dot-editor.js";
import { createSharePanel } from "./components/share-panel.js";
import { createViewMode } from "./components/view-mode.js";
import { createGraphActions } from "./components/graph-actions.js";
import { createPhysicsPanel } from "./components/physics-panel.js";
import { createLegend } from "./components/legend.js";
import { createDagSelector } from "./components/dag-selector.js";

function createSep() {
  var s = document.createElement("span");
  s.className = "controls-sep";
  return s;
}

export function initControls(graphData, sharedState) {
  var toolbar = document.getElementById("controls");
  var components = [];

  // --- File loader ---
  var fileLoader = createFileLoader(graphData, sharedState);
  toolbar.appendChild(fileLoader.el);
  components.push(fileLoader);

  // --- DOT editor ---
  var dotEditor = createDotEditor(graphData, sharedState);
  toolbar.appendChild(dotEditor.el);
  components.push(dotEditor);

  // --- Share ---
  var sharePanel = createSharePanel(sharedState);
  toolbar.appendChild(sharePanel.el);
  components.push(sharePanel);
  toolbar.appendChild(createSep());

  // --- View mode (2D / Split / 3D + splitter) ---
  var viewMode = createViewMode(Renderer2D, Renderer3D);
  toolbar.appendChild(viewMode.el);
  components.push(viewMode);
  toolbar.appendChild(createSep());

  // --- Graph actions (cluster, expand, recolor, etc.) ---
  var graphActions = createGraphActions(graphData, sharedState, {
    onResetPhysics: function () { physicsPanel.rebuild(); }
  });
  toolbar.appendChild(graphActions.el);
  components.push(graphActions);
  toolbar.appendChild(createSep());

  // --- Physics panel (toggle in toolbar, panel below toolbar) ---
  var physicsPanel = createPhysicsPanel(Renderer2D, Renderer3D);
  toolbar.appendChild(physicsPanel.toggleEl);
  toolbar.insertAdjacentElement("afterend", physicsPanel.panelEl);
  physicsPanel.panelEl.insertAdjacentElement("afterend", dotEditor.panelEl);
  dotEditor.panelEl.insertAdjacentElement("afterend", sharePanel.panelEl);
  components.push(physicsPanel);

  // --- Version badge ---
  var version = document.createElement("a");
  version.id = "app-version";
  version.href = "/api/docs";
  version.target = "_blank";
  toolbar.appendChild(version);

  // --- Legend (bottom-right overlay) ---
  var legend = createLegend(graphData, sharedState);
  document.body.appendChild(legend.el);
  components.push(legend);

  // --- DAG selector (bottom-left overlay) ---
  var dagSelector = createDagSelector(graphData, sharedState);
  document.body.appendChild(dagSelector.el);
  components.push(dagSelector);

  return {
    destroy: function () {
      components.forEach(function (c) { c.destroy(); });
    }
  };
}

// ---------------------------------------------------------------------------
// DOT editor component: toggle button + text panel showing current DOT graph.
// Returns { el, destroy }.
// ---------------------------------------------------------------------------

import { applyNewDot } from "../graph-init.js";

export function createDotEditor(graphData, sharedState) {
  var btn = document.createElement("button");
  btn.textContent = "Load DOT";
  btn.dataset.tooltip = "View / edit the current graph as DOT text";

  var panel = document.createElement("div");
  panel.className = "dot-editor-panel";
  panel.style.display = "none";

  var textarea = document.createElement("textarea");
  textarea.className = "dot-editor-textarea";
  textarea.spellcheck = false;
  panel.appendChild(textarea);

  var actions = document.createElement("div");
  actions.className = "dot-editor-actions";

  var applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply";
  actions.appendChild(applyBtn);

  var closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  actions.appendChild(closeBtn);

  panel.appendChild(actions);

  var visible = false;

  // Replace textarea content while preserving the browser undo stack.
  function setTextareaValue(text) {
    textarea.focus();
    textarea.select();
    document.execCommand("insertText", false, text);
  }

  function fetchDot() {
    fetch("/api/graph-dot")
      .then(function (res) { return res.text(); })
      .then(function (text) { setTextareaValue(text); })
      .catch(function () { setTextareaValue("// failed to load current DOT"); });
  }

  function toggle() {
    visible = !visible;
    panel.style.display = visible ? "" : "none";
    btn.classList.toggle("active", visible);
    if (visible) fetchDot();
  }

  function onApply() {
    var text = textarea.value.trim();
    if (!text) return;
    try {
      applyNewDot(text, graphData, sharedState);
      fetch("/api/graph-dot", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
    } catch (err) {
      document.getElementById("error").textContent = "Failed to parse DOT: " + err.message;
      document.getElementById("error").style.display = "block";
    }
  }

  btn.addEventListener("click", toggle);
  applyBtn.addEventListener("click", onApply);
  closeBtn.addEventListener("click", toggle);

  // Refresh textarea when graph changes externally
  var unsubscribe = sharedState.subscribe("dot-editor", function (_changes, _keys, source) {
    if (source === "graph-update" && visible) fetchDot();
  });

  var el = document.createDocumentFragment();
  el.appendChild(btn);

  return {
    el: el,
    panelEl: panel,
    destroy: function () {
      btn.removeEventListener("click", toggle);
      applyBtn.removeEventListener("click", onApply);
      closeBtn.removeEventListener("click", toggle);
      unsubscribe();
      btn.remove();
      panel.remove();
    }
  };
}

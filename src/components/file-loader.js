// ---------------------------------------------------------------------------
// File loader component: hidden file input + Load button.
// Returns { el, destroy }.
// ---------------------------------------------------------------------------

import { applyNewDot } from "../graph-init.js";

export function createFileLoader(graphData, sharedState) {
  var fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".dot,.gv";
  fileInput.style.display = "none";

  var btn = document.createElement("button");
  btn.textContent = "Load File";
  btn.dataset.tooltip = "Load a Graphviz DOT file (.dot, .gv)";

  function onBtnClick() { fileInput.click(); }

  function onFileChange() {
    var file = fileInput.files[0];
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
    fileInput.value = "";
  }

  btn.addEventListener("click", onBtnClick);
  fileInput.addEventListener("change", onFileChange);

  var el = document.createDocumentFragment();
  el.appendChild(fileInput);
  el.appendChild(btn);

  return {
    el: el,
    destroy: function () {
      btn.removeEventListener("click", onBtnClick);
      fileInput.removeEventListener("change", onFileChange);
      btn.remove();
      fileInput.remove();
    }
  };
}

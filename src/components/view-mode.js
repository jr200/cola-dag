// ---------------------------------------------------------------------------
// View mode component: 2D / Split / 3D toggle buttons + splitter drag logic.
// Returns { el, destroy }.
// ---------------------------------------------------------------------------

export function createViewMode(Renderer2D, Renderer3D) {
  var currentMode = "3d";
  var splitRatio = 0.5;

  var viewContainer = document.getElementById("viewer-container");
  var panel2d = document.getElementById("view-2d");
  var panel3d = document.getElementById("view-3d");
  var splitter = document.getElementById("splitter");

  // --- Buttons ---
  var group = document.createElement("div");
  group.id = "viewModeGroup";

  var modes = [
    { key: "2d", label: "2D" },
    { key: "split", label: "Split" },
    { key: "3d", label: "3D" },
  ];
  var buttons = modes.map(function (m) {
    var btn = document.createElement("button");
    btn.className = "view-mode-btn" + (m.key === "3d" ? " active" : "");
    btn.dataset.mode = m.key;
    btn.textContent = m.label;
    group.appendChild(btn);
    return btn;
  });

  // --- Split helpers ---
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

  // --- Mode switching ---
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

    if (mode === "3d" || mode === "split") {
      Renderer3D.start();
      setTimeout(function () { Renderer3D.onResize(); }, 50);
    } else {
      Renderer3D.stop();
    }

    if (mode === "2d" || mode === "split") {
      setTimeout(function () { Renderer2D.onResize(); }, 50);
    }
  }

  function onButtonClick(e) {
    setMode(e.currentTarget.dataset.mode);
  }
  buttons.forEach(function (btn) {
    btn.addEventListener("click", onButtonClick);
  });

  // --- Splitter drag ---
  function onSplitterMouseDown(e) {
    if (currentMode !== "split") return;
    e.preventDefault();
    splitter.classList.add("dragging");
    document.body.classList.add("splitter-dragging");

    function onMouseMove(e) {
      var rect = viewContainer.getBoundingClientRect();
      var sw = splitter.offsetWidth;
      var x = e.clientX - rect.left - sw / 2;
      var totalWidth = rect.width - sw;
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
  }
  splitter.addEventListener("mousedown", onSplitterMouseDown);

  function onWindowResize() {
    if (currentMode === "split") applySplitRatio();
  }
  window.addEventListener("resize", onWindowResize);

  // --- Initial mode ---
  setMode("3d");

  return {
    el: group,
    destroy: function () {
      buttons.forEach(function (btn) {
        btn.removeEventListener("click", onButtonClick);
      });
      splitter.removeEventListener("mousedown", onSplitterMouseDown);
      window.removeEventListener("resize", onWindowResize);
      group.remove();
    }
  };
}

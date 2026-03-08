// ---------------------------------------------------------------------------
// Physics panel component: toggle button (toolbar) + expandable panel with
// 2D and 3D physics sliders/checkboxes.
// Returns { toggleEl, panelEl, rebuild, destroy }.
// ---------------------------------------------------------------------------

export function createPhysicsPanel(Renderer2D, Renderer3D) {
  // --- Toggle button (placed in toolbar by orchestrator) ---
  var toggleBtn = document.createElement("button");
  toggleBtn.id = "physicsToggle";
  toggleBtn.textContent = "Layout \u25b8";

  // --- Panel (placed below toolbar by orchestrator) ---
  var panelEl = document.createElement("div");
  panelEl.id = "physicsPanel";

  var section2d = document.createElement("div");
  section2d.id = "physicsPanel2D";
  section2d.className = "physics-section";

  var panelSep = document.createElement("span");
  panelSep.className = "physics-sep";

  var section3d = document.createElement("div");
  section3d.id = "physicsPanel3D";
  section3d.className = "physics-section";

  panelEl.appendChild(section2d);
  panelEl.appendChild(panelSep);
  panelEl.appendChild(section3d);

  // --- Toggle handler ---
  function onToggle() {
    panelEl.classList.toggle("open");
    toggleBtn.textContent = panelEl.classList.contains("open")
      ? "Layout \u25be"
      : "Layout \u25b8";
  }
  toggleBtn.addEventListener("click", onToggle);

  // --- Build panel sections ---
  function buildPanel2D() {
    section2d.innerHTML = "<div class='physics-section-title'>2D</div>";
    var cfg = Renderer2D.getConfig();
    addSlider(section2d, "Link distance", cfg.linkDistance, 50, 400, 10, function (v) {
      cfg.linkDistance = v;
    });
    addCheckbox(section2d, "Avoid overlaps", cfg.avoidOverlaps, function (v) {
      cfg.avoidOverlaps = v;
    });
  }

  function buildPanel3D() {
    section3d.innerHTML = "<div class='physics-section-title'>3D</div>";
    var cfg = Renderer3D.getConfig();
    addSlider(section3d, "Link length", cfg.idealLength, 5, 80, 1, function (v) {
      cfg.idealLength = v;
    });
    addSlider(section3d, "Constraint gap", cfg.constraintGap, 2, 60, 1, function (v) {
      cfg.constraintGap = v;
    });
  }

  buildPanel2D();
  buildPanel3D();

  return {
    toggleEl: toggleBtn,
    panelEl: panelEl,
    rebuild: function () {
      buildPanel2D();
      buildPanel3D();
    },
    destroy: function () {
      toggleBtn.removeEventListener("click", onToggle);
      toggleBtn.remove();
      panelEl.remove();
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers (private to this module)
// ---------------------------------------------------------------------------
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

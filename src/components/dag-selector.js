// ---------------------------------------------------------------------------
// DAG selector component: selectable list of independent DAG roots
// (bottom-left overlay).  Self-updates via SharedState subscription.
// Returns { el, destroy }.
// ---------------------------------------------------------------------------

var _isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

export function createDagSelector(graphData, sharedState) {
  var el = document.createElement("div");
  el.id = "dagSelector";
  var firstBuild = true;

  function render() {
    var wasCollapsed = el.classList.contains("collapsed");
    el.innerHTML = "";

    if (graphData.dags.length <= 1) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";

    var ss = sharedState.get();

    // Toggle button (visible on touch / small screens via CSS)
    var toggle = document.createElement("button");
    toggle.className = "dag-toggle";
    toggle.textContent = "DAG roots";
    toggle.addEventListener("click", function () {
      el.classList.toggle("collapsed");
    });
    el.appendChild(toggle);

    var body = document.createElement("div");
    body.className = "dag-body";

    var title = document.createElement("div");
    title.className = "dag-title";
    title.textContent = "DAG roots";
    body.appendChild(title);

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

      body.appendChild(item);
    });

    el.appendChild(body);
    if (wasCollapsed || (firstBuild && _isTouchDevice)) el.classList.add("collapsed");
    firstBuild = false;
  }

  render();

  var unsub = sharedState.subscribe("dag-selector", function (changes, changedKeys) {
    if (changedKeys.indexOf("selectedDagIndex") >= 0 || changedKeys.indexOf("colorMap") >= 0) {
      render();
    }
  });

  return {
    el: el,
    destroy: function () {
      unsub();
      el.remove();
    }
  };
}

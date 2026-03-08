// ---------------------------------------------------------------------------
// Legend component: collapsible group legend (bottom-right overlay).
// Self-updates via SharedState subscription.
// Returns { el, destroy }.
// ---------------------------------------------------------------------------

var _isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

export function createLegend(graphData, sharedState) {
  var el = document.createElement("div");
  el.id = "legend";
  var firstBuild = true;

  function render() {
    var wasCollapsed = el.classList.contains("collapsed");
    el.innerHTML = "";

    // Toggle button (visible on touch / small screens via CSS)
    var toggle = document.createElement("button");
    toggle.className = "legend-toggle";
    toggle.textContent = "Legend";
    toggle.addEventListener("click", function () {
      el.classList.toggle("collapsed");
    });
    el.appendChild(toggle);

    var body = document.createElement("div");
    body.className = "legend-body";

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
      body.appendChild(item);
    });

    var sep = document.createElement("div");
    sep.className = "legend-sep";
    body.appendChild(sep);

    var rootHint = document.createElement("div");
    rootHint.className = "legend-hint";
    var rootSwatch = document.createElement("div");
    rootSwatch.className = "legend-swatch legend-swatch-root";
    rootHint.appendChild(rootSwatch);
    rootHint.appendChild(document.createTextNode(" Root group"));
    body.appendChild(rootHint);

    var leafHint = document.createElement("div");
    leafHint.className = "legend-hint";
    var leafSwatch = document.createElement("div");
    leafSwatch.className = "legend-swatch legend-swatch-leaf";
    leafHint.appendChild(leafSwatch);
    leafHint.appendChild(document.createTextNode(" Leaf group"));
    body.appendChild(leafHint);

    var dblHint = document.createElement("div");
    dblHint.className = "legend-hint";
    dblHint.textContent = "Double-click to expand/collapse";
    body.appendChild(dblHint);

    var clickHint = document.createElement("div");
    clickHint.className = "legend-hint";
    clickHint.textContent = "Click to select";
    body.appendChild(clickHint);

    el.appendChild(body);
    if (wasCollapsed || (firstBuild && _isTouchDevice)) el.classList.add("collapsed");
    firstBuild = false;
  }

  render();

  var unsub = sharedState.subscribe("legend", function () {
    render();
  });

  return {
    el: el,
    destroy: function () {
      unsub();
      el.remove();
    }
  };
}

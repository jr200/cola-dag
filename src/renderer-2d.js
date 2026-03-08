// ---------------------------------------------------------------------------
// 2D SVG renderer (D3 + WebCola d3adaptor).
// ---------------------------------------------------------------------------

import * as d3 from "d3";
import { d3adaptor } from "webcola";
import { measureText } from "./styling.js";

var graphData = null;   // {spec, nodeRoles, nodeToGroup, dags}
var sharedState = null; // SharedState reference
var container = null;

var CONFIG_DEFAULTS = { linkDistance: 150, avoidOverlaps: true, flowDirection: "y" };
var config = null;

var svg, zoomG, groupLayer, linkLayer, nodeLayer, groupLabelLayer;
var width, height;
var d3cola = null;

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

// -------------------------------------------------------------------------
// Build cola data from current shared collapse state
// -------------------------------------------------------------------------
function buildColaData() {
  var ss = sharedState.get();
  var spec = graphData.spec;
  var nodeRoles = graphData.nodeRoles;
  var nodeToGroup = graphData.nodeToGroup;

  var colaNodes = [];
  var nodeIdToIndex = {};
  var groupNames = Object.keys(spec.groups).sort();
  var groupNameToIndex = {};
  var dagNodeSet = graphData.dags.length > 0
    ? graphData.dags[ss.selectedDagIndex].nodeSet : null;

  spec.nodes.forEach(function (n) {
    if (dagNodeSet && !dagNodeSet[n.id]) return;
    if (ss.collapsed[n.group]) return;
    var fontSize = nodeRoles[n.id] === "root" ? 13 : (nodeRoles[n.id] === "leaf" ? 10 : 11);
    var tw = measureText(n.id, fontSize);
    nodeIdToIndex[n.id] = colaNodes.length;
    colaNodes.push({
      name: n.id,
      width: tw + 20,
      height: fontSize + 14,
      group: n.group,
      nodeRole: nodeRoles[n.id] || null,
      isCollapsed: false,
    });
  });

  groupNames.forEach(function (g) {
    if (!ss.collapsed[g]) return;
    if (dagNodeSet) {
      var groupInDag = false;
      spec.nodes.forEach(function (n) {
        if (n.group === g && dagNodeSet[n.id]) groupInDag = true;
      });
      if (!groupInDag) return;
    }
    var tw = measureText(g, 12);
    nodeIdToIndex["__group:" + g] = colaNodes.length;
    colaNodes.push({
      name: g,
      width: tw + 30,
      height: 28,
      group: g,
      nodeRole: null,
      isCollapsed: true,
    });
  });

  var colaGroups = [];
  groupNames.forEach(function (g) {
    if (ss.collapsed[g]) return;
    var leaves = [];
    spec.nodes.forEach(function (n) {
      if (n.group === g && nodeIdToIndex[n.id] !== undefined) {
        leaves.push(nodeIdToIndex[n.id]);
      }
    });
    if (leaves.length > 0) {
      groupNameToIndex[g] = colaGroups.length;
      colaGroups.push({
        leaves: leaves,
        padding: 20,
        name: g,
        role: spec.groupRoles[g] || null,
      });
    }
  });

  var colaLinks = [];
  var linkDedup = {};
  spec.edges.forEach(function (e) {
    var srcGroup = nodeToGroup[e.from];
    var dstGroup = nodeToGroup[e.to];
    var srcIdx, dstIdx;

    if (ss.collapsed[srcGroup]) {
      srcIdx = nodeIdToIndex["__group:" + srcGroup];
    } else {
      srcIdx = nodeIdToIndex[e.from];
    }

    if (ss.collapsed[dstGroup]) {
      dstIdx = nodeIdToIndex["__group:" + dstGroup];
    } else {
      dstIdx = nodeIdToIndex[e.to];
    }

    if (srcIdx === undefined || dstIdx === undefined || srcIdx === dstIdx) return;

    var key = srcIdx + "->" + dstIdx;
    if (linkDedup[key]) return;
    linkDedup[key] = true;

    colaLinks.push({ source: srcIdx, target: dstIdx });
  });

  return { nodes: colaNodes, links: colaLinks, groups: colaGroups };
}

// -------------------------------------------------------------------------
// Interaction handlers
// -------------------------------------------------------------------------
function setupZoom(svgEl, zoomGEl) {
  var zoom = d3.zoom()
    .scaleExtent([0.1, 5])
    .on("zoom", function (event) {
      zoomGEl.attr("transform", event.transform);
    });
  svgEl.call(zoom);
  svgEl.on("dblclick.zoom", null);
}

function makeNodeDrag(d3colaRef) {
  var savedFixed = [];
  var hasDragged = false;

  return d3.drag()
    .clickDistance(3)
    .on("start", function (event, d) {
      event.sourceEvent.stopPropagation();
      hasDragged = false;
      savedFixed = [];
      d3colaRef.nodes().forEach(function (n, i) {
        if (n.group !== d.group) {
          savedFixed.push({ index: i, node: n, was: n.fixed || 0 });
          n.fixed |= 2;
        }
      });
      d.fixed |= 2;
      d3colaRef.resume();
    })
    .on("drag", function (event, d) {
      hasDragged = true;
      d.px = event.x;
      d.py = event.y;
      d3colaRef.resume();
    })
    .on("end", function (event, d) {
      if (hasDragged) {
        d.fixed |= 1;
      } else {
        d.fixed = d.fixed & ~2;
      }
      savedFixed.forEach(function (s) { s.node.fixed = s.was; });
      savedFixed = [];
      d3colaRef.resume();
    });
}

function makeGroupDrag(d3colaRef) {
  var startX, startY;

  function getLeafNodes(group, allNodes) {
    var nodes = [];
    if (group.leaves) {
      group.leaves.forEach(function (idx) {
        var n = typeof idx === "object" ? idx : allNodes[idx];
        if (n) nodes.push(n);
      });
    }
    return nodes;
  }

  return d3.drag()
    .clickDistance(3)
    .on("start", function (event, d) {
      event.sourceEvent.stopPropagation();
      startX = event.x;
      startY = event.y;
      var leaves = getLeafNodes(d, d3colaRef.nodes());
      leaves.forEach(function (n) { n.fixed |= 2; });
      d3colaRef.resume();
    })
    .on("drag", function (event, d) {
      var dx = event.x - startX;
      var dy = event.y - startY;
      startX = event.x;
      startY = event.y;
      var leaves = getLeafNodes(d, d3colaRef.nodes());
      leaves.forEach(function (n) {
        n.px = (n.px || n.x) + dx;
        n.py = (n.py || n.y) + dy;
      });
      d3colaRef.resume();
    })
    .on("end", function (event, d) {
      var leaves = getLeafNodes(d, d3colaRef.nodes());
      leaves.forEach(function (n) { n.fixed |= 1; });
      d3colaRef.resume();
    });
}

// -------------------------------------------------------------------------
// Node selection
// -------------------------------------------------------------------------
function applySelection(selectedNodeName) {
  if (!nodeLayer) return;
  nodeLayer.selectAll(".node-g").classed("node-selected", function (d) {
    return d.name === selectedNodeName;
  });
}

// -------------------------------------------------------------------------
// Recolor SVG elements in place (no layout rebuild)
// -------------------------------------------------------------------------
function recolor() {
  var ss = sharedState.get();
  if (!nodeLayer) return;

  nodeLayer.selectAll(".node-rect")
    .style("fill", function (d) {
      if (ss.nodeOverrides[d.name]) return ss.nodeOverrides[d.name];
      return ss.colorMap[d.group] ? ss.colorMap[d.group].fill : "#e0e0e0";
    })
    .style("stroke", function (d) { return ss.colorMap[d.group] ? ss.colorMap[d.group].border : "#999"; });
  groupLayer.selectAll(".group-rect")
    .style("fill", function (d) { return ss.colorMap[d.name] ? ss.colorMap[d.name].fill : "#e0e0e0"; })
    .style("stroke", function (d) { return ss.colorMap[d.name] ? ss.colorMap[d.name].border : "#999"; });
  linkLayer.selectAll(".link")
    .style("stroke", function (d) {
      var node = ss.edgeColorMode === "source"
        ? (typeof d.source === "object" ? d.source : null)
        : (typeof d.target === "object" ? d.target : null);
      if (node) {
        var c = ss.colorMap[node.group];
        return c ? c.border : "#999";
      }
      return "#999";
    });
  groupLabelLayer.selectAll(".group-label")
    .style("fill", function (d) { return ss.colorMap[d.name] ? ss.colorMap[d.name].border : "#999"; });
}

// -------------------------------------------------------------------------
// Render graph (full rebuild)
// -------------------------------------------------------------------------
function render() {
  if (!container) return;

  var ss = sharedState.get();

  // Save current node positions before rebuilding
  var oldPositions = {};
  var oldGroupBounds = {};
  if (d3cola) {
    d3cola.nodes().forEach(function (n) {
      if (n.x !== undefined && n.y !== undefined) {
        oldPositions[n.name] = { x: n.x, y: n.y, fixed: n.fixed || 0 };
      }
    });
    d3cola.groups().forEach(function (g) {
      if (g.bounds) {
        oldGroupBounds[g.name] = {
          x: g.bounds.x + g.bounds.width() / 2,
          y: g.bounds.y + g.bounds.height() / 2,
        };
      }
    });
  }
  var hasOldPositions = Object.keys(oldPositions).length > 0;

  var data = buildColaData();

  // Seed new nodes with old positions where possible
  if (hasOldPositions) {
    data.nodes.forEach(function (n) {
      if (oldPositions[n.name]) {
        n.x = oldPositions[n.name].x;
        n.y = oldPositions[n.name].y;
        n.fixed = oldPositions[n.name].fixed;
      } else if (n.isCollapsed && oldGroupBounds[n.group]) {
        n.x = oldGroupBounds[n.group].x;
        n.y = oldGroupBounds[n.group].y;
      } else if (!n.isCollapsed && oldPositions[n.group]) {
        n.x = oldPositions[n.group].x + (Math.random() - 0.5) * 30;
        n.y = oldPositions[n.group].y + (Math.random() - 0.5) * 30;
      }
    });
  }

  if (d3cola) d3cola.stop();

  d3cola = d3adaptor(d3)
    .linkDistance(config.linkDistance)
    .avoidOverlaps(config.avoidOverlaps)
    .handleDisconnected(true)
    .size([width, height]);

  if (config.flowDirection) {
    d3cola.flowLayout(config.flowDirection, config.linkDistance * 0.7);
  }

  d3cola
    .nodes(data.nodes)
    .links(data.links)
    .groups(data.groups)
    .start(hasOldPositions ? 10 : 30, hasOldPositions ? 10 : 20, hasOldPositions ? 10 : 20);

  // --- Groups ---
  var groupSel = groupLayer.selectAll(".group-rect").data(data.groups, function (d) { return d.name; });
  groupSel.exit().remove();
  var groupEnter = groupSel.enter().append("rect").attr("class", function (d) {
    var cls = "group-rect";
    if (d.role === "root") cls += " role-root";
    else if (d.role === "leaf") cls += " role-leaf";
    return cls;
  });
  var groupAll = groupEnter.merge(groupSel);
  groupAll
    .style("fill", function (d) { return ss.colorMap[d.name] ? ss.colorMap[d.name].fill : "#e0e0e0"; })
    .style("fill-opacity", 0.5)
    .style("stroke", function (d) { return ss.colorMap[d.name] ? ss.colorMap[d.name].border : "#999"; })
    .style("cursor", "grab")
    .on("dblclick", function (event, d) {
      var newCollapsed = deepCopy(ss.collapsed);
      newCollapsed[d.name] = true;
      sharedState.update({ collapsed: newCollapsed }, "2d");
      render();
    })
    .call(makeGroupDrag(d3cola))
    .on("contextmenu", function (event, d) {
      event.preventDefault();
      var allNodes = d3cola.nodes();
      if (d.leaves) {
        d.leaves.forEach(function (idx) {
          var n = typeof idx === "object" ? idx : allNodes[idx];
          if (n) n.fixed = 0;
        });
      }
      d3cola.resume();
    });

  // --- Group labels ---
  var glSel = groupLabelLayer.selectAll(".group-label").data(data.groups, function (d) { return d.name; });
  glSel.exit().remove();
  var glEnter = glSel.enter().append("text").attr("class", "group-label");
  var glAll = glEnter.merge(glSel);
  glAll.text(function (d) { return d.name; })
    .style("fill", function (d) { return ss.colorMap[d.name] ? ss.colorMap[d.name].border : "#999"; });

  // --- Links ---
  var linkSel = linkLayer.selectAll(".link").data(data.links);
  linkSel.exit().remove();
  var linkEnter = linkSel.enter().append("path").attr("class", "link");
  var linkAll = linkEnter.merge(linkSel);
  linkAll.style("stroke", function (d) {
    var idx = ss.edgeColorMode === "source"
      ? (d.source.index !== undefined ? d.source.index : d.source)
      : (d.target.index !== undefined ? d.target.index : d.target);
    var node = data.nodes[idx];
    if (node) {
      var c = ss.colorMap[node.group];
      return c ? c.border : "#999";
    }
    return "#999";
  });

  // --- Nodes ---
  var pad = 4;
  var nodeSel = nodeLayer.selectAll(".node-g").data(data.nodes, function (d) { return d.name; });
  nodeSel.exit().remove();
  var nodeEnter = nodeSel.enter().append("g").attr("class", "node-g");
  nodeEnter.append("rect");
  nodeEnter.append("text");
  var nodeAll = nodeEnter.merge(nodeSel);

  nodeAll.select("rect")
    .attr("class", function (d) {
      if (d.isCollapsed) return "node-rect collapsed-node";
      var cls = "node-rect";
      if (d.nodeRole === "root") cls += " role-root";
      else if (d.nodeRole === "leaf") cls += " role-leaf";
      return cls;
    })
    .attr("width", function (d) { return d.width - 2 * pad; })
    .attr("height", function (d) { return d.height - 2 * pad; })
    .style("fill", function (d) {
      if (ss.nodeOverrides[d.name]) return ss.nodeOverrides[d.name];
      return ss.colorMap[d.group] ? ss.colorMap[d.group].fill : "#e0e0e0";
    })
    .style("stroke", function (d) { return ss.colorMap[d.group] ? ss.colorMap[d.group].border : "#999"; })
    .style("fill-opacity", function (d) { return d.isCollapsed ? 0.8 : 1; });

  nodeAll.select("text")
    .attr("class", function (d) {
      var cls = "node-label";
      if (d.isCollapsed) return cls;
      if (d.nodeRole === "root") cls += " role-root";
      else if (d.nodeRole === "leaf") cls += " role-leaf";
      return cls;
    })
    .attr("x", function (d) { return (d.width - 2 * pad) / 2; })
    .attr("y", function (d) { return (d.height - 2 * pad) / 2; })
    .text(function (d) { return d.name; });

  // Double-click: toggle collapse
  nodeAll.on("dblclick", function (event, d) {
    var cur = sharedState.get();
    var newCollapsed = deepCopy(cur.collapsed);
    newCollapsed[d.group] = d.isCollapsed ? false : true;
    sharedState.update({ collapsed: newCollapsed }, "2d");
    render();
  });

  // Single-click: select node
  nodeAll.on("click", function (event, d) {
    event.stopPropagation();
    var cur = sharedState.get();
    var newSel = (cur.selectedNode === d.name) ? null : d.name;
    sharedState.update({ selectedNode: newSel }, "2d");
    applySelection(newSel);
  });

  nodeAll.call(makeNodeDrag(d3cola));
  nodeAll.on("contextmenu", function (event, d) {
    event.preventDefault();
    if (d.fixed) {
      d.fixed = 0;
      d3cola.resume();
    }
  });

  // Click SVG background to deselect
  svg.on("click", function () {
    var cur = sharedState.get();
    if (cur.selectedNode !== null) {
      sharedState.update({ selectedNode: null }, "2d");
      applySelection(null);
    }
  });

  // --- Tick ---
  d3cola.on("tick", function () {
    linkAll.attr("d", function (d) {
      var sx = d.source.x, sy = d.source.y;
      var tx = d.target.x, ty = d.target.y;
      var dx = tx - sx, dy = ty - sy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        var tw = (d.target.width || 40) / 2;
        var th = (d.target.height || 20) / 2;
        var scale = Math.min(tw / Math.abs(dx / dist), th / Math.abs(dy / dist));
        tx -= (dx / dist) * scale;
        ty -= (dy / dist) * scale;
      }
      return "M" + sx + "," + sy + "L" + tx + "," + ty;
    });

    nodeAll.attr("transform", function (d) {
      return "translate(" + (d.x - d.width / 2 + pad) + "," + (d.y - d.height / 2 + pad) + ")";
    });

    groupAll
      .attr("x", function (d) { return d.bounds ? d.bounds.x : 0; })
      .attr("y", function (d) { return d.bounds ? d.bounds.y : 0; })
      .attr("width", function (d) { return d.bounds ? d.bounds.width() : 0; })
      .attr("height", function (d) { return d.bounds ? d.bounds.height() : 0; });

    glAll
      .attr("x", function (d) { return d.bounds ? d.bounds.x + d.bounds.width() / 2 : 0; })
      .attr("y", function (d) { return d.bounds ? d.bounds.y + 5 : 0; });
  });

  // Apply current selection
  applySelection(ss.selectedNode);
}

// -------------------------------------------------------------------------
// SharedState listener
// -------------------------------------------------------------------------
function onSharedStateChange(changes, changedKeys) {
  var colorOnly = changedKeys.length > 0 && changedKeys.every(function (k) {
    return k === "colorMap" || k === "nodeOverrides" || k === "edgeColorMode";
  });
  var selectionOnly = changedKeys.length === 1 && changedKeys[0] === "selectedNode";

  if (selectionOnly) {
    applySelection(sharedState.get().selectedNode);
    return;
  }
  if (colorOnly) {
    recolor();
    return;
  }
  // Structural change (collapsed or selectedDagIndex): full render
  render();
  if (changedKeys.indexOf("selectedNode") >= 0) {
    applySelection(sharedState.get().selectedNode);
  }
}

// -------------------------------------------------------------------------
// Resize
// -------------------------------------------------------------------------
function onResize() {
  if (!container || !svg) return;
  width = container.clientWidth;
  height = container.clientHeight;
  svg.attr("viewBox", "0 0 " + width + " " + height);
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------
var Renderer2D = {
  init: function (containerEl, gd, ss) {
    container = containerEl;
    graphData = gd;
    sharedState = ss;
    config = deepCopy(CONFIG_DEFAULTS);

    // SVG setup
    width = container.clientWidth;
    height = container.clientHeight;

    svg = d3.select(container).append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", "0 0 " + width + " " + height);

    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L10,0L0,4")
      .attr("fill", "#999");

    zoomG = svg.append("g");
    setupZoom(svg, zoomG);

    groupLayer = zoomG.append("g").attr("class", "groups");
    linkLayer = zoomG.append("g").attr("class", "links");
    nodeLayer = zoomG.append("g").attr("class", "nodes");
    groupLabelLayer = zoomG.append("g").attr("class", "group-labels");

    render();
    sharedState.subscribe("2d", onSharedStateChange);
    window.addEventListener("resize", onResize);
  },
  render: render,
  recolor: recolor,
  onResize: onResize,
  getConfig: function () { return config; },
  getConfigDefaults: function () { return CONFIG_DEFAULTS; },
  setConfig: function (newConfig) { config = newConfig; },
};

export default Renderer2D;

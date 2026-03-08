// ---------------------------------------------------------------------------
// DOT parser adapter — uses @dagrejs/graphlib-dot to parse .dot text, then
// transforms the result into the spec object consumed by the renderers.
// ---------------------------------------------------------------------------

import graphlibDot from "@dagrejs/graphlib-dot";

export function parseDot(text) {
  var digraph = graphlibDot.read(text);

  var groups = {};
  var idToLabel = {};
  var nodeGroupMap = {};

  // Separate subgraph nodes from leaf nodes.
  // graphlib-dot puts subgraph IDs (e.g. "cluster_cert_manager") into nodes()
  // alongside regular nodes. Subgraph nodes have children; leaf nodes don't.
  digraph.nodes().forEach(function (dotId) {
    var children = digraph.children(dotId);
    if (children.length > 0) {
      // Subgraph — extract group metadata
      var sgAttrs = digraph.node(dotId) || {};
      var groupLabel =
        sgAttrs.label || dotId.replace(/^cluster_/, "").replace(/_/g, "-");
      groups[groupLabel] = {
        fillColor: sgAttrs.fillcolor || null,
        edgeColor: sgAttrs.color || null,
      };
      // Map each child node to this group
      children.forEach(function (childId) {
        nodeGroupMap[childId] = groupLabel;
      });
      return;
    }

    // Regular (leaf) node
    var nodeAttrs = digraph.node(dotId) || {};
    idToLabel[dotId] = nodeAttrs.label || dotId.replace(/_/g, "-");
  });

  // --- Build resolved nodes -------------------------------------------------
  var resolvedNodes = Object.keys(idToLabel).map(function (dotId) {
    return { id: idToLabel[dotId], group: nodeGroupMap[dotId] || "_external" };
  });

  // --- Build resolved edges -------------------------------------------------
  var resolvedEdges = digraph.edges().map(function (edge) {
    var src = edge.v;
    var tgt = edge.w;
    return {
      from: idToLabel[src] || src.replace(/_/g, "-"),
      to: idToLabel[tgt] || tgt.replace(/_/g, "-"),
    };
  });

  // --- Fixed colours from DOT attributes ------------------------------------
  var fixedColors = {};
  Object.keys(groups).forEach(function (g) {
    fixedColors[g] = { fill: groups[g].fillColor, edge: groups[g].edgeColor };
  });

  // --- Compute group roles (root / leaf) ------------------------------------
  var hasExternalIn = {};
  var hasExternalOut = {};
  resolvedEdges.forEach(function (e) {
    var srcGroup = null,
      dstGroup = null;
    resolvedNodes.forEach(function (n) {
      if (n.id === e.from) srcGroup = n.group;
      if (n.id === e.to) dstGroup = n.group;
    });
    if (srcGroup && dstGroup && srcGroup !== dstGroup) {
      hasExternalIn[dstGroup] = true;
      hasExternalOut[srcGroup] = true;
    }
  });

  var groupRoles = {};
  Object.keys(groups).forEach(function (grp) {
    if (!hasExternalIn[grp]) groupRoles[grp] = "root";
    else if (!hasExternalOut[grp]) groupRoles[grp] = "leaf";
  });

  return {
    meta: { title: "Dependency Graph" },
    nodes: resolvedNodes,
    edges: resolvedEdges,
    groups: groups,
    groupRoles: groupRoles,
    fixedColors: fixedColors,
  };
}

// ---------------------------------------------------------------------------
// 3D WebGL renderer (Three.js + WebCola Layout3D).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Layout3D } from "webcola";
import { hexToInt } from "./styling.js";

var graphData = null;   // {spec, nodeRoles, nodeToGroup, dags}
var sharedState = null; // SharedState reference
var container = null;

var CONFIG_DEFAULTS = { idealLength: 18, constraintGap: 12 };
var config = null;

var scene, camera, threeRenderer, graphGroup;
var mouse;
var raycaster, mouseVec;

// Label scaling constants
var LABEL_REF_DISTANCE = 300;
var LABEL_MAX_APPARENT = 8;
var LABEL_MIN_APPARENT = 0.3;
var LABEL_FADE_APPARENT = 0.1;
var LABEL_DEPTH_DAMPING = 0.05;
var _labelWorldPos = new THREE.Vector3();

// Current graph objects
var currentRoot = null;
var currentLayout = null;
var currentNodeMeshes = [];
var currentLabels = [];
var currentEdges = [];
var currentHighlights = [];
var currentWireframes = [];
var converged = false;
var delta = Infinity;

// Animation loop
var animationId = null;
var running = false;
var xAngle = 0;
var yAngle = 0;

// Selection
var selectedMeshRef = null;
var originalEmissiveIntensity = null;

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
  var dagNodeSet = graphData.dags.length > 0
    ? graphData.dags[ss.selectedDagIndex].nodeSet : null;

  spec.nodes.forEach(function (n) {
    if (dagNodeSet && !dagNodeSet[n.id]) return;
    if (ss.collapsed[n.group]) return;
    nodeIdToIndex[n.id] = colaNodes.length;
    colaNodes.push({
      name: n.id,
      group: n.group,
      nodeRole: nodeRoles[n.id] || null,
      isCollapsed: false,
    });
  });

  // Collapsed group proxy nodes
  var groupNames = Object.keys(spec.groups).sort();
  groupNames.forEach(function (g) {
    if (!ss.collapsed[g]) return;
    if (dagNodeSet) {
      var groupInDag = false;
      spec.nodes.forEach(function (n) {
        if (n.group === g && dagNodeSet[n.id]) groupInDag = true;
      });
      if (!groupInDag) return;
    }
    nodeIdToIndex["__group:" + g] = colaNodes.length;
    colaNodes.push({
      name: g,
      group: g,
      nodeRole: null,
      isCollapsed: true,
    });
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

  // Y-axis constraints for hierarchy
  var constraints = colaLinks.map(function (l) {
    return {
      axis: "y",
      left: l.target,
      right: l.source,
      gap: config.constraintGap,
    };
  });

  return { nodes: colaNodes, links: colaLinks, constraints: constraints };
}

// -------------------------------------------------------------------------
// Mouse interaction
// -------------------------------------------------------------------------
function setupMouseInteraction(domElement) {
  var m = { down: false, x: 0, y: 0, dx: 0, dy: 0, panX: 0, panY: 0 };

  domElement.addEventListener("mousedown", function (e) {
    m.down = true;
    m.x = e.clientX;
    m.y = e.clientY;
  });

  domElement.addEventListener("mouseup", function () {
    m.down = false;
  });

  domElement.addEventListener("mousemove", function (e) {
    if (m.down) {
      var moveX = e.clientX - m.x;
      var moveY = e.clientY - m.y;
      m.x = e.clientX;
      m.y = e.clientY;
      if (e.shiftKey) {
        m.panX += moveX;
        m.panY += moveY;
      } else {
        m.dx = moveX;
        m.dy = moveY;
      }
    }
  });

  domElement.addEventListener("wheel", function (e) {
    var rect = domElement.getBoundingClientRect();
    var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    var oldZ = camera.position.z;
    var newZ = oldZ + e.deltaY * 0.5;
    newZ = Math.max(20, Math.min(800, newZ));
    var scale = 1 - newZ / oldZ;

    camera.position.x += mx * oldZ * scale;
    camera.position.y += my * oldZ * scale;
    camera.position.z = newZ;
    e.preventDefault();
  }, { passive: false });

  // --- Touch support ---
  var touchState = { active: 0, prevDist: 0 };

  domElement.addEventListener("touchstart", function (e) {
    e.preventDefault();
    var touches = e.touches;
    touchState.active = touches.length;
    if (touches.length === 1) {
      m.down = true;
      m.x = touches[0].clientX;
      m.y = touches[0].clientY;
    } else if (touches.length === 2) {
      m.down = false;
      var dx = touches[1].clientX - touches[0].clientX;
      var dy = touches[1].clientY - touches[0].clientY;
      touchState.prevDist = Math.sqrt(dx * dx + dy * dy);
      m.x = (touches[0].clientX + touches[1].clientX) / 2;
      m.y = (touches[0].clientY + touches[1].clientY) / 2;
    }
  }, { passive: false });

  domElement.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var touches = e.touches;
    if (touches.length === 1 && touchState.active === 1) {
      // Single finger: rotate
      var moveX = touches[0].clientX - m.x;
      var moveY = touches[0].clientY - m.y;
      m.x = touches[0].clientX;
      m.y = touches[0].clientY;
      m.dx = moveX;
      m.dy = moveY;
    } else if (touches.length === 2) {
      // Pinch: zoom
      var dx = touches[1].clientX - touches[0].clientX;
      var dy = touches[1].clientY - touches[0].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (touchState.prevDist > 0) {
        var zoomDelta = (touchState.prevDist - dist) * 1.5;
        var oldZ = camera.position.z;
        var newZ = Math.max(20, Math.min(800, oldZ + zoomDelta));
        camera.position.z = newZ;
      }
      touchState.prevDist = dist;

      // Two-finger drag: pan
      var cx = (touches[0].clientX + touches[1].clientX) / 2;
      var cy = (touches[0].clientY + touches[1].clientY) / 2;
      m.panX += cx - m.x;
      m.panY += cy - m.y;
      m.x = cx;
      m.y = cy;
    }
  }, { passive: false });

  domElement.addEventListener("touchend", function (e) {
    e.preventDefault();
    touchState.active = e.touches.length;
    if (e.touches.length === 0) {
      m.down = false;
    } else if (e.touches.length === 1) {
      m.x = e.touches[0].clientX;
      m.y = e.touches[0].clientY;
    }
  }, { passive: false });

  return m;
}

// -------------------------------------------------------------------------
// Create text sprite from canvas texture
// -------------------------------------------------------------------------
function createTextSprite(text, options) {
  options = options || {};
  var fontSize = options.fontSize || 36;
  var fontFamily = options.fontFamily || "Helvetica, Arial, sans-serif";
  var color = options.color || "#333333";
  var bold = options.bold || false;
  var spriteScale = options.scale || 0.04;

  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");

  var font = (bold ? "bold " : "") + fontSize + "px " + fontFamily;
  ctx.font = font;
  var tw = ctx.measureText(text).width;
  var padding = fontSize * 0.3;

  canvas.width = Math.ceil(tw + padding * 2);
  canvas.height = Math.ceil(fontSize * 1.4);

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  var texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  var material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  var sprite = new THREE.Sprite(material);
  var baseScaleX = canvas.width * spriteScale;
  var baseScaleY = canvas.height * spriteScale;
  sprite.scale.set(baseScaleX, baseScaleY, 1);
  sprite.userData.baseScaleX = baseScaleX;
  sprite.userData.baseScaleY = baseScaleY;

  return sprite;
}

// -------------------------------------------------------------------------
// Selection
// -------------------------------------------------------------------------
function applySelection(selectedNodeName) {
  // Remove previous highlight
  if (selectedMeshRef) {
    selectedMeshRef.material.emissiveIntensity = originalEmissiveIntensity;
    selectedMeshRef = null;
    originalEmissiveIntensity = null;
  }
  if (!selectedNodeName) return;
  for (var i = 0; i < currentNodeMeshes.length; i++) {
    if (currentNodeMeshes[i].userData.node.name === selectedNodeName) {
      selectedMeshRef = currentNodeMeshes[i];
      originalEmissiveIntensity = selectedMeshRef.material.emissiveIntensity;
      selectedMeshRef.material.emissiveIntensity = 1.4;
      break;
    }
  }
}

// -------------------------------------------------------------------------
// Recolor meshes in place (no layout rebuild)
// -------------------------------------------------------------------------
function recolor() {
  var ss = sharedState.get();
  for (var i = 0; i < currentNodeMeshes.length; i++) {
    var node = currentNodeMeshes[i].userData.node;
    var fillHex;
    if (ss.nodeOverrides[node.name]) {
      fillHex = ss.nodeOverrides[node.name];
    } else {
      var colors = ss.colorMap[node.group] || { fill: "#e0e0e0", border: "#999" };
      fillHex = colors.fill;
    }
    currentNodeMeshes[i].material.color.set(hexToInt(fillHex));
    currentNodeMeshes[i].material.emissive.set(hexToInt(fillHex));
  }
  for (var wi = 0; wi < currentWireframes.length; wi++) {
    var wfNode = currentNodeMeshes[currentWireframes[wi].userData.followIndex].userData.node;
    var wfColors = ss.colorMap[wfNode.group] || { fill: "#e0e0e0", border: "#999" };
    currentWireframes[wi].material.color.set(hexToInt(wfColors.border));
  }
  for (var k = 0; k < currentHighlights.length; k++) {
    var hlNode = currentNodeMeshes[currentHighlights[k].userData.followIndex].userData.node;
    var hlColors = ss.colorMap[hlNode.group] || { fill: "#e0e0e0", border: "#999" };
    currentHighlights[k].material.color.set(hexToInt(hlColors.border));
  }
  for (var j = 0; j < currentEdges.length; j++) {
    var ei = ss.edgeColorMode === "source"
      ? currentEdges[j].userData.source
      : currentEdges[j].userData.target;
    var edgeNode = currentNodeMeshes[ei] && currentNodeMeshes[ei].userData.node;
    var edgeColor = 0xcfcfcf;
    if (edgeNode) {
      var c = ss.colorMap[edgeNode.group];
      if (c) edgeColor = hexToInt(c.border);
    }
    currentEdges[j].material.color.set(edgeColor);
  }
}

// -------------------------------------------------------------------------
// Update 3D positions from layout result
// -------------------------------------------------------------------------
function updatePositions() {
  if (!currentLayout || currentNodeMeshes.length === 0) return;
  var x = currentLayout.result[0];
  var y = currentLayout.result[1];
  var z = currentLayout.result[2];

  for (var i = 0; i < currentNodeMeshes.length; i++) {
    currentNodeMeshes[i].position.set(x[i], y[i], z[i]);
    currentLabels[i].position.set(x[i], y[i] + 1.8, z[i]);
  }

  currentHighlights.forEach(function (h) {
    var fi = h.userData.followIndex;
    h.position.set(x[fi], y[fi], z[fi]);
  });

  var _edgeFrom = new THREE.Vector3();
  var _edgeTo = new THREE.Vector3();
  var _edgeDir = new THREE.Vector3();
  currentEdges.forEach(function (tube) {
    var si = tube.userData.source;
    var ti = tube.userData.target;
    _edgeFrom.set(x[si], y[si], z[si]);
    _edgeTo.set(x[ti], y[ti], z[ti]);
    var len = _edgeFrom.distanceTo(_edgeTo);
    tube.position.copy(_edgeFrom);
    _edgeDir.subVectors(_edgeTo, _edgeFrom).normalize();
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _edgeDir);
    tube.scale.set(1, 1, len);
  });
}

// -------------------------------------------------------------------------
// Zoom-to-fit
// -------------------------------------------------------------------------
var FIT_FILL = 0.9;
var _fitPos = new THREE.Vector3();
function zoomToFit() {
  if (currentNodeMeshes.length === 0) return;
  scene.updateMatrixWorld(true);

  var cx = 0, cy = 0, cz = 0;
  for (var i = 0; i < currentNodeMeshes.length; i++) {
    currentNodeMeshes[i].getWorldPosition(_fitPos);
    cx += _fitPos.x;
    cy += _fitPos.y;
    cz += _fitPos.z;
  }
  var n = currentNodeMeshes.length;
  cx /= n; cy /= n; cz /= n;

  var radius = 0;
  for (var j = 0; j < currentNodeMeshes.length; j++) {
    currentNodeMeshes[j].getWorldPosition(_fitPos);
    var r = Math.sqrt(
      (_fitPos.x - cx) * (_fitPos.x - cx) +
      (_fitPos.y - cy) * (_fitPos.y - cy) +
      (_fitPos.z - cz) * (_fitPos.z - cz)
    );
    if (r > radius) radius = r;
  }
  if (radius < 5) radius = 5;

  var halfFov = (camera.fov / 2) * (Math.PI / 180);
  var halfFovH = Math.atan(Math.tan(halfFov) * camera.aspect);
  var d = (radius / Math.sin(Math.min(halfFov, halfFovH))) / FIT_FILL;

  var fitZ = Math.max(20, Math.min(800, cz + d));
  camera.position.set(cx, cy, fitZ);
  LABEL_REF_DISTANCE = camera.position.length();
}

// -------------------------------------------------------------------------
// Reset view
// -------------------------------------------------------------------------
function resetView() {
  yAngle = 0;
  graphGroup.rotation.set(0, xAngle, 0);
  camera.position.set(0, 0, 300);
  zoomToFit();
}

// -------------------------------------------------------------------------
// Render graph (full rebuild)
// -------------------------------------------------------------------------
function render() {
  if (!container) return;
  var ss = sharedState.get();
  var data = buildColaData();

  // Clean up previous graph objects
  if (currentRoot) {
    graphGroup.remove(currentRoot);
    currentNodeMeshes.forEach(function (m) {
      m.geometry.dispose();
      m.material.dispose();
    });
    currentLabels.forEach(function (s) {
      s.material.map.dispose();
      s.material.dispose();
    });
    currentEdges.forEach(function (e) {
      e.geometry.dispose();
      e.material.dispose();
    });
    currentHighlights.forEach(function (h) {
      h.geometry.dispose();
      h.material.dispose();
    });
    currentWireframes.forEach(function (w) {
      w.geometry.dispose();
      w.material.dispose();
    });
  }

  currentRoot = new THREE.Object3D();
  graphGroup.add(currentRoot);
  currentNodeMeshes = [];
  currentLabels = [];
  currentEdges = [];
  currentHighlights = [];
  currentWireframes = [];
  selectedMeshRef = null;
  originalEmissiveIntensity = null;

  if (data.nodes.length === 0) return;

  // Create Layout3D
  currentLayout = new Layout3D(data.nodes, data.links, config.idealLength);
  if (data.constraints.length > 0) {
    currentLayout.constraints = data.constraints;
  }
  currentLayout.start(10);
  converged = false;
  delta = Infinity;

  // --- Create node meshes ---
  for (var i = 0; i < data.nodes.length; i++) {
    var node = data.nodes[i];
    var colors = ss.colorMap[node.group] || { fill: "#e0e0e0", border: "#999" };
    var fillInt = hexToInt(ss.nodeOverrides[node.name] || colors.fill);

    var geometry, mesh;
    if (node.isCollapsed) {
      geometry = new THREE.DodecahedronGeometry(1.8);
    } else {
      var radius = node.nodeRole === "root" ? 1.5 : (node.nodeRole === "leaf" ? 0.8 : 1.0);
      geometry = new THREE.SphereGeometry(radius, 16, 12);
    }
    mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: fillInt, emissive: fillInt, emissiveIntensity: 0.85 }));
    mesh.userData = { index: i, node: node };
    currentRoot.add(mesh);
    currentNodeMeshes.push(mesh);

    // Wireframe overlay for face edge definition
    var wfGeo = new THREE.WireframeGeometry(geometry);
    var borderInt = hexToInt(colors.border);
    var wfMat = new THREE.LineBasicMaterial({ color: borderInt, opacity: 0.4, transparent: true, linewidth: 2 });
    var wireframe = new THREE.LineSegments(wfGeo, wfMat);
    wireframe.userData = { followIndex: i };
    mesh.add(wireframe);
    currentWireframes.push(wireframe);

    // Wireframe halo for root nodes
    if (node.nodeRole === "root" && !node.isCollapsed) {
      var hlGeo = new THREE.SphereGeometry(radius * 1.8);
      var hlMat = new THREE.MeshBasicMaterial({
        color: hexToInt(colors.border),
        wireframe: true,
        opacity: 0.35,
        transparent: true,
      });
      var hlMesh = new THREE.Mesh(hlGeo, hlMat);
      hlMesh.userData = { followIndex: i };
      currentRoot.add(hlMesh);
      currentHighlights.push(hlMesh);
    }

    // Label sprite
    var label = createTextSprite(node.name, {
      color: "#000000",
      bold: node.nodeRole === "root" || node.isCollapsed,
    });
    currentRoot.add(label);
    currentLabels.push(label);
  }

  // --- Create edge tubes ---
  var tubeGeo = new THREE.CylinderGeometry(0.15, 0.15, 1, 4, 1);
  tubeGeo.translate(0, 0.5, 0);
  tubeGeo.rotateX(Math.PI / 2);

  data.links.forEach(function (link) {
    var colorIdx = ss.edgeColorMode === "source" ? link.source : link.target;
    var colorNode = data.nodes[colorIdx];
    var edgeColor = 0xcfcfcf;
    if (colorNode) {
      var c = ss.colorMap[colorNode.group];
      if (c) edgeColor = hexToInt(c.border);
    }

    var material = new THREE.MeshBasicMaterial({
      color: edgeColor,
      opacity: 0.5,
      transparent: true,
    });
    var edgeMesh = new THREE.Mesh(tubeGeo.clone(), material);
    edgeMesh.userData = { source: link.source, target: link.target };
    currentRoot.add(edgeMesh);
    currentEdges.push(edgeMesh);
  });

  updatePositions();
  zoomToFit();

  // Re-apply selection if any
  applySelection(ss.selectedNode);
}

// -------------------------------------------------------------------------
// Animation loop
// -------------------------------------------------------------------------
function animate() {
  if (!running) return;
  animationId = requestAnimationFrame(animate);

  // Mouse rotation
  xAngle += mouse.dx / 100;
  yAngle += mouse.dy / 100;
  mouse.dx = 0;
  mouse.dy = 0;
  graphGroup.rotation.set(yAngle, xAngle, 0);

  // Mouse pan
  if (mouse.panX !== 0 || mouse.panY !== 0) {
    var panScale = camera.position.z / 1000;
    camera.position.x -= mouse.panX * panScale;
    camera.position.y += mouse.panY * panScale;
    mouse.panX = 0;
    mouse.panY = 0;
  }

  // Physics tick
  if (!converged && currentLayout) {
    var s = currentLayout.tick();
    if (s !== 0 && Math.abs(Math.abs(delta / s) - 1) > 1e-7) {
      delta = s;
      updatePositions();
    } else {
      converged = true;
    }
  }

  // Label sizing
  for (var li = 0; li < currentLabels.length; li++) {
    var lbl = currentLabels[li];
    lbl.getWorldPosition(_labelWorldPos);
    var labelDist = camera.position.distanceTo(_labelWorldPos);
    var globalDist = camera.position.length();
    var dist = globalDist + (labelDist - globalDist) * LABEL_DEPTH_DAMPING;
    var apparentRatio = LABEL_REF_DISTANCE / dist;

    var depthCompensation = Math.max(1, 1 + (labelDist / globalDist - 1) * (1 - LABEL_DEPTH_DAMPING));

    var scaleFactor = depthCompensation;
    if (apparentRatio > LABEL_MAX_APPARENT) {
      scaleFactor = LABEL_MAX_APPARENT / apparentRatio;
    } else if (apparentRatio < LABEL_MIN_APPARENT) {
      scaleFactor = LABEL_MIN_APPARENT / apparentRatio;
    }

    lbl.scale.set(
      lbl.userData.baseScaleX * scaleFactor,
      lbl.userData.baseScaleY * scaleFactor,
      1
    );

    if (apparentRatio < LABEL_FADE_APPARENT) {
      var t = apparentRatio / LABEL_FADE_APPARENT;
      lbl.material.opacity = Math.max(0, t);
    } else {
      lbl.material.opacity = 1;
    }
  }

  threeRenderer.render(scene, camera);
}

function start() {
  if (running) return;
  running = true;
  animate();
}

function stop() {
  running = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

// -------------------------------------------------------------------------
// Click-to-select (single click via raycasting)
// -------------------------------------------------------------------------
function handleSelectAt(clientX, clientY) {
  var rect = threeRenderer.domElement.getBoundingClientRect();
  mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);

  var intersects = raycaster.intersectObjects(currentNodeMeshes, false);
  var ss = sharedState.get();
  if (intersects.length > 0) {
    var nodeData = intersects[0].object.userData.node;
    var newSel = (ss.selectedNode === nodeData.name) ? null : nodeData.name;
    sharedState.update({ selectedNode: newSel }, "3d");
    applySelection(newSel);
  } else {
    if (ss.selectedNode !== null) {
      sharedState.update({ selectedNode: null }, "3d");
      applySelection(null);
    }
  }
}

function handleDblClickAt(clientX, clientY) {
  var rect = threeRenderer.domElement.getBoundingClientRect();
  mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);

  var intersects = raycaster.intersectObjects(currentNodeMeshes, false);
  if (intersects.length > 0) {
    var nodeData = intersects[0].object.userData.node;
    var ss = sharedState.get();
    var newCollapsed = deepCopy(ss.collapsed);
    newCollapsed[nodeData.group] = !newCollapsed[nodeData.group];
    sharedState.update({ collapsed: newCollapsed }, "3d");
    render();
  }
}

function setupClickSelection() {
  var clickStartTime = 0;
  var clickStartX = 0;
  var clickStartY = 0;

  threeRenderer.domElement.addEventListener("mousedown", function (e) {
    clickStartTime = Date.now();
    clickStartX = e.clientX;
    clickStartY = e.clientY;
  });

  threeRenderer.domElement.addEventListener("mouseup", function (e) {
    // Only treat as click if short duration and minimal movement
    if (Date.now() - clickStartTime > 200) return;
    var dx = e.clientX - clickStartX;
    var dy = e.clientY - clickStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) return;
    handleSelectAt(e.clientX, e.clientY);
  });

  // Touch tap & double-tap
  var lastTapTime = 0;
  var tapStartX = 0;
  var tapStartY = 0;
  var tapStartTime = 0;
  var doubleTapTimeout = null;

  threeRenderer.domElement.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    tapStartX = e.touches[0].clientX;
    tapStartY = e.touches[0].clientY;
    tapStartTime = Date.now();
  });

  threeRenderer.domElement.addEventListener("touchend", function (e) {
    if (e.changedTouches.length !== 1 || e.touches.length !== 0) return;
    var touch = e.changedTouches[0];
    var elapsed = Date.now() - tapStartTime;
    if (elapsed > 300) return;
    var dx = touch.clientX - tapStartX;
    var dy = touch.clientY - tapStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;

    var now = Date.now();
    if (now - lastTapTime < 350) {
      // Double-tap
      clearTimeout(doubleTapTimeout);
      lastTapTime = 0;
      handleDblClickAt(touch.clientX, touch.clientY);
    } else {
      // Possible single tap — delay to rule out double-tap
      lastTapTime = now;
      var tx = touch.clientX;
      var ty = touch.clientY;
      doubleTapTimeout = setTimeout(function () {
        handleSelectAt(tx, ty);
      }, 350);
    }
  });
}

// -------------------------------------------------------------------------
// Double-click to toggle collapse
// -------------------------------------------------------------------------
function setupDblClick() {
  threeRenderer.domElement.addEventListener("dblclick", function (e) {
    handleDblClickAt(e.clientX, e.clientY);
  });
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
  render();
  if (changedKeys.indexOf("selectedNode") >= 0) {
    applySelection(sharedState.get().selectedNode);
  }
}

// -------------------------------------------------------------------------
// Resize
// -------------------------------------------------------------------------
function onResize() {
  if (!container || !camera || !threeRenderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  threeRenderer.setSize(container.clientWidth, container.clientHeight);
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------
var Renderer3D = {
  init: function (containerEl, gd, ss) {
    container = containerEl;
    graphData = gd;
    sharedState = ss;
    config = deepCopy(CONFIG_DEFAULTS);

    // Three.js setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa);

    camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    );
    camera.position.z = 300;

    threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    threeRenderer.setPixelRatio(window.devicePixelRatio);
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(threeRenderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0x333333));
    var dirLight1 = new THREE.DirectionalLight(0xffffff, 0.25);
    dirLight1.position.set(1, 1, 1).normalize();
    scene.add(dirLight1);
    var dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-1, -1, -1).normalize();
    scene.add(dirLight2);

    graphGroup = new THREE.Object3D();
    scene.add(graphGroup);

    // Mouse interaction
    mouse = setupMouseInteraction(threeRenderer.domElement);
    raycaster = new THREE.Raycaster();
    mouseVec = new THREE.Vector2();

    setupClickSelection();
    setupDblClick();

    // Keyboard shortcut: r to recenter
    window.addEventListener("keydown", function (e) {
      if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only respond if 3D is visible
        if (container.offsetParent !== null) {
          resetView();
        }
      }
    });

    render();
    start();

    sharedState.subscribe("3d", onSharedStateChange);
    window.addEventListener("resize", onResize);
  },
  render: render,
  recolor: recolor,
  resetView: resetView,
  start: start,
  stop: stop,
  onResize: onResize,
  getConfig: function () { return config; },
  getConfigDefaults: function () { return CONFIG_DEFAULTS; },
  setConfig: function (newConfig) { config = newConfig; },
};

export default Renderer3D;

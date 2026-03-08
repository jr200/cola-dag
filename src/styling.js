// ---------------------------------------------------------------------------
// Colour palette, group colour assignment, and text measurement utilities.
// ---------------------------------------------------------------------------

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = l - c / 2;
  var r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function generatePalette(count, hueOffset) {
  var palette = [];
  var goldenAngle = 137.508;
  var offset = hueOffset || 0;
  for (var i = 0; i < count; i++) {
    var hue = (offset + i * goldenAngle) % 360;
    palette.push({
      fill: hslToHex(hue, 75, 72),
      border: hslToHex(hue, 80, 35),
    });
  }
  return palette;
}

export function assignGroupColors(groups, fixedColors, hueOffset) {
  var groupNames = Object.keys(groups).sort();
  var palette = generatePalette(groupNames.length, hueOffset || 0);
  var colorMap = {};
  for (var i = 0; i < groupNames.length; i++) {
    var g = groupNames[i];
    var fixed = fixedColors[g] || {};
    colorMap[g] = {
      fill: fixed.fill || groups[g].fillColor || palette[i].fill,
      border: fixed.edge || groups[g].edgeColor || palette[i].border,
    };
  }
  return colorMap;
}

// ---------------------------------------------------------------------------
// Convert hex colour string (e.g. "#abc123") to integer for Three.js
// ---------------------------------------------------------------------------
export function hexToInt(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

// ---------------------------------------------------------------------------
// Measure text width using a temporary SVG element
// ---------------------------------------------------------------------------
var _measureSvg = null;
export function measureText(text, fontSize) {
  if (!_measureSvg) {
    _measureSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    _measureSvg.style.position = "absolute";
    _measureSvg.style.visibility = "hidden";
    document.body.appendChild(_measureSvg);
  }
  var t = document.createElementNS("http://www.w3.org/2000/svg", "text");
  t.setAttribute("font-family", "monospace");
  t.setAttribute("font-size", fontSize + "px");
  t.textContent = text;
  _measureSvg.appendChild(t);
  var w = t.getComputedTextLength();
  _measureSvg.removeChild(t);
  return w;
}

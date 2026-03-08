// Vite plugin: graph API endpoints with SSE broadcast.
//   GET  /api/graph-events   — SSE stream for live graph & color updates
//   POST /api/graph-dot      — push new DOT text, broadcast to SSE clients
//   GET  /api/graph-dot      — export current DAG as DOT (?styled=true for colours)
//   GET  /api/graph-colors   — current colour state as JSON [{node, color}]
//   POST /api/graph-colors   — apply partial colour updates, broadcast via SSE
//   GET  /api/docs           — interactive API docs (RapiDoc)
//   GET  /api/docs/openapi.json — OpenAPI 3.0 spec

import fs from "node:fs";
import path from "node:path";
import graphlibDot from "@dagrejs/graphlib-dot";
import { parseDot } from "./src/dot-parser.js";
import { assignGroupColors } from "./src/styling.js";

export default function graphApiPlugin() {
  var clients = new Set();
  var projectRoot = ".";

  // -----------------------------------------------------------------------
  // Server-side graph state
  // -----------------------------------------------------------------------
  var serverState = {
    dotText: null,
    spec: null,
    colorMap: null,
    nodeOverrides: {},
  };

  function initializeState(dotText) {
    serverState.dotText = dotText;
    serverState.spec = parseDot(dotText);
    serverState.colorMap = assignGroupColors(
      serverState.spec.groups,
      serverState.spec.fixedColors
    );
    serverState.nodeOverrides = {};
  }

  function ensureState() {
    if (serverState.dotText !== null) return true;
    var defaultPath = path.join(projectRoot, "public", "default.dot");
    try {
      var text = fs.readFileSync(defaultPath, "utf-8");
      initializeState(text);
      return true;
    } catch (_e) {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // DOT export
  // -----------------------------------------------------------------------
  function exportDot(styled) {
    var dotText = serverState.dotText;
    if (!styled) return dotText;

    // Re-parse into a fresh graphlib digraph so we can inject attributes
    var graph = graphlibDot.read(dotText);
    var spec = serverState.spec;
    var colorMap = serverState.colorMap;
    var nodeOverrides = serverState.nodeOverrides;

    // Build nodeId-to-label map (same logic as dot-parser)
    var idToLabel = {};
    graph.nodes().forEach(function (dotId) {
      var children = graph.children(dotId);
      if (children.length > 0) return; // subgraph, skip
      var attrs = graph.node(dotId) || {};
      idToLabel[dotId] = attrs.label || dotId.replace(/_/g, "-");
    });

    // Set subgraph (group) colours
    graph.nodes().forEach(function (dotId) {
      var children = graph.children(dotId);
      if (children.length === 0) return;
      var sgAttrs = graph.node(dotId) || {};
      var groupLabel =
        sgAttrs.label || dotId.replace(/^cluster_/, "").replace(/_/g, "-");
      var colors = colorMap[groupLabel];
      if (colors) {
        sgAttrs.fillcolor = colors.fill;
        sgAttrs.color = colors.border;
        sgAttrs.style = "filled";
        graph.setNode(dotId, sgAttrs);
      }
    });

    // Set per-node overrides
    graph.nodes().forEach(function (dotId) {
      if (graph.children(dotId).length > 0) return;
      var label = idToLabel[dotId];
      if (label && nodeOverrides[label]) {
        var attrs = graph.node(dotId) || {};
        attrs.fillcolor = nodeOverrides[label];
        attrs.style = "filled";
        graph.setNode(dotId, attrs);
      }
    });

    // Set edge colours based on target group
    graph.edges().forEach(function (edge) {
      var targetLabel = idToLabel[edge.w];
      if (!targetLabel) return;
      var targetGroup = null;
      spec.nodes.forEach(function (n) {
        if (n.id === targetLabel) targetGroup = n.group;
      });
      if (targetGroup && colorMap[targetGroup]) {
        var edgeAttrs = graph.edge(edge) || {};
        edgeAttrs.color = colorMap[targetGroup].border;
        graph.setEdge(edge.v, edge.w, edgeAttrs);
      }
    });

    return graphlibDot.write(graph);
  }

  // -----------------------------------------------------------------------
  // Colour state helpers
  // -----------------------------------------------------------------------
  function buildColorResponse() {
    var spec = serverState.spec;
    var colorMap = serverState.colorMap;
    var nodeOverrides = serverState.nodeOverrides;
    var result = [];

    // Group entries
    Object.keys(spec.groups).sort().forEach(function (g) {
      var colors = colorMap[g] || { fill: "#e0e0e0" };
      result.push({ node: g, color: colors.fill });
    });

    // Node entries
    spec.nodes.forEach(function (n) {
      var fill;
      if (nodeOverrides[n.id]) {
        fill = nodeOverrides[n.id];
      } else {
        var groupColors = colorMap[n.group] || { fill: "#e0e0e0" };
        fill = groupColors.fill;
      }
      result.push({ node: n.id, color: fill });
    });

    return result;
  }

  function applyColorEntries(entries) {
    var spec = serverState.spec;
    var groupNames = Object.keys(spec.groups);
    var nodeIds = {};
    spec.nodes.forEach(function (n) { nodeIds[n.id] = n.group; });

    entries.forEach(function (entry) {
      var name = entry.node;
      var color = entry.color;
      if (!name || !color) return;

      if (groupNames.indexOf(name) >= 0) {
        // Update group colour
        if (!serverState.colorMap[name]) {
          serverState.colorMap[name] = { fill: color, border: color };
        } else {
          serverState.colorMap[name].fill = color;
        }
        // Clear per-node overrides for nodes in this group
        spec.nodes.forEach(function (n) {
          if (n.group === name && serverState.nodeOverrides[n.id]) {
            delete serverState.nodeOverrides[n.id];
          }
        });
      } else if (nodeIds[name] !== undefined) {
        // Individual node override
        serverState.nodeOverrides[name] = color;
      }
    });
  }

  function broadcastColorUpdate() {
    var payload = "event: color-update\ndata: " +
      JSON.stringify({
        colorMap: serverState.colorMap,
        nodeOverrides: serverState.nodeOverrides,
      }) + "\n\n";
    clients.forEach(function (client) { client.write(payload); });
  }

  // -----------------------------------------------------------------------
  // API docs (RapiDoc via CDN — zero dependencies)
  // -----------------------------------------------------------------------
  var docsHtml = [
    "<!doctype html><html><head>",
    "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>Cola-DAG API Docs</title>",
    "<script type=\"module\" src=\"https://unpkg.com/rapidoc/dist/rapidoc-min.js\"></script>",
    "</head><body>",
    "<rapi-doc spec-url=\"/api/docs/openapi.json\"",
    "  theme=\"dark\" render-style=\"read\" show-header=\"false\"",
    "  allow-try=\"true\" schema-style=\"table\"></rapi-doc>",
    "</body></html>",
  ].join("\n");

  // -----------------------------------------------------------------------
  // Plugin definition
  // -----------------------------------------------------------------------
  return {
    name: "graph-api",
    configureServer(server) {
      projectRoot = server.config.root || ".";

      server.middlewares.use(function (req, res, next) {
        var parsedUrl = new URL(req.url, "http://localhost");

        // --- API docs ---
        if (req.method === "GET" && req.url === "/api/docs") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(docsHtml);
          return;
        }
        if (req.method === "GET" && req.url === "/api/docs/openapi.json") {
          var specPath = path.join(projectRoot, "openapi.json");
          var specText = fs.readFileSync(specPath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(specText);
          return;
        }

        // --- SSE stream ---
        if (req.method === "GET" && req.url === "/api/graph-events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          res.write(":ok\n\n");
          clients.add(res);
          req.on("close", function () { clients.delete(res); });
          return;
        }

        // --- Push new DOT graph ---
        if (req.method === "POST" && parsedUrl.pathname === "/api/graph-dot") {
          var body = "";
          req.on("data", function (chunk) { body += chunk; });
          req.on("end", function () {
            if (!body.trim()) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "empty body" }));
              return;
            }
            try { initializeState(body); } catch (_e) { /* parse may fail */ }
            var payload = "data: " + JSON.stringify(body) + "\n\n";
            clients.forEach(function (client) { client.write(payload); });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        // --- Export DAG as DOT (optionally load from base64 ?dot= param) ---
        if (req.method === "GET" && parsedUrl.pathname === "/api/graph-dot") {
          var dotParam = parsedUrl.searchParams.get("dot");
          if (dotParam) {
            var dotText;
            try { dotText = Buffer.from(dotParam, "base64").toString("utf-8"); } catch (_e) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "invalid base64" }));
              return;
            }
            try { initializeState(dotText); } catch (_e) { /* parse may fail */ }
            var payload = "data: " + JSON.stringify(dotText) + "\n\n";
            clients.forEach(function (client) { client.write(payload); });
          } else if (!ensureState()) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "no graph loaded" }));
            return;
          }
          var styled = parsedUrl.searchParams.get("styled") === "true";
          var dotOutput = exportDot(styled);
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(dotOutput);
          return;
        }

        // --- Get colour state ---
        if (req.method === "GET" && parsedUrl.pathname === "/api/graph-colors") {
          if (!ensureState()) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "no graph loaded" }));
            return;
          }
          var result = buildColorResponse();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
          return;
        }

        // --- Set colour state (partial) ---
        if (req.method === "POST" && parsedUrl.pathname === "/api/graph-colors") {
          var colorBody = "";
          req.on("data", function (chunk) { colorBody += chunk; });
          req.on("end", function () {
            if (!ensureState()) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "no graph loaded" }));
              return;
            }
            var entries;
            try {
              entries = JSON.parse(colorBody);
            } catch (_e) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "invalid JSON" }));
              return;
            }
            if (!Array.isArray(entries)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "expected array" }));
              return;
            }

            applyColorEntries(entries);
            broadcastColorUpdate();

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        next();
      });
    },
  };
}

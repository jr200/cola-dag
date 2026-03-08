// Production server for cola-dag.
// Serves the Vite-built static assets from dist/ and wires up the
// graph API middleware (SSE, DOT import/export, colour state).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import graphApiPlugin from "./vite-plugin-graph-api.js";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var DIST = path.join(__dirname, "dist");
var PORT = parseInt(process.env.PORT || "3000", 10);

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".dot": "text/plain; charset=utf-8",
  ".gv": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Wire up the graph API plugin as connect-style middleware.
var plugin = graphApiPlugin();
var apiHandlers = [];
plugin.configureServer({
  config: { root: __dirname },
  middlewares: { use: function (fn) { apiHandlers.push(fn); } },
});

function serveStatic(req, res) {
  var pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname
  );
  var filePath = path.join(DIST, pathname);
  if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");

  // Prevent path traversal
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    var stat = fs.statSync(filePath);
    if (stat.isFile()) {
      var ext = path.extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  } catch (_) {
    // fall through to SPA fallback
  }

  // SPA fallback — serve index.html for unmatched routes
  var indexPath = path.join(DIST, "index.html");
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(indexPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
}

var server = http.createServer(function (req, res) {
  var i = 0;
  function next() {
    if (i < apiHandlers.length) {
      apiHandlers[i++](req, res, next);
    } else {
      serveStatic(req, res);
    }
  }
  next();
});

server.listen(PORT, "0.0.0.0", function () {
  console.log("cola-dag listening on port " + PORT);
});

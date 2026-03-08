import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var server;
var baseUrl;

beforeAll(async function () {
  server = await createServer({
    configFile: path.resolve(__dirname, "../vite.config.js"),
    server: { port: 0 },
    logLevel: "silent",
  });
  await server.listen();
  var addr = server.httpServer.address();
  baseUrl = "http://localhost:" + addr.port;
}, 15000);

afterAll(async function () {
  if (server) await server.close();
});

// -------------------------------------------------------------------------
// GET /api/graph-dot
// -------------------------------------------------------------------------
describe("GET /api/graph-dot", function () {
  it("returns DOT text", async function () {
    var res = await fetch(baseUrl + "/api/graph-dot");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    var text = await res.text();
    expect(text).toContain("digraph");
    expect(text).toContain("cluster_A");
  });

  it("unstyled output has no fillcolor attributes", async function () {
    var res = await fetch(baseUrl + "/api/graph-dot");
    var text = await res.text();
    expect(text).not.toContain("fillcolor=");
  });

  it("styled output includes fillcolor and style=filled", async function () {
    var res = await fetch(baseUrl + "/api/graph-dot?styled=true");
    var text = await res.text();
    expect(text).toContain("fillcolor=");
    expect(text).toContain("style=filled");
  });

  it("styled output includes edge colour attributes", async function () {
    var res = await fetch(baseUrl + "/api/graph-dot?styled=true");
    var text = await res.text();
    // Edges should have color attribute
    expect(text).toMatch(/-> .+\[.*color=/);
  });
});

// -------------------------------------------------------------------------
// GET /api/graph-colors
// -------------------------------------------------------------------------
describe("GET /api/graph-colors", function () {
  it("returns a JSON array", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    var body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("each entry has node and color fields", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors");
    var body = await res.json();
    body.forEach(function (entry) {
      expect(entry).toHaveProperty("node");
      expect(entry).toHaveProperty("color");
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it("includes both groups and child nodes", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors");
    var body = await res.json();
    var names = body.map(function (e) { return e.node; });
    // Groups
    expect(names).toContain("subgraph_A");
    expect(names).toContain("subgraph_B");
    // Child nodes
    expect(names).toContain("child_a1");
    expect(names).toContain("child_b1");
  });

  it("child nodes inherit their group colour", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors");
    var body = await res.json();
    var byName = {};
    body.forEach(function (e) { byName[e.node] = e.color; });
    expect(byName["child_a1"]).toBe(byName["subgraph_A"]);
    expect(byName["child_a2"]).toBe(byName["subgraph_A"]);
  });
});

// -------------------------------------------------------------------------
// POST /api/graph-colors
// -------------------------------------------------------------------------
describe("POST /api/graph-colors", function () {
  it("returns ok on valid input", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "subgraph_A", color: "#ff0000" }]),
    });
    expect(res.status).toBe(200);
    var body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("updates group colour and all its children", async function () {
    await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "subgraph_B", color: "#00ff00" }]),
    });
    var res = await fetch(baseUrl + "/api/graph-colors");
    var body = await res.json();
    var byName = {};
    body.forEach(function (e) { byName[e.node] = e.color; });
    expect(byName["subgraph_B"]).toBe("#00ff00");
    expect(byName["child_b1"]).toBe("#00ff00");
    expect(byName["child_b2"]).toBe("#00ff00");
  });

  it("sets per-node override without affecting siblings", async function () {
    // First set group colour
    await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "subgraph_A", color: "#aaaaaa" }]),
    });
    // Then override a single child
    await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "child_a1", color: "#111111" }]),
    });
    var res = await fetch(baseUrl + "/api/graph-colors");
    var body = await res.json();
    var byName = {};
    body.forEach(function (e) { byName[e.node] = e.color; });
    expect(byName["child_a1"]).toBe("#111111");
    expect(byName["child_a2"]).toBe("#aaaaaa");
  });

  it("group colour update clears per-node overrides in that group", async function () {
    // Set a per-node override
    await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "child_a1", color: "#111111" }]),
    });
    // Now set group colour — should clear the override
    await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "subgraph_A", color: "#bbbbbb" }]),
    });
    var res = await fetch(baseUrl + "/api/graph-colors");
    var body = await res.json();
    var byName = {};
    body.forEach(function (e) { byName[e.node] = e.color; });
    expect(byName["child_a1"]).toBe("#bbbbbb");
  });

  it("partial update does not affect unmentioned groups", async function () {
    // Get current state
    var before = await (await fetch(baseUrl + "/api/graph-colors")).json();
    var beforeByName = {};
    before.forEach(function (e) { beforeByName[e.node] = e.color; });

    // Update only subgraph_C
    await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "subgraph_C", color: "#cccccc" }]),
    });

    var after = await (await fetch(baseUrl + "/api/graph-colors")).json();
    var afterByName = {};
    after.forEach(function (e) { afterByName[e.node] = e.color; });

    // subgraph_C changed
    expect(afterByName["subgraph_C"]).toBe("#cccccc");
    // Other groups unchanged
    expect(afterByName["subgraph_D"]).toBe(beforeByName["subgraph_D"]);
    expect(afterByName["subgraph_E"]).toBe(beforeByName["subgraph_E"]);
  });

  it("unknown node names are silently ignored", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "nonexistent", color: "#ffffff" }]),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects invalid JSON with 400", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    var body = await res.json();
    expect(body.error).toBe("invalid JSON");
  });

  it("rejects non-array JSON with 400", async function () {
    var res = await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node: "a", color: "#fff" }),
    });
    expect(res.status).toBe(400);
    var body = await res.json();
    expect(body.error).toBe("expected array");
  });

  it("styled DOT reflects colour changes from POST", async function () {
    await fetch(baseUrl + "/api/graph-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ node: "subgraph_A", color: "#123456" }]),
    });
    var res = await fetch(baseUrl + "/api/graph-dot?styled=true");
    var text = await res.text();
    expect(text).toContain("#123456");
  });
});

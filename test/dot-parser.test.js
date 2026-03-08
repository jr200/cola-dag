import { describe, it, expect } from "vitest";
import { parseDot } from "../src/dot-parser.js";

var SIMPLE_DOT = [
  "digraph G {",
  "  subgraph cluster_X {",
  '    label="group-X";',
  '    fillcolor="#ff0000";',
  '    color="#880000";',
  '    n1 [label="node-1"];',
  '    n2 [label="node-2"];',
  "  }",
  "  subgraph cluster_Y {",
  '    label="group-Y";',
  '    n3 [label="node-3"];',
  "  }",
  "  n1 -> n3;",
  "  n2 -> n3;",
  "}",
].join("\n");

describe("parseDot", function () {
  it("extracts nodes with group assignments", function () {
    var spec = parseDot(SIMPLE_DOT);
    expect(spec.nodes).toEqual(
      expect.arrayContaining([
        { id: "node-1", group: "group-X" },
        { id: "node-2", group: "group-X" },
        { id: "node-3", group: "group-Y" },
      ])
    );
    expect(spec.nodes).toHaveLength(3);
  });

  it("extracts edges using resolved labels", function () {
    var spec = parseDot(SIMPLE_DOT);
    expect(spec.edges).toEqual(
      expect.arrayContaining([
        { from: "node-1", to: "node-3" },
        { from: "node-2", to: "node-3" },
      ])
    );
    expect(spec.edges).toHaveLength(2);
  });

  it("extracts groups with optional fill and edge colours", function () {
    var spec = parseDot(SIMPLE_DOT);
    expect(spec.groups["group-X"]).toEqual({
      fillColor: "#ff0000",
      edgeColor: "#880000",
    });
    expect(spec.groups["group-Y"]).toEqual({
      fillColor: null,
      edgeColor: null,
    });
  });

  it("computes group roles (root / leaf)", function () {
    var spec = parseDot(SIMPLE_DOT);
    expect(spec.groupRoles["group-X"]).toBe("root");
    expect(spec.groupRoles["group-Y"]).toBe("leaf");
  });

  it("populates fixedColors from DOT attributes", function () {
    var spec = parseDot(SIMPLE_DOT);
    expect(spec.fixedColors["group-X"]).toEqual({
      fill: "#ff0000",
      edge: "#880000",
    });
    expect(spec.fixedColors["group-Y"]).toEqual({
      fill: null,
      edge: null,
    });
  });

  it("assigns _external group to ungrouped nodes", function () {
    var dot = 'digraph { standalone [label="solo"]; }';
    var spec = parseDot(dot);
    var node = spec.nodes.find(function (n) { return n.id === "solo"; });
    expect(node.group).toBe("_external");
  });

  it("derives label from dotId when label attribute is absent", function () {
    var dot = "digraph { my_node; }";
    var spec = parseDot(dot);
    var node = spec.nodes.find(function (n) { return n.id === "my-node"; });
    expect(node).toBeDefined();
  });
});

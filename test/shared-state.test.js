import { describe, it, expect, beforeEach } from "vitest";
import SharedState from "../src/shared-state.js";

describe("SharedState", function () {
  beforeEach(function () {
    SharedState.init(
      { groupA: true },
      { groupA: { fill: "#aaa", border: "#bbb" } },
      0,
      {}
    );
  });

  it("init sets all state fields", function () {
    var s = SharedState.get();
    expect(s.collapsed).toEqual({ groupA: true });
    expect(s.colorMap).toEqual({ groupA: { fill: "#aaa", border: "#bbb" } });
    expect(s.nodeOverrides).toEqual({});
    expect(s.selectedDagIndex).toBe(0);
    expect(s.selectedNode).toBeNull();
  });

  it("init defaults nodeOverrides to empty when omitted", function () {
    SharedState.init({ groupA: false }, {}, 1);
    var s = SharedState.get();
    expect(s.nodeOverrides).toEqual({});
  });

  it("update merges partial state", function () {
    SharedState.update({ selectedNode: "n1" }, "test");
    expect(SharedState.get().selectedNode).toBe("n1");
    expect(SharedState.get().collapsed).toEqual({ groupA: true });
  });

  it("update notifies subscribers except the source", function () {
    var received = [];
    SharedState.subscribe("sub-a", function (changes, keys) {
      received.push({ source: "sub-a", keys: keys });
    });
    SharedState.subscribe("sub-b", function (changes, keys) {
      received.push({ source: "sub-b", keys: keys });
    });

    SharedState.update({ selectedNode: "n1" }, "sub-a");

    // sub-a should NOT have been notified (it's the source)
    expect(received).toHaveLength(1);
    expect(received[0].source).toBe("sub-b");
    expect(received[0].keys).toEqual(["selectedNode"]);
  });

  it("update with nodeOverrides is reflected in state", function () {
    SharedState.update(
      { nodeOverrides: { "node-1": "#ff0000" } },
      "test"
    );
    expect(SharedState.get().nodeOverrides).toEqual({ "node-1": "#ff0000" });
  });

  it("update with colorMap and nodeOverrides reports both keys", function () {
    var receivedKeys = null;
    SharedState.subscribe("listener", function (changes, keys) {
      receivedKeys = keys;
    });

    SharedState.update(
      {
        colorMap: { groupA: { fill: "#ccc", border: "#ddd" } },
        nodeOverrides: { "node-1": "#eee" },
      },
      "other"
    );

    expect(receivedKeys).toEqual(
      expect.arrayContaining(["colorMap", "nodeOverrides"])
    );
  });

  it("unsubscribe stops notifications", function () {
    var count = 0;
    var unsub = SharedState.subscribe("listener", function () { count++; });

    SharedState.update({ selectedNode: "a" }, "x");
    expect(count).toBe(1);

    unsub();
    SharedState.update({ selectedNode: "b" }, "x");
    expect(count).toBe(1);
  });
});

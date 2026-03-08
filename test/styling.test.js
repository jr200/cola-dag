import { describe, it, expect } from "vitest";
import { assignGroupColors } from "../src/styling.js";

describe("assignGroupColors", function () {
  var groups = {
    alpha: { fillColor: null, edgeColor: null },
    beta: { fillColor: null, edgeColor: null },
  };

  it("returns a colour entry for every group", function () {
    var colorMap = assignGroupColors(groups, {});
    expect(Object.keys(colorMap).sort()).toEqual(["alpha", "beta"]);
    expect(colorMap.alpha.fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorMap.alpha.border).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("uses fixed colours when provided", function () {
    var fixed = { alpha: { fill: "#111111", edge: "#222222" } };
    var colorMap = assignGroupColors(groups, fixed);
    expect(colorMap.alpha.fill).toBe("#111111");
    expect(colorMap.alpha.border).toBe("#222222");
    // beta still gets a generated colour
    expect(colorMap.beta.fill).not.toBe("#111111");
  });

  it("prefers group metadata colours over palette", function () {
    var groupsWithColor = {
      alpha: { fillColor: "#aaaaaa", edgeColor: "#bbbbbb" },
      beta: { fillColor: null, edgeColor: null },
    };
    var colorMap = assignGroupColors(groupsWithColor, {});
    expect(colorMap.alpha.fill).toBe("#aaaaaa");
    expect(colorMap.alpha.border).toBe("#bbbbbb");
  });

  it("produces different palettes with different hueOffsets", function () {
    var map1 = assignGroupColors(groups, {}, 0);
    var map2 = assignGroupColors(groups, {}, 180);
    expect(map1.alpha.fill).not.toBe(map2.alpha.fill);
  });

  it("generates distinct colours for different groups", function () {
    var colorMap = assignGroupColors(groups, {});
    expect(colorMap.alpha.fill).not.toBe(colorMap.beta.fill);
  });
});

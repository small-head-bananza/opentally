import { describe, expect, it } from "vitest";
import { applyUpdate, MemoryCounters, parseUpdate } from "./tally";

const SITES = new Set(["example-site"]);

describe("parsing an incoming body", () => {
  it("accepts a well-formed first submission and a well-formed correction", () => {
    expect(parseUpdate({ site: "example-site", poll: "p", to: "b" }, SITES)).toEqual({
      site: "example-site",
      poll: "p",
      to: "b",
    });
    expect(
      parseUpdate({ site: "example-site", poll: "p", to: "b", from: "a" }, SITES),
    ).toEqual({ site: "example-site", poll: "p", to: "b", from: "a" });
  });

  it("refuses anything that is not a plain object", () => {
    for (const bad of [null, undefined, "str", 42, true, ["site"]]) {
      expect(parseUpdate(bad, SITES)).toBeNull();
    }
  });

  it("refuses any unknown key — outdated and hostile clients look the same", () => {
    expect(
      parseUpdate({ site: "example-site", poll: "p", to: "b", userId: "x" }, SITES),
    ).toBeNull();
  });

  it("refuses missing or malformed fields", () => {
    expect(parseUpdate({ site: "example-site", poll: "p" }, SITES)).toBeNull();
    expect(parseUpdate({ site: "example-site", poll: "", to: "b" }, SITES)).toBeNull();
    expect(parseUpdate({ site: "example-site", poll: 3, to: "b" }, SITES)).toBeNull();
    expect(
      parseUpdate({ site: "example-site", poll: "p", to: "x".repeat(201) }, SITES),
    ).toBeNull();
  });

  it("refuses control, invisible and direction-override characters", () => {
    for (const bad of [
      "a\u0000b", // C0 control
      "a\u0085b", // C1 control — would mint a second row rendering like "ab"
      "a​b", // zero-width space — likewise invisible
      "a‮b", // right-to-left override — renders deceptively
      "a b", // line separator
      "a﻿b", // byte-order mark
    ]) {
      expect(parseUpdate({ site: "example-site", poll: "p", to: bad }, SITES)).toBeNull();
    }
  });

  it("refuses lone surrogates — JSON allows them, real text never contains them", () => {
    expect(
      parseUpdate({ site: "example-site", poll: "p", to: "\ud800" }, SITES),
    ).toBeNull();
    expect(
      parseUpdate(
        { site: "example-site", poll: "p", to: "b", from: "\udfff" },
        SITES,
      ),
    ).toBeNull();
  });

  it("refuses unknown sites and from === to", () => {
    expect(parseUpdate({ site: "evil", poll: "p", to: "b" }, SITES)).toBeNull();
    expect(
      parseUpdate({ site: "example-site", poll: "p", to: "b", from: "b" }, SITES),
    ).toBeNull();
  });

  it("accepts non-ASCII option ids", () => {
    expect(parseUpdate({ site: "example-site", poll: "p", to: "café" }, SITES)).toEqual({
      site: "example-site",
      poll: "p",
      to: "café",
    });
  });
});

describe("applying updates to the counters", () => {
  it("counts a first submission, and moves the count on a correction", async () => {
    const counters = new MemoryCounters();
    await applyUpdate(counters, { site: "s", poll: "p", to: "alice" });
    expect(counters.get("s", "p", "alice")).toBe(1);
    await applyUpdate(counters, { site: "s", poll: "p", to: "bob", from: "alice" });
    expect(counters.get("s", "p", "alice")).toBe(0);
    expect(counters.get("s", "p", "bob")).toBe(1);
  });

  it("floors at zero: a fabricated 'from' cannot drive a count negative", async () => {
    const counters = new MemoryCounters();
    await applyUpdate(counters, { site: "s", poll: "p", to: "alice" });
    // Hostile corrections away from an option nobody at zero holds.
    await applyUpdate(counters, { site: "s", poll: "p", to: "pad-1", from: "victim" });
    await applyUpdate(counters, { site: "s", poll: "p", to: "pad-2", from: "victim" });
    expect(counters.get("s", "p", "victim")).toBe(0);
    expect(counters.get("s", "p", "alice")).toBe(1);
  });

  it("never creates a row just to decrement it", async () => {
    const counters = new MemoryCounters();
    await applyUpdate(counters, { site: "s", poll: "p", to: "bob", from: "ghost" });
    expect(counters.counts.has("s\u0000p\u0000ghost")).toBe(false);
    expect(counters.get("s", "p", "bob")).toBe(1);
  });
});

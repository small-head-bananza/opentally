import { describe, expect, it } from "vitest";
import { AdapterRegistry, type SiteAdapter } from "./adapter";

function adapterFor(siteId: string, host: string): SiteAdapter {
  return { siteId, matches: (url) => url.hostname === host };
}

describe("the adapter registry", () => {
  it("answers with the one adapter that claims a URL", () => {
    const registry = new AdapterRegistry();
    registry.register(adapterFor("example-awards", "awards.example.com"));
    registry.register(adapterFor("other-site", "other.example.org"));
    const found = registry.adapterFor(new URL("https://awards.example.com/vote"));
    expect(found?.siteId).toBe("example-awards");
  });

  it("answers null for a page nobody claims — the extension stays inert there", () => {
    const registry = new AdapterRegistry();
    registry.register(adapterFor("example-awards", "awards.example.com"));
    expect(registry.adapterFor(new URL("https://unrelated.example.net/"))).toBeNull();
  });

  it("refuses two adapters claiming the same URL rather than guessing", () => {
    const registry = new AdapterRegistry();
    registry.register(adapterFor("one", "awards.example.com"));
    registry.register(adapterFor("two", "awards.example.com"));
    expect(() => registry.adapterFor(new URL("https://awards.example.com/"))).toThrow(
      /ambiguous/,
    );
  });

  it("refuses duplicate site ids", () => {
    const registry = new AdapterRegistry();
    registry.register(adapterFor("example-awards", "a.example.com"));
    expect(() => registry.register(adapterFor("example-awards", "b.example.com"))).toThrow(
      /already registered/,
    );
  });

  it("refuses site ids that are not lowercase-dashed", () => {
    const registry = new AdapterRegistry();
    for (const bad of ["Example", "has space", "-leading", "", "UPPER", "under_score"]) {
      expect(() => registry.register(adapterFor(bad, "x.example.com"))).toThrow(
        /not lowercase-dashed/,
      );
    }
  });
});

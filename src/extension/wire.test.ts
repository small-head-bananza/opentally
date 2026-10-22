import { describe, expect, it } from "vitest";
import type { PageSubmission, SiteAdapter } from "../lib/adapter";
import { RecordingClient, type TallyUpdate } from "../lib/report";
import { MemoryStore } from "../lib/selection";
import { ExtensionStore, type StorageArea } from "./store";
import { attachAdapter, type CrossTabLock } from "./wire";

/** An adapter whose report callback the test can fire by hand. */
function fakeAdapter(): { adapter: SiteAdapter; fire: (s: PageSubmission) => void } {
  let callback: ((s: PageSubmission) => void) | undefined;
  return {
    adapter: {
      siteId: "example-site",
      matches: () => true,
      attach: (_root, report) => {
        callback = report;
      },
    },
    fire: (s) => callback?.(s),
  };
}

/** A lock that records which keys were requested and runs tasks directly. */
function recordingLock(): { lock: CrossTabLock; keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    lock: (key, task) => {
      keys.push(key);
      return task();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const root = {} as ParentNode;

describe("wiring an adapter to the counting rules", () => {
  it("counts a submission with the adapter's site id, under a per-poll lock key", async () => {
    const { adapter, fire } = fakeAdapter();
    const { lock, keys } = recordingLock();
    const client = new RecordingClient();
    attachAdapter(adapter, root, new MemoryStore(), client, lock, () => {});
    fire({ poll: "first-poll", option: "alice" });
    await flush();
    expect(client.sent).toEqual([
      { site: "example-site", poll: "first-poll", to: "alice" },
    ]);
    expect(keys).toEqual(["opentally:example-site:first-poll"]);
  });

  it("serializes a double-click into one count, not two", async () => {
    const { adapter, fire } = fakeAdapter();
    const { lock } = recordingLock();
    const client = new RecordingClient();
    attachAdapter(adapter, root, new MemoryStore(), client, lock, () => {});
    fire({ poll: "first-poll", option: "alice" });
    fire({ poll: "first-poll", option: "alice" }); // double-click, same tick
    await flush();
    expect(client.sent).toHaveLength(1);
  });

  it("serializes two page instances sharing one store through the lock", async () => {
    // Two tabs on the same poll: each has its own attachAdapter (own queue), but
    // they share storage. Only the cross-tab lock keeps their read-then-write
    // sequences from interleaving; this pins that both go through it.
    const shared = new MemoryStore();
    const client = new RecordingClient();
    // A real lock: tasks for the same key run strictly one after another.
    const chains = new Map<string, Promise<void>>();
    const lock: CrossTabLock = (key, task) => {
      const next = (chains.get(key) ?? Promise.resolve()).then(task);
      chains.set(key, next);
      return next;
    };
    const tabOne = fakeAdapter();
    const tabTwo = fakeAdapter();
    attachAdapter(tabOne.adapter, root, shared, client, lock, () => {});
    attachAdapter(tabTwo.adapter, root, shared, client, lock, () => {});
    tabOne.fire({ poll: "first-poll", option: "alice" });
    tabTwo.fire({ poll: "first-poll", option: "alice" }); // same moment, other tab
    await flush();
    expect(client.sent).toHaveLength(1);
  });

  it("loses the count on a failed send and stays consistent afterwards", async () => {
    const { adapter, fire } = fakeAdapter();
    const { lock } = recordingLock();
    const errors: unknown[] = [];
    let failures = 1;
    const sent: TallyUpdate[] = [];
    const flaky = {
      send: (update: TallyUpdate) => {
        if (failures-- > 0) return Promise.reject(new Error("offline"));
        sent.push(update);
        return Promise.resolve();
      },
    };
    attachAdapter(adapter, root, new MemoryStore(), flaky, lock, (e) =>
      errors.push(e),
    );
    fire({ poll: "first-poll", option: "alice" });
    await flush();
    expect(errors).toHaveLength(1);
    // The failed transition was recorded locally, so resubmitting the same option
    // sends nothing — lost, never replayed (rule 3 in selection.ts).
    fire({ poll: "first-poll", option: "alice" });
    await flush();
    expect(sent).toHaveLength(0);
    // A change of mind still sends a correct correction.
    fire({ poll: "first-poll", option: "bob" });
    await flush();
    expect(sent).toEqual([
      { site: "example-site", poll: "first-poll", to: "bob", from: "alice" },
    ]);
  });
});

describe("the extension storage wrapper", () => {
  it("round-trips through an injected storage area and ignores non-strings", async () => {
    const backing = new Map<string, unknown>();
    const area: StorageArea = {
      get: (key) =>
        Promise.resolve(backing.has(key) ? { [key]: backing.get(key) } : {}),
      set: (items) => {
        for (const [k, v] of Object.entries(items)) backing.set(k, v);
        return Promise.resolve();
      },
    };
    const store = new ExtensionStore(area);
    expect(await store.get("k")).toBeUndefined();
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
    backing.set("junk", 42);
    expect(await store.get("junk")).toBeUndefined();
  });
});

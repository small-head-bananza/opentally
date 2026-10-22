import { describe, expect, it } from "vitest";
import { RecordingClient, type TallyClient } from "./report";
import { MemoryStore, recordSubmission } from "./selection";

const submit = (
  store: MemoryStore,
  client: TallyClient,
  option: string,
  poll = "first-poll",
) => recordSubmission(store, client, { site: "example-site", poll, option });

describe("recording a submission", () => {
  it("sends one plain update the first time", async () => {
    const store = new MemoryStore();
    const client = new RecordingClient();
    const update = await submit(store, client, "alice");
    expect(update).toEqual({ site: "example-site", poll: "first-poll", to: "alice" });
    expect(client.sent).toEqual([update]);
  });

  it("sends nothing when the same option is submitted again — one count per poll", async () => {
    const store = new MemoryStore();
    const client = new RecordingClient();
    await submit(store, client, "alice");
    const second = await submit(store, client, "alice");
    expect(second).toBeNull();
    expect(client.sent).toHaveLength(1);
  });

  it("sends a from/to correction when the participant changes their mind", async () => {
    const store = new MemoryStore();
    const client = new RecordingClient();
    await submit(store, client, "alice");
    const change = await submit(store, client, "bob");
    expect(change).toEqual({
      site: "example-site",
      poll: "first-poll",
      to: "bob",
      from: "alice",
    });
    expect(client.sent).toHaveLength(2);
  });

  it("keeps polls independent — same site, different poll, no from", async () => {
    const store = new MemoryStore();
    const client = new RecordingClient();
    await submit(store, client, "alice", "first-poll");
    const other = await submit(store, client, "carol", "second-poll");
    expect(other).toEqual({ site: "example-site", poll: "second-poll", to: "carol" });
  });

  it("loses the count on a failed send rather than ever double-counting", async () => {
    // The record is written BEFORE the send. The server cannot tell a retry from
    // a second vote (no identifier in the payload), so a replay could inflate the
    // tally forever; a lost count merely undercounts. Rule 3 in selection.ts.
    const store = new MemoryStore();
    const failing = {
      send: () => Promise.reject(new Error("network down")),
    };
    await expect(submit(store, failing, "alice")).rejects.toThrow("network down");

    // The record exists, so resubmitting the same option sends NOTHING — the
    // transition is lost, not replayed.
    const client = new RecordingClient();
    const resubmit = await submit(store, client, "alice");
    expect(resubmit).toBeNull();
    expect(client.sent).toHaveLength(0);

    // A later change of mind still sends a correct correction; the server floors
    // the never-counted "from" at zero, so the books heal.
    const change = await submit(store, client, "bob");
    expect(change).toEqual({
      site: "example-site",
      poll: "first-poll",
      to: "bob",
      from: "alice",
    });
  });

  it("refuses empty fields instead of tallying garbage", async () => {
    const store = new MemoryStore();
    const client = new RecordingClient();
    await expect(
      recordSubmission(store, client, { site: "", poll: "p", option: "x" }),
    ).rejects.toThrow("non-empty");
    await expect(
      recordSubmission(store, client, { site: "s", poll: "", option: "x" }),
    ).rejects.toThrow("non-empty");
    await expect(
      recordSubmission(store, client, { site: "s", poll: "p", option: "" }),
    ).rejects.toThrow("non-empty");
    expect(client.sent).toHaveLength(0);
  });
});

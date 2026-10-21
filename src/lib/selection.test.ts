import { describe, expect, it } from "vitest";
import { RecordingClient, type TallyClient } from "./report";
import { MemoryStore, recordSubmission } from "./selection";

const submit = (
  store: MemoryStore,
  client: TallyClient,
  option: string,
  poll = "best-stream",
) => recordSubmission(store, client, { site: "example-awards", poll, option });

describe("recording a submission", () => {
  it("sends one plain update the first time", async () => {
    const store = new MemoryStore();
    const client = new RecordingClient();
    const update = await submit(store, client, "alice");
    expect(update).toEqual({ site: "example-awards", poll: "best-stream", to: "alice" });
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
      site: "example-awards",
      poll: "best-stream",
      to: "bob",
      from: "alice",
    });
    expect(client.sent).toHaveLength(2);
  });

  it("keeps polls independent — same site, different poll, no from", async () => {
    const store = new MemoryStore();
    const client = new RecordingClient();
    await submit(store, client, "alice", "best-stream");
    const other = await submit(store, client, "carol", "best-moment");
    expect(other).toEqual({ site: "example-awards", poll: "best-moment", to: "carol" });
  });

  it("does not record the submission when the send fails, so it can be retried", async () => {
    const store = new MemoryStore();
    const failing = {
      send: () => Promise.reject(new Error("network down")),
    };
    await expect(submit(store, failing, "alice")).rejects.toThrow("network down");
    // The store was never written, so the next attempt is still a first submission.
    const client = new RecordingClient();
    const retry = await submit(store, client, "alice");
    expect(retry).toEqual({ site: "example-awards", poll: "best-stream", to: "alice" });
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

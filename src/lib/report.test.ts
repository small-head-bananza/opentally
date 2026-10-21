import { describe, expect, it } from "vitest";
import { RecordingClient, TALLY_UPDATE_KEYS, tallyUpdate } from "./report";

describe("the outbound payload", () => {
  it("carries exactly the four allowed keys and never more", () => {
    // The whole privacy claim rests here: whatever a caller holds internally, what
    // crosses the boundary is site, poll, to, and sometimes from. If someone adds a
    // field to TallyUpdate, this test names the moment it happened.
    const full = tallyUpdate({ site: "s", poll: "p", to: "b", from: "a" });
    expect(Object.keys(full).sort()).toEqual(["from", "poll", "site", "to"]);
    const first = tallyUpdate({ site: "s", poll: "p", to: "b" });
    expect(Object.keys(first).sort()).toEqual(["poll", "site", "to"]);
    expect([...TALLY_UPDATE_KEYS].sort()).toEqual(["from", "poll", "site", "to"]);
  });

  it("drops anything extra a caller smuggles in", () => {
    // A hostile or sloppy caller passing a wider object must not widen the wire.
    const smuggled = {
      site: "s",
      poll: "p",
      to: "b",
      from: "a",
      userId: "SHOULD NEVER SURVIVE",
      timestamp: 12345,
    };
    const update = tallyUpdate(smuggled);
    const onWire = JSON.parse(JSON.stringify(update)) as Record<string, unknown>;
    expect(Object.keys(onWire).sort()).toEqual(["from", "poll", "site", "to"]);
    expect(JSON.stringify(onWire)).not.toContain("SHOULD NEVER SURVIVE");
  });

  it("omits from when it equals to — no self-move noise", () => {
    const update = tallyUpdate({ site: "s", poll: "p", to: "b", from: "b" });
    expect(update.from).toBeUndefined();
  });

  it("records what a client was asked to send", async () => {
    const client = new RecordingClient();
    await client.send(tallyUpdate({ site: "s", poll: "p", to: "x" }));
    expect(client.sent).toEqual([{ site: "s", poll: "p", to: "x" }]);
  });
});

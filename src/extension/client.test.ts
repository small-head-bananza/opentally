import { describe, expect, it } from "vitest";
import { HttpTallyClient, serializeUpdate } from "./client";

describe("serializing an update for the wire", () => {
  it("produces exactly the known fields", () => {
    const body = JSON.parse(
      serializeUpdate({ site: "s", poll: "p", to: "b", from: "a" }),
    ) as Record<string, unknown>;
    expect(body).toEqual({ site: "s", poll: "p", to: "b", from: "a" });
  });

  it("strips extra fields even from a widened object", () => {
    const widened = {
      site: "s",
      poll: "p",
      to: "b",
      leaked: "SHOULD NEVER SURVIVE",
    };
    expect(serializeUpdate(widened)).not.toContain("SHOULD NEVER SURVIVE");
  });
});

describe("the http client", () => {
  it("posts the serialized update to the endpoint", async () => {
    const calls: Array<{ url: string; body: string; method: string }> = [];
    const client = new HttpTallyClient("https://tally.example/u", (url, init) => {
      calls.push({ url, body: init.body, method: init.method });
      return Promise.resolve({ ok: true, status: 200 });
    });
    await client.send({ site: "s", poll: "p", to: "x" });
    expect(calls).toEqual([
      {
        url: "https://tally.example/u",
        method: "POST",
        body: JSON.stringify({ site: "s", poll: "p", to: "x" }),
      },
    ]);
  });

  it("throws on a non-ok answer so the caller does not record the submission", async () => {
    const client = new HttpTallyClient("https://tally.example/u", () =>
      Promise.resolve({ ok: false, status: 503 }),
    );
    await expect(client.send({ site: "s", poll: "p", to: "x" })).rejects.toThrow("503");
  });
});

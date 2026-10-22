// The one place that actually sends an update over the network.
//
// The body is rebuilt here from the fixed key list — not serialized from whatever
// object arrived — so even a widened object cannot push an extra field onto the
// wire. Belt and braces on top of tallyUpdate() doing the same.

import {
  TALLY_UPDATE_KEYS,
  type TallyClient,
  type TallyUpdate,
} from "../lib/report";

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

/** The exact bytes that would go on the wire for this update. Exported for tests. */
export function serializeUpdate(update: TallyUpdate): string {
  const body: Record<string, string> = {};
  for (const key of TALLY_UPDATE_KEYS) {
    const value = update[key];
    if (typeof value === "string") body[key] = value;
  }
  return JSON.stringify(body);
}

export class HttpTallyClient implements TallyClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetchFn: FetchLike,
  ) {}

  async send(update: TallyUpdate): Promise<void> {
    const response = await this.fetchFn(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: serializeUpdate(update),
    });
    if (!response.ok) {
      throw new Error(`tally endpoint answered ${response.status}`);
    }
  }
}

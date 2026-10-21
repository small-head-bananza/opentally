// The one thing this extension ever sends: "on this site, in this poll, a participant
// picked this option" — and, when they changed their mind after an earlier submission,
// which option they moved away from, so the aggregate can be corrected.
//
// The payload is deliberately this small. No identifier, no timestamp, no page URL, no
// browser detail. The test suite pins the exact key set, so a field can never be added
// quietly: adding one is a visible, reviewed decision or a failing test.

/** What a participant's submission changes in the shared tally. */
export interface TallyUpdate {
  /** Which site adapter produced this (a short fixed id, never a URL). */
  readonly site: string;
  /** Which poll on that site (an id the adapter derives from page structure, never free text). */
  readonly poll: string;
  /** The option the participant picked. */
  readonly to: string;
  /** The option they previously submitted and have now moved away from, if any. */
  readonly from?: string;
}

/** The complete list of keys a TallyUpdate may carry. Tests pin against this. */
export const TALLY_UPDATE_KEYS = ["site", "poll", "to", "from"] as const;

/**
 * Builds the update, dropping anything that is not in the fixed key set. Callers may
 * hold richer objects internally; what crosses this boundary is only the four fields.
 */
export function tallyUpdate(input: {
  site: string;
  poll: string;
  to: string;
  from?: string | undefined;
}): TallyUpdate {
  const update: { site: string; poll: string; to: string; from?: string } = {
    site: input.site,
    poll: input.poll,
    to: input.to,
  };
  if (input.from !== undefined && input.from !== input.to) update.from = input.from;
  return update;
}

/**
 * Where updates go. Injected everywhere, so every test runs without a network and the
 * real destination is decided in exactly one reviewed place.
 */
export interface TallyClient {
  send(update: TallyUpdate): Promise<void>;
}

/** A client that records instead of sending — the default for tests. */
export class RecordingClient implements TallyClient {
  readonly sent: TallyUpdate[] = [];
  send(update: TallyUpdate): Promise<void> {
    this.sent.push(update);
    return Promise.resolve();
  }
}

// The local record of what this participant last submitted, per poll.
//
// Three rules shape everything here:
//
// 1. Nothing is recorded, and nothing is sent, until the participant actually submits
//    on the site — clicking through options while deciding is not data.
// 2. A participant counts once per poll. Submitting the same option again changes
//    nothing; submitting a different option produces an update that carries the old
//    option too, so the shared tally can move a count rather than double-count.
// 3. When a send fails, the count is LOST, not retried. The payload carries no
//    identifier, so the server can never tell a retry from a second vote — and a
//    tally that can silently inflate is worse than one that occasionally
//    undercounts. The local record is therefore written BEFORE the send: a
//    resubmission after a failure finds the record already set and stays silent.
//    (If the failed send never reached the server, a later change of mind still
//    heals the books: its "from" decrement lands on a counter the server floors
//    at zero, and the new option is counted correctly.)
//
// Storage is injected: the extension passes a chrome.storage-backed store, tests pass
// a Map. Nothing in this file can reach the network or the browser on its own.

import { type TallyClient, type TallyUpdate, tallyUpdate } from "./report";

/** Minimal key-value storage this module needs. */
export interface SelectionStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

/** An in-memory store for tests. */
export class MemoryStore implements SelectionStore {
  private readonly map = new Map<string, string>();
  get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.map.get(key));
  }
  set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }
}

function keyFor(site: string, poll: string): string {
  return `selection:${site}:${poll}`;
}

/**
 * Handle one submission the participant just made on the site.
 *
 * Returns the update that was sent, or null when nothing needed sending (the local
 * record already holds this option). Throws when the send failed — by then the
 * local record is already written, so the failure means this transition is lost,
 * never that it will be double-counted later (rule 3 above).
 */
export async function recordSubmission(
  store: SelectionStore,
  client: TallyClient,
  submission: { site: string; poll: string; option: string },
): Promise<TallyUpdate | null> {
  const { site, poll, option } = submission;
  if (site === "" || poll === "" || option === "") {
    throw new Error("a submission needs a site, a poll and an option, all non-empty");
  }
  const previous = await store.get(keyFor(site, poll));
  if (previous === option) return null;

  await store.set(keyFor(site, poll), option);
  const update = tallyUpdate({ site, poll, to: option, from: previous });
  await client.send(update);
  return update;
}

// The local record of what this participant last submitted, per poll.
//
// Two rules shape everything here:
//
// 1. Nothing is recorded, and nothing is sent, until the participant actually submits
//    on the site — clicking through options while deciding is not data.
// 2. A participant counts once per poll. Submitting the same option again changes
//    nothing; submitting a different option produces an update that carries the old
//    option too, so the shared tally can move a count rather than double-count.
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
 * Returns the update that was sent, or null when nothing needed sending (first ever
 * call with the same option they already submitted). The store is written only after
 * the client accepted the update, so a failed send can be retried by submitting again
 * rather than silently losing the correction.
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

  const update = tallyUpdate({ site, poll, to: option, from: previous });
  await client.send(update);
  await store.set(keyFor(site, poll), option);
  return update;
}

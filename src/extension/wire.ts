// Connects a site adapter's "the participant just submitted" callback to the
// counting rules in selection.ts.
//
// Two layers of serialization guard the read-then-write on the shared record:
//
// - The queue below handles rapid submissions WITHIN one page: a double-click on a
//   vote button fires two reports, and unserialized both would read "no previous
//   submission" and both would count.
// - The injected lock handles the SAME poll open in two tabs (or frames): the
//   queue is per page, but chrome.storage is shared, so without a cross-tab lock
//   two tabs can interleave the same read-then-write and double-count. The
//   extension entry passes a Web Locks-backed lock (navigator.locks); tests pass
//   their own. Web Locks are shared across all tabs of a site, which is exactly
//   the scope the record needs.

import type { PageSubmission, SiteAdapter } from "../lib/adapter";
import type { TallyClient } from "../lib/report";
import { recordSubmission, type SelectionStore } from "../lib/selection";

/** Run task exclusively among all holders of the same key, across tabs. */
export type CrossTabLock = (key: string, task: () => Promise<void>) => Promise<void>;

export function attachAdapter(
  adapter: SiteAdapter,
  root: ParentNode,
  store: SelectionStore,
  client: TallyClient,
  lock: CrossTabLock,
  onError: (error: unknown) => void,
): void {
  let queue: Promise<void> = Promise.resolve();
  adapter.attach(root, (submission: PageSubmission) => {
    queue = queue.then(() =>
      lock(`opentally:${adapter.siteId}:${submission.poll}`, async () => {
        try {
          await recordSubmission(store, client, {
            site: adapter.siteId,
            poll: submission.poll,
            option: submission.option,
          });
        } catch (error) {
          // The local record is already written, so this transition's count is
          // lost rather than retried — see rule 3 in selection.ts. Surface it;
          // the queue itself must never reject.
          onError(error);
        }
      }),
    );
  });
}

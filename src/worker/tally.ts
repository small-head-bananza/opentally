// The receiving side's core: decide whether an incoming body is a well-formed
// update, and apply it to the counters. No per-person data exists here — the only
// stored thing is one integer per (site, poll, option).
//
// The storage is injected (D1 in production, a Map in tests), and parsing is
// deliberately paranoid: the worker is a public endpoint, so everything arriving
// is untrusted bytes until proven otherwise.

import type { TallyUpdate } from "../lib/report";

/**
 * The only storage the worker needs: apply one participant's update.
 *
 * The contract carries the integrity rules, so every implementation must honor
 * them, not just the production one:
 * - BOTH deltas (+1 to `to`, -1 to `from` when present) land as ONE atomic unit —
 *   in production a single D1 batch — or neither does. Applying one without the
 *   other mints a phantom count.
 * - A counter never goes below zero, and a decrement never creates a row. A
 *   crafted `from` naming an option nobody holds must change nothing: without the
 *   floor, anyone could drive a chosen option's public count negative.
 */
export interface CounterStore {
  record(site: string, poll: string, to: string, from?: string): Promise<void>;
}

/** An in-memory CounterStore for tests, honoring the same contract. */
export class MemoryCounters implements CounterStore {
  readonly counts = new Map<string, number>();

  private keyOf(site: string, poll: string, option: string): string {
    return `${site}\u0000${poll}\u0000${option}`;
  }

  record(site: string, poll: string, to: string, from?: string): Promise<void> {
    // Synchronous, so atomic by construction.
    const toKey = this.keyOf(site, poll, to);
    this.counts.set(toKey, (this.counts.get(toKey) ?? 0) + 1);
    if (from !== undefined) {
      const fromKey = this.keyOf(site, poll, from);
      const current = this.counts.get(fromKey);
      if (current !== undefined && current > 0) {
        this.counts.set(fromKey, current - 1);
      }
    }
    return Promise.resolve();
  }

  get(site: string, poll: string, option: string): number {
    return this.counts.get(this.keyOf(site, poll, option)) ?? 0;
  }
}

const ALLOWED_KEYS = new Set(["site", "poll", "to", "from"]);
const MAX_FIELD_LENGTH = 200;
// Refused outright: C0 and C1 control characters and DEL; zero-width and joiner
// characters; line/paragraph separators; direction-control characters; word
// joiner; byte-order mark. Ids come from page structure, not prose, so none of
// these ever belong in one — but any of them would let two visually identical
// option names hold separate counters, or make the published page render
// deceptively.
const FORBIDDEN_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060\ufeff]/;

/** JSON.parse happily yields lone surrogates ("\ud800"); real text never does. */
function wellFormedUnicode(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

function validField(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= MAX_FIELD_LENGTH &&
    !FORBIDDEN_CHARS.test(value) &&
    wellFormedUnicode(value)
  );
}

/**
 * Parse an incoming request body into an update, or null when it is not one.
 *
 * Refused outright: non-objects, any unknown key (a client sending more than the
 * four fields is either outdated or hostile — both are refused the same way),
 * missing or malformed fields, an unknown site id, and from === to.
 */
export function parseUpdate(
  body: unknown,
  knownSites: ReadonlySet<string>,
): TallyUpdate | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) return null;
  }
  const { site, poll, to, from } = record;
  if (!validField(site) || !validField(poll) || !validField(to)) return null;
  if (!knownSites.has(site)) return null;
  if (from === undefined) return { site, poll, to };
  if (!validField(from) || from === to) return null;
  return { site, poll, to, from };
}

/** Apply a parsed update through the store's atomic, floored contract. */
export async function applyUpdate(
  store: CounterStore,
  update: TallyUpdate,
): Promise<void> {
  await store.record(update.site, update.poll, update.to, update.from);
}

// One adapter per supported site. An adapter knows how to recognise its site's voting
// page and how to read which option a submission was for — and nothing else.
//
// Adapters are written against SAVED page fixtures checked into the repository, never
// against the live site: tests must run with no network, and a site changing its markup
// should break a fixture test here, not behaviour in the field.

/** What a site adapter must provide. */
export interface SiteAdapter {
  /** Short fixed id, e.g. "example-awards". Lowercase letters, digits and dashes only. */
  readonly siteId: string;
  /** Does this adapter handle the given page? Must be decidable from the URL alone. */
  matches(url: URL): boolean;
}

const SITE_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Holds the known adapters and answers "who handles this page?".
 *
 * Exactly one adapter may claim a URL. Two claimants is a configuration bug, and the
 * registry refuses loudly rather than picking one — a wrong adapter reading a wrong
 * option would poison the shared tally silently.
 */
export class AdapterRegistry {
  private readonly adapters: SiteAdapter[] = [];

  register(adapter: SiteAdapter): void {
    if (!SITE_ID.test(adapter.siteId)) {
      throw new Error(`site id "${adapter.siteId}" is not lowercase-dashed`);
    }
    if (this.adapters.some((a) => a.siteId === adapter.siteId)) {
      throw new Error(`site id "${adapter.siteId}" is already registered`);
    }
    this.adapters.push(adapter);
  }

  /** The single adapter for this URL, null when no adapter claims it. */
  adapterFor(url: URL): SiteAdapter | null {
    const claimants = this.adapters.filter((a) => a.matches(url));
    if (claimants.length > 1) {
      throw new Error(
        `ambiguous adapters for ${url.origin}: ${claimants.map((a) => a.siteId).join(", ")}`,
      );
    }
    return claimants[0] ?? null;
  }
}

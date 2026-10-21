# Where the counts live

Goal: receive tiny anonymous updates from many browsers, keep running totals, and
publish them on a public page — for as close to zero money as possible, with no
server we have to look after.

## Why a plain GitHub repository is not enough on its own

The natural wish is "just store the numbers in a GitHub repo". The problem is the
write path: a browser extension cannot push to a repository without a token, and
any token shipped inside an extension can be extracted by anyone who installs it.
One extracted token means anyone can write anything to the tally. So GitHub can
*serve* the numbers, but something else has to *receive* the updates.

## Chosen shape: one free worker in front, GitHub Pages behind

```
extension ──POST {site,poll,to,from}──▶ Cloudflare Worker ──▶ D1 (a small SQLite table)
                                              │
                                   scheduled export (every few minutes)
                                              ▼
                               public JSON + page on GitHub Pages
```

- **Receiving:** a Cloudflare Worker on the free plan (100,000 requests per day,
  no card required). It accepts only the four known fields, drops anything else,
  and never logs addresses. It adds one to `to`'s counter and subtracts one from
  `from`'s when present.
- **Storing:** Cloudflare D1, a small SQLite database, also free at this size.
  One row per (site, poll, option) holding a single integer. No per-person rows
  exist anywhere, so there is nothing to leak.
- **Publishing:** a scheduled job exports the totals as a JSON file and commits it
  to the public repository; GitHub Pages serves the tally page from it. The page
  shows each poll's totals with its participant count and the limits statement.

Monthly cost at hobby scale: zero. The only account needed besides GitHub is one
Cloudflare account, which can be created fresh for this project so it links to
nothing else.

## Abuse limits (first version, deliberately simple)

A volunteer tally does not need to be tamper-proof, it needs to be honest about
what it is. Still, cheap tricks should stay cheap to stop:

- The worker rate-limits by address (never stored, only checked) so a script
  cannot inflate a count a thousand times a minute.
- Only registered `site` ids and sane field lengths are accepted.
- The export job writes totals only; a bad day can be rolled back from git
  history of the published JSON.

What this does **not** stop: one person with several devices, or a determined
scripter rotating addresses. The published page says so. Stronger defences
(proof-of-work, install tokens) only make sense if the project grows, and each
one trades away some simplicity — a decision for later, taken in the open.

## Alternatives considered

- **GitHub Issues as an inbox** (extension opens an issue per update, an Action
  counts and closes them): no secret needed, but it requires every participant to
  have a GitHub account and sign in — that destroys participation and anonymity.
- **A repository-dispatch endpoint**: needs a token in the extension. Ruled out
  above.
- **Any paid queue or database**: ruled out by the cost goal while a free tier
  fits comfortably.

# opentally

A community exit poll for the web. People who install this browser extension share
which option they picked when they voted in an online poll, and the combined counts
are published openly for anyone to look at.

It works the same way exit polls work in elections: it never sees the real ballot
box, it only counts the people who agreed to be counted.

## What it does

- When you submit a vote on a supported site, the extension records which option
  you picked and adds one to that option's public count.
- If you later change your vote on the site, the extension moves your count to the
  new option. You are counted once per poll, not once per click.
- The running totals are published on a public page that anyone can check.

## What it sends — the complete list

Each time you submit a vote, the extension sends exactly four pieces of
information, and nothing else:

| Field  | What it is                                              |
| ------ | ------------------------------------------------------- |
| `site` | A short fixed name for the site, e.g. `example-awards`  |
| `poll` | Which poll on that site                                 |
| `to`   | The option you picked                                   |
| `from` | The option you moved away from, if you changed your vote |

No account name, no identifier of any kind, no timestamp, no page address, no
browser details. This is not a promise buried in a policy page: the code builds
the message from a fixed list of four field names, and the test suite fails if
anyone adds a fifth. The code is public, so you can check this yourself.

## What the numbers mean — and what they don't

Read the published counts with these limits in mind:

- **This is a sample, not the real result.** Only people who installed the
  extension are counted. They are volunteers, not a random slice of all voters,
  so the sample can lean one way even when nothing is wrong.
- **These numbers cannot prove a poll was rigged.** A big gap between our sample
  and an announced result is a reason to ask questions, never a verdict. Small
  gaps mean nothing at all.
- **Small counts are noise.** Until a poll has hundreds of participants here,
  treat its numbers as anecdote.

The published page states the participant count next to every tally so nobody
mistakes twelve volunteers for a measurement.

## Supported sites

Each supported site gets its own small adapter in `src/adapters/`. An adapter
recognises its site's voting page and reads which option a submission was for —
nothing else. Adapters are developed against saved copies of page markup checked
into this repository, so tests run without touching any live site.

New site suggestions are welcome as issues.

## Development

```
npm install
npm run typecheck
npm test
```

Everything in `src/lib/` is dependency-injected: storage and the network client
are passed in, so the whole test suite runs with no browser and no network.

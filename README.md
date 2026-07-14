# Shingou signal hash-commitment log

Append-only log of every signal bucket published by [shingou.io](https://shingou.io).

At publish time, the ingestion engine writes one line per (symbol, interval, bucket):

```json
{"symbol":"BTC-USD","interval":"1h","bucket":"2026-07-04T10:00:00.000Z","hash":"<sha256>"}
```

`hash` is the SHA-256 (hex) of the canonical string

```
symbol|interval|bucket|score|confidence|direction|news_volume|novelty_score|reconstructed
```

where `symbol`, `interval` and `bucket` are the line's own fields **verbatim**
(the API renders the same instant as `+00:00` instead of `.000Z`, so use the
committed string, not the API's serialization), and the remaining fields are
exactly the values `GET /v1/history/sentiment` returns for that bucket. Numbers
are rendered the way JavaScript renders them (`String(x)`, e.g. `0.65`, `0`,
`false`). Files live under `log/YYYY-MM-DD.jsonl`, keyed by the bucket's UTC date.

Day files are kept sorted, so a commit can insert lines anywhere in the file.
No line is ever changed or removed. The git history is the proof.

## Verify it yourself

One command. No dependencies. Node 18 or newer, plus a free API key from
[shingou.io](https://shingou.io):

```bash
git clone https://github.com/auriontech/shingou-signal-log.git
cd shingou-signal-log
node verify.mjs --key YOUR_API_KEY --day 2026-07-10
```

The script fetches each bucket from the live API, recomputes the hash, and
compares it to the committed line. It paces itself to fit the free plan's rate
limit. Free keys see 7 days of history, and non-major symbols are served with
a 24h delay. Buckets outside those windows are reported as skipped, not failed.

## What this proves

Each commit is timestamped by GitHub when the bucket is published. To verify that
Shingou never rewrote history: fetch a historical bucket from the API, recompute
the hash from the fields above, and check it equals the line committed at publish
time. A changed value would produce a different hash than the one committed.
Visibly.

It proves **forward from first deploy**. Buckets labeled `reconstructed: true`
(the archival backfill) are written once and labeled as reconstructions. They are
sold and documented as exactly that, not as live-collected history.

## Log events

**2026-07-06T05:00Z was published twice.** The hourly run committed 30 hashes at
05:01 UTC. The engine v2 rollout re-dispatched the same hour at 05:28 UTC, and
the re-scored values differed on 26 of 30 symbols. The re-run overwrote the
served bucket and committed the new hashes. Both sets of lines remain in the
log, because lines are never removed. The API's current values recompute to the
05:28 hashes; the 05:01 lines are superseded. This is the log doing its job: a
re-publish leaves permanent, timestamped evidence. `verify.mjs` reports
superseded lines separately from mismatches. This is the only re-published
bucket to date.

## Known caveat: lines before 2026-07-05T12:00Z

Lines committed before bucket `2026-07-05T12:00:00.000Z` were hashed over the
engine's full-float64 values, but the database columns store 32-bit floats. For
most of those buckets the served value lost precision and **the committed hash
does not recompute from API reads**. This was a precision bug in hash
construction, not a rewrite: the commit timestamps still prove *when* each
bucket was published. Fixed in engine commit
[`403950d`](https://github.com/auriontech/shingou/commit/403950d) (signal fields
are now rounded to a float4-safe 6 decimals before storing and hashing). Every
line from bucket `2026-07-05T12:00:00.000Z` onward recomputes exactly. The
pre-fix lines are left in place unaltered. This log is append-only.

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
(the API renders the same instant as `+00:00` instead of `.000Z` — use the
committed string, not the API's serialization), and the remaining fields are
exactly the values `GET /v1/history/sentiment` returns for that bucket. Numbers
are rendered the way JavaScript renders them (`String(x)`, e.g. `0.65`, `0`,
`false`). Files live under `log/YYYY-MM-DD.jsonl`, keyed by the bucket's UTC date.

## What this proves

Each commit is timestamped by GitHub when the bucket is published. To verify that
Shingou never rewrote history: fetch a historical bucket from the API, recompute the
hash from the fields above, and check it equals the line committed at publish time.
A changed value would produce a different hash than the one committed — visibly.

It proves **forward from first deploy**. Buckets labeled `reconstructed: true`
(the archival backfill) are written once and labeled as reconstructions — they are
sold and documented as such, not as live-collected history.

## Known caveat: lines before 2026-07-05T12:00Z

Lines committed before bucket `2026-07-05T12:00:00.000Z` were hashed over the
engine's full-float64 values, but the database columns store 32-bit floats — so
for most buckets the served value lost precision and **the committed hash does
not recompute from API reads**. This was a precision bug in hash construction,
not a rewrite: the commit timestamps still prove *when* each bucket was
published. Fixed in engine commit
[`403950d`](https://github.com/auriontech/shingou/commit/403950d) (signal fields
are now rounded to a float4-safe 6 decimals before storing and hashing). Every
line from bucket `2026-07-05T12:00:00.000Z` onward recomputes exactly. The
pre-fix lines are left in place unaltered — this log is append-only.

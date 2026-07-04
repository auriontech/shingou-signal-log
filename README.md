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

using exactly the values the API returns for that bucket (`GET /v1/history/sentiment`).
Files live under `log/YYYY-MM-DD.jsonl`, keyed by the bucket's UTC date.

## What this proves

Each commit is timestamped by GitHub when the bucket is published. To verify that
Shingou never rewrote history: fetch a historical bucket from the API, recompute the
hash from the fields above, and check it equals the line committed at publish time.
A changed value would produce a different hash than the one committed — visibly.

It proves **forward from first deploy**. Buckets labeled `reconstructed: true`
(the archival backfill) are written once and labeled as reconstructions — they are
sold and documented as such, not as live-collected history.

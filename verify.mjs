#!/usr/bin/env node
// Verify Shingou's hash-commitment log against the live API.
//
// For every line in a day file, this script fetches the same bucket from
// GET /v1/history/sentiment, rebuilds the canonical string, and checks that
// its sha256 equals the committed hash. No dependencies. Node 18 or newer.
//
//   node verify.mjs --key YOUR_API_KEY [--day 2026-07-10] [--api https://api.shingou.io]
//
// A free key works. Two plan limits apply and are reported as SKIPPED, not
// failures: free history covers 7 days, and symbols outside the free live
// set are served 24h delayed. Lines with buckets before 2026-07-05T12:00Z
// do not recompute because of a disclosed precision bug (see README).

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((p) => p.length),
);
const API = args.api ?? "https://api.shingou.io";
const KEY = args.key ?? process.env.SHINGOU_API_KEY;
if (!KEY) {
  console.error("Need an API key: --key YOUR_API_KEY (free keys work, https://shingou.io)");
  process.exit(2);
}
const days = readdirSync("log").map((f) => f.replace(".jsonl", "")).sort();
const day = args.day ?? days[days.length - 1];
if (!days.includes(day)) {
  console.error(`No log file for ${day}. Available: ${days[0]} to ${days[days.length - 1]}`);
  process.exit(2);
}

const PRECISION_CUTOFF = "2026-07-05T12:00:00.000Z";
const lines = readFileSync(`log/${day}.jsonl`, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

// Group by symbol so each symbol needs one API call for the whole day.
const bySymbol = new Map();
for (const l of lines) {
  if (!bySymbol.has(l.symbol)) bySymbol.set(l.symbol, []);
  bySymbol.get(l.symbol).push(l);
}
console.log(`log/${day}.jsonl: ${lines.length} lines, ${bySymbol.size} symbols`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const counts = { OK: 0, SUPERSEDED: 0, SKIPPED: 0, PRE_FIX: 0, MISMATCH: 0 };
const mismatches = [];

for (const [symbol, symbolLines] of bySymbol) {
  const url = `${API}/v1/history/sentiment?symbol=${symbol}&interval=1h&from=${day}T00:00:00Z&to=${day}T23:59:59Z`;
  const res = await fetch(url, { headers: { "X-Api-Key": KEY, "User-Agent": "shingou-log-verify/1.0" } });
  if (!res.ok) {
    console.error(`${symbol}: API error ${res.status} ${await res.text()}`);
    process.exit(2);
  }
  const body = await res.json();
  // The API echoes back any plan clamp on the requested range.
  const served = new Map(body.points.map((p) => [Date.parse(p.bucket), p]));

  // A bucket can appear more than once: if it was ever re-published, the log
  // keeps every committed hash. The group passes when the served values
  // recompute to at least one of them; the others are marked SUPERSEDED.
  const byBucket = new Map();
  for (const l of symbolLines) {
    if (!byBucket.has(l.bucket)) byBucket.set(l.bucket, []);
    byBucket.get(l.bucket).push(l);
  }
  for (const [bucket, group] of byBucket) {
    if (bucket < PRECISION_CUTOFF) { counts.PRE_FIX += group.length; continue; }
    const p = served.get(Date.parse(bucket));
    if (!p) { counts.SKIPPED += group.length; continue; }
    // Canonical string: the line's own symbol/interval/bucket verbatim, then
    // the served values rendered the way JavaScript renders them.
    const hash = createHash("sha256")
      .update([group[0].symbol, group[0].interval, bucket, p.score, p.confidence, p.direction, p.news_volume, p.novelty_score, p.reconstructed].join("|"))
      .digest("hex");
    if (group.some((l) => l.hash === hash)) {
      counts.OK += 1;
      counts.SUPERSEDED += group.length - 1;
    } else {
      counts.MISMATCH += group.length;
      mismatches.push({ symbol, bucket, committed: group.map((l) => l.hash), recomputed: hash });
    }
  }
  await sleep(2100); // stay inside the free plan's 30 requests per minute
}

console.log(`OK: ${counts.OK}  superseded (re-published bucket, see README): ${counts.SUPERSEDED}`);
console.log(`skipped (outside your plan's window or delay): ${counts.SKIPPED}  pre-fix lines (disclosed caveat): ${counts.PRE_FIX}`);
console.log(`MISMATCH: ${counts.MISMATCH}`);
for (const m of mismatches) console.log(JSON.stringify(m));
process.exit(counts.MISMATCH > 0 ? 1 : 0);

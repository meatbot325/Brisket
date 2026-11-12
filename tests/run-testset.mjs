// Runs every store in testset.json through the live check (fresh, nothing saved)
// and reports how many scams were caught and how many real stores were wrongly flagged.
// Usage: node tests/run-testset.mjs [out.json]
import { readFileSync, writeFileSync } from "node:fs";
const API = process.env.SNIFFD_API || "https://ijerqmyyragkxiphjkqy.supabase.co/functions/v1/check";
const { items } = JSON.parse(readFileSync(new URL("./testset.json", import.meta.url)));
async function run(item) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: item.url, dry_run: true, fresh: true }), signal: AbortSignal.timeout(60000) });
      const d = await r.json();
      if (d.verdict) return { ...item, verdict: d.verdict, score: d.score, flags: d.facts.filter((f) => f.tone === "bad" || f.tone === "warn").map((f) => `${f.label}: ${f.value}`) };
    } catch (e) { /* retry */ }
  }
  return { ...item, verdict: "error", score: null, flags: [] };
}
const out = []; let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (i < items.length) { const it = items[i++]; out.push(await run(it)); } }));
const scams = out.filter((r) => r.expect === "scam"), legit = out.filter((r) => r.expect === "legit");
const count = (rs, v) => rs.filter((r) => r.verdict === v).length;
console.log(`SCAMS (${scams.length}): red ${count(scams, "red")}, yellow ${count(scams, "yellow")}, GREEN (missed) ${count(scams, "green")}, error ${count(scams, "error")}`);
console.log(`REAL  (${legit.length}): green ${count(legit, "green")}, yellow ${count(legit, "yellow")}, RED (false alarm) ${count(legit, "red")}, error ${count(legit, "error")}`);
for (const r of out.sort((a, b) => a.expect.localeCompare(b.expect) || (a.score ?? 0) - (b.score ?? 0)))
  console.log(`${r.expect.padEnd(5)} ${r.verdict.padEnd(6)} ${String(r.score).padStart(3)}  ${r.url.replace(/https:\/\/(www\.)?/, "").replace(/\/$/, "")}`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));

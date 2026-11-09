import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// GET /result?c=<code>  → the saved receipts card for a short share link
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const code = new URL(req.url).searchParams.get("c")?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (!code) return json({ error: "Missing code" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: check } = await supabase
    .from("checks")
    .select("id, code, domain, url, verdict, score, facts, signals, created_at")
    .eq("code", code)
    .maybeSingle();
  if (!check) return json({ error: "That link has expired or doesn't exist." }, 404);

  const [{ count: priorChecks }, { data: reports }] = await Promise.all([
    supabase.from("checks").select("*", { count: "exact", head: true }).eq("domain", check.domain),
    supabase.from("reports").select("outcome").eq("domain", check.domain),
  ]);
  const summary = { arrived_ok: 0, arrived_junk: 0, never_arrived: 0, refunded: 0 } as Record<string, number>;
  for (const r of reports ?? []) summary[r.outcome] = (summary[r.outcome] ?? 0) + 1;

  const headline =
    check.verdict === "green" ? "Checks out so far." :
    check.verdict === "yellow" ? "Couldn't verify. Proceed carefully." :
    "Multiple red flags. I'd pass.";

  return json({
    id: check.id,
    code: check.code,
    domain: check.domain,
    url: check.url,
    title: (check.signals as any)?.title ?? null,
    verdict: check.verdict,
    score: check.score,
    headline,
    facts: check.facts,
    prior_checks: Math.max(0, (priorChecks ?? 1) - 1),
    reports: summary,
    checked_at: check.created_at,
    saved: true,
  });
});

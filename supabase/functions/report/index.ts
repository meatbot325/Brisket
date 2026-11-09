import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OUTCOMES = ["arrived_ok", "arrived_junk", "never_arrived", "refunded"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: CORS }); }
  const outcome = String(body?.outcome ?? "");
  const domain = String(body?.domain ?? "").toLowerCase().slice(0, 253);
  const check_id = body?.check_id ? String(body.check_id) : null;
  const note = body?.note ? String(body.note).slice(0, 500) : null;
  if (!OUTCOMES.includes(outcome) || !domain.includes(".")) {
    return new Response(JSON.stringify({ error: "invalid" }), { status: 400, headers: CORS });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.from("reports").insert({ check_id, domain, outcome, note });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
});

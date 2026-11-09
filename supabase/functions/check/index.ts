import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Fact = { label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" };

const BRANDS = [
  "nike", "adidas", "yeti", "stanley", "dyson", "apple", "airpods", "ray-ban", "rayban",
  "oakley", "north face", "patagonia", "lululemon", "ugg", "crocs", "lego", "nintendo",
  "playstation", "xbox", "gucci", "louis vuitton", "rolex", "carhartt", "levi", "columbia",
  "under armour", "new balance", "hoka", "birkenstock", "coach", "michael kors", "kitchenaid",
  "ninja", "vitamix", "weber", "traeger", "milwaukee", "dewalt", "makita", "garmin", "gopro",
];

const URGENCY = [
  /only \d+ left/i, /limited (time|stock|quantity)/i, /today only/i, /ends (tonight|today|soon)/i,
  /hurry/i, /selling fast/i, /almost (gone|sold out)/i, /last chance/i, /flash sale/i,
  /\d+ people (are )?viewing/i, /closing (down|sale)/i, /going out of business/i, /clearance/i,
  /free shipping worldwide/i, /countdown/i,
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalizeUrl(input: string): URL | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

function rootDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  // handle co.uk-style second-level TLDs crudely
  const sld = parts[parts.length - 2];
  if (["co", "com", "net", "org", "gov", "ac"].includes(sld) && parts[parts.length - 1].length === 2) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

async function domainAgeDays(domain: string): Promise<{ days: number | null; registered: string | null; registrar: string | null }> {
  try {
    const r = await fetchWithTimeout(`https://rdap.org/domain/${domain}`, 6000, {
      headers: { Accept: "application/rdap+json" },
    });
    if (!r.ok) return { days: null, registered: null, registrar: null };
    const d = await r.json();
    const ev = (d.events ?? []).find((e: any) => e.eventAction === "registration");
    let registrar: string | null = null;
    for (const ent of d.entities ?? []) {
      if ((ent.roles ?? []).includes("registrar")) {
        const vc = ent.vcardArray?.[1] ?? [];
        const fn = vc.find((x: any) => x[0] === "fn");
        if (fn) registrar = fn[3];
      }
    }
    if (!ev?.eventDate) return { days: null, registered: null, registrar };
    const reg = new Date(ev.eventDate);
    const days = Math.floor((Date.now() - reg.getTime()) / 86400000);
    return { days, registered: reg.toISOString().slice(0, 10), registrar };
  } catch {
    return { days: null, registered: null, registrar: null };
  }
}

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send JSON: { url }" }, 400);
  }
  const target = normalizeUrl(String(body?.url ?? ""));
  if (!target) return json({ error: "That doesn't look like a web address." }, 400);

  const domain = rootDomain(target.hostname);
  const facts: Fact[] = [];
  const signals: Record<string, unknown> = {};
  let score = 50;

  // --- Fetch the page and RDAP in parallel ---
  const [pageRes, age] = await Promise.all([
    fetchWithTimeout(target.toString(), 9000, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }).catch(() => null),
    domainAgeDays(domain),
  ]);

  // --- Domain age ---
  signals.domain_age_days = age.days;
  signals.registered = age.registered;
  signals.registrar = age.registrar;
  if (age.days === null) {
    facts.push({ label: "Store age", value: "Couldn't verify when this domain was registered", tone: "warn" });
    score -= 5;
  } else if (age.days < 30) {
    facts.push({ label: "Store age", value: `Domain registered ${age.days} days ago`, tone: "bad" });
    score -= 30;
  } else if (age.days < 180) {
    facts.push({ label: "Store age", value: `Domain is ${Math.round(age.days / 30)} months old`, tone: "warn" });
    score -= 15;
  } else if (age.days < 730) {
    facts.push({ label: "Store age", value: `Domain is about ${(age.days / 365).toFixed(1)} years old`, tone: "neutral" });
  } else {
    facts.push({ label: "Store age", value: `Domain is ${Math.floor(age.days / 365)}+ years old`, tone: "good" });
    score += 15;
  }

  // --- Page analysis ---
  let html = "";
  let finalUrl = target.toString();
  if (!pageRes || !pageRes.ok) {
    signals.fetch_ok = false;
    signals.fetch_status = pageRes?.status ?? null;
    const blocked = pageRes && [401, 403, 429, 503].includes(pageRes.status);
    if (blocked && age.days !== null && age.days > 730) {
      // Established sites often block automated requests; that's not a red flag.
      facts.push({ label: "Website", value: "Site blocked our automated check — common for established retailers", tone: "neutral" });
    } else if (blocked) {
      facts.push({ label: "Website", value: "Site blocked our automated check, so we could only verify the domain", tone: "warn" });
      score -= 5;
    } else {
      facts.push({ label: "Website", value: pageRes ? `Site returned an error (${pageRes.status})` : "Site didn't respond", tone: "warn" });
      score -= 10;
    }
  } else {
    signals.fetch_ok = true;
    finalUrl = pageRes.url || finalUrl;
    const buf = await pageRes.arrayBuffer();
    html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 600_000));
    const text = strip(html);
    const lower = html.toLowerCase();

    // redirected to a different domain?
    const finalDomain = rootDomain(new URL(finalUrl).hostname);
    if (finalDomain !== domain) {
      facts.push({ label: "Redirect", value: `Link forwards to a different site: ${finalDomain}`, tone: "warn" });
      score -= 10;
      signals.redirected_to = finalDomain;
    }

    // title
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    signals.title = title;

    // platform
    let platform = "unknown";
    if (lower.includes("cdn.shopify.com") || lower.includes("shopify.theme")) platform = "Shopify";
    else if (lower.includes("woocommerce")) platform = "WooCommerce";
    else if (lower.includes("bigcommerce")) platform = "BigCommerce";
    else if (lower.includes("squarespace")) platform = "Squarespace";
    else if (lower.includes("wix.com")) platform = "Wix";
    else if (lower.includes("shoplazza") || lower.includes("shoplaza")) platform = "Shoplazza";
    signals.platform = platform;
    if (platform === "Shoplazza") {
      facts.push({ label: "Platform", value: "Built on Shoplazza, a platform heavily used by dropship stores", tone: "warn" });
      score -= 10;
    }

    // Thin app shells (React/Vue storefronts) give us almost no text; don't punish silence.
    const thin = text.trim().length < 1500;
    signals.text_length = text.trim().length;
    if (thin) {
      facts.push({ label: "Website", value: "Page loads its content with scripts, so we could only read the basics", tone: "neutral" });
    }

    // contact info
    const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
    const hasPhone = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(text);
    const hasAddress = /\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\s(street|st\.?|avenue|ave\.?|road|rd\.?|blvd|boulevard|drive|dr\.?|lane|ln\.?|way|suite|ste\.?)\b/i.test(text);
    const hasContactLink = /href=["'][^"']*(contact|about)[^"']*["']/i.test(html);
    signals.contact = { email: hasEmail, phone: hasPhone, address: hasAddress, contact_page: hasContactLink };
    const contactBits = [hasEmail && "email", hasPhone && "phone", hasAddress && "street address"].filter(Boolean) as string[];
    if (thin && contactBits.length === 0) {
      // skip: can't tell from a script-rendered shell
    } else if (contactBits.length === 0 && !hasContactLink) {
      facts.push({ label: "Who's behind it", value: "No email, phone, or address anywhere on the page", tone: "bad" });
      score -= 15;
    } else if (!hasAddress && !hasPhone) {
      facts.push({ label: "Who's behind it", value: contactBits.length ? `Only ${contactBits.join(", ")} listed — no phone or street address` : "Contact page exists, but no phone or address on the front page", tone: "warn" });
      score -= 5;
    } else {
      facts.push({ label: "Who's behind it", value: `Lists ${contactBits.join(", ")}`, tone: "good" });
      score += 5;
    }

    // policies
    const hasRefund = /refund|return policy|returns/i.test(html);
    const hasPrivacy = /privacy/i.test(html);
    const hasTerms = /terms (of|&|and) (service|use|conditions)/i.test(html);
    signals.policies = { refund: hasRefund, privacy: hasPrivacy, terms: hasTerms };
    if (!hasRefund && thin) {
      // can't tell
    } else if (!hasRefund) {
      facts.push({ label: "Refund policy", value: "No refund or return policy linked", tone: "bad" });
      score -= 10;
    } else {
      facts.push({ label: "Refund policy", value: "Return/refund policy is linked", tone: "neutral" });
    }

    // socials
    const socials = ["instagram.com", "facebook.com", "tiktok.com", "youtube.com", "x.com", "twitter.com"].filter((s) => lower.includes(s));
    signals.socials = socials;
    if (socials.length === 0 && thin) {
      // can't tell
    } else if (socials.length === 0) {
      facts.push({ label: "Social presence", value: "No social media links on the site", tone: "warn" });
      score -= 5;
    } else {
      score += 5;
    }

    // urgency / pressure tactics
    const urgencyHits = URGENCY.filter((re) => re.test(text)).length;
    signals.urgency_hits = urgencyHits;
    if (urgencyHits >= 3) {
      facts.push({ label: "Pressure tactics", value: `${urgencyHits} urgency phrases (countdowns, "only X left", "closing sale")`, tone: "bad" });
      score -= 10;
    } else if (urgencyHits > 0) {
      facts.push({ label: "Pressure tactics", value: `${urgencyHits} urgency phrase${urgencyHits > 1 ? "s" : ""} on the page`, tone: "warn" });
      score -= 3;
    }

    // discounts
    const discounts = [...text.matchAll(/(\d{2})\s?%\s?(off|discount)/gi)].map((m) => parseInt(m[1], 10));
    const maxDiscount = discounts.length ? Math.max(...discounts) : 0;
    signals.max_discount = maxDiscount;
    if (maxDiscount >= 70 && (age.days === null || age.days < 730)) {
      facts.push({ label: "Pricing", value: `Advertising ${maxDiscount}% off on a new store — deep discounts are the classic knockoff tell`, tone: "bad" });
      score -= 10;
    } else if (maxDiscount >= 70) {
      facts.push({ label: "Pricing", value: `Advertising ${maxDiscount}% off — fine for an established store running a sale`, tone: "neutral" });
    }

    // brand knockoff check
    const tl = (title + " " + text.slice(0, 3000)).toLowerCase();
    const brandHit = BRANDS.find((b) => tl.includes(b) && !domain.includes(b.replace(/[^a-z]/g, "")));
    signals.brand_mentioned = brandHit ?? null;
    if (brandHit) {
      facts.push({ label: "Brand check", value: `Sells "${brandHit}" products but isn't the brand's own site — verify it's an authorized seller`, tone: "warn" });
      score -= 10;
    }

    // payment
    const payments = ["paypal", "stripe", "shop pay", "apple pay", "google pay", "klarna", "afterpay"].filter((p) => lower.includes(p));
    signals.payments = payments;
    if (payments.length) {
      facts.push({ label: "Checkout", value: `Offers ${payments.slice(0, 3).join(", ")} — buyer protection available`, tone: "good" });
      score += 3;
    }
  }

  // --- HTTPS ---
  if (target.protocol !== "https:") {
    facts.push({ label: "Security", value: "Site isn't using HTTPS", tone: "bad" });
    score -= 15;
  }

  // --- Database: prior checks + community reports (feed into the score) ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const [{ count: priorChecks }, { data: priorReports }] = await Promise.all([
    supabase.from("checks").select("*", { count: "exact", head: true }).eq("domain", domain),
    supabase.from("reports").select("outcome").eq("domain", domain),
  ]);
  const reportSummary = { arrived_ok: 0, arrived_junk: 0, never_arrived: 0, refunded: 0 } as Record<string, number>;
  for (const r of priorReports ?? []) reportSummary[r.outcome] = (reportSummary[r.outcome] ?? 0) + 1;
  const badReports = reportSummary.arrived_junk + reportSummary.never_arrived;
  const goodReports = reportSummary.arrived_ok;

  // Domain age is the strongest signal we have. Scam storefronts are almost always
  // weeks or months old; a site that has existed for years rarely deserves red
  // on page heuristics alone (community reports can still drag it down below).
  if (age.days !== null && age.days > 3650) score = Math.max(score, 65);
  else if (age.days !== null && age.days > 1825) score = Math.max(score, 50);

  // Community reports override everything: real people, real outcomes.
  if (badReports > 0) {
    facts.unshift({ label: "Community", value: `${badReports} ${badReports === 1 ? "person" : "people"} reported junk or nothing arrived from this store`, tone: "bad" });
    score -= Math.min(40, 15 * badReports);
  } else if (goodReports > 0) {
    facts.unshift({ label: "Community", value: `${goodReports} ${goodReports === 1 ? "person" : "people"} reported their order arrived as advertised`, tone: "good" });
    score += Math.min(10, 3 * goodReports);
  }

  score = Math.max(0, Math.min(100, score));
  const verdict: "green" | "yellow" | "red" = score >= 65 ? "green" : score >= 40 ? "yellow" : "red";
  const headline =
    verdict === "green" ? "Checks out so far." :
    verdict === "yellow" ? "Couldn't verify. Proceed carefully." :
    "Multiple red flags. I'd pass.";

  // --- Save this check ---
  const { data: inserted } = await supabase
    .from("checks")
    .insert({ domain, url: target.toString(), verdict, score, facts, signals })
    .select("id")
    .single();

  return json({
    id: inserted?.id ?? null,
    domain,
    url: target.toString(),
    final_url: finalUrl,
    title: signals.title ?? null,
    verdict,
    score,
    headline,
    facts,
    prior_checks: priorChecks ?? 0,
    reports: reportSummary,
    checked_at: new Date().toISOString(),
  });
});

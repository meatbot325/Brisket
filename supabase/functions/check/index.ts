import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Fact = { label: string; value: string; tone: "good" | "warn" | "bad" | "neutral"; why?: string };

// Plain-English "why this matters" for each kind of fact.
const WHY: Record<string, string> = {
  "Store age": "Scam storefronts are usually weeks or months old; they get shut down and reopen under a new name. A domain that has been around for years has a track record.",
  "Website": "What we could and couldn't read on the store's page.",
  "Redirect": "The link you were given sends you somewhere else. Honest stores rarely bounce you between domains.",
  "Platform": "Some store-builder platforms are heavily used by throwaway dropship shops.",
  "Who's behind it": "A real business tells you how to reach it. No phone, no address, no email means nobody to call when the order goes wrong.",
  "Refund policy": "'Linked' only means a returns page exists, not that it's generous. Read it before you buy; no policy at all is a bad sign.",
  "Social presence": "Legit stores usually link their Instagram or Facebook. Its absence isn't proof of anything, but it's one less thing to verify.",
  "Pressure tactics": "Countdown timers, 'only 3 left', 'closing sale' — phrases built to stop you from thinking. One is normal marketing; several together is a pattern.",
  "Pricing": "70%+ off on a brand-new store is the classic knockoff setup: the photo is real, the product isn't.",
  "Brand check": "The page names a big brand but the site isn't the brand's own. Could be a real reseller; could be a counterfeit. Check the brand's site for authorized sellers.",
  "Checkout": "PayPal, Shop Pay, Apple Pay and credit cards let you dispute a charge if junk shows up. Wire transfers, Zelle and crypto don't.",
  "Security": "No padlock means your card details aren't encrypted on the way to them. Never buy on a site without HTTPS.",
  "Track record": "The Internet Archive has been taking snapshots of the web since 1996. A store it first saw years ago has been around; one it first saw last month hasn't.",
  "Archived copy": "The live site blocked our automated check, so we read the most recent copy saved by the Internet Archive instead. It may be a little out of date.",
  "Popularity": "Based on the Tranco list of the world's most-visited websites. Scam storefronts don't get enough traffic to show up; established stores do. Not being listed is normal for small shops.",
  "Domain paid up": "Throwaway stores register their address for one year. A business that has paid for its domain years in advance plans to be around.",
  "Email": "Real businesses set up company email, and the careful ones add anti-spoofing protection (DMARC) so nobody can send mail pretending to be them. Throwaway stores rarely bother.",
  "Safe Browsing": "Google keeps a list of sites caught phishing or spreading malware. Being off the list doesn't prove a store is honest, but being on it is an instant no.",
  "Domain history": "Scammers buy old, expired web addresses so the store looks established. We compare what this address was a few years ago with what it is now.",
  "Domain name": "Knockoff stores often use addresses like brand-outlet-sale.shop or a one-letter misspelling of a real brand.",
  "Catalog": "On Shopify stores we can see when products were first listed. A store whose entire catalog appeared last month is brand new, whatever the domain says.",
  "Returns": "We opened their returns page to see what it actually promises.",
  "Ships from": "Many 'US' stores are fronts for sellers shipping straight from China. Long shipping times, AliExpress dropshipping apps, and Chinese hosting or email give it away before you pay; otherwise you find out weeks later, and a return can cost more than the item.",
  "Site age": "Brand-new websites deserve extra care, but new businesses have to start somewhere. For a service, who's behind it matters more than how old the address is.",
  "Kind of site": "Sniffd checks shops and services differently. A service has no shipping or returns to judge, so we look at terms, who runs it, and how it asks to be paid.",
  "Terms": "A real service spells out its terms and what it does with your data. No terms means no agreement to point to if things go wrong.",
  "Payment red flag": "Fees to unlock money, gift cards, crypto, wire transfers: payments you can't take back. Real companies that pay you never ask you to pay first.",
  "Promises": "Guaranteed income or returns is the oldest line in the book. Real businesses say 'estimate' and 'may'.",
  "Parent company": "New sites from established companies are common. We check whether the older site really links back, because anyone can claim to be part of a bigger brand.",
  "Community": "Real outcomes reported by other Sniffd users who ordered from this store. This outweighs everything else.",
};

function shortCode(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

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

async function domainAgeDays(domain: string): Promise<{ days: number | null; registered: string | null; registrar: string | null; expires?: string | null }> {
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
    const exp = (d.events ?? []).find((e: any) => e.eventAction === "expiration");
    const expires = exp?.eventDate ? new Date(exp.eventDate).toISOString().slice(0, 10) : null;
    if (!ev?.eventDate) return { days: null, registered: null, registrar, expires };
    const reg = new Date(ev.eventDate);
    const days = Math.floor((Date.now() - reg.getTime()) / 86400000);
    return { days, registered: reg.toISOString().slice(0, 10), registrar, expires };
  } catch {
    return { days: null, registered: null, registrar: null };
  }
}

// Big storefronts put contact/returns links in the footer, at the end of very large pages.
const MAX_HTML = 3_000_000;

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

// --- Internet Archive (Wayback Machine) ---
// Used two ways: when the store was first seen (track record), and as a fallback
// copy of the page when the live site blocks automated requests.
async function firstArchived(domain: string): Promise<{ date: string | null; none: boolean }> {
  try {
    const r = await fetchWithTimeout(`https://web.archive.org/cdx/search/cdx?url=${domain}&limit=1&output=json&fl=timestamp`, 6000);
    if (!r.ok) return { date: null, none: false };
    const rows = await r.json();
    const ts: string | undefined = rows?.[1]?.[0];
    if (!ts) return { date: null, none: true };
    return { date: `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`, none: false };
  } catch {
    return { date: null, none: false };
  }
}

async function closestSnapshot(url: string): Promise<{ ts: string; original: string } | null> {
  try {
    const r = await fetchWithTimeout(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, 6000);
    if (!r.ok) return null;
    const c = (await r.json())?.archived_snapshots?.closest;
    if (!c?.available || String(c.status) !== "200") return null;
    const original = String(c.url).replace(/^https?:\/\/web\.archive\.org\/web\/\d+\//, "");
    return { ts: String(c.timestamp), original };
  } catch {
    return null;
  }
}

async function fetchArchivedPage(target: URL, domain: string): Promise<{ html: string; ts: string; original: string; bytes: number } | null> {
  const snap = (await closestSnapshot(target.toString())) ?? (await closestSnapshot(domain));
  if (!snap) return null;
  try {
    const r = await fetchWithTimeout(`https://web.archive.org/web/${snap.ts}id_/${snap.original}`, 9000);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_HTML)), ts: snap.ts, original: snap.original, bytes: buf.byteLength };
  } catch {
    return null;
  }
}

// What the site was a few years ago (title of an Internet Archive snapshot).
async function pastTitle(domain: string, yearsAgo = 3): Promise<{ title: string; ts: string } | null> {
  try {
    const to = String(new Date().getUTCFullYear() - yearsAgo);
    const r = await fetchWithTimeout(`https://web.archive.org/cdx/search/cdx?url=${domain}&to=${to}&limit=-1&output=json&fl=timestamp,original&filter=statuscode:200`, 6000);
    if (!r.ok) return null;
    const row = (await r.json())?.[1];
    if (!row) return null;
    const page = await fetchWithTimeout(`https://web.archive.org/web/${row[0]}id_/${row[1]}`, 7000);
    if (!page.ok) return null;
    const html = new TextDecoder("utf-8", { fatal: false }).decode((await page.arrayBuffer()).slice(0, 400_000));
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    return title ? { title, ts: String(row[0]) } : null;
  } catch {
    return null;
  }
}

// Tranco top-sites list (top 1M). rank 0 = not listed, null = lookup failed.
async function trancoRank(domain: string): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(`https://tranco-list.eu/api/ranks/domain/${domain}`, 5000);
    if (!r.ok) return null;
    const ranks = (await r.json())?.ranks;
    if (!Array.isArray(ranks)) return null;
    return typeof ranks[0]?.rank === "number" ? ranks[0].rank : 0;
  } catch {
    return null;
  }
}

async function dnsLookup(name: string, type: "MX" | "TXT" | "A"): Promise<string[] | null> {
  try {
    const r = await fetchWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, 4000);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.Status !== 0 && d.Status !== 3) return null;
    const code = type === "MX" ? 15 : type === "A" ? 1 : 16;
    return (d.Answer ?? []).filter((a: any) => a.type === code).map((a: any) => String(a.data));
  } catch {
    return null;
  }
}

async function emailSetup(domain: string) {
  const [mx, dmarc] = await Promise.all([dnsLookup(domain, "MX"), dnsLookup(`_dmarc.${domain}`, "TXT")]);
  if (mx === null) return null;
  const hosts = mx.map((m) => m.split(" ").pop()!.toLowerCase()).filter((h) => h && h !== ".");
  const chinaMail = hosts.some((h) => /(qq\.com|163\.com|126\.com|aliyun|alibaba|mxhichina|sina\.net|exmail)/.test(h));
  const provider = chinaMail ? "a Chinese email service" : hosts.some((h) => /google(mail)?\.com\.?$/.test(h)) ? "Google Workspace"
    : hosts.some((h) => h.includes("outlook.com") || h.includes("protection.outlook")) ? "Microsoft 365"
    : hosts.length ? "its own mail server" : null;
  const policy = (dmarc ?? []).join(" ").match(/v=DMARC1[^"]*?p=(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null;
  return { receives: hosts.length > 0, provider, dmarc: policy, chinaMail };
}

// Google Safe Browsing (needs the GOOGLE_SAFE_BROWSING_KEY secret; skipped without it).
async function safeBrowsing(urls: string[]): Promise<boolean | null> {
  const key = Deno.env.get("GOOGLE_SAFE_BROWSING_KEY");
  if (!key) return null;
  try {
    const r = await fetchWithTimeout(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`, 5000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "sniffd", clientVersion: "1" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map((url) => ({ url })),
        },
      }),
    });
    if (!r.ok) return null;
    return ((await r.json())?.matches ?? []).length > 0;
  } catch {
    return null;
  }
}

// Shopify exposes product creation dates; the oldest one tells us how long the store has really been selling.
async function shopifyCatalog(origin: string): Promise<{ oldest: string; count: number } | null> {
  try {
    const r = await fetchWithTimeout(`${origin}/products.json?limit=250`, 5000, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const products = (await r.json())?.products;
    if (!Array.isArray(products) || !products.length) return null;
    const dates = products.map((p: any) => p.created_at || p.published_at).filter(Boolean).map((d: string) => new Date(d).getTime()).filter((t: number) => !isNaN(t));
    if (!dates.length) return null;
    return { oldest: new Date(Math.min(...dates)).toISOString().slice(0, 10), count: products.length };
  } catch {
    return null;
  }
}

// Open the store's returns page and read what it promises.
async function readReturnsPage(url: string): Promise<{ days: number | null; china: boolean; creditOnly: boolean } | null> {
  try {
    const r = await fetchWithTimeout(url, 6000, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36" } });
    if (!r.ok) return null;
    const text = strip(new TextDecoder("utf-8", { fatal: false }).decode((await r.arrayBuffer()).slice(0, MAX_HTML)));
    let days: number | null = null;
    for (const m of text.matchAll(/(\d{1,3})[\s-]*(?:calendar |business )?days?\b/gi)) {
      const around = text.slice(Math.max(0, m.index! - 120), m.index! + 120);
      const n = parseInt(m[1], 10);
      if (n >= 3 && n <= 365 && /return|refund|exchange/i.test(around)) { days = n; break; }
    }
    const china = /\b(china|shenzhen|guangzhou|hong kong|yiwu|dongguan|hangzhou)\b/i.test(text);
    const creditOnly = /store credit only|only (offer|issue|provide) store credit|all sales are final|no refunds/i.test(text);
    return { days, china, creditOnly };
  } catch {
    return null;
  }
}

const CHEAP_TLDS = ["shop", "top", "xyz", "store", "online", "site", "buzz", "cfd", "sbs", "click", "icu", "vip", "cyou", "bond", "monster", "lol", "fun", "live", "space", "website"];
const SALE_WORDS = /(outlet|sale|clearance|discount|cheap|deals?|factory|warehouse|official|store|shop|online)/;

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const STOP = new Set(["home", "page", "welcome", "official", "site", "website", "online", "shop", "store", "the", "and", "for", "with", "buy", "best", "your", "our", "free", "shipping", "com", "net", "org", "www", "inc", "llc", "amp"]);
function titleWords(t: string): Set<string> {
  return new Set(t.toLowerCase().replace(/&amp;/g, "&").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}

// Where the website's server is. Most stores sit behind Cloudflare/Shopify, which hides
// this, so we only speak up when the server itself is in China or Hong Kong.
async function hosting(domain: string): Promise<{ country: string | null; org: string | null; china: boolean } | null> {
  try {
    const ips = await dnsLookup(domain, "A");
    const ip = ips?.find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x));
    if (!ip) return null;
    const r = await fetchWithTimeout(`https://ipwho.is/${ip}?fields=country_code,connection`, 4000);
    if (!r.ok) return null;
    const d = await r.json();
    const country = d?.country_code ?? null;
    const org = d?.connection?.org ?? d?.connection?.isp ?? null;
    const china = country === "CN" || country === "HK" || /alibaba|aliyun|tencent|huawei|baidu|china (telecom|unicom|mobile)/i.test(String(org ?? ""));
    return { country, org, china };
  } catch {
    return null;
  }
}

// Read the shipping policy for delivery times and overseas wording.
async function readShippingPage(url: string): Promise<{ maxDays: number | null; minDays: number | null; overseas: boolean } | null> {
  try {
    const r = await fetchWithTimeout(url, 6000, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36" } });
    if (!r.ok) return null;
    const text = strip(new TextDecoder("utf-8", { fatal: false }).decode((await r.arrayBuffer()).slice(0, MAX_HTML)));
    return { ...shippingTimes(text), overseas: OVERSEAS.test(text) };
  } catch {
    return null;
  }
}

const OVERSEAS = /(international|overseas) warehouse|ships? (directly )?from (china|overseas|our overseas)|shipped from (china|overseas)|allow \d+\s*(?:-|–|to)\s*\d+ weeks/i;

// Standard (domestic) delivery time. International, express and processing-time
// ranges are skipped; of what's left we take the fastest, i.e. the store's default.
function shippingTimes(text: string): { minDays: number | null; maxDays: number | null } {
  let minDays: number | null = null, maxDays: number | null = null;
  const re = /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*(business |working |calendar )?(days?|weeks?)/gi;
  for (const m of text.matchAll(re)) {
    if (!/ship|deliver|arriv/i.test(text.slice(Math.max(0, m.index! - 120), m.index! + 40))) continue;
    // Only the words in the same clause decide what kind of range this is.
    const before = text.slice(Math.max(0, m.index! - 90), m.index!);
    const clause = before.slice(Math.max(before.lastIndexOf("."), before.lastIndexOf(";"), before.lastIndexOf("|")) + 1);
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 30).split(/[.;|]/)[0];
    if (/international|worldwide|canada|europe|australia|\buk\b|united kingdom|rest of (the )?world|outside|express|expedited|overnight|priority|process|return|refund|exchange/i.test(clause + after)) continue;
    const k = /week/i.test(m[4]) ? 7 : 1;
    const lo = parseInt(m[1], 10) * k, hi = parseInt(m[2], 10) * k;
    if (hi < lo || hi > 90) continue;
    if (maxDays === null || hi < maxDays) { maxDays = hi; minDays = lo; }
  }
  return { minDays, maxDays };
}

const DROPSHIP_APPS: [RegExp, string][] = [
  [/dsers/i, "DSers"], [/cjdropshipping|cj dropshipping/i, "CJ Dropshipping"], [/zendrop/i, "Zendrop"],
  [/autods/i, "AutoDS"], [/ali-?reviews|alireviews/i, "Ali Reviews"], [/eprolo/i, "EPROLO"],
  [/dropshipman/i, "Dropshipman"], [/hypersku/i, "HyperSKU"], [/aliexpress/i, "AliExpress"],
];

// "A part of X": check the claimed parent site's age and whether it links back to us.
async function parentSite(parent: string, ownDomain: string): Promise<{ domain: string; registered: string | null; days: number | null; linksBack: boolean } | null> {
  try {
    const [age, home] = await Promise.all([
      domainAgeDays(parent),
      fetchWithTimeout(`https://${parent}/`, 6000, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36" } })
        .then(async (r) => (r.ok ? new TextDecoder("utf-8", { fatal: false }).decode((await r.arrayBuffer()).slice(0, MAX_HTML)) : ""))
        .catch(() => ""),
    ]);
    return { domain: parent, registered: age.registered, days: age.days, linksBack: home.toLowerCase().includes(ownDomain) };
  } catch {
    return null;
  }
}

const NOT_PARENTS = /^(instagram|facebook|fb|x|twitter|youtube|youtu|linkedin|tiktok|pinterest|threads|google|googleapis|gstatic|apple|w3|schema|shopify|cloudflare|wordpress|wix|squarespace|vimeo|spotify|medium|substack|github|stripe|paypal|klaviyo|hubspot|calendly|typeform|transistor)$/;
const GENERIC_TITLE_WORDS = new Set(["labs", "lab", "get", "paid", "business", "businesses", "everyday", "work", "group", "company", "global", "services", "service", "solutions", "agency", "news", "best", "new", "app"]);

function headlineFor(verdict: string): string {
  return verdict === "green" ? "Checks out so far." :
    verdict === "yellow" ? "Couldn't verify. Proceed carefully." :
    "Multiple red flags. I'd pass.";
}

function monthYear(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
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

  const dryRun = body?.dry_run === true; // testing: run every check but don't save it
  // Where the check came from (a count for the tester numbers; nothing about the person)
  const SOURCES = ["web", "android-app", "ios-app", "ios-share"];
  const source = SOURCES.includes(body?.source) ? body.source : "web";
  const domain = rootDomain(target.hostname);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- Same store within a day: same answer, instantly ---
  // Outside lookups sometimes time out, which nudged scores around between checks.
  // Reuse the last full check of this store from the past 24 hours, unless new buyer
  // reports came in since (those change the verdict) or the caller asks for a fresh look
  // ({ fresh: true }). A dry run may read a saved result but never writes.
  if (body?.fresh !== true) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await supabase.from("checks")
      .select("id, url, verdict, score, facts, signals, created_at")
      .eq("domain", domain).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(10);
    // Only reuse a complete check (domain age found), never a copy of a copy.
    const base = (recent ?? []).find((r: any) => r.signals && r.signals.domain_age_days != null && !r.signals.cached_from);
    if (base) {
      const [{ count: newReports }, { count: priorChecks }, { data: priorReports }] = await Promise.all([
        supabase.from("reports").select("*", { count: "exact", head: true }).eq("domain", domain).gt("created_at", base.created_at),
        supabase.from("checks").select("*", { count: "exact", head: true }).eq("domain", domain),
        supabase.from("reports").select("outcome").eq("domain", domain),
      ]);
      if (!newReports) {
        const reportSummary = { arrived_ok: 0, arrived_junk: 0, never_arrived: 0, refunded: 0 } as Record<string, number>;
        for (const r of priorReports ?? []) reportSummary[r.outcome] = (reportSummary[r.outcome] ?? 0) + 1;
        // Saved as its own row so each person gets their own share link and app use is counted.
        let inserted: { id: string; code: string } | null = null;
        for (let attempt = 0; attempt < 2 && !inserted && !dryRun; attempt++) {
          const { data, error } = await supabase.from("checks")
            .insert({ domain, url: target.toString(), verdict: base.verdict, score: base.score, facts: base.facts, signals: { ...base.signals, cached_from: base.id }, code: shortCode(), source })
            .select("id, code").single();
          if (!error) inserted = data;
        }
        return json({
          id: inserted?.id ?? null,
          code: inserted?.code ?? null,
          domain,
          url: target.toString(),
          final_url: base.url,
          title: base.signals?.title ?? null,
          verdict: base.verdict,
          score: base.score,
          headline: headlineFor(base.verdict),
          facts: base.facts,
          prior_checks: priorChecks ?? 0,
          reports: reportSummary,
          checked_at: base.created_at,
          cached: true,
        });
      }
    }
  }

  const facts: Fact[] = [];
  const signals: Record<string, unknown> = {};
  let score = 50;

  // --- Fetch the page and RDAP in parallel ---
  const [pageRes, age, archive] = await Promise.all([
    fetchWithTimeout(target.toString(), 9000, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }).catch(() => null),
    domainAgeDays(domain),
    firstArchived(domain),
  ]);
  // Independent lookups; awaited further down.
  const pastP = pastTitle(domain);
  const rankP = trancoRank(domain);
  const emailP = emailSetup(domain);
  const sbP = safeBrowsing([target.toString(), `https://${domain}/`]);
  const hostP = hosting(domain);
  const chinaSigns: string[] = [];
  let fastShipping: string | null = null;
  let pageKind: "shop" | "service" | "offer" = "shop";
  let parentP: Promise<Awaited<ReturnType<typeof parentSite>>> = Promise.resolve(null);
  let slowShipping: string | null = null;

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
  let archived: { html: string; ts: string; original: string; bytes: number } | null = null;
  if (!pageRes || !pageRes.ok) {
    signals.fetch_ok = false;
    signals.fetch_status = pageRes?.status ?? null;
    const blocked = pageRes && [401, 403, 429, 503].includes(pageRes.status);
    // Fall back to the Internet Archive's most recent copy so the page checks still run.
    archived = await fetchArchivedPage(target, domain);
    if (archived) {
      const when = monthYear(`${archived.ts.slice(0, 4)}-${archived.ts.slice(4, 6)}-${archived.ts.slice(6, 8)}`);
      signals.archived_copy = { ts: archived.ts, url: archived.original };
      facts.push({ label: "Archived copy", value: `Live site ${blocked ? "blocked our automated check" : "didn't load"}, so we read the Internet Archive's copy from ${when}`, tone: "neutral" });
      html = archived.html;
      signals.html_bytes = archived.bytes;
    } else if (blocked && age.days !== null && age.days > 730) {
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
    html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_HTML));
    signals.html_bytes = buf.byteLength;
  }

  if (html) {
    const text = strip(html);
    const lower = html.toLowerCase();

    // redirected to a different domain? (not meaningful for an archived copy)
    const finalDomain = archived ? domain : rootDomain(new URL(finalUrl).hostname);
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

    // Shop, service, or an offer to pay you? They get judged differently.
    const shopSignals = ["Shopify", "WooCommerce", "BigCommerce", "Shoplazza"].includes(platform) || /add to (cart|bag|basket)|buy now|shopping (cart|bag)|href=["'][^"']*\/cart\b/i.test(lower);
    // An offer to pay you: said in the page title, or pitched repeatedly on the page.
    const OFFER = /get paid|earn (up to )?\$|passive income|make money|(guaranteed|high|monthly|weekly) returns|investment opportunit|referral (reward|bonus)/gi;
    const offerHits = new Set([...text.matchAll(OFFER)].map((m) => m[0].toLowerCase().replace(/\$.*/, "$"))).size;
    const offerSignals = new RegExp(OFFER.source, "i").test(title) || offerHits >= 3;
    const serviceSignals = /book a (call|demo|consultation)|schedule a (call|demo|consultation)|free trial|request a (quote|demo)|see if you qualify|apply now|our services|consultation|subscription plans?|pricing plans?|plans start/i.test(text);
    pageKind = shopSignals ? "shop" : offerSignals ? "offer" : serviceSignals ? "service" : "shop";
    signals.page_kind = pageKind;
    if (pageKind === "service") {
      facts.push({ label: "Kind of site", value: "A service, not a store, so Sniffd checked it as a business: no shipping or returns to judge", tone: "neutral" });
    } else if (pageKind === "offer") {
      facts.push({ label: "Kind of site", value: "Offers to pay you rather than sell to you. Real ones never ask for a fee up front", tone: "neutral" });
    }

    // Claimed parent company ("A part of The Deep View") on a young site: verify it.
    if (age.days !== null && age.days < 730) {
      const brandWords = [...titleWords(title)].filter((w) => w.length >= 4 && !GENERIC_TITLE_WORDS.has(w));
      const claims = /a part of|part of the|a division of|subsidiary of|sister (company|site|brand)|brought to you by|from the (team|makers|people) behind/i.test(text);
      const hosts = [...new Set([...html.matchAll(/href=["']https?:\/\/([a-z0-9.-]+)/gi)].map((m) => rootDomain(m[1])))]
        .filter((d) => d !== domain && !NOT_PARENTS.test(d.split(".")[0]) && !BRANDS.some((b) => d.split(".")[0] === b.replace(/[^a-z]/g, "")));
      const parent = hosts.find((d) => { const lbl = d.split(".")[0]; const hits = brandWords.filter((w) => lbl.includes(w)).length; return hits >= 2 || (claims && hits >= 1); });
      if (parent) parentP = parentSite(parent, domain);
    }

    // Thin app shells (React/Vue storefronts) give us almost no text; don't punish silence.
    const thin = text.trim().length < 1500;
    signals.text_length = text.trim().length;
    if (thin) {
      facts.push({ label: "Website", value: "Page loads its content with scripts, so we could only read the basics", tone: "neutral" });
    }
    // Archived copies can be missing script-loaded parts, so only count what we do find.
    const partial = thin || !!archived;

    // Follow-up fetches on the live site: returns page and (Shopify) catalog dates.
    const base = archived ? null : new URL(finalUrl);
    const returnsHref = html.match(/href=["']([^"'#]*(?:return|refund)[^"'#]*)["']/i)?.[1];
    let returnsUrl: string | null = null;
    try { if (base && returnsHref) { const u = new URL(returnsHref.replace(/&amp;/g, "&"), base); if (rootDomain(u.hostname) === domain) returnsUrl = u.toString(); } } catch { /* ignore */ }
    const returnsP = returnsUrl ? readReturnsPage(returnsUrl) : Promise.resolve(null);
    const catalogP = base && platform === "Shopify" ? shopifyCatalog(base.origin) : Promise.resolve(null);
    const shipHref = html.match(/href=["']([^"'#]*(?:shipping|delivery)[^"'#]*)["']/i)?.[1];
    let shipUrl: string | null = null;
    try { if (base && shipHref) { const u = new URL(shipHref.replace(/&amp;/g, "&"), base); if (rootDomain(u.hostname) === domain && u.toString() !== returnsUrl) shipUrl = u.toString(); } } catch { /* ignore */ }
    const shipP = shipUrl ? readShippingPage(shipUrl) : Promise.resolve(null);

    // contact info
    const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
    const hasPhone = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(text);
    const hasAddress = /\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\s(street|st\.?|avenue|ave\.?|road|rd\.?|blvd|boulevard|drive|dr\.?|lane|ln\.?|way|suite|ste\.?)\b/i.test(text);
    const hasContactLink = /href=["'][^"']*(contact|about)[^"']*["']/i.test(html);
    signals.contact = { email: hasEmail, phone: hasPhone, address: hasAddress, contact_page: hasContactLink };
    const contactBits = [hasEmail && "email", hasPhone && "phone", hasAddress && "street address"].filter(Boolean) as string[];
    if (partial && contactBits.length === 0) {
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
    const hasTermsLink = hasTerms || /href=["'][^"']*(terms|legal)[^"']*["']/i.test(html);
    if (pageKind !== "shop") {
      // Services don't have returns; terms of service and a privacy policy are what count.
      if (hasTermsLink && hasPrivacy) {
        facts.push({ label: "Terms", value: "Has terms of service and a privacy policy", tone: "good" });
        score += 3;
      } else if (hasTermsLink || hasPrivacy) {
        facts.push({ label: "Terms", value: hasPrivacy ? "Has a privacy policy, but no terms of service" : "Has terms of service, but no privacy policy", tone: "neutral" });
      } else if (!partial) {
        facts.push({ label: "Terms", value: "No terms of service or privacy policy", tone: "warn" });
        score -= 5;
      }
    } else if (!hasRefund && partial) {
      // can't tell
    } else if (!hasRefund) {
      facts.push({ label: "Refund policy", value: "No refund or return policy linked", tone: "bad" });
      score -= 10;
    } else {
      const ret = await returnsP;
      signals.returns = ret;
      if (ret?.days) {
        facts.push({ label: "Refund policy", value: `${ret.days}-day returns, according to their returns page`, tone: ret.days >= 14 ? "good" : "neutral" });
        if (ret.days >= 14) score += 3;
      } else {
        facts.push({ label: "Refund policy", value: "Return/refund policy is linked", tone: "neutral" });
      }
      if (ret?.creditOnly) {
        facts.push({ label: "Returns", value: "Returns page says store credit only or all sales final", tone: "warn" });
        score -= 5;
      }
      if (ret?.china) {
        facts.push({ label: "Returns", value: "Returns page mentions an address in China — returning an item could cost more than it's worth", tone: "warn" });
        score -= 5;
      }
    }

    // socials
    const socials = ["instagram.com", "facebook.com", "tiktok.com", "youtube.com", "x.com", "twitter.com"].filter((s) => lower.includes(s));
    signals.socials = socials;
    if (socials.length === 0 && partial) {
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
    // Whole words only ("levi" must not match "television"); only shops "sell" brands.
    const brandHit = pageKind !== "shop" ? undefined : BRANDS.find((b) => new RegExp(`\\b${b.replace(/[-\s]/g, "[-\\s]?")}\\b`).test(tl) && !domain.includes(b.replace(/[^a-z]/g, "")));
    signals.brand_mentioned = brandHit ?? null;
    if (brandHit) {
      facts.push({ label: "Brand check", value: `Sells "${brandHit}" products but isn't the brand's own site — verify it's an authorized seller`, tone: "warn" });
      score -= 10;
    }

    // Services and pay-you offers: upfront fees and guaranteed money
    if (pageKind !== "shop") {
      const fee = text.match(/(processing|activation|registration|release|unlock|verification|clearance|withdrawal) fee|pay (a|the) (small |one-time )?fee to|pay (with|in|using) (bitcoin|crypto|gift cards?)|gift cards? as payment|western union|moneygram/i);
      if (fee) {
        facts.push({ label: "Payment red flag", value: `Mentions "${fee[0]}" — the classic setup for payments you can't take back`, tone: "bad" });
        score -= 20;
      }
      const promise = [...text.matchAll(/guaranteed? (income|returns?|profits?|payouts?|earnings|payments?|results)/gi)]
        .find((m) => !/\b(not|no|never|isn't|doesn't|without|nor)\b/i.test(text.slice(Math.max(0, m.index! - 25), m.index!)));
      if (promise) {
        facts.push({ label: "Promises", value: `Promises "${promise[0]}" — real businesses don't guarantee money`, tone: "warn" });
        score -= 10;
      }
    }

    // Shopify catalog age
    const catalog = await catalogP;
    signals.catalog = catalog;
    if (catalog) {
      const days = Math.floor((Date.now() - new Date(catalog.oldest + "T00:00:00Z").getTime()) / 86400000);
      if (days >= 365) {
        facts.push({ label: "Catalog", value: `Has been listing products since ${monthYear(catalog.oldest)}`, tone: "good" });
        score += 3;
      } else if (days < 45) {
        facts.push({ label: "Catalog", value: `Every product was added in the last ${Math.max(1, Math.round(days / 7))} week${days >= 14 ? "s" : ""}`, tone: "warn" });
        score -= 5;
      } else {
        facts.push({ label: "Catalog", value: `Oldest product listed ${monthYear(catalog.oldest)}`, tone: "neutral" });
      }
    }

    // Where it really ships from
    const apps = DROPSHIP_APPS.filter(([re]) => re.test(lower)).map(([, name]) => name);
    signals.dropship_apps = apps;
    if (apps.length) chinaSigns.push(`uses ${apps.slice(0, 2).join(" and ")} (AliExpress dropshipping tools)`);
    const ship = await shipP;
    const pageTimes = shippingTimes(text);
    // Prefer the shipping page; fall back to what the store page itself says.
    const maxDays = ship?.maxDays ?? pageTimes.maxDays;
    const minDays = ship?.maxDays ? ship.minDays : pageTimes.minDays;
    signals.shipping = { page: shipUrl, min_days: minDays, max_days: maxDays, overseas: ship?.overseas ?? false };
    if (maxDays && maxDays >= 12 && (minDays ?? 0) >= 6) { chinaSigns.push(`${minDays}–${maxDays} day shipping`); slowShipping = `${minDays}–${maxDays} days`; }
    else if (maxDays && maxDays <= 7) fastShipping = `${minDays}–${maxDays} days`;
    if (ship?.overseas || OVERSEAS.test(text)) chinaSigns.push("mentions shipping from an overseas warehouse");

    // payment
    const payments = ["paypal", "stripe", "shop pay", "apple pay", "google pay", "klarna", "afterpay"].filter((p) => lower.includes(p));
    signals.payments = payments;
    if (payments.length) {
      facts.push({ label: "Checkout", value: `Offers ${payments.slice(0, 3).join(", ")} — buyer protection available`, tone: "good" });
      score += 3;
    }
  }

  // --- Track record (Internet Archive first sighting) ---
  signals.first_archived = archive.date;
  if (archive.date) {
    const days = Math.floor((Date.now() - new Date(archive.date + "T00:00:00Z").getTime()) / 86400000);
    if (days >= 730) {
      facts.push({ label: "Track record", value: `Internet Archive has seen this site since ${monthYear(archive.date)}`, tone: "good" });
      score += 5;
    } else if (days < 90) {
      facts.push({ label: "Track record", value: `Internet Archive first saw this site ${monthYear(archive.date)} — very recent`, tone: "warn" });
      score -= 5;
    } else {
      facts.push({ label: "Track record", value: `Internet Archive first saw this site ${monthYear(archive.date)}`, tone: "neutral" });
    }
  } else if (archive.none) {
    facts.push({ label: "Track record", value: "The Internet Archive has never saved a copy of this site", tone: age.days !== null && age.days > 730 ? "neutral" : "warn" });
    if (age.days === null || age.days <= 730) score -= 3;
  }

  // --- Domain history: was this address something else a few years ago? ---
  const past = await pastP;
  signals.past_title = past;
  const nowTitle = typeof signals.title === "string" ? signals.title as string : "";
  let historyFlagged = false;
  if (past && nowTitle) {
    const stem = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
    const a = titleWords(past.title), b = titleWords(nowTitle);
    const shared = [...a].some((w) => b.has(w)) || past.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(stem);
    const year = past.ts.slice(0, 4);
    if (!shared && a.size > 0 && b.size > 0) {
      const old = past.title.replace(/&amp;/g, "&").slice(0, 60);
      facts.push({ label: "Domain history", value: `In ${year} this address was a different site ("${old}")`, tone: "warn" });
      score -= 10;
      historyFlagged = true;
    } else if (shared) {
      facts.push({ label: "Domain history", value: `Same business at this address as in ${year}`, tone: "good" });
      score += 3;
    }
  }
  if (!historyFlagged && archive.date && age.registered && age.days !== null && age.days < 730) {
    const gapDays = (new Date(age.registered).getTime() - new Date(archive.date + "T00:00:00Z").getTime()) / 86400000;
    if (gapDays > 365) {
      facts.push({ label: "Domain history", value: `This address was in use before its current owner registered it in ${age.registered.slice(0, 4)}`, tone: "warn" });
      score -= 5;
    }
  }

  // --- Domain name tricks ---
  const label = domain.split(".")[0].toLowerCase();
  const tld = domain.split(".").pop()!.toLowerCase();
  const stems = BRANDS.map((b) => b.replace(/[^a-z]/g, ""));
  const typo = stems.find((b) => b.length >= 6 && label !== b && Math.abs(label.length - b.length) <= 1 && editDistance(label, b) === 1);
  const brandInName = stems.find((b) => b.length >= 4 && label !== b && label.includes(b));
  signals.domain_name = { typo: typo ?? null, brand_in_name: brandInName ?? null, tld };
  const domainTrick = !!typo || (!!brandInName && SALE_WORDS.test(label.replace(brandInName, "")));
  if (typo) {
    facts.push({ label: "Domain name", value: `Address looks like a misspelling of ${typo}.com`, tone: "bad" });
    score -= 20;
  } else if (brandInName && SALE_WORDS.test(label.replace(brandInName, ""))) {
    facts.push({ label: "Domain name", value: `Address mixes the brand "${brandInName}" with sale words — a common knockoff pattern`, tone: "bad" });
    score -= 15;
  } else if (CHEAP_TLDS.includes(tld) && (age.days === null || age.days < 730)) {
    facts.push({ label: "Domain name", value: `Uses a .${tld} address — cheap endings popular with throwaway stores`, tone: "warn" });
    score -= 5;
  } else {
    facts.push({ label: "Domain name", value: "Plain address — no brand look-alikes or throwaway endings", tone: "good" });
  }

  // --- Domain paid up ---
  signals.expires = age.expires ?? null;
  if (age.expires) {
    const yearsLeft = (new Date(age.expires).getTime() - Date.now()) / (365.25 * 86400000);
    if (yearsLeft >= 2) {
      facts.push({ label: "Domain paid up", value: `Domain is paid up through ${age.expires.slice(0, 4)}`, tone: "good" });
      score += 3;
    }
  }

  // --- Popularity (Tranco top 1M) ---
  const rank = await rankP;
  signals.tranco_rank = rank;
  if (rank && rank <= 10_000) {
    facts.push({ label: "Popularity", value: "Among the 10,000 most-visited sites on the web", tone: "good" });
    score += 10;
  } else if (rank && rank <= 100_000) {
    facts.push({ label: "Popularity", value: "Among the 100,000 most-visited sites on the web", tone: "good" });
    score += 7;
  } else if (rank) {
    facts.push({ label: "Popularity", value: "Among the 1 million most-visited sites on the web", tone: "good" });
    score += 4;
  }

  // --- Company email ---
  const email = await emailP;
  signals.email = email;
  if (email && !email.receives) {
    facts.push({ label: "Email", value: "This address can't receive email", tone: "warn" });
    score -= 5;
  } else if (email && (email.dmarc === "quarantine" || email.dmarc === "reject")) {
    facts.push({ label: "Email", value: `Company email${email.provider ? ` on ${email.provider}` : ""}, with anti-spoofing protection`, tone: "good" });
    score += 3;
  } else if (email) {
    facts.push({ label: "Email", value: `Company email${email.provider ? ` on ${email.provider}` : ""}, no anti-spoofing protection`, tone: "neutral" });
  }

  // --- Google Safe Browsing ---
  const flagged = await sbP;
  signals.safe_browsing = flagged;
  if (flagged === true) {
    facts.unshift({ label: "Safe Browsing", value: "Google lists this site as dangerous (phishing or malware)", tone: "bad" });
    score -= 60;
  } else if (flagged === false) {
    facts.push({ label: "Safe Browsing", value: "Not on Google's list of dangerous sites", tone: "good" });
  }

  // --- Services: softer on newness, credit a verified parent company ---
  if (pageKind !== "shop") {
    const ageFact = facts.find((f) => f.label === "Store age");
    if (ageFact) {
      ageFact.label = "Site age";
      ageFact.value = ageFact.value.replace(/^Domain/, "Website");
      if (age.days !== null && age.days < 30) score += 15; // -15 instead of -30
    }
  }
  const parent = await parentP;
  signals.parent_site = parent;
  if (parent && parent.days !== null && parent.days > 730) {
    const since = parent.registered ? parent.registered.slice(0, 4) : "years ago";
    if (parent.linksBack) {
      facts.push({ label: "Parent company", value: `Verified: ${parent.domain} (online since ${since}) links back to this site`, tone: "good" });
      score += 15;
    } else {
      facts.push({ label: "Parent company", value: `Says it's part of ${parent.domain} (online since ${since}), but that site doesn't link back, so we couldn't confirm it`, tone: "neutral" });
    }
  }

  // --- Ships from (China signals) ---
  const host = await hostP;
  signals.hosting = host;
  if (host?.china) chinaSigns.push(`website is hosted in ${host.country === "HK" ? "Hong Kong" : "China"}${host.org ? ` (${host.org})` : ""}`);
  if (email?.chinaMail) chinaSigns.push("company email runs on a Chinese email service");
  signals.china_signs = chinaSigns;
  // Slow shipping alone isn't proof: made-to-order brands ship slowly too. On an
  // established store, report it plainly instead of calling it overseas.
  const established = (age.days !== null && age.days > 1825) || !!(rank && rank <= 1_000_000);
  if (chinaSigns.length === 1 && slowShipping && established) {
    facts.push({ label: "Ships from", value: `Standard shipping takes ${slowShipping} — slow, but this store is well established`, tone: "neutral" });
  } else if (chinaSigns.length) {
    const s0 = chinaSigns.join("; ");
    facts.push({ label: "Ships from", value: `Likely ships from overseas: ${s0.charAt(0).toUpperCase() + s0.slice(1)}`, tone: chinaSigns.length >= 2 ? "bad" : "warn" });
    score -= Math.min(15, 6 * chinaSigns.length);
  } else if (fastShipping) {
    facts.push({ label: "Ships from", value: `Delivers in ${fastShipping} — consistent with a local warehouse`, tone: "good" });
    score += 2;
  }

  // --- HTTPS ---
  if (target.protocol !== "https:") {
    facts.push({ label: "Security", value: "Site isn't using HTTPS", tone: "bad" });
    score -= 15;
  }

  // --- Database: prior checks + community reports (feed into the score) ---
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
  // (Not when Google flags the site or the address imitates a brand: an old
  // look-alike domain is still a look-alike.)
  const noFloor = flagged === true || domainTrick;
  if (!noFloor && age.days !== null && age.days > 3650) score = Math.max(score, 65);
  else if (!noFloor && age.days !== null && age.days > 1825) score = Math.max(score, 50);

  // A new service with nothing else wrong is "unverified", not "busted".
  if (pageKind !== "shop" && !noFloor && facts.every((f) => f.tone !== "bad" || f.label === "Site age")) score = Math.max(score, 40);

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
  const headline = headlineFor(verdict);

  // --- Save this check ---
  const factsOut = facts.map((f) => ({ ...f, why: WHY[f.label] }));
  let code = shortCode();
  let inserted: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 2 && !inserted && !dryRun; attempt++) {
    const { data, error } = await supabase
      .from("checks")
      .insert({ domain, url: target.toString(), verdict, score, facts: factsOut, signals, code, source })
      .select("id, code")
      .single();
    if (error) code = shortCode(); else inserted = data;
  }

  return json({
    id: inserted?.id ?? null,
    code: inserted?.code ?? null,
    domain,
    url: target.toString(),
    final_url: finalUrl,
    title: signals.title ?? null,
    verdict,
    score,
    headline,
    facts: factsOut,
    prior_checks: priorChecks ?? 0,
    reports: reportSummary,
    checked_at: new Date().toISOString(),
  });
});

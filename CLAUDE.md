# Sniffd — project context for Claude

Read this first. It carries the decisions and business reasoning from the founding
conversations (Nov 8–9, 2026) that are not in README.md or ROADMAP.md. ROADMAP.md is
the source of truth for *what's next*; this file is the source of truth for *why*.

## Owner and how to work with him
- Paul (Massapequa, NY). Ex-wholesale meat distributor, 12 years. Not a developer; builds
  by directing Claude. Works mostly from a Samsung phone, often by voice. Keep replies
  short, lead with the answer, no preamble.
- He wants to be challenged: disagree when something doesn't hold up, say why in a
  sentence, recommend an alternative. Once he decides, go with it.
- He hates clunky: long links, extra taps, anything that needs a second explanation.
  If a flow takes more than three taps, say so before building it.
- He is willing to spend modest money (image credits, a vector artist, a domain). He
  is not willing to spend a month before seeing whether anyone cares.
- Business constraint: new income matters, but this is a side bet, not next-month rent.
  Don't dress it up as fast money.

## What Sniffd is (one paragraph)
A free consumer tool: share the store link behind an Instagram/TikTok ad, get the
"receipts" — domain age, who's behind it, refund policy, pressure tactics, deep-discount
tells, brand-knockoff hints, payment protection, and what other Sniffd users reported
after ordering. Verdict is a traffic light on the beagle's nose plus the facts, never a
bare score and never the word "scam" about a specific seller. The moat is memory:
every check and every outcome report makes the next answer better, and no chatbot has
that. End state: "Is it Sniffd?" the way people say "run a Carfax."

## Market (cite these, don't restate from memory)
- FTC, Apr 2026: 2025 reported losses to scams that started on social media ≈ $2.1B,
  ~8× 2020; nearly 30% of people who lost money to a scam said it started on social
  media; shopping scams are the top category (>40% ordered something from an ad).
  Reported only — most $65 losses never get reported.
- Reuters (on internal Meta documents): Meta users shown ~15 billion scam ads a day.
  Say "reportedly" — it's a news report on leaked documents, not a Meta figure.
- Meta says it removed ~159M scam ads in 2025. Next to 15B/day, that's the argument.
- Fakespot (Amazon review grader): 13 people, $7M raised, acquired by Mozilla 2023,
  shut down mid-2025 — "didn't fit a model we could sustain." Lesson: lots of users
  liked it; affiliate alone didn't pay a company. A one-person operation has to be
  radically cheaper to run, and that's the only reason this can work now.

## Revenue model — in order of how fast each pays
1. Affiliate (Amazon etc.) on "here's the real one": a rounding error at every scale.
   Keep it, don't build the business on it.
2. "Clawback" — dispute rescue: auto-drafted PayPal/credit-card dispute, FTC report,
   screenshots already captured, deadline reminders. Fee per dispute or a cut of
   recovered money. This is the consumer revenue: tied to the moment people are angry
   and motivated. Zero underwriting risk.
3. Sniffd Verified for sellers: a small fee to be *checked*, never to get a *result*.
   Publish what was checked; revoke publicly on complaint patterns. The badge is worth
   nothing until shoppers recognize the name, so this comes after consumer traction.
   Gap it fills: BBB requires 6 months in business (~$500–1,500/yr); Meta Verified
   for Business ($14.99+/mo) verifies the account exists, not that the product is real.
4. Data licensing (card issuers, fraud vendors, brands being knocked off): the big
   money, needs thousands of checks and outcome reports. Protect the data from day one.
- Rejected: a money-back guarantee. It's insurance (likely needs a license in NY),
  adverse selection (only bought on sketchy stores), cards/PayPal already refund for
  free, and scammers would farm a green light then burn us. Don't revisit.
- Rejected: paid subscription as the core. A checker is valued in the moment and
  forgotten; nobody pays up front.

## Scoring philosophy (supabase/functions/check)
- Domain age is the strongest signal. Scam storefronts are weeks or months old.
  Floors: >10 years → at least green; >5 years → at least yellow, unless community
  reports drag it down. Community outcome reports outweigh everything.
- Red requires hard evidence (very new domain + multiple tells, or bad outcome
  reports). Yellow means "couldn't verify," and that's an honest, common answer.
- Never penalize what we couldn't read: big retailers block bots (403) and
  JavaScript-only storefronts have no text. Treat as neutral, not missing.
- 70% off is a tell on a new store and normal on an old one.
- Every fact carries a plain-English "why it matters" — users asked for this on day one.
- Known false positives fixed: Gymshark (JS shell → was red), Allbirds (70% sale),
  Yeti (403). Run the test set before every scoring change.

## Naming history (so nobody re-runs it)
- Working names tried and killed: Sniff (live USPTO Class 9 mark; also the Sniffies
  adjacency in search), AdHound (live, renewed USPTO mark, Class 9/35, owned by
  RepuMetrix/CoreX — direct conflict), Snout (pending marks + a $110M pet-fintech),
  Whiff/Pawdit/Beaglo/Nozly (handles squatted or someone building it), Verdikt/Legitt/
  Sleuthly/Provenn/Bustd (crowded verdict-word space), Brisket (Paul didn't love it).
- Sniffd: no trademark hits found Nov 9. @sniffd on Instagram belongs to a tiny
  pet-products account (sniffd.net); sniffd.com is parked at GoDaddy.
  **Before the app-store launch, get a trademark attorney's clearance opinion** —
  "SNIFF" is a live Class 9 mark and "SNIFF CHECK" was filed in 2026.
- Lesson learned: check USPTO first, then .com/.app, then handles. Exact handles are
  nearly always squatted; @getsniffd-style is normal.
- The beagle: breed is deliberate (USDA "Beagle Brigade" sniffs contraband at airports
  — a reel on its own). Character: tired, unbothered detective who has seen every
  scam. Dry, not cute. The nose is the light. Not Snoopy, not kids'-app.

## Launch plan (what was decided, and what was rejected)
- Rejected: asking strangers in scam-alert groups to DM screenshots. A zero-karma
  account asking for screenshots looks like the scam, and it's less convenient than
  ChatGPT. The test has to be a tool they use themselves in ten seconds.
- Communities (r/Scams, Facebook scam-alert groups, Nextdoor): plain text posts, no
  brand push, a link to the tool, answer "is this legit?" threads with a receipts card.
  Read each group's rules; many ban links.
- Reels on the Sniffd account: the beagle is the face, Paul isn't. Deadpan. Formats:
  "we bought it so you don't have to" (spend $50–100/mo buying the junk); scam-of-the-
  week news-jacking the same day; the manifesto ("Meta sells a blue check for $15.
  BBB makes you wait six months. 15 billion scam ads a day. Somebody had to do it.").
- Local news: News 12 / Newsday run scam stories constantly. "Massapequa dad builds an
  app that sniffs out Instagram scams" is a segment.
- Don't buy installs early; buy the junk products instead — it *is* the marketing.
- First real milestone: five people who aren't Paul or Joanna use it on real ads.

## Sharing flow (verified on Paul's Galaxy)
- Sharing the ad post itself is useless (instagram.com link, no store). Flow is:
  Shop now → ⋯ → Share → Sniffd. Or set Instagram "Open links in external browser."
- Checking an ad *before* tapping it needs a native Android overlay (accessibility /
  screen-capture permission; Play Store is strict). Reputation-based dot is doable;
  "AI-fake detection from pixels" is unreliable on compressed images — don't promise it.
- iPhone has no web share target; the native share extension / Shortcut covers it.

## Infrastructure facts
- Supabase project "Sniffd/Brisket": ref `ijerqmyyragkxiphjkqy` (us-east-1, free tier).
  Tables `checks` (with short `code` for share links) and `reports`; RLS on, no public
  policies; edge functions use the service role. Functions: `check`, `report`, `result`
  (verify_jwt off; they're public, CORS *). `pg_net` is enabled for testing from SQL.
- Supabase refuses to render HTML on *.supabase.co (text/html → text/plain), which is
  why the front end lives on GitHub Pages / getsniffd.com. Don't try again.
- GitHub Pages API is blocked from Claude sessions; Pages was enabled by Paul in repo
  Settings (Source: GitHub Actions). Deploys via `.github/workflows/pages.yml`.
- Image generation: OpenAI Images API (gpt-image-2) works only from Claude Code
  sessions on Paul's **Default** cloud environment (network secret). Regular chats
  can't call it; ChatGPT (Paul's subscription) is the manual fallback.
- Shell network access in regular Claude chats is allowlisted (npm/pypi/GitHub only);
  test edge functions via `pg_net` from SQL or from the browser.

## Wording rules (defamation-safe)
- Public verdict wording: "red flags found", "couldn't verify", "checks out so far".
  Never "scam"/"fraud" about a named seller. Show the evidence; let people conclude.
- The footer disclaimer stays: public facts, no guarantee, pay with a card you can
  dispute.

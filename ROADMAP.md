# Sniffd roadmap

Sniffd checks an ad's store before you buy: share the link, get a verdict with the reasons.

## Timeline to the app stores (compressed, started Nov 11, 2026)
Build the app first and improve the check while store testing runs: the check lives on the server, so it improves without new app versions.

| Days | Work |
|---|---|
| 1–3 | Phone app for iPhone + Android (Capacitor) with Sniffd in the Share menu. Privacy policy, terms, support page. Cloud builds. |
| 4–5 | iPhone build on TestFlight. Android build in a closed test (starts Google's 14-day clock once the ID is approved). |
| 5–10 | Check improvements (saved results, test set, marketplace links, subscription traps). Store listings and screenshots. |
| ~10–12 | Submit to Apple (review 1–3 days). |
| ~19+ | Google: 12 testers × 14 days done → apply for production (review up to ~7 days). |

Google's 14-day closed test can't be shortened, so Android lands about a week after iPhone.

### App build status
- [x] App project (`app/`): bundles the site, app ID `com.getsniffd.app`
- [x] Android: Sniffd in the Share menu, icons, splash (verified on a Galaxy: Instagram share → verdict, Nov 11)
- [x] iPhone: Share extension shows the verdict inside the share sheet, icons, splash
- [x] Privacy policy, terms, support pages
- [x] Cloud builds on GitHub Actions (Android test APK, iPhone simulator build)
- [x] support@getsniffd.com forwards to the Sniffd Gmail (ImprovMX)
- [ ] Android release signing + upload to the closed test
- [ ] iPhone signing (App Store Connect API key) + TestFlight upload
- [ ] 12+ Android testers recruited

## Now — make the web check solid
- [x] Rename Brisket → Sniffd everywhere (site, domain, app)
- [x] Save each store's results for a day: same answer on repeat checks, instant results, fewer outside lookups
- [x] Test set of known-good and known-bad sites, run before every update (`node tests/run-testset.mjs`; first run Nov 12: 16/23 scams red, 0 missed, 25/25 real stores green)
- [ ] Grow the test set to 100+ scam stores; refresh monthly (scam stores die fast)
- [ ] Deploy the check function automatically from GitHub (live code always matches the repo)
- [ ] Marketplace links (Amazon, Etsy, eBay, Walmart): say "we checked the platform, not the seller" and give seller tips
- [ ] Subscription traps: "free trial, just pay shipping" with a hidden recurring charge
- [ ] Quiz/survey funnels: recognize the quiz tools, find the real store behind them, flag "phone/email before you see anything"
- [ ] Directions: Meta instant-form privacy-policy link tip; Instagram "About this account" tip
- [ ] "Paste & sniff" button
- [ ] Review the free outside services (IP location, Safe Browsing, Tranco) before launch or monetization

## Next — the app
- [ ] iPhone + Android app (Capacitor wrapper around the web app), using the existing Apple and Google developer accounts
- [ ] Sniffd in the top row of the Share menu on both phones
- [ ] Share a screenshot of an ad and Sniffd reads it (also fixes most of the iPhone clunkiness)
- [ ] TestFlight on iPhone, internal testing on Android
- [ ] Case file (history of every ad you've checked) and your record ("37 sniffed, 6 busted")
- [ ] Shareable result cards — public wording is "red flags found", never "scam"; show the reasons

## Later — new kinds of scams
- [ ] **Check a message (emails and texts):** paste or share a suspicious email or text to Sniffd. Checks the sender's address (domain age, look-alike of a real company, anti-spoofing setup), every link inside it (same store check + Google's danger list), reply-to mismatches, and scam-script phrases (urgent payment, gift cards, "verify your account"). Later: forward emails to a check@getsniffd.com address so full headers can be checked. Build during the 14-day Android test.
- [ ] **Rentals (first expansion after the app):** county owner records vs. the "landlord", owner-occupied homes, reverse image search for copied listing photos, rent vs. local market, landlord phone/email checks, scam-script detection in pasted messages, property-manager license lookup. Paid per-check option for renters; "Sniffd Verified Landlord".
- [ ] Job and task scams; WhatsApp/Telegram-only contact
- [ ] Investment / crypto / trading-bot ads, checked against FINRA BrokerCheck and the SEC
- [ ] Deposit scams: pets, event tickets
- [ ] Government and debt-relief impersonators; fake giveaways; link-in-bio pages (Linktree)
- [ ] Browser extension for desktop shopping

## Business
- [ ] **Sniffd Verified** for businesses: verifies identity (registration, address, phone, owner, controls the website), never changes the score, live badge that links to a Sniffd page (copied badge images get flagged). Launch once shoppers recognize the name.
- [ ] Family plan: check for your parents, alerts
- [ ] Scam-store data for payment processors, banks, card issuers, ad platforms
- [ ] Lab-verified products: certificate-of-analysis checks and secret-shopper lab tests. Start with supplements / skincare; legal review before anything like peptides.
- [ ] Legal review before any public feed or business-facing labels; dispute path for businesses

## Brand
- [x] Registered getsniffd.com (3 years) and sniffdapp.com (1 year, backup)
- [ ] sniffd.com is parked at GoDaddy, not listed for sale; try the broker later. (sniffd.co is taken.)
- [ ] Claim @sniffd on Instagram and TikTok
- [ ] Store listing title: "Sniffd: Ad Scam Checker"
- [x] Site moved to https://getsniffd.com (old github.io address redirects)
- [ ] Update the iPhone shortcut to https://getsniffd.com/?text=

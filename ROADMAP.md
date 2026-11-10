# Sniffd roadmap

Sniffd checks an ad's store before you buy: share the link, get a verdict with the reasons.

## Now — make the web check solid
- [ ] Rename Brisket → Sniffd everywhere (site done; app store listing, domain, handles to follow)
- [ ] Save each store's results for a day: same answer on repeat checks, instant results, fewer outside lookups
- [ ] Test set of known-good and known-bad sites, run before every update
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

# Brisket (working name)

Share a store link from an Instagram/TikTok ad; get the receipts: domain age, who's behind it, refund policy, pressure tactics, what other people reported.

- `index.html`, `manifest.json`, `sw.js`, `icon*.svg` — the web app (GitHub Pages). Installable on Android; appears in the Share menu.
- `supabase/functions/check` — scoring engine (Supabase Edge Function).
- `supabase/functions/report` — outcome reports ("arrived / junk / never arrived / refunded").

Status: v0.1 — rule-based checks, no model layer yet.

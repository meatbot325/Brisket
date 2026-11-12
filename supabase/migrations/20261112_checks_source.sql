-- Where each check came from: web, android-app, ios-app, ios-share. A count only; nothing identifies the person.
alter table public.checks add column if not exists source text;

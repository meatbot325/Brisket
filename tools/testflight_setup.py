"""TestFlight setup via the App Store Connect API (runs in GitHub Actions with the Apple key secrets).
Waits for the newest build to finish processing, answers the export-compliance question
(standard HTTPS only), makes an internal tester group and adds the account's Admin users to it.
Never prints email addresses (the repo's Action logs may be public)."""
import os, time, json, urllib.request, urllib.error, jwt

KEY_ID, ISSUER, P8 = os.environ["KEY_ID"], os.environ["ISSUER_ID"], os.environ["KEY_P8"]
BUNDLE, GROUP = "com.getsniffd.app", "Family"
API = "https://api.appstoreconnect.apple.com"

def token():
    now = int(time.time())
    return jwt.encode({"iss": ISSUER, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"}, P8, algorithm="ES256", headers={"kid": KEY_ID})

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read(); return e.code, (json.loads(raw) if raw else {})

def errors(d): return "; ".join(x.get("detail") or x.get("title", "") for x in d.get("errors", []))

s, d = call("GET", f"/v1/apps?filter[bundleId]={BUNDLE}")
app = d["data"][0]["id"]; print("App found")

for i in range(60):
    s, d = call("GET", f"/v1/builds?filter[app]={app}&sort=-uploadedDate&limit=1")
    b = d["data"][0] if d.get("data") else None
    state = b and b["attributes"]["processingState"]
    print("Newest build:", b and b["attributes"]["version"], state)
    if state and state != "PROCESSING": break
    time.sleep(30)
if not b or b["attributes"]["processingState"] != "VALID":
    raise SystemExit("Build isn't ready (state: %s)" % state)

if b["attributes"].get("usesNonExemptEncryption") is None:
    s, d = call("PATCH", f"/v1/builds/{b['id']}", {"data": {"type": "builds", "id": b["id"], "attributes": {"usesNonExemptEncryption": False}}})
    print("Export compliance answered:", s, errors(d))
else:
    print("Export compliance already set")

s, d = call("GET", f"/v1/betaGroups?filter[app]={app}&filter[name]={GROUP}")
if d.get("data"):
    group = d["data"][0]["id"]; print("Tester group exists")
else:
    s, d = call("POST", "/v1/betaGroups", {"data": {"type": "betaGroups", "attributes": {"name": GROUP, "isInternalGroup": True, "hasAccessToAllBuilds": True},
                                                    "relationships": {"app": {"data": {"type": "apps", "id": app}}}}})
    print("Tester group created:", s, errors(d)); group = d["data"]["id"]

s, d = call("GET", "/v1/users?limit=50")
admins = [u for u in d.get("data", []) if set(u["attributes"].get("roles", [])) & {"ADMIN", "ACCOUNT_HOLDER"}]
print("Admin users to add:", len(admins))
for u in admins:
    a = u["attributes"]
    s, d = call("POST", "/v1/betaTesters", {"data": {"type": "betaTesters", "attributes": {"email": a["username"], "firstName": a.get("firstName", ""), "lastName": a.get("lastName", "")},
                                                     "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": group}]}}}})
    print("Added tester", a.get("firstName", "?"), "->", s, errors(d) or "ok")
print("Done. Check the TestFlight app / email on the iPhone.")

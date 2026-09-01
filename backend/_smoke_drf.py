from rest_framework.test import APIClient
from accounts.models import User
from certificates.models import Certificate

# Find the cert
cert = Certificate.objects.get(certificate_id="ACVS-2026-YTHPZWO9")
print(f"DB row status={cert.status} chain_hash={cert.chain_hash!r} tx_hash={cert.tx_hash!r}")

# Authenticate as the cert's registrar (or any registrar in the same institution)
user = cert.institution.registrars.first() or User.objects.filter(institution=cert.institution).first()
print(f"User: {user}")

client = APIClient()
client.force_authenticate(user=user)
resp = client.get("/api/certificates/?page_size=100")
print(f"List status: {resp.status_code}")
data = resp.json()
hits = [r for r in data.get("results", []) if r.get("certificate_id") == "ACVS-2026-YTHPZWO9"]
print(f"Matches in list: {len(hits)}")
if hits:
    print(f"Keys present: {sorted(hits[0].keys())}")
    print(f"Has chain_hash? {'chain_hash' in hits[0]}")
    print(f"Has tx_hash? {'tx_hash' in hits[0]}")
    print(f"status: {hits[0].get('status')}")
    print(f"pending_hash: {hits[0].get('pending_hash')}")

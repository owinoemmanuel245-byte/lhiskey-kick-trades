const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) return response.status(500).json({ ok:false, error:"Missing SUPABASE_SERVICE_ROLE_KEY." });
    const body = request.body || {};
    const whatsapp = normalizePhone(body.whatsapp || "");
    const accessCode = sanitizeText(body.access_code || "", 80).toUpperCase();
    const deviceHash = sanitizeText(body.device_hash || "", 200);
    const sessionHash = sanitizeText(body.session_hash || "", 200);
    const userAgent = sanitizeText(request.headers["user-agent"] || "", 400);
    if (!whatsapp || !accessCode || !deviceHash || !sessionHash) return response.status(400).json({ ok:false, error:"WhatsApp number, access code, and device session are required." });

    const rows = await supabaseGet(`/client_access?access_code=eq.${encodeURIComponent(accessCode)}&select=*`);
    const access = Array.isArray(rows) ? rows[0] : null;
    if (!access) {
      await logAccess(null, whatsapp, accessCode, "invalid_code", deviceHash, sessionHash, userAgent, "Invalid access code.");
      return response.status(404).json({ ok:false, error:"Invalid access code." });
    }

    const storedWhatsapp = normalizePhone(access.whatsapp || "");
    if (storedWhatsapp && storedWhatsapp !== whatsapp) {
      await suspiciousAttempt(access, whatsapp, accessCode, deviceHash, sessionHash, userAgent, "WhatsApp mismatch.");
      return response.status(403).json({ ok:false, error:"This access code is not linked to this WhatsApp number. Admin has been alerted." });
    }

    if (access.status === "revoked") {
      await logAccess(access.id, whatsapp, accessCode, "revoked_attempt", deviceHash, sessionHash, userAgent, "Revoked access attempted.");
      return response.status(403).json({ ok:false, error:"This access has been revoked. Contact admin." });
    }
    if (access.status === "expired" || (access.expires_at && new Date(access.expires_at) < new Date())) {
      await updateAccess(access.id, { status:"expired", updated_at:new Date().toISOString() });
      await logAccess(access.id, whatsapp, accessCode, "expired_attempt", deviceHash, sessionHash, userAgent, "Expired access attempted.");
      return response.status(403).json({ ok:false, error:"This access has expired. Contact admin." });
    }
    if (!["active","completed","shared_attempt_detected"].includes(access.status)) {
      await logAccess(access.id, whatsapp, accessCode, "inactive_attempt", deviceHash, sessionHash, userAgent, "Inactive access attempted.");
      return response.status(403).json({ ok:false, error:"This access is not active yet. Contact admin." });
    }

    if (!access.device_hash) {
      await updateAccess(access.id, { device_hash:deviceHash, session_hash:sessionHash, activated_at:new Date().toISOString(), last_access_at:new Date().toISOString(), status:"active", updated_at:new Date().toISOString() });
      await logAccess(access.id, whatsapp, accessCode, "activated", deviceHash, sessionHash, userAgent, "Access activated and bound to device.");
      return response.status(200).json({ ok:true, access: publicAccess({ ...access, device_hash:deviceHash, status:"active" }) });
    }

    if (access.device_hash === deviceHash) {
      await updateAccess(access.id, { last_access_at:new Date().toISOString(), updated_at:new Date().toISOString() });
      await logAccess(access.id, whatsapp, accessCode, "access_granted", deviceHash, sessionHash, userAgent, "Access granted.");
      return response.status(200).json({ ok:true, access: publicAccess(access) });
    }

    const attempts = Number(access.share_attempts || 0) + 1;
    const newStatus = attempts >= 2 ? "revoked" : "shared_attempt_detected";
    await updateAccess(access.id, { share_attempts:attempts, status:newStatus, updated_at:new Date().toISOString() });
    await logAccess(access.id, whatsapp, accessCode, "sharing_attempt", deviceHash, sessionHash, userAgent, `Different device attempted access. Attempts: ${attempts}`);
    return response.status(403).json({ ok:false, error: attempts >= 2 ? "Access revoked due to repeated sharing attempts. Contact admin." : "This code is already linked to another device. Admin has been alerted." });
  } catch (error) {
    console.error("client-access error:", error);
    return response.status(500).json({ ok:false, error:"Client access server error." });
  }
}

function publicAccess(row) {
  return { product_title: row.product_title, client_name: row.client_name, status: row.status, private_content: row.private_content || "", private_link: row.private_link || "", delivery_notes: row.delivery_notes || "", expires_at: row.expires_at || null, disclaimer: "Educational/testing access only. Not financial advice. No guaranteed profits." };
}
async function suspiciousAttempt(access, whatsapp, accessCode, deviceHash, sessionHash, userAgent, message) {
  const attempts = Number(access.share_attempts || 0) + 1;
  const newStatus = attempts >= 2 ? "revoked" : "shared_attempt_detected";
  await updateAccess(access.id, { share_attempts:attempts, status:newStatus, updated_at:new Date().toISOString() });
  await logAccess(access.id, whatsapp, accessCode, "suspicious_attempt", deviceHash, sessionHash, userAgent, message);
}
async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: { apikey:SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type":"application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Supabase GET failed ${res.status}`);
  return text ? JSON.parse(text) : null;
}
async function updateAccess(id, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/client_access?id=eq.${encodeURIComponent(id)}`, { method:"PATCH", headers:{ apikey:SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type":"application/json", Prefer:"return=minimal" }, body:JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
}
async function logAccess(clientAccessId, whatsapp, accessCode, eventType, deviceHash, sessionHash, userAgent, message) {
  const payload = { client_access_id:clientAccessId, whatsapp, access_code:accessCode, event_type:eventType, device_hash:deviceHash, session_hash:sessionHash, user_agent:userAgent, message };
  await fetch(`${SUPABASE_URL}/rest/v1/access_logs`, { method:"POST", headers:{ apikey:SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type":"application/json", Prefer:"return=minimal" }, body:JSON.stringify(payload) }).catch(()=>null);
}
function normalizePhone(value) {
  let clean = String(value || "").replace(/[^\d+]/g, "");
  if (clean.startsWith("0") && clean.length >= 10) clean = "+254" + clean.slice(1);
  if (clean.startsWith("254")) clean = "+" + clean;
  return clean;
}
function sanitizeText(value, maxLength) {
  return String(value || "").replace(/[<>]/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, maxLength);
}

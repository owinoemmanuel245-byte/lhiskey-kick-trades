const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  const action = String(request.query?.action || "").trim();

  try {
    if (request.method === "GET" && request.query?.admin_inbox === "1") return handleAdminInboxRequest(request, response);
    if (request.method === "GET" && action === "chat-poll") return handleChatPoll(request, response);

    if (request.method !== "POST") return response.status(405).json({ ok:false, error:"Method not allowed" });

    if (action === "client-request") return handleClientRequest(request, response);
    if (action === "early-access") return handleEarlyAccess(request, response);
    if (action === "payment-proof") return handlePaymentProof(request, response);
    if (action === "client-access") return handleClientAccess(request, response);

    return handleLeadCapture(request, response);
  } catch (error) {
    console.error("[api/lead unified]", error);
    return response.status(500).json({ ok:false, error:"Unified API server error.", details:error.message });
  }
}

async function handleLeadCapture(request, response) {
  const body = request.body || {};
  const name = sanitizeText(body.name || "", 120);
  const whatsapp = sanitizeText(body.whatsapp || "", 80);
  const email = sanitizeText(body.email || "", 160);
  const message = sanitizeText(body.message || "", 2000);
  const reason = sanitizeText(body.reason || "Visitor requested live support", 240);
  const urgency = ["low", "medium", "high"].includes(body.urgency) ? body.urgency : "medium";
  const preferred_contact = sanitizeText(body.preferred_contact || "whatsapp", 40);

  let session_id = isLikelyUuid(body.session_id) ? body.session_id : null;
  let message_id = null;

  if (!name || !whatsapp || !message) {
    return response.status(400).json({ ok:false, error:"Name, WhatsApp number, and message are required." });
  }

  if (SUPABASE_SERVICE_ROLE_KEY) {
    if (!session_id) {
      const session = await servicePost("/chat_sessions", {
        status:"waiting_agent",
        source:"website_ai_assistant",
        visitor_label:name || "Website Visitor",
        visitor_name:name,
        visitor_whatsapp:whatsapp,
        visitor_email:email,
        handoff_reason:reason,
        updated_at:new Date().toISOString()
      }, "return=representation");
      session_id = session?.[0]?.id || null;
    } else {
      await servicePatch(`/chat_sessions?id=eq.${encodeURIComponent(session_id)}`, {
        visitor_name:name,
        visitor_whatsapp:whatsapp,
        visitor_email:email,
        visitor_label:name || "Website Visitor",
        handoff_reason:reason,
        status:"waiting_agent",
        updated_at:new Date().toISOString()
      });
    }
  }

  const leadPayload = { session_id, name, whatsapp, email, message, reason, urgency, preferred_contact, source:"website_ai_assistant", status:"new" };
  const lead = SUPABASE_SERVICE_ROLE_KEY ? await servicePost("/visitor_leads", leadPayload, "return=representation") : await anonPost("/visitor_leads", leadPayload);

  if (session_id && SUPABASE_SERVICE_ROLE_KEY) {
    const visitorMsg = await servicePost("/chat_messages", { session_id, author_type:"visitor", content:message }, "return=representation");
    message_id = visitorMsg?.[0]?.id || null;

    await servicePost("/chat_messages", {
      session_id,
      author_type:"system",
      content:`Visitor details received:\nName: ${name}\nWhatsApp: ${whatsapp}\nEmail: ${email || "Not provided"}\nPreferred contact: ${preferred_contact}\nReason: ${reason}`
    }, "return=minimal");

    await servicePatch(`/chat_sessions?id=eq.${encodeURIComponent(session_id)}`, { updated_at:new Date().toISOString(), status:"waiting_agent" });
  }

  return response.status(200).json({ ok:true, session_id, message_id, lead:lead?.[0] || null });
}

async function handleChatPoll(request, response) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return response.status(500).json({ error:"Missing SUPABASE_SERVICE_ROLE_KEY" });
  const sessionId = request.query.session_id;
  const afterId = Number(request.query.after_id || 0);
  if (!sessionId) return response.status(400).json({ error:"session_id is required" });

  const sessions = await serviceGet(`/chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*`);
  const session = sessions?.[0] || null;
  if (!session) return response.status(404).json({ error:"Session not found" });

  const messages = await serviceGet(`/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&id=gt.${afterId}&select=*&order=id.asc`);
  return response.status(200).json({ session, messages:Array.isArray(messages) ? messages : [] });
}

async function handleClientRequest(request, response) {
  requireServiceRole();
  const body = request.body || {};
  const payload = {
    package_id:safeBigInt(body.package_id),
    package_name:sanitizeText(body.package_name || "", 180),
    name:sanitizeText(body.name || "", 120),
    whatsapp:sanitizeText(body.whatsapp || "", 80),
    email:sanitizeText(body.email || "", 160),
    preferred_contact:sanitizeText(body.preferred_contact || "whatsapp", 40),
    request_type:sanitizeText(body.request_type || "general", 80),
    budget_range:sanitizeText(body.budget_range || "", 100),
    message:sanitizeText(body.message || "", 2000),
    source:"website_services",
    status:"new"
  };
  if (!payload.name || !payload.whatsapp || !payload.message) return response.status(400).json({ error:"Name, WhatsApp number, and message are required." });
  const inserted = await servicePost("/client_requests", payload, "return=representation");
  return response.status(200).json({ ok:true, request:Array.isArray(inserted) ? inserted[0] : inserted });
}

async function handleEarlyAccess(request, response) {
  requireServiceRole();
  const body = request.body || {};
  const payload = {
    showcase_item_id:safeBigInt(body.showcase_item_id),
    item_title:sanitizeText(body.item_title || "", 180),
    name:sanitizeText(body.name || "", 120),
    whatsapp:sanitizeText(body.whatsapp || "", 80),
    email:sanitizeText(body.email || "", 160),
    experience_level:sanitizeText(body.experience_level || "beginner", 80),
    interest_type:sanitizeText(body.interest_type || "early_access", 80),
    message:sanitizeText(body.message || "", 2000),
    source:"safe_showcase",
    status:"new"
  };
  if (!payload.name || !payload.whatsapp || !payload.message) return response.status(400).json({ error:"Name, WhatsApp number, and message are required." });
  const inserted = await servicePost("/early_access_requests", payload, "return=representation");
  return response.status(200).json({ ok:true, request:Array.isArray(inserted) ? inserted[0] : inserted });
}

async function handlePaymentProof(request, response) {
  requireServiceRole();
  const body = request.body || {};
  const payload = {
    name:sanitizeText(body.name || "", 120),
    whatsapp:sanitizeText(body.whatsapp || "", 80),
    email:sanitizeText(body.email || "", 160),
    related_to:sanitizeText(body.related_to || "general", 180),
    related_request_id:safeBigInt(body.related_request_id),
    related_request_type:sanitizeText(body.related_request_type || "general", 80),
    amount_paid:safeAmount(body.amount_paid),
    currency:sanitizeText(body.currency || "KES", 10),
    payment_method:normalizePaymentMethod(body.payment_method),
    payment_reference:sanitizeText(body.payment_reference || "", 120),
    proof_file_name:sanitizeText(body.proof_file_name || "", 255),
    proof_file_path:sanitizeText(body.proof_file_path || "", 600),
    proof_file_type:sanitizeText(body.proof_file_type || "", 120),
    proof_file_size:safeBigInt(body.proof_file_size),
    message:sanitizeText(body.message || "", 2000),
    source:"website_payment_proof",
    status:"new"
  };
  if (!payload.name || !payload.whatsapp || !payload.payment_reference) return response.status(400).json({ error:"Name, WhatsApp number, and payment reference are required." });
  const inserted = await servicePost("/payment_proofs", payload, "return=representation");
  return response.status(200).json({ ok:true, proof:Array.isArray(inserted) ? inserted[0] : inserted });
}

async function handleClientAccess(request, response) {
  requireServiceRole();
  const body = request.body || {};
  const whatsapp = normalizePhone(body.whatsapp || "");
  const accessCode = sanitizeText(body.access_code || "", 80).toUpperCase();
  const deviceHash = sanitizeText(body.device_hash || "", 200);
  const sessionHash = sanitizeText(body.session_hash || "", 200);
  const userAgent = sanitizeText(request.headers["user-agent"] || "", 400);

  if (!whatsapp || !accessCode || !deviceHash || !sessionHash) return response.status(400).json({ ok:false, error:"WhatsApp number, access code, and device session are required." });

  const rows = await serviceGet(`/client_access?access_code=eq.${encodeURIComponent(accessCode)}&select=*`);
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
    await servicePatch(`/client_access?id=eq.${encodeURIComponent(access.id)}`, { status:"expired", updated_at:new Date().toISOString() });
    await logAccess(access.id, whatsapp, accessCode, "expired_attempt", deviceHash, sessionHash, userAgent, "Expired access attempted.");
    return response.status(403).json({ ok:false, error:"This access has expired. Contact admin." });
  }

  if (!["active","completed","shared_attempt_detected"].includes(access.status)) {
    await logAccess(access.id, whatsapp, accessCode, "inactive_attempt", deviceHash, sessionHash, userAgent, "Inactive access attempted.");
    return response.status(403).json({ ok:false, error:"This access is not active yet. Contact admin." });
  }

  if (!access.device_hash) {
    const update = { device_hash:deviceHash, session_hash:sessionHash, activated_at:new Date().toISOString(), last_access_at:new Date().toISOString(), status:"active", updated_at:new Date().toISOString() };
    await servicePatch(`/client_access?id=eq.${encodeURIComponent(access.id)}`, update);
    await logAccess(access.id, whatsapp, accessCode, "activated", deviceHash, sessionHash, userAgent, "Access activated and bound to device.");
    return response.status(200).json({ ok:true, access:publicAccess({ ...access, ...update }) });
  }

  if (access.device_hash === deviceHash) {
    await servicePatch(`/client_access?id=eq.${encodeURIComponent(access.id)}`, { last_access_at:new Date().toISOString(), updated_at:new Date().toISOString() });
    await logAccess(access.id, whatsapp, accessCode, "access_granted", deviceHash, sessionHash, userAgent, "Access granted.");
    return response.status(200).json({ ok:true, access:publicAccess(access) });
  }

  const attempts = Number(access.share_attempts || 0) + 1;
  const newStatus = attempts >= 2 ? "revoked" : "shared_attempt_detected";
  await servicePatch(`/client_access?id=eq.${encodeURIComponent(access.id)}`, { share_attempts:attempts, status:newStatus, updated_at:new Date().toISOString() });
  await logAccess(access.id, whatsapp, accessCode, "sharing_attempt", deviceHash, sessionHash, userAgent, `Different device attempted access. Attempts: ${attempts}`);
  return response.status(403).json({ ok:false, error:attempts >= 2 ? "Access revoked due to repeated sharing attempts. Contact admin." : "This code is already linked to another device. Admin has been alerted." });
}

async function handleAdminInboxRequest(request, response) {
  requireServiceRole();
  const authHeader = request.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return response.status(401).json({ ok:false, error:"Missing admin auth token." });

  const user = await getUserFromToken(token);
  if (!user?.id) return response.status(401).json({ ok:false, error:"Invalid admin session." });

  const isAdmin = await checkAdminUser(user.id);
  if (!isAdmin) return response.status(403).json({ ok:false, error:"Not allowed. Admin user not found." });

  const [sessions, messages, leads] = await Promise.all([
    serviceGet("/chat_sessions?select=*&order=updated_at.desc&limit=700"),
    serviceGet("/chat_messages?select=*&order=id.desc&limit=1800"),
    serviceGet("/visitor_leads?select=*&order=created_at.desc&limit=1800")
  ]);

  return response.status(200).json({ ok:true, sessions:Array.isArray(sessions)?sessions:[], messages:Array.isArray(messages)?messages:[], leads:Array.isArray(leads)?leads:[] });
}

async function getUserFromToken(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${token}` } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error_description || "Could not verify admin session.");
  return data;
}

async function checkAdminUser(userId) {
  const rows = await serviceGet(`/admin_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

function requireServiceRole() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.");
}

async function anonPost(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method:"POST", headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation" }, body:JSON.stringify(payload) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || text || `Anon POST failed ${res.status}`);
  return data;
}

async function servicePost(path, payload, prefer = "return=minimal") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method:"POST", headers:serviceHeaders(prefer), body:JSON.stringify(payload) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || text || `Service POST failed ${res.status}`);
  return data;
}

async function serviceGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers:{ apikey:SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type":"application/json" } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || text || `Service GET failed ${res.status}`);
  return data;
}

async function servicePatch(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method:"PATCH", headers:serviceHeaders("return=minimal"), body:JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
}

function serviceHeaders(prefer) {
  return { apikey:SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type":"application/json", Prefer:prefer };
}

async function logAccess(clientAccessId, whatsapp, accessCode, eventType, deviceHash, sessionHash, userAgent, message) {
  const payload = { client_access_id:clientAccessId, whatsapp, access_code:accessCode, event_type:eventType, device_hash:deviceHash, session_hash:sessionHash, user_agent:userAgent, message };
  await servicePost("/access_logs", payload, "return=minimal").catch(() => null);
}

async function suspiciousAttempt(access, whatsapp, accessCode, deviceHash, sessionHash, userAgent, message) {
  const attempts = Number(access.share_attempts || 0) + 1;
  const newStatus = attempts >= 2 ? "revoked" : "shared_attempt_detected";
  await servicePatch(`/client_access?id=eq.${encodeURIComponent(access.id)}`, { share_attempts:attempts, status:newStatus, updated_at:new Date().toISOString() });
  await logAccess(access.id, whatsapp, accessCode, "suspicious_attempt", deviceHash, sessionHash, userAgent, message);
}

function publicAccess(row) {
  return { product_title:row.product_title, client_name:row.client_name, status:row.status, private_content:row.private_content || "", private_link:row.private_link || "", delivery_notes:row.delivery_notes || "", expires_at:row.expires_at || null, disclaimer:"Educational/testing access only. Not financial advice. No guaranteed profits." };
}

function isLikelyUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
function sanitizeText(value, maxLength) { return String(value || "").replace(/[<>]/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, maxLength); }
function safeBigInt(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; }
function safeAmount(value) { if (value === null || value === undefined || value === "") return null; const n = Number(String(value).replace(/,/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; }
function normalizePaymentMethod(value) { const v = String(value || "").toLowerCase(); return ["mpesa", "bank", "other"].includes(v) ? v : "bank"; }
function normalizePhone(value) { let clean = String(value || "").replace(/[^\d+]/g, ""); if (clean.startsWith("0") && clean.length >= 10) clean = "+254" + clean.slice(1); if (clean.startsWith("254")) clean = "+" + clean; return clean; }

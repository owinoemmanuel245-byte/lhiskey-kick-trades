const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ ok:false, error: "Method not allowed" });
  }

  try {
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
      return response.status(400).json({ ok:false, error: "Name, WhatsApp number, and message are required." });
    }

    if (SUPABASE_SERVICE_ROLE_KEY) {
      if (!session_id) {
        const session = await servicePost("/chat_sessions", {
          status: "waiting_agent",
          source: "website_ai_assistant",
          visitor_label: name || "Website Visitor",
          visitor_name: name,
          visitor_whatsapp: whatsapp,
          visitor_email: email,
          handoff_reason: reason,
          updated_at: new Date().toISOString()
        }, "return=representation");

        session_id = session?.[0]?.id || null;
      } else {
        await servicePatch(`/chat_sessions?id=eq.${encodeURIComponent(session_id)}`, {
          visitor_name: name,
          visitor_whatsapp: whatsapp,
          visitor_email: email,
          visitor_label: name || "Website Visitor",
          handoff_reason: reason,
          status: "waiting_agent",
          updated_at: new Date().toISOString()
        });
      }
    }

    const leadPayload = {
      session_id,
      name,
      whatsapp,
      email,
      message,
      reason,
      urgency,
      preferred_contact,
      source: "website_ai_assistant",
      status: "new"
    };

    const lead = SUPABASE_SERVICE_ROLE_KEY
      ? await servicePost("/visitor_leads", leadPayload, "return=representation")
      : await anonPost("/visitor_leads", leadPayload);

    if (session_id && SUPABASE_SERVICE_ROLE_KEY) {
      const visitorMsg = await servicePost("/chat_messages", {
        session_id,
        author_type: "visitor",
        content: message
      }, "return=representation");

      message_id = visitorMsg?.[0]?.id || null;

      await servicePost("/chat_messages", {
        session_id,
        author_type: "system",
        content: `Visitor details received:\nName: ${name}\nWhatsApp: ${whatsapp}\nEmail: ${email || "Not provided"}\nPreferred contact: ${preferred_contact}\nReason: ${reason}`
      }, "return=minimal");

      await servicePatch(`/chat_sessions?id=eq.${encodeURIComponent(session_id)}`, {
        updated_at: new Date().toISOString(),
        status: "waiting_agent"
      });
    }

    return response.status(200).json({
      ok: true,
      session_id,
      message_id,
      lead: lead?.[0] || null
    });
  } catch (error) {
    console.error("[api/lead]", error);
    return response.status(500).json({ ok:false, error: "Lead server error.", details: error.message });
  }
}

async function anonPost(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || text || `Anon POST failed ${res.status}`);
  return data;
}

async function servicePost(path, payload, prefer = "return=minimal") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: serviceHeaders(prefer),
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || text || `Service POST failed ${res.status}`);
  return data;
}

async function servicePatch(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "PATCH",
    headers: serviceHeaders("return=minimal"),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Service PATCH failed ${res.status}`);
  }
}

function serviceHeaders(prefer) {
  return {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": prefer
  };
}

function isLikelyUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, maxLength);
}

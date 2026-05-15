const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return response.status(500).json({
        error: "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables."
      });
    }

    const body = request.body || {};

    const name = sanitizeText(body.name || "", 120);
    const whatsapp = sanitizeText(body.whatsapp || "", 80);
    const email = sanitizeText(body.email || "", 160);
    const message = sanitizeText(body.message || "", 2000);
    const reason = sanitizeText(body.reason || "Live support request", 200);
    const urgency = ["low", "medium", "high"].includes(body.urgency)
      ? body.urgency
      : "medium";
    const preferred_contact = sanitizeText(body.preferred_contact || "whatsapp", 40);
    const session_id = body.session_id || null;

    if (!name || !whatsapp || !message) {
      return response.status(400).json({
        error: "Name, WhatsApp number, and message are required."
      });
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

    const lead = await supabaseInsert("/visitor_leads", leadPayload);

    if (session_id) {
      await supabaseInsert("/chat_messages", {
        session_id,
        author_type: "system",
        content:
          `Visitor details received:\n` +
          `Name: ${name}\n` +
          `WhatsApp: ${whatsapp}\n` +
          `Email: ${email || "Not provided"}\n` +
          `Preferred contact: ${preferred_contact}\n` +
          `Message: ${message}`
      });

      await supabasePatch(`/chat_sessions?id=eq.${encodeURIComponent(session_id)}`, {
        visitor_name: name,
        visitor_whatsapp: whatsapp,
        visitor_email: email,
        status: "waiting_agent",
        updated_at: new Date().toISOString()
      });
    }

    return response.status(200).json({
      ok: true,
      lead: Array.isArray(lead) ? lead[0] : lead
    });

  } catch (error) {
    console.error("Lead server error:", error);
    return response.status(500).json({
      error: "Lead server error.",
      details: error.message
    });
  }
}

async function supabaseInsert(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: serviceHeaders("return=representation"),
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `Supabase insert failed with status ${res.status}`);
  }

  return text ? JSON.parse(text) : null;
}

async function supabasePatch(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "PATCH",
    headers: serviceHeaders("return=minimal"),
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `Supabase patch failed with status ${res.status}`);
  }

  return text ? JSON.parse(text) : null;
}

function serviceHeaders(prefer) {
  return {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": prefer
  };
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .slice(0, maxLength);
}

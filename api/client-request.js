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

    const payload = {
      package_id: safeBigInt(body.package_id),
      package_name: sanitizeText(body.package_name || "", 180),
      name: sanitizeText(body.name || "", 120),
      whatsapp: sanitizeText(body.whatsapp || "", 80),
      email: sanitizeText(body.email || "", 160),
      preferred_contact: sanitizeText(body.preferred_contact || "whatsapp", 40),
      request_type: sanitizeText(body.request_type || "general", 80),
      budget_range: sanitizeText(body.budget_range || "", 100),
      message: sanitizeText(body.message || "", 2000),
      source: "website_services",
      status: "new"
    };

    if (!payload.name || !payload.whatsapp || !payload.message) {
      return response.status(400).json({
        error: "Name, WhatsApp number, and message are required."
      });
    }

    const inserted = await supabaseInsert("/client_requests", payload);

    return response.status(200).json({
      ok: true,
      request: Array.isArray(inserted) ? inserted[0] : inserted
    });
  } catch (error) {
    console.error("Client request error:", error);
    return response.status(500).json({
      error: "Client request server error.",
      details: error.message
    });
  }
}

async function supabaseInsert(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `Supabase insert failed with status ${res.status}`);
  }

  return text ? JSON.parse(text) : null;
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, maxLength);
}

function safeBigInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

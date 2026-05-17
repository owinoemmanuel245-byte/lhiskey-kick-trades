const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return response.status(500).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables." });
    }

    const body = request.body || {};
    const payload = {
      name: sanitizeText(body.name || "", 120),
      whatsapp: sanitizeText(body.whatsapp || "", 80),
      email: sanitizeText(body.email || "", 160),
      related_to: sanitizeText(body.related_to || "general", 180),
      related_request_id: safeBigInt(body.related_request_id),
      related_request_type: sanitizeText(body.related_request_type || "general", 80),
      amount_paid: safeAmount(body.amount_paid),
      currency: sanitizeText(body.currency || "KES", 10),
      payment_method: normalizePaymentMethod(body.payment_method),
      payment_reference: sanitizeText(body.payment_reference || "", 120),
      proof_file_name: sanitizeText(body.proof_file_name || "", 255),
      proof_file_path: sanitizeText(body.proof_file_path || "", 600),
      proof_file_type: sanitizeText(body.proof_file_type || "", 120),
      proof_file_size: safeBigInt(body.proof_file_size),
      message: sanitizeText(body.message || "", 2000),
      source: "website_payment_proof",
      status: "new"
    };

    if (!payload.name || !payload.whatsapp || !payload.payment_reference) {
      return response.status(400).json({ error: "Name, WhatsApp number, and payment reference are required." });
    }

    const inserted = await supabaseInsert("/payment_proofs", payload);
    return response.status(200).json({ ok: true, proof: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (error) {
    console.error("Payment proof error:", error);
    return response.status(500).json({ error: "Payment proof server error.", details: error.message });
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
  if (!res.ok) throw new Error(text || `Supabase insert failed with status ${res.status}`);
  return text ? JSON.parse(text) : null;
}

function sanitizeText(value, maxLength) {
  return String(value || "").replace(/[<>]/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, maxLength);
}
function safeBigInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
function safeAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
function normalizePaymentMethod(value) {
  const v = String(value || "").toLowerCase();
  return ["mpesa", "bank", "other"].includes(v) ? v : "bank";
}

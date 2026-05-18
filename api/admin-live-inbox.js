const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({ ok:false, error:"Method not allowed" });
  }

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return response.status(500).json({ ok:false, error:"Missing SUPABASE_SERVICE_ROLE_KEY in Vercel." });
    }

    const authHeader = request.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return response.status(401).json({ ok:false, error:"Missing admin auth token." });
    }

    const user = await getUserFromToken(token);
    if (!user?.id) {
      return response.status(401).json({ ok:false, error:"Invalid admin session." });
    }

    const isAdmin = await checkAdminUser(user.id);
    if (!isAdmin) {
      return response.status(403).json({ ok:false, error:"Not allowed. Admin user not found." });
    }

    const [sessions, messages, leads] = await Promise.all([
      serviceGet("/chat_sessions?select=*&order=updated_at.desc&limit=700"),
      serviceGet("/chat_messages?select=*&order=id.desc&limit=1800"),
      serviceGet("/visitor_leads?select=*&order=created_at.desc&limit=1800")
    ]);

    return response.status(200).json({
      ok:true,
      sessions: Array.isArray(sessions) ? sessions : [],
      messages: Array.isArray(messages) ? messages : [],
      leads: Array.isArray(leads) ? leads : []
    });
  } catch (error) {
    console.error("[api/admin-live-inbox]", error);
    return response.status(500).json({ ok:false, error:"Admin inbox server error.", details:error.message });
  }
}

async function getUserFromToken(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.message || data?.error_description || "Could not verify admin session.");
  }

  return data;
}

async function checkAdminUser(userId) {
  const rows = await serviceGet(`/admin_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

async function serviceGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    }
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.message || data?.error || text || `Service GET failed ${res.status}`);
  }

  return data;
}

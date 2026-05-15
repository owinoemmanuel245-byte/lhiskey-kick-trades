const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return response.status(500).json({ ok:false, error:"Missing SUPABASE_SERVICE_ROLE_KEY" });
    }

    const sessionsRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions?select=*&order=updated_at.desc&limit=10`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const sessions = await sessionsRes.json();

    if (!sessionsRes.ok) {
      return response.status(500).json({ ok:false, error:sessions });
    }

    return response.status(200).json({ ok:true, count:sessions.length, sessions });
  } catch (error) {
    return response.status(500).json({ ok:false, error:error.message });
  }
}

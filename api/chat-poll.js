const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sessionId = request.query.session_id;
    const afterId = Number(request.query.after_id || 0);

    if (!sessionId) return response.status(400).json({ error: "session_id is required" });
    if (!SUPABASE_SERVICE_ROLE_KEY) return response.status(500).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const sessionRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*`, {
      headers: headers()
    });
    const sessions = await sessionRes.json();
    const session = sessions?.[0] || null;

    if (!sessionRes.ok || !session) return response.status(404).json({ error: "Session not found" });

    const msgUrl = `${SUPABASE_URL}/rest/v1/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&id=gt.${afterId}&select=*&order=id.asc`;
    const msgRes = await fetch(msgUrl, { headers: headers() });
    const messages = await msgRes.json();

    if (!msgRes.ok) return response.status(500).json({ error: "Could not load messages" });

    return response.status(200).json({ session, messages });
  } catch (error) {
    return response.status(500).json({ error: "Chat poll server error", details: error.message });
  }
}

function headers() {
  return {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

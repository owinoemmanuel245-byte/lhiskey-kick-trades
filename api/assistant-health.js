const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export default async function handler(_request, response) {
  const result = {
    ok: true,
    env: {
      supabase_service_role_key: !!SUPABASE_SERVICE_ROLE_KEY,
      anthropic_api_key: !!ANTHROPIC_API_KEY
    },
    tables: {}
  };

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    result.ok = false;
    result.message = "Missing SUPABASE_SERVICE_ROLE_KEY.";
    return response.status(200).json(result);
  }

  for (const table of ["chat_sessions", "knowledge_base", "service_packages", "showcase_items"]) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        }
      });
      result.tables[table] = { ok: res.ok, status: res.status };
    } catch (error) {
      result.tables[table] = { ok: false, error: error.message };
    }
  }

  response.status(200).json(result);
}

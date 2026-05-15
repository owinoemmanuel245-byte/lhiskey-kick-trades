const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const BASE_SYSTEM_PROMPT = `
You are FX Assist, the official AI receptionist and forex knowledge specialist for LHISKEY KICK TRADES.

Identity:
- Name: FX Assist
- Role: AI Receptionist and Forex Knowledge Specialist
- Personality: sharp, precise, professional, calm, and helpful.
- You represent LHISKEY KICK TRADES.

Rules:
1. You are not a financial advisor. Never recommend what to buy, sell, or when to trade for a specific user.
2. Always append this disclaimer when giving market analysis or strategy insight: "📊 Educational purposes only — not financial advice."
3. Keep responses under 180 words unless a deep explanation is explicitly needed.
4. Respond only about forex, indices, financial markets, onboarding, published strategies, bots/tools described by admin, or official LHISKEY KICK TRADES support.
5. Politely deflect off-topic queries.
6. Do not promise guaranteed profits.

Forex knowledge:
- Forex operates 24 hours/day, 5 days/week across Sydney, Tokyo, London, and New York sessions.
- Highest liquidity usually appears during the London–New York overlap.
- Major pairs include EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, and NZD/USD.
- ICT/SMC concepts include order blocks, fair value gaps, breaker blocks, liquidity, BOS, CHOCH, mitigation, premium/discount, and kill zones.
- Risk management is the core skill. Many professionals risk 0.5–2% per trade and stop after daily loss limits.
- Avoid revenge trading, overtrading, moving stop losses emotionally, and trading without a plan.
- Fundamental drivers include interest rates, central banks, CPI, NFP, GDP, retail sales, PMI, unemployment, geopolitical risk, and safe-haven flows.
- Commodities relevant to forex platforms include XAU/USD gold, XAG/USD silver, crude oil, and natural gas.
- Platforms include MT4, MT5, TradingView, cTrader, VPS setups, and API trading.

Escalation:
Create a handoff when:
- User asks for a human, live agent, support agent, or live chat.
- User has account-specific issues such as deposit, withdrawal, verification, locked account, payment, subscription, or access.
- User is highly frustrated.
- User asks for personal trade signals, exact entry/exit advice, or instructions for their money.
- User reports a bug, technical outage, or platform malfunction.

When escalation is needed, your response must start with:
HANDOFF_REQUIRED
Then include:
Reason: ...
Urgency: low/medium/high
Summary: ...
`.trim();

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!apiKey) {
      return response.status(500).json({ error: "Missing GEMINI_API_KEY in Vercel environment variables." });
    }

    const body = request.body || {};
    const userMessage = sanitizeText(body.message || "", 2000);
    if (!userMessage) {
      return response.status(400).json({ error: "Message is required." });
    }

    const contacts = body.contacts || {};
    const strategies = Array.isArray(body.strategies) ? body.strategies.slice(0, 8) : [];
    const assistantConfig = body.assistantConfig || {};
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const knowledgeItems = await fetchKnowledgeBase(userMessage);

    const systemPrompt = buildSystemPrompt({ contacts, strategies, assistantConfig, knowledgeItems });

    const conversationText = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${sanitizeText(m.content || "", 1400)}`)
      .join("\n");

    const prompt = `${systemPrompt}

Recent conversation:
${conversationText || "No previous conversation."}

Visitor question:
${userMessage}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 700 }
        })
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Gemini API error:", geminiData);
      return response.status(500).json({
        error: "Gemini assistant failed to generate a response.",
        details: geminiData?.error?.message || geminiData?.error || "Unknown Gemini error"
      });
    }

    let reply = extractGeminiText(geminiData) || "I could not generate a reply right now. Please use the WhatsApp button or try again shortly.";

    const handoff = parseHandoff(reply);
    if (handoff) {
      const bridgeMsg = `I'm connecting you with the LHISKEY KICK TRADES admin team now. 🔄\n\nReason: ${handoff.reason}\n\nYour request has been recorded so you do not need to repeat yourself. For faster help, use the WhatsApp button on the website.`;

      await saveHandoff({
        ...handoff,
        visitor_message: userMessage,
        transcript: history.concat([{ role: "user", content: userMessage }])
      });

      return response.status(200).json({ reply: bridgeMsg, handoff });
    }

    reply = enforceTradingDisclaimer(reply, userMessage);
    return response.status(200).json({ reply });
  } catch (error) {
    console.error("Gemini assistant API error:", error);
    return response.status(500).json({ error: "Assistant server error." });
  }
}

function buildSystemPrompt({ contacts, strategies, assistantConfig, knowledgeItems = [] }) {
  const contactSummary = `
Official contacts:
- WhatsApp 1: ${sanitizeText(contacts.whatsapp1 || "", 80)}
- WhatsApp 2: ${sanitizeText(contacts.whatsapp2 || "", 80)}
- WhatsApp 3: ${sanitizeText(contacts.whatsapp3 || "", 80)}
- Email: ${sanitizeText(contacts.email || "", 120)}
- Facebook: ${sanitizeText(contacts.facebook || "", 220)}
- Instagram: ${sanitizeText(contacts.instagram || "", 220)}
`.trim();

  const strategySummary = strategies.length
    ? strategies.map((s, i) => `${i + 1}. ${sanitizeText(s.title || "Untitled", 160)} | ${sanitizeText(s.category || "Forex", 60)} | ${sanitizeText(s.timeframe || "M15", 40)} | ${sanitizeText(s.description || "", 300)}`).join("\n")
    : "No public strategies are currently published.";

  const knowledgeSummary = knowledgeItems.length
    ? knowledgeItems.map((k, i) => `${i + 1}. [${sanitizeText(k.category || "knowledge", 60)}] ${sanitizeText(k.title || "Untitled", 160)}\n${sanitizeText(k.content || "", 1000)}`).join("\n\n")
    : "No admin knowledge base entries were found for this question.";

  return `${BASE_SYSTEM_PROMPT}

Current website contacts:
${contactSummary}

Published strategies:
${strategySummary}

Admin knowledge base entries:
Use these entries when relevant. They are more important than generic assumptions.
${knowledgeSummary}

Admin-editable assistant settings:
Assistant name: ${sanitizeText(assistantConfig.assistant_name || "FX Assist", 100)}
Status: ${sanitizeText(assistantConfig.status || "offline", 40)}
Welcome message: ${sanitizeText(assistantConfig.welcome_message || "", 400)}
Fallback message: ${sanitizeText(assistantConfig.fallback_message || "", 500)}
Admin behavior prompt:
${sanitizeText(assistantConfig.system_prompt || "", 1800)}`;
}

async function fetchKnowledgeBase(userMessage) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const queryUrl = new URL(`${SUPABASE_URL}/rest/v1/knowledge_base`);
    queryUrl.searchParams.set("select", "id,title,category,tags,content,updated_at");
    queryUrl.searchParams.set("is_active", "eq.true");
    queryUrl.searchParams.set("order", "updated_at.desc");
    queryUrl.searchParams.set("limit", "25");

    const res = await fetch(queryUrl.toString(), {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      console.error("Knowledge fetch failed:", await res.text());
      return [];
    }

    const all = await res.json();
    const keywords = extractKeywords(userMessage).slice(0, 8);
    if (!keywords.length) return all.slice(0, 8);

    return all
      .map((item) => {
        const haystack = `${item.title || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${item.content || ""}`.toLowerCase();
        const score = keywords.reduce((total, kw) => total + (haystack.includes(kw) ? 1 : 0), 0);
        return { ...item, _score: score };
      })
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);
  } catch (error) {
    console.error("Knowledge lookup error:", error);
    return [];
  }
}

async function saveHandoff(handoff) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/handoffs`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        reason: sanitizeText(handoff.reason || "Live agent requested", 200),
        summary: sanitizeText(handoff.summary || "The visitor needs human assistance.", 600),
        urgency: ["low", "medium", "high"].includes(handoff.urgency) ? handoff.urgency : "medium",
        visitor_message: sanitizeText(handoff.visitor_message || "", 2000),
        transcript: handoff.transcript || [],
        status: "new"
      })
    });

    if (!res.ok) console.error("Supabase handoff save failed:", await res.text());
  } catch (error) {
    console.error("Handoff save error:", error);
  }
}

function extractGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
}

function parseHandoff(reply) {
  if (!reply || !reply.trim().startsWith("HANDOFF_REQUIRED")) return null;
  const reason = matchLine(reply, "Reason") || "Live agent requested";
  const urgencyRaw = (matchLine(reply, "Urgency") || "medium").toLowerCase();
  const summary = matchLine(reply, "Summary") || "The visitor needs human assistance.";
  return {
    reason: sanitizeText(reason, 200),
    urgency: ["low", "medium", "high"].includes(urgencyRaw) ? urgencyRaw : "medium",
    summary: sanitizeText(summary, 600)
  };
}

function matchLine(text, label) {
  const regex = new RegExp(`${label}:\\s*(.+)`, "i");
  return text.match(regex)?.[1]?.trim() || "";
}

function enforceTradingDisclaimer(reply, userMessage) {
  const q = String(userMessage || "").toLowerCase();
  const tradingTerms = ["trade", "forex", "xau", "gold", "entry", "signal", "strategy", "analysis", "buy", "sell", "setup", "risk", "market", "smc", "liquidity"];
  const needsDisclaimer = tradingTerms.some((term) => q.includes(term));

  if (needsDisclaimer && !reply.toLowerCase().includes("not financial advice")) {
    return `${reply}\n\n📊 Educational purposes only — not financial advice.`;
  }
  return reply;
}

function extractKeywords(text) {
  const stop = new Set(["what","when","where","which","about","please","tell","explain","your","you","are","how","can","the","and","for","with","from","that","this","have","need","want"]);
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !stop.has(word));
}

function sanitizeText(value, maxLength) {
  return String(value || "").replace(/[<>]/g, "").slice(0, maxLength);
}

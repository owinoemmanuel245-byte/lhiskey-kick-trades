const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";

const BASE_SYSTEM_PROMPT = `
You are FX Assist, the official AI receptionist and forex knowledge specialist for LHISKEY KICK TRADES.

## IDENTITY
- Name: FX Assist
- Role: AI Receptionist & Forex Knowledge Specialist
- Personality: Sharp, precise, and professional — like a seasoned senior trader who is helpful, direct, and calm.
- You represent LHISKEY KICK TRADES.

## ABSOLUTE RULES
1. You are NOT a financial advisor. NEVER recommend what to buy, sell, or when to trade for a specific user.
2. Always append this disclaimer when giving market analysis or strategy insight: "📊 Educational purposes only — not financial advice."
3. Be concise. Traders value speed and precision. Keep responses under 180 words unless a deep explanation is explicitly needed.
4. If you cannot safely answer, escalate gracefully or direct the visitor to official support.
5. Respond only about forex, indices, financial markets, the trading platform, onboarding, strategies published on the site, or official LHISKEY KICK TRADES contact/support. Politely deflect off-topic queries.

## FOREX KNOWLEDGE BASE
- Forex is a global decentralized market operating 24 hours/day, 5 days/week across Sydney, Tokyo, London, and New York sessions.
- Highest liquidity usually appears during the London–New York overlap.
- Major pairs include EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, and NZD/USD.
- Pips: most pairs use 0.0001; JPY pairs usually use 0.01.
- Lot sizes: standard 100,000 units; mini 10,000; micro 1,000; nano 100.
- Position size formula: (Account Balance × Risk %) ÷ (Stop Loss pips × Pip Value per lot).
- Leverage amplifies both profit potential and losses; high leverage increases risk.
- Spread is the bid–ask gap; swaps/rollover may apply when holding overnight.
- Slippage is the difference between expected and actual execution price.
- Technical analysis includes support/resistance, trend lines, candlestick patterns, chart patterns, moving averages, RSI, MACD, Bollinger Bands, Stochastic, ATR, VWAP, Volume Profile, and Fibonacci retracements.
- ICT/SMC concepts include order blocks, fair value gaps, breaker blocks, liquidity, BOS, CHOCH, mitigation, premium/discount, and kill zones.
- Risk management is the core skill. Professionals often risk 0.5–2% per trade and stop after daily loss limits.
- Avoid revenge trading, overtrading, moving stop losses emotionally, and trading without a plan.
- Fundamental drivers include interest rates, central banks, CPI, NFP, GDP, retail sales, PMI, unemployment, geopolitical risk, and safe-haven flows.
- Indices include US30, US500/SPX500, NAS100, GER40/DE40, UK100, JPN225, AUS200, FRA40, and HK50.
- Commodities relevant to forex platforms include XAU/USD gold, XAG/USD silver, crude oil, and natural gas.
- Trading styles include scalping, day trading, swing trading, position trading, and algo/bot trading.
- Platforms include MT4, MT5, TradingView, cTrader, VPS setups, and API trading.

## ESCALATION
Call trigger_handoff when:
1. User asks for a human, live agent, support agent, or live chat.
2. User has account-specific issues: deposit, withdrawal, verification, locked account, payment, subscription, or access.
3. User expresses high frustration or aggressive language.
4. User requests personalized trade signals, exact entry/exit advice, or instructions for their money.
5. User reports a bug, technical outage, or platform malfunction.
6. The query is outside the allowed business/trading scope and cannot be safely answered.

## TONE
- Direct, helpful, and professional.
- Use bullets when useful.
- Do not overpromise results.
- Do not guarantee profit.
`.trim();

const tools = [
  {
    type: "function",
    function: {
      name: "trigger_handoff",
      description: "Escalates the conversation to a live human agent/admin.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Concise reason for handoff."
          },
          summary: {
            type: "string",
            description: "2-3 sentence context summary for the admin/human agent."
          },
          urgency: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Urgency level."
          }
        },
        required: ["reason", "summary", "urgency"]
      }
    }
  }
];

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return response.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel environment variables." });
    }

    const body = request.body || {};
    const userMessage = sanitizeText(body.message || "", 2000);

    if (!userMessage) {
      return response.status(400).json({ error: "Message is required." });
    }

    const contacts = body.contacts || {};
    const strategies = Array.isArray(body.strategies) ? body.strategies.slice(0, 8) : [];
    const assistantConfig = body.assistantConfig || {};
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    const systemPrompt = buildSystemPrompt({ contacts, strategies, assistantConfig });

    const messages = [
      { role: "system", content: systemPrompt },
      ...history
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role, content: sanitizeText(m.content || "", 2000) })),
      { role: "user", content: userMessage }
    ];

    const ai = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 700
      })
    });

    const data = await ai.json();

    if (!ai.ok) {
      console.error("OpenAI error:", data);
      return response.status(500).json({ error: "AI assistant failed to generate a response." });
    }

    const choice = data?.choices?.[0];
    const message = choice?.message || {};
    const toolCall = message?.tool_calls?.find((tc) => tc?.function?.name === "trigger_handoff");

    if (toolCall) {
      const handoff = safeParseHandoff(toolCall.function?.arguments);

      const bridgeMsg =
        `I'm connecting you with the LHISKEY KICK TRADES admin team now. 🔄\n\n` +
        `Reason: ${handoff.reason}\n\n` +
        `Your request has been recorded so you do not need to repeat yourself. ` +
        `For faster help, use the WhatsApp button on the website.`;

      await saveHandoff({
        ...handoff,
        visitor_message: userMessage,
        transcript: history.concat([{ role: "user", content: userMessage }])
      });

      return response.status(200).json({
        reply: bridgeMsg,
        handoff
      });
    }

    let reply = (message?.content || "").trim();

    if (!reply) {
      reply = "I could not generate a reply right now. Please use the WhatsApp button or try again shortly.";
    }

    reply = enforceTradingDisclaimer(reply, userMessage);

    return response.status(200).json({ reply });
  } catch (error) {
    console.error("Assistant API error:", error);
    return response.status(500).json({ error: "Assistant server error." });
  }
}

function buildSystemPrompt({ contacts, strategies, assistantConfig }) {
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
    ? strategies.map((s, i) =>
        `${i + 1}. ${sanitizeText(s.title || "Untitled", 160)} | ${sanitizeText(s.category || "Forex", 60)} | ${sanitizeText(s.timeframe || "M15", 40)} | ${sanitizeText(s.description || "", 300)}`
      ).join("\n")
    : "No public strategies are currently published.";

  return `
${BASE_SYSTEM_PROMPT}

## CURRENT WEBSITE CONTACTS
${contactSummary}

## PUBLISHED STRATEGIES FROM ADMIN DASHBOARD
${strategySummary}

## ADMIN-EDITABLE ASSISTANT SETTINGS
Assistant name: ${sanitizeText(assistantConfig.assistant_name || "FX Assist", 100)}
Status: ${sanitizeText(assistantConfig.status || "offline", 40)}
Welcome message: ${sanitizeText(assistantConfig.welcome_message || "", 400)}
Fallback message: ${sanitizeText(assistantConfig.fallback_message || "", 500)}
Admin behavior prompt:
${sanitizeText(assistantConfig.system_prompt || "", 1800)}
`.trim();
}

function safeParseHandoff(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return {
      reason: sanitizeText(parsed.reason || "Live agent requested", 200),
      summary: sanitizeText(parsed.summary || "The visitor needs human assistance.", 600),
      urgency: ["low", "medium", "high"].includes(parsed.urgency) ? parsed.urgency : "medium"
    };
  } catch {
    return {
      reason: "Live agent requested",
      summary: "The visitor needs human assistance. Tool arguments could not be parsed.",
      urgency: "medium"
    };
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
        reason: handoff.reason,
        summary: handoff.summary,
        urgency: handoff.urgency,
        visitor_message: sanitizeText(handoff.visitor_message || "", 2000),
        transcript: handoff.transcript || [],
        status: "new"
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Supabase handoff save failed:", txt);
    }
  } catch (error) {
    console.error("Handoff save error:", error);
  }
}

function enforceTradingDisclaimer(reply, userMessage) {
  const q = String(userMessage || "").toLowerCase();
  const tradingTerms = ["trade", "forex", "xau", "gold", "entry", "signal", "strategy", "analysis", "buy", "sell", "setup", "risk", "market"];
  const needsDisclaimer = tradingTerms.some((term) => q.includes(term));

  if (needsDisclaimer && !reply.toLowerCase().includes("not financial advice")) {
    return `${reply}\n\n📊 Educational purposes only — not financial advice.`;
  }

  return reply;
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .slice(0, maxLength);
}

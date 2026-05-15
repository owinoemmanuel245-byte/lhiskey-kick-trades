const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = request.body || {};
    const message = sanitizeText(body.message || "", 2000);
    const sessionId = body.session_id || body.sessionId || null;
    const contacts = body.contacts || {};
    const strategies = Array.isArray(body.strategies) ? body.strategies.slice(0, 8) : [];
    const assistantConfig = body.assistantConfig || {};

    if (!message) {
      return response.status(400).json({ error: "Message is required." });
    }

    const session = await getOrCreateSession(sessionId);
    const userMessage = await insertChatMessage(session.id, "visitor", message);

    // If admin has already taken over or visitor is waiting, do not keep bot answering.
    // If visitor has not submitted contact details yet, keep showing the lead form.
    if (session.status === "live_agent" || session.status === "waiting_agent") {
      const missingDetails = !session.visitor_name || !session.visitor_whatsapp;

      const reply = missingDetails
        ? "Your support request is open. Please share your name, WhatsApp number, email, and a short message using the form below so admin can follow up properly."
        : session.status === "live_agent"
          ? "Your message has been sent to the live agent. Please wait for a reply in this chat."
          : "Your message has been added to the support request. An admin can reply here when available.";

      const botMsg = await insertChatMessage(session.id, "system", reply);

      return response.status(200).json({
        reply,
        session_id: session.id,
        status: session.status,
        userMessageId: userMessage.id,
        botMessageId: botMsg.id,
        live_mode: true,
        handoff: missingDetails ? {
          reason: session.handoff_reason || "Visitor requested live support",
          urgency: "medium",
          summary: "Existing support session is waiting for visitor contact details.",
          request_details: true,
          whatsapp: contacts.whatsapp1 || "+254113881279"
        } : null
      });
    }

    const knowledgeItems = await fetchKnowledgeBase(message);
    const decision = decideIntent(message);

    if (decision.handoff) {
      await updateSessionStatus(session.id, "waiting_agent", decision.reason);

      const handoff = {
        reason: decision.reason,
        urgency: decision.urgency,
        summary: buildHandoffSummary(message, decision.reason)
      };

      await saveHandoff({
        session_id: session.id,
        ...handoff,
        visitor_message: message,
        transcript: [{ role: "user", content: message }]
      });

      const reply =
        `I should connect you with the LHISKEY KICK TRADES admin team for this. 🔄\n\n` +
        `Reason: ${handoff.reason}\n\n` +
        `Please share your name, WhatsApp number, email, and a short message in the form below. ` +
        `You can also keep this chat open — when admin replies, the response will appear here.`;

      const botMsg = await insertChatMessage(session.id, "bot", reply);

      return response.status(200).json({
        reply,
        session_id: session.id,
        status: "waiting_agent",
        userMessageId: userMessage.id,
        botMessageId: botMsg.id,
        handoff: {
          ...handoff,
          request_details: true,
          whatsapp: contacts.whatsapp1 || "+254113881279"
        }
      });
    }

    const reply = buildReply({
      message,
      decision,
      contacts,
      strategies,
      knowledgeItems,
      assistantConfig
    });

    const botMsg = await insertChatMessage(session.id, "bot", reply);

    return response.status(200).json({
      reply,
      session_id: session.id,
      status: "bot_mode",
      userMessageId: userMessage.id,
      botMessageId: botMsg.id
    });
  } catch (error) {
    console.error("v8 assistant error:", error);
    return response.status(500).json({ error: "Assistant server error." });
  }
}

async function getOrCreateSession(sessionId) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  if (sessionId) {
    const existing = await supabaseRest(`/chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*`, {
      method: "GET"
    });

    if (Array.isArray(existing) && existing[0]) return existing[0];
  }

  const created = await supabaseRest("/chat_sessions", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({
      status: "bot_mode",
      source: "website_ai_assistant",
      visitor_label: "Website Visitor"
    })
  });

  return Array.isArray(created) ? created[0] : created;
}

async function insertChatMessage(sessionId, authorType, content) {
  const inserted = await supabaseRest("/chat_messages", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({
      session_id: sessionId,
      author_type: authorType,
      content: sanitizeText(content, 4000)
    })
  });

  return Array.isArray(inserted) ? inserted[0] : inserted;
}

async function updateSessionStatus(sessionId, status, reason = "") {
  return supabaseRest(`/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({
      status,
      handoff_reason: reason,
      updated_at: new Date().toISOString()
    })
  });
}

async function supabaseRest(path, options = {}) {
  const headers = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("Supabase REST error:", res.status, text);
    throw new Error(`Supabase error ${res.status}`);
  }

  return text ? JSON.parse(text) : null;
}

function decideIntent(message) {
  const q = message.toLowerCase();

  const exactSignal = [
    "where should i enter", "where do i enter", "give me entry", "entry price",
    "stop loss", "take profit", "tp", "sl", "buy now", "sell now",
    "should i buy", "should i sell", "signal", "give signal", "trade for me"
  ];

  const human = [
    "human", "live agent", "agent", "support", "admin", "call me",
    "talk to someone", "whatsapp me", "customer care", "help me personally"
  ];

  const accountIssue = [
    "payment", "paid", "deposit", "withdraw", "withdrawal", "refund", "subscription",
    "locked", "login", "verification", "account", "access", "not working", "bug", "error"
  ];

  const frustration = [
    "angry", "scam", "fake", "useless", "not responding", "bad service",
    "i lost money", "you made me lose", "nonsense"
  ];

  if (containsAny(q, exactSignal)) {
    return { type: "restricted_trade_advice", handoff: true, reason: "Visitor requested exact trade signal or personalized trading advice", urgency: "high" };
  }

  if (containsAny(q, human)) {
    return { type: "human_request", handoff: true, reason: "Visitor requested live human support", urgency: "medium" };
  }

  if (containsAny(q, accountIssue)) {
    return { type: "account_or_technical_issue", handoff: true, reason: "Visitor has account, payment, access, or technical issue", urgency: "high" };
  }

  if (containsAny(q, frustration)) {
    return { type: "frustration", handoff: true, reason: "Visitor appears frustrated and needs human support", urgency: "high" };
  }

  if (containsAny(q, ["contact", "phone", "email", "whatsapp", "facebook", "instagram"])) return { type: "contact", handoff: false };
  if (containsAny(q, ["bot", "ea", "expert advisor", "mt5", "automation", "robot"])) return { type: "bot_info", handoff: false };
  if (containsAny(q, ["strategy", "setup", "smc", "ict", "liquidity", "order block", "fvg", "market structure", "gold", "xauusd", "forex", "risk"])) return { type: "education", handoff: false };
  if (containsAny(q, ["what is lhiskey", "lhiskey kick", "about", "who are you", "what do you do"])) return { type: "about", handoff: false };

  return { type: "general", handoff: false };
}

function buildReply({ message, decision, contacts, strategies, knowledgeItems }) {
  const knowledgeAnswer = answerFromKnowledge(knowledgeItems);
  if (knowledgeAnswer) return addDisclaimerIfNeeded(knowledgeAnswer, message);

  if (decision.type === "contact") return buildContactReply(contacts);

  if (decision.type === "bot_info") {
    return addDisclaimerIfNeeded(
      `LHISKEY KICK TRADES can present bot/tool information through the admin Knowledge Base. Bots should be treated as trading technology for education, testing, alerts, or automation support — not guaranteed profit machines. For a specific bot file, pricing, access, or setup help, request a live agent.`,
      message
    );
  }

  if (decision.type === "about") {
    return `LHISKEY KICK TRADES is a forex education and trading technology brand focused on price action, market structure, liquidity, supply and demand, risk management, strategy documentation, trading tools, and disciplined trader development. It does not promise guaranteed profits.`;
  }

  if (decision.type === "education") return addDisclaimerIfNeeded(buildEducationReply(message, strategies), message);

  return `I can help with basic forex education, LHISKEY KICK TRADES information, published strategy explanations, bot/tool descriptions, contact details, and support routing. If you need personal help, ask for a live agent and I will connect you with admin support in this chat.`;
}

function answerFromKnowledge(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const item = items[0];
  const title = sanitizeText(item.title || "Knowledge Base", 180);
  const content = sanitizeText(item.content || "", 900);
  if (!content) return "";
  return `Based on the LHISKEY KICK TRADES Knowledge Base:\n\n**${title}**\n${content}`;
}

function buildEducationReply(message, strategies) {
  const q = message.toLowerCase();

  if (q.includes("smc") || q.includes("ict") || q.includes("liquidity")) {
    return `SMC/ICT focuses on reading how liquidity and structure influence price movement.\n\n- Liquidity often sits above equal highs and below equal lows.\n- Market structure shows whether price is bullish, bearish, or ranging.\n- Order blocks mark possible institutional reaction areas.\n- Fair value gaps show imbalance areas price may revisit.\n\nA disciplined trader waits for confirmation and manages risk instead of chasing candles.`;
  }

  if (q.includes("risk")) {
    return `Risk management protects the trader before profit is even considered.\n\n- Risk only a small percentage per trade.\n- Use a predefined stop-loss.\n- Avoid revenge trading.\n- Stop after a daily loss limit.\n- Journal every trade.\n\nThe goal is survival, consistency, and discipline.`;
  }

  if (q.includes("gold") || q.includes("xau")) {
    return `Gold/XAUUSD is volatile and reacts strongly to USD strength, inflation data, interest-rate expectations, news, and liquidity sweeps. Beginners should be careful with lot size, spreads, and stop-loss distance. LHISKEY KICK TRADES treats gold education with a risk-first approach.`;
  }

  if (strategies && strategies.length > 0) {
    const list = strategies.slice(0, 5).map((s, i) => `${i + 1}. ${s.title || "Untitled strategy"} — ${s.description || "No description provided."}`).join("\n");
    return `Published strategies currently include:\n\n${list}\n\nThese are educational summaries. For personal guidance, request a live agent.`;
  }

  return `Forex education at LHISKEY KICK TRADES focuses on market structure, liquidity, supply and demand, risk control, trade planning, and discipline.`;
}

function buildContactReply(contacts) {
  const w1 = contacts.whatsapp1 || "+254113881279";
  const w2 = contacts.whatsapp2 || "+254743520031";
  const w3 = contacts.whatsapp3 || "+254742307706";
  const email = contacts.email || "owinoemmanuel245@gmail.com";
  const facebook = contacts.facebook || "";
  const instagram = contacts.instagram || "";

  return `You can contact LHISKEY KICK TRADES through:\n\nWhatsApp:\n- ${formatPhone(w1)}\n- ${formatPhone(w2)}\n- ${formatPhone(w3)}\n\nEmail: ${email}\n${facebook ? `Facebook: ${facebook}\n` : ""}${instagram ? `Instagram: ${instagram}` : ""}`;
}

async function fetchKnowledgeBase(userMessage) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const queryUrl = new URL(`${SUPABASE_URL}/rest/v1/knowledge_base`);
    queryUrl.searchParams.set("select", "id,title,category,tags,content,updated_at");
    queryUrl.searchParams.set("is_active", "eq.true");
    queryUrl.searchParams.set("order", "updated_at.desc");
    queryUrl.searchParams.set("limit", "30");

    const res = await fetch(queryUrl.toString(), {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) return [];
    const all = await res.json();
    const keywords = extractKeywords(userMessage).slice(0, 10);
    if (!keywords.length) return all.slice(0, 6);

    return all
      .map((item) => {
        const haystack = `${item.title || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${item.content || ""}`.toLowerCase();
        const score = keywords.reduce((total, kw) => total + (haystack.includes(kw) ? 1 : 0), 0);
        return { ...item, _score: score };
      })
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
  } catch {
    return [];
  }
}

async function saveHandoff(handoff) {
  try {
    await supabaseRest("/handoffs", {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({
        session_id: handoff.session_id || null,
        reason: sanitizeText(handoff.reason || "Live agent requested", 200),
        summary: sanitizeText(handoff.summary || "The visitor needs human assistance.", 600),
        urgency: ["low", "medium", "high"].includes(handoff.urgency) ? handoff.urgency : "medium",
        visitor_message: sanitizeText(handoff.visitor_message || "", 2000),
        transcript: handoff.transcript || [],
        status: "new"
      })
    });
  } catch (error) {
    console.error("Handoff save error:", error);
  }
}

function buildHandoffSummary(message, reason) {
  return `The visitor said: "${sanitizeText(message, 500)}". Reason for handoff: ${reason}.`;
}

function addDisclaimerIfNeeded(reply, message) {
  const q = message.toLowerCase();
  const terms = ["trade", "forex", "xau", "gold", "entry", "signal", "strategy", "analysis", "buy", "sell", "setup", "risk", "market", "smc", "liquidity", "bot"];
  const needs = terms.some((t) => q.includes(t));
  if (needs && !reply.toLowerCase().includes("not financial advice")) return `${reply}\n\n📊 Educational purposes only — not financial advice.`;
  return reply;
}

function containsAny(text, list) { return list.some((item) => text.includes(item)); }

function extractKeywords(text) {
  const stop = new Set(["what","when","where","which","about","please","tell","explain","your","you","are","how","can","the","and","for","with","from","that","this","have","need","want","give","show"]);
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !stop.has(word));
}

function formatPhone(phone) {
  const clean = String(phone || "").replace(/[^\d+]/g, "");
  if (clean.startsWith("+254") && clean.length === 13) return "+254 " + clean.slice(4, 7) + " " + clean.slice(7, 10) + " " + clean.slice(10);
  return phone;
}

function sanitizeText(value, maxLength) { return String(value || "").replace(/[<>]/g, "").slice(0, maxLength); }

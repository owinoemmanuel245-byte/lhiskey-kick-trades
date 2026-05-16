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
    // Do not spam repeated system messages into the conversation.
    if (session.status === "live_agent" || session.status === "waiting_agent") {
      const missingDetails = !session.visitor_name || !session.visitor_whatsapp;

      if (missingDetails) {
        const reply = "Your support request is open. Please share your name, WhatsApp number, email, and a short message using the form below so admin can follow up properly.";

        return response.status(200).json({
          reply,
          session_id: session.id,
          status: session.status,
          userMessageId: userMessage.id,
          live_mode: true,
          ack_only: false,
          handoff: {
            reason: session.handoff_reason || "Visitor requested live support",
            urgency: "medium",
            summary: "Existing support session is waiting for visitor contact details.",
            request_details: true,
            whatsapp: contacts.whatsapp1 || "+254113881279"
          }
        });
      }

      return response.status(200).json({
        reply: "",
        session_id: session.id,
        status: session.status,
        userMessageId: userMessage.id,
        live_mode: true,
        ack_only: true
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
        `I understand — let me connect you with the LHISKEY KICK TRADES admin team. 🔄\n\n` +
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
  const q = normalizeIntentText(message);
  const tokens = q.split(" ").filter(Boolean);

  const exactSignalPhrases = [
    "where should i enter", "where do i enter", "give me entry", "entry price",
    "stop loss", "take profit", "give me tp", "give me sl", "buy now", "sell now",
    "should i buy", "should i sell", "give signal", "trade for me",
    "send signal", "gold signal", "forex signal", "xauusd signal"
  ];

  const exactSignalWords = ["entry", "entries", "tp", "sl", "signal", "signals"];

  const supportPhrases = [
    "live agent", "real agent", "human agent", "talk to someone", "speak to someone",
    "talk to a person", "speak to a person", "talk to human", "speak to human",
    "connect me", "connect to admin", "connect to support", "customer care",
    "live support", "human support", "support team", "admin support",
    "i need help", "i want help", "help me", "call me", "whatsapp me",
    "talk with someone", "speak with someone", "representative", "operator",
    "nataka agent", "nataka admin", "nataka support", "nataka kuongea",
    "naomba msaada", "ongea na mtu", "nisaidie", "msaada"
  ];

  const supportVerbs = [
    "want", "need", "talk", "speak", "connect", "chat", "contact", "call",
    "reach", "help", "assist", "require", "request", "find", "link",
    "nataka", "ongea", "nisaidie", "saidia", "naomba"
  ];

  const humanWords = [
    "agent", "agant", "egent", "human", "person", "someone", "somebody",
    "admin", "support", "representative", "rep", "operator", "staff",
    "customer", "care", "attendant", "assistant", "live", "mtu", "msaada"
  ];

  const accountIssuePhrases = [
    "payment issue", "i have paid", "i paid", "deposit issue", "withdrawal issue",
    "refund", "subscription", "locked account", "cannot login", "cant login",
    "verification", "access problem", "not working", "technical issue", "bug",
    "error", "dashboard problem", "bot not working", "file not opening"
  ];

  const frustrationPhrases = [
    "i am angry", "im angry", "angry", "scam", "fake", "useless", "not responding",
    "bad service", "i lost money", "you made me lose", "nonsense", "waste of time",
    "this is annoying", "i am tired", "im tired of this"
  ];

  const contactTerms = ["contact", "phone", "email", "mail", "whatsapp", "facebook", "instagram", "number", "call", "socials", "dm"];
  const botTerms = ["bot", "bots", "ea", "expert advisor", "mt5", "mt4", "automation", "robot", "algo", "indicator", "software", "tool", "tools"];
  const educationTerms = ["strategy", "setup", "smc", "ict", "liquidity", "order block", "fvg", "fair value gap", "market structure", "gold", "xauusd", "forex", "risk", "support and resistance", "supply", "demand", "candlestick"];
  const aboutTerms = ["what is lhiskey", "lhiskey kick", "about lhiskey", "who are you", "what do you do", "what is this", "about the app", "about your platform"];

  if (hasFlexiblePhrase(q, exactSignalPhrases) || hasTokenMatch(tokens, exactSignalWords, 1)) {
    return { type: "restricted_trade_advice", handoff: true, reason: "Visitor requested exact trade signal or personalized trading advice", urgency: "high" };
  }

  if (hasFlexiblePhrase(q, accountIssuePhrases)) {
    return { type: "account_or_technical_issue", handoff: true, reason: "Visitor has account, payment, access, or technical issue", urgency: "high" };
  }

  if (hasFlexiblePhrase(q, frustrationPhrases)) {
    return { type: "frustration", handoff: true, reason: "Visitor appears frustrated and needs human support", urgency: "high" };
  }

  const phraseSupport = hasFlexiblePhrase(q, supportPhrases);
  const hasHuman = hasTokenMatch(tokens, humanWords, 1);
  const hasVerb = hasTokenMatch(tokens, supportVerbs, 1);
  const asksQuestionSupport = q.includes("can i") || q.includes("could i") || q.includes("may i") || q.includes("please");

  if (phraseSupport || (hasHuman && (hasVerb || asksQuestionSupport))) {
    return { type: "human_request", handoff: true, reason: "Visitor requested live human support", urgency: "medium" };
  }

  if (hasFlexiblePhrase(q, contactTerms) || hasTokenMatch(tokens, contactTerms, 1)) return { type: "contact", handoff: false };
  if (hasFlexiblePhrase(q, botTerms) || hasTokenMatch(tokens, botTerms, 1)) return { type: "bot_info", handoff: false };
  if (hasFlexiblePhrase(q, educationTerms) || hasTokenMatch(tokens, educationTerms, 1)) return { type: "education", handoff: false };
  if (hasFlexiblePhrase(q, aboutTerms)) return { type: "about", handoff: false };

  return { type: "general", handoff: false };
}

function normalizeIntentText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFlexiblePhrase(text, phrases) {
  return phrases.some((phrase) => {
    const p = normalizeIntentText(phrase);
    if (!p) return false;
    if (text.includes(p)) return true;

    const phraseTokens = p.split(" ").filter(Boolean);
    const textTokens = text.split(" ").filter(Boolean);

    if (phraseTokens.length === 1) return hasTokenMatch(textTokens, phraseTokens, 1);

    let hits = 0;
    for (const pt of phraseTokens) {
      if (hasTokenMatch(textTokens, [pt], 1)) hits += 1;
    }

    return hits >= Math.max(2, Math.ceil(phraseTokens.length * 0.72));
  });
}

function hasTokenMatch(tokens, dictionary, minHits = 1) {
  let hits = 0;
  for (const word of dictionary) {
    const normalizedWord = normalizeIntentText(word);
    if (!normalizedWord) continue;

    if (normalizedWord.includes(" ")) {
      const joined = tokens.join(" ");
      if (hasFlexiblePhrase(joined, [normalizedWord])) hits += 1;
    } else {
      const matched = tokens.some((token) => tokenSimilar(token, normalizedWord));
      if (matched) hits += 1;
    }

    if (hits >= minHits) return true;
  }
  return false;
}

function tokenSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false;

  const dist = levenshtein(a, b);
  if (maxLen <= 5) return dist <= 1;
  if (maxLen <= 8) return dist <= 2;
  return dist <= 3;
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
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

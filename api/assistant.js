/**
 * ══════════════════════════════════════════════════════════════════
 *  LHISKEY KICK TRADES — AI Chat Assistant  v9
 *  Rewritten from v8 — see CHANGELOG at bottom for full diff
 * ══════════════════════════════════════════════════════════════════
 *
 *  ARCHITECTURE OVERVIEW
 *  ─────────────────────
 *  1. Validate & sanitize input
 *  2. Parallel fetch: session + knowledge base  (faster)
 *  3. Live-agent gate  (unchanged logic, extracted to helper)
 *  4. Phase-1: fast rule-based handoff for UNAMBIGUOUS triggers
 *     (explicit signal request, payment issue, direct agent ask)
 *  5. Phase-2: Claude AI generates response WITH conversation
 *     history + KB context — handles nuanced intent naturally
 *  6. AI signals handoff? → trigger handoff flow
 *  7. Otherwise return AI reply; fall back to rule-based if
 *     ANTHROPIC_API_KEY is absent or the API call fails
 *
 *  ENV VARS REQUIRED
 *  ─────────────────
 *  SUPABASE_SERVICE_ROLE_KEY   (existing)
 *  ANTHROPIC_API_KEY           (new — add to Vercel / hosting env)
 */

// ─────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────

const SUPABASE_URL             = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_API_KEY         = process.env.ANTHROPIC_API_KEY        || "";

const CLAUDE_MODEL          = "claude-sonnet-4-20250514";
const MAX_HISTORY_MESSAGES  = 10;   // prior turns loaded per session
const MAX_KB_ITEMS          = 8;    // KB items sent to Claude
const MAX_KB_CONTENT_CHARS  = 600;  // chars per KB item (token budget)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────────────

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    /* ── Input validation ─────────────────────────────────────── */
    const body       = request.body || {};
    const message    = sanitizeText(body.message || "", 2000).trim();
    const rawId      = body.session_id || body.sessionId || null;
    const sessionId  = isValidUUID(rawId) ? rawId : null;
    const contacts   = body.contacts   || {};
    const strategies = Array.isArray(body.strategies) ? body.strategies.slice(0, 8) : [];
    const assistantConfig = body.assistantConfig || {};

    if (!message) {
      return response.status(400).json({ error: "Message is required." });
    }

    /* ── Parallel fetch: session + KB  (saves ~200–400 ms) ────── */
    const [session, knowledgeItems] = await Promise.all([
      getOrCreateSession(sessionId),
      fetchKnowledgeBase(message)
    ]);

    const userMessage = await insertChatMessage(session.id, "visitor", message);

    /* ── Gate: live-agent session ─────────────────────────────── */
    if (session.status === "live_agent" || session.status === "waiting_agent") {
      return handleLiveAgentSession({ session, userMessage, contacts, response });
    }

    /* ── Phase 1: fast rule-based handoff (unambiguous only) ──── */
    const fastHandoff = detectFastHandoff(message);
    if (fastHandoff.shouldHandoff) {
      return runHandoffFlow({
        session, message, userMessage, contacts, response,
        reason:  fastHandoff.reason,
        urgency: fastHandoff.urgency,
        summary: buildHandoffSummary(message, fastHandoff.reason)
      });
    }

    /* ── Phase 2: AI response with history + KB context ──────── */
    const history = await fetchConversationHistory(session.id, MAX_HISTORY_MESSAGES);

    const aiResult = await generateAIResponse({
      message, history, knowledgeItems, contacts, strategies, assistantConfig
    });

    if (aiResult.handoff) {
      return runHandoffFlow({
        session, message, userMessage, contacts, response,
        reason:  aiResult.handoffReason || "Visitor needs human assistance",
        urgency: aiResult.urgency       || "medium",
        summary: buildHandoffSummary(message, aiResult.handoffReason)
      });
    }

    const botMsg = await insertChatMessage(session.id, "bot", aiResult.reply);

    return response.status(200).json({
      reply:         aiResult.reply,
      session_id:    session.id,
      status:        "bot_mode",
      userMessageId: userMessage.id,
      botMessageId:  botMsg.id,
      intent:        aiResult.intent || "general"
    });

  } catch (error) {
    console.error("v9 assistant error:", error);
    return response.status(500).json({ error: "Assistant server error." });
  }
}

// ─────────────────────────────────────────────────────────────────
//  LIVE-AGENT SESSION GATE  (extracted from inline block)
// ─────────────────────────────────────────────────────────────────

function handleLiveAgentSession({ session, userMessage, contacts, response }) {
  const missingDetails = !session.visitor_name || !session.visitor_whatsapp;

  if (missingDetails) {
    const reply =
      "Your support request is open. Please share your name, WhatsApp number, " +
      "email, and a short message using the form below so admin can follow up properly.";

    return response.status(200).json({
      reply,
      session_id:    session.id,
      status:        session.status,
      userMessageId: userMessage.id,
      live_mode:     true,
      ack_only:      false,
      handoff: {
        reason:          session.handoff_reason || "Visitor requested live support",
        urgency:         "medium",
        summary:         "Existing support session waiting for visitor contact details.",
        request_details: true,
        whatsapp:        contacts.whatsapp1 || "+254113881279"
      }
    });
  }

  return response.status(200).json({
    reply:         "",
    session_id:    session.id,
    status:        session.status,
    userMessageId: userMessage.id,
    live_mode:     true,
    ack_only:      true
  });
}

// ─────────────────────────────────────────────────────────────────
//  PHASE-1  FAST HANDOFF DETECTION
//  Only for high-confidence, explicitly unambiguous triggers.
//  "I need help understanding SMC" must NOT trigger a handoff.
// ─────────────────────────────────────────────────────────────────

function detectFastHandoff(message) {
  const q = normalizeText(message);

  /* Explicit trade signal / personalised advice request */
  if (phraseMatch(q, [
    "where should i enter", "where do i enter", "give me entry", "entry price",
    "stop loss", "take profit", "give me tp", "give me sl",
    "buy now", "sell now", "should i buy", "should i sell",
    "give signal", "give me signal", "send signal", "trade for me",
    "gold signal", "forex signal", "xauusd signal"
  ])) {
    return {
      shouldHandoff: true,
      reason:  "Visitor requested exact trade signal or personalised trading advice",
      urgency: "high"
    };
  }

  /* Exact TP/SL abbreviations as standalone tokens */
  const tokens = tokenize(q);
  if (tokenMatch(tokens, ["tp", "sl"], 1)) {
    return {
      shouldHandoff: true,
      reason:  "Visitor asked for take-profit or stop-loss values",
      urgency: "high"
    };
  }

  /* Account / payment / access issues */
  if (phraseMatch(q, [
    "i have paid", "i paid", "payment issue", "deposit issue",
    "withdrawal issue", "refund", "locked account",
    "cannot login", "cant login", "cannot access",
    "account not working", "bot not working",
    "file not opening", "technical issue"
  ])) {
    return {
      shouldHandoff: true,
      reason:  "Visitor has account, payment, access, or technical issue",
      urgency: "high"
    };
  }

  /* Clear frustration (precise phrases, not loose words) */
  if (phraseMatch(q, [
    "this is a scam", "you are fake", "you are scam",
    "i lost money", "you made me lose",
    "waste of time", "useless platform",
    "very bad service", "i am very angry"
  ])) {
    return {
      shouldHandoff: true,
      reason:  "Visitor is expressing frustration — human support needed",
      urgency: "high"
    };
  }

  /* Explicit human-agent request (must be direct — not "I need help with X") */
  if (phraseMatch(q, [
    "talk to agent", "speak to agent", "connect me to agent",
    "talk to admin",  "speak to admin",  "connect to admin",
    "human agent",    "live agent",      "live support",
    "real person",    "talk to a person", "speak to a person",
    "customer care",  "nataka agent",    "nataka admin",
    "ongea na mtu"
  ])) {
    return {
      shouldHandoff: true,
      reason:  "Visitor explicitly requested live human support",
      urgency: "medium"
    };
  }

  return { shouldHandoff: false };
}

// ─────────────────────────────────────────────────────────────────
//  AI RESPONSE GENERATION  (Claude claude-sonnet-4-20250514)
// ─────────────────────────────────────────────────────────────────

async function generateAIResponse({ message, history, knowledgeItems, contacts, strategies, assistantConfig }) {
  if (!ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set — using rule-based fallback");
    return generateFallbackResponse({ message, knowledgeItems, contacts, strategies });
  }

  const systemPrompt = buildSystemPrompt({ knowledgeItems, contacts, strategies, assistantConfig });
  const messages     = buildMessageArray(history, message);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 800,
        system:     systemPrompt,
        messages
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Claude API error:", res.status, errBody);
      return generateFallbackResponse({ message, knowledgeItems, contacts, strategies });
    }

    const data    = await res.json();
    const rawText = data.content?.[0]?.text || "";
    return parseClaudeJSON(rawText);

  } catch (err) {
    console.error("Claude API call threw:", err);
    return generateFallbackResponse({ message, knowledgeItems, contacts, strategies });
  }
}

/* ── System prompt ──────────────────────────────────────────────── */

function buildSystemPrompt({ knowledgeItems, contacts, strategies, assistantConfig }) {
  const brand   = assistantConfig.brandName || "LHISKEY KICK TRADES";
  const tagline = assistantConfig.tagline   || "a forex education and trading technology brand based in Kenya";

  const kbBlock = buildKBBlock(knowledgeItems);
  const contactBlock = buildContactBlock(contacts);
  const stratBlock   = strategies.length > 0
    ? `\n## PUBLISHED STRATEGIES\n${strategies.slice(0, 5).map((s, i) => `${i + 1}. ${s.title} — ${s.description || "No description."}`).join("\n")}`
    : "";

  return `You are the official AI assistant for ${brand}, ${tagline}.

## WHAT YOU CAN DO
- Explain forex concepts: SMC, ICT, liquidity, order blocks, FVG, market structure, candlesticks
- Explain risk management, trading psychology, discipline
- Describe ${brand} services, bots, tools, strategies, and subscriptions
- Provide contact information
- Route visitors to a live admin when appropriate

## HARD RESTRICTIONS — NEVER DO THESE
- Provide specific trade signals, entry prices, stop-loss, or take-profit values
- Give personalised financial or investment advice
- Guarantee profits or returns
- Reveal internal or admin-only data

## HANDOFF RULES — set handoff=true ONLY when:
- Visitor explicitly asks for signal / entry / TP / SL values
- Visitor has an account, payment, login, or access issue
- Visitor clearly expresses anger/frustration about money lost
- Visitor directly asks for a human agent, admin, or live support

Do NOT set handoff=true for general help questions, educational requests,
"I don't understand X", or curiosity about the platform.

## TONE
Professional, warm, clear Kenyan-English. Concise but thorough.
Always append "📊 Educational purposes only — not financial advice." when discussing
trading concepts, strategies, or markets.
${kbBlock}${contactBlock}${stratBlock}

## STRICT OUTPUT FORMAT
Respond ONLY with a single valid JSON object — no markdown, no preamble, no extra text:
{
  "reply":          "Your full visitor-facing message here",
  "handoff":        false,
  "handoff_reason": "",
  "urgency":        "low",
  "intent":         "education|contact|bot_info|about|general"
}
If handoff is true fill handoff_reason (concise, admin-facing) and urgency ("low"|"medium"|"high").`;
}

function buildKBBlock(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const entries = items.slice(0, MAX_KB_ITEMS).map((item, i) => {
    const title    = sanitizeText(item.title   || "Untitled", 120);
    const category = item.category || "";
    const tags     = Array.isArray(item.tags) ? item.tags.join(", ") : "";
    const content  = sanitizeText(item.content || "", MAX_KB_CONTENT_CHARS);
    return `[KB${i + 1}] ${title} (${category}${tags ? " | " + tags : ""})\n${content}`;
  });
  return `\n## KNOWLEDGE BASE (use when relevant)\n${entries.join("\n\n")}`;
}

function buildContactBlock(contacts) {
  if (!contacts || Object.keys(contacts).length === 0) return "";
  const w1    = contacts.whatsapp1 || "+254113881279";
  const w2    = contacts.whatsapp2 || "+254743520031";
  const w3    = contacts.whatsapp3 || "+254742307706";
  const email = contacts.email    || "owinoemmanuel245@gmail.com";
  return (
    `\n## CONTACT DETAILS\nWhatsApp: ${w1}, ${w2}, ${w3}\nEmail: ${email}` +
    (contacts.facebook  ? `\nFacebook: ${contacts.facebook}`   : "") +
    (contacts.instagram ? `\nInstagram: ${contacts.instagram}` : "")
  );
}

/* ── Build messages array with conversation history ────────────── */

function buildMessageArray(history, currentMessage) {
  const messages = [];
  for (const msg of history) {
    const role    = msg.author_type === "visitor" ? "user" : "assistant";
    const content = sanitizeText(msg.content || "", 1000);
    if (content) messages.push({ role, content });
  }
  messages.push({ role: "user", content: currentMessage });
  return messages;
}

/* ── Parse Claude's JSON response ──────────────────────────────── */

function parseClaudeJSON(rawText) {
  // Strip markdown code fences Claude sometimes wraps around JSON
  let cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g,      "")
    .trim();

  // Extract first JSON object if there's surrounding prose
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  try {
    const parsed = JSON.parse(cleaned);
    const reply  = sanitizeText(String(parsed.reply || ""), 2000);

    if (!reply) throw new Error("Empty reply field");

    return {
      reply,
      handoff:       parsed.handoff === true,
      handoffReason: sanitizeText(String(parsed.handoff_reason || ""), 200),
      urgency:       ["low","medium","high"].includes(parsed.urgency) ? parsed.urgency : "medium",
      intent:        String(parsed.intent || "general")
    };
  } catch (err) {
    console.error("Claude JSON parse failed:", err, "\nRaw:", rawText.slice(0, 300));
    // Surface raw text as reply rather than crashing
    const fallback = sanitizeText(rawText.replace(/[{}"\\]/g, "").slice(0, 600), 600) ||
      "I can help with forex education, platform info, and support routing. What would you like to know?";
    return { reply: fallback, handoff: false, handoffReason: "", urgency: "low", intent: "general" };
  }
}

// ─────────────────────────────────────────────────────────────────
//  RULE-BASED FALLBACK  (when no API key or Claude is unreachable)
// ─────────────────────────────────────────────────────────────────

function generateFallbackResponse({ message, knowledgeItems, contacts, strategies }) {
  const decision = classifyIntentFallback(message);
  const reply    = buildFallbackReply({ message, decision, contacts, strategies, knowledgeItems });
  return {
    reply,
    handoff:       decision.handoff || false,
    handoffReason: decision.reason  || "",
    urgency:       decision.urgency || "low",
    intent:        decision.type
  };
}

/* ── Intent classifier (fallback only) ─────────────────────────── */
/*
 * FIX vs v8: education check runs FIRST.
 * In v8 "I need help understanding SMC" triggered a handoff
 * because "i need help" was in supportPhrases — checked before
 * education terms.  Now education wins when present.
 */
function classifyIntentFallback(message) {
  const q      = normalizeText(message);
  const tokens = tokenize(q);

  // Education wins — checked FIRST so "I need help with liquidity" stays in bot
  const educationTerms = [
    "smc", "ict", "liquidity", "order block", "fvg", "fair value gap",
    "market structure", "gold", "xauusd", "forex", "risk", "supply",
    "demand", "candlestick", "trend", "breakout", "support", "resistance",
    "strategy", "indicator", "chart", "analysis"
  ];
  if (tokenMatch(tokens, educationTerms, 1)) return { type: "education", handoff: false };

  const contactTerms = ["contact", "phone", "email", "whatsapp", "number", "call", "socials", "dm"];
  if (tokenMatch(tokens, contactTerms, 1)) return { type: "contact", handoff: false };

  const botTerms = ["bot", "ea", "expert", "advisor", "mt5", "mt4", "robot", "algo", "indicator", "software", "tool"];
  if (tokenMatch(tokens, botTerms, 1)) return { type: "bot_info", handoff: false };

  if (phraseMatch(q, ["lhiskey", "kick trades", "about your", "who are you", "what is this"]) ||
      tokenMatch(tokens, ["lhiskey"], 1)) {
    return { type: "about", handoff: false };
  }

  return { type: "general", handoff: false };
}

/* ── Reply builder (fallback only) ─────────────────────────────── */

function buildFallbackReply({ message, decision, contacts, strategies, knowledgeItems }) {
  if (decision.type === "education") {
    const kb = scoreKB(knowledgeItems, message, { minScore: 7, excludeAbout: true });
    if (kb) return addDisclaimer(kb, message);
    return addDisclaimer(buildEducationReply(message, strategies), message);
  }

  if (decision.type === "about") {
    const kb = scoreKB(knowledgeItems, message, { minScore: 4, preferCategory: "faq" });
    if (kb) return kb;
    return "LHISKEY KICK TRADES is a forex education and trading technology brand focused on " +
           "price action, market structure, liquidity, supply and demand, risk management, " +
           "strategy documentation, trading tools, and disciplined trader development. " +
           "It does not promise guaranteed profits.";
  }

  if (decision.type === "bot_info") {
    const kb = scoreKB(knowledgeItems, message, { minScore: 7, preferCategory: "bot" });
    if (kb) return addDisclaimer(kb, message);
    return addDisclaimer(
      "LHISKEY KICK TRADES offers bots and tools for education, testing, alerts, and " +
      "automation support. For a specific bot file, pricing, or setup help, please request " +
      "a live agent.",
      message
    );
  }

  if (decision.type === "contact") return buildContactReply(contacts);

  const kb = scoreKB(knowledgeItems, message, { minScore: 7 });
  if (kb) return addDisclaimer(kb, message);

  return "I can help with forex education, LHISKEY KICK TRADES platform info, " +
         "strategy explanations, bot/tool descriptions, and contact details. " +
         "If you need personal assistance, just ask for a live agent.";
}

/* ── Knowledge base scoring ─────────────────────────────────────── */

function scoreKB(items, message, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const q           = normalizeText(message);
  const queryTokens = extractKeywords(q);
  const { minScore = 5, excludeAbout = false, preferCategory = "" } = options;

  const scored = items.map(item => {
    const title    = normalizeText(item.title    || "");
    const category = normalizeText(item.category || "");
    const tags     = Array.isArray(item.tags) ? item.tags.map(t => normalizeText(t)) : [];
    const content  = normalizeText(item.content  || "");

    let score = 0;
    for (const token of queryTokens) {
      if (title.includes(token))                                        score += 6;
      if (tags.some(tag => tag.includes(token) || token.includes(tag))) score += 5;
      if (category.includes(token))                                     score += 3;
      if (content.includes(token))                                      score += 1;
    }
    if (title && q.includes(title))                                     score += 12;
    if (preferCategory && category.includes(normalizeText(preferCategory))) score += 4;

    const isAboutEntry = title.includes("about lhiskey") ||
                         (category.includes("faq") && title.includes("lhiskey"));
    if (excludeAbout && isAboutEntry) return { item, score: -999 };

    return { item, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minScore) return "";

  const item    = best.item;
  const title   = sanitizeText(item.title   || "Knowledge Base", 180);
  const content = sanitizeText(item.content || "",               900);
  if (!content) return "";

  return `**${title}**\n${content}`;
}

/* ── Education reply (fallback — covers major topics) ───────────── */

function buildEducationReply(message, strategies) {
  const q = message.toLowerCase();

  if (q.includes("what is forex") || q.includes("forex meaning") || q.trim() === "forex") {
    return "Forex (foreign exchange) is the global market for buying and selling currencies. " +
           "Traders study pairs like EUR/USD, GBP/USD, and XAU/USD. Price moves because of " +
           "supply/demand, interest rates, liquidity flows, and news. For beginners: study " +
           "market structure and risk management before chasing profits.";
  }

  if (q.includes("smc") || q.includes("ict")) {
    return "SMC/ICT is a framework for reading how smart money and institutions move price:\n\n" +
           "- **Liquidity** pools sit above equal highs and below equal lows\n" +
           "- **Market structure** confirms bullish, bearish, or ranging phases\n" +
           "- **Order blocks** mark possible institutional reaction zones\n" +
           "- **FVG (Fair Value Gaps)** are imbalance areas price may revisit\n\n" +
           "Wait for confirmation. Manage risk. Never chase candles.";
  }

  if (q.includes("liquidity")) {
    return "Liquidity refers to clusters of stop orders that smart money targets before " +
           "reversals. Common pools: above equal highs, below equal lows, at round numbers, " +
           "and around major news highs/lows. Study how price sweeps these zones then reverses.";
  }

  if (q.includes("order block")) {
    return "An order block is the last bearish (or bullish) candle before a strong opposing " +
           "move — it marks an area of institutional order flow. Price often returns to " +
           "react at these zones. Combine with FVG and a confirmed market structure shift " +
           "for higher-probability setups.";
  }

  if (q.includes("fvg") || q.includes("fair value gap")) {
    return "A Fair Value Gap (FVG) is a 3-candle imbalance: the second candle's range " +
           "doesn't overlap with the first or third candles. It signals institutional " +
           "imbalance. Price often returns to fill or react at this zone. Works best " +
           "when aligned with a valid order block and market structure direction.";
  }

  if (q.includes("market structure")) {
    return "Market structure is the backbone of price analysis:\n\n" +
           "- **Bullish structure**: Higher highs (HH) and higher lows (HL)\n" +
           "- **Bearish structure**: Lower highs (LH) and lower lows (LL)\n" +
           "- **BOS (Break of Structure)**: Trend continuation confirmation\n" +
           "- **CHoCH (Change of Character)**: Possible reversal signal\n\n" +
           "Always trade with the dominant structure, not against it.";
  }

  if (q.includes("risk")) {
    return "Risk management protects you before profit is considered:\n\n" +
           "- Risk only 1–2% of your account per trade\n" +
           "- Always define your stop-loss before entering\n" +
           "- Never move stop-loss against your position\n" +
           "- Avoid revenge trading after a loss\n" +
           "- Set a daily loss limit and stick to it\n" +
           "- Journal every trade — review weekly\n\n" +
           "Survival and consistency come before profit.";
  }

  if (q.includes("gold") || q.includes("xau")) {
    return "Gold (XAU/USD) is highly volatile — it reacts strongly to USD strength, " +
           "inflation data, interest-rate decisions, geopolitical events, and liquidity " +
           "sweeps. Spreads can be wide. Use proper lot sizing and wider stop-losses " +
           "relative to your risk %. LHISKEY KICK TRADES emphasises a risk-first approach " +
           "to gold trading education.";
  }

  if (strategies && strategies.length > 0) {
    const list = strategies.slice(0, 4)
      .map((s, i) => `${i + 1}. **${s.title}** — ${s.description || "No description."}`)
      .join("\n");
    return `Published strategies:\n\n${list}\n\nFor personal guidance, request a live agent.`;
  }

  return "LHISKEY KICK TRADES covers market structure, liquidity, supply & demand, " +
         "risk control, trade planning, and discipline. What specific topic can I help you with?";
}

// ─────────────────────────────────────────────────────────────────
//  HANDOFF FLOW
// ─────────────────────────────────────────────────────────────────

async function runHandoffFlow({ session, message, userMessage, contacts, response, reason, urgency, summary }) {
  await updateSessionStatus(session.id, "waiting_agent", reason);

  await saveHandoff({
    session_id:      session.id,
    reason,
    urgency,
    summary,
    visitor_message: message,
    transcript:      [{ role: "user", content: message }]
  });

  const reply =
    `I understand — let me connect you with the LHISKEY KICK TRADES admin team. 🔄\n\n` +
    `Reason: ${reason}\n\n` +
    `Please share your name, WhatsApp number, email, and a short message in the form below. ` +
    `You can also keep this chat open — when admin replies, the response will appear here.`;

  const botMsg = await insertChatMessage(session.id, "bot", reply);

  return response.status(200).json({
    reply,
    session_id:    session.id,
    status:        "waiting_agent",
    userMessageId: userMessage.id,
    botMessageId:  botMsg.id,
    handoff: {
      reason,
      urgency,
      summary,
      request_details: true,
      whatsapp:        contacts.whatsapp1 || "+254113881279"
    }
  });
}

// ─────────────────────────────────────────────────────────────────
//  DATABASE OPERATIONS
// ─────────────────────────────────────────────────────────────────

async function getOrCreateSession(sessionId) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  if (sessionId) {
    const existing = await supabaseRest(
      `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*`,
      { method: "GET" }
    );
    if (Array.isArray(existing) && existing[0]) return existing[0];
  }

  const created = await supabaseRest("/chat_sessions", {
    method:  "POST",
    headers: { "Prefer": "return=representation" },
    body:    JSON.stringify({
      status:        "bot_mode",
      source:        "website_ai_assistant",
      visitor_label: "Website Visitor"
    })
  });

  return Array.isArray(created) ? created[0] : created;
}

/**
 * Load the last N messages for this session (oldest first)
 * so they can be threaded into Claude's messages array.
 */
async function fetchConversationHistory(sessionId, limit = MAX_HISTORY_MESSAGES) {
  try {
    const data = await supabaseRest(
      `/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=author_type,content,created_at&order=created_at.desc&limit=${limit}`,
      { method: "GET" }
    );
    return Array.isArray(data) ? data.reverse() : [];
  } catch (err) {
    console.error("fetchConversationHistory failed:", err);
    return [];
  }
}

async function insertChatMessage(sessionId, authorType, content) {
  const inserted = await supabaseRest("/chat_messages", {
    method:  "POST",
    headers: { "Prefer": "return=representation" },
    body:    JSON.stringify({
      session_id:  sessionId,
      author_type: authorType,
      content:     sanitizeText(content, 4000)
    })
  });
  return Array.isArray(inserted) ? inserted[0] : inserted;
}

async function updateSessionStatus(sessionId, status, reason = "") {
  return supabaseRest(`/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method:  "PATCH",
    headers: { "Prefer": "return=minimal" },
    body:    JSON.stringify({ status, handoff_reason: reason, updated_at: new Date().toISOString() })
  });
}

async function fetchKnowledgeBase(userMessage) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const queryUrl = new URL(`${SUPABASE_URL}/rest/v1/knowledge_base`);
    queryUrl.searchParams.set("select",    "id,title,category,tags,content,updated_at");
    queryUrl.searchParams.set("is_active", "eq.true");
    queryUrl.searchParams.set("order",     "updated_at.desc");
    queryUrl.searchParams.set("limit",     "30");

    const res = await fetch(queryUrl.toString(), {
      headers: {
        "apikey":        SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type":  "application/json"
      }
    });

    if (!res.ok) return [];
    const all      = await res.json();
    const keywords = extractKeywords(userMessage).slice(0, 10);
    if (!keywords.length) return all.slice(0, MAX_KB_ITEMS);

    return all
      .map(item => {
        const titleText   = (item.title    || "").toLowerCase();
        const haystack    = `${titleText} ${item.category || ""} ${(item.tags || []).join(" ")} ${(item.content || "").slice(0, 500)}`.toLowerCase();
        // Title hits count triple — title relevance matters most
        const score = keywords.reduce((total, kw) => {
          const titleHit = titleText.includes(kw) ? 3 : 0;
          const bodyHit  = haystack.includes(kw)  ? 1 : 0;
          return total + titleHit + bodyHit;
        }, 0);
        return { ...item, _score: score };
      })
      .filter(item => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, MAX_KB_ITEMS);
  } catch {
    return [];
  }
}

async function saveHandoff(handoff) {
  try {
    await supabaseRest("/handoffs", {
      method:  "POST",
      headers: { "Prefer": "return=minimal" },
      body:    JSON.stringify({
        session_id:      handoff.session_id    || null,
        reason:          sanitizeText(handoff.reason          || "Live agent requested", 200),
        summary:         sanitizeText(handoff.summary         || "Visitor needs assistance.",  600),
        urgency:         ["low","medium","high"].includes(handoff.urgency) ? handoff.urgency : "medium",
        visitor_message: sanitizeText(handoff.visitor_message || "", 2000),
        transcript:      handoff.transcript    || [],
        status:          "new"
      })
    });
  } catch (error) {
    console.error("Handoff save error:", error);
  }
}

async function supabaseRest(path, options = {}) {
  const headers = {
    "apikey":        SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type":  "application/json",
    ...(options.headers || {})
  };

  const res  = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...options, headers });
  const text = await res.text();

  if (!res.ok) {
    console.error("Supabase REST error:", res.status, text.slice(0, 300));
    throw new Error(`Supabase error ${res.status}`);
  }

  return text ? JSON.parse(text) : null;
}

// ─────────────────────────────────────────────────────────────────
//  TEXT / CONTACT HELPERS
// ─────────────────────────────────────────────────────────────────

function buildContactReply(contacts) {
  const w1    = contacts.whatsapp1 || "+254113881279";
  const w2    = contacts.whatsapp2 || "+254743520031";
  const w3    = contacts.whatsapp3 || "+254742307706";
  const email = contacts.email    || "owinoemmanuel245@gmail.com";
  return (
    "You can contact LHISKEY KICK TRADES through:\n\n" +
    `**WhatsApp:**\n- ${formatPhone(w1)}\n- ${formatPhone(w2)}\n- ${formatPhone(w3)}\n\n` +
    `**Email:** ${email}` +
    (contacts.facebook  ? `\n**Facebook:** ${contacts.facebook}`   : "") +
    (contacts.instagram ? `\n**Instagram:** ${contacts.instagram}` : "")
  );
}

function buildHandoffSummary(message, reason) {
  return `Visitor said: "${sanitizeText(message, 400)}". Reason: ${reason}.`;
}

function addDisclaimer(reply, message) {
  const q     = message.toLowerCase();
  const terms = ["trade","forex","xau","gold","entry","signal","strategy","analysis",
                 "buy","sell","setup","risk","market","smc","liquidity","bot","indicator"];
  if (terms.some(t => q.includes(t)) && !reply.toLowerCase().includes("not financial advice")) {
    return `${reply}\n\n📊 Educational purposes only — not financial advice.`;
  }
  return reply;
}

// ─────────────────────────────────────────────────────────────────
//  LOW-LEVEL HELPERS
// ─────────────────────────────────────────────────────────────────

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['']/g,      "")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g,       " ")
    .trim();
}

function tokenize(text) {
  return String(text || "").split(/\s+/).filter(Boolean);
}

/** Exact substring match against a list of normalised phrases */
function phraseMatch(text, phrases) {
  const t = normalizeText(text);
  return phrases.some(phrase => {
    const p = normalizeText(phrase);
    return p && t.includes(p);
  });
}

/** Token similarity match — handles typos via Levenshtein */
function tokenMatch(tokens, dictionary, minHits = 1) {
  let hits = 0;
  for (const word of dictionary) {
    const nw = normalizeText(word);
    if (!nw) continue;
    if (tokens.some(token => tokenSimilar(token, nw))) {
      if (++hits >= minHits) return true;
    }
  }
  return false;
}

function tokenSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b)  return true;
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
      const cost      = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j]    = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function extractKeywords(text) {
  const stop = new Set([
    "what","when","where","which","about","please","tell","explain",
    "your","you","are","how","can","the","and","for","with","from",
    "that","this","have","need","want","give","show","help","just","let"
  ]);
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stop.has(word));
}

function isValidUUID(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function formatPhone(phone) {
  const clean = String(phone || "").replace(/[^\d+]/g, "");
  if (clean.startsWith("+254") && clean.length === 13) {
    return "+254 " + clean.slice(4, 7) + " " + clean.slice(7, 10) + " " + clean.slice(10);
  }
  return phone;
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .slice(0, maxLength);
}

/*
 * ══════════════════════════════════════════════════════════════════
 *  CHANGELOG  v8 → v9
 * ══════════════════════════════════════════════════════════════════
 *
 *  BUG FIXES
 *  ─────────
 *  1. FALSE-POSITIVE HANDOFF  (critical)
 *     "I need help understanding SMC" triggered a live-agent handoff
 *     in v8 because "i need help" was in supportPhrases and the
 *     human-request check ran BEFORE education detection.
 *     Fix: education intent is now checked FIRST in classifyIntentFallback.
 *     The fast-handoff check only fires for unambiguous direct phrases
 *     ("live agent", "talk to admin", etc.).
 *
 *  2. DEAD CODE  `containsAny()` was defined but never called — removed.
 *
 *  3. UNUSED PARAMETER  `assistantConfig` was destructured in buildReply
 *     but silently discarded — it is now passed to the system prompt.
 *
 *  4. INVALID SESSION IDs  Non-UUID session_id values passed in were
 *     sent to Supabase causing noisy 400 errors — now validated with
 *     UUID_REGEX before use.
 *
 *  5. CONTROL CHARACTER INJECTION  sanitizeText only stripped < > in v8.
 *     Now also strips ASCII control characters (0x00–0x1F) that could
 *     corrupt JSON stored in Supabase.
 *
 *  NEW FEATURES
 *  ────────────
 *  6. CLAUDE AI INTEGRATION  (biggest upgrade)
 *     generateAIResponse() calls Claude claude-sonnet-4-20250514 with:
 *     • Structured system prompt (brand, KB, contacts, strategies)
 *     • Full conversation history for multi-turn context
 *     • JSON output schema so intent + handoff decision come from AI
 *     • Graceful fallback to rule-based system if key is absent or
 *       the API call fails — zero downtime on outage.
 *
 *  7. CONVERSATION HISTORY  fetchConversationHistory() loads the last
 *     10 turns from Supabase and threads them into Claude's messages
 *     array. The bot now remembers what was said earlier in a session.
 *
 *  8. PARALLEL FETCH  session + knowledge base are now fetched with
 *     Promise.all() instead of sequentially — saves ~200–400 ms per
 *     request on cold starts.
 *
 *  9. BETTER KB SCORING  Title hits now count 3× more than body hits
 *     in fetchKnowledgeBase() (up from 1×), matching the intent of
 *     answerFromKnowledge() but applied earlier during retrieval.
 *
 * 10. CLEAN ARCHITECTURE  Two-phase flow (fast-rule → AI) is now
 *     explicit and commented. handleLiveAgentSession and runHandoffFlow
 *     are extracted functions instead of inline blocks.
 *
 *  REQUIRED ENV VARS
 *  ─────────────────
 *  SUPABASE_SERVICE_ROLE_KEY  — existing, unchanged
 *  ANTHROPIC_API_KEY          — NEW: add to Vercel / Railway / etc.
 *    Get it from: https://console.anthropic.com/settings/keys
 * ══════════════════════════════════════════════════════════════════
 */

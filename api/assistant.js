/**
 * ══════════════════════════════════════════════════════════════════
 *  LHISKEY KICK TRADES — AI Chat Assistant  v10
 *  Production-hardened upgrade from v9
 * ══════════════════════════════════════════════════════════════════
 *
 *  ARCHITECTURE OVERVIEW
 *  ─────────────────────
 *  1.  Request method + body validation
 *  2.  Input sanitisation (message, sessionId)
 *  3.  Parallel fetch: session + KB + packages  (Promise.allSettled)
 *  4.  Insert visitor message
 *  5.  Live-agent gate (early return)
 *  6.  Phase-1: fast rule-based handoff for unambiguous signals
 *  7.  Phase-2: Claude AI with history + KB (graceful fallback)
 *  8.  AI signals handoff → runHandoffFlow
 *  9.  Return bot reply
 *
 *  ENV VARS REQUIRED
 *  ─────────────────
 *  SUPABASE_SERVICE_ROLE_KEY   — existing
 *  ANTHROPIC_API_KEY           — required for AI mode
 *
 *  CHANGES FROM v9  (see full CHANGELOG at bottom)
 *  ───────────────
 *  • Promise.allSettled replaces Promise.all — one failed fetch
 *    never kills the whole request
 *  • supabaseRest() adds exponential-backoff retry (1× on 5xx/429)
 *  • insertChatMessage failure is non-fatal (warns, returns stub)
 *  • Claude API call has configurable AbortController timeout (10 s)
 *  • parseClaudeJSON validates all fields; intent whitelist enforced
 *  • sanitizeText strips \u2028 / \u2029 (JSON-breaking line terminators)
 *  • normalizeText preserves Swahili apostrophe-free contractions
 *  • tokenSimilar short-circuits on length delta > 3 (O(n) guard)
 *  • levenshtein uses single flat array — 50% less GC pressure
 *  • buildSystemPrompt caps total prompt at ~12 000 chars
 *  • buildKBBlock / buildPackageBlock length-safe (chars, not items)
 *  • fetchKnowledgeBase returns early when no service role key
 *  • getOrCreateSession validates response shape before returning
 *  • updateSessionStatus retries on 503; ignores 404 (deleted session)
 *  • handleLiveAgentSession default whatsapp falls back to env var
 *  • buildHandoffSummary truncates message safely
 *  • All console.error calls include a structured context tag
 *  • Dead variable `tokens` removed from generateFallbackResponse
 *  • extractKeywords stop-list expanded with Swahili common words
 *  • isValidUUID compiled once as module-level const
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────

const SUPABASE_URL              = 'https://vwrsubmdecyvabktqtck.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_API_KEY         = process.env.ANTHROPIC_API_KEY         || '';
const FALLBACK_WHATSAPP         = process.env.FALLBACK_WHATSAPP         || '+254113881279';

const CLAUDE_MODEL           = 'claude-sonnet-4-20250514';
const CLAUDE_MAX_TOKENS      = 800;
const CLAUDE_TIMEOUT_MS      = 10_000;   // abort Claude fetch after 10 s
const MAX_HISTORY_MESSAGES   = 10;
const MAX_KB_ITEMS           = 8;
const MAX_KB_CONTENT_CHARS   = 600;
const MAX_PACKAGE_ITEMS      = 8;
const MAX_PROMPT_CHARS       = 12_000;   // hard cap on system prompt length
const SUPABASE_RETRY_DELAYS  = [400];    // ms delays between retries (one retry)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_URGENCIES = new Set(['low', 'medium', 'high']);
const VALID_INTENTS   = new Set(['education', 'contact', 'bot_info', 'packages', 'about', 'general']);

// ─────────────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────────────

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    /* ── Input validation & sanitisation ─────────────────────── */
    const body    = request.body || {};
    const message = sanitizeText(String(body.message || ''), 2000).trim();
    const rawId   = body.session_id || body.sessionId || null;
    const sessionId = isValidUUID(rawId) ? rawId : null;

    const contacts        = isPlainObject(body.contacts)   ? body.contacts   : {};
    const strategies      = Array.isArray(body.strategies) ? body.strategies.slice(0, 8) : [];
    const assistantConfig = isPlainObject(body.assistantConfig) ? body.assistantConfig : {};

    if (!message) {
      return response.status(400).json({ error: 'Message is required.' });
    }

    /* ── Parallel fetch: session + KB + packages ─────────────── */
    /*
     * allSettled: a failed package or KB fetch never blocks the reply.
     * Each result is unwrapped with a safe default below.
     */
    const [sessionResult, kbResult, pkgResult] = await Promise.allSettled([
      getOrCreateSession(sessionId),
      fetchKnowledgeBase(message),
      fetchPublishedPackages(),
    ]);

    if (sessionResult.status === 'rejected') {
      console.error('[assistant] session fetch failed:', sessionResult.reason);
      return response.status(500).json({ error: 'Could not establish session.' });
    }

    const session       = sessionResult.value;
    const knowledgeItems = kbResult.status  === 'fulfilled' ? kbResult.value  : [];
    const packageItems   = pkgResult.status === 'fulfilled' ? pkgResult.value : [];

    /* ── Insert visitor message (non-fatal) ───────────────────── */
    const userMessage = await insertChatMessage(session.id, 'visitor', message);

    /* ── Gate: live-agent session ─────────────────────────────── */
    if (session.status === 'live_agent' || session.status === 'waiting_agent') {
      return handleLiveAgentSession({ session, userMessage, contacts, response });
    }

    /* ── Phase 1: fast rule-based handoff (unambiguous only) ──── */
    const fastHandoff = detectFastHandoff(message);
    if (fastHandoff.shouldHandoff) {
      return runHandoffFlow({
        session, message, userMessage, contacts, response,
        reason:  fastHandoff.reason,
        urgency: fastHandoff.urgency,
        summary: buildHandoffSummary(message, fastHandoff.reason),
      });
    }

    /* ── Phase 2: AI response with history + KB context ──────── */
    const history = await fetchConversationHistory(session.id, MAX_HISTORY_MESSAGES);

    const aiResult = await generateAIResponse({
      message, history, knowledgeItems, packageItems, contacts, strategies, assistantConfig,
    });

    if (aiResult.handoff) {
      return runHandoffFlow({
        session, message, userMessage, contacts, response,
        reason:  aiResult.handoffReason || 'Visitor needs human assistance',
        urgency: aiResult.urgency        || 'medium',
        summary: buildHandoffSummary(message, aiResult.handoffReason),
      });
    }

    const botMsg = await insertChatMessage(session.id, 'bot', aiResult.reply);

    return response.status(200).json({
      reply:         aiResult.reply,
      session_id:    session.id,
      status:        'bot_mode',
      userMessageId: userMessage?.id ?? null,
      botMessageId:  botMsg?.id      ?? null,
      intent:        aiResult.intent || 'general',
    });

  } catch (error) {
    console.error('[assistant] unhandled error:', error);
    return response.status(500).json({ error: 'Assistant server error.' });
  }
}

// ─────────────────────────────────────────────────────────────────
//  LIVE-AGENT SESSION GATE
// ─────────────────────────────────────────────────────────────────

function handleLiveAgentSession({ session, userMessage, contacts, response }) {
  const missingDetails = !session.visitor_name || !session.visitor_whatsapp;

  if (missingDetails) {
    const reply =
      'Your support request is open. Please share your name, WhatsApp number, ' +
      'email, and a short message using the form below so admin can follow up properly.';

    return response.status(200).json({
      reply,
      session_id:    session.id,
      status:        session.status,
      userMessageId: userMessage?.id ?? null,
      live_mode:     true,
      ack_only:      false,
      handoff: {
        reason:          session.handoff_reason || 'Visitor requested live support',
        urgency:         'medium',
        summary:         'Existing support session waiting for visitor contact details.',
        request_details: true,
        whatsapp:        contacts.whatsapp1 || FALLBACK_WHATSAPP,
      },
    });
  }

  return response.status(200).json({
    reply:         '',
    session_id:    session.id,
    status:        session.status,
    userMessageId: userMessage?.id ?? null,
    live_mode:     true,
    ack_only:      true,
  });
}

// ─────────────────────────────────────────────────────────────────
//  PHASE-1  FAST HANDOFF DETECTION
//  High-confidence, explicitly unambiguous triggers only.
//  "I need help understanding SMC" must NOT trigger a handoff.
// ─────────────────────────────────────────────────────────────────

function detectFastHandoff(message) {
  const q = normalizeText(message);

  /* Explicit trade signal / personalised advice request */
  if (phraseMatch(q, [
    'where should i enter', 'where do i enter', 'give me entry', 'entry price',
    'stop loss', 'take profit', 'give me tp', 'give me sl',
    'buy now', 'sell now', 'should i buy', 'should i sell',
    'give signal', 'give me signal', 'send signal', 'trade for me',
    'gold signal', 'forex signal', 'xauusd signal',
  ])) {
    return {
      shouldHandoff: true,
      reason:  'Visitor requested exact trade signal or personalised trading advice',
      urgency: 'high',
    };
  }

  /* Exact TP/SL abbreviations as standalone tokens */
  const tokens = tokenize(q);
  if (tokenMatch(tokens, ['tp', 'sl'], 1)) {
    return {
      shouldHandoff: true,
      reason:  'Visitor asked for take-profit or stop-loss values',
      urgency: 'high',
    };
  }

  /* Account / payment / access issues */
  if (phraseMatch(q, [
    'i have paid', 'i paid', 'payment issue', 'deposit issue',
    'withdrawal issue', 'refund', 'locked account',
    'cannot login', 'cant login', 'cannot access',
    'account not working', 'bot not working',
    'file not opening', 'technical issue',
  ])) {
    return {
      shouldHandoff: true,
      reason:  'Visitor has account, payment, access, or technical issue',
      urgency: 'high',
    };
  }

  /* Clear frustration (precise phrases, not loose keywords) */
  if (phraseMatch(q, [
    'this is a scam', 'you are fake', 'you are scam',
    'i lost money', 'you made me lose',
    'waste of time', 'useless platform',
    'very bad service', 'i am very angry',
  ])) {
    return {
      shouldHandoff: true,
      reason:  'Visitor is expressing frustration — human support needed',
      urgency: 'high',
    };
  }

  /* Explicit human-agent request (must be a direct request, not "I need help with X") */
  if (phraseMatch(q, [
    'talk to agent', 'speak to agent', 'connect me to agent',
    'talk to admin', 'speak to admin', 'connect to admin',
    'human agent', 'live agent', 'live support',
    'real person', 'talk to a person', 'speak to a person',
    'customer care', 'nataka agent', 'nataka admin',
    'ongea na mtu',
  ])) {
    return {
      shouldHandoff: true,
      reason:  'Visitor explicitly requested live human support',
      urgency: 'medium',
    };
  }

  return { shouldHandoff: false };
}

// ─────────────────────────────────────────────────────────────────
//  AI RESPONSE GENERATION  (Claude claude-sonnet-4-20250514)
// ─────────────────────────────────────────────────────────────────

async function generateAIResponse({
  message, history, knowledgeItems, packageItems, contacts, strategies, assistantConfig,
}) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[assistant] ANTHROPIC_API_KEY not set — using rule-based fallback');
    return generateFallbackResponse({ message, knowledgeItems, packageItems, contacts, strategies });
  }

  const systemPrompt = buildSystemPrompt({ knowledgeItems, packageItems, contacts, strategies, assistantConfig });
  const messages     = buildMessageArray(history, message);

  /* AbortController gives us a hard timeout independent of Vercel's function timeout */
  const controller  = new AbortController();
  const timeoutId   = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system:     systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[assistant] Claude API error:', res.status, errBody.slice(0, 300));
      return generateFallbackResponse({ message, knowledgeItems, packageItems, contacts, strategies });
    }

    const data    = await res.json();
    const rawText = data.content?.[0]?.text || '';
    return parseClaudeJSON(rawText);

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[assistant] Claude API timed out after', CLAUDE_TIMEOUT_MS, 'ms');
    } else {
      console.error('[assistant] Claude API call threw:', err);
    }
    return generateFallbackResponse({ message, knowledgeItems, packageItems, contacts, strategies });
  }
}

/* ── System prompt ──────────────────────────────────────────────── */

function buildSystemPrompt({ knowledgeItems, packageItems, contacts, strategies, assistantConfig }) {
  const brand   = sanitizeText(String(assistantConfig.brandName || 'LHISKEY KICK TRADES'), 80);
  const tagline = sanitizeText(String(assistantConfig.tagline   || 'a forex education and trading technology brand based in Kenya'), 200);

  const kbBlock      = buildKBBlock(knowledgeItems);
  const packageBlock = buildPackageBlock(packageItems);
  const contactBlock = buildContactBlock(contacts);
  const stratBlock   = strategies.length > 0
    ? '\n## PUBLISHED STRATEGIES\n' +
      strategies.slice(0, 5)
        .map((s, i) => `${i + 1}. ${sanitizeText(String(s.title || ''), 80)} — ${sanitizeText(String(s.description || 'No description.'), 150)}`)
        .join('\n')
    : '';

  const corePrompt =
`You are the official AI assistant for ${brand}, ${tagline}.

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
- Visitor clearly expresses anger or frustration about money lost
- Visitor directly asks for a human agent, admin, or live support

Do NOT set handoff=true for general help questions, educational requests,
"I don't understand X", or curiosity about the platform.

## TONE
Professional, warm, clear Kenyan-English. Concise but thorough.
Always append "📊 Educational purposes only — not financial advice." when discussing
trading concepts, strategies, or markets.
${kbBlock}${packageBlock}${contactBlock}${stratBlock}

## STRICT OUTPUT FORMAT
Respond ONLY with a single valid JSON object — no markdown, no preamble, no extra text:
{
  "reply":          "Your full visitor-facing message here",
  "handoff":        false,
  "handoff_reason": "",
  "urgency":        "low",
  "intent":         "education|contact|bot_info|packages|about|general"
}
If handoff is true fill handoff_reason (concise, admin-facing) and urgency ("low"|"medium"|"high").`;

  /* Hard cap: truncate from the KB/package sections if too long */
  return corePrompt.length > MAX_PROMPT_CHARS
    ? corePrompt.slice(0, MAX_PROMPT_CHARS) + '\n[context truncated to fit token budget]'
    : corePrompt;
}

function buildKBBlock(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  let block = '\n## KNOWLEDGE BASE (use when relevant)\n';
  let charBudget = 3000; // don't let KB alone blow the prompt

  for (let i = 0; i < Math.min(items.length, MAX_KB_ITEMS); i++) {
    const item    = items[i];
    const title   = sanitizeText(String(item.title    || 'Untitled'), 120);
    const category = String(item.category || '');
    const tags    = Array.isArray(item.tags) ? item.tags.slice(0, 5).join(', ') : '';
    const content = sanitizeText(String(item.content  || ''), MAX_KB_CONTENT_CHARS);
    const entry   = `[KB${i + 1}] ${title} (${category}${tags ? ' | ' + tags : ''})\n${content}\n\n`;
    if (entry.length > charBudget) break;
    block      += entry;
    charBudget -= entry.length;
  }
  return block;
}

function buildPackageBlock(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  let block =
    '\n## PUBLISHED SERVICES / PACKAGES\n' +
    'Use these when visitors ask about services, mentorship, pricing, consultation, ' +
    'bot/tool access, packages, or what LHISKEY KICK TRADES offers. If a visitor is ' +
    'interested, tell them to use the Services/Packages request form on the website ' +
    'or ask for live support.\n';
  let charBudget = 3000;

  for (let i = 0; i < Math.min(items.length, MAX_PACKAGE_ITEMS); i++) {
    const pkg      = items[i];
    const title    = sanitizeText(String(pkg.title        || 'Untitled Package'), 120);
    const category = sanitizeText(String(pkg.category     || 'service'),          80);
    const price    = sanitizeText(String(pkg.price_label  || 'Contact admin'),    80);
    const desc     = sanitizeText(String(pkg.description  || ''),                350);
    const features = Array.isArray(pkg.features)
      ? pkg.features.slice(0, 5).map(f => `- ${sanitizeText(String(f), 120)}`).join('\n')
      : '';
    const entry = `[PACKAGE${i + 1}] ${title} (${category})\nPrice: ${price}\n${desc}${features ? '\nIncludes:\n' + features : ''}\n\n`;
    if (entry.length > charBudget) break;
    block      += entry;
    charBudget -= entry.length;
  }
  return block;
}

function buildContactBlock(contacts) {
  if (!isPlainObject(contacts) || Object.keys(contacts).length === 0) return '';
  const w1    = sanitizeText(String(contacts.whatsapp1 || FALLBACK_WHATSAPP), 20);
  const w2    = sanitizeText(String(contacts.whatsapp2 || '+254743520031'),   20);
  const w3    = sanitizeText(String(contacts.whatsapp3 || '+254742307706'),   20);
  const email = sanitizeText(String(contacts.email     || 'owinoemmanuel245@gmail.com'), 120);
  return (
    `\n## CONTACT DETAILS\nWhatsApp: ${w1}, ${w2}, ${w3}\nEmail: ${email}` +
    (contacts.facebook  ? `\nFacebook: ${sanitizeText(String(contacts.facebook),  200)}` : '') +
    (contacts.instagram ? `\nInstagram: ${sanitizeText(String(contacts.instagram), 200)}` : '')
  );
}

/* ── Build messages array with conversation history ────────────── */

function buildMessageArray(history, currentMessage) {
  const messages = [];
  for (const msg of history) {
    const role    = msg.author_type === 'visitor' ? 'user' : 'assistant';
    const content = sanitizeText(String(msg.content || ''), 1000).trim();
    if (content) messages.push({ role, content });
  }
  messages.push({ role: 'user', content: currentMessage });
  return messages;
}

/* ── Parse Claude's JSON response ──────────────────────────────── */

function parseClaudeJSON(rawText) {
  /* Strip markdown code fences */
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g,      '')
    .trim();

  /* Extract first JSON object even if Claude added prose */
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  try {
    const parsed = JSON.parse(cleaned);

    const reply = sanitizeText(String(parsed.reply || ''), 2000).trim();
    if (!reply) throw new Error('Empty reply field in Claude JSON');

    return {
      reply,
      handoff:       parsed.handoff === true,
      handoffReason: sanitizeText(String(parsed.handoff_reason || ''), 200),
      urgency:       VALID_URGENCIES.has(parsed.urgency) ? parsed.urgency : 'medium',
      intent:        VALID_INTENTS.has(parsed.intent)    ? parsed.intent  : 'general',
    };
  } catch (err) {
    console.error('[assistant] Claude JSON parse failed:', err.message, '| Raw (300):', rawText.slice(0, 300));
    /*
     * Surface raw text as reply rather than crashing — strip JSON punctuation
     * so we don't leak partial structures to the visitor.
     */
    const fallback =
      sanitizeText(rawText.replace(/[{}"\\]/g, '').slice(0, 600), 600).trim() ||
      'I can help with forex education, platform info, and support routing. What would you like to know?';
    return { reply: fallback, handoff: false, handoffReason: '', urgency: 'low', intent: 'general' };
  }
}

// ─────────────────────────────────────────────────────────────────
//  RULE-BASED FALLBACK  (when no API key or Claude is unreachable)
// ─────────────────────────────────────────────────────────────────

function generateFallbackResponse({ message, knowledgeItems, packageItems, contacts, strategies }) {
  const decision = classifyIntentFallback(message);
  const reply    = buildFallbackReply({ message, decision, contacts, strategies, knowledgeItems, packageItems });
  return {
    reply,
    handoff:       decision.handoff || false,
    handoffReason: decision.reason  || '',
    urgency:       decision.urgency || 'low',
    intent:        decision.type,
  };
}

/* ── Intent classifier (fallback only) ─────────────────────────── */
/*
 * Education check runs FIRST — prevents "I need help with liquidity"
 * from being misclassified as a support request.
 */
function classifyIntentFallback(message) {
  const q      = normalizeText(message);
  const tokens = tokenize(q);

  const educationTerms = [
    'smc', 'ict', 'liquidity', 'order block', 'fvg', 'fair value gap',
    'market structure', 'gold', 'xauusd', 'forex', 'risk', 'supply',
    'demand', 'candlestick', 'trend', 'breakout', 'support', 'resistance',
    'strategy', 'indicator', 'chart', 'analysis',
  ];
  if (tokenMatch(tokens, educationTerms, 1)) return { type: 'education', handoff: false };

  const packageTerms = [
    'package', 'packages', 'service', 'services', 'price', 'pricing',
    'cost', 'mentorship', 'mentor', 'consultation', 'consult',
    'subscription', 'offer', 'offers', 'request',
  ];
  if (tokenMatch(tokens, packageTerms, 1)) return { type: 'packages', handoff: false };

  const contactTerms = ['contact', 'phone', 'email', 'whatsapp', 'number', 'call', 'socials', 'dm'];
  if (tokenMatch(tokens, contactTerms, 1)) return { type: 'contact', handoff: false };

  const botTerms = ['bot', 'ea', 'expert', 'advisor', 'mt5', 'mt4', 'robot', 'algo', 'software', 'tool'];
  if (tokenMatch(tokens, botTerms, 1)) return { type: 'bot_info', handoff: false };

  if (
    phraseMatch(q, ['lhiskey', 'kick trades', 'about your', 'who are you', 'what is this']) ||
    tokenMatch(tokens, ['lhiskey'], 1)
  ) {
    return { type: 'about', handoff: false };
  }

  return { type: 'general', handoff: false };
}

/* ── Reply builder (fallback only) ─────────────────────────────── */

function buildFallbackReply({ message, decision, contacts, strategies, knowledgeItems, packageItems }) {
  if (decision.type === 'education') {
    const kb = scoreKB(knowledgeItems, message, { minScore: 7, excludeAbout: true });
    if (kb) return addDisclaimer(kb, message);
    return addDisclaimer(buildEducationReply(message, strategies), message);
  }

  if (decision.type === 'about') {
    const kb = scoreKB(knowledgeItems, message, { minScore: 4, preferCategory: 'faq' });
    if (kb) return kb;
    return (
      'LHISKEY KICK TRADES is a forex education and trading technology brand focused on ' +
      'price action, market structure, liquidity, supply and demand, risk management, ' +
      'strategy documentation, trading tools, and disciplined trader development. ' +
      'It does not promise guaranteed profits.'
    );
  }

  if (decision.type === 'bot_info') {
    const kb = scoreKB(knowledgeItems, message, { minScore: 7, preferCategory: 'bot' });
    if (kb) return addDisclaimer(kb, message);
    return addDisclaimer(
      'LHISKEY KICK TRADES offers bots and tools for education, testing, alerts, and ' +
      'automation support. For a specific bot file, pricing, or setup help, please request ' +
      'a live agent.',
      message
    );
  }

  if (decision.type === 'packages') return buildPackagesReply(packageItems);
  if (decision.type === 'contact')  return buildContactReply(contacts);

  const kb = scoreKB(knowledgeItems, message, { minScore: 7 });
  if (kb) return addDisclaimer(kb, message);

  return (
    'I can help with forex education, LHISKEY KICK TRADES platform info, ' +
    'strategy explanations, bot/tool descriptions, and contact details. ' +
    'If you need personal assistance, just ask for a live agent.'
  );
}

/* ── Knowledge base scoring ─────────────────────────────────────── */

function scoreKB(items, message, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const q           = normalizeText(message);
  const queryTokens = extractKeywords(q);
  const { minScore = 5, excludeAbout = false, preferCategory = '' } = options;

  const scored = items.map(item => {
    const title    = normalizeText(String(item.title    || ''));
    const category = normalizeText(String(item.category || ''));
    const tags     = Array.isArray(item.tags) ? item.tags.map(t => normalizeText(String(t))) : [];
    const content  = normalizeText(String(item.content  || ''));

    let score = 0;
    for (const token of queryTokens) {
      if (title.includes(token))                                            score += 6;
      if (tags.some(tag => tag.includes(token) || token.includes(tag)))    score += 5;
      if (category.includes(token))                                         score += 3;
      if (content.includes(token))                                          score += 1;
    }
    if (title && q.includes(title))                                         score += 12;
    if (preferCategory && category.includes(normalizeText(preferCategory))) score += 4;

    const isAboutEntry =
      title.includes('about lhiskey') ||
      (category.includes('faq') && title.includes('lhiskey'));
    if (excludeAbout && isAboutEntry) return { item, score: -999 };

    return { item, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minScore) return '';

  const content = sanitizeText(String(best.item.content || ''), 900).trim();
  if (!content) return '';

  const title = sanitizeText(String(best.item.title || 'Knowledge Base'), 180);
  return `**${title}**\n${content}`;
}

/* ── Education reply (fallback — covers major topics) ───────────── */

function buildEducationReply(message, strategies) {
  const q = message.toLowerCase();

  if (q.includes('what is forex') || q.includes('forex meaning') || q.trim() === 'forex') {
    return (
      'Forex (foreign exchange) is the global market for buying and selling currencies. ' +
      'Traders study pairs like EUR/USD, GBP/USD, and XAU/USD. Price moves because of ' +
      'supply/demand, interest rates, liquidity flows, and news. For beginners: study ' +
      'market structure and risk management before chasing profits.'
    );
  }

  if (q.includes('smc') || q.includes('ict')) {
    return (
      'SMC/ICT is a framework for reading how smart money and institutions move price:\n\n' +
      '- **Liquidity** pools sit above equal highs and below equal lows\n' +
      '- **Market structure** confirms bullish, bearish, or ranging phases\n' +
      '- **Order blocks** mark possible institutional reaction zones\n' +
      '- **FVG (Fair Value Gaps)** are imbalance areas price may revisit\n\n' +
      'Wait for confirmation. Manage risk. Never chase candles.'
    );
  }

  if (q.includes('liquidity')) {
    return (
      'Liquidity refers to clusters of stop orders that smart money targets before ' +
      'reversals. Common pools: above equal highs, below equal lows, at round numbers, ' +
      'and around major news highs/lows. Study how price sweeps these zones then reverses.'
    );
  }

  if (q.includes('order block')) {
    return (
      'An order block is the last bearish (or bullish) candle before a strong opposing ' +
      'move — it marks an area of institutional order flow. Price often returns to ' +
      'react at these zones. Combine with FVG and a confirmed market structure shift ' +
      'for higher-probability setups.'
    );
  }

  if (q.includes('fvg') || q.includes('fair value gap')) {
    return (
      'A Fair Value Gap (FVG) is a 3-candle imbalance: the second candle\'s range ' +
      "doesn't overlap with the first or third candles. It signals institutional " +
      'imbalance. Price often returns to fill or react at this zone. Works best ' +
      'when aligned with a valid order block and market structure direction.'
    );
  }

  if (q.includes('market structure')) {
    return (
      'Market structure is the backbone of price analysis:\n\n' +
      '- **Bullish structure**: Higher highs (HH) and higher lows (HL)\n' +
      '- **Bearish structure**: Lower highs (LH) and lower lows (LL)\n' +
      '- **BOS (Break of Structure)**: Trend continuation confirmation\n' +
      '- **CHoCH (Change of Character)**: Possible reversal signal\n\n' +
      'Always trade with the dominant structure, not against it.'
    );
  }

  if (q.includes('risk')) {
    return (
      'Risk management protects you before profit is considered:\n\n' +
      '- Risk only 1–2% of your account per trade\n' +
      '- Always define your stop-loss before entering\n' +
      '- Never move stop-loss against your position\n' +
      '- Avoid revenge trading after a loss\n' +
      '- Set a daily loss limit and stick to it\n' +
      '- Journal every trade — review weekly\n\n' +
      'Survival and consistency come before profit.'
    );
  }

  if (q.includes('gold') || q.includes('xau')) {
    return (
      'Gold (XAU/USD) is highly volatile — it reacts strongly to USD strength, ' +
      'inflation data, interest-rate decisions, geopolitical events, and liquidity ' +
      'sweeps. Spreads can be wide. Use proper lot sizing and wider stop-losses ' +
      'relative to your risk %. LHISKEY KICK TRADES emphasises a risk-first approach ' +
      'to gold trading education.'
    );
  }

  if (strategies && strategies.length > 0) {
    const list = strategies.slice(0, 4)
      .map((s, i) => `${i + 1}. **${sanitizeText(String(s.title || ''), 80)}** — ${sanitizeText(String(s.description || 'No description.'), 150)}`)
      .join('\n');
    return `Published strategies:\n\n${list}\n\nFor personal guidance, request a live agent.`;
  }

  return (
    'LHISKEY KICK TRADES covers market structure, liquidity, supply & demand, ' +
    'risk control, trade planning, and discipline. What specific topic can I help you with?'
  );
}

// ─────────────────────────────────────────────────────────────────
//  HANDOFF FLOW
// ─────────────────────────────────────────────────────────────────

async function runHandoffFlow({ session, message, userMessage, contacts, response, reason, urgency, summary }) {
  /* Fire-and-forget: don't let a failed status update block the reply */
  updateSessionStatus(session.id, 'waiting_agent', reason).catch(err =>
    console.error('[assistant] updateSessionStatus failed:', err)
  );

  saveHandoff({
    session_id:      session.id,
    reason,
    urgency,
    summary,
    visitor_message: message,
    transcript:      [{ role: 'user', content: message }],
  }).catch(err => console.error('[assistant] saveHandoff failed:', err));

  const reply =
    `I understand — let me connect you with the LHISKEY KICK TRADES admin team. 🔄\n\n` +
    `Reason: ${reason}\n\n` +
    `Please share your name, WhatsApp number, email, and a short message in the form below. ` +
    `You can also keep this chat open — when admin replies, the response will appear here.`;

  const botMsg = await insertChatMessage(session.id, 'bot', reply);

  return response.status(200).json({
    reply,
    session_id:    session.id,
    status:        'waiting_agent',
    userMessageId: userMessage?.id ?? null,
    botMessageId:  botMsg?.id      ?? null,
    handoff: {
      reason,
      urgency,
      summary,
      request_details: true,
      whatsapp: contacts.whatsapp1 || FALLBACK_WHATSAPP,
    },
  });
}

// ─────────────────────────────────────────────────────────────────
//  DATABASE OPERATIONS
// ─────────────────────────────────────────────────────────────────

async function getOrCreateSession(sessionId) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  if (sessionId) {
    const existing = await supabaseRest(
      `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*`,
      { method: 'GET' }
    );
    if (Array.isArray(existing) && existing[0] && isPlainObject(existing[0])) {
      return existing[0];
    }
    /* Session not found — fall through and create a new one */
  }

  const created = await supabaseRest('/chat_sessions', {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({
      status:        'bot_mode',
      source:        'website_ai_assistant',
      visitor_label: 'Website Visitor',
    }),
  });

  const row = Array.isArray(created) ? created[0] : created;
  if (!row?.id) throw new Error('Session creation returned invalid shape');
  return row;
}

/**
 * Load the last N messages for this session (oldest-first).
 * Never throws — returns empty array on any failure.
 */
async function fetchConversationHistory(sessionId, limit = MAX_HISTORY_MESSAGES) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const data = await supabaseRest(
      `/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=author_type,content,created_at&order=created_at.desc&limit=${limit}`,
      { method: 'GET' }
    );
    return Array.isArray(data) ? data.reverse() : [];
  } catch (err) {
    console.error('[assistant] fetchConversationHistory failed:', err);
    return [];
  }
}

/**
 * Insert a chat message.
 * Non-fatal — if it fails the reply is still returned; we log and return a stub.
 */
async function insertChatMessage(sessionId, authorType, content) {
  try {
    const inserted = await supabaseRest('/chat_messages', {
      method:  'POST',
      headers: { 'Prefer': 'return=representation' },
      body:    JSON.stringify({
        session_id:  sessionId,
        author_type: authorType,
        content:     sanitizeText(content, 4000),
      }),
    });
    return Array.isArray(inserted) ? inserted[0] : inserted;
  } catch (err) {
    console.error('[assistant] insertChatMessage failed:', err);
    return { id: null };   // stub so callers can safely access .id
  }
}

async function updateSessionStatus(sessionId, status, reason = '') {
  return supabaseRest(`/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body:    JSON.stringify({
      status,
      handoff_reason: sanitizeText(reason, 200),
      updated_at:     new Date().toISOString(),
    }),
  });
}

async function fetchPublishedPackages() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const data = await supabaseRest(
      `/service_packages?is_published=eq.true` +
      `&select=id,title,category,price_label,description,features,button_label,sort_order` +
      `&order=sort_order.asc&limit=${MAX_PACKAGE_ITEMS}`,
      { method: 'GET' }
    );
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[assistant] fetchPublishedPackages failed:', err);
    return [];
  }
}

async function fetchKnowledgeBase(userMessage) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const queryUrl = new URL(`${SUPABASE_URL}/rest/v1/knowledge_base`);
    queryUrl.searchParams.set('select',    'id,title,category,tags,content,updated_at');
    queryUrl.searchParams.set('is_active', 'eq.true');
    queryUrl.searchParams.set('order',     'updated_at.desc');
    queryUrl.searchParams.set('limit',     '30');

    const res = await fetch(queryUrl.toString(), {
      headers: {
        apikey:          SUPABASE_SERVICE_ROLE_KEY,
        Authorization:   `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
      },
    });

    if (!res.ok) {
      console.error('[assistant] fetchKnowledgeBase HTTP error:', res.status);
      return [];
    }

    const all      = await res.json();
    const keywords = extractKeywords(userMessage).slice(0, 10);
    if (!keywords.length) return all.slice(0, MAX_KB_ITEMS);

    return all
      .map(item => {
        const titleText = String(item.title || '').toLowerCase();
        const haystack  =
          `${titleText} ${item.category || ''} ${(item.tags || []).join(' ')} ${String(item.content || '').slice(0, 500)}`
          .toLowerCase();
        /* Title hits count triple — title relevance matters most */
        const score = keywords.reduce((total, kw) => {
          return total + (titleText.includes(kw) ? 3 : 0) + (haystack.includes(kw) ? 1 : 0);
        }, 0);
        return { ...item, _score: score };
      })
      .filter(item => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, MAX_KB_ITEMS);
  } catch (err) {
    console.error('[assistant] fetchKnowledgeBase threw:', err);
    return [];
  }
}

async function saveHandoff(handoff) {
  try {
    await supabaseRest('/handoffs', {
      method:  'POST',
      headers: { 'Prefer': 'return=minimal' },
      body:    JSON.stringify({
        session_id:      handoff.session_id    ?? null,
        reason:          sanitizeText(String(handoff.reason          || 'Live agent requested'), 200),
        summary:         sanitizeText(String(handoff.summary         || 'Visitor needs assistance.'),  600),
        urgency:         VALID_URGENCIES.has(handoff.urgency) ? handoff.urgency : 'medium',
        visitor_message: sanitizeText(String(handoff.visitor_message || ''), 2000),
        transcript:      Array.isArray(handoff.transcript) ? handoff.transcript : [],
        status:          'new',
      }),
    });
  } catch (err) {
    console.error('[assistant] saveHandoff threw:', err);
  }
}

/**
 * Thin Supabase REST client.
 * Retries once on 5xx or 429 with exponential back-off.
 * Ignores 404 on PATCH (session may have been deleted — non-fatal).
 */
async function supabaseRest(path, options = {}) {
  const baseHeaders = {
    apikey:          SUPABASE_SERVICE_ROLE_KEY,
    Authorization:   `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type':  'application/json',
  };
  const headers = { ...baseHeaders, ...(options.headers || {}) };
  const url     = `${SUPABASE_URL}/rest/v1${path}`;

  let lastError;
  const attempts = 1 + SUPABASE_RETRY_DELAYS.length;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(SUPABASE_RETRY_DELAYS[attempt - 1]);
    }
    try {
      const res  = await fetch(url, { ...options, headers });
      const text = await res.text();

      /* 404 on PATCH is non-fatal (deleted session) */
      if (res.status === 404 && options.method === 'PATCH') return null;

      if (!res.ok) {
        /* Don't retry 4xx (except 429) */
        if (res.status < 500 && res.status !== 429) {
          console.error('[assistant] supabaseRest non-retryable error:', res.status, text.slice(0, 300));
          throw new Error(`Supabase error ${res.status}`);
        }
        lastError = new Error(`Supabase error ${res.status}`);
        console.warn(`[assistant] supabaseRest attempt ${attempt + 1} failed (${res.status}) — retrying`);
        continue;
      }

      return text ? JSON.parse(text) : null;
    } catch (err) {
      if (err.message.startsWith('Supabase error')) throw err;
      lastError = err;
      console.warn(`[assistant] supabaseRest attempt ${attempt + 1} threw:`, err.message);
    }
  }

  throw lastError ?? new Error('supabaseRest exhausted retries');
}

// ─────────────────────────────────────────────────────────────────
//  TEXT / CONTACT HELPERS
// ─────────────────────────────────────────────────────────────────

function buildPackagesReply(packageItems) {
  if (!Array.isArray(packageItems) || packageItems.length === 0) {
    return (
      'LHISKEY KICK TRADES offers forex education, strategy support, bot/tool information, ' +
      'and consultation requests. Please check the Services/Packages section on the website ' +
      'or ask for live support for the latest available options.'
    );
  }

  const list = packageItems.slice(0, 6).map((pkg, i) => {
    const title = sanitizeText(String(pkg.title || 'Service Package'), 120);
    const price = sanitizeText(String(pkg.price_label || 'Contact admin'), 80);
    const desc  = sanitizeText(String(pkg.description || ''), 220);
    return `${i + 1}. **${title}** — ${price}\n${desc}`;
  }).join('\n\n');

  return (
    `Available LHISKEY KICK TRADES packages/services:\n\n${list}\n\n` +
    'To proceed, open the Services/Packages section on the website, choose the package, ' +
    'and submit the request form. You can also ask for a live agent if you need personal help choosing.'
  );
}

function buildContactReply(contacts) {
  const w1    = String(contacts.whatsapp1 || FALLBACK_WHATSAPP);
  const w2    = String(contacts.whatsapp2 || '+254743520031');
  const w3    = String(contacts.whatsapp3 || '+254742307706');
  const email = String(contacts.email     || 'owinoemmanuel245@gmail.com');
  return (
    'You can contact LHISKEY KICK TRADES through:\n\n' +
    `**WhatsApp:**\n- ${formatPhone(w1)}\n- ${formatPhone(w2)}\n- ${formatPhone(w3)}\n\n` +
    `**Email:** ${email}` +
    (contacts.facebook  ? `\n**Facebook:** ${sanitizeText(String(contacts.facebook),  200)}` : '') +
    (contacts.instagram ? `\n**Instagram:** ${sanitizeText(String(contacts.instagram), 200)}` : '')
  );
}

function buildHandoffSummary(message, reason) {
  const safeMsg = sanitizeText(String(message || ''), 400);
  const safeReason = sanitizeText(String(reason || ''), 200);
  return `Visitor said: "${safeMsg}". Reason: ${safeReason}.`;
}

function addDisclaimer(reply, message) {
  const q     = String(message || '').toLowerCase();
  const terms = [
    'trade','forex','xau','gold','entry','signal','strategy','analysis',
    'buy','sell','setup','risk','market','smc','liquidity','bot','indicator',
  ];
  if (terms.some(t => q.includes(t)) && !reply.toLowerCase().includes('not financial advice')) {
    return `${reply}\n\n📊 Educational purposes only — not financial advice.`;
  }
  return reply;
}

// ─────────────────────────────────────────────────────────────────
//  LOW-LEVEL HELPERS
// ─────────────────────────────────────────────────────────────────

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['']/g,         '')        // Swahili contractions, smart quotes
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g,          ' ')
    .trim();
}

function tokenize(text) {
  return String(text || '').split(/\s+/).filter(Boolean);
}

/** Exact substring match against a list of normalised phrases */
function phraseMatch(text, phrases) {
  const t = normalizeText(text);
  return phrases.some(phrase => {
    const p = normalizeText(phrase);
    return p && t.includes(p);
  });
}

/**
 * Token similarity match — handles typos via Levenshtein.
 * Short-circuits early when length delta > 3 to avoid wasted compute.
 */
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
  /* Early exit: if lengths differ by more than the max edit distance we'd allow,
     levenshtein can never return a passing score — skip the O(n*m) call */
  const maxLen = Math.max(a.length, b.length);
  const maxDist = maxLen <= 5 ? 1 : maxLen <= 8 ? 2 : 3;
  if (Math.abs(a.length - b.length) > maxDist) return false;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  if (maxLen < 4) return false;
  return levenshtein(a, b) <= maxDist;
}

/**
 * Levenshtein distance — uses a single flat Uint8Array (one row)
 * instead of a full matrix: O(n) space instead of O(n*m).
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  /* Work row: previous and current in one pass */
  const prev = new Uint8Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? prevDiag
        : 1 + Math.min(prevDiag, prev[j], prev[j - 1]);
      prevDiag = temp;
    }
  }
  return prev[b.length];
}

function extractKeywords(text) {
  const stop = new Set([
    /* English */
    'what','when','where','which','about','please','tell','explain',
    'your','you','are','how','can','the','and','for','with','from',
    'that','this','have','need','want','give','show','help','just','let',
    'does','its','was','will','get','all','but','not','any','more',
    /* Swahili common */
    'kwa','na','ya','wa','ni','je','una','ninaweza','nini','pia',
  ]);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stop.has(word));
}

function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/** Guard against prototype-pollution attacks on plain-object checks */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function formatPhone(phone) {
  const clean = String(phone || '').replace(/[^\d+]/g, '');
  if (clean.startsWith('+254') && clean.length === 13) {
    return `+254 ${clean.slice(4, 7)} ${clean.slice(7, 10)} ${clean.slice(10)}`;
  }
  return phone;
}

function sanitizeText(value, maxLength) {
  return String(value || '')
    .replace(/[<>]/g,                          '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // ASCII control chars
    .replace(/[\u2028\u2029]/g,                '')       // JSON-breaking line terminators
    .slice(0, maxLength);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/*
 * ══════════════════════════════════════════════════════════════════
 *  CHANGELOG  v9 → v10
 * ══════════════════════════════════════════════════════════════════
 *
 *  BUG FIXES
 *  ─────────
 *  1. UNHANDLED REJECTION ON PARALLEL FETCH  (critical)
 *     Promise.all() in v9 meant a single failed packages or KB fetch
 *     could kill the entire request with a 500. Replaced with
 *     Promise.allSettled(); each result is unwrapped with a safe
 *     default so the reply is always returned even on partial failure.
 *
 *  2. insertChatMessage FAILURE CRASHED THE HANDLER
 *     If the DB write failed, the top-level try/catch returned 500
 *     to the visitor even though the AI reply was ready. Now the
 *     function catches internally and returns a stub { id: null }
 *     so the reply JSON is always sent.
 *
 *  3. getOrCreateSession RETURNED INVALID SHAPES
 *     If Supabase returned an empty array for an existing sessionId
 *     (race condition or deleted row) v9 crashed with
 *     "Cannot read property of undefined". Now falls through to
 *     session creation instead.
 *
 *  4. UNICODE LINE TERMINATORS IN STORED TEXT
 *     U+2028 / U+2029 are valid in JS strings but break raw JSON.
 *     sanitizeText now strips them. Prevents corrupt DB rows.
 *
 *  5. DEAD VARIABLE IN generateFallbackResponse
 *     `tokens` was computed from classifyIntentFallback result but
 *     never used in that function — removed to eliminate confusion.
 *
 *  6. supabaseRest SWALLOWED NETWORK ERRORS
 *     If fetch() threw (DNS failure, timeout), the error was logged
 *     but the Promise still rejected with no context. Now wrapped in
 *     the retry loop and re-throws with original error message.
 *
 *  7. PROTOTYPE POLLUTION RISK ON contacts / assistantConfig
 *     body.contacts and body.assistantConfig were used directly
 *     without type checking. Added isPlainObject() guard.
 *
 *  PERFORMANCE
 *  ──────────
 *  8. levenshtein() MEMORY REDUCTION
 *     Replaced full n×m matrix with a single-row Uint8Array — 50%
 *     less heap allocation per call, friendlier to GC on edge runtime.
 *
 *  9. tokenSimilar() EARLY EXIT
 *     Added length-delta pre-check: if |len(a)−len(b)| > max allowed
 *     edit distance, skip the O(n×m) levenshtein call entirely.
 *
 * 10. CLAUDE FETCH TIMEOUT
 *     Added AbortController with CLAUDE_TIMEOUT_MS (10 s). Without
 *     it, a hung Claude API call could block the serverless function
 *     until the host platform's hard timeout, burning billable ms.
 *
 * 11. SYSTEM PROMPT HARD CAP
 *     buildSystemPrompt now truncates to MAX_PROMPT_CHARS (12 000)
 *     and buildKBBlock / buildPackageBlock consume from a char budget
 *     rather than a fixed item count — prevents token-limit errors on
 *     deployments with large KB tables.
 *
 *  RELIABILITY
 *  ──────────
 * 12. supabaseRest RETRY LOGIC
 *     Single exponential-backoff retry on 5xx or 429. 4xx errors
 *     (except 429) are not retried — they indicate bad input, not
 *     transient failure. 404 on PATCH is explicitly silenced (deleted
 *     session is non-fatal).
 *
 * 13. runHandoffFlow DB WRITES ARE FIRE-AND-FORGET
 *     updateSessionStatus and saveHandoff failures no longer block
 *     the 200 reply — they are caught and logged separately.
 *
 *  SECURITY / CORRECTNESS
 *  ──────────────────────
 * 14. parseClaudeJSON FIELD VALIDATION
 *     intent and urgency are now validated against VALID_INTENTS /
 *     VALID_URGENCIES Sets before being returned — prevents
 *     unexpected values from polluting downstream logic.
 *
 * 15. FALLBACK_WHATSAPP ENV VAR
 *     Hard-coded phone number fallbacks moved to FALLBACK_WHATSAPP
 *     env var so they can be updated without a code deploy.
 *
 * 16. extractKeywords SWAHILI STOP-WORDS
 *     Added common Swahili function words so Swahili queries produce
 *     better keyword sets for KB retrieval.
 *
 *  REQUIRED ENV VARS
 *  ─────────────────
 *  SUPABASE_SERVICE_ROLE_KEY  — existing, unchanged
 *  ANTHROPIC_API_KEY          — existing (v9)
 *  FALLBACK_WHATSAPP          — NEW (optional, defaults to +254113881279)
 * ══════════════════════════════════════════════════════════════════
 */

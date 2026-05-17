/*
  LHISKEY KICK TRADES
  Main JavaScript file.
  Handles ticker, scroll animations, Supabase signup, CMS content, strategies, and assistant widget.
*/

// ── SUPABASE BACKEND CONFIG
const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ── TICKER DATA

// ── FLOATING MARKET TICKER + VOLUME v15.2
const pairs = [
  {p:'XAUUSD', v:2341.40, d:2, c:+0.34, up:true,  vol:4.20},
  {p:'GBPJPY', v:196.840, d:3, c:+0.18, up:true,  vol:8.90},
  {p:'EURUSD', v:1.08421, d:5, c:-0.09, up:false, vol:12.40},
  {p:'USDJPY', v:151.220, d:3, c:+0.22, up:true,  vol:9.10},
  {p:'GBPUSD', v:1.27650, d:5, c:+0.15, up:true,  vol:7.30},
  {p:'US30',   v:39241,   d:0, c:-0.41, up:false, vol:2.10},
  {p:'BTCUSD', v:68420,   d:0, c:+1.23, up:true,  vol:15.80},
  {p:'USDCHF', v:0.90120, d:5, c:+0.11, up:true,  vol:5.70},
  {p:'AUDCAD', v:0.89340, d:5, c:-0.07, up:false, vol:3.60},
  {p:'NZDUSD', v:0.60980, d:5, c:-0.14, up:false, vol:4.40},
];

function formatTickerPrice(item){
  const value = Number(item.v);
  if(item.d === 0) return value.toLocaleString('en-US', { maximumFractionDigits:0 });
  return value.toLocaleString('en-US', {
    minimumFractionDigits:item.d,
    maximumFractionDigits:item.d
  });
}

function formatTickerChange(item){
  const sign = Number(item.c) >= 0 ? '+' : '';
  return `${sign}${Number(item.c).toFixed(2)}%`;
}

function formatTickerVolume(item){
  return `Vol ${Number(item.vol || 0).toFixed(2)}K`;
}

function buildTicker(){
  const t = document.getElementById('ticker');
  if(!t) return;

  const all = [...pairs, ...pairs, ...pairs];
  t.innerHTML = all.map(i => `
    <span class="market-ticker-item">
      <span class="ticker-pair">${i.p}</span>
      <span class="ticker-price">${formatTickerPrice(i)}</span>
      <span class="ticker-volume">${formatTickerVolume(i)}</span>
      <span class="${i.up ? 'tick-up' : 'tick-dn'}">${formatTickerChange(i)}</span>
    </span>
  `).join('');
}

function startTicker(){
  buildTicker();
  setInterval(wobbleTicker, 2800);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', startTicker);
}else{
  startTicker();
}

function wobbleTicker(){
  const prices = document.querySelectorAll('.market-ticker-item .ticker-price');
  const volumes = document.querySelectorAll('.market-ticker-item .ticker-volume');

  prices.forEach((el, i) => {
    const source = pairs[i % pairs.length];
    const base = Number(source.v);
    const delta = (Math.random() - 0.5) * 0.0018 * base;
    const newVal = Math.max(0, base + delta);

    el.textContent = source.d === 0
      ? newVal.toLocaleString('en-US', { maximumFractionDigits:0 })
      : newVal.toLocaleString('en-US', {
          minimumFractionDigits:source.d,
          maximumFractionDigits:source.d
        });
  });

  volumes.forEach((el, i) => {
    const source = pairs[i % pairs.length];
    const delta = (Math.random() - 0.5) * 0.42;
    const newVol = Math.max(0.10, Number(source.vol || 1) + delta);
    el.textContent = `Vol ${newVol.toFixed(2)}K`;
  });
}


// ── SCROLL ANIMATIONS
const observer=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible');});
},{threshold:.15});
document.querySelectorAll('.fade-up').forEach(el=>observer.observe(el));

// ── SIGNUP: SAVE EMAIL TO SUPABASE
async function handleSignup(){
  const emailInput = document.getElementById('emailInput');
  const msg = document.getElementById('signup-msg');
  const btn = document.getElementById('signupBtn');

  const email = emailInput.value.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  msg.style.display = 'block';

  if(!emailPattern.test(email)){
    msg.style.color = 'var(--red)';
    msg.textContent = 'Please enter a valid email address.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  const { error } = await supabaseClient
    .from('watchlist')
    .insert([
      {
        email: email,
        source: 'lhiskey-kick-trades-website'
      }
    ]);

  btn.disabled = false;
  btn.textContent = 'Join Watchlist →';

  if(error){
    if(error.code === '23505' || error.message.toLowerCase().includes('duplicate')){
      msg.style.color = 'var(--green)';
      msg.textContent = 'You are already on the LHISKEY KICK TRADES watchlist.';
      emailInput.value = '';
      return;
    }

    msg.style.color = 'var(--red)';
    msg.textContent = 'Signup failed. Check your internet connection or Supabase table setup.';
    console.error('Supabase signup error:', error);
    return;
  }

  msg.style.color = 'var(--green)';
  msg.textContent = '✓ Welcome to LHISKEY KICK TRADES. You have joined the watchlist.';
  emailInput.value = '';
}

// Allow Enter key to submit email
document.getElementById('emailInput').addEventListener('keydown', function(event){
  if(event.key === 'Enter'){
    event.preventDefault();
    handleSignup();
  }
});


// ── CMS CONTENT LOADER
let cmsContacts = {};
let publicStrategiesCache = [];
let publicPackagesCache = [];
let publicShowcaseCache = [];
let publicPaymentSettings = {};
let publicLockedProductsCache = [];
let assistantConfig = {
  assistant_name: 'LHISKEY AI Assistant',
  status: 'offline',
  welcome_message: 'Hello, welcome to LHISKEY KICK TRADES. How can I help you today?',
  fallback_message: 'A live agent is currently unavailable. Leave your contact details and we will respond as soon as possible.',
  system_prompt: ''
};

function formatPhoneForDisplay(phone){
  if(!phone) return '';
  const clean = phone.replace(/[^\d+]/g,'');
  if(clean.startsWith('+254') && clean.length === 13){
    return '+254 ' + clean.slice(4,7) + ' ' + clean.slice(7,10) + ' ' + clean.slice(10);
  }
  return phone;
}

function phoneToWaLink(phone){
  return 'https://wa.me/' + String(phone || '').replace(/[^\d]/g,'');
}

function setText(id, value){
  const el = document.getElementById(id);
  if(el && value !== undefined && value !== null) el.textContent = value;
}

function setHref(id, value){
  const el = document.getElementById(id);
  if(el && value) el.href = value;
}

async function loadCMSContent(){
  try{
    const { data, error } = await supabaseClient
      .from('site_settings')
      .select('key,value')
      .in('key',['homepage','contacts']);

    if(error){
      console.warn('CMS load error:', error.message);
      return;
    }

    const settings = {};
    (data || []).forEach(row => settings[row.key] = row.value || {});

    const homepage = settings.homepage || {};
    cmsContacts = settings.contacts || {};

    setText('heroTagText', homepage.hero_tag);
    setText('heroLine1', homepage.hero_title_line1);
    setText('heroHighlight', homepage.hero_title_highlight);
    setText('heroLine3', homepage.hero_title_line3);
    setText('heroSubtitle', homepage.hero_subtitle);
    setText('primaryHeroBtn', homepage.primary_button);
    setText('secondaryHeroBtn', homepage.secondary_button);

    applyContactSettings(cmsContacts);
  }catch(err){
    console.warn('CMS content failed:', err);
  }
}

function applyContactSettings(contacts){
  const w1 = contacts.whatsapp1 || '+254113881279';
  const w2 = contacts.whatsapp2 || '+254743520031';
  const w3 = contacts.whatsapp3 || '+254742307706';
  const email = contacts.email || 'owinoemmanuel245@gmail.com';
  const facebook = contacts.facebook || '#';
  const instagram = contacts.instagram || '#';

  const whatsappMap = [
    ['contactWhatsapp1', w1],
    ['contactWhatsapp2', w2],
    ['contactWhatsapp3', w3]
  ];

  whatsappMap.forEach(([id, phone])=>{
    const el = document.getElementById(id);
    if(el){
      el.textContent = formatPhoneForDisplay(phone);
      el.href = phoneToWaLink(phone);
    }
  });

  setHref('floatingWhatsapp', phoneToWaLink(w1));
  setHref('footerWhatsapp', phoneToWaLink(w1));

  const emailEl = document.getElementById('contactEmail');
  if(emailEl){
    emailEl.textContent = email;
    emailEl.href = 'mailto:' + email;
  }

  setHref('footerEmail', 'mailto:' + email);
  setHref('contactFacebook', facebook);
  setHref('footerFacebook', facebook);
  setHref('contactInstagram', instagram);
  setHref('footerInstagram', instagram);
}

async function loadPublishedStrategies(){
  try{
    const { data, error } = await supabaseClient
      .from('strategies')
      .select('id,title,category,timeframe,description,content,created_at')
      .eq('is_published', true)
      .order('created_at',{ascending:false})
      .limit(12);

    if(error){
      console.warn('Strategies load error:', error.message);
      return;
    }

    publicStrategiesCache = data || [];
    renderPublicStrategies();
  }catch(err){
    console.warn('Strategies failed:', err);
  }
}

function renderPublicStrategies(){
  const container = document.getElementById('publicStrategies');
  if(!container) return;

  if(publicStrategiesCache.length === 0){
    container.innerHTML = `
      <div class="strategy-public-card fade-up visible">
        <h3>No strategies published yet</h3>
        <p>Add and publish your first strategy from the admin dashboard.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = publicStrategiesCache.map(item => `
    <div class="strategy-public-card fade-up visible">
      <h3>${escapeHTML(item.title)}</h3>
      <div class="strategy-meta">
        <span>${escapeHTML(item.category || 'Forex')}</span>
        <span>${escapeHTML(item.timeframe || 'M15')}</span>
      </div>
      <p>${escapeHTML(item.description || '').slice(0,220)}</p>
    </div>
  `).join('');
}

async function loadAssistantSettings(){
  try{
    const { data, error } = await supabaseClient
      .from('ai_assistant_settings')
      .select('*')
      .eq('id',1)
      .single();

    if(error || !data) return;

    assistantConfig = { ...assistantConfig, ...data };

    setText('assistantName', assistantConfig.assistant_name);
    setText('assistantStatus', assistantConfig.status === 'online' ? 'Online assistant mode' : 'Offline support mode');
    setText('assistantWelcome', assistantConfig.welcome_message);
  }catch(err){
    console.warn('Assistant settings failed:', err);
  }
}

function toggleAssistant(){
  const panel = document.getElementById('aiPanel');
  if(panel) panel.classList.toggle('open');
}

function addAssistantMessage(text, type){
  const messages = document.getElementById('aiMessages');
  if(!messages) return;

  const div = document.createElement('div');
  div.className = 'ai-msg ' + type;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

let aiConversationHistory = [];
let currentChatSessionId = localStorage.getItem('lhiskey_chat_session_id') || null;
let liveChatLastMessageId = Number(localStorage.getItem('lhiskey_chat_last_id') || 0);
let liveChatPollTimer = null;

async function sendAssistantMessage(){
  const input = document.getElementById('aiInput');
  if(!input) return;

  const question = input.value.trim();
  if(!question) return;

  addAssistantMessage(question, 'user');
  input.value = '';

  aiConversationHistory.push({ role:'user', content: question });
  aiConversationHistory = aiConversationHistory.slice(-10);

  const thinkingMessage = document.createElement('div');
  thinkingMessage.className = 'ai-msg bot';
  thinkingMessage.textContent = 'Thinking...';

  const messages = document.getElementById('aiMessages');
  messages.appendChild(thinkingMessage);
  messages.scrollTop = messages.scrollHeight;

  try{
    const response = await fetch('/api/assistant', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        session_id: currentChatSessionId,
        message: question,
        history: aiConversationHistory,
        assistantConfig,
        contacts: cmsContacts,
        strategies: publicStrategiesCache.slice(0,8),
        page: window.location.pathname
      })
    });

    const result = await response.json();

    if(!response.ok || (!result.reply && !result.ack_only)){
      throw new Error(result.error || 'Assistant request failed');
    }

    if(result.session_id){
      currentChatSessionId = result.session_id;
      localStorage.setItem('lhiskey_chat_session_id', currentChatSessionId);
    }

    const maxId = Math.max(Number(result.userMessageId || 0), Number(result.botMessageId || 0), liveChatLastMessageId);
    if(maxId){
      liveChatLastMessageId = maxId;
      localStorage.setItem('lhiskey_chat_last_id', String(liveChatLastMessageId));
    }

    if(result.ack_only){
      thinkingMessage.remove();
      showMiniDeliveryStatus('Delivered to admin');
    }else{
      thinkingMessage.textContent = result.reply;
      aiConversationHistory.push({ role:'assistant', content: result.reply });
      aiConversationHistory = aiConversationHistory.slice(-10);
    }

    if(result.handoff){
      addAssistantMessage('A handoff record has been created. Keep this chat open — admin replies will appear here.', 'bot');
      startLiveChatPolling();

      if(result.handoff.request_details){
        renderLeadCaptureForm(result.handoff);
      }
    }

    if(result.live_mode || result.status === 'waiting_agent' || result.status === 'live_agent'){
      startLiveChatPolling();
    }
  }catch(error){
    console.warn('Assistant backend failed:', error);
    const fallback = generateAssistantReply(question);
    thinkingMessage.textContent = fallback;
    aiConversationHistory.push({ role:'assistant', content: fallback });
    aiConversationHistory = aiConversationHistory.slice(-10);
  }

  messages.scrollTop = messages.scrollHeight;
}

function startLiveChatPolling(){
  if(liveChatPollTimer || !currentChatSessionId) return;

  liveChatPollTimer = setInterval(pollLiveChatMessages, 3500);
  pollLiveChatMessages();
}

async function pollLiveChatMessages(){
  if(!currentChatSessionId) return;

  try{
    const response = await fetch(`/api/chat-poll?session_id=${encodeURIComponent(currentChatSessionId)}&after_id=${liveChatLastMessageId}`);
    const result = await response.json();

    if(!response.ok) return;

    (result.messages || []).forEach(msg => {
      liveChatLastMessageId = Math.max(liveChatLastMessageId, Number(msg.id || 0));
      localStorage.setItem('lhiskey_chat_last_id', String(liveChatLastMessageId));

      if(msg.author_type === 'admin'){
        addAssistantMessage(msg.content, 'admin');
      }else if(msg.author_type === 'system'){
        addAssistantMessage(msg.content, 'bot');
      }
    });

    if(result.session && result.session.status === 'closed'){
      addAssistantMessage('This live chat has been closed by admin. You can start a new support request anytime.', 'bot');
      clearInterval(liveChatPollTimer);
      liveChatPollTimer = null;
      localStorage.removeItem('lhiskey_chat_session_id');
      localStorage.removeItem('lhiskey_chat_last_id');
      currentChatSessionId = null;
      liveChatLastMessageId = 0;
    }
  }catch(error){
    console.warn('Live chat polling failed:', error);
  }
}

if(currentChatSessionId){
  startLiveChatPolling();
}

function generateAssistantReply(question){
  const q = String(question || '').toLowerCase();
  const c = cmsContacts || {};
  const w1 = c.whatsapp1 || '+254113881279';
  const email = c.email || 'owinoemmanuel245@gmail.com';
  const has = (...words) => words.some(w => q.includes(w));
  const nl2 = String.fromCharCode(10, 10);

  if(has('payment proof','submit proof','after i pay','after payment','payment work','payments work','how do payments','mpesa','m-pesa','bank payment','reference code','transaction code')){
    return 'LHISKEY KICK TRADES uses a manual payment-proof system. A client should only make payment after admin confirms the package, service, product, consultation, or access request. After payment, the client submits proof through the Payment Proof form with name, WhatsApp number, payment purpose, amount, method, reference code, and optional screenshot/PDF. Admin reviews the proof manually. Access is released only after admin verifies and approves the payment.' + nl2 + 'Payments are for education, tools, testing access, consultation, support, or locked product access. They do not guarantee trading profits.';
  }

  if(has('unlock a package','unlock package','unlock my package','client access','access portal','access code','release code','how do i unlock','how to unlock','approved package')){
    return 'To unlock a package, the client first clicks Access on a locked product, follows admin-confirmed payment instructions, submits payment proof, and waits for admin approval. After approval, admin releases the package and the system generates a unique access code. The client then opens the Client Access Portal and enters the same WhatsApp number used during payment plus the access code. The approved private content, delivery notes, and private links then unlock for that client.';
  }

  if(has('share my access code','share access code','can i share','sharing code','another device','same code','access revoked','revoked access','anti sharing','anti-sharing')){
    return 'Access codes are issued for one client only. Each code is linked to the client’s WhatsApp number and the first device/session used to unlock the package. If the same code is used on another device or by another person, the system may block the attempt, alert admin, or revoke access after repeated sharing attempts. If a genuine client changes phone or browser, they should contact admin for a device reset.';
  }

  if(has('refund','get a refund','refund policy','money back','access review','payment issue')){
    return 'Refunds, replacements, access adjustments, or support reviews are handled manually by admin. Eligibility depends on the type of service, whether private digital access has already been released, and the issue raised by the client. If there is a payment or access issue, the client should contact admin with their name, WhatsApp number, payment reference, and explanation.';
  }

  if(has('financial advice','is this financial advice','investment advice','personal advice')){
    return 'No. LHISKEY KICK TRADES does not provide personal financial advice, investment advice, guaranteed signals, or direct instructions to buy or sell any market. All content, AI responses, private materials, strategy notes, tools, and consultations are for educational, informational, support, or testing purposes only. Clients must use independent judgment and proper risk management.';
  }

  if(has('risk disclaimer','trading risk','guaranteed profit','guarantee profits','guaranteed profits','losses','can i lose')){
    return 'Trading forex, gold, indices, crypto, commodities, and other financial markets involves risk. Losses can happen, especially when leverage, poor risk management, emotional trading, or untested systems are used. LHISKEY KICK TRADES does not guarantee profits, account growth, payouts, or trading success. Never trade money you cannot afford to lose.';
  }

  if(has('why are the bots not public','bots not public','strategies not public','strategy not public','why not public','not released','not available yet','research stage')){
    return 'LHISKEY KICK TRADES does not rush to publish untested bots or full strategy rules. Strategies, bots, tools, and private systems must be researched, tested, reviewed, and structured properly before release. This protects clients from blindly copying incomplete rules or using risky automation that could damage trading accounts. Some products may appear as Research Stage, In Testing, Private Beta, Coming Soon, Preview Only, or Locked until they are ready.';
  }

  if(has('locked product','locked products','private content','product locked','payment required','access package')){
    return 'Locked Products are private LHISKEY KICK TRADES products, packages, tools, strategies, consultations, or educational materials that are visible as public previews but not fully accessible until approved. Visitors can see the preview, but private content stays locked. After payment proof is verified and admin releases access, the client receives an access code to unlock the package.';
  }

  if(has('whatsapp','phone','contact','call')){
    return `You can contact LHISKEY KICK TRADES on WhatsApp: ${formatPhoneForDisplay(w1)} or email: ${email}.`;
  }

  if(has('email','mail')){
    return `Our official email is ${email}.`;
  }

  if(has('private beta')){
    return 'Private beta means a bot, strategy, tool, or assistant is being tested with limited access before public release. It does not mean the product is fully released or ready for live-account use. It means the system is still being checked for safety, stability, usefulness, risk behavior, and user experience. Pricing will be communicated soon when the beta structure and access terms are finalized.' + nl2 + '📊 Educational/testing purposes only — not financial advice.';
  }

  if(has('how much','price','pricing','cost','fee','fees','package','pack','packs','mentorship','mentor','consultation','consult','request access','smc pack','ict pack')){
    if(publicPackagesCache && publicPackagesCache.length > 0){
      const query = q;
      const scored = publicPackagesCache.map(pkg => {
        const featureText = Array.isArray(pkg.features) ? pkg.features.join(' ') : '';
        const text = `${pkg.title || ''} ${pkg.category || ''} ${pkg.description || ''} ${featureText}`.toLowerCase();
        let score = 0;
        if(query.includes('smc') && text.includes('smc')) score += 10;
        if(query.includes('ict') && text.includes('ict')) score += 10;
        if(query.includes('bot') && (text.includes('bot') || text.includes('tool'))) score += 8;
        if(query.includes('consult') && text.includes('consult')) score += 8;
        if(query.includes('mentor') && (text.includes('mentor') || text.includes('beginner') || text.includes('smc'))) score += 6;
        return { pkg, score };
      }).sort((a,b) => b.score - a.score);

      const selected = scored[0]?.score > 0 ? scored.slice(0,2).map(x => x.pkg) : publicPackagesCache.slice(0,4);
      const list = selected.map((p,i) => `${i+1}. ${p.title || 'Service Package'} — ${p.price_label || 'Pricing will be communicated soon'}${String.fromCharCode(10)}${p.description || ''}`).join(nl2);
      return 'Available LHISKEY KICK TRADES package/service information:' + nl2 + list + nl2 + 'Pricing will be communicated soon where not yet finalized. Use the Services/Packages form to request details.';
    }
    return 'LHISKEY KICK TRADES package pricing will be communicated soon after services, access levels, and testing stages are finalized. Use the Services/Packages request form or ask for live support.';
  }

  if(has('can i test','test the bot','testing waitlist','early access','gold scalping bot','bot available','public download','in testing')){
    return 'Bot testing at LHISKEY KICK TRADES is controlled carefully. Untested bots are not released publicly because trading automation can be risky without proper controls and forward testing. Visitors can request early access or join the testing waitlist, but approval is not automatic. Pricing will be communicated soon when the access structure is ready.' + nl2 + '📊 Educational/testing purposes only — not financial advice.';
  }

  if(has('strategy','strategies','strategy library','strategy notes','strategy rules')){
    if(publicStrategiesCache && publicStrategiesCache.length > 0){
      const titles = publicStrategiesCache.slice(0,4).map(s => `${s.title}${s.timeframe ? ' (' + s.timeframe + ')' : ''}`).join(', ');
      return `Published strategy notes currently include: ${titles}. These are educational notes, not personal trade signals.` + nl2 + '📊 Educational purposes only — not financial advice.';
    }
    return 'LHISKEY KICK TRADES has not fully published public strategy notes yet. Strategies will be shared only after review and testing so visitors do not blindly copy risky rules.';
  }

  if(has('what is forex','forex meaning') || q.trim() === 'forex'){
    return 'Forex, also called foreign exchange, is the global market where currencies are bought and sold. Traders study pairs like EUR/USD, GBP/USD, USD/JPY, and XAU/USD. Price moves because of supply and demand, interest rates, liquidity, news, and market sentiment. Beginners should learn market structure and risk management before chasing profits.' + nl2 + '📊 Educational purposes only — not financial advice.';
  }

  if(has('smc','ict','liquidity','order block','fvg','fair value gap','market structure')){
    return 'SMC/ICT is a way of studying price action through liquidity, market structure, order blocks, fair value gaps, BOS, CHoCH, supply and demand, and risk-first trade planning. It is education, not a guaranteed signal system.' + nl2 + '📊 Educational purposes only — not financial advice.';
  }

  if(has('gold','xau','trade','risk')){
    return 'LHISKEY KICK TRADES focuses on price action, market structure, liquidity, supply and demand, and risk-first trading. We do not promise guaranteed profits. Always manage risk before entering any trade.' + nl2 + '📊 Educational purposes only — not financial advice.';
  }

  if(has('live agent','agent','admin','human','support')){
    return assistantConfig.fallback_message + ` You can also reach us on WhatsApp: ${formatPhoneForDisplay(w1)}.`;
  }

  if(has('lhiskey','kick trades','what is lhiskey','about lhiskey','what are you')){
    return 'LHISKEY KICK TRADES is a risk-first trading education, tools, and private-access platform. It helps traders understand forex, gold, market structure, liquidity, supply and demand, risk management, trading psychology, bots, tools, and structured learning paths. The platform includes an AI assistant, live agent handoff, locked products, payment-proof verification, client access codes, anti-sharing protection, early access requests, safe showcase items, and admin-controlled product release. It does not promise guaranteed profits.';
  }

  return 'I can help with payments, locked products, access codes, forex education, LHISKEY KICK TRADES platform information, packages, safe showcase items, strategy notes, bot/tool information, and support routing.';
}

document.addEventListener('DOMContentLoaded', function(){
  setTimeout(() => {
    const head = document.querySelector('.ai-head');
    if(head && !document.getElementById('newChatBtn')){
      const btn = document.createElement('button');
      btn.id = 'newChatBtn';
      btn.textContent = '↻';
      btn.title = 'Start new chat';
      btn.onclick = resetAssistantChat;
      head.appendChild(btn);
    }
  }, 500);
});



function showMiniDeliveryStatus(text){
  const messages = document.getElementById('aiMessages');
  if(!messages) return;

  const div = document.createElement('div');
  div.className = 'ai-delivery-status';
  div.textContent = '✓ ' + text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  setTimeout(() => {
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 500);
  }, 1600);
}

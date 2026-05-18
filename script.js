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
    setText('assistantStatus', 'Online assistant mode');
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


/* ── ASSISTANT CONTROLS + LIVE DETAILS v15.6 ── */
function installAssistantControls(){
  const head = document.querySelector('.ai-head');
  if(!head) return;

  let controls = document.getElementById('aiControlButtons');
  if(!controls){
    controls = document.createElement('div');
    controls.id = 'aiControlButtons';
    controls.className = 'ai-control-buttons';
    head.appendChild(controls);
  }

  if(!document.getElementById('refreshAssistantBtn')){
    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshAssistantBtn';
    refreshBtn.type = 'button';
    refreshBtn.textContent = '⟳';
    refreshBtn.title = 'Refresh assistant agent';
    refreshBtn.onclick = refreshAssistantAgent;
    controls.appendChild(refreshBtn);
  }

  if(!document.getElementById('newChatBtn')){
    const newBtn = document.createElement('button');
    newBtn.id = 'newChatBtn';
    newBtn.type = 'button';
    newBtn.textContent = '↻';
    newBtn.title = 'Start a new chat';
    newBtn.onclick = resetAssistantChat;
    controls.appendChild(newBtn);
  }
}

async function refreshAssistantAgent(){
  try{
    setText('assistantStatus', 'Refreshing assistant...');
    await Promise.allSettled([
      loadAssistantSettings(),
      loadPublicPaymentSettings?.(),
      loadPublicLockedProducts?.(),
      loadPublishedPackages?.(),
      loadPublishedStrategies?.()
    ]);
    setText('assistantStatus', 'Online assistant mode');
    addAssistantMessage('Assistant refreshed. You can continue chatting.', 'bot');
  }catch(err){
    console.warn('Assistant refresh failed:', err);
    setText('assistantStatus', 'Online assistant mode');
    addAssistantMessage('Assistant refreshed locally. You can continue chatting.', 'bot');
  }
}

function resetAssistantChat(){
  try{
    if(liveChatPollTimer){
      clearInterval(liveChatPollTimer);
      liveChatPollTimer = null;
    }

    currentChatSessionId = null;
    liveChatLastMessageId = 0;
    aiConversationHistory = [];

    localStorage.removeItem('lhiskey_chat_session_id');
    localStorage.removeItem('lhiskey_chat_last_id');

    const messages = document.getElementById('aiMessages');
    if(messages){
      messages.innerHTML = '';
      const welcome = document.createElement('div');
      welcome.className = 'ai-msg bot';
      welcome.id = 'assistantWelcome';
      welcome.textContent = assistantConfig.welcome_message || 'Hello, welcome to LHISKEY KICK TRADES. How can I help you today?';
      messages.appendChild(welcome);
    }

    setText('assistantStatus', 'Online assistant mode');
  }catch(err){
    console.warn('Reset assistant chat failed:', err);
  }
}

function isLiveAgentRequest(text){
  const q = String(text || '').toLowerCase();
  return [
    'live agent','i need an agent','i want an agent','talk to agent','speak to agent',
    'talk to admin','speak to admin','connect me to admin','connect me to agent',
    'human support','live support','real person','customer care','talk to someone',
    'speak to someone','i need help from admin','nataka agent','nataka admin','ongea na mtu'
  ].some(phrase => q.includes(phrase));
}

function renderLeadCaptureForm(handoff = {}){
  const messages = document.getElementById('aiMessages');
  if(!messages) return;

  if(document.getElementById('assistantLeadFormWrap')){
    document.getElementById('assistantLeadFormWrap').scrollIntoView({ behavior:'smooth', block:'nearest' });
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ai-lead-form-wrap';
  wrap.id = 'assistantLeadFormWrap';

  const reason = handoff.reason || 'Visitor requested live support';
  const urgency = handoff.urgency || 'medium';

  wrap.innerHTML = `
    <div class="ai-lead-form-title">Live Agent Request</div>
    <p class="ai-lead-form-note">Share your details so admin can identify you and reply inside this chat or on WhatsApp.</p>

    <input id="leadNameInput" type="text" placeholder="Your name"/>
    <input id="leadWhatsappInput" type="tel" placeholder="WhatsApp number e.g. +254..."/>
    <input id="leadEmailInput" type="email" placeholder="Email optional"/>
    <select id="leadPreferredInput">
      <option value="whatsapp">WhatsApp</option>
      <option value="email">Email</option>
      <option value="chat">This chat</option>
    </select>
    <textarea id="leadMessageInput" rows="3" placeholder="Short message for admin..."></textarea>

    <button type="button" onclick="submitAssistantLeadCapture('${safeAttr(reason)}','${safeAttr(urgency)}')">Send Details to Admin →</button>
    <p class="ai-lead-status" id="assistantLeadStatus">Your details will be sent to the admin dashboard.</p>
  `;

  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

async function submitAssistantLeadCapture(reason = 'Visitor requested live support', urgency = 'medium'){
  const status = document.getElementById('assistantLeadStatus');
  const name = document.getElementById('leadNameInput')?.value.trim() || '';
  const whatsapp = document.getElementById('leadWhatsappInput')?.value.trim() || '';
  const email = document.getElementById('leadEmailInput')?.value.trim() || '';
  const preferred_contact = document.getElementById('leadPreferredInput')?.value || 'whatsapp';
  const message = document.getElementById('leadMessageInput')?.value.trim() || '';

  if(!name || !whatsapp || !message){
    if(status){
      status.style.color = 'var(--red)';
      status.textContent = 'Name, WhatsApp number, and message are required.';
    }
    return;
  }

  if(status){
    status.style.color = 'var(--muted)';
    status.textContent = 'Sending your details to admin...';
  }

  try{
    const response = await fetch('/api/lead', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        session_id: currentChatSessionId,
        name,
        whatsapp,
        email,
        message,
        reason,
        urgency,
        preferred_contact
      })
    });

    const result = await response.json();

    if(!response.ok || !result.ok){
      throw new Error(result.error || 'Could not send details');
    }

    if(result.session_id){
      currentChatSessionId = result.session_id;
      localStorage.setItem('lhiskey_chat_session_id', currentChatSessionId);
    }

    if(result.message_id){
      liveChatLastMessageId = Math.max(Number(result.message_id || 0), Number(liveChatLastMessageId || 0));
      localStorage.setItem('lhiskey_chat_last_id', String(liveChatLastMessageId));
    }

    if(status){
      status.style.color = 'var(--green)';
      status.textContent = 'Details sent successfully. Keep this chat open for admin replies.';
    }

    addAssistantMessage('Your details have been received. Admin can now identify this chat and reply here when available.', 'bot');
    startLiveChatPolling();

    const form = document.getElementById('assistantLeadFormWrap');
    if(form) form.classList.add('submitted');
  }catch(err){
    console.warn('Lead capture failed:', err);
    if(status){
      status.style.color = 'var(--red)';
      status.textContent = 'Could not send details. Please use WhatsApp directly or try again.';
    }
  }
}

function startLiveSupportFallback(question){
  addAssistantMessage('I can connect you with admin. Please share your details in the form below so they can reply properly.', 'bot');
  renderLeadCaptureForm({
    reason: 'Visitor requested live support',
    urgency: 'medium',
    request_details: true
  });
}

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

    if(isLiveAgentRequest(question)){
      startLiveSupportFallback(question);
    }
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
    const response = await fetch(`/api/lead?action=chat-poll&session_id=${encodeURIComponent(currentChatSessionId)}&after_id=${liveChatLastMessageId}`);
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


function forexEducationAnswer(topic){
  const disclaimer = '\n\n📊 Educational purposes only — not financial advice. Forex trading involves risk and losses can occur.';

  const answers = {
    forex_full:
      'Forex trading means buying one currency while selling another currency at the same time. Forex comes from Foreign Exchange. It is the global market where currencies are exchanged.\n\n' +
      'In Forex, traders trade currency pairs such as EUR/USD, GBP/USD, USD/JPY, GBP/JPY, USD/CHF, and XAU/USD. The first currency is called the base currency and the second currency is called the quote currency. For example, EUR/USD = 1.0850 means 1 euro is worth 1.0850 US dollars.\n\n' +
      'Forex prices move because of supply and demand, interest rates, inflation, central bank decisions, economic news, market sentiment, liquidity, and institutional activity. A serious trader studies market structure, support and resistance, liquidity, supply and demand, trend direction, risk management, and trading psychology before entering trades.\n\n' +
      'Beginners usually lose because they overtrade, use large lot sizes, ignore stop loss, revenge trade, trade news blindly, or follow signals without understanding risk. LHISKEY KICK TRADES teaches forex from a risk-first perspective: understand the market, protect the account, and avoid reckless trading behavior.' + disclaimer,

    pips_lots:
      'Pips, lots, leverage, margin, and spread are basic Forex concepts every beginner must understand.\n\n' +
      'A pip is a small unit of price movement. For most pairs, one pip is usually 0.0001. For JPY pairs, one pip is usually 0.01. Example: if EUR/USD moves from 1.0850 to 1.0860, that is 10 pips.\n\n' +
      'Lot size means trade size. A bigger lot size increases both profit and loss per pip. Common lot sizes are standard lot, mini lot, micro lot, and nano lot depending on broker.\n\n' +
      'Leverage allows a trader to control a larger position with smaller capital. It can increase profit potential but also increases risk. High leverage without discipline can destroy an account quickly.\n\n' +
      'Margin is the amount the broker holds to keep a trade open. Spread is the difference between buy and sell price. Scalpers must watch spread closely because high spread can make small trades harder to profit from.' + disclaimer,

    leverage:
      'Leverage allows a trader to control a bigger trade position than the cash they personally put up. For example, 1:100 leverage means a small account can control a much larger market position.\n\n' +
      'Leverage is powerful but dangerous. It can multiply profits, but it also multiplies losses. A beginner using high leverage with large lot sizes can lose money very fast.\n\n' +
      'Good traders do not use leverage as an excuse to overtrade. They first calculate risk, stop loss distance, lot size, margin, and account protection. The question is not “How much can I open?” but “How much can I lose if I am wrong?”' + disclaimer,

    price_moves:
      'Forex price moves because of the battle between buyers and sellers. When buying pressure is stronger than selling pressure, price rises. When selling pressure is stronger, price falls.\n\n' +
      'But price movement is not only random noise. It is affected by supply and demand, interest rates, economic news, market sentiment, liquidity, market structure, and institutional order flow.\n\n' +
      'A serious trader asks: Where is liquidity? What is the market structure? Is price trending or ranging? Where are supply and demand zones? Is there high-impact news? Where is invalidation? How much am I risking?' + disclaimer,

    risk:
      'Risk management is the most important part of Forex trading. A trader can have a good strategy and still lose money if risk is poor.\n\n' +
      'Good risk management means controlling how much money can be lost before entering the trade. Always define stop loss, lot size, risk percentage, invalidation, and daily loss limit before trading.\n\n' +
      'Core rules: use a stop loss, avoid overtrading, avoid revenge trading, respect drawdown, use proper lot size, avoid blind news trading, and accept losses as part of the game.\n\n' +
      'A professional trader asks: If I am wrong, how much do I lose? Where is my stop loss? Is the risk worth the reward? Am I following a plan or forcing a trade?' + disclaimer,

    market_structure:
      'Market structure is the way price forms highs and lows on a chart. It helps traders understand whether the market is bullish, bearish, or ranging.\n\n' +
      'Bullish structure forms higher highs and higher lows. Bearish structure forms lower lows and lower highs. A ranging market moves sideways between support and resistance.\n\n' +
      'BOS means Break of Structure. It happens when price breaks an important high or low in the direction of the trend. CHoCH means Change of Character and may suggest market behavior is changing.\n\n' +
      'Internal structure refers to smaller moves inside a larger trend. External structure refers to the larger swing highs and lows controlling the main direction. Structure should be combined with liquidity, supply and demand, confirmation, and risk management.' + disclaimer,

    liquidity:
      'Liquidity refers to areas where many orders are likely sitting in the market. Common liquidity areas include previous highs, previous lows, equal highs, equal lows, support/resistance zones, session highs/lows, and obvious stop-loss areas.\n\n' +
      'A liquidity sweep happens when price moves above a high or below a low to collect orders, then reacts or reverses strongly. Traders watch sweeps because they may show where the market collected liquidity before moving.\n\n' +
      'Liquidity is important because markets often move toward areas where orders exist. A trader should ask: Where are stops? Where are equal highs/lows? Has price swept liquidity? Did price react after the sweep?' + disclaimer,

    smc_ict:
      'SMC and ICT are methods of reading price action through liquidity, market structure, order blocks, fair value gaps, supply and demand, and institutional-style behavior.\n\n' +
      'SMC means Smart Money Concepts. It focuses on how price may move toward liquidity, react from institutional zones, form structure shifts, and rebalance imbalances.\n\n' +
      'ICT is a trading education style that also focuses on liquidity, time, market structure, fair value gaps, displacement, premium/discount, session behavior, and institutional order flow ideas.\n\n' +
      'Key terms include liquidity sweep, order block, fair value gap, BOS, CHoCH, displacement, supply, demand, premium and discount. SMC/ICT is not magic and does not guarantee profits. It must be used with confirmation, patience, and strict risk management.' + disclaimer,

    psychology:
      'Trading psychology is the emotional side of trading. Many traders do not lose because they lack information; they lose because they cannot control fear, greed, impatience, revenge trading, and overconfidence.\n\n' +
      'Common problems include fear of missing out, revenge trading, overconfidence after wins, fear of losing, moving stop loss, and chasing candles.\n\n' +
      'A disciplined trader waits for a setup, accepts losses, avoids revenge trading, protects the account, trades less but better, and journals mistakes. Strategy, risk management, and psychology must work together.' + disclaimer,

    roadmap:
      'A beginner should learn Forex step by step instead of chasing signals or quick profits.\n\n' +
      'Step 1: Understand Forex basics — currency pairs, pips, lots, spread, leverage, and margin.\n' +
      'Step 2: Learn chart basics — candlesticks, timeframes, trends, ranges, support and resistance.\n' +
      'Step 3: Learn market structure — bullish, bearish, ranges, BOS, CHoCH, highs and lows.\n' +
      'Step 4: Learn risk management — stop loss, lot size, drawdown, daily loss limits, account protection.\n' +
      'Step 5: Learn liquidity and supply/demand — previous highs/lows, equal highs/lows, supply zones, demand zones.\n' +
      'Step 6: Learn psychology — fear, greed, patience, discipline, revenge trading, overconfidence.\n' +
      'Step 7: Practice on demo before risking real money.\n' +
      'Step 8: Journal trades and learn from mistakes.\n' +
      'Step 9: Build one tested strategy instead of jumping between many systems.\n' +
      'Step 10: Trade small and grow slowly.\n\n' +
      'LHISKEY KICK TRADES encourages beginners to focus on survival, discipline, and consistency before chasing big profits.' + disclaimer,

    beginners_lose:
      'Beginners lose money in Forex mostly because they trade without structure and risk control. Common reasons include using big lot sizes, overtrading, revenge trading, entering without stop loss, following signals blindly, chasing candles, trading high-impact news without understanding volatility, and risking too much on one trade.\n\n' +
      'Another big reason is psychology. A beginner may know the setup but still break rules because of fear, greed, impatience, or the desire to recover losses quickly.\n\n' +
      'The solution is to learn slowly, risk small, practice on demo, journal trades, focus on one strategy, and protect the account first.' + disclaimer
  };

  return answers[topic] || answers.forex_full;
}

function detectForexEducationTopic(q){
  if(q.includes('roadmap') || q.includes('learning path') || q.includes('beginner forex roadmap') || q.includes('how do i start forex')) return 'roadmap';
  if(q.includes('risk management') || q.includes('manage risk') || q.includes('stop loss') || q.includes('drawdown') || q.includes('lot size risk')) return 'risk';
  if(q.includes('pips') || q.includes('pip ') || q.includes('lot size') || q.includes('lots') || q.includes('spread') || q.includes('margin')) return 'pips_lots';
  if(q.includes('leverage')) return 'leverage';
  if(q.includes('market structure') || q.includes('bos') || q.includes('choch') || q.includes('higher high') || q.includes('lower low') || q.includes('structure')) return 'market_structure';
  if(q.includes('liquidity') || q.includes('liquidity sweep') || q.includes('equal highs') || q.includes('equal lows')) return 'liquidity';
  if(q.includes('ict') || q.includes('smc') || q.includes('smart money') || q.includes('order block') || q.includes('fvg') || q.includes('fair value gap')) return 'smc_ict';
  if(q.includes('psychology') || q.includes('mindset') || q.includes('emotions') || q.includes('revenge') || q.includes('fear') || q.includes('greed')) return 'psychology';
  if(q.includes('why do beginners lose') || q.includes('beginners lose') || q.includes('why traders lose')) return 'beginners_lose';
  if(q.includes('why does forex price move') || q.includes('why price moves') || q.includes('how price moves') || q.includes('price action')) return 'price_moves';
  if(q.includes('forex') || q.includes('currency pair') || q.includes('trading')) return 'forex_full';
  return '';
}

function generateAssistantReply(question){
  const q = String(question || '').toLowerCase();
  const c = cmsContacts || {};
  const w1 = c.whatsapp1 || '+254113881279';
  const email = c.email || 'owinoemmanuel245@gmail.com';
  const has = (...words) => words.some(w => q.includes(w));
  const nl2 = String.fromCharCode(10, 10);

  const forexTopic = detectForexEducationTopic(q);
  if(forexTopic){
    return forexEducationAnswer(forexTopic);
  }

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
    installAssistantControls();
    setText('assistantStatus', 'Online assistant mode');
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

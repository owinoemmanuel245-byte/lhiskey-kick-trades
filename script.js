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

  if(has('whatsapp','phone','contact','call')){
    return `You can contact LHISKEY KICK TRADES on WhatsApp: ${formatPhoneForDisplay(w1)} or email: ${email}.`;
  }

  if(has('email','mail')){
    return `Our official email is ${email}.`;
  }

  if(has('private beta')){
    return 'Private beta means a bot, strategy, tool, or assistant is being tested with limited access before public release. It does not mean the product is fully released or ready for live-account use. Pricing will be communicated soon when the beta structure and access terms are finalized.' + nl2 + '📊 Educational/testing purposes only — not financial advice.';
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

      const selected = scored[0]?.score > 0
        ? scored.slice(0,2).map(x => x.pkg)
        : publicPackagesCache.slice(0,4);

      const list = selected
        .map((p,i) => `${i+1}. ${p.title || 'Service Package'} — ${p.price_label || 'Pricing will be communicated soon'}${String.fromCharCode(10)}${p.description || ''}`)
        .join(nl2);

      return 'Available LHISKEY KICK TRADES package/service information:' + nl2 + list + nl2 + 'Pricing will be communicated soon where not yet finalized. Use the Services/Packages form to request details.';
    }

    return 'LHISKEY KICK TRADES package pricing will be communicated soon after services, access levels, and testing stages are finalized. Use the Services/Packages request form or ask for live support.';
  }

  if(has('can i test','test the bot','testing waitlist','early access','gold scalping bot','bot available','public download','in testing')){
    return 'Bot testing at LHISKEY KICK TRADES is controlled carefully. Untested bots are not released publicly because trading automation can be risky without proper controls and forward testing. Visitors can request early access or join the testing waitlist, but approval is not automatic. Pricing will be communicated soon when the access structure is ready.' + nl2 + '📊 Educational/testing purposes only — not financial advice.';
  }

  if(has('strategy','strategies','strategy library','strategy notes','strategy rules')){
    if(publicStrategiesCache && publicStrategiesCache.length > 0){
      const titles = publicStrategiesCache
        .slice(0,4)
        .map(s => `${s.title}${s.timeframe ? ' (' + s.timeframe + ')' : ''}`)
        .join(', ');

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

  return 'I can help with forex education, LHISKEY KICK TRADES platform information, packages, safe showcase items, strategy notes, bot/tool information, and support routing.';
}



/* ── LOCKED PRODUCTS + CLIENT ACCESS v14 ── */
async function loadPublicLockedProducts(){
  try{
    const { data, error } = await supabaseClient
      .from('locked_products')
      .select('id,title,product_type,status,price_label,short_description,preview_content,risk_level,disclaimer,cta_label,sort_order')
      .eq('is_public', true)
      .in('status', ['preview','locked','available'])
      .order('sort_order', { ascending:true })
      .order('created_at', { ascending:false })
      .limit(12);
    if(error){ console.warn('Locked products load error:', error.message); renderPublicLockedProducts([]); return; }
    publicLockedProductsCache = data || [];
    renderPublicLockedProducts(publicLockedProductsCache);
  }catch(err){ console.warn('Locked products failed:', err); renderPublicLockedProducts([]); }
}
function renderPublicLockedProducts(items){
  const container = document.getElementById('publicLockedProducts');
  if(!container) return;
  if(!items || !items.length){
    container.innerHTML = `<div class="locked-product-card fade-up visible"><span class="lock-badge">Coming Soon</span><h3>Locked products will appear here</h3><p>Admin will publish preview-only products here when ready. Full access remains locked until payment approval.</p></div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="locked-product-card fade-up visible">
      <div class="locked-top"><span class="lock-badge">${safePublicHTML(formatLockedStatus(item.status))}</span><strong>${safePublicHTML(String(item.product_type || 'package').toUpperCase())}</strong></div>
      <h3>${safePublicHTML(item.title || 'Locked Product')}</h3>
      <p>${safePublicHTML(item.short_description || '')}</p>
      <div class="preview-box">${safePublicHTML(item.preview_content || 'Preview details will be shared soon.')}</div>
      <div class="locked-meta"><span>Risk: ${safePublicHTML(String(item.risk_level || 'medium').toUpperCase())}</span><span>${safePublicHTML(item.price_label || 'Pricing will be communicated soon')}</span></div>
      <div class="showcase-disclaimer">${safePublicHTML(item.disclaimer || 'Educational/testing access only. Not financial advice.')}</div>
      <button class="btn-primary" onclick="startLockedProductAccess('${safeAttr(item.id || '')}', '${safeAttr(item.title || 'Locked Product')}')">${safePublicHTML(item.cta_label || 'Access Package')} →</button>
    </div>`).join('');
  document.querySelectorAll('.fade-up').forEach(el => { if(typeof observer !== 'undefined') observer.observe(el); });
}
function formatLockedStatus(status){
  return ({draft:'Draft', preview:'Preview Only', locked:'Locked', available:'Payment Required', paused:'Paused'})[status] || 'Locked';
}
function startLockedProductAccess(productId, title){
  const paymentRelated = document.getElementById('paymentRelatedInput');
  const accessTitle = title || 'Locked Product';
  if(paymentRelated) paymentRelated.value = accessTitle;
  const msg = document.getElementById('paymentProofMsg');
  if(msg){ msg.style.color = 'var(--muted)'; msg.textContent = `To access ${accessTitle}, make payment only after admin confirmation, then submit payment proof here. Admin approval unlocks access.`; }
  const paymentSection = document.getElementById('payments');
  if(paymentSection) paymentSection.scrollIntoView({ behavior:'smooth' });
}

function formatUnlockedHTML(value){
  return safePublicHTML(String(value || '').trim()).replace(/\n/g, '<br>');
}

function buildUnlockedAccessInstructions(access){
  const expiryText = access.expires_at ? new Date(access.expires_at).toLocaleString('en-KE') : 'No expiry set by admin.';
  return `
    <div class="access-instructions">
      <h4>How to use this access</h4>
      <ul>
        <li>Use this access for your own approved package only.</li>
        <li>Do not share your access code with another person or device.</li>
        <li>Keep your WhatsApp number and code safe for future access.</li>
        <li><strong>Expiry:</strong> ${safePublicHTML(expiryText)}</li>
      </ul>
    </div>
  `;
}

async function checkClientAccess(){
  const msg = document.getElementById('clientAccessMsg');
  const box = document.getElementById('clientUnlockedBox');
  const whatsapp = document.getElementById('accessWhatsappInput')?.value.trim();
  const access_code = document.getElementById('accessCodeInput')?.value.trim();
  if(!whatsapp || !access_code){ if(msg){ msg.style.color = 'var(--red)'; msg.textContent = 'WhatsApp number and access code are required.'; } return; }
  const device_hash = getOrCreateDeviceHash();
  const session_hash = getOrCreateAccessSessionHash();
  if(msg){ msg.style.color = 'var(--muted)'; msg.textContent = 'Checking access...'; }
  if(box){ box.classList.add('hidden'); box.innerHTML = ''; }
  try{
    const res = await fetch('/api/client-access', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ whatsapp, access_code, device_hash, session_hash }) });
    const result = await res.json();
    if(!res.ok || !result.ok) throw new Error(result.error || 'Access denied');
    const access = result.access || {};
    if(msg){ msg.style.color = 'var(--green)'; msg.textContent = 'Access unlocked successfully.'; }
    if(box){
      box.classList.remove('hidden');
      box.innerHTML = `
        <div class="unlock-success-head">
          <span>ACCESS ACTIVE</span>
          <h3>${safePublicHTML(access.product_title || 'Unlocked Access')}</h3>
        </div>
        <div class="access-summary-grid">
          <div><span>Client</span><strong>${safePublicHTML(access.client_name || '')}</strong></div>
          <div><span>Status</span><strong>${safePublicHTML(access.status || 'active')}</strong></div>
          <div><span>Access Type</span><strong>Private Release</strong></div>
        </div>
        ${buildUnlockedAccessInstructions(access)}
        <div class="unlocked-content">
          <h4>Unlocked Content</h4>
          <p>${formatUnlockedHTML(access.private_content || 'Admin has activated your access. Follow the delivery notes below.')}</p>
          ${access.private_link ? `<p><strong>Private Link:</strong> <a href="${safeAttr(access.private_link)}" target="_blank" rel="noopener noreferrer">Open private resource</a></p>` : ''}
          ${access.delivery_notes ? `<div class="delivery-note-box"><strong>Delivery Notes</strong><p>${formatUnlockedHTML(access.delivery_notes)}</p></div>` : ''}
        </div>
        <div class="payment-warning">${safePublicHTML(access.disclaimer || 'Educational/testing access only. Not financial advice. No guaranteed profits.')}</div>
      `;
    }
  }catch(err){ console.warn('Client access failed:', err); if(msg){ msg.style.color = 'var(--red)'; msg.textContent = err.message || 'Access denied. Contact admin.'; } }
}
function getOrCreateDeviceHash(){
  const key = 'lhiskey_device_hash';
  let value = localStorage.getItem(key);
  if(!value){ value = 'dev-' + cryptoRandomId(); localStorage.setItem(key, value); }
  return value;
}
function getOrCreateAccessSessionHash(){
  const key = 'lhiskey_access_session';
  let value = sessionStorage.getItem(key);
  if(!value){ value = 'sess-' + cryptoRandomId(); sessionStorage.setItem(key, value); }
  return value;
}
function cryptoRandomId(){
  if(window.crypto && window.crypto.getRandomValues){
    const arr = new Uint32Array(4);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(x => x.toString(16)).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}


/* ── PAYMENT PROOF v13 ── */
async function loadPublicPaymentSettings(){
  try{
    const { data, error } = await supabaseClient
      .from('site_settings')
      .select('value')
      .eq('key', 'payments')
      .single();

    publicPaymentSettings = error ? {} : (data?.value || {});
    renderPublicPaymentSettings();
  }catch(err){
    console.warn('Payment settings failed:', err);
    publicPaymentSettings = {};
    renderPublicPaymentSettings();
  }
}

function renderPublicPaymentSettings(){
  const box = document.getElementById('publicPaymentInstructions');
  if(!box) return;

  const p = publicPaymentSettings || {};
  const bankName = p.bank_name || 'To be communicated by admin';
  const accountName = p.account_name || 'LHISKEY KICK TRADES';
  const accountNumber = p.account_number || 'To be communicated by admin';
  const bankBranch = p.bank_branch || '';
  const paybill = p.mpesa_paybill || 'To be communicated by admin';
  const till = p.mpesa_till || 'To be communicated by admin';
  const mpesaAccount = p.mpesa_account_name || 'LHISKEY KICK TRADES';
  const instructions = p.instructions || 'Payment instructions are shared after admin confirms your request. Submit proof only after admin confirms what you are paying for.';

  box.innerHTML = `
    <div class="payment-detail-grid">
      <div><span>Bank</span><strong>${safePublicHTML(bankName)}</strong></div>
      <div><span>Account Name</span><strong>${safePublicHTML(accountName)}</strong></div>
      <div><span>Account Number</span><strong>${safePublicHTML(accountNumber)}</strong></div>
      ${bankBranch ? `<div><span>Branch</span><strong>${safePublicHTML(bankBranch)}</strong></div>` : ''}
      <div><span>M-Pesa PayBill</span><strong>${safePublicHTML(paybill)}</strong></div>
      <div><span>M-Pesa Till</span><strong>${safePublicHTML(till)}</strong></div>
      <div><span>M-Pesa Account Name</span><strong>${safePublicHTML(mpesaAccount)}</strong></div>
    </div>
    <p>${safePublicHTML(instructions)}</p>
  `;
}

async function submitPaymentProof(){
  const msg = document.getElementById('paymentProofMsg');
  const fileInput = document.getElementById('paymentProofFileInput');
  const file = fileInput?.files?.[0] || null;

  const payload = {
    name: document.getElementById('paymentNameInput')?.value.trim(),
    whatsapp: document.getElementById('paymentWhatsappInput')?.value.trim(),
    email: document.getElementById('paymentEmailInput')?.value.trim(),
    related_to: document.getElementById('paymentRelatedInput')?.value.trim(),
    amount_paid: document.getElementById('paymentAmountInput')?.value,
    currency: 'KES',
    payment_method: document.getElementById('paymentMethodInput')?.value || 'bank',
    payment_reference: document.getElementById('paymentReferenceInput')?.value.trim(),
    message: document.getElementById('paymentMessageInput')?.value.trim(),
    related_request_type: 'manual'
  };

  if(!payload.name || !payload.whatsapp || !payload.payment_reference){
    if(msg){
      msg.style.color = 'var(--red)';
      msg.textContent = 'Name, WhatsApp, and transaction/reference code are required.';
    }
    return;
  }

  if(file){
    const allowed = ['image/png','image/jpeg','image/jpg','image/webp','application/pdf'];
    if(!allowed.includes(file.type)){
      if(msg){
        msg.style.color = 'var(--red)';
        msg.textContent = 'Only PNG, JPG, WEBP, or PDF proof files are allowed.';
      }
      return;
    }

    if(file.size > 5 * 1024 * 1024){
      if(msg){
        msg.style.color = 'var(--red)';
        msg.textContent = 'Proof file is too large. Maximum allowed is 5 MB.';
      }
      return;
    }
  }

  if(msg){
    msg.style.color = 'var(--muted)';
    msg.textContent = file ? 'Uploading proof...' : 'Submitting payment proof...';
  }

  try{
    if(file){
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `proofs/${Date.now()}-${safeName}`;

      const upload = await supabaseClient.storage
        .from('payment-proofs')
        .upload(path, file, { upsert:false });

      if(upload.error) throw new Error(upload.error.message || 'Proof upload failed');

      payload.proof_file_name = file.name;
      payload.proof_file_path = path;
      payload.proof_file_type = file.type || 'unknown';
      payload.proof_file_size = file.size;
    }

    const res = await fetch('/api/payment-proof', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if(!res.ok || !result.ok) throw new Error(result.error || 'Payment proof save failed');

    if(msg){
      msg.style.color = 'var(--green)';
      msg.textContent = 'Payment proof submitted successfully. Admin will verify manually.';
    }

    [
      'paymentNameInput','paymentWhatsappInput','paymentEmailInput','paymentRelatedInput',
      'paymentAmountInput','paymentReferenceInput','paymentMessageInput'
    ].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });

    if(fileInput) fileInput.value = '';
  }catch(err){
    console.warn('Payment proof failed:', err);
    if(msg){
      msg.style.color = 'var(--red)';
      msg.textContent = 'Could not submit payment proof. Please contact admin on WhatsApp.';
    }
  }
}


document.addEventListener('DOMContentLoaded' , function(){
  loadCMSContent();
  loadPublishedStrategies();
  loadPublishedPackages();
  loadPublicShowcase();
  loadPublicPaymentSettings();
  loadPublicLockedProducts();
  loadAssistantSettings();

  const aiInput = document.getElementById('aiInput');
  if(aiInput){
    aiInput.addEventListener('keydown', function(event){
      if(event.key === 'Enter'){
        event.preventDefault();
        sendAssistantMessage();
      }
    });
  }
});





/* ── SAFE BOT & STRATEGY SHOWCASE v12 ── */
async function loadPublicShowcase(){
  try{
    const { data, error } = await supabaseClient
      .from('showcase_items')
      .select('id,title,item_type,status,risk_level,short_description,testing_notes,disclaimer,cta_label,sort_order')
      .eq('is_public', true)
      .order('sort_order', { ascending:true })
      .order('created_at', { ascending:false })
      .limit(12);

    if(error){
      console.warn('Showcase load error:', error.message);
      renderPublicShowcase([]);
      return;
    }

    publicShowcaseCache = data || [];
    renderPublicShowcase(publicShowcaseCache);
  }catch(err){
    console.warn('Showcase failed:', err);
    renderPublicShowcase([]);
  }
}

function renderPublicShowcase(items){
  const container = document.getElementById('publicShowcaseItems');
  if(!container) return;

  const fallback = [
    {
      id:'',
      title:'Gold Scalping Bot',
      item_type:'bot',
      status:'testing',
      risk_level:'high',
      short_description:'A planned XAUUSD trading assistant under testing for risk control, session filters, spread awareness, and safer execution logic.',
      testing_notes:'Not available for download. Internal testing only.',
      disclaimer:'Education/testing only. Not financial advice. No guaranteed profits.',
      cta_label:'Join Testing Waitlist'
    },
    {
      id:'',
      title:'SMC Liquidity Strategy',
      item_type:'strategy',
      status:'research',
      risk_level:'medium',
      short_description:'A research-stage strategy concept focused on liquidity sweeps, order blocks, FVGs, market structure, and risk-first planning.',
      testing_notes:'Full rules are not public until testing is complete.',
      disclaimer:'Education only. Not financial advice.',
      cta_label:'Request Info'
    }
  ];

  const list = items && items.length ? items : fallback;

  container.innerHTML = list.map(item => {
    const statusLabel = formatShowcaseStatus(item.status);
    const typeLabel = String(item.item_type || 'tool').toUpperCase();
    const riskLabel = String(item.risk_level || 'medium').toUpperCase();

    return `
      <div class="showcase-card fade-up visible">
        <div class="showcase-top">
          <span class="status-pill ${safeAttr(item.status || 'coming_soon')}">${safePublicHTML(statusLabel)}</span>
          <strong>${safePublicHTML(typeLabel)}</strong>
        </div>
        <h3>${safePublicHTML(item.title || 'Showcase Item')}</h3>
        <p>${safePublicHTML(item.short_description || '')}</p>
        <div class="showcase-meta">
          <span>Risk: ${safePublicHTML(riskLabel)}</span>
          <span>${safePublicHTML(item.testing_notes || 'Testing notes pending.')}</span>
        </div>
        <div class="showcase-disclaimer">${safePublicHTML(item.disclaimer || 'For education/testing only. Not financial advice.')}</div>
        <button class="btn-primary" onclick="selectEarlyAccess('${safeAttr(item.id || '')}', '${safeAttr(item.title || 'General Early Access')}', '${safeAttr(item.item_type || 'general')}')">
          ${safePublicHTML(item.cta_label || 'Request Early Access')} →
        </button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.fade-up').forEach(el => {
    if(typeof observer !== 'undefined') observer.observe(el);
  });
}

function formatShowcaseStatus(status){
  const map = {
    research:'Research Stage',
    testing:'In Testing',
    private_beta:'Private Beta',
    coming_soon:'Coming Soon',
    available_later:'Available Later',
    paused:'Paused'
  };
  return map[status] || 'Coming Soon';
}

function selectEarlyAccess(itemId, itemTitle, itemType){
  const idInput = document.getElementById('earlyShowcaseId');
  const titleInput = document.getElementById('earlyShowcaseTitle');
  const selected = document.getElementById('selectedShowcaseText');
  const interest = document.getElementById('earlyInterestInput');

  if(idInput) idInput.value = itemId || '';
  if(titleInput) titleInput.value = itemTitle || 'General Early Access';
  if(selected) selected.textContent = itemTitle || 'General Early Access';

  if(interest){
    const t = String(itemType || '').toLowerCase();
    if(t.includes('bot') || t.includes('tool')) interest.value = 'bot_info';
    else if(t.includes('strategy')) interest.value = 'strategy_info';
    else interest.value = 'early_access';
  }

  const section = document.getElementById('early-access');
  if(section) section.scrollIntoView({ behavior:'smooth' });
}

async function submitEarlyAccessRequest(){
  const msg = document.getElementById('earlyAccessMsg');

  const payload = {
    showcase_item_id: document.getElementById('earlyShowcaseId')?.value || null,
    item_title: document.getElementById('earlyShowcaseTitle')?.value || 'General Early Access',
    name: document.getElementById('earlyNameInput')?.value.trim(),
    whatsapp: document.getElementById('earlyWhatsappInput')?.value.trim(),
    email: document.getElementById('earlyEmailInput')?.value.trim(),
    experience_level: document.getElementById('earlyExperienceInput')?.value || 'beginner',
    interest_type: document.getElementById('earlyInterestInput')?.value || 'early_access',
    message: document.getElementById('earlyMessageInput')?.value.trim()
  };

  if(!payload.name || !payload.whatsapp || !payload.message){
    if(msg){
      msg.style.color = 'var(--red)';
      msg.textContent = 'Name, WhatsApp, and message are required.';
    }
    return;
  }

  if(msg){
    msg.style.color = 'var(--muted)';
    msg.textContent = 'Sending early access request...';
  }

  try{
    const res = await fetch('/api/early-access', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if(!res.ok || !result.ok){
      throw new Error(result.error || 'Request failed');
    }

    if(msg){
      msg.style.color = 'var(--green)';
      msg.textContent = 'Early access request sent. Admin will follow up.';
    }

    ['earlyNameInput','earlyWhatsappInput','earlyEmailInput','earlyMessageInput'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
  }catch(err){
    console.warn('Early access request failed:', err);
    if(msg){
      msg.style.color = 'var(--red)';
      msg.textContent = 'Could not send request. Please use WhatsApp or live chat.';
    }
  }
}


/* ── PUBLIC SERVICES / PACKAGES v11 ── */
async function loadPublishedPackages(){
  try{
    const { data, error } = await supabaseClient
      .from('service_packages')
      .select('id,title,category,price_label,description,features,button_label,sort_order')
      .eq('is_published', true)
      .order('sort_order', { ascending:true })
      .order('created_at', { ascending:false })
      .limit(12);

    if(error){
      console.warn('Packages load error:', error.message);
      renderPublicPackages([]);
      return;
    }

    publicPackagesCache = data || [];
    renderPublicPackages(publicPackagesCache);
  }catch(err){
    console.warn('Packages failed:', err);
    renderPublicPackages([]);
  }
}

function renderPublicPackages(packages){
  const container = document.getElementById('publicPackages');
  if(!container) return;

  const fallback = [
    {
      id:'',
      title:'Forex Beginner Guidance',
      category:'mentorship',
      price_label:'Request quote',
      description:'Beginner-friendly support for learning forex basics, risk management, market structure, and discipline.',
      features:['Forex basics','Risk-first trading','Market structure introduction'],
      button_label:'Request Guidance'
    },
    {
      id:'',
      title:'SMC / ICT Learning Pack',
      category:'education',
      price_label:'Request quote',
      description:'Educational support for liquidity, order blocks, fair value gaps, and structure-based analysis.',
      features:['Liquidity basics','Order blocks','Fair value gaps'],
      button_label:'Request Learning Pack'
    },
    {
      id:'',
      title:'Bot / Tool Access Request',
      category:'tools',
      price_label:'Contact admin',
      description:'Ask about available tools, bot documentation, setup support, and safe testing guidance.',
      features:['Tool information','Setup request','Testing guidance'],
      button_label:'Request Bot Info'
    }
  ];

  const list = packages && packages.length ? packages : fallback;

  container.innerHTML = list.map(pkg => {
    const features = Array.isArray(pkg.features) ? pkg.features : [];
    return `
      <div class="package-public-card fade-up visible">
        <div class="package-top">
          <span>${safePublicHTML(pkg.category || 'service')}</span>
          <strong>${safePublicHTML(pkg.price_label || 'Contact admin')}</strong>
        </div>
        <h3>${safePublicHTML(pkg.title || 'Service Package')}</h3>
        <p>${safePublicHTML(pkg.description || '')}</p>
        <ul>
          ${features.slice(0,5).map(f => `<li>${safePublicHTML(f)}</li>`).join('')}
        </ul>
        <button class="btn-primary" onclick="selectPackageRequest('${safeAttr(pkg.id || '')}', '${safeAttr(pkg.title || 'General Request')}', '${safeAttr(pkg.category || 'general')}')">
          ${safePublicHTML(pkg.button_label || 'Request Access')} →
        </button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.fade-up').forEach(el => {
    if(typeof observer !== 'undefined') observer.observe(el);
  });
}

function selectPackageRequest(packageId, packageName, requestType){
  const idInput = document.getElementById('clientPackageId');
  const nameInput = document.getElementById('clientPackageName');
  const selected = document.getElementById('selectedPackageText');
  const typeInput = document.getElementById('clientRequestTypeInput');

  if(idInput) idInput.value = packageId || '';
  if(nameInput) nameInput.value = packageName || 'General Request';
  if(selected) selected.textContent = packageName || 'General Request';
  if(typeInput && requestType) typeInput.value = mapPackageCategory(requestType);

  const section = document.getElementById('request');
  if(section) section.scrollIntoView({ behavior:'smooth' });
}

function mapPackageCategory(category){
  const c = String(category || '').toLowerCase();
  if(c.includes('mentor')) return 'mentorship';
  if(c.includes('strategy')) return 'strategy';
  if(c.includes('tool') || c.includes('bot')) return 'bot';
  if(c.includes('consult')) return 'consultation';
  return 'general';
}

async function submitClientRequest(){
  const msg = document.getElementById('clientRequestMsg');

  const payload = {
    package_id: document.getElementById('clientPackageId')?.value || null,
    package_name: document.getElementById('clientPackageName')?.value || 'General Request',
    name: document.getElementById('clientNameInput')?.value.trim(),
    whatsapp: document.getElementById('clientWhatsappInput')?.value.trim(),
    email: document.getElementById('clientEmailInput')?.value.trim(),
    preferred_contact: document.getElementById('clientPreferredInput')?.value || 'whatsapp',
    request_type: document.getElementById('clientRequestTypeInput')?.value || 'general',
    budget_range: document.getElementById('clientBudgetInput')?.value.trim(),
    message: document.getElementById('clientMessageInput')?.value.trim()
  };

  if(!payload.name || !payload.whatsapp || !payload.message){
    if(msg){
      msg.style.color = 'var(--red)';
      msg.textContent = 'Name, WhatsApp, and message are required.';
    }
    return;
  }

  if(msg){
    msg.style.color = 'var(--muted)';
    msg.textContent = 'Sending request...';
  }

  try{
    const res = await fetch('/api/client-request', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if(!res.ok || !result.ok){
      throw new Error(result.error || 'Request failed');
    }

    if(msg){
      msg.style.color = 'var(--green)';
      msg.textContent = 'Request sent successfully. The admin team will follow up.';
    }

    ['clientNameInput','clientWhatsappInput','clientEmailInput','clientBudgetInput','clientMessageInput'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
  }catch(err){
    console.warn('Client request failed:', err);
    if(msg){
      msg.style.color = 'var(--red)';
      msg.textContent = 'Could not send request. Please use WhatsApp or live chat.';
    }
  }
}

function safePublicHTML(value){
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function safeAttr(value){
  return safePublicHTML(value).replaceAll('\n',' ');
}


// ── LEAD CAPTURE FORM AFTER HANDOFF
function renderLeadCaptureForm(handoff){
  const messages = document.getElementById('aiMessages');
  if(!messages) return;

  const existingForm = document.querySelector('.ai-lead-form');
  if(existingForm){
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  const phone = handoff.whatsapp || (cmsContacts && cmsContacts.whatsapp1) || '+254113881279';
  const waLink = phoneToWaLink(phone);

  const wrapper = document.createElement('div');
  wrapper.className = 'ai-lead-form';
  wrapper.innerHTML = `
    <div class="lead-title">Request Live Support</div>
    <input id="leadName" type="text" placeholder="Your name"/>
    <input id="leadWhatsapp" type="text" placeholder="WhatsApp number"/>
    <input id="leadEmail" type="email" placeholder="Email address optional"/>
    <select id="leadPreferred">
      <option value="whatsapp">Prefer WhatsApp</option>
      <option value="email">Prefer Email</option>
      <option value="call">Prefer Call</option>
    </select>
    <textarea id="leadMessage" placeholder="Briefly explain what you need help with..."></textarea>
    <button onclick="submitLeadForm('${escapeAttr(handoff.reason || 'Live support request')}', '${escapeAttr(handoff.urgency || 'medium')}')">Send Request</button>
    <a href="${waLink}" target="_blank">Open WhatsApp Now</a>
    <p id="leadFormMsg"></p>
  `;

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

async function submitLeadForm(reason, urgency){
  const msg = document.getElementById('leadFormMsg');
  const payload = {
    name: document.getElementById('leadName')?.value.trim(),
    whatsapp: document.getElementById('leadWhatsapp')?.value.trim(),
    email: document.getElementById('leadEmail')?.value.trim(),
    preferred_contact: document.getElementById('leadPreferred')?.value,
    message: document.getElementById('leadMessage')?.value.trim(),
    reason,
    urgency,
    session_id: currentChatSessionId
  };

  if(!payload.name || !payload.whatsapp || !payload.message){
    if(msg) msg.textContent = 'Name, WhatsApp, and message are required.';
    return;
  }

  if(msg) msg.textContent = 'Sending request...';

  try{
    const response = await fetch('/api/lead', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if(!response.ok || !result.ok){
      throw new Error(result.error || 'Lead request failed');
    }

    if(msg) msg.textContent = 'Request sent. Keep this chat open — admin can reply here too.';
    addAssistantMessage('Your support request has been saved. Keep this chat open — admin can reply directly here, and can also follow up through your preferred contact method.', 'bot');
    startLiveChatPolling();
  }catch(error){
    if(msg) msg.textContent = 'Could not send request. Please use WhatsApp directly.';
    console.warn('Lead form failed:', error);
  }
}

function escapeAttr(value){
  return String(value || '').replaceAll("'", '&#039;').replaceAll('"', '&quot;');
}



// ── CHAT RESET / NEW VISITOR SESSION
function resetAssistantChat(){
  localStorage.removeItem('lhiskey_chat_session_id');
  localStorage.removeItem('lhiskey_chat_last_id');
  currentChatSessionId = null;
  liveChatLastMessageId = 0;

  if(liveChatPollTimer){
    clearInterval(liveChatPollTimer);
    liveChatPollTimer = null;
  }

  const messages = document.getElementById('aiMessages');
  if(messages){
    messages.innerHTML = `
      <div class="ai-msg bot" id="assistantWelcome">
        ${assistantConfig.welcome_message || 'Hello, welcome to LHISKEY KICK TRADES. How can I help you today?'}
      </div>
    `;
  }
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

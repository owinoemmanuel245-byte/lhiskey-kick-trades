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
const pairs = [
  {p:'XAUUSD',v:'2,341.40',c:'+0.34%',up:true},
  {p:'GBPJPY',v:'196.840',c:'+0.18%',up:true},
  {p:'EURUSD',v:'1.08421',c:'-0.09%',up:false},
  {p:'USDJPY',v:'151.220',c:'+0.22%',up:true},
  {p:'GBPUSD',v:'1.27650',c:'+0.15%',up:true},
  {p:'US30',v:'39,241',c:'-0.41%',up:false},
  {p:'BTCUSD',v:'68,420',c:'+1.23%',up:true},
  {p:'AUDCAD',v:'0.89340',c:'-0.07%',up:false},
  {p:'USDCHF',v:'0.90120',c:'+0.11%',up:true},
  {p:'NZDUSD',v:'0.60980',c:'-0.14%',up:false},
];
function buildTicker(){
  const t=document.getElementById('ticker');
  const all=[...pairs,...pairs];
  t.innerHTML=all.map(i=>`
    <span class="ticker-item">
      <span class="ticker-pair">${i.p}</span>
      <span class="ticker-price">${i.v}</span>
      <span class="${i.up?'tick-up':'tick-dn'}">${i.c}</span>
    </span>
  `).join('');
}
buildTicker();

// ── LIVE PRICE WOBBLE
function wobble(){
  document.querySelectorAll('.ticker-price').forEach((el,i)=>{
    const base=parseFloat(el.textContent.replace(',',''));
    const delta=(Math.random()-.5)*0.002*base;
    const newVal=base+delta;
    el.textContent=base>1000?newVal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):newVal.toFixed(5);
  });
}
setInterval(wobble,2800);

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

    if(!response.ok || !result.reply){
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

    thinkingMessage.textContent = result.reply;
    aiConversationHistory.push({ role:'assistant', content: result.reply });
    aiConversationHistory = aiConversationHistory.slice(-10);

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
  const q = question.toLowerCase();
  const c = cmsContacts || {};
  const w1 = c.whatsapp1 || '+254113881279';
  const email = c.email || 'owinoemmanuel245@gmail.com';

  if(q.includes('whatsapp') || q.includes('phone') || q.includes('contact') || q.includes('call')){
    return `You can contact LHISKEY KICK TRADES on WhatsApp: ${formatPhoneForDisplay(w1)} or email: ${email}.`;
  }

  if(q.includes('email') || q.includes('mail')){
    return `Our official email is ${email}.`;
  }

  if(q.includes('facebook')){
    return `You can find our Facebook page through the Facebook link in the contact section.`;
  }

  if(q.includes('instagram') || q.includes('ig')){
    return `You can find our Instagram through the Instagram link in the contact section.`;
  }

  if(q.includes('strategy') || q.includes('strategies') || q.includes('setup')){
    if(publicStrategiesCache.length > 0){
      const titles = publicStrategiesCache.slice(0,4).map(s => s.title).join(', ');
      return `Published strategies currently include: ${titles}. Scroll to the Strategies section to view them.`;
    }
    return `No public strategies are published yet. The admin can add strategies from the dashboard, then they will appear on this site.`;
  }

  if(q.includes('gold') || q.includes('xau') || q.includes('forex') || q.includes('trade') || q.includes('risk')){
    return `LHISKEY KICK TRADES focuses on price action, market structure, liquidity, supply and demand, and risk-first trading. We do not promise guaranteed profits. Always manage risk before entering any trade.`;
  }

  if(q.includes('live agent') || q.includes('agent') || q.includes('available')){
    return assistantConfig.fallback_message + ` You can also reach us on WhatsApp: ${formatPhoneForDisplay(w1)}.`;
  }

  return assistantConfig.fallback_message || `A live agent is not available right now. Leave your contact details or use WhatsApp: ${formatPhoneForDisplay(w1)}.`;
}

document.addEventListener('DOMContentLoaded', function(){
  loadCMSContent();
  loadPublishedStrategies();
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

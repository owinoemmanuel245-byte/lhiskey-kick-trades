/*
  LHISKEY KICK TRADES
  Main JavaScript file.
  Handles ticker, scroll animations, and Supabase watchlist signup.
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
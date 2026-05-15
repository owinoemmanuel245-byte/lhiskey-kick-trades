/* LHISKEY KICK TRADES — Admin dashboard JavaScript */

const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let watchlistData = [];
const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginMessage = document.getElementById('loginMessage');
const dashboardMessage = document.getElementById('dashboardMessage');

async function checkSession(){
  const { data } = await supabaseClient.auth.getSession();
  if(data.session){showDashboard();await loadWatchlist();} else {showLogin();}
}
function showLogin(){loginPanel.classList.remove('hidden');dashboardPanel.classList.add('hidden');}
function showDashboard(){loginPanel.classList.add('hidden');dashboardPanel.classList.remove('hidden');}

async function loginAdmin(){
  const email = document.getElementById('adminEmail').value.trim().toLowerCase();
  const password = document.getElementById('adminPassword').value;
  const btn = document.getElementById('loginBtn');
  loginMessage.textContent = '';loginMessage.style.color = 'var(--muted)';
  if(!email || !password){loginMessage.style.color='var(--red)';loginMessage.textContent='Enter both email and password.';return;}
  btn.disabled = true;btn.textContent = 'Logging in...';
  const { data, error } = await supabaseClient.auth.signInWithPassword({email,password});
  btn.disabled = false;btn.textContent = 'Login';
  if(error){loginMessage.style.color='var(--red)';loginMessage.textContent=error.message;return;}
  if(data.session){showDashboard();await loadWatchlist();}
}

async function logoutAdmin(){await supabaseClient.auth.signOut();watchlistData=[];showLogin();}

async function loadWatchlist(){
  dashboardMessage.style.color='var(--muted)';dashboardMessage.textContent='Loading watchlist...';
  const { data, error } = await supabaseClient.from('watchlist').select('id,email,source,created_at').order('created_at',{ascending:false});
  if(error){dashboardMessage.style.color='var(--red)';dashboardMessage.textContent='Failed to load watchlist: '+error.message;console.error(error);return;}
  watchlistData = data || [];renderWatchlist();dashboardMessage.style.color='var(--green)';dashboardMessage.textContent='Watchlist loaded successfully.';
}

function renderWatchlist(){
  const body = document.getElementById('watchlistBody');
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = watchlistData.filter(item => item.email.toLowerCase().includes(search));
  document.getElementById('totalCount').textContent = watchlistData.length;
  document.getElementById('latestSignup').textContent = watchlistData.length > 0 ? formatDate(watchlistData[0].created_at) : '—';
  if(filtered.length === 0){body.innerHTML = '<tr><td colspan="4">No emails found.</td></tr>';return;}
  body.innerHTML = filtered.map((item,index)=>`<tr><td>${index+1}</td><td>${escapeHTML(item.email)}</td><td>${escapeHTML(item.source || 'website')}</td><td>${formatDate(item.created_at)}</td></tr>`).join('');
}
function formatDate(value){if(!value)return '—';return new Date(value).toLocaleString('en-KE',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function escapeHTML(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");}

function downloadCSV(){
  if(watchlistData.length === 0){dashboardMessage.style.color='var(--red)';dashboardMessage.textContent='No data to download.';return;}
  const rows = [['id','email','source','created_at'], ...watchlistData.map(item => [item.id,item.email,item.source || '',item.created_at])];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');link.href=url;link.download='lhiskey-kick-trades-watchlist.csv';link.click();URL.revokeObjectURL(url);
}

document.getElementById('adminPassword').addEventListener('keydown', function(event){if(event.key === 'Enter'){event.preventDefault();loginAdmin();}});
checkSession();

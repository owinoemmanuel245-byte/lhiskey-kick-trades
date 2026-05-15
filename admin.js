/*
  LHISKEY KICK TRADES
  Admin CMS JavaScript.
*/

const SUPABASE_URL = "https://vwrsubmdecyvabktqtck.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let watchlistData = [];
let strategiesData = [];
let filesData = [];

const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const adminTabs = document.getElementById('adminTabs');
const loginMessage = document.getElementById('loginMessage');
const dashboardMessage = document.getElementById('dashboardMessage');

function showMessage(text, type='muted'){
  dashboardMessage.textContent = text;
  dashboardMessage.style.color = type === 'red' ? 'var(--red)' : type === 'green' ? 'var(--green)' : 'var(--muted)';
}

async function checkSession(){
  const { data } = await supabaseClient.auth.getSession();
  if(data.session){
    showDashboard();
    await bootstrapDashboard();
  }else{
    showLogin();
  }
}

function showLogin(){
  loginPanel.classList.remove('hidden');
  dashboardPanel.classList.add('hidden');
  adminTabs.classList.add('hidden');
}

function showDashboard(){
  loginPanel.classList.add('hidden');
  dashboardPanel.classList.remove('hidden');
  adminTabs.classList.remove('hidden');
}

async function loginAdmin(){
  const email = document.getElementById('adminEmail').value.trim().toLowerCase();
  const password = document.getElementById('adminPassword').value;
  const btn = document.getElementById('loginBtn');

  loginMessage.textContent = '';

  if(!email || !password){
    loginMessage.style.color = 'var(--red)';
    loginMessage.textContent = 'Enter both email and password.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Logging in...';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = 'Login';

  if(error){
    loginMessage.style.color = 'var(--red)';
    loginMessage.textContent = error.message;
    return;
  }

  if(data.session){
    showDashboard();
    await bootstrapDashboard();
  }
}

async function logoutAdmin(){
  await supabaseClient.auth.signOut();
  showLogin();
}

async function bootstrapDashboard(){
  await Promise.all([
    loadWatchlist(),
    loadSettings(),
    loadStrategies(),
    loadFiles(),
    loadAssistantSettings()
  ]);
}

function switchTab(name){
  document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const btns = Array.from(document.querySelectorAll('.tab'));
  const found = btns.find(btn => btn.textContent.toLowerCase().includes(name === 'content' ? 'homepage' : name));
  if(found) found.classList.add('active');

  const panel = document.getElementById('tab-' + name);
  if(panel) panel.classList.add('active');
}

/* WATCHLIST */
async function loadWatchlist(){
  const { data, error } = await supabaseClient
    .from('watchlist')
    .select('id,email,source,created_at')
    .order('created_at', { ascending:false });

  if(error){
    showMessage('Failed to load watchlist: ' + error.message, 'red');
    return;
  }

  watchlistData = data || [];
  renderWatchlist();
}

function renderWatchlist(){
  const body = document.getElementById('watchlistBody');
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = watchlistData.filter(item => item.email.toLowerCase().includes(search));

  document.getElementById('totalCount').textContent = watchlistData.length;
  document.getElementById('latestSignup').textContent = watchlistData[0] ? formatDate(watchlistData[0].created_at) : '—';

  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="4">No emails found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item,index)=>`
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.email)}</td>
      <td>${escapeHTML(item.source || 'website')}</td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `).join('');
}

function downloadCSV(){
  if(watchlistData.length === 0){
    showMessage('No watchlist data to download.', 'red');
    return;
  }

  const rows = [
    ['id','email','source','created_at'],
    ...watchlistData.map(item => [item.id,item.email,item.source || '',item.created_at])
  ];

  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lhiskey-kick-trades-watchlist.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/* SETTINGS */
async function loadSettings(){
  const { data, error } = await supabaseClient
    .from('site_settings')
    .select('key,value')
    .in('key',['homepage','contacts']);

  if(error){
    showMessage('Failed to load settings: ' + error.message, 'red');
    return;
  }

  const settings = {};
  (data || []).forEach(row => settings[row.key] = row.value || {});

  const h = settings.homepage || {};
  document.getElementById('heroTagInput').value = h.hero_tag || '';
  document.getElementById('heroLine1Input').value = h.hero_title_line1 || '';
  document.getElementById('heroHighlightInput').value = h.hero_title_highlight || '';
  document.getElementById('heroLine3Input').value = h.hero_title_line3 || '';
  document.getElementById('heroSubtitleInput').value = h.hero_subtitle || '';
  document.getElementById('primaryButtonInput').value = h.primary_button || '';
  document.getElementById('secondaryButtonInput').value = h.secondary_button || '';

  const c = settings.contacts || {};
  document.getElementById('whatsapp1Input').value = c.whatsapp1 || '';
  document.getElementById('whatsapp2Input').value = c.whatsapp2 || '';
  document.getElementById('whatsapp3Input').value = c.whatsapp3 || '';
  document.getElementById('emailInputAdmin').value = c.email || '';
  document.getElementById('facebookInput').value = c.facebook || '';
  document.getElementById('instagramInput').value = c.instagram || '';
}

async function saveHomepage(){
  const value = {
    hero_tag: document.getElementById('heroTagInput').value.trim(),
    hero_title_line1: document.getElementById('heroLine1Input').value.trim(),
    hero_title_highlight: document.getElementById('heroHighlightInput').value.trim(),
    hero_title_line3: document.getElementById('heroLine3Input').value.trim(),
    hero_subtitle: document.getElementById('heroSubtitleInput').value.trim(),
    primary_button: document.getElementById('primaryButtonInput').value.trim(),
    secondary_button: document.getElementById('secondaryButtonInput').value.trim()
  };

  const { error } = await supabaseClient
    .from('site_settings')
    .upsert({ key:'homepage', value, updated_at:new Date().toISOString() });

  if(error) return showMessage('Homepage save failed: ' + error.message, 'red');
  showMessage('Homepage saved. Refresh your live website to see changes.', 'green');
}

async function saveContacts(){
  const value = {
    whatsapp1: document.getElementById('whatsapp1Input').value.trim(),
    whatsapp2: document.getElementById('whatsapp2Input').value.trim(),
    whatsapp3: document.getElementById('whatsapp3Input').value.trim(),
    email: document.getElementById('emailInputAdmin').value.trim(),
    facebook: document.getElementById('facebookInput').value.trim(),
    instagram: document.getElementById('instagramInput').value.trim()
  };

  const { error } = await supabaseClient
    .from('site_settings')
    .upsert({ key:'contacts', value, updated_at:new Date().toISOString() });

  if(error) return showMessage('Contacts save failed: ' + error.message, 'red');
  showMessage('Contacts saved. Refresh your live website to see changes.', 'green');
}

/* STRATEGIES */
async function loadStrategies(){
  const { data, error } = await supabaseClient
    .from('strategies')
    .select('*')
    .order('created_at', { ascending:false });

  if(error){
    showMessage('Failed to load strategies: ' + error.message, 'red');
    return;
  }

  strategiesData = data || [];
  renderStrategies();
}

function renderStrategies(){
  const list = document.getElementById('strategyList');

  if(strategiesData.length === 0){
    list.innerHTML = '<p class="muted">No strategies added yet.</p>';
    return;
  }

  list.innerHTML = strategiesData.map(item => `
    <div class="mini-item">
      <h4>${escapeHTML(item.title)}</h4>
      <p>${escapeHTML(item.category || 'Forex')} · ${escapeHTML(item.timeframe || 'M15')} · ${item.is_published ? 'Published' : 'Draft'}</p>
      <p>${escapeHTML(item.description || '').slice(0,120)}</p>
      <div class="mini-actions">
        <button class="ghost-btn" onclick="editStrategy(${item.id})">Edit</button>
        <button class="ghost-btn" onclick="toggleStrategyPublish(${item.id}, ${item.is_published ? 'false' : 'true'})">${item.is_published ? 'Unpublish' : 'Publish'}</button>
        <button class="mini-danger" onclick="deleteStrategy(${item.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function editStrategy(id){
  const item = strategiesData.find(s => s.id === id);
  if(!item) return;

  document.getElementById('strategyIdInput').value = item.id;
  document.getElementById('strategyTitleInput').value = item.title || '';
  document.getElementById('strategyCategoryInput').value = item.category || '';
  document.getElementById('strategyTimeframeInput').value = item.timeframe || '';
  document.getElementById('strategyDescriptionInput').value = item.description || '';
  document.getElementById('strategyContentInput').value = item.content || '';
  document.getElementById('strategyPublishedInput').checked = !!item.is_published;

  showMessage('Strategy loaded for editing.', 'green');
}

async function saveStrategy(){
  const id = document.getElementById('strategyIdInput').value;
  const payload = {
    title: document.getElementById('strategyTitleInput').value.trim(),
    category: document.getElementById('strategyCategoryInput').value.trim(),
    timeframe: document.getElementById('strategyTimeframeInput').value.trim(),
    description: document.getElementById('strategyDescriptionInput').value.trim(),
    content: document.getElementById('strategyContentInput').value.trim(),
    is_published: document.getElementById('strategyPublishedInput').checked,
    updated_at: new Date().toISOString()
  };

  if(!payload.title){
    return showMessage('Strategy title is required.', 'red');
  }

  let result;
  if(id){
    result = await supabaseClient.from('strategies').update(payload).eq('id', id);
  }else{
    result = await supabaseClient.from('strategies').insert([payload]);
  }

  if(result.error) return showMessage('Strategy save failed: ' + result.error.message, 'red');

  clearStrategyForm();
  await loadStrategies();
  showMessage('Strategy saved successfully.', 'green');
}

function clearStrategyForm(){
  document.getElementById('strategyIdInput').value = '';
  document.getElementById('strategyTitleInput').value = '';
  document.getElementById('strategyCategoryInput').value = 'Forex';
  document.getElementById('strategyTimeframeInput').value = 'M15';
  document.getElementById('strategyDescriptionInput').value = '';
  document.getElementById('strategyContentInput').value = '';
  document.getElementById('strategyPublishedInput').checked = false;
}

async function toggleStrategyPublish(id, status){
  const { error } = await supabaseClient
    .from('strategies')
    .update({ is_published: status, updated_at:new Date().toISOString() })
    .eq('id', id);

  if(error) return showMessage('Publish update failed: ' + error.message, 'red');
  await loadStrategies();
  showMessage('Strategy publish status updated.', 'green');
}

async function deleteStrategy(id){
  if(!confirm('Delete this strategy?')) return;

  const { error } = await supabaseClient.from('strategies').delete().eq('id', id);
  if(error) return showMessage('Delete failed: ' + error.message, 'red');

  await loadStrategies();
  showMessage('Strategy deleted.', 'green');
}

/* FILES */
async function loadFiles(){
  const { data, error } = await supabaseClient
    .from('bot_files')
    .select('*')
    .order('created_at', { ascending:false });

  if(error){
    showMessage('Failed to load files: ' + error.message, 'red');
    return;
  }

  filesData = data || [];
  renderFiles();
}

function renderFiles(){
  const list = document.getElementById('fileList');

  if(filesData.length === 0){
    list.innerHTML = '<p class="muted">No files uploaded yet.</p>';
    return;
  }

  list.innerHTML = filesData.map(item => `
    <div class="mini-item">
      <h4>${escapeHTML(item.file_name)}</h4>
      <p>${escapeHTML(item.category || 'file')} · ${formatBytes(item.file_size || 0)} · ${formatDate(item.created_at)}</p>
      <p>${escapeHTML(item.notes || '').slice(0,140)}</p>
      <div class="mini-actions">
        <button class="ghost-btn" onclick="openSignedFile('${escapeJS(item.file_path)}')">Open</button>
        <button class="mini-danger" onclick="deleteBotFile(${item.id}, '${escapeJS(item.file_path)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function uploadBotFile(){
  const fileInput = document.getElementById('botFileInput');
  const file = fileInput.files[0];

  if(!file) return showMessage('Choose a file first.', 'red');

  const category = document.getElementById('fileCategoryInput').value;
  const notes = document.getElementById('fileNotesInput').value.trim();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path = `${category}/${Date.now()}-${safeName}`;

  showMessage('Uploading file...', 'muted');

  const upload = await supabaseClient.storage
    .from('lhiskey-files')
    .upload(path, file, { upsert:false });

  if(upload.error){
    return showMessage('Upload failed: ' + upload.error.message, 'red');
  }

  const insert = await supabaseClient.from('bot_files').insert([{
    file_name: file.name,
    file_path: path,
    file_type: file.type || 'unknown',
    file_size: file.size,
    category,
    notes
  }]);

  if(insert.error) return showMessage('File uploaded but database save failed: ' + insert.error.message, 'red');

  fileInput.value = '';
  document.getElementById('fileNotesInput').value = '';
  await loadFiles();
  showMessage('File uploaded successfully.', 'green');
}

async function openSignedFile(path){
  const { data, error } = await supabaseClient.storage
    .from('lhiskey-files')
    .createSignedUrl(path, 60);

  if(error) return showMessage('Could not open file: ' + error.message, 'red');
  window.open(data.signedUrl, '_blank');
}

async function deleteBotFile(id, path){
  if(!confirm('Delete this uploaded file?')) return;

  await supabaseClient.storage.from('lhiskey-files').remove([path]);
  const { error } = await supabaseClient.from('bot_files').delete().eq('id', id);

  if(error) return showMessage('Delete failed: ' + error.message, 'red');

  await loadFiles();
  showMessage('File deleted.', 'green');
}

/* ASSISTANT */
async function loadAssistantSettings(){
  const { data, error } = await supabaseClient
    .from('ai_assistant_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if(error){
    showMessage('Failed to load assistant settings: ' + error.message, 'red');
    return;
  }

  document.getElementById('assistantNameInput').value = data.assistant_name || '';
  document.getElementById('assistantStatusInput').value = data.status || 'offline';
  document.getElementById('welcomeMessageInput').value = data.welcome_message || '';
  document.getElementById('fallbackMessageInput').value = data.fallback_message || '';
  document.getElementById('systemPromptInput').value = data.system_prompt || '';
}

async function saveAssistantSettings(){
  const payload = {
    id: 1,
    assistant_name: document.getElementById('assistantNameInput').value.trim(),
    status: document.getElementById('assistantStatusInput').value,
    welcome_message: document.getElementById('welcomeMessageInput').value.trim(),
    fallback_message: document.getElementById('fallbackMessageInput').value.trim(),
    system_prompt: document.getElementById('systemPromptInput').value.trim(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from('ai_assistant_settings')
    .upsert(payload);

  if(error) return showMessage('Assistant save failed: ' + error.message, 'red');
  showMessage('Assistant settings saved. Refresh the live website.', 'green');
}

/* HELPERS */
function formatDate(value){
  if(!value) return '—';
  return new Date(value).toLocaleString('en-KE', {
    year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'
  });
}

function formatBytes(bytes){
  if(!bytes) return '0 B';
  const sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024,i)).toFixed(1) + ' ' + sizes[i];
}

function escapeHTML(value){
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function escapeJS(value){
  return String(value ?? '').replaceAll('\\','\\\\').replaceAll("'","\\'");
}

document.getElementById('adminPassword').addEventListener('keydown', function(event){
  if(event.key === 'Enter'){
    event.preventDefault();
    loginAdmin();
  }
});

checkSession();

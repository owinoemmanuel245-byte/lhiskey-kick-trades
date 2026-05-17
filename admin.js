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
let handoffsData = [];
let leadsData = [];
let knowledgeData = [];
let packagesData = [];
let clientRequestsData = [];
let liveChatSessions = [];
let selectedLiveSessionId = null;
let liveChatMessagesCache = [];
let currentChatFilter = 'open';
let liveChatMessagesTimer = null;

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
    loadAssistantSettings(),
    loadHandoffs(),
    loadKnowledge(),
    loadPackages(),
    loadClientRequests(),
    loadLeads(),
    loadLiveChats()
  ]);
}

function switchTab(name){
  document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const found = document.querySelector(`.tab[data-tab="${name}"]`);
  if(found) found.classList.add('active');

  const panel = document.getElementById('tab-' + name);
  if(panel) panel.classList.add('active');

  if(name === 'livechat') loadLiveChats();
  if(name === 'packages') loadPackages();
  if(name === 'clientrequests') loadClientRequests();
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



/* KNOWLEDGE BASE */
async function loadKnowledge(){
  const list = document.getElementById('knowledgeList');
  if(list) list.innerHTML = '<p class="muted">Loading knowledge...</p>';

  const { data, error } = await supabaseClient
    .from('knowledge_base')
    .select('*')
    .order('updated_at', { ascending:false });

  if(error){
    if(list) list.innerHTML = '<p class="muted">Knowledge table not ready or access blocked.</p>';
    return;
  }

  knowledgeData = data || [];
  renderKnowledge();
}

function renderKnowledge(){
  const list = document.getElementById('knowledgeList');
  if(!list) return;

  if(knowledgeData.length === 0){
    list.innerHTML = '<p class="muted">No knowledge entries added yet.</p>';
    return;
  }

  list.innerHTML = knowledgeData.map(item => `
    <div class="mini-item">
      <h4>${escapeHTML(item.title || 'Untitled')}</h4>
      <p>${escapeHTML(item.category || 'other')} · ${item.is_active ? 'Active' : 'Inactive'} · ${formatDate(item.updated_at || item.created_at)}</p>
      <p>${escapeHTML(item.content || '').slice(0,150)}</p>
      <div class="mini-actions">
        <button class="ghost-btn" onclick="editKnowledge(${item.id})">Edit</button>
        <button class="ghost-btn" onclick="toggleKnowledge(${item.id}, ${item.is_active ? 'false' : 'true'})">${item.is_active ? 'Deactivate' : 'Activate'}</button>
        <button class="mini-danger" onclick="deleteKnowledge(${item.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function editKnowledge(id){
  const item = knowledgeData.find(k => k.id === id);
  if(!item) return;

  document.getElementById('knowledgeIdInput').value = item.id;
  document.getElementById('knowledgeTitleInput').value = item.title || '';
  document.getElementById('knowledgeCategoryInput').value = item.category || 'other';
  document.getElementById('knowledgeTagsInput').value = Array.isArray(item.tags) ? item.tags.join(', ') : '';
  document.getElementById('knowledgeContentInput').value = item.content || '';
  document.getElementById('knowledgeActiveInput').checked = !!item.is_active;

  showMessage('Knowledge loaded for editing.', 'green');
}

async function saveKnowledge(){
  const id = document.getElementById('knowledgeIdInput').value;
  const title = document.getElementById('knowledgeTitleInput').value.trim();
  const category = document.getElementById('knowledgeCategoryInput').value;
  const tags = document.getElementById('knowledgeTagsInput').value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
  const content = document.getElementById('knowledgeContentInput').value.trim();
  const is_active = document.getElementById('knowledgeActiveInput').checked;

  if(!title || !content){
    return showMessage('Knowledge title and content are required.', 'red');
  }

  const payload = { title, category, tags, content, is_active, updated_at: new Date().toISOString() };

  let result;
  if(id){
    result = await supabaseClient.from('knowledge_base').update(payload).eq('id', id);
  }else{
    result = await supabaseClient.from('knowledge_base').insert([payload]);
  }

  if(result.error) return showMessage('Knowledge save failed: ' + result.error.message, 'red');

  clearKnowledgeForm();
  await loadKnowledge();
  showMessage('Knowledge saved. The AI assistant can now use it.', 'green');
}

function clearKnowledgeForm(){
  document.getElementById('knowledgeIdInput').value = '';
  document.getElementById('knowledgeTitleInput').value = '';
  document.getElementById('knowledgeCategoryInput').value = 'faq';
  document.getElementById('knowledgeTagsInput').value = '';
  document.getElementById('knowledgeContentInput').value = '';
  document.getElementById('knowledgeActiveInput').checked = true;
}

async function toggleKnowledge(id, status){
  const { error } = await supabaseClient
    .from('knowledge_base')
    .update({ is_active: status, updated_at:new Date().toISOString() })
    .eq('id', id);

  if(error) return showMessage('Knowledge status update failed: ' + error.message, 'red');

  await loadKnowledge();
  showMessage('Knowledge status updated.', 'green');
}

async function deleteKnowledge(id){
  if(!confirm('Delete this knowledge entry?')) return;

  const { error } = await supabaseClient.from('knowledge_base').delete().eq('id', id);
  if(error) return showMessage('Knowledge delete failed: ' + error.message, 'red');

  await loadKnowledge();
  showMessage('Knowledge deleted.', 'green');
}




/* SALES PACKAGES v11 */
async function loadPackages(){
  const list = document.getElementById('packageList');
  if(list) list.innerHTML = '<p class="muted">Loading packages...</p>';

  const { data, error } = await supabaseClient
    .from('service_packages')
    .select('*')
    .order('sort_order', { ascending:true })
    .order('created_at', { ascending:false });

  if(error){
    if(list) list.innerHTML = '<p class="muted">Packages table not ready or access blocked.</p>';
    return;
  }

  packagesData = data || [];
  renderPackages();
}

function renderPackages(){
  const list = document.getElementById('packageList');
  if(!list) return;

  if(packagesData.length === 0){
    list.innerHTML = '<p class="muted">No packages added yet.</p>';
    return;
  }

  list.innerHTML = packagesData.map(item => `
    <div class="mini-item">
      <h4>${escapeHTML(item.title || 'Untitled Package')}</h4>
      <p>${escapeHTML(item.category || 'service')} · ${escapeHTML(item.price_label || 'Contact admin')} · ${item.is_published ? 'Published' : 'Draft'}</p>
      <p>${escapeHTML(String(item.description || '').slice(0, 150))}</p>
      <div class="mini-actions">
        <button class="ghost-btn" onclick="editPackage(${item.id})">Edit</button>
        <button class="ghost-btn" onclick="togglePackagePublish(${item.id}, ${item.is_published ? 'false' : 'true'})">${item.is_published ? 'Unpublish' : 'Publish'}</button>
        <button class="mini-danger" onclick="deletePackage(${item.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function editPackage(id){
  const item = packagesData.find(p => p.id === id);
  if(!item) return;

  document.getElementById('packageIdInput').value = item.id;
  document.getElementById('packageTitleInput').value = item.title || '';
  document.getElementById('packageCategoryInput').value = item.category || 'service';
  document.getElementById('packagePriceInput').value = item.price_label || '';
  document.getElementById('packageDescriptionInput').value = item.description || '';
  document.getElementById('packageFeaturesInput').value = Array.isArray(item.features) ? item.features.join('\n') : '';
  document.getElementById('packageButtonInput').value = item.button_label || 'Request Access';
  document.getElementById('packageSortInput').value = item.sort_order || 100;
  document.getElementById('packagePublishedInput').checked = !!item.is_published;

  showMessage('Package loaded for editing.', 'green');
}

async function savePackage(){
  const id = document.getElementById('packageIdInput')?.value;
  const title = document.getElementById('packageTitleInput')?.value.trim();
  const description = document.getElementById('packageDescriptionInput')?.value.trim();

  if(!title || !description){
    showMessage('Package title and description are required.', 'red');
    return;
  }

  const features = (document.getElementById('packageFeaturesInput')?.value || '')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);

  const payload = {
    title,
    slug: slugify(title),
    category: document.getElementById('packageCategoryInput')?.value.trim() || 'service',
    price_label: document.getElementById('packagePriceInput')?.value.trim() || 'Contact admin',
    description,
    features,
    button_label: document.getElementById('packageButtonInput')?.value.trim() || 'Request Access',
    sort_order: Number(document.getElementById('packageSortInput')?.value || 100),
    is_published: !!document.getElementById('packagePublishedInput')?.checked,
    updated_at: new Date().toISOString()
  };

  const result = id
    ? await supabaseClient.from('service_packages').update(payload).eq('id', id)
    : await supabaseClient.from('service_packages').insert([payload]);

  if(result.error){
    showMessage('Package save failed: ' + result.error.message, 'red');
    return;
  }

  clearPackageForm();
  await loadPackages();
  showMessage('Package saved successfully.', 'green');
}

function clearPackageForm(){
  ['packageIdInput','packageTitleInput','packagePriceInput','packageDescriptionInput','packageFeaturesInput'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });

  const category = document.getElementById('packageCategoryInput');
  const button = document.getElementById('packageButtonInput');
  const sort = document.getElementById('packageSortInput');
  const published = document.getElementById('packagePublishedInput');

  if(category) category.value = 'service';
  if(button) button.value = 'Request Access';
  if(sort) sort.value = '100';
  if(published) published.checked = false;
}

async function togglePackagePublish(id, status){
  const { error } = await supabaseClient
    .from('service_packages')
    .update({ is_published: !!status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if(error){
    showMessage('Package publish update failed: ' + error.message, 'red');
    return;
  }

  await loadPackages();
  showMessage('Package publish status updated.', 'green');
}

async function deletePackage(id){
  if(!confirm('Delete this package?')) return;

  const { error } = await supabaseClient
    .from('service_packages')
    .delete()
    .eq('id', id);

  if(error){
    showMessage('Package delete failed: ' + error.message, 'red');
    return;
  }

  await loadPackages();
  showMessage('Package deleted.', 'green');
}

function slugify(value){
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) + '-' + Date.now().toString().slice(-5);
}

/* CLIENT REQUESTS v11 */
async function loadClientRequests(){
  const body = document.getElementById('clientRequestBody');
  if(body) body.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';

  const { data, error } = await supabaseClient
    .from('client_requests')
    .select('*')
    .order('created_at', { ascending:false })
    .limit(300);

  if(error){
    if(body) body.innerHTML = '<tr><td colspan="9">Client requests table not ready or access blocked.</td></tr>';
    return;
  }

  clientRequestsData = data || [];
  renderClientRequests();
}

function renderClientRequests(){
  const body = document.getElementById('clientRequestBody');
  if(!body) return;

  const search = (document.getElementById('clientRequestSearchInput')?.value || '').trim().toLowerCase();

  const filtered = clientRequestsData.filter(item =>
    [
      item.name, item.whatsapp, item.email, item.package_name,
      item.request_type, item.status, item.message, item.budget_range
    ].join(' ').toLowerCase().includes(search)
  );

  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="9">No client requests found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.name || '')}<br><small>${escapeHTML(item.email || '')}</small></td>
      <td>${escapeHTML(item.package_name || 'General Request')}</td>
      <td>${escapeHTML(item.whatsapp || '')}</td>
      <td>${escapeHTML(item.request_type || 'general')}</td>
      <td>${escapeHTML(item.status || 'new')}</td>
      <td>${escapeHTML(String(item.message || '').slice(0, 130))}</td>
      <td>${formatDate(item.created_at)}</td>
      <td>
        <div class="mini-actions">
          <button class="ghost-btn" onclick="openClientWhatsapp('${escapeJS(item.whatsapp || '')}', '${escapeJS(item.name || '')}')">WhatsApp</button>
          <button class="ghost-btn" onclick="updateClientRequestStatus(${item.id}, 'contacted')">Contacted</button>
          <button class="ghost-btn" onclick="updateClientRequestStatus(${item.id}, 'active')">Active</button>
          <button class="mini-danger" onclick="updateClientRequestStatus(${item.id}, 'closed')">Close</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function updateClientRequestStatus(id, status){
  const { error } = await supabaseClient
    .from('client_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if(error){
    showMessage('Client request status failed: ' + error.message, 'red');
    return;
  }

  await loadClientRequests();
  showMessage('Client request status updated.', 'green');
}

function openClientWhatsapp(phone, name){
  const clean = String(phone || '').replace(/[^\d]/g, '');
  if(!clean){
    showMessage('No WhatsApp number found for this client.', 'red');
    return;
  }

  const text = encodeURIComponent(`Hello ${name || ''}, this is Emmanuel from LHISKEY KICK TRADES. I received your request and I am following up.`);
  window.open(`https://wa.me/${clean}?text=${text}`, '_blank');
}

function downloadClientRequestsCSV(){
  if(!clientRequestsData || clientRequestsData.length === 0){
    showMessage('No client request data to download.', 'red');
    return;
  }

  const rows = [
    ['id','name','whatsapp','email','package_name','request_type','budget_range','status','message','created_at'],
    ...clientRequestsData.map(i => [
      i.id, i.name || '', i.whatsapp || '', i.email || '', i.package_name || '',
      i.request_type || '', i.budget_range || '', i.status || '', i.message || '', i.created_at || ''
    ])
  ];

  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lhiskey-kick-trades-client-requests.csv';
  link.click();
  URL.revokeObjectURL(url);
}


/* VISITOR LEADS */
async function loadLeads(){
  const body = document.getElementById('leadBody');
  if(body) body.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';

  const { data, error } = await supabaseClient
    .from('visitor_leads')
    .select('*')
    .order('created_at', { ascending:false })
    .limit(200);

  if(error){
    if(body) body.innerHTML = '<tr><td colspan="8">Leads table not ready or access blocked.</td></tr>';
    return;
  }

  leadsData = data || [];
  renderLeads();
}

function renderLeads(){
  const body = document.getElementById('leadBody');
  if(!body) return;

  const input = document.getElementById('leadSearchInput');
  const search = input ? input.value.trim().toLowerCase() : '';

  const filtered = leadsData.filter(item =>
    String(item.name || '').toLowerCase().includes(search) ||
    String(item.whatsapp || '').toLowerCase().includes(search) ||
    String(item.email || '').toLowerCase().includes(search) ||
    String(item.reason || '').toLowerCase().includes(search) ||
    String(item.message || '').toLowerCase().includes(search)
  );

  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="8">No leads found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item,index)=>`
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.name || '')}</td>
      <td>${escapeHTML(item.whatsapp || '')}</td>
      <td>${escapeHTML(item.email || '')}</td>
      <td>${escapeHTML(item.reason || '').slice(0,90)}</td>
      <td>${escapeHTML(item.urgency || 'medium')}</td>
      <td>${escapeHTML(item.status || 'new')}</td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `).join('');
}

function downloadLeadsCSV(){
  if(!leadsData || leadsData.length === 0){
    showMessage('No leads to download.', 'red');
    return;
  }

  const rows = [
    ['id','name','whatsapp','email','preferred_contact','reason','urgency','message','status','created_at'],
    ...leadsData.map(item => [
      item.id,
      item.name || '',
      item.whatsapp || '',
      item.email || '',
      item.preferred_contact || '',
      item.reason || '',
      item.urgency || '',
      item.message || '',
      item.status || '',
      item.created_at || ''
    ])
  ];

  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lhiskey-kick-trades-leads.csv';
  link.click();
  URL.revokeObjectURL(url);
}


/* SUPPORT INBOX MODE */
async function loadLiveChats(){
  const list = document.getElementById('liveSessionList');
  if(list) list.innerHTML = '<p class="muted">Loading sessions...</p>';

  const { data: sessions, error } = await supabaseClient
    .from('chat_sessions')
    .select('*')
    .order('updated_at', { ascending:false })
    .limit(200);

  if(error){
    if(list) list.innerHTML = '<p class="muted">Live chat tables not ready or access blocked.</p>';
    return;
  }

  liveChatSessions = sessions || [];

  const { data: messages } = await supabaseClient
    .from('chat_messages')
    .select('*')
    .order('id', { ascending:false })
    .limit(500);

  liveChatMessagesCache = messages || [];

  enrichLiveSessions();
  renderLiveSessions();

  if(selectedLiveSessionId){
    await loadLiveMessages();
  }
}

function enrichLiveSessions(){
  liveChatSessions = liveChatSessions.map(session => {
    const msgs = liveChatMessagesCache
      .filter(m => m.session_id === session.id)
      .sort((a,b) => Number(b.id) - Number(a.id));

    const latest = msgs[0] || null;
    const latestAdmin = msgs.find(m => m.author_type === 'admin') || null;

    const needsReply =
      session.status !== 'closed' &&
      latest &&
      (latest.author_type === 'visitor' || latest.author_type === 'system') &&
      (!latestAdmin || Number(latest.id) > Number(latestAdmin.id));

    return { ...session, _latest: latest, _needsReply: !!needsReply };
  });

  liveChatSessions.sort((a,b) => {
    if(a._needsReply !== b._needsReply) return a._needsReply ? -1 : 1;
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });
}

function setChatFilter(filter){
  currentChatFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  const active = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
  if(active) active.classList.add('active');
  renderLiveSessions();
}

function renderLiveSessions(){
  const list = document.getElementById('liveSessionList');
  if(!list) return;

  const searchInput = document.getElementById('liveSearchInput');
  const search = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let filtered = liveChatSessions.filter(session => {
    if(currentChatFilter === 'open') return session.status !== 'closed';
    if(currentChatFilter === 'unanswered') return session._needsReply;
    if(currentChatFilter === 'closed') return session.status === 'closed';
    return true;
  });

  if(search){
    filtered = filtered.filter(session => {
      const text = [
        session.visitor_name,
        session.visitor_whatsapp,
        session.visitor_email,
        session.status,
        session.handoff_reason,
        session._latest?.content
      ].join(' ').toLowerCase();
      return text.includes(search);
    });
  }

  if(filtered.length === 0){
    list.innerHTML = '<p class="muted">No chats in this view.</p>';
    return;
  }

  list.innerHTML = filtered.map(session => {
    const name = session.visitor_name || session.visitor_label || 'Website Visitor';
    const initials = getInitials(name);
    const latestText = session._latest ? session._latest.content : 'No messages yet';
    const time = formatShortTime(session._latest?.created_at || session.updated_at || session.created_at);
    const statusClass = session.status === 'closed' ? 'closed' : session._needsReply ? 'unanswered' : session.status;

    return `
      <div class="wa-chat-card ${session.id === selectedLiveSessionId ? 'active' : ''} ${session._needsReply ? 'needs-reply' : ''}" onclick="selectLiveSession('${session.id}')">
        <div class="wa-avatar">${escapeHTML(initials)}</div>
        <div class="wa-chat-info">
          <div class="wa-chat-top">
            <strong>${escapeHTML(name)}</strong>
            <span>${escapeHTML(time)}</span>
          </div>
          <div class="wa-chat-preview">${escapeHTML(latestText).slice(0, 80)}</div>
          <div class="wa-chat-meta">
            <span class="status-pill ${escapeHTML(statusClass)}">${session._needsReply ? 'UNANSWERED' : escapeHTML(session.status || 'bot_mode')}</span>
            ${session.visitor_whatsapp ? `<span>${escapeHTML(session.visitor_whatsapp)}</span>` : '<span>No phone</span>'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function selectLiveSession(sessionId){
  selectedLiveSessionId = sessionId;
  renderLiveSessions();
  await loadLiveMessages();

  if(liveChatMessagesTimer) clearInterval(liveChatMessagesTimer);
  liveChatMessagesTimer = setInterval(async () => {
    await loadLiveChats();
    await loadLiveMessages();
  }, 3500);
}

async function loadLiveMessages(){
  if(!selectedLiveSessionId) return;

  const { data: freshSession } = await supabaseClient
    .from('chat_sessions')
    .select('*')
    .eq('id', selectedLiveSessionId)
    .single();

  const session = freshSession || liveChatSessions.find(s => s.id === selectedLiveSessionId);

  document.getElementById('liveChatTitle').textContent = session?.visitor_name || session?.visitor_label || 'Website Visitor';
  document.getElementById('liveChatMeta').textContent =
    `WhatsApp: ${session?.visitor_whatsapp || 'Not provided'} · Email: ${session?.visitor_email || 'Not provided'} · Started: ${formatDate(session?.created_at)}`;

  const statusBox = document.getElementById('liveChatStatus');
  if(statusBox){
    const enriched = liveChatSessions.find(s => s.id === selectedLiveSessionId);
    statusBox.textContent = enriched?._needsReply ? 'UNANSWERED' : (session?.status || 'unknown');
    statusBox.className = 'support-status ' + (enriched?._needsReply ? 'unanswered' : (session?.status || ''));
  }

  const { data, error } = await supabaseClient
    .from('chat_messages')
    .select('*')
    .eq('session_id', selectedLiveSessionId)
    .order('id', { ascending:true });

  const box = document.getElementById('liveChatMessages');

  if(error){
    box.innerHTML = '<p class="muted">Could not load messages.</p>';
    return;
  }

  if(!data || data.length === 0){
    box.innerHTML = '<div class="empty-chat"><strong>No messages yet</strong></div>';
    return;
  }

  box.innerHTML = data.map(msg => {
    const cls = msg.author_type || 'system';
    return `
      <div class="wa-message-row ${escapeHTML(cls)}">
        <div class="wa-bubble ${escapeHTML(cls)}">
          <div class="wa-label">${escapeHTML(labelAuthor(msg.author_type))}</div>
          <div class="wa-text">${escapeHTML(msg.content || '')}</div>
          <div class="wa-time">${formatShortTime(msg.created_at)}</div>
        </div>
      </div>
    `;
  }).join('');

  box.scrollTop = box.scrollHeight;
}

function labelAuthor(author){
  if(author === 'visitor') return 'Visitor';
  if(author === 'admin') return 'Admin';
  if(author === 'bot') return 'Bot';
  return 'System';
}

function insertQuickReply(text){
  const input = document.getElementById('adminReplyInput');
  if(!input) return;
  input.value = text;
  input.focus();
}

async function sendAdminReply(){
  if(!selectedLiveSessionId) return showMessage('Select a client chat first.', 'red');

  const input = document.getElementById('adminReplyInput');
  const text = input.value.trim();
  if(!text) return showMessage('Type a reply first.', 'red');

  const { error } = await supabaseClient
    .from('chat_messages')
    .insert([{ session_id: selectedLiveSessionId, author_type: 'admin', content: text }]);

  if(error) return showMessage('Reply failed: ' + error.message, 'red');

  await supabaseClient
    .from('chat_sessions')
    .update({ status:'live_agent', updated_at:new Date().toISOString() })
    .eq('id', selectedLiveSessionId);

  input.value = '';
  await loadLiveChats();
  await loadLiveMessages();
  showMessage('Reply sent to visitor.', 'green');
}

async function markSelectedLive(){
  if(!selectedLiveSessionId) return showMessage('Select a client chat first.', 'red');

  const { error } = await supabaseClient
    .from('chat_sessions')
    .update({ status:'live_agent', updated_at:new Date().toISOString() })
    .eq('id', selectedLiveSessionId);

  if(error) return showMessage('Could not take over: ' + error.message, 'red');

  await loadLiveChats();
  await loadLiveMessages();
  showMessage('Chat is now in live agent mode.', 'green');
}

async function closeSelectedChat(){
  if(!selectedLiveSessionId) return showMessage('Select a client chat first.', 'red');
  if(!confirm('Close this client chat?')) return;

  await supabaseClient
    .from('chat_messages')
    .insert([{ session_id: selectedLiveSessionId, author_type: 'system', content: 'Admin has closed this live chat. You can start a new support request anytime.' }]);

  const { error } = await supabaseClient
    .from('chat_sessions')
    .update({ status:'closed', updated_at:new Date().toISOString() })
    .eq('id', selectedLiveSessionId);

  if(error) return showMessage('Could not close chat: ' + error.message, 'red');

  await loadLiveChats();
  await loadLiveMessages();
  showMessage('Chat closed.', 'green');
}

function getInitials(name){
  return String(name || 'V').split(' ').filter(Boolean).slice(0,2).map(w => w[0]?.toUpperCase()).join('') || 'V';
}

function formatShortTime(value){
  if(!value) return '';
  return new Date(value).toLocaleString('en-KE', { month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}


/* HANDOFFS */
async function loadHandoffs(){
  const body = document.getElementById('handoffBody');
  if(body) body.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  const { data, error } = await supabaseClient
    .from('handoffs')
    .select('*')
    .order('created_at', { ascending:false })
    .limit(100);

  if(error){
    if(body) body.innerHTML = '<tr><td colspan="6">Handoffs table not ready or access blocked.</td></tr>';
    return;
  }

  handoffsData = data || [];
  renderHandoffs();
}

function renderHandoffs(){
  const body = document.getElementById('handoffBody');
  if(!body) return;

  const input = document.getElementById('handoffSearchInput');
  const search = input ? input.value.trim().toLowerCase() : '';

  const filtered = handoffsData.filter(item =>
    String(item.reason || '').toLowerCase().includes(search) ||
    String(item.summary || '').toLowerCase().includes(search) ||
    String(item.urgency || '').toLowerCase().includes(search) ||
    String(item.status || '').toLowerCase().includes(search)
  );

  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="6">No handoff requests found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item,index)=>`
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.urgency || 'medium')}</td>
      <td>${escapeHTML(item.reason || '')}</td>
      <td>${escapeHTML(item.summary || '').slice(0,180)}</td>
      <td>${escapeHTML(item.status || 'new')}</td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `).join('');
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

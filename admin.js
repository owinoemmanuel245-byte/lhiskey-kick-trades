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
let showcaseData = [];
let earlyAccessData = [];
let paymentProofsData = [];
let paymentSettingsData = {};
let lockedProductsData = [];
let clientAccessData = [];
let accessLogsData = [];
let analyticsData = {};
let liveChatSessions = [];
let selectedLiveSessionId = null;
let liveChatMessagesCache = [];
let liveChatLeadsData = [];
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
    loadAnalyticsDashboard(),
    loadWatchlist(),
    loadSettings(),
    loadStrategies(),
    loadFiles(),
    loadAssistantSettings(),
    loadHandoffs(),
    ensureKnowledgeCategories(),
    loadKnowledge(),
    loadPackages(),
    loadClientRequests(),
    loadShowcaseItems(),
    loadEarlyAccessRequests(),
    loadPaymentsAdmin(),
    loadLockedProductsAdmin(),
    loadClientAccessAdmin(),
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
  if(name === 'showcase') loadShowcaseItems();
  if(name === 'earlyaccess') loadEarlyAccessRequests();
  if(name === 'payments') loadPaymentsAdmin();
  if(name === 'analytics') loadAnalyticsDashboard();
  if(name === 'lockedproducts') loadLockedProductsAdmin();
  if(name === 'clientaccess') loadClientAccessAdmin();
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



/* SAFE SHOWCASE v12 */
async function loadShowcaseItems(){
  const list = document.getElementById('showcaseList');
  if(list) list.innerHTML = '<p class="muted">Loading showcase items...</p>';

  const { data, error } = await supabaseClient
    .from('showcase_items')
    .select('*')
    .order('sort_order', { ascending:true })
    .order('created_at', { ascending:false });

  if(error){
    if(list) list.innerHTML = '<p class="muted">Showcase table not ready or access blocked.</p>';
    return;
  }

  showcaseData = data || [];
  renderShowcaseItems();
}

function renderShowcaseItems(){
  const list = document.getElementById('showcaseList');
  if(!list) return;

  if(showcaseData.length === 0){
    list.innerHTML = '<p class="muted">No showcase items added yet.</p>';
    return;
  }

  list.innerHTML = showcaseData.map(item => `
    <div class="mini-item">
      <h4>${escapeHTML(item.title || 'Untitled Item')}</h4>
      <p>${escapeHTML(item.item_type || 'tool')} · ${escapeHTML(formatAdminShowcaseStatus(item.status))} · Risk: ${escapeHTML(item.risk_level || 'medium')} · ${item.is_public ? 'Public' : 'Hidden'}</p>
      <p>${escapeHTML(String(item.short_description || '').slice(0, 160))}</p>
      <div class="mini-actions">
        <button class="ghost-btn" onclick="editShowcaseItem(${item.id})">Edit</button>
        <button class="ghost-btn" onclick="toggleShowcasePublic(${item.id}, ${item.is_public ? 'false' : 'true'})">${item.is_public ? 'Hide' : 'Show'}</button>
        <button class="mini-danger" onclick="deleteShowcaseItem(${item.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function formatAdminShowcaseStatus(status){
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

function editShowcaseItem(id){
  const item = showcaseData.find(x => x.id === id);
  if(!item) return;

  document.getElementById('showcaseIdInput').value = item.id;
  document.getElementById('showcaseTitleInput').value = item.title || '';
  document.getElementById('showcaseTypeInput').value = item.item_type || 'tool';
  document.getElementById('showcaseStatusInput').value = item.status || 'coming_soon';
  document.getElementById('showcaseRiskInput').value = item.risk_level || 'medium';
  document.getElementById('showcaseDescriptionInput').value = item.short_description || '';
  document.getElementById('showcaseNotesInput').value = item.testing_notes || '';
  document.getElementById('showcaseDisclaimerInput').value = item.disclaimer || 'For education/testing only. Not financial advice. No guaranteed profits.';
  document.getElementById('showcaseCtaInput').value = item.cta_label || 'Request Early Access';
  document.getElementById('showcaseSortInput').value = item.sort_order || 100;
  document.getElementById('showcasePublicInput').checked = !!item.is_public;

  showMessage('Showcase item loaded for editing.', 'green');
}

async function saveShowcaseItem(){
  const id = document.getElementById('showcaseIdInput')?.value;
  const title = document.getElementById('showcaseTitleInput')?.value.trim();
  const description = document.getElementById('showcaseDescriptionInput')?.value.trim();

  if(!title || !description){
    showMessage('Title and short description are required.', 'red');
    return;
  }

  const payload = {
    title,
    slug: slugify(title),
    item_type: document.getElementById('showcaseTypeInput')?.value || 'tool',
    status: document.getElementById('showcaseStatusInput')?.value || 'coming_soon',
    risk_level: document.getElementById('showcaseRiskInput')?.value || 'medium',
    short_description: description,
    testing_notes: document.getElementById('showcaseNotesInput')?.value.trim() || '',
    disclaimer: document.getElementById('showcaseDisclaimerInput')?.value.trim() || 'For education/testing only. Not financial advice. No guaranteed profits.',
    cta_label: document.getElementById('showcaseCtaInput')?.value.trim() || 'Request Early Access',
    sort_order: Number(document.getElementById('showcaseSortInput')?.value || 100),
    is_public: !!document.getElementById('showcasePublicInput')?.checked,
    updated_at: new Date().toISOString()
  };

  const result = id
    ? await supabaseClient.from('showcase_items').update(payload).eq('id', id)
    : await supabaseClient.from('showcase_items').insert([payload]);

  if(result.error){
    showMessage('Showcase save failed: ' + result.error.message, 'red');
    return;
  }

  clearShowcaseForm();
  await loadShowcaseItems();
  showMessage('Showcase item saved successfully.', 'green');
}

function clearShowcaseForm(){
  ['showcaseIdInput','showcaseTitleInput','showcaseDescriptionInput','showcaseNotesInput'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });

  const type = document.getElementById('showcaseTypeInput');
  const status = document.getElementById('showcaseStatusInput');
  const risk = document.getElementById('showcaseRiskInput');
  const disclaimer = document.getElementById('showcaseDisclaimerInput');
  const cta = document.getElementById('showcaseCtaInput');
  const sort = document.getElementById('showcaseSortInput');
  const pub = document.getElementById('showcasePublicInput');

  if(type) type.value = 'tool';
  if(status) status.value = 'coming_soon';
  if(risk) risk.value = 'medium';
  if(disclaimer) disclaimer.value = 'For education/testing only. Not financial advice. No guaranteed profits.';
  if(cta) cta.value = 'Request Early Access';
  if(sort) sort.value = '100';
  if(pub) pub.checked = true;
}

async function toggleShowcasePublic(id, status){
  const { error } = await supabaseClient
    .from('showcase_items')
    .update({ is_public: !!status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if(error){
    showMessage('Showcase visibility update failed: ' + error.message, 'red');
    return;
  }

  await loadShowcaseItems();
  showMessage('Showcase visibility updated.', 'green');
}

async function deleteShowcaseItem(id){
  if(!confirm('Delete this showcase item?')) return;

  const { error } = await supabaseClient
    .from('showcase_items')
    .delete()
    .eq('id', id);

  if(error){
    showMessage('Showcase delete failed: ' + error.message, 'red');
    return;
  }

  await loadShowcaseItems();
  showMessage('Showcase item deleted.', 'green');
}

/* EARLY ACCESS REQUESTS v12 */
async function loadEarlyAccessRequests(){
  const body = document.getElementById('earlyAccessBody');
  if(body) body.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';

  const { data, error } = await supabaseClient
    .from('early_access_requests')
    .select('*')
    .order('created_at', { ascending:false })
    .limit(300);

  if(error){
    if(body) body.innerHTML = '<tr><td colspan="10">Early access table not ready or access blocked.</td></tr>';
    return;
  }

  earlyAccessData = data || [];
  renderEarlyAccessRequests();
}

function renderEarlyAccessRequests(){
  const body = document.getElementById('earlyAccessBody');
  if(!body) return;

  const search = (document.getElementById('earlyAccessSearchInput')?.value || '').trim().toLowerCase();

  const filtered = earlyAccessData.filter(item =>
    [
      item.name, item.whatsapp, item.email, item.item_title,
      item.experience_level, item.interest_type, item.status, item.message
    ].join(' ').toLowerCase().includes(search)
  );

  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="10">No early access requests found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.name || '')}<br><small>${escapeHTML(item.email || '')}</small></td>
      <td>${escapeHTML(item.item_title || 'General Early Access')}</td>
      <td>${escapeHTML(item.whatsapp || '')}</td>
      <td>${escapeHTML(item.experience_level || 'beginner')}</td>
      <td>${escapeHTML(item.interest_type || 'early_access')}</td>
      <td>${escapeHTML(item.status || 'new')}</td>
      <td>${escapeHTML(String(item.message || '').slice(0, 130))}</td>
      <td>${formatDate(item.created_at)}</td>
      <td>
        <div class="mini-actions">
          <button class="ghost-btn" onclick="openClientWhatsapp('${escapeJS(item.whatsapp || '')}', '${escapeJS(item.name || '')}')">WhatsApp</button>
          <button class="ghost-btn" onclick="updateEarlyAccessStatus(${item.id}, 'contacted')">Contacted</button>
          <button class="ghost-btn" onclick="updateEarlyAccessStatus(${item.id}, 'waitlist')">Waitlist</button>
          <button class="ghost-btn" onclick="updateEarlyAccessStatus(${item.id}, 'approved')">Approved</button>
          <button class="mini-danger" onclick="updateEarlyAccessStatus(${item.id}, 'closed')">Close</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function updateEarlyAccessStatus(id, status){
  const { error } = await supabaseClient
    .from('early_access_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if(error){
    showMessage('Early access status failed: ' + error.message, 'red');
    return;
  }

  await loadEarlyAccessRequests();
  showMessage('Early access status updated.', 'green');
}

function downloadEarlyAccessCSV(){
  if(!earlyAccessData || earlyAccessData.length === 0){
    showMessage('No early access data to download.', 'red');
    return;
  }

  const rows = [
    ['id','name','whatsapp','email','item_title','experience_level','interest_type','status','message','created_at'],
    ...earlyAccessData.map(i => [
      i.id, i.name || '', i.whatsapp || '', i.email || '', i.item_title || '',
      i.experience_level || '', i.interest_type || '', i.status || '', i.message || '', i.created_at || ''
    ])
  ];

  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lhiskey-kick-trades-early-access.csv';
  link.click();
  URL.revokeObjectURL(url);
}




/* LOCKED PRODUCTS + CLIENT ACCESS v14 */
async function loadLockedProductsAdmin(){
  const list = document.getElementById('lockedProductList');
  if(list) list.innerHTML = '<p class="muted">Loading locked products...</p>';
  const { data, error } = await supabaseClient.from('locked_products').select('*').order('sort_order', { ascending:true }).order('created_at', { ascending:false });
  if(error){ if(list) list.innerHTML = '<p class="muted">Locked products table not ready or access blocked.</p>'; return; }
  lockedProductsData = data || [];
  renderLockedProductsAdmin();
  fillClientAccessProductOptions();
}
function renderLockedProductsAdmin(){
  const list = document.getElementById('lockedProductList');
  if(!list) return;
  if(!lockedProductsData.length){ list.innerHTML = '<p class="muted">No locked products added yet.</p>'; return; }
  list.innerHTML = lockedProductsData.map(item => `
    <div class="mini-item">
      <h4>${escapeHTML(item.title || 'Untitled Product')}</h4>
      <p>${escapeHTML(item.product_type || 'package')} · ${escapeHTML(item.status || 'locked')} · Risk: ${escapeHTML(item.risk_level || 'medium')} · ${item.is_public ? 'Public preview' : 'Hidden'}</p>
      <p>${escapeHTML(String(item.short_description || '').slice(0, 160))}</p>
      <div class="mini-actions"><button class="ghost-btn" onclick="editLockedProduct(${item.id})">Edit</button><button class="ghost-btn" onclick="toggleLockedProductPublic(${item.id}, ${item.is_public ? 'false' : 'true'})">${item.is_public ? 'Hide' : 'Show'}</button><button class="mini-danger" onclick="deleteLockedProduct(${item.id})">Delete</button></div>
    </div>`).join('');
}
function editLockedProduct(id){
  const item = lockedProductsData.find(x => x.id === id); if(!item) return;
  setInputValue('lockedProductIdInput', item.id);
  setInputValue('lockedProductTitleInput', item.title || '');
  setInputValue('lockedProductTypeInput', item.product_type || 'package');
  setInputValue('lockedProductStatusInput', item.status || 'locked');
  setInputValue('lockedProductPriceInput', item.price_label || 'Pricing will be communicated soon');
  setInputValue('lockedProductDescriptionInput', item.short_description || '');
  setInputValue('lockedProductPreviewInput', item.preview_content || '');
  setInputValue('lockedProductPrivateInput', item.private_content || '');
  setInputValue('lockedProductLinkInput', item.private_link || '');
  setInputValue('lockedProductDeliveryInput', item.delivery_notes || '');
  setInputValue('lockedProductDurationInput', item.access_duration_days || '');
  setInputValue('lockedProductRiskInput', item.risk_level || 'medium');
  setInputValue('lockedProductCtaInput', item.cta_label || 'Access Package');
  setInputValue('lockedProductDisclaimerInput', item.disclaimer || 'Educational/testing access only. Not financial advice. No guaranteed profits.');
  setInputValue('lockedProductSortInput', item.sort_order || 100);
  const pub = document.getElementById('lockedProductPublicInput'); if(pub) pub.checked = !!item.is_public;
  showMessage('Locked product loaded for editing.', 'green');
}
async function saveLockedProduct(){
  const id = document.getElementById('lockedProductIdInput')?.value;
  const title = document.getElementById('lockedProductTitleInput')?.value.trim();
  const short_description = document.getElementById('lockedProductDescriptionInput')?.value.trim();
  if(!title || !short_description){ showMessage('Product title and short description are required.', 'red'); return; }
  const durationRaw = document.getElementById('lockedProductDurationInput')?.value;
  const payload = {
    title, slug: slugify(title), product_type: document.getElementById('lockedProductTypeInput')?.value || 'package',
    status: document.getElementById('lockedProductStatusInput')?.value || 'locked',
    price_label: document.getElementById('lockedProductPriceInput')?.value.trim() || 'Pricing will be communicated soon',
    short_description, preview_content: document.getElementById('lockedProductPreviewInput')?.value.trim() || '',
    private_content: document.getElementById('lockedProductPrivateInput')?.value.trim() || '',
    private_link: document.getElementById('lockedProductLinkInput')?.value.trim() || '',
    delivery_notes: document.getElementById('lockedProductDeliveryInput')?.value.trim() || '',
    access_duration_days: durationRaw ? Number(durationRaw) : null,
    risk_level: document.getElementById('lockedProductRiskInput')?.value || 'medium',
    cta_label: document.getElementById('lockedProductCtaInput')?.value.trim() || 'Access Package',
    disclaimer: document.getElementById('lockedProductDisclaimerInput')?.value.trim() || 'Educational/testing access only. Not financial advice. No guaranteed profits.',
    sort_order: Number(document.getElementById('lockedProductSortInput')?.value || 100),
    is_public: !!document.getElementById('lockedProductPublicInput')?.checked,
    updated_at: new Date().toISOString()
  };
  const result = id ? await supabaseClient.from('locked_products').update(payload).eq('id', id) : await supabaseClient.from('locked_products').insert([payload]);
  if(result.error){ showMessage('Locked product save failed: ' + result.error.message, 'red'); return; }
  clearLockedProductForm(); await loadLockedProductsAdmin(); showMessage('Locked product saved.', 'green');
}
function clearLockedProductForm(){
  ['lockedProductIdInput','lockedProductTitleInput','lockedProductDescriptionInput','lockedProductPreviewInput','lockedProductPrivateInput','lockedProductLinkInput','lockedProductDeliveryInput','lockedProductDurationInput'].forEach(id => setInputValue(id, ''));
  setInputValue('lockedProductTypeInput', 'package'); setInputValue('lockedProductStatusInput', 'locked'); setInputValue('lockedProductPriceInput', 'Pricing will be communicated soon'); setInputValue('lockedProductRiskInput', 'medium'); setInputValue('lockedProductCtaInput', 'Access Package'); setInputValue('lockedProductDisclaimerInput', 'Educational/testing access only. Not financial advice. No guaranteed profits.'); setInputValue('lockedProductSortInput', '100');
  const pub = document.getElementById('lockedProductPublicInput'); if(pub) pub.checked = true;
}
async function toggleLockedProductPublic(id, status){
  const { error } = await supabaseClient.from('locked_products').update({ is_public: !!status, updated_at:new Date().toISOString() }).eq('id', id);
  if(error){ showMessage('Visibility update failed: ' + error.message, 'red'); return; }
  await loadLockedProductsAdmin(); showMessage('Visibility updated.', 'green');
}
async function deleteLockedProduct(id){
  if(!confirm('Delete this locked product?')) return;
  const { error } = await supabaseClient.from('locked_products').delete().eq('id', id);
  if(error){ showMessage('Delete failed: ' + error.message, 'red'); return; }
  await loadLockedProductsAdmin(); showMessage('Locked product deleted.', 'green');
}
function fillClientAccessProductOptions(){
  const select = document.getElementById('clientAccessProductInput'); if(!select) return;
  select.innerHTML = lockedProductsData.map(p => `<option value="${p.id}">${escapeHTML(p.title || 'Product')}</option>`).join('');
}
async function loadClientAccessAdmin(){ await Promise.allSettled([loadLockedProductsAdmin(), loadClientAccessRecords(), loadAccessLogs()]); }
async function loadClientAccessRecords(){
  const { data, error } = await supabaseClient.from('client_access').select('*').order('created_at', { ascending:false }).limit(300);
  if(error){ const list = document.getElementById('clientAccessList'); if(list) list.innerHTML = '<p class="muted">Client access table not ready or access blocked.</p>'; return; }
  clientAccessData = data || []; renderClientAccessList();
}
async function loadAccessLogs(){
  const { data } = await supabaseClient.from('access_logs').select('*').order('created_at', { ascending:false }).limit(300);
  accessLogsData = data || [];
}
function renderClientAccessList(){
  const list = document.getElementById('clientAccessList'); if(!list) return;
  const search = (document.getElementById('clientAccessSearchInput')?.value || '').toLowerCase();
  const filtered = clientAccessData.filter(item => [item.client_name, item.whatsapp, item.product_title, item.access_code, item.status].join(' ').toLowerCase().includes(search));
  if(!filtered.length){ list.innerHTML = '<p class="muted">No access records found.</p>'; return; }
  list.innerHTML = filtered.map(item => `
    <div class="mini-item ${item.status === 'revoked' ? 'danger-soft' : ''}">
      <h4>${escapeHTML(item.product_title || 'Access')}</h4>
      <p>${escapeHTML(item.client_name || '')} · ${escapeHTML(item.whatsapp || '')}</p>
      <p>Code: <strong>${escapeHTML(item.access_code || '')}</strong> · Status: ${escapeHTML(item.status || 'active')} · Sharing attempts: ${Number(item.share_attempts || 0)}</p>
      <p>${item.expires_at ? 'Expires: ' + formatDate(item.expires_at) : 'No expiry'} · Last access: ${item.last_access_at ? formatDate(item.last_access_at) : 'Never'}</p>
      <div class="mini-actions"><button class="ghost-btn" onclick="copyAccessCode('${escapeJS(item.access_code || '')}')">Copy Code</button><button class="ghost-btn" onclick="copyReleaseMessage(${item.id})">Copy Message</button><button class="ghost-btn" onclick="openAccessWhatsapp(${item.id})">WhatsApp</button><button class="ghost-btn" onclick="editClientAccess(${item.id})">Edit</button><button class="ghost-btn" onclick="resetClientAccessDevice(${item.id})">Reset Device</button><button class="ghost-btn" onclick="updateClientAccessStatus(${item.id}, 'active')">Activate</button><button class="mini-danger" onclick="updateClientAccessStatus(${item.id}, 'revoked')">Revoke</button></div>
    </div>`).join('');
}
function editClientAccess(id){
  const item = clientAccessData.find(x => x.id === id); if(!item) return;
  setInputValue('clientAccessIdInput', item.id); setInputValue('clientAccessPaymentIdInput', item.payment_proof_id || ''); setInputValue('clientAccessNameInput', item.client_name || ''); setInputValue('clientAccessWhatsappInput', item.whatsapp || ''); setInputValue('clientAccessEmailInput', item.email || ''); setInputValue('clientAccessProductInput', item.product_id || ''); setInputValue('clientAccessCodeInput', item.access_code || ''); setInputValue('clientAccessPrivateInput', item.private_content || ''); setInputValue('clientAccessLinkInput', item.private_link || ''); setInputValue('clientAccessDeliveryInput', item.delivery_notes || ''); setInputValue('clientAccessStatusInput', item.status || 'active');
  const expiry = document.getElementById('clientAccessExpiryInput'); if(expiry) expiry.value = item.expires_at ? new Date(item.expires_at).toISOString().slice(0,16) : '';
  showMessage('Client access loaded for editing.', 'green');
}
function releaseFromPaymentProof(paymentId){
  const proof = paymentProofsData.find(x => x.id === paymentId);
  if(!proof){ showMessage('Payment proof not found.', 'red'); return; }
  setInputValue('clientAccessPaymentIdInput', proof.id); setInputValue('clientAccessNameInput', proof.name || ''); setInputValue('clientAccessWhatsappInput', proof.whatsapp || ''); setInputValue('clientAccessEmailInput', proof.email || ''); setInputValue('clientAccessCodeInput', generateAccessCode()); setInputValue('clientAccessStatusInput', 'active');
  const related = String(proof.related_to || '').toLowerCase();
  const match = lockedProductsData.find(p => related && (String(p.title || '').toLowerCase().includes(related) || related.includes(String(p.title || '').toLowerCase().split(' ')[0])));
  if(match) setInputValue('clientAccessProductInput', match.id);
  switchTab('clientaccess'); showMessage('Payment proof loaded. Choose/confirm product then click Create Access.', 'green');
}
async function createClientAccessManual(){
  const id = document.getElementById('clientAccessIdInput')?.value;
  const productId = Number(document.getElementById('clientAccessProductInput')?.value || 0);
  const product = lockedProductsData.find(p => Number(p.id) === productId);
  const clientName = document.getElementById('clientAccessNameInput')?.value.trim();
  const whatsapp = document.getElementById('clientAccessWhatsappInput')?.value.trim();
  const accessCode = (document.getElementById('clientAccessCodeInput')?.value.trim() || generateAccessCode()).toUpperCase();
  if(!clientName || !whatsapp || !product){ showMessage('Client name, WhatsApp, and product are required.', 'red'); return; }
  const expiryRaw = document.getElementById('clientAccessExpiryInput')?.value;
  let expiresAt = expiryRaw ? new Date(expiryRaw).toISOString() : null;
  if(!expiresAt && product.access_duration_days){ const d = new Date(); d.setDate(d.getDate() + Number(product.access_duration_days)); expiresAt = d.toISOString(); }
  const payload = { product_id:product.id, payment_proof_id:document.getElementById('clientAccessPaymentIdInput')?.value || null, client_name:clientName, whatsapp, email:document.getElementById('clientAccessEmailInput')?.value.trim() || '', product_title:product.title, access_code:accessCode, status:document.getElementById('clientAccessStatusInput')?.value || 'active', private_content:document.getElementById('clientAccessPrivateInput')?.value.trim() || product.private_content || '', private_link:document.getElementById('clientAccessLinkInput')?.value.trim() || product.private_link || '', delivery_notes:document.getElementById('clientAccessDeliveryInput')?.value.trim() || product.delivery_notes || '', expires_at:expiresAt, updated_at:new Date().toISOString() };
  const result = id ? await supabaseClient.from('client_access').update(payload).eq('id', id) : await supabaseClient.from('client_access').insert([payload]);
  if(result.error){ showMessage('Client access save failed: ' + result.error.message, 'red'); return; }
  if(payload.payment_proof_id){ await supabaseClient.from('payment_proofs').update({ status:'verified', updated_at:new Date().toISOString() }).eq('id', payload.payment_proof_id); }
  clearClientAccessForm(); await loadClientAccessAdmin(); if(typeof loadPaymentProofs === 'function') await loadPaymentProofs(); showMessage('Access released. Copy the release message or WhatsApp the client from Client Access.', 'green');
}
function clearClientAccessForm(){ ['clientAccessIdInput','clientAccessPaymentIdInput','clientAccessNameInput','clientAccessWhatsappInput','clientAccessEmailInput','clientAccessCodeInput','clientAccessPrivateInput','clientAccessLinkInput','clientAccessDeliveryInput','clientAccessExpiryInput'].forEach(id => setInputValue(id, '')); setInputValue('clientAccessStatusInput', 'active'); }
function generateAccessCode(){ const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = 'LKT-'; for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)]; return code; }
function generateAccessCodeIntoForm(){ setInputValue('clientAccessCodeInput', generateAccessCode()); }
async function updateClientAccessStatus(id, status){ const { error } = await supabaseClient.from('client_access').update({ status, updated_at:new Date().toISOString() }).eq('id', id); if(error){ showMessage('Access status update failed: ' + error.message, 'red'); return; } await loadClientAccessRecords(); showMessage('Access status updated.', 'green'); }
async function resetClientAccessDevice(id){ if(!confirm('Reset device binding for this client? Use this only if the real client changed device.')) return; const { error } = await supabaseClient.from('client_access').update({ device_hash:null, session_hash:null, share_attempts:0, status:'active', updated_at:new Date().toISOString() }).eq('id', id); if(error){ showMessage('Device reset failed: ' + error.message, 'red'); return; } await loadClientAccessRecords(); showMessage('Device binding reset. Client can activate again.', 'green'); }
function copyAccessCode(code){ if(!code) return; navigator.clipboard?.writeText(code); showMessage('Access code copied: ' + code, 'green'); }

function buildReleaseMessage(item){
  const site = 'https://lhiskey-kick-trades.vercel.app/#client-access';
  return [
    `Hello ${item.client_name || 'there'}, your LHISKEY KICK TRADES access has been approved.`,
    ``,
    `Package: ${item.product_title || 'Private Access'}`,
    `Access Code: ${item.access_code || ''}`,
    `WhatsApp to use: ${item.whatsapp || ''}`,
    ``,
    `Open the Client Access Portal:`,
    site,
    ``,
    `Important: This code is linked to one client/device only. Do not share it. Sharing attempts may block or revoke access.`,
    ``,
    `Educational/testing access only — not financial advice. No guaranteed profits.`
  ].join('\n');
}

function copyReleaseMessage(id){
  const item = clientAccessData.find(x => x.id === id);
  if(!item){ showMessage('Access record not found.', 'red'); return; }
  navigator.clipboard?.writeText(buildReleaseMessage(item));
  showMessage('Release message copied. Send it to the client on WhatsApp.', 'green');
}

function openAccessWhatsapp(id){
  const item = clientAccessData.find(x => x.id === id);
  if(!item){ showMessage('Access record not found.', 'red'); return; }
  const clean = String(item.whatsapp || '').replace(/[^\d]/g, '');
  if(!clean){ showMessage('No WhatsApp number found.', 'red'); return; }
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(buildReleaseMessage(item))}`, '_blank');
}




/* V15 MEGA ANALYTICS DASHBOARD */
async function loadAnalyticsDashboard(){
  const cards = document.getElementById('analyticsCards');
  if(cards){
    cards.innerHTML = '<div class="analytics-card"><span>Loading</span><strong>—</strong><p>Fetching platform metrics...</p></div>';
  }

  try{
    const [
      watchlist,
      leads,
      clientRequests,
      earlyAccess,
      paymentProofs,
      clientAccess,
      lockedProducts,
      chatSessions,
      accessLogs
    ] = await Promise.allSettled([
      analyticsSelect('watchlist', '*', 500),
      analyticsSelect('visitor_leads', '*', 500),
      analyticsSelect('client_requests', '*', 500),
      analyticsSelect('early_access_requests', '*', 500),
      analyticsSelect('payment_proofs', '*', 500),
      analyticsSelect('client_access', '*', 500),
      analyticsSelect('locked_products', '*', 500),
      analyticsSelect('chat_sessions', '*', 500),
      analyticsSelect('access_logs', '*', 500)
    ]);

    const data = {
      watchlist: unwrapSettled(watchlist),
      leads: unwrapSettled(leads),
      clientRequests: unwrapSettled(clientRequests),
      earlyAccess: unwrapSettled(earlyAccess),
      paymentProofs: unwrapSettled(paymentProofs),
      clientAccess: unwrapSettled(clientAccess),
      lockedProducts: unwrapSettled(lockedProducts),
      chatSessions: unwrapSettled(chatSessions),
      accessLogs: unwrapSettled(accessLogs)
    };

    analyticsData = data;
    renderAnalyticsDashboard(data);
  }catch(err){
    console.error('[loadAnalyticsDashboard]', err);
    if(cards){
      cards.innerHTML = '<div class="analytics-card"><span>Error</span><strong>!</strong><p>Could not load analytics.</p></div>';
    }
  }
}

async function analyticsSelect(table, columns = '*', limit = 300){
  const { data, error } = await supabaseClient
    .from(table)
    .select(columns)
    .order('created_at', { ascending:false })
    .limit(limit);

  if(error){
    console.warn(`[analytics] ${table} unavailable:`, error.message);
    return [];
  }

  return data || [];
}

function unwrapSettled(result){
  return result.status === 'fulfilled' ? (result.value || []) : [];
}

function renderAnalyticsDashboard(data){
  const paymentProofs = data.paymentProofs || [];
  const clientAccess = data.clientAccess || [];
  const accessLogs = data.accessLogs || [];
  const lockedProducts = data.lockedProducts || [];
  const chatSessions = data.chatSessions || [];

  const verifiedPayments = paymentProofs.filter(x => x.status === 'verified');
  const pendingPayments = paymentProofs.filter(x => ['new','under_review'].includes(x.status));
  const rejectedPayments = paymentProofs.filter(x => x.status === 'rejected');
  const verifiedAmount = verifiedPayments.reduce((sum, x) => sum + Number(x.amount_paid || 0), 0);

  const activeAccess = clientAccess.filter(x => x.status === 'active');
  const revokedAccess = clientAccess.filter(x => x.status === 'revoked');
  const sharedAccess = clientAccess.filter(x => x.status === 'shared_attempt_detected');
  const sharingLogs = accessLogs.filter(x => ['sharing_attempt','suspicious_attempt'].includes(x.event_type));

  const openChats = chatSessions.filter(x => x.status !== 'closed');

  const metrics = [
    ['Watchlist', data.watchlist.length, 'Total email signups'],
    ['Visitor Leads', data.leads.length, 'Captured support/client leads'],
    ['Client Requests', data.clientRequests.length, 'Package/service requests'],
    ['Early Access', data.earlyAccess.length, 'Testing waitlist requests'],
    ['Payment Proofs', paymentProofs.length, `${pendingPayments.length} pending · ${verifiedPayments.length} verified`],
    ['Verified Amount', `KES ${verifiedAmount.toLocaleString('en-KE')}`, 'Total verified manual payments'],
    ['Active Access', activeAccess.length, 'Currently active client releases'],
    ['Revoked Access', revokedAccess.length, `${sharedAccess.length} sharing-warning records`],
    ['Locked Products', lockedProducts.length, 'Preview/locked products in system'],
    ['Open Chats', openChats.length, 'Live/support conversations not closed'],
    ['Security Alerts', sharingLogs.length, 'Sharing/suspicious access attempts'],
    ['Rejected Payments', rejectedPayments.length, 'Proofs rejected by admin']
  ];

  const cards = document.getElementById('analyticsCards');
  if(cards){
    cards.innerHTML = metrics.map(([label, value, note]) => `
      <div class="analytics-card">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
        <p>${escapeHTML(note)}</p>
      </div>
    `).join('');
  }

  renderAnalyticsMiniList(
    'analyticsRecentPayments',
    paymentProofs.slice(0, 8),
    item => `
      <div class="analytics-mini-item">
        <strong>${escapeHTML(item.name || 'Client')}</strong>
        <span>${escapeHTML(item.currency || 'KES')} ${Number(item.amount_paid || 0).toLocaleString('en-KE')} · ${escapeHTML(item.status || 'new')}</span>
        <p>${escapeHTML(item.related_to || 'General payment')} · ${formatDate(item.created_at)}</p>
      </div>
    `,
    'No payment proofs yet.'
  );

  renderAnalyticsMiniList(
    'analyticsRecentAccess',
    clientAccess.slice(0, 8),
    item => `
      <div class="analytics-mini-item">
        <strong>${escapeHTML(item.client_name || 'Client')}</strong>
        <span>${escapeHTML(item.product_title || 'Access')} · ${escapeHTML(item.status || 'active')}</span>
        <p>Code: ${escapeHTML(item.access_code || '')} · Attempts: ${Number(item.share_attempts || 0)}</p>
      </div>
    `,
    'No access releases yet.'
  );

  renderAnalyticsMiniList(
    'analyticsSecurityAlerts',
    accessLogs.filter(x => ['sharing_attempt','suspicious_attempt','revoked_attempt'].includes(x.event_type)).slice(0, 8),
    item => `
      <div class="analytics-mini-item danger">
        <strong>${escapeHTML(item.event_type || 'Alert')}</strong>
        <span>${escapeHTML(item.whatsapp || '')} · ${escapeHTML(item.access_code || '')}</span>
        <p>${escapeHTML(item.message || '')} · ${formatDate(item.created_at)}</p>
      </div>
    `,
    'No sharing/security alerts yet.'
  );
}

function renderAnalyticsMiniList(id, rows, renderer, emptyText){
  const box = document.getElementById(id);
  if(!box) return;

  if(!rows || rows.length === 0){
    box.innerHTML = `<p class="muted">${escapeHTML(emptyText)}</p>`;
    return;
  }

  box.innerHTML = rows.map(renderer).join('');
}


/* PAYMENT PROOFS v13 */
async function loadPaymentsAdmin(){
  await Promise.allSettled([
    loadPaymentSettingsAdmin(),
    loadPaymentProofs()
  ]);
}

async function loadPaymentSettingsAdmin(){
  try{
    const { data, error } = await supabaseClient
      .from('site_settings')
      .select('value')
      .eq('key', 'payments')
      .single();

    paymentSettingsData = error ? {} : (data?.value || {});
    fillPaymentSettingsForm();
  }catch(err){
    console.warn('loadPaymentSettingsAdmin failed:', err);
  }
}

function fillPaymentSettingsForm(){
  const p = paymentSettingsData || {};
  setInputValue('payBankNameInput', p.bank_name || '');
  setInputValue('payAccountNameInput', p.account_name || 'LHISKEY KICK TRADES');
  setInputValue('payAccountNumberInput', p.account_number || '');
  setInputValue('payBankBranchInput', p.bank_branch || '');
  setInputValue('payPaybillInput', p.mpesa_paybill || '');
  setInputValue('payTillInput', p.mpesa_till || '');
  setInputValue('payMpesaAccountInput', p.mpesa_account_name || 'LHISKEY KICK TRADES');
  setInputValue('payInstructionsInput', p.instructions || 'Payment instructions are shared after admin confirms the package, service, or access request. After payment, submit your reference code and proof using the Payment Proof form.');
}

function setInputValue(id, value){
  const el = document.getElementById(id);
  if(el) el.value = value;
}

async function savePaymentSettings(){
  const value = {
    bank_name: document.getElementById('payBankNameInput')?.value.trim() || 'To be communicated by admin',
    account_name: document.getElementById('payAccountNameInput')?.value.trim() || 'LHISKEY KICK TRADES',
    account_number: document.getElementById('payAccountNumberInput')?.value.trim() || 'To be communicated by admin',
    bank_branch: document.getElementById('payBankBranchInput')?.value.trim() || '',
    mpesa_paybill: document.getElementById('payPaybillInput')?.value.trim() || 'To be communicated by admin',
    mpesa_till: document.getElementById('payTillInput')?.value.trim() || 'To be communicated by admin',
    mpesa_account_name: document.getElementById('payMpesaAccountInput')?.value.trim() || 'LHISKEY KICK TRADES',
    instructions: document.getElementById('payInstructionsInput')?.value.trim() || 'Payment instructions are shared after admin confirms your request.'
  };

  const { error } = await supabaseClient
    .from('site_settings')
    .upsert({ key:'payments', value, updated_at:new Date().toISOString() });

  if(error){
    showMessage('Payment settings save failed: ' + error.message, 'red');
    return;
  }

  paymentSettingsData = value;
  showMessage('Payment settings saved. Refresh the public website to see changes.', 'green');
}

async function loadPaymentProofs(){
  const body = document.getElementById('paymentProofBody');
  if(body) body.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';

  const { data, error } = await supabaseClient
    .from('payment_proofs')
    .select('*')
    .order('created_at', { ascending:false })
    .limit(300);

  if(error){
    if(body) body.innerHTML = '<tr><td colspan="10">Payment proofs table not ready or access blocked.</td></tr>';
    renderPaymentStats();
    return;
  }

  paymentProofsData = data || [];
  renderPaymentProofs();
  renderPaymentStats();
}

function renderPaymentStats(){
  const box = document.getElementById('paymentStatsBox');
  if(!box) return;

  const total = paymentProofsData.length;
  const fresh = paymentProofsData.filter(x => x.status === 'new').length;
  const verified = paymentProofsData.filter(x => x.status === 'verified').length;
  const rejected = paymentProofsData.filter(x => x.status === 'rejected').length;
  const amount = paymentProofsData
    .filter(x => x.status === 'verified')
    .reduce((sum, x) => sum + Number(x.amount_paid || 0), 0);

  box.innerHTML = `
    <div class="pay-stat"><span>Total proofs</span><strong>${total}</strong></div>
    <div class="pay-stat"><span>New</span><strong>${fresh}</strong></div>
    <div class="pay-stat"><span>Verified</span><strong>${verified}</strong></div>
    <div class="pay-stat"><span>Rejected</span><strong>${rejected}</strong></div>
    <div class="pay-stat"><span>Verified amount</span><strong>KES ${amount.toLocaleString('en-KE')}</strong></div>
  `;
}

function renderPaymentProofs(){
  const body = document.getElementById('paymentProofBody');
  if(!body) return;

  const search = (document.getElementById('paymentProofSearchInput')?.value || '').trim().toLowerCase();

  const filtered = paymentProofsData.filter(item =>
    [
      item.name, item.whatsapp, item.email, item.related_to, item.payment_method,
      item.payment_reference, item.status, item.message
    ].join(' ').toLowerCase().includes(search)
  );

  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="10">No payment proofs found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.name || '')}<br><small>${escapeHTML(item.whatsapp || '')}</small></td>
      <td>${escapeHTML(item.related_to || 'General')}</td>
      <td>${escapeHTML(item.currency || 'KES')} ${Number(item.amount_paid || 0).toLocaleString('en-KE')}</td>
      <td>${escapeHTML(item.payment_method || 'bank')}</td>
      <td>${escapeHTML(item.payment_reference || '')}</td>
      <td>${escapeHTML(item.status || 'new')}</td>
      <td>${item.proof_file_path ? `<button class="ghost-btn" onclick="openPaymentProofFile(${item.id})">Open</button>` : '<span class="muted">No file</span>'}</td>
      <td>${formatDate(item.created_at)}</td>
      <td>
        <div class="mini-actions">
          <button class="ghost-btn" onclick="openPaymentWhatsapp(${item.id})">WhatsApp</button>
          <button class="ghost-btn" onclick="updatePaymentProofStatus(${item.id}, 'under_review')">Review</button>
          <button class="ghost-btn" onclick="updatePaymentProofStatus(${item.id}, 'verified')">Verify</button>
          <button class="ghost-btn" onclick="releaseFromPaymentProof(${item.id})">Release</button>
          <button class="mini-danger" onclick="updatePaymentProofStatus(${item.id}, 'rejected')">Reject</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function openPaymentProofFile(id){
  const item = paymentProofsData.find(x => x.id === id);
  if(!item || !item.proof_file_path){
    showMessage('No proof file found.', 'red');
    return;
  }

  const { data, error } = await supabaseClient.storage
    .from('payment-proofs')
    .createSignedUrl(item.proof_file_path, 120);

  if(error){
    showMessage('Could not open proof: ' + error.message, 'red');
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function updatePaymentProofStatus(id, status){
  const { error } = await supabaseClient
    .from('payment_proofs')
    .update({ status, updated_at:new Date().toISOString() })
    .eq('id', id);

  if(error){
    showMessage('Payment proof status failed: ' + error.message, 'red');
    return;
  }

  await loadPaymentProofs();
  showMessage('Payment proof status updated.', 'green');
}

function openPaymentWhatsapp(id){
  const item = paymentProofsData.find(x => x.id === id);
  if(!item){
    showMessage('Payment proof not found.', 'red');
    return;
  }

  const clean = String(item.whatsapp || '').replace(/[^\d]/g, '');
  if(!clean){
    showMessage('No WhatsApp number found.', 'red');
    return;
  }

  const text = encodeURIComponent(`Hello ${item.name || ''}, this is Emmanuel from LHISKEY KICK TRADES. I received your payment proof for ${item.related_to || 'your request'} and I am verifying it.`);
  window.open(`https://wa.me/${clean}?text=${text}`, '_blank');
}

function downloadPaymentProofsCSV(){
  if(!paymentProofsData || paymentProofsData.length === 0){
    showMessage('No payment proof data to download.', 'red');
    return;
  }

  const rows = [
    ['id','name','whatsapp','email','related_to','amount_paid','currency','payment_method','payment_reference','status','message','created_at'],
    ...paymentProofsData.map(i => [
      i.id, i.name || '', i.whatsapp || '', i.email || '', i.related_to || '',
      i.amount_paid || '', i.currency || 'KES', i.payment_method || '', i.payment_reference || '',
      i.status || '', i.message || '', i.created_at || ''
    ])
  ];

  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lhiskey-kick-trades-payment-proofs.csv';
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
  if(list && !liveChatSessions.length) list.innerHTML = '<p class="muted">Loading support requests...</p>';

  const [
    sessionsResult,
    messagesResult,
    leadsResult
  ] = await Promise.allSettled([
    supabaseClient
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending:false })
      .limit(250),
    supabaseClient
      .from('chat_messages')
      .select('*')
      .order('id', { ascending:false })
      .limit(700),
    supabaseClient
      .from('visitor_leads')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(700)
  ]);

  const sessionsPayload = sessionsResult.status === 'fulfilled' ? sessionsResult.value : {};
  if(sessionsPayload.error){
    if(list) list.innerHTML = '<p class="muted">Live chat tables not ready or access blocked.</p>';
    return;
  }

  liveChatSessions = sessionsPayload.data || [];

  const messagesPayload = messagesResult.status === 'fulfilled' ? messagesResult.value : {};
  const leadsPayload = leadsResult.status === 'fulfilled' ? leadsResult.value : {};

  liveChatMessagesCache = messagesPayload.data || [];
  liveChatLeadsData = leadsPayload.data || [];

  enrichLiveSessions();
  renderLiveSessions();
  renderLiveInboxStats();

  if(selectedLiveSessionId){
    await loadLiveMessages();
  }
}

function enrichLiveSessions(){
  liveChatSessions = liveChatSessions.map(session => {
    const msgs = liveChatMessagesCache
      .filter(m => m.session_id === session.id)
      .sort((a,b) => Number(b.id) - Number(a.id));

    const relatedLeads = (liveChatLeadsData || [])
      .filter(l => l.session_id === session.id)
      .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const latest = msgs[0] || null;
    const latestAdmin = msgs.find(m => m.author_type === 'admin') || null;
    const latestLead = relatedLeads[0] || null;

    const displayName =
      latestLead?.name ||
      session.visitor_name ||
      session.visitor_label ||
      'Website Visitor';

    const displayPhone =
      latestLead?.whatsapp ||
      session.visitor_whatsapp ||
      '';

    const displayEmail =
      latestLead?.email ||
      session.visitor_email ||
      '';

    const requestReason =
      latestLead?.reason ||
      session.handoff_reason ||
      (session.status === 'waiting_agent' ? 'Live agent request' : 'General chat');

    const needsReply =
      session.status !== 'closed' &&
      latest &&
      (latest.author_type === 'visitor' || latest.author_type === 'system') &&
      (!latestAdmin || Number(latest.id) > Number(latestAdmin.id));

    const hasLeadDetails = !!(latestLead?.name || latestLead?.whatsapp || session.visitor_whatsapp);

    return {
      ...session,
      _messages: msgs,
      _lead: latestLead,
      _latest: latest,
      _needsReply: !!needsReply,
      _displayName: displayName,
      _displayPhone: displayPhone,
      _displayEmail: displayEmail,
      _requestReason: requestReason,
      _hasLeadDetails: hasLeadDetails,
      _messageCount: msgs.length
    };
  });

  liveChatSessions.sort((a,b) => {
    if(a._needsReply !== b._needsReply) return a._needsReply ? -1 : 1;
    if(a.status === 'waiting_agent' && b.status !== 'waiting_agent') return -1;
    if(b.status === 'waiting_agent' && a.status !== 'waiting_agent') return 1;
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

function renderLiveInboxStats(){
  const host = document.getElementById('liveSessionList')?.parentElement;
  if(!host) return;

  let stats = document.getElementById('liveInboxStats');
  if(!stats){
    stats = document.createElement('div');
    stats.id = 'liveInboxStats';
    stats.className = 'live-inbox-stats';
    host.insertBefore(stats, document.getElementById('liveSessionList'));
  }

  const open = liveChatSessions.filter(s => s.status !== 'closed').length;
  const unanswered = liveChatSessions.filter(s => s._needsReply).length;
  const live = liveChatSessions.filter(s => s.status === 'waiting_agent' || s.status === 'live_agent').length;
  const withPhone = liveChatSessions.filter(s => s._displayPhone).length;

  stats.innerHTML = `
    <div><span>Open</span><strong>${open}</strong></div>
    <div><span>Unanswered</span><strong>${unanswered}</strong></div>
    <div><span>Live Agent</span><strong>${live}</strong></div>
    <div><span>With Phone</span><strong>${withPhone}</strong></div>
  `;
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
        session._displayName,
        session._displayPhone,
        session._displayEmail,
        session.status,
        session._requestReason,
        session._latest?.content,
        session._lead?.message
      ].join(' ').toLowerCase();
      return text.includes(search);
    });
  }

  if(filtered.length === 0){
    list.innerHTML = '<div class="empty-inbox-table"><strong>No requests in this view.</strong><p>Try another filter or search term.</p></div>';
    return;
  }

  list.innerHTML = `
    <div class="support-request-table-wrap">
      <table class="support-request-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Request / Latest Message</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(session => {
            const name = session._displayName || 'Website Visitor';
            const initials = getInitials(name);
            const latestText = session._lead?.message || session._latest?.content || 'No message yet';
            const time = formatShortTime(session._latest?.created_at || session.updated_at || session.created_at);
            const phone = session._displayPhone || 'No phone';
            const statusText = session._needsReply ? 'UNANSWERED' : (session.status || 'bot_mode');
            const statusClass = session._needsReply ? 'unanswered' : (session.status || 'bot_mode');
            const rowClass = [
              session.id === selectedLiveSessionId ? 'active' : '',
              session._needsReply ? 'needs-reply' : '',
              session._hasLeadDetails ? 'has-details' : 'missing-details'
            ].join(' ');

            return `
              <tr class="${rowClass}" data-sid="${escapeHTML(String(session.id))}">
                <td>
                  <div class="support-client-cell">
                    <div class="wa-avatar small">${escapeHTML(initials)}</div>
                    <div>
                      <strong>${escapeHTML(name)}</strong>
                      <span>${escapeHTML(session._displayEmail || 'Website chat')}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="support-message-cell">
                    <strong>${escapeHTML(session._requestReason || 'General chat')}</strong>
                    <p>${escapeHTML(String(latestText).slice(0, 140))}</p>
                    <small>${Number(session._messageCount || 0)} messages</small>
                  </div>
                </td>
                <td>${escapeHTML(phone)}</td>
                <td>
                  <span class="status-pill ${escapeHTML(statusClass)}">${escapeHTML(statusText)}</span>
                  ${session._hasLeadDetails ? '<small class="detail-ok">Details saved</small>' : '<small class="detail-missing">No details</small>'}
                </td>
                <td>${escapeHTML(time)}</td>
                <td>
                  <button class="open-chat-btn" type="button" onclick="selectLiveSession('${escapeHTML(String(session.id))}')">Open</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
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


function openSelectedClientWhatsapp(){
  if(!selectedLiveSessionId) return showMessage('Select a client chat first.', 'red');

  const session = liveChatSessions.find(s => s.id === selectedLiveSessionId);
  const rawPhone = session?._displayPhone || session?.visitor_whatsapp || '';
  const clean = String(rawPhone).replace(/[^\d]/g, '');

  if(!clean){
    showMessage('This client has no WhatsApp number saved. Ask them to submit details first.', 'red');
    return;
  }

  const text = encodeURIComponent(`Hello ${session?._displayName || ''}, this is Emmanuel from LHISKEY KICK TRADES. I saw your request and I am here to assist you.`);
  window.open(`https://wa.me/${clean}?text=${text}`, '_blank');
}

function ensureSelectedChatActionsV157(){
  const statusBox = document.getElementById('liveChatStatus');
  if(!statusBox) return;

  let btn = document.getElementById('selectedWhatsappBtnV157');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'selectedWhatsappBtnV157';
    btn.type = 'button';
    btn.className = 'ghost-btn selected-whatsapp-btn';
    btn.textContent = 'WhatsApp Client';
    btn.onclick = openSelectedClientWhatsapp;
    statusBox.insertAdjacentElement('afterend', btn);
  }
}

async function loadLiveMessages(){
  if(!selectedLiveSessionId) return;

  const { data: freshSession } = await supabaseClient
    .from('chat_sessions')
    .select('*')
    .eq('id', selectedLiveSessionId)
    .single();

  const session = freshSession || liveChatSessions.find(s => s.id === selectedLiveSessionId);
  const enriched = liveChatSessions.find(s => s.id === selectedLiveSessionId);

  const displayName = enriched?._displayName || session?.visitor_name || session?.visitor_label || 'Website Visitor';
  const displayPhone = enriched?._displayPhone || session?.visitor_whatsapp || 'Not provided';
  const displayEmail = enriched?._displayEmail || session?.visitor_email || 'Not provided';
  const requestReason = enriched?._requestReason || session?.handoff_reason || 'General chat';

  document.getElementById('liveChatTitle').textContent = displayName;
  document.getElementById('liveChatMeta').innerHTML =
    `<span><strong>Phone:</strong> ${escapeHTML(displayPhone)}</span> · <span><strong>Email:</strong> ${escapeHTML(displayEmail)}</span> · <span><strong>Request:</strong> ${escapeHTML(requestReason)}</span> · <span><strong>Started:</strong> ${formatDate(session?.created_at)}</span>`;

  const statusBox = document.getElementById('liveChatStatus');
  if(statusBox){
    statusBox.textContent = enriched?._needsReply ? 'UNANSWERED' : (session?.status || 'unknown');
    statusBox.className = 'support-status ' + (enriched?._needsReply ? 'unanswered' : (session?.status || ''));
  }

  ensureSelectedChatActionsV157();

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



/* KNOWLEDGE CATEGORY OPTIONS v15.4 */
const KNOWLEDGE_CATEGORY_OPTIONS_V15_4 = [
  ['faq', 'FAQ / General Questions'],
  ['about', 'About LHISKEY KICK TRADES'],
  ['education', 'Forex Education'],
  ['risk', 'Risk Management'],
  ['psychology', 'Trading Psychology'],
  ['strategy', 'Strategies / SMC / ICT'],
  ['bot', 'Bots / Tools / Automation'],
  ['payments', 'Payments / M-Pesa / Bank'],
  ['access', 'Access Codes / Locked Products'],
  ['policy', 'Policies / Terms / Refunds'],
  ['pricing', 'Pricing / Packages / Quotes'],
  ['support', 'Support / Live Agent'],
  ['products', 'Locked Products / Private Content'],
  ['showcase', 'Safe Showcase / Roadmap'],
  ['private_beta', 'Private Beta / Testing'],
  ['market', 'Market Data / Ticker / Sessions'],
  ['other', 'Other']
];

function ensureKnowledgeCategories(){
  const select = document.getElementById('knowledgeCategoryInput');
  if(!select) return;

  const existingValues = Array.from(select.options).map(o => o.value);
  const missing = KNOWLEDGE_CATEGORY_OPTIONS_V15_4.filter(([value]) => !existingValues.includes(value));

  if(missing.length === 0) return;

  select.innerHTML = KNOWLEDGE_CATEGORY_OPTIONS_V15_4
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}

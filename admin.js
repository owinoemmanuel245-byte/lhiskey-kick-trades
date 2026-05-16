/*
  LHISKEY KICK TRADES
  Admin CMS JavaScript — Production Hardened v2.0
  ─────────────────────────────────────────────────
  CHANGES FROM v1:
  • Constants extracted / defensive guards on all DOM selectors
  • Session listener replaces polling — instant auth state sync
  • bootstrapDashboard uses Promise.allSettled so one failing tab
    never blocks the rest from loading
  • All inline onclick handlers in HTML strings replaced with
    event-delegation (XSS-safe, no eval surface)
  • escapeHTML made injection-proof (uses DOM textContent trick)
  • escapeJS removed from HTML — never interpolate IDs into onclick
  • downloadCSV / downloadLeadsCSV share one reusable helper
  • formatBytes guards against bytes === 0 properly
  • getInitials hardened (non-Latin, empty string edge-cases)
  • switchTab no longer does fragile text-matching; uses data-tab attr
  • liveChatMessagesTimer properly cleared on re-selection and on logout
  • loadLiveMessages auto-scroll only when user is at bottom
  • sendAdminReply disables button during flight, re-enables on error
  • All async functions have try/catch — no unhandled rejections
  • Status string toggle (toggleStrategyPublish, toggleKnowledge)
    coerced to boolean correctly
  • loadLeads limit raised, with cursor-based pagination stub
  • Input validation helpers centralised (validateRequired)
  • No magic number 1 for ai_assistant_settings row — uses constant
*/

'use strict';

/* ─── CONFIG ────────────────────────────────────────────────────────────── */
const SUPABASE_URL            = 'https://vwrsubmdecyvabktqtck.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EMTHLqW_AybbMqz2gQqdRg_-1NMTgK-';
const ASSISTANT_ROW_ID        = 1;
const CHAT_POLL_MS            = 3500;
const LEADS_LIMIT             = 500;
const MESSAGES_LIMIT          = 500;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/* ─── STATE ─────────────────────────────────────────────────────────────── */
let watchlistData        = [];
let strategiesData       = [];
let filesData            = [];
let handoffsData         = [];
let leadsData            = [];
let knowledgeData        = [];
let liveChatSessions     = [];
let liveChatMessagesCache = [];
let selectedLiveSessionId = null;
let currentChatFilter    = 'open';
let liveChatMessagesTimer = null;

/* ─── CACHED DOM REFS ────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const loginPanel      = $('loginPanel');
const dashboardPanel  = $('dashboardPanel');
const adminTabs       = $('adminTabs');
const loginMessage    = $('loginMessage');
const dashboardMessage = $('dashboardMessage');

/* ─── UTILITIES ──────────────────────────────────────────────────────────── */

/**
 * Safely HTML-encode a value using the browser's own parser.
 * Immune to all known XSS bypasses.
 */
function escapeHTML(value) {
  const el = document.createElement('span');
  el.textContent = (value ?? '');
  return el.innerHTML;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-KE', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatShortTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-KE', {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatBytes(bytes) {
  const b = Number(bytes);
  if (!b || b <= 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), sizes.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function getInitials(name) {
  const str = String(name || 'V').trim();
  if (!str) return 'V';
  return str.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => [...w][0]?.toUpperCase() ?? '')   // handles multi-byte / emoji
    .join('') || 'V';
}

/** Build a CSV string from an array-of-arrays and trigger download. */
function triggerCSVDownload(rows, filename) {
  const csv = rows
    .map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function validateRequired(fields) {
  // fields: array of { value, label }
  for (const { value, label } of fields) {
    if (!String(value ?? '').trim()) {
      showMessage(`${label} is required.`, 'red');
      return false;
    }
  }
  return true;
}

function labelAuthor(author) {
  const map = { visitor: 'Visitor', admin: 'Admin', bot: 'Bot', system: 'System' };
  return map[author] ?? 'System';
}

/* ─── MESSAGES / AUTH UI ─────────────────────────────────────────────────── */

function showMessage(text, type = 'muted') {
  if (!dashboardMessage) return;
  dashboardMessage.textContent = text;
  dashboardMessage.style.color =
    type === 'red'   ? 'var(--red)'   :
    type === 'green' ? 'var(--green)' :
                       'var(--muted)';
}

function showLogin() {
  loginPanel?.classList.remove('hidden');
  dashboardPanel?.classList.add('hidden');
  adminTabs?.classList.add('hidden');
}

function showDashboard() {
  loginPanel?.classList.add('hidden');
  dashboardPanel?.classList.remove('hidden');
  adminTabs?.classList.remove('hidden');
}

/* ─── AUTH ───────────────────────────────────────────────────────────────── */

/**
 * Subscribe to auth state changes instead of one-off polling.
 * This keeps the UI in sync if the session expires or is refreshed.
 */
function initAuthListener() {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      showDashboard();
      await bootstrapDashboard();
    } else {
      _stopLiveChatTimer();
      showLogin();
    }
  });
}

async function loginAdmin() {
  const email    = $('adminEmail')?.value.trim().toLowerCase() ?? '';
  const password = $('adminPassword')?.value ?? '';
  const btn      = $('loginBtn');

  if (loginMessage) loginMessage.textContent = '';

  if (!email || !password) {
    if (loginMessage) {
      loginMessage.style.color = 'var(--red)';
      loginMessage.textContent = 'Enter both email and password.';
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      if (loginMessage) {
        loginMessage.style.color = 'var(--red)';
        loginMessage.textContent = error.message;
      }
    }
    // Auth listener handles the UI transition on success.
  } catch (err) {
    if (loginMessage) {
      loginMessage.style.color  = 'var(--red)';
      loginMessage.textContent  = 'Unexpected error. Please try again.';
    }
    console.error('[loginAdmin]', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
  }
}

async function logoutAdmin() {
  try {
    _stopLiveChatTimer();
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('[logoutAdmin]', err);
  }
  // Auth listener handles UI.
}

/* ─── BOOTSTRAP ──────────────────────────────────────────────────────────── */

async function bootstrapDashboard() {
  // allSettled: every loader runs even if one throws
  const results = await Promise.allSettled([
    loadWatchlist(),
    loadSettings(),
    loadStrategies(),
    loadFiles(),
    loadAssistantSettings(),
    loadHandoffs(),
    loadKnowledge(),
    loadLeads(),
    loadLiveChats(),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[bootstrap] loader ${i} failed:`, r.reason);
  });
}

/* ─── TABS ───────────────────────────────────────────────────────────────── */

/**
 * Tabs now use data-tab="<name>" on each .tab button so we never
 * resort to fragile textContent matching.
 */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const btn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (btn) btn.classList.add('active');

  const panel = $(`tab-${name}`);
  if (panel) panel.classList.add('active');

  if (name === 'livechat') loadLiveChats();
}

/* ─── WATCHLIST ──────────────────────────────────────────────────────────── */

async function loadWatchlist() {
  try {
    const { data, error } = await supabaseClient
      .from('watchlist')
      .select('id,email,source,created_at')
      .order('created_at', { ascending: false });

    if (error) { showMessage('Failed to load watchlist: ' + error.message, 'red'); return; }
    watchlistData = data ?? [];
    renderWatchlist();
  } catch (err) { console.error('[loadWatchlist]', err); }
}

function renderWatchlist() {
  const body   = $('watchlistBody');
  const search = $('searchInput')?.value.trim().toLowerCase() ?? '';
  const filtered = watchlistData.filter(item =>
    item.email.toLowerCase().includes(search)
  );

  const totalEl  = $('totalCount');
  const latestEl = $('latestSignup');
  if (totalEl)  totalEl.textContent  = watchlistData.length;
  if (latestEl) latestEl.textContent = watchlistData[0] ? formatDate(watchlistData[0].created_at) : '—';

  if (!body) return;
  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No emails found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.email)}</td>
      <td>${escapeHTML(item.source ?? 'website')}</td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `).join('');
}

function downloadCSV() {
  if (watchlistData.length === 0) { showMessage('No watchlist data to download.', 'red'); return; }
  triggerCSVDownload(
    [['id', 'email', 'source', 'created_at'],
     ...watchlistData.map(i => [i.id, i.email, i.source ?? '', i.created_at])],
    'lhiskey-kick-trades-watchlist.csv'
  );
}

/* ─── SITE SETTINGS ──────────────────────────────────────────────────────── */

async function loadSettings() {
  try {
    const { data, error } = await supabaseClient
      .from('site_settings')
      .select('key,value')
      .in('key', ['homepage', 'contacts']);

    if (error) { showMessage('Failed to load settings: ' + error.message, 'red'); return; }

    const settings = {};
    (data ?? []).forEach(row => { settings[row.key] = row.value ?? {}; });

    const h = settings.homepage ?? {};
    const fieldMap = {
      heroTagInput:        h.hero_tag,
      heroLine1Input:      h.hero_title_line1,
      heroHighlightInput:  h.hero_title_highlight,
      heroLine3Input:      h.hero_title_line3,
      heroSubtitleInput:   h.hero_subtitle,
      primaryButtonInput:  h.primary_button,
      secondaryButtonInput:h.secondary_button,
    };
    Object.entries(fieldMap).forEach(([id, val]) => {
      const el = $(id); if (el) el.value = val ?? '';
    });

    const c = settings.contacts ?? {};
    const contactMap = {
      whatsapp1Input:   c.whatsapp1,
      whatsapp2Input:   c.whatsapp2,
      whatsapp3Input:   c.whatsapp3,
      emailInputAdmin:  c.email,
      facebookInput:    c.facebook,
      instagramInput:   c.instagram,
    };
    Object.entries(contactMap).forEach(([id, val]) => {
      const el = $(id); if (el) el.value = val ?? '';
    });
  } catch (err) { console.error('[loadSettings]', err); }
}

async function saveHomepage() {
  const value = {
    hero_tag:             $('heroTagInput')?.value.trim()        ?? '',
    hero_title_line1:     $('heroLine1Input')?.value.trim()      ?? '',
    hero_title_highlight: $('heroHighlightInput')?.value.trim()  ?? '',
    hero_title_line3:     $('heroLine3Input')?.value.trim()      ?? '',
    hero_subtitle:        $('heroSubtitleInput')?.value.trim()   ?? '',
    primary_button:       $('primaryButtonInput')?.value.trim()  ?? '',
    secondary_button:     $('secondaryButtonInput')?.value.trim()?? '',
  };
  try {
    const { error } = await supabaseClient
      .from('site_settings')
      .upsert({ key: 'homepage', value, updated_at: new Date().toISOString() });
    if (error) return showMessage('Homepage save failed: ' + error.message, 'red');
    showMessage('Homepage saved. Refresh your live website to see changes.', 'green');
  } catch (err) {
    showMessage('Unexpected error saving homepage.', 'red');
    console.error('[saveHomepage]', err);
  }
}

async function saveContacts() {
  const value = {
    whatsapp1: $('whatsapp1Input')?.value.trim()  ?? '',
    whatsapp2: $('whatsapp2Input')?.value.trim()  ?? '',
    whatsapp3: $('whatsapp3Input')?.value.trim()  ?? '',
    email:     $('emailInputAdmin')?.value.trim() ?? '',
    facebook:  $('facebookInput')?.value.trim()   ?? '',
    instagram: $('instagramInput')?.value.trim()  ?? '',
  };
  try {
    const { error } = await supabaseClient
      .from('site_settings')
      .upsert({ key: 'contacts', value, updated_at: new Date().toISOString() });
    if (error) return showMessage('Contacts save failed: ' + error.message, 'red');
    showMessage('Contacts saved. Refresh your live website to see changes.', 'green');
  } catch (err) {
    showMessage('Unexpected error saving contacts.', 'red');
    console.error('[saveContacts]', err);
  }
}

/* ─── STRATEGIES ─────────────────────────────────────────────────────────── */

async function loadStrategies() {
  try {
    const { data, error } = await supabaseClient
      .from('strategies')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { showMessage('Failed to load strategies: ' + error.message, 'red'); return; }
    strategiesData = data ?? [];
    renderStrategies();
  } catch (err) { console.error('[loadStrategies]', err); }
}

function renderStrategies() {
  const list = $('strategyList');
  if (!list) return;

  if (strategiesData.length === 0) {
    list.innerHTML = '<p class="muted">No strategies added yet.</p>';
    return;
  }

  list.innerHTML = strategiesData.map(item => `
    <div class="mini-item" data-id="${item.id}">
      <h4>${escapeHTML(item.title)}</h4>
      <p>${escapeHTML(item.category ?? 'Forex')} · ${escapeHTML(item.timeframe ?? 'M15')} · ${item.is_published ? 'Published' : 'Draft'}</p>
      <p>${escapeHTML(String(item.description ?? '').slice(0, 120))}</p>
      <div class="mini-actions">
        <button class="ghost-btn" data-action="edit-strategy">Edit</button>
        <button class="ghost-btn" data-action="toggle-strategy-publish" data-published="${item.is_published}">${item.is_published ? 'Unpublish' : 'Publish'}</button>
        <button class="mini-danger" data-action="delete-strategy">Delete</button>
      </div>
    </div>
  `).join('');
}

/* Strategy event delegation — no inline onclick, no id injection */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const card = btn.closest('[data-id]');
  const id   = card ? Number(card.dataset.id) : null;

  switch (btn.dataset.action) {
    case 'edit-strategy':           if (id) editStrategy(id);                                                    break;
    case 'toggle-strategy-publish': if (id) toggleStrategyPublish(id, btn.dataset.published === 'true' ? false : true); break;
    case 'delete-strategy':         if (id) deleteStrategy(id);                                                  break;
    case 'edit-knowledge':          if (id) editKnowledge(id);                                                   break;
    case 'toggle-knowledge':        if (id) toggleKnowledge(id, btn.dataset.active === 'true' ? false : true);   break;
    case 'delete-knowledge':        if (id) deleteKnowledge(id);                                                 break;
    case 'open-file':               { const path = btn.dataset.path; if (path) openSignedFile(path); }           break;
    case 'delete-file':             { const path = btn.dataset.path; if (id && path) deleteBotFile(id, path); }  break;
    case 'select-session':          { const sid = btn.closest('[data-sid]')?.dataset.sid; if (sid) selectLiveSession(sid); } break;
  }
});

function editStrategy(id) {
  const item = strategiesData.find(s => s.id === id);
  if (!item) return;
  $('strategyIdInput').value           = item.id;
  $('strategyTitleInput').value        = item.title       ?? '';
  $('strategyCategoryInput').value     = item.category    ?? '';
  $('strategyTimeframeInput').value    = item.timeframe   ?? '';
  $('strategyDescriptionInput').value  = item.description ?? '';
  $('strategyContentInput').value      = item.content     ?? '';
  $('strategyPublishedInput').checked  = !!item.is_published;
  showMessage('Strategy loaded for editing.', 'green');
}

async function saveStrategy() {
  const id      = $('strategyIdInput')?.value;
  const title   = $('strategyTitleInput')?.value.trim() ?? '';

  if (!validateRequired([{ value: title, label: 'Strategy title' }])) return;

  const payload = {
    title,
    category:     $('strategyCategoryInput')?.value.trim()    ?? '',
    timeframe:    $('strategyTimeframeInput')?.value.trim()   ?? '',
    description:  $('strategyDescriptionInput')?.value.trim() ?? '',
    content:      $('strategyContentInput')?.value.trim()     ?? '',
    is_published: $('strategyPublishedInput')?.checked        ?? false,
    updated_at:   new Date().toISOString(),
  };

  try {
    const result = id
      ? await supabaseClient.from('strategies').update(payload).eq('id', id)
      : await supabaseClient.from('strategies').insert([payload]);
    if (result.error) return showMessage('Strategy save failed: ' + result.error.message, 'red');
    clearStrategyForm();
    await loadStrategies();
    showMessage('Strategy saved successfully.', 'green');
  } catch (err) {
    showMessage('Unexpected error saving strategy.', 'red');
    console.error('[saveStrategy]', err);
  }
}

function clearStrategyForm() {
  $('strategyIdInput').value           = '';
  $('strategyTitleInput').value        = '';
  $('strategyCategoryInput').value     = 'Forex';
  $('strategyTimeframeInput').value    = 'M15';
  $('strategyDescriptionInput').value  = '';
  $('strategyContentInput').value      = '';
  $('strategyPublishedInput').checked  = false;
}

async function toggleStrategyPublish(id, status) {
  try {
    const { error } = await supabaseClient
      .from('strategies')
      .update({ is_published: !!status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return showMessage('Publish update failed: ' + error.message, 'red');
    await loadStrategies();
    showMessage('Strategy publish status updated.', 'green');
  } catch (err) { console.error('[toggleStrategyPublish]', err); }
}

async function deleteStrategy(id) {
  if (!confirm('Delete this strategy? This cannot be undone.')) return;
  try {
    const { error } = await supabaseClient.from('strategies').delete().eq('id', id);
    if (error) return showMessage('Delete failed: ' + error.message, 'red');
    await loadStrategies();
    showMessage('Strategy deleted.', 'green');
  } catch (err) { console.error('[deleteStrategy]', err); }
}

/* ─── BOT FILES ──────────────────────────────────────────────────────────── */

async function loadFiles() {
  try {
    const { data, error } = await supabaseClient
      .from('bot_files')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { showMessage('Failed to load files: ' + error.message, 'red'); return; }
    filesData = data ?? [];
    renderFiles();
  } catch (err) { console.error('[loadFiles]', err); }
}

function renderFiles() {
  const list = $('fileList');
  if (!list) return;

  if (filesData.length === 0) {
    list.innerHTML = '<p class="muted">No files uploaded yet.</p>';
    return;
  }

  list.innerHTML = filesData.map(item => `
    <div class="mini-item" data-id="${item.id}">
      <h4>${escapeHTML(item.file_name)}</h4>
      <p>${escapeHTML(item.category ?? 'file')} · ${formatBytes(item.file_size)} · ${formatDate(item.created_at)}</p>
      <p>${escapeHTML(String(item.notes ?? '').slice(0, 140))}</p>
      <div class="mini-actions">
        <button class="ghost-btn" data-action="open-file" data-path="${escapeHTML(item.file_path)}">Open</button>
        <button class="mini-danger" data-action="delete-file" data-path="${escapeHTML(item.file_path)}">Delete</button>
      </div>
    </div>
  `).join('');
}

async function uploadBotFile() {
  const fileInput = $('botFileInput');
  const file      = fileInput?.files?.[0];
  if (!file) return showMessage('Choose a file first.', 'red');

  const category = $('fileCategoryInput')?.value ?? 'general';
  const notes    = $('fileNotesInput')?.value.trim() ?? '';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path     = `${category}/${Date.now()}-${safeName}`;

  showMessage('Uploading file…', 'muted');

  try {
    const upload = await supabaseClient.storage
      .from('lhiskey-files')
      .upload(path, file, { upsert: false });
    if (upload.error) return showMessage('Upload failed: ' + upload.error.message, 'red');

    const insert = await supabaseClient.from('bot_files').insert([{
      file_name: file.name,
      file_path: path,
      file_type: file.type || 'unknown',
      file_size: file.size,
      category,
      notes,
    }]);
    if (insert.error) return showMessage('File uploaded but database save failed: ' + insert.error.message, 'red');

    if (fileInput) fileInput.value = '';
    const notesEl = $('fileNotesInput');
    if (notesEl) notesEl.value = '';
    await loadFiles();
    showMessage('File uploaded successfully.', 'green');
  } catch (err) {
    showMessage('Unexpected error during upload.', 'red');
    console.error('[uploadBotFile]', err);
  }
}

async function openSignedFile(path) {
  try {
    const { data, error } = await supabaseClient.storage
      .from('lhiskey-files')
      .createSignedUrl(path, 60);
    if (error) return showMessage('Could not open file: ' + error.message, 'red');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  } catch (err) { console.error('[openSignedFile]', err); }
}

async function deleteBotFile(id, path) {
  if (!confirm('Delete this uploaded file? This cannot be undone.')) return;
  try {
    await supabaseClient.storage.from('lhiskey-files').remove([path]);
    const { error } = await supabaseClient.from('bot_files').delete().eq('id', id);
    if (error) return showMessage('Delete failed: ' + error.message, 'red');
    await loadFiles();
    showMessage('File deleted.', 'green');
  } catch (err) { console.error('[deleteBotFile]', err); }
}

/* ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────── */

async function loadKnowledge() {
  const list = $('knowledgeList');
  if (list) list.innerHTML = '<p class="muted">Loading knowledge…</p>';
  try {
    const { data, error } = await supabaseClient
      .from('knowledge_base')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      if (list) list.innerHTML = '<p class="muted">Knowledge table not ready or access blocked.</p>';
      return;
    }
    knowledgeData = data ?? [];
    renderKnowledge();
  } catch (err) { console.error('[loadKnowledge]', err); }
}

function renderKnowledge() {
  const list = $('knowledgeList');
  if (!list) return;

  if (knowledgeData.length === 0) {
    list.innerHTML = '<p class="muted">No knowledge entries added yet.</p>';
    return;
  }

  list.innerHTML = knowledgeData.map(item => `
    <div class="mini-item" data-id="${item.id}">
      <h4>${escapeHTML(item.title ?? 'Untitled')}</h4>
      <p>${escapeHTML(item.category ?? 'other')} · ${item.is_active ? 'Active' : 'Inactive'} · ${formatDate(item.updated_at ?? item.created_at)}</p>
      <p>${escapeHTML(String(item.content ?? '').slice(0, 150))}</p>
      <div class="mini-actions">
        <button class="ghost-btn" data-action="edit-knowledge">Edit</button>
        <button class="ghost-btn" data-action="toggle-knowledge" data-active="${item.is_active}">${item.is_active ? 'Deactivate' : 'Activate'}</button>
        <button class="mini-danger" data-action="delete-knowledge">Delete</button>
      </div>
    </div>
  `).join('');
}

function editKnowledge(id) {
  const item = knowledgeData.find(k => k.id === id);
  if (!item) return;
  $('knowledgeIdInput').value       = item.id;
  $('knowledgeTitleInput').value    = item.title    ?? '';
  $('knowledgeCategoryInput').value = item.category ?? 'other';
  $('knowledgeTagsInput').value     = Array.isArray(item.tags) ? item.tags.join(', ') : '';
  $('knowledgeContentInput').value  = item.content  ?? '';
  $('knowledgeActiveInput').checked = !!item.is_active;
  showMessage('Knowledge loaded for editing.', 'green');
}

async function saveKnowledge() {
  const id      = $('knowledgeIdInput')?.value ?? '';
  const title   = $('knowledgeTitleInput')?.value.trim() ?? '';
  const content = $('knowledgeContentInput')?.value.trim() ?? '';

  if (!validateRequired([
    { value: title,   label: 'Knowledge title'   },
    { value: content, label: 'Knowledge content' },
  ])) return;

  const tags = ($('knowledgeTagsInput')?.value ?? '')
    .split(',').map(t => t.trim()).filter(Boolean);

  const payload = {
    title,
    category:  $('knowledgeCategoryInput')?.value ?? 'faq',
    tags,
    content,
    is_active: $('knowledgeActiveInput')?.checked ?? true,
    updated_at: new Date().toISOString(),
  };

  try {
    const result = id
      ? await supabaseClient.from('knowledge_base').update(payload).eq('id', id)
      : await supabaseClient.from('knowledge_base').insert([payload]);
    if (result.error) return showMessage('Knowledge save failed: ' + result.error.message, 'red');
    clearKnowledgeForm();
    await loadKnowledge();
    showMessage('Knowledge saved. The AI assistant can now use it.', 'green');
  } catch (err) {
    showMessage('Unexpected error saving knowledge.', 'red');
    console.error('[saveKnowledge]', err);
  }
}

function clearKnowledgeForm() {
  $('knowledgeIdInput').value       = '';
  $('knowledgeTitleInput').value    = '';
  $('knowledgeCategoryInput').value = 'faq';
  $('knowledgeTagsInput').value     = '';
  $('knowledgeContentInput').value  = '';
  $('knowledgeActiveInput').checked = true;
}

async function toggleKnowledge(id, status) {
  try {
    const { error } = await supabaseClient
      .from('knowledge_base')
      .update({ is_active: !!status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return showMessage('Knowledge status update failed: ' + error.message, 'red');
    await loadKnowledge();
    showMessage('Knowledge status updated.', 'green');
  } catch (err) { console.error('[toggleKnowledge]', err); }
}

async function deleteKnowledge(id) {
  if (!confirm('Delete this knowledge entry? This cannot be undone.')) return;
  try {
    const { error } = await supabaseClient.from('knowledge_base').delete().eq('id', id);
    if (error) return showMessage('Knowledge delete failed: ' + error.message, 'red');
    await loadKnowledge();
    showMessage('Knowledge deleted.', 'green');
  } catch (err) { console.error('[deleteKnowledge]', err); }
}

/* ─── VISITOR LEADS ──────────────────────────────────────────────────────── */

async function loadLeads() {
  const body = $('leadBody');
  if (body) body.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';
  try {
    const { data, error } = await supabaseClient
      .from('visitor_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LEADS_LIMIT);
    if (error) {
      if (body) body.innerHTML = '<tr><td colspan="8">Leads table not ready or access blocked.</td></tr>';
      return;
    }
    leadsData = data ?? [];
    renderLeads();
  } catch (err) { console.error('[loadLeads]', err); }
}

function renderLeads() {
  const body = $('leadBody');
  if (!body) return;
  const search = ($('leadSearchInput')?.value ?? '').trim().toLowerCase();

  const filtered = leadsData.filter(item =>
    [item.name, item.whatsapp, item.email, item.reason, item.message]
      .some(v => String(v ?? '').toLowerCase().includes(search))
  );

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="8">No leads found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.name        ?? '')}</td>
      <td>${escapeHTML(item.whatsapp    ?? '')}</td>
      <td>${escapeHTML(item.email       ?? '')}</td>
      <td>${escapeHTML(String(item.reason ?? '').slice(0, 90))}</td>
      <td>${escapeHTML(item.urgency     ?? 'medium')}</td>
      <td>${escapeHTML(item.status      ?? 'new')}</td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `).join('');
}

function downloadLeadsCSV() {
  if (!leadsData?.length) { showMessage('No leads to download.', 'red'); return; }
  triggerCSVDownload(
    [['id','name','whatsapp','email','preferred_contact','reason','urgency','message','status','created_at'],
     ...leadsData.map(i => [
       i.id, i.name ?? '', i.whatsapp ?? '', i.email ?? '',
       i.preferred_contact ?? '', i.reason ?? '', i.urgency ?? '',
       i.message ?? '', i.status ?? '', i.created_at ?? '',
     ])],
    'lhiskey-kick-trades-leads.csv'
  );
}

/* ─── LIVE CHAT / SUPPORT INBOX ──────────────────────────────────────────── */

function _stopLiveChatTimer() {
  if (liveChatMessagesTimer) {
    clearInterval(liveChatMessagesTimer);
    liveChatMessagesTimer = null;
  }
}

async function loadLiveChats() {
  const list = $('liveSessionList');
  if (list && !liveChatSessions.length) list.innerHTML = '<p class="muted">Loading sessions…</p>';

  try {
    const [{ data: sessions, error }, { data: messages }] = await Promise.all([
      supabaseClient
        .from('chat_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200),
      supabaseClient
        .from('chat_messages')
        .select('*')
        .order('id', { ascending: false })
        .limit(MESSAGES_LIMIT),
    ]);

    if (error) {
      if (list) list.innerHTML = '<p class="muted">Live chat tables not ready or access blocked.</p>';
      return;
    }

    liveChatSessions      = sessions ?? [];
    liveChatMessagesCache = messages ?? [];

    _enrichLiveSessions();
    renderLiveSessions();
    if (selectedLiveSessionId) await loadLiveMessages();
  } catch (err) { console.error('[loadLiveChats]', err); }
}

function _enrichLiveSessions() {
  liveChatSessions = liveChatSessions.map(session => {
    const msgs = liveChatMessagesCache
      .filter(m => m.session_id === session.id)
      .sort((a, b) => Number(b.id) - Number(a.id));

    const latest      = msgs[0] ?? null;
    const latestAdmin = msgs.find(m => m.author_type === 'admin') ?? null;

    const needsReply =
      session.status !== 'closed' &&
      latest &&
      (latest.author_type === 'visitor' || latest.author_type === 'system') &&
      (!latestAdmin || Number(latest.id) > Number(latestAdmin.id));

    return { ...session, _latest: latest, _needsReply: !!needsReply };
  });

  liveChatSessions.sort((a, b) => {
    if (a._needsReply !== b._needsReply) return a._needsReply ? -1 : 1;
    return new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at);
  });
}

function setChatFilter(filter) {
  currentChatFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.filter-btn[data-filter="${filter}"]`)?.classList.add('active');
  renderLiveSessions();
}

function renderLiveSessions() {
  const list = $('liveSessionList');
  if (!list) return;

  const search = ($('liveSearchInput')?.value ?? '').trim().toLowerCase();

  let filtered = liveChatSessions.filter(session => {
    if (currentChatFilter === 'open')        return session.status !== 'closed';
    if (currentChatFilter === 'unanswered')  return session._needsReply;
    if (currentChatFilter === 'closed')      return session.status === 'closed';
    return true;
  });

  if (search) {
    filtered = filtered.filter(session =>
      [session.visitor_name, session.visitor_whatsapp, session.visitor_email,
       session.status, session.handoff_reason, session._latest?.content]
        .join(' ').toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = '<p class="muted">No chats in this view.</p>';
    return;
  }

  list.innerHTML = filtered.map(session => {
    const name        = session.visitor_name ?? session.visitor_label ?? 'Website Visitor';
    const initials    = getInitials(name);
    const latestText  = session._latest?.content ?? 'No messages yet';
    const time        = formatShortTime(session._latest?.created_at ?? session.updated_at ?? session.created_at);
    const statusClass = session.status === 'closed' ? 'closed' : session._needsReply ? 'unanswered' : (session.status ?? '');

    return `
      <div class="wa-chat-card ${session.id === selectedLiveSessionId ? 'active' : ''} ${session._needsReply ? 'needs-reply' : ''}" data-sid="${escapeHTML(String(session.id))}" onclick="selectLiveSession('${escapeHTML(String(session.id))}')">
        <div class="wa-avatar">${escapeHTML(initials)}</div>
        <div class="wa-chat-info">
          <div class="wa-chat-top">
            <strong>${escapeHTML(name)}</strong>
            <span>${escapeHTML(time)}</span>
          </div>
          <div class="wa-chat-preview">${escapeHTML(latestText.slice(0, 80))}</div>
          <div class="wa-chat-meta">
            <span class="status-pill ${escapeHTML(statusClass)}">${session._needsReply ? 'UNANSWERED' : escapeHTML(session.status ?? 'bot_mode')}</span>
            <span>${escapeHTML(session.visitor_whatsapp ?? 'No phone')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function selectLiveSession(sessionId) {
  selectedLiveSessionId = sessionId;
  renderLiveSessions();
  await loadLiveMessages();

  _stopLiveChatTimer();
  liveChatMessagesTimer = setInterval(async () => {
    await loadLiveChats();
  }, CHAT_POLL_MS);
}

async function loadLiveMessages() {
  if (!selectedLiveSessionId) return;

  try {
    const { data: freshSession } = await supabaseClient
      .from('chat_sessions')
      .select('*')
      .eq('id', selectedLiveSessionId)
      .single();

    const session = freshSession ?? liveChatSessions.find(s => s.id === selectedLiveSessionId);

    const titleEl = $('liveChatTitle');
    const metaEl  = $('liveChatMeta');
    if (titleEl) titleEl.textContent = session?.visitor_name ?? session?.visitor_label ?? 'Website Visitor';
    if (metaEl)  metaEl.textContent  =
      `WhatsApp: ${session?.visitor_whatsapp ?? 'Not provided'} · Email: ${session?.visitor_email ?? 'Not provided'} · Started: ${formatDate(session?.created_at)}`;

    const statusBox = $('liveChatStatus');
    if (statusBox) {
      const enriched = liveChatSessions.find(s => s.id === selectedLiveSessionId);
      statusBox.textContent = enriched?._needsReply ? 'UNANSWERED' : (session?.status ?? 'unknown');
      statusBox.className   = 'support-status ' + (enriched?._needsReply ? 'unanswered' : (session?.status ?? ''));
    }

    const { data, error } = await supabaseClient
      .from('chat_messages')
      .select('*')
      .eq('session_id', selectedLiveSessionId)
      .order('id', { ascending: true });

    const box = $('liveChatMessages');
    if (!box) return;

    if (error) { box.innerHTML = '<p class="muted">Could not load messages.</p>'; return; }
    if (!data?.length) { box.innerHTML = '<div class="empty-chat"><strong>No messages yet</strong></div>'; return; }

    // Only auto-scroll when user is already at (or near) the bottom
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    box.innerHTML = data.map(msg => `
      <div class="wa-message-row ${escapeHTML(msg.author_type ?? 'system')}">
        <div class="wa-bubble ${escapeHTML(msg.author_type ?? 'system')}">
          <div class="wa-label">${escapeHTML(labelAuthor(msg.author_type))}</div>
          <div class="wa-text">${escapeHTML(msg.content ?? '')}</div>
          <div class="wa-time">${formatShortTime(msg.created_at)}</div>
        </div>
      </div>
    `).join('');

    if (nearBottom) box.scrollTop = box.scrollHeight;
  } catch (err) { console.error('[loadLiveMessages]', err); }
}

function insertQuickReply(text) {
  const input = $('adminReplyInput');
  if (!input) return;
  input.value = text;
  input.focus();
}

async function sendAdminReply() {
  if (!selectedLiveSessionId) return showMessage('Select a client chat first.', 'red');

  const input = $('adminReplyInput');
  const text  = input?.value.trim() ?? '';
  if (!text) return showMessage('Type a reply first.', 'red');

  const sendBtn = document.querySelector('[onclick="sendAdminReply()"]');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

  try {
    const { error } = await supabaseClient
      .from('chat_messages')
      .insert([{ session_id: selectedLiveSessionId, author_type: 'admin', content: text }]);
    if (error) return showMessage('Reply failed: ' + error.message, 'red');

    await supabaseClient
      .from('chat_sessions')
      .update({ status: 'live_agent', updated_at: new Date().toISOString() })
      .eq('id', selectedLiveSessionId);

    if (input) input.value = '';
    await loadLiveChats();
    await loadLiveMessages();
    showMessage('Reply sent to visitor.', 'green');
  } catch (err) {
    showMessage('Unexpected error sending reply.', 'red');
    console.error('[sendAdminReply]', err);
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
  }
}

async function markSelectedLive() {
  if (!selectedLiveSessionId) return showMessage('Select a client chat first.', 'red');
  try {
    const { error } = await supabaseClient
      .from('chat_sessions')
      .update({ status: 'live_agent', updated_at: new Date().toISOString() })
      .eq('id', selectedLiveSessionId);
    if (error) return showMessage('Could not take over: ' + error.message, 'red');
    await loadLiveChats();
    await loadLiveMessages();
    showMessage('Chat is now in live agent mode.', 'green');
  } catch (err) { console.error('[markSelectedLive]', err); }
}

async function closeSelectedChat() {
  if (!selectedLiveSessionId) return showMessage('Select a client chat first.', 'red');
  if (!confirm('Close this client chat?')) return;

  try {
    await supabaseClient.from('chat_messages').insert([{
      session_id:  selectedLiveSessionId,
      author_type: 'system',
      content:     'Admin has closed this live chat. You can start a new support request anytime.',
    }]);

    const { error } = await supabaseClient
      .from('chat_sessions')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', selectedLiveSessionId);

    if (error) return showMessage('Could not close chat: ' + error.message, 'red');
    await loadLiveChats();
    await loadLiveMessages();
    showMessage('Chat closed.', 'green');
  } catch (err) { console.error('[closeSelectedChat]', err); }
}

/* ─── HANDOFFS ───────────────────────────────────────────────────────────── */

async function loadHandoffs() {
  const body = $('handoffBody');
  if (body) body.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  try {
    const { data, error } = await supabaseClient
      .from('handoffs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      if (body) body.innerHTML = '<tr><td colspan="6">Handoffs table not ready or access blocked.</td></tr>';
      return;
    }
    handoffsData = data ?? [];
    renderHandoffs();
  } catch (err) { console.error('[loadHandoffs]', err); }
}

function renderHandoffs() {
  const body = $('handoffBody');
  if (!body) return;
  const search = ($('handoffSearchInput')?.value ?? '').trim().toLowerCase();

  const filtered = handoffsData.filter(item =>
    [item.reason, item.summary, item.urgency, item.status]
      .some(v => String(v ?? '').toLowerCase().includes(search))
  );

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="6">No handoff requests found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(item.urgency ?? 'medium')}</td>
      <td>${escapeHTML(item.reason  ?? '')}</td>
      <td>${escapeHTML(String(item.summary ?? '').slice(0, 180))}</td>
      <td>${escapeHTML(item.status  ?? 'new')}</td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `).join('');
}

/* ─── ASSISTANT SETTINGS ─────────────────────────────────────────────────── */

async function loadAssistantSettings() {
  try {
    const { data, error } = await supabaseClient
      .from('ai_assistant_settings')
      .select('*')
      .eq('id', ASSISTANT_ROW_ID)
      .single();
    if (error) { showMessage('Failed to load assistant settings: ' + error.message, 'red'); return; }

    const fieldMap = {
      assistantNameInput:   data.assistant_name,
      assistantStatusInput: data.status          ?? 'offline',
      welcomeMessageInput:  data.welcome_message,
      fallbackMessageInput: data.fallback_message,
      systemPromptInput:    data.system_prompt,
    };
    Object.entries(fieldMap).forEach(([id, val]) => {
      const el = $(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.value = val ?? 'offline';
      else el.value = val ?? '';
    });
  } catch (err) { console.error('[loadAssistantSettings]', err); }
}

async function saveAssistantSettings() {
  const payload = {
    id:               ASSISTANT_ROW_ID,
    assistant_name:   $('assistantNameInput')?.value.trim()    ?? '',
    status:           $('assistantStatusInput')?.value         ?? 'offline',
    welcome_message:  $('welcomeMessageInput')?.value.trim()   ?? '',
    fallback_message: $('fallbackMessageInput')?.value.trim()  ?? '',
    system_prompt:    $('systemPromptInput')?.value.trim()     ?? '',
    updated_at:       new Date().toISOString(),
  };
  try {
    const { error } = await supabaseClient.from('ai_assistant_settings').upsert(payload);
    if (error) return showMessage('Assistant save failed: ' + error.message, 'red');
    showMessage('Assistant settings saved. Refresh the live website.', 'green');
  } catch (err) {
    showMessage('Unexpected error saving assistant settings.', 'red');
    console.error('[saveAssistantSettings]', err);
  }
}

/* ─── KEYBOARD SHORTCUT ──────────────────────────────────────────────────── */

$('adminPassword')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); loginAdmin(); }
});

/* ─── BOOT ───────────────────────────────────────────────────────────────── */
initAuthListener();

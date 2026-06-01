/**
 * ══════════════════════════════════════════════════════════════════
 *  GODTIER ZERO 1 BOT — API SERVER  v1.0.0
 *  Parent brand: LHISKEY KICK TRADES
 *  File: api/bot.js  (Vercel serverless function)
 *
 *  ARCHITECTURE:
 *  Single entry-point function routing all bot API actions.
 *  Uses Supabase service role key (server-side only — never exposed).
 *  All sensitive data (license keys, device IDs) is hashed before storage.
 *
 *  ENV VARS REQUIRED (add to Vercel project settings):
 *  - SUPABASE_SERVICE_ROLE_KEY   (already exists from existing website)
 *  - BOT_API_SECRET              (new — random 64-char string, set in Vercel)
 *
 *  SUPABASE_URL is hardcoded (same project as existing website).
 *
 *  ENDPOINTS (all via POST /api/bot?action=<action>):
 *  ── LICENSE ──────────────────────────────────────────────────────
 *  POST /api/bot?action=license.activate      Activate a license key
 *  POST /api/bot?action=license.check         Validate license status
 *  POST /api/bot?action=license.heartbeat     Regular bot ping
 *  ── DEVICE ───────────────────────────────────────────────────────
 *  POST /api/bot?action=device.bind           Bind device to license
 *  POST /api/bot?action=device.reset-request  User requests device reset
 *  ── SUBSCRIPTION ─────────────────────────────────────────────────
 *  POST /api/bot?action=subscription.status   Get subscription status
 *  POST /api/bot?action=subscription.create   Create/renew subscription
 *  ── CONFIG ───────────────────────────────────────────────────────
 *  GET  /api/bot?action=config.get            Fetch bot config profile
 *  ── LOGGING ──────────────────────────────────────────────────────
 *  POST /api/bot?action=log.trade             Log a trade event
 *  POST /api/bot?action=log.risk              Log a risk event
 *  POST /api/bot?action=log.signal            Log a signal event
 *  ── USER DASHBOARD ───────────────────────────────────────────────
 *  POST /api/bot?action=user.dashboard        Full user dashboard data
 *  POST /api/bot?action=user.trades           User trade history
 *  POST /api/bot?action=user.risk-events      User risk event history
 *  ── ADMIN ────────────────────────────────────────────────────────
 *  POST /api/bot?action=admin.overview        Admin stats overview
 *  POST /api/bot?action=admin.users           All subscribers list
 *  POST /api/bot?action=admin.licenses        All licenses list
 *  POST /api/bot?action=admin.trades          All trades (filterable)
 *  POST /api/bot?action=admin.disable-user    Disable a user's license
 *  POST /api/bot?action=admin.reset-device    Reset a device lock
 *  POST /api/bot?action=admin.push-config     Update a config profile
 *  POST /api/bot?action=admin.kill-switch     Toggle global kill switch
 *  POST /api/bot?action=admin.extend-sub      Manually extend subscription
 * ══════════════════════════════════════════════════════════════════
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────
const SUPABASE_URL              = 'https://vwrsubmdecyvabktqtck.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOT_API_SECRET            = process.env.BOT_API_SECRET            || '';

// Rate limiting (simple in-memory — good for low-volume bot pings)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX       = 60;     // 60 requests per minute per IP

// ─────────────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bot-Secret, X-License-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Slow down.' });
  }

  // Server config check
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[bot.js] Missing SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ ok: false, error: 'Server configuration error.' });
  }

  const action = String(req.query?.action || '').trim().toLowerCase();
  if (!action) {
    return res.status(400).json({ ok: false, error: 'Missing action parameter.' });
  }

  const body = req.method === 'POST' ? (req.body || {}) : {};

  try {
    // ── LICENSE routes ──────────────────────────────────────────
    if (action === 'license.activate')     return await handleLicenseActivate(req, res, body);
    if (action === 'license.check')        return await handleLicenseCheck(req, res, body);
    if (action === 'license.heartbeat')    return await handleHeartbeat(req, res, body);

    // ── DEVICE routes ───────────────────────────────────────────
    if (action === 'device.bind')          return await handleDeviceBind(req, res, body);
    if (action === 'device.reset-request') return await handleDeviceResetRequest(req, res, body);

    // ── SUBSCRIPTION routes ─────────────────────────────────────
    if (action === 'subscription.status')  return await handleSubscriptionStatus(req, res, body);
    if (action === 'subscription.create')  return await handleSubscriptionCreate(req, res, body);

    // ── CONFIG routes ───────────────────────────────────────────
    if (action === 'config.get')           return await handleConfigGet(req, res, body);

    // ── LOG routes ──────────────────────────────────────────────
    if (action === 'log.trade')            return await handleLogTrade(req, res, body);
    if (action === 'log.risk')             return await handleLogRisk(req, res, body);
    if (action === 'log.signal')           return await handleLogSignal(req, res, body);

    // ── USER DASHBOARD routes ────────────────────────────────────
    if (action === 'user.dashboard')       return await handleUserDashboard(req, res, body);
    if (action === 'user.trades')          return await handleUserTrades(req, res, body);
    if (action === 'user.risk-events')     return await handleUserRiskEvents(req, res, body);

    // ── ADMIN routes (require admin auth) ───────────────────────
    if (action === 'admin.overview')       return await handleAdminOverview(req, res, body);
    if (action === 'admin.users')          return await handleAdminUsers(req, res, body);
    if (action === 'admin.licenses')       return await handleAdminLicenses(req, res, body);
    if (action === 'admin.trades')         return await handleAdminTrades(req, res, body);
    if (action === 'admin.disable-user')   return await handleAdminDisableUser(req, res, body);
    if (action === 'admin.reset-device')   return await handleAdminResetDevice(req, res, body);
    if (action === 'admin.push-config')    return await handleAdminPushConfig(req, res, body);
    if (action === 'admin.kill-switch')    return await handleAdminKillSwitch(req, res, body);
    if (action === 'admin.extend-sub')     return await handleAdminExtendSub(req, res, body);

    return res.status(404).json({ ok: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error(`[bot.js][${action}]`, err);
    return res.status(500).json({ ok: false, error: 'Internal server error.', detail: err.message });
  }
}


// ═══════════════════════════════════════════════════════════════
//  LICENSE HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Activate a license key.
 * Called once when user first sets up the bot.
 * Body: { license_key, device_id, device_label, broker_name, broker_server, mt5_account }
 */
async function handleLicenseActivate(req, res, body) {
  const { license_key, device_id, device_label, broker_name, broker_server, mt5_account } = body;

  if (!license_key || !device_id) {
    return res.status(400).json({ ok: false, error: 'license_key and device_id are required.' });
  }

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const deviceHash  = await sha256(String(device_id).trim());
  const accountHash = mt5_account ? await sha256(String(mt5_account).trim()) : null;

  // Find the license
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=*`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) {
    await logRiskEvent(null, null, deviceHash, 'device_mismatch', 'high',
      'License activation attempt with invalid key.', null);
    return res.status(404).json({ ok: false, error: 'Invalid license key.' });
  }

  // Check status
  if (license.status === 'revoked') {
    return res.status(403).json({ ok: false, error: 'This license has been revoked. Contact support.' });
  }
  if (license.status === 'suspended') {
    return res.status(403).json({ ok: false, error: 'This license is suspended. Contact admin.' });
  }
  if (license.is_kill_switched) {
    return res.status(403).json({ ok: false, error: 'License kill switch is active. Contact admin.' });
  }

  // Check expiry
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    await dbPatch(`/bot_licenses?id=eq.${license.id}`, { status: 'expired', updated_at: now() });
    return res.status(403).json({ ok: false, error: 'License expired. Please renew your subscription.' });
  }

  // Check if already bound to a different device
  if (license.current_device_id && license.current_device_id !== deviceHash) {
    await logRiskEvent(license.user_id, license.id, deviceHash, 'device_mismatch', 'high',
      'License activation attempted from unregistered device.', null);
    return res.status(403).json({
      ok: false,
      error: 'This license is bound to another device. Contact admin to reset device lock.'
    });
  }

  // Bind device
  await dbPatch(`/bot_licenses?id=eq.${license.id}`, {
    current_device_id: deviceHash,
    status:            'active',
    activated_at:      license.activated_at || now(),
    last_checked_at:   now(),
    updated_at:        now()
  });

  // Upsert device record
  const existingDevice = await dbGet(
    `/bot_devices?license_id=eq.${license.id}&device_id_hash=eq.${deviceHash}&select=id`
  );
  if (!Array.isArray(existingDevice) || existingDevice.length === 0) {
    await dbPost('/bot_devices', {
      user_id:          license.user_id,
      license_id:       license.id,
      device_id_hash:   deviceHash,
      device_label:     sanitize(device_label, 100) || 'MT5 Device',
      broker_name:      sanitize(broker_name, 80),
      broker_server:    sanitize(broker_server, 80),
      mt5_account_hash: accountHash,
      bot_version:      sanitize(body.bot_version, 20) || '1.0.0',
      status:           'active',
      first_seen_at:    now(),
      last_seen_at:     now()
    });
  } else {
    await dbPatch(
      `/bot_devices?license_id=eq.${license.id}&device_id_hash=eq.${deviceHash}`,
      { last_seen_at: now(), status: 'active' }
    );
  }

  // Get config
  const config = await getActiveConfig(license.mode || 'standard');

  return res.status(200).json({
    ok:          true,
    message:     'License activated successfully.',
    license_id:  license.id,
    user_id:     license.user_id,
    mode:        license.mode,
    expires_at:  license.expires_at,
    config:      stripSensitiveConfig(config)
  });
}


/**
 * Check license validity before every trading session.
 * Called by bot on startup and before session open.
 * Body: { license_key, device_id, bot_version }
 */
async function handleLicenseCheck(req, res, body) {
  const { license_key, device_id, bot_version } = body;

  if (!license_key || !device_id) {
    return res.status(400).json({ ok: false, error: 'license_key and device_id are required.' });
  }

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const deviceHash  = await sha256(String(device_id).trim());

  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=*`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) {
    return res.status(404).json({ ok: false, error: 'Invalid license key.', can_trade: false });
  }

  // Check global kill switch first
  const config = await getActiveConfig(license.mode || 'standard');
  if (config?.global_kill_switch) {
    return res.status(200).json({
      ok:          false,
      can_trade:   false,
      reason:      'kill_switch',
      message:     `Global kill switch is active. Reason: ${config.kill_switch_reason || 'Admin override.'}`,
      license_id:  license.id
    });
  }

  // Per-license kill switch
  if (license.is_kill_switched) {
    return res.status(200).json({
      ok:        false,
      can_trade: false,
      reason:    'license_kill_switch',
      message:   'Your license kill switch is active. Contact admin.'
    });
  }

  // Status checks
  if (license.status === 'revoked') {
    return res.status(200).json({ ok: false, can_trade: false, reason: 'revoked', message: 'License revoked.' });
  }
  if (license.status === 'suspended') {
    return res.status(200).json({ ok: false, can_trade: false, reason: 'suspended', message: 'License suspended.' });
  }

  // Expiry check
  if (!license.expires_at || new Date(license.expires_at) < new Date()) {
    await dbPatch(`/bot_licenses?id=eq.${license.id}`, { status: 'expired', updated_at: now() });
    return res.status(200).json({
      ok:        false,
      can_trade: false,
      reason:    'expired',
      message:   'Subscription expired. Please renew at lhiskeykicktrades.com'
    });
  }

  // Device check
  if (license.current_device_id && license.current_device_id !== deviceHash) {
    await logRiskEvent(license.user_id, license.id, deviceHash, 'device_mismatch', 'critical',
      'License check from unregistered device.', null);
    return res.status(200).json({
      ok:        false,
      can_trade: false,
      reason:    'device_mismatch',
      message:   'Device not authorized for this license. Contact admin.'
    });
  }

  // Bot version check
  const minVersion = config?.min_bot_version || '1.0.0';
  if (bot_version && compareVersions(bot_version, minVersion) < 0) {
    return res.status(200).json({
      ok:        false,
      can_trade: false,
      reason:    'version_outdated',
      message:   `Bot version ${bot_version} is outdated. Minimum: ${minVersion}. Please update.`
    });
  }

  // Update last checked
  await dbPatch(`/bot_licenses?id=eq.${license.id}`, { last_checked_at: now(), updated_at: now() });

  return res.status(200).json({
    ok:          true,
    can_trade:   true,
    license_id:  license.id,
    user_id:     license.user_id,
    mode:        license.mode,
    expires_at:  license.expires_at,
    days_left:   daysBetween(new Date(), new Date(license.expires_at)),
    config:      stripSensitiveConfig(config)
  });
}


/**
 * Regular heartbeat from running bot.
 * Called every 5–15 minutes while bot is running.
 * Body: { license_key, device_id, bot_version, broker_name, account_equity,
 *         account_balance, open_positions, server_time }
 */
async function handleHeartbeat(req, res, body) {
  const { license_key, device_id, bot_version,
          broker_name, account_equity, account_balance,
          open_positions, server_time } = body;

  if (!license_key || !device_id) {
    return res.status(400).json({ ok: false, error: 'license_key and device_id are required.' });
  }

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const deviceHash  = await sha256(String(device_id).trim());

  const licenses = await dbGet(
    `/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id,status,expires_at,current_device_id,is_kill_switched,mode`
  );
  const license = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) {
    return res.status(200).json({ ok: false, can_trade: false, reason: 'invalid_license' });
  }

  // Quick status checks
  const expired = !license.expires_at || new Date(license.expires_at) < new Date();
  const wrongDevice = license.current_device_id && license.current_device_id !== deviceHash;
  const killed = license.is_kill_switched;

  let heartbeatStatus = 'ok';
  let canTrade = true;
  let message  = null;

  if (license.status !== 'active' || expired) {
    heartbeatStatus = 'expired';
    canTrade = false;
    message  = 'Subscription expired. Please renew.';
  } else if (killed) {
    heartbeatStatus = 'kill_switch_active';
    canTrade = false;
    message  = 'Kill switch is active. Stop trading.';
  } else if (wrongDevice) {
    heartbeatStatus = 'device_mismatch';
    canTrade = false;
    message  = 'Device not authorized.';
    await logRiskEvent(license.user_id, license.id, deviceHash, 'device_mismatch', 'critical',
      'Heartbeat from unauthorized device.', null);
  }

  // Check global kill switch
  if (canTrade) {
    const config = await getActiveConfig(license.mode || 'standard');
    if (config?.global_kill_switch) {
      heartbeatStatus = 'kill_switch_active';
      canTrade = false;
      message  = config.kill_switch_reason || 'Global kill switch active.';
    }
  }

  // Insert heartbeat record
  await dbPost('/bot_heartbeats', {
    user_id:        license.user_id,
    license_id:     license.id,
    device_id_hash: deviceHash,
    bot_version:    sanitize(bot_version, 20),
    broker_name:    sanitize(broker_name, 80),
    account_equity:  parseFloat(account_equity) || null,
    account_balance: parseFloat(account_balance) || null,
    open_positions:  parseInt(open_positions) || 0,
    server_time:    server_time ? new Date(server_time).toISOString() : now(),
    status:         heartbeatStatus,
    created_at:     now()
  });

  // Update device last_seen
  if (!wrongDevice) {
    await dbPatch(
      `/bot_devices?license_id=eq.${license.id}&device_id_hash=eq.${deviceHash}`,
      { last_seen_at: now() }
    );
  }

  return res.status(200).json({
    ok:        canTrade,
    can_trade: canTrade,
    status:    heartbeatStatus,
    message:   message || 'Heartbeat received.',
    timestamp: now()
  });
}


// ═══════════════════════════════════════════════════════════════
//  DEVICE HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Bind a device to a license.
 * Used when switching to a new PC or fresh MT5 install.
 * Body: { license_key, device_id, device_label, broker_name, mt5_account }
 */
async function handleDeviceBind(req, res, body) {
  const { license_key, device_id, device_label, broker_name, mt5_account } = body;

  if (!license_key || !device_id) {
    return res.status(400).json({ ok: false, error: 'license_key and device_id are required.' });
  }

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const deviceHash  = await sha256(String(device_id).trim());
  const accountHash = mt5_account ? await sha256(String(mt5_account).trim()) : null;

  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=*`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license || !['active', 'inactive'].includes(license.status)) {
    return res.status(404).json({ ok: false, error: 'License not found or not available for binding.' });
  }

  if (license.current_device_id && license.current_device_id !== deviceHash) {
    await logRiskEvent(license.user_id, license.id, deviceHash, 'device_mismatch', 'high',
      'Device bind attempt on already-bound license.', null);
    return res.status(403).json({
      ok:    false,
      error: 'License already bound to another device. Contact admin to reset device lock.'
    });
  }

  await dbPatch(`/bot_licenses?id=eq.${license.id}`, {
    current_device_id: deviceHash,
    status:            'active',
    updated_at:        now()
  });

  // Upsert device
  const existing = await dbGet(`/bot_devices?license_id=eq.${license.id}&device_id_hash=eq.${deviceHash}&select=id`);
  if (!Array.isArray(existing) || existing.length === 0) {
    await dbPost('/bot_devices', {
      user_id:          license.user_id,
      license_id:       license.id,
      device_id_hash:   deviceHash,
      device_label:     sanitize(device_label, 100) || 'MT5 Device',
      broker_name:      sanitize(broker_name, 80),
      mt5_account_hash: accountHash,
      status:           'active',
      first_seen_at:    now(),
      last_seen_at:     now()
    });
  } else {
    await dbPatch(
      `/bot_devices?license_id=eq.${license.id}&device_id_hash=eq.${deviceHash}`,
      { last_seen_at: now(), status: 'active' }
    );
  }

  return res.status(200).json({ ok: true, message: 'Device bound successfully.' });
}


/**
 * User requests device reset (cannot reset own device for security).
 * This just flags the request — admin must approve via admin.reset-device.
 * Body: { license_key, reason }
 */
async function handleDeviceResetRequest(req, res, body) {
  const { license_key, reason } = body;

  if (!license_key) return res.status(400).json({ ok: false, error: 'license_key is required.' });

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) return res.status(404).json({ ok: false, error: 'License not found.' });

  // Log the reset request as an admin action (admin_id = null = user-initiated)
  await dbPost('/bot_admin_actions', {
    admin_id:         '00000000-0000-0000-0000-000000000000', // system placeholder
    admin_email:      'user-request',
    action_type:      'device_reset_request',
    target_user_id:   license.user_id,
    target_license_id: license.id,
    description:      `User requested device reset. Reason: ${sanitize(reason, 200) || 'Not provided'}`,
    created_at:       now()
  });

  return res.status(200).json({
    ok:      true,
    message: 'Device reset request submitted. Admin will review within 24 hours. Contact support on WhatsApp for faster help.'
  });
}


// ═══════════════════════════════════════════════════════════════
//  SUBSCRIPTION HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get subscription status for a user.
 * Body: { license_key }
 */
async function handleSubscriptionStatus(req, res, body) {
  const { license_key } = body;
  if (!license_key) return res.status(400).json({ ok: false, error: 'license_key is required.' });

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=user_id,status,expires_at,mode`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) return res.status(404).json({ ok: false, error: 'License not found.' });

  const subs = await dbGet(
    `/bot_subscriptions?user_id=eq.${license.user_id}&status=eq.active&order=created_at.desc&limit=1`
  );
  const sub = Array.isArray(subs) ? subs[0] : null;

  const isActive = license.status === 'active' && license.expires_at && new Date(license.expires_at) > new Date();

  return res.status(200).json({
    ok:            true,
    is_active:     isActive,
    status:        license.status,
    plan:          sub?.plan_name || license.mode || 'standard',
    expires_at:    license.expires_at,
    days_left:     license.expires_at ? daysBetween(new Date(), new Date(license.expires_at)) : 0,
    payment_ref:   sub?.payment_reference || null,
    renewal_url:   'https://lhiskeykicktrades.vercel.app/#payments'
  });
}


/**
 * Create or renew a subscription.
 * Called by payment webhook or admin manually.
 * Body: { user_id, plan_name, payment_reference, payment_provider, amount_paid, currency, license_key_hash? }
 * PROTECTED: requires BOT_API_SECRET header
 */
async function handleSubscriptionCreate(req, res, body) {
  if (!verifySecret(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  const { user_id, plan_name, payment_reference, payment_provider,
          amount_paid, currency, license_key_hash } = body;

  if (!user_id) return res.status(400).json({ ok: false, error: 'user_id is required.' });

  const startsAt  = new Date();
  const expiresAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

  // Create subscription
  const subResult = await dbPost('/bot_subscriptions', {
    user_id:           user_id,
    plan_name:         sanitize(plan_name, 50) || 'standard',
    status:            'active',
    started_at:        startsAt.toISOString(),
    expires_at:        expiresAt.toISOString(),
    payment_reference: sanitize(payment_reference, 200),
    payment_provider:  sanitize(payment_provider, 50) || 'mpesa',
    amount_paid:       parseFloat(amount_paid) || 0,
    currency:          sanitize(currency, 10) || 'KES',
    created_at:        now(),
    updated_at:        now()
  }, 'return=representation');

  const subId = subResult?.[0]?.id;

  // Create or update license
  if (license_key_hash) {
    // Renew existing license
    await dbPatch(`/bot_licenses?license_key_hash=eq.${license_key_hash}`, {
      status:         'active',
      expires_at:     expiresAt.toISOString(),
      subscription_id: subId,
      updated_at:     now()
    });
  } else {
    // Generate a new license key hash
    const rawKey  = `GT1-${user_id.slice(0,8).toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    const keyHash = await sha256(rawKey);

    await dbPost('/bot_licenses', {
      user_id:          user_id,
      subscription_id:  subId,
      license_key_hash: keyHash,
      status:           'active',
      mode:             sanitize(plan_name, 50) || 'standard',
      max_devices:      1,
      expires_at:       expiresAt.toISOString(),
      created_at:       now(),
      updated_at:       now()
    });

    // NOTE: rawKey is returned ONCE here and must be shown to user immediately.
    // It is never stored in plaintext — only the hash is stored.
    return res.status(200).json({
      ok:          true,
      message:     'Subscription created. License key generated.',
      license_key: rawKey, // ← show this to user ONCE
      expires_at:  expiresAt.toISOString(),
      plan:        plan_name || 'standard'
    });
  }

  return res.status(200).json({
    ok:         true,
    message:    'Subscription renewed successfully.',
    expires_at: expiresAt.toISOString()
  });
}


// ═══════════════════════════════════════════════════════════════
//  CONFIG HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Get bot config for a license.
 * Called by bot on startup and before each session.
 * Body: { license_key, device_id }
 */
async function handleConfigGet(req, res, body) {
  const { license_key, device_id } = body;

  if (!license_key) return res.status(400).json({ ok: false, error: 'license_key is required.' });

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,status,mode,expires_at,is_kill_switched`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license || license.status !== 'active') {
    return res.status(403).json({ ok: false, error: 'License not active.' });
  }

  const config = await getActiveConfig(license.mode || 'standard');
  if (!config) return res.status(404).json({ ok: false, error: 'No active config found.' });

  return res.status(200).json({
    ok:     true,
    config: stripSensitiveConfig(config),
    mode:   license.mode
  });
}


// ═══════════════════════════════════════════════════════════════
//  LOGGING HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Log a trade event from the bot.
 * Body: { license_key, device_id, trade: { ...trade fields } }
 */
async function handleLogTrade(req, res, body) {
  const { license_key, device_id, trade } = body;

  if (!license_key || !trade) {
    return res.status(400).json({ ok: false, error: 'license_key and trade are required.' });
  }

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id,status`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) return res.status(404).json({ ok: false, error: 'Invalid license.' });

  const tradeRecord = {
    user_id:              license.user_id,
    license_id:           license.id,
    mt5_ticket:           parseInt(trade.mt5_ticket) || null,
    symbol:               sanitize(trade.symbol, 20),
    direction:            ['BUY','SELL'].includes(trade.direction) ? trade.direction : null,
    entry_price:          parseFloat(trade.entry_price) || null,
    stop_loss:            parseFloat(trade.stop_loss) || null,
    take_profit:          parseFloat(trade.take_profit) || null,
    lot_size:             parseFloat(trade.lot_size) || null,
    risk_percent:         parseFloat(trade.risk_percent) || null,
    risk_amount_usd:      parseFloat(trade.risk_amount_usd) || null,
    session_name:         sanitize(trade.session_name, 50),
    market_regime:        sanitize(trade.market_regime, 50),
    bot_mode:             sanitize(trade.bot_mode, 50),
    decision_score:       parseInt(trade.decision_score) || null,
    score_session:        parseInt(trade.score_session) || null,
    score_bias_1h:        parseInt(trade.score_bias_1h) || null,
    score_setup_15m:      parseInt(trade.score_setup_15m) || null,
    score_trigger_5m:     parseInt(trade.score_trigger_5m) || null,
    score_volume:         parseInt(trade.score_volume) || null,
    score_atr:            parseInt(trade.score_atr) || null,
    score_spread:         parseInt(trade.score_spread) || null,
    score_liquidity:      parseInt(trade.score_liquidity) || null,
    score_risk:           parseInt(trade.score_risk) || null,
    strategy_reason:      sanitize(trade.strategy_reason, 500),
    bias_1h:              sanitize(trade.bias_1h, 20),
    volume_score:         sanitize(trade.volume_score, 20),
    atr_value:            parseFloat(trade.atr_value) || null,
    spread_at_entry:      parseFloat(trade.spread_at_entry) || null,
    slippage_pips:        parseFloat(trade.slippage_pips) || null,
    gold_liquidity_swept: Boolean(trade.gold_liquidity_swept),
    gold_reclaim_confirmed: Boolean(trade.gold_reclaim_confirmed),
    status:               sanitize(trade.status, 20) || 'open',
    close_price:          parseFloat(trade.close_price) || null,
    close_reason:         sanitize(trade.close_reason, 50),
    profit_loss_pips:     parseFloat(trade.profit_loss_pips) || null,
    profit_loss_usd:      parseFloat(trade.profit_loss_usd) || null,
    rr_achieved:          parseFloat(trade.rr_achieved) || null,
    moved_to_breakeven:   Boolean(trade.moved_to_breakeven),
    partial_closed:       Boolean(trade.partial_closed),
    trailing_active:      Boolean(trade.trailing_active),
    opened_at:            trade.opened_at ? new Date(trade.opened_at).toISOString() : now(),
    closed_at:            trade.closed_at ? new Date(trade.closed_at).toISOString() : null,
    created_at:           now()
  };

  // Upsert: if mt5_ticket exists, update; otherwise insert
  let result;
  if (trade.mt5_ticket && trade.status !== 'open') {
    result = await dbPatch(
      `/bot_trades?license_id=eq.${license.id}&mt5_ticket=eq.${trade.mt5_ticket}`,
      tradeRecord
    );
    if (!result || result.length === 0) {
      result = await dbPost('/bot_trades', tradeRecord, 'return=representation');
    }
  } else {
    result = await dbPost('/bot_trades', tradeRecord, 'return=representation');
  }

  return res.status(200).json({ ok: true, message: 'Trade logged.', trade_id: result?.[0]?.id });
}


/**
 * Log a risk event.
 * Body: { license_key, device_id, event: { ...risk event fields } }
 */
async function handleLogRisk(req, res, body) {
  const { license_key, device_id, event } = body;

  if (!license_key || !event) {
    return res.status(400).json({ ok: false, error: 'license_key and event are required.' });
  }

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) return res.status(404).json({ ok: false, error: 'Invalid license.' });

  await logRiskEvent(
    license.user_id,
    license.id,
    null,
    sanitize(event.event_type, 80) || 'unknown',
    sanitize(event.severity, 20) || 'medium',
    sanitize(event.message, 500),
    sanitize(event.symbol, 20),
    {
      session_name:    sanitize(event.session_name, 50),
      risk_percent:    parseFloat(event.risk_percent) || null,
      account_equity:  parseFloat(event.account_equity) || null,
      account_balance: parseFloat(event.account_balance) || null,
      spread_value:    parseFloat(event.spread_value) || null,
      decision_score:  parseInt(event.decision_score) || null,
      failed_filter:   sanitize(event.failed_filter, 100),
      bot_mode:        sanitize(event.bot_mode, 50)
    }
  );

  return res.status(200).json({ ok: true, message: 'Risk event logged.' });
}


/**
 * Log a signal (taken or skipped).
 * Body: { license_key, signal: { ...signal fields } }
 */
async function handleLogSignal(req, res, body) {
  const { license_key, signal } = body;

  if (!license_key || !signal) {
    return res.status(400).json({ ok: false, error: 'license_key and signal are required.' });
  }

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) return res.status(404).json({ ok: false, error: 'Invalid license.' });

  await dbPost('/bot_signal_logs', {
    user_id:          license.user_id,
    license_id:       license.id,
    symbol:           sanitize(signal.symbol, 20),
    session_name:     sanitize(signal.session_name, 50),
    signal_type:      sanitize(signal.signal_type, 50),
    direction:        ['BUY','SELL'].includes(signal.direction) ? signal.direction : null,
    bot_mode:         sanitize(signal.bot_mode, 50),
    market_regime:    sanitize(signal.market_regime, 50),
    decision_score:   parseInt(signal.decision_score) || null,
    score_session:    parseInt(signal.score_session) || null,
    score_bias_1h:    parseInt(signal.score_bias_1h) || null,
    score_setup_15m:  parseInt(signal.score_setup_15m) || null,
    score_trigger_5m: parseInt(signal.score_trigger_5m) || null,
    score_volume:     parseInt(signal.score_volume) || null,
    score_atr:        parseInt(signal.score_atr) || null,
    score_spread:     parseInt(signal.score_spread) || null,
    score_liquidity:  parseInt(signal.score_liquidity) || null,
    score_risk:       parseInt(signal.score_risk) || null,
    bias_1h:          sanitize(signal.bias_1h, 20),
    prev_15m_high:    parseFloat(signal.prev_15m_high) || null,
    prev_15m_low:     parseFloat(signal.prev_15m_low) || null,
    breakout_price:   parseFloat(signal.breakout_price) || null,
    atr_value:        parseFloat(signal.atr_value) || null,
    spread_value:     parseFloat(signal.spread_value) || null,
    volume_ratio:     parseFloat(signal.volume_ratio) || null,
    trade_taken:      Boolean(signal.trade_taken),
    trade_id:         signal.trade_id || null,
    rejection_reason: sanitize(signal.rejection_reason, 300),
    failed_filters:   signal.failed_filters ? JSON.stringify(signal.failed_filters) : null,
    created_at:       now()
  });

  return res.status(200).json({ ok: true, message: 'Signal logged.' });
}


// ═══════════════════════════════════════════════════════════════
//  USER DASHBOARD HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleUserDashboard(req, res, body) {
  const { license_key } = body;
  if (!license_key) return res.status(400).json({ ok: false, error: 'license_key is required.' });

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id,status,mode,expires_at`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;

  if (!license) return res.status(404).json({ ok: false, error: 'License not found.' });

  // Call the Supabase helper function
  const dashResult = await dbRpc('bot_get_user_dashboard', { p_user_id: license.user_id });

  return res.status(200).json({
    ok:          true,
    license_id:  license.id,
    mode:        license.mode,
    expires_at:  license.expires_at,
    days_left:   license.expires_at ? daysBetween(new Date(), new Date(license.expires_at)) : 0,
    dashboard:   dashResult
  });
}


async function handleUserTrades(req, res, body) {
  const { license_key, page = 1, limit = 20, symbol, session } = body;
  if (!license_key) return res.status(400).json({ ok: false, error: 'license_key is required.' });

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;
  if (!license) return res.status(404).json({ ok: false, error: 'License not found.' });

  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(50, parseInt(limit));
  let query = `/bot_trades?user_id=eq.${license.user_id}&order=opened_at.desc&limit=${Math.min(50, parseInt(limit))}&offset=${offset}`;
  if (symbol) query += `&symbol=eq.${encodeURIComponent(sanitize(symbol, 20))}`;
  if (session) query += `&session_name=eq.${encodeURIComponent(sanitize(session, 50))}`;

  const trades = await dbGet(query);
  return res.status(200).json({ ok: true, trades: trades || [], page, limit });
}


async function handleUserRiskEvents(req, res, body) {
  const { license_key, page = 1, limit = 20 } = body;
  if (!license_key) return res.status(400).json({ ok: false, error: 'license_key is required.' });

  const licenseHash = await sha256(String(license_key).trim().toUpperCase());
  const licenses = await dbGet(`/bot_licenses?license_key_hash=eq.${licenseHash}&select=id,user_id`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;
  if (!license) return res.status(404).json({ ok: false, error: 'License not found.' });

  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(50, parseInt(limit));
  const events = await dbGet(
    `/bot_risk_events?user_id=eq.${license.user_id}&order=created_at.desc&limit=${Math.min(50, parseInt(limit))}&offset=${offset}`
  );

  return res.status(200).json({ ok: true, events: events || [], page, limit });
}


// ═══════════════════════════════════════════════════════════════
//  ADMIN HANDLERS  (all require BOT_API_SECRET or admin session)
// ═══════════════════════════════════════════════════════════════

function requireAdmin(req) {
  // Option 1: BOT_API_SECRET header (for server-to-server admin calls)
  if (verifySecret(req)) return true;
  // Option 2: Supabase admin session via Authorization header
  // The admin.js frontend uses Supabase auth — admin dashboard calls
  // come with the user's JWT. We trust service role in api/bot.js.
  // For now, secret header is the gate. Future: verify Supabase JWT role.
  return false;
}

async function handleAdminOverview(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const overview = await dbRpc('bot_admin_overview', {});
  return res.status(200).json({ ok: true, overview });
}

async function handleAdminUsers(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { page = 1, limit = 50, status } = body;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
  let query = `/bot_subscriptions?order=created_at.desc&limit=${Math.min(100, parseInt(limit))}&offset=${offset}`;
  if (status) query += `&status=eq.${encodeURIComponent(status)}`;

  const users = await dbGet(query);
  return res.status(200).json({ ok: true, users: users || [], page, limit });
}

async function handleAdminLicenses(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { page = 1, limit = 50, status } = body;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
  let query = `/bot_licenses?order=created_at.desc&limit=${Math.min(100, parseInt(limit))}&offset=${offset}&select=id,user_id,status,mode,expires_at,current_device_id,is_kill_switched,bot_version_allowed,created_at`;
  if (status) query += `&status=eq.${encodeURIComponent(status)}`;

  const licenses = await dbGet(query);
  return res.status(200).json({ ok: true, licenses: licenses || [], page, limit });
}

async function handleAdminTrades(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { page = 1, limit = 50, symbol, user_id, status } = body;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
  let query = `/bot_trades?order=opened_at.desc&limit=${Math.min(100, parseInt(limit))}&offset=${offset}`;
  if (user_id) query += `&user_id=eq.${encodeURIComponent(user_id)}`;
  if (symbol)  query += `&symbol=eq.${encodeURIComponent(sanitize(symbol, 20))}`;
  if (status)  query += `&status=eq.${encodeURIComponent(sanitize(status, 20))}`;

  const trades = await dbGet(query);
  return res.status(200).json({ ok: true, trades: trades || [], page, limit });
}

async function handleAdminDisableUser(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { user_id, license_id, reason, admin_email } = body;
  if (!user_id && !license_id) {
    return res.status(400).json({ ok: false, error: 'user_id or license_id required.' });
  }

  if (license_id) {
    await dbPatch(`/bot_licenses?id=eq.${license_id}`, {
      status:          'suspended',
      is_kill_switched: true,
      admin_notes:     sanitize(reason, 300),
      updated_at:      now()
    });
  }
  if (user_id) {
    await dbPatch(`/bot_licenses?user_id=eq.${user_id}&status=eq.active`, {
      status:          'suspended',
      is_kill_switched: true,
      updated_at:      now()
    });
  }

  await logAdminAction(
    body.admin_id || '00000000-0000-0000-0000-000000000000',
    sanitize(admin_email, 200),
    'disable_user',
    user_id, license_id, null,
    `User/license disabled. Reason: ${sanitize(reason, 200) || 'Not provided'}`
  );

  return res.status(200).json({ ok: true, message: 'User/license disabled.' });
}

async function handleAdminResetDevice(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { license_id, admin_email, admin_id, reason } = body;
  if (!license_id) return res.status(400).json({ ok: false, error: 'license_id is required.' });

  // Get current state for audit
  const licenses = await dbGet(`/bot_licenses?id=eq.${license_id}&select=*`);
  const license  = Array.isArray(licenses) ? licenses[0] : null;
  if (!license) return res.status(404).json({ ok: false, error: 'License not found.' });

  await dbPatch(`/bot_licenses?id=eq.${license_id}`, {
    current_device_id: null,
    updated_at:        now()
  });

  await dbPatch(`/bot_devices?license_id=eq.${license_id}`, {
    status:     'reset_pending',
    last_seen_at: now()
  });

  await logAdminAction(
    admin_id || '00000000-0000-0000-0000-000000000000',
    sanitize(admin_email, 200),
    'reset_device',
    license.user_id, license_id, license.current_device_id,
    `Device reset. Reason: ${sanitize(reason, 200) || 'Admin request'}`,
    { current_device_id: license.current_device_id },
    { current_device_id: null }
  );

  return res.status(200).json({ ok: true, message: 'Device lock reset. User can now rebind.' });
}

async function handleAdminPushConfig(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { config_id, updates, admin_email, admin_id } = body;
  if (!config_id || !updates || typeof updates !== 'object') {
    return res.status(400).json({ ok: false, error: 'config_id and updates object are required.' });
  }

  // Whitelist allowed update fields (security: never let admin update arbitrary fields)
  const allowedFields = [
    'allowed_symbols','allowed_sessions','london_window_mins','ny_window_mins',
    'default_risk_pct','max_risk_pct','admin_hard_cap_pct','max_daily_loss_pct',
    'max_daily_profit_pct','max_trades_per_day','max_trades_per_session',
    'max_consecutive_losses','max_active_symbols','max_total_risk_pct',
    'max_index_group_risk','max_xauusd_risk','atr_period','atr_multiplier_sl',
    'default_rr','strong_volume_rr','volume_avg_period','volume_min_breakout',
    'volume_strong','volume_xauusd_min','max_spread_us500','max_spread_us100',
    'max_spread_us30','max_spread_xauusd','score_min_standard','score_min_aggressive',
    'score_min_xauusd','score_min_prop_firm','breakeven_after_1r','partial_close_at_2r',
    'trail_after_2r','close_before_news','news_pause_before_mins','news_pause_after_mins',
    'xauusd_news_extra_mins','gold_require_sweep','gold_sweep_delay_mins',
    'gold_min_score','min_bot_version','kill_switch_reason','is_active'
  ];

  const safeUpdates = {};
  for (const [key, val] of Object.entries(updates)) {
    if (allowedFields.includes(key)) safeUpdates[key] = val;
  }
  safeUpdates.updated_at = now();

  await dbPatch(`/bot_config_profiles?id=eq.${config_id}`, safeUpdates);

  await logAdminAction(
    admin_id || '00000000-0000-0000-0000-000000000000',
    sanitize(admin_email, 200),
    'push_config',
    null, null, null,
    `Config profile ${config_id} updated.`,
    null,
    safeUpdates
  );

  return res.status(200).json({ ok: true, message: 'Config updated. Active bots will fetch on next check.' });
}

async function handleAdminKillSwitch(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { activate, reason, admin_email, admin_id } = body;
  const isActive = Boolean(activate);

  await dbPatch(`/bot_config_profiles?is_global_default=eq.true`, {
    global_kill_switch:  isActive,
    kill_switch_reason:  sanitize(reason, 300) || (isActive ? 'Admin activated.' : ''),
    updated_at:          now()
  });

  await logAdminAction(
    admin_id || '00000000-0000-0000-0000-000000000000',
    sanitize(admin_email, 200),
    'global_kill_switch',
    null, null, null,
    `Global kill switch ${isActive ? 'ACTIVATED' : 'DEACTIVATED'}. Reason: ${reason || 'None'}`,
    { global_kill_switch: !isActive },
    { global_kill_switch: isActive }
  );

  return res.status(200).json({
    ok:      true,
    message: `Global kill switch ${isActive ? 'ACTIVATED — all bots will stop at next heartbeat.' : 'DEACTIVATED — bots can resume.'}`
  });
}

async function handleAdminExtendSub(req, res, body) {
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { user_id, license_id, days = 30, reason, admin_email, admin_id } = body;
  if (!user_id && !license_id) {
    return res.status(400).json({ ok: false, error: 'user_id or license_id required.' });
  }

  const extraMs = Math.min(365, Math.max(1, parseInt(days))) * 24 * 60 * 60 * 1000;
  const newExpiry = new Date(Date.now() + extraMs).toISOString();

  if (license_id) {
    await dbPatch(`/bot_licenses?id=eq.${license_id}`, {
      status:     'active',
      expires_at: newExpiry,
      updated_at: now()
    });
  }
  if (user_id) {
    await dbPatch(`/bot_subscriptions?user_id=eq.${user_id}&status=in.(active,expired)`, {
      status:     'active',
      expires_at: newExpiry,
      updated_at: now()
    });
    await dbPatch(`/bot_licenses?user_id=eq.${user_id}`, {
      status:     'active',
      expires_at: newExpiry,
      updated_at: now()
    });
  }

  await logAdminAction(
    admin_id || '00000000-0000-0000-0000-000000000000',
    sanitize(admin_email, 200),
    'extend_subscription',
    user_id, license_id, null,
    `Subscription extended by ${days} days. New expiry: ${newExpiry}. Reason: ${sanitize(reason, 200) || 'Admin action'}`,
    null,
    { expires_at: newExpiry }
  );

  return res.status(200).json({ ok: true, message: `Subscription extended by ${days} days.`, new_expiry: newExpiry });
}


// ═══════════════════════════════════════════════════════════════
//  SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════

async function dbGet(path) {
  try {
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const res = await fetch(url, {
      headers: {
        'apikey':        SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json'
      }
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[bot.js][dbGet] ${path}`, res.status, err);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[bot.js][dbGet]', e.message);
    return null;
  }
}

async function dbPost(path, data, prefer = '') {
  try {
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const headers = {
      'apikey':        SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json'
    };
    if (prefer) headers['Prefer'] = prefer;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[bot.js][dbPost] ${path}`, res.status, err);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    console.error('[bot.js][dbPost]', e.message);
    return null;
  }
}

async function dbPatch(path, data) {
  try {
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey':        SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[bot.js][dbPatch] ${path}`, res.status, err);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    console.error('[bot.js][dbPatch]', e.message);
    return null;
  }
}

async function dbRpc(fnName, params) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[bot.js][dbRpc] ${fnName}`, res.status, err);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[bot.js][dbRpc]', e.message);
    return null;
  }
}

async function getActiveConfig(mode) {
  const configs = await dbGet(
    `/bot_config_profiles?bot_mode=eq.${encodeURIComponent(mode)}&is_active=eq.true&order=is_global_default.desc&limit=1`
  );
  if (Array.isArray(configs) && configs.length > 0) return configs[0];

  // Fallback to global default
  const defaults = await dbGet(
    `/bot_config_profiles?is_global_default=eq.true&is_active=eq.true&limit=1`
  );
  return Array.isArray(defaults) ? defaults[0] : null;
}

function stripSensitiveConfig(config) {
  if (!config) return null;
  // Remove internal DB fields before sending to bot
  const { id, created_at, updated_at, ...safe } = config;
  return safe;
}

async function logRiskEvent(userId, licenseId, deviceHash, eventType, severity, message, symbol, extra = {}) {
  try {
    await dbPost('/bot_risk_events', {
      user_id:         userId,
      license_id:      licenseId,
      event_type:      eventType,
      severity:        severity,
      message:         message,
      symbol:          symbol,
      session_name:    extra.session_name || null,
      risk_percent:    extra.risk_percent || null,
      account_equity:  extra.account_equity || null,
      account_balance: extra.account_balance || null,
      spread_value:    extra.spread_value || null,
      decision_score:  extra.decision_score || null,
      failed_filter:   extra.failed_filter || null,
      bot_mode:        extra.bot_mode || null,
      created_at:      now()
    });
  } catch (e) {
    console.error('[bot.js][logRiskEvent]', e.message);
  }
}

async function logAdminAction(adminId, adminEmail, actionType, targetUserId, targetLicenseId, targetDeviceId, description, prev, next) {
  try {
    await dbPost('/bot_admin_actions', {
      admin_id:         adminId,
      admin_email:      adminEmail,
      action_type:      actionType,
      target_user_id:   targetUserId,
      target_license_id: targetLicenseId,
      target_device_id: targetDeviceId,
      description:      description,
      previous_value:   prev ? JSON.stringify(prev) : null,
      new_value:        next ? JSON.stringify(next) : null,
      created_at:       now()
    });
  } catch (e) {
    console.error('[bot.js][logAdminAction]', e.message);
  }
}


// ═══════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════

async function sha256(text) {
  const encoder = new TextEncoder();
  const data     = encoder.encode(text);
  const hashBuf  = await crypto.subtle.digest('SHA-256', data);
  const hashArr  = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function now() {
  return new Date().toISOString();
}

function sanitize(val, maxLen = 500) {
  if (val === null || val === undefined) return null;
  return String(val).slice(0, maxLen).replace(/[<>]/g, '');
}

function daysBetween(d1, d2) {
  const diff = d2 - d1;
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return  1;
  }
  return 0;
}

function verifySecret(req) {
  if (!BOT_API_SECRET) return false;
  const header = req.headers['x-bot-secret'] || req.headers['X-Bot-Secret'] || '';
  return header === BOT_API_SECRET;
}

function checkRateLimit(key) {
  const now    = Date.now();
  const entry  = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count++;
  rateLimitMap.set(key, entry);
  return true;
}

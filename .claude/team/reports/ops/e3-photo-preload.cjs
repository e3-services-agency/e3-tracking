'use strict';
const { OAuth2Client } = require('google-auth-library');
const target = 'http://oauth2-proxy:4180/oauth2/auth';
const audience = process.env.GOOGLE_STAFF_CLIENT_ID;
const domain = (process.env.WORKSPACE_DOMAIN || '').toLowerCase();
function emit(fields) { try { console.error('[e3-photo-diagnostic] ' + JSON.stringify(fields)); } catch {} }
function safePhoto(value) { try { const u = new URL(value); return typeof value === 'string' && value.length <= 2048 && u.protocol === 'https:' && !u.username && !u.password && /^lh[0-9]+\.googleusercontent\.com$/.test(u.hostname); } catch { return false; } }
function flags(payload) { return { picturePresent: typeof payload.picture === 'string' && !!payload.picture, pictureSafe: safePhoto(payload.picture), expiryValid: Number.isFinite(payload.exp) && payload.exp > Date.now() / 1000, audienceMatch: payload.aud === audience, issuerValid: ['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss), emailVerifiedStrict: payload.email_verified === true, emailVerifiedString: payload.email_verified === 'true', domainMatch: typeof payload.hd === 'string' && payload.hd.toLowerCase() === domain }; }
const originalFetch = global.fetch;
global.fetch = function (...args) {
  const result = originalFetch.apply(this, args);
  if (args[0] !== target || !result || typeof result.then !== 'function') return result;
  return result.then(response => {
    try {
      const header = response.headers.get('authorization');
      const token = header && header.match(/^Bearer ([A-Za-z0-9._-]{1,10000})$/)?.[1];
      const email = (response.headers.get('x-auth-request-email') || '').trim().toLowerCase();
      const record = { stage: 'proxy', status202: response.status === 202, tokenHeaderPresent: !!header, bearerWellFormed: !!token, proxyEmailPresent: !!email, proxyDomainMatch: email.split('@')[1] === domain };
      if (token) { try { const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); Object.assign(record, flags(payload), { decodedUnverified: true, emailMatchProxy: typeof payload.email === 'string' && payload.email.trim().toLowerCase() === email }); } catch { record.decodeFailed = true; } }
      emit(record);
    } catch {}
    return response;
  }, error => { emit({ stage: 'proxy', requestFailed: true, aborted: error?.name === 'TimeoutError' || error?.name === 'AbortError' }); throw error; });
};
const originalVerify = OAuth2Client.prototype.verifyIdToken;
OAuth2Client.prototype.verifyIdToken = function (...args) {
  const result = originalVerify.apply(this, args);
  if (!audience || args[0]?.audience !== audience || !result || typeof result.then !== 'function') return result;
  return result.then(ticket => { try { emit({ stage: 'verification', passed: true, ...flags(ticket.getPayload() || {}) }); } catch {} return ticket; }, error => {
    let category = 'other';
    try { const message = String(error?.message || ''); if (message.includes('Token used too late') || message.includes('expired')) category = 'expired'; else if (message.includes('recipient') || message.includes('audience')) category = 'audience'; else if (message.includes('signature') || message.includes('pem')) category = 'signature'; } catch {}
    emit({ stage: 'verification', passed: false, category });
    throw error;
  });
};

'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const M = require('./public/model.js');
const { buildPdf } = require('./lib/pdf');
const { sendReports, sendDriverEmail } = require('./lib/email');
const hubspot = require('./lib/hubspot');
const QRCode = require('qrcode');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

// The page is served from here, but allow embedding from the marketing site too.
// The site and the API are served from the same origin, so CORS is not normally
// involved at all. This stays for the case where the calculator is embedded on
// another domain (Wix, the main site) and posts here cross-origin.
const ALLOWED = (process.env.ALLOWED_ORIGINS ||
  'https://fleet.scoothero.co.za,https://scoothero.co.za,https://www.scoothero.co.za')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes(origin) || ALLOWED.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// crude per-IP throttle so the endpoint can't be used to spam mailboxes
const hits = new Map();
function throttled(ip) {
  const now = Date.now(), win = 60 * 60 * 1000, cap = 8;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > cap;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

app.post('/api/calculation', async (req, res) => {
  const started = Date.now();
  try {
    const { contact = {}, inputs = {}, consent, website, kind } = req.body || {};

    if (website) return res.json({ ok: true });                    // honeypot
    if (!contact.email || !EMAIL_RE.test(String(contact.email)))
      return res.status(400).json({ ok: false, error: 'A valid email address is required.' });
    if (!consent)
      return res.status(400).json({ ok: false, error: 'We need your permission to email and store this.' });
    if (throttled(req.ip))
      return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });

    const c = {
      email: String(contact.email).trim().toLowerCase(),
      name: String(contact.name || '').trim().slice(0, 120),
      company: String(contact.company || '').trim().slice(0, 160),
      phone: String(contact.phone || '').trim().slice(0, 40)
    };
    const parts = c.name.split(/\s+/).filter(Boolean);
    c.firstName = parts[0] || '';
    c.lastName = parts.slice(1).join(' ');

    // Recompute server-side from the inputs — the PDF can never disagree with the page.
    const savings = kind === 'savings';
    const m = savings ? M.computeSavings(inputs) : M.compute(inputs);

    const ref = crypto.randomBytes(4).toString('hex').toUpperCase();
    const safe = (c.company || c.name || c.email.split('@')[0]).replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
    const filename = `ScootHero-fleet-returns-${safe}-${ref}.pdf`;

    const pdf = await buildPdf({ kind, contact: c, inputs, createdAt: Date.now() });

    // HubSpot first so the sales notification can report the outcome
    let hsResult = null;
    try {
      hsResult = await hubspot.record(c, m, pdf, filename, savings);
    } catch (e) {
      console.error('[hubspot] write failed:', e.message);
    }

    try {
      await sendReports(c, m, pdf, filename, { hubspot: hsResult, savings: savings });
    } catch (e) {
      console.error('[email] send failed:', e.message);
      return res.status(502).json({ ok: false, error: 'We saved your figures but could not email them. We will follow up.' });
    }

    console.log(`[calc] ${c.email} · ${m.inputs.bikes} bikes · ${savings ? 'savings' : m.fund} · ${Date.now() - started}ms · hs=${hsResult ? hsResult.contactId : 'fail'}`);
    res.json({ ok: true, reference: ref });
  } catch (e) {
    console.error('[calc] unhandled:', e);
    res.status(500).json({ ok: false, error: 'Something went wrong on our side. Please try again.' });
  }
});

// Optional: let a visitor download the PDF without handing over an email.
app.post('/api/preview.pdf', async (req, res) => {
  try {
    if (throttled(req.ip)) return res.sendStatus(429);
    const pdf = await buildPdf({ kind: (req.body || {}).kind, contact: {}, inputs: (req.body || {}).inputs || {}, createdAt: Date.now() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ScootHero-fleet-returns.pdf"');
    res.send(pdf);
  } catch (e) {
    console.error('[preview]', e);
    res.sendStatus(500);
  }
});

const PORTAL = process.env.DRIVER_PORTAL || 'https://portal.scoothero.co.za/DriverPortal';

function qrSvg(url) {
  return QRCode.toString(url, { type: 'svg', margin: 1, width: 200,
    color: { dark: '#0A0F23', light: '#FFFFFF' } });
}

/* Driver offer — a rider works out their own numbers, we keep them and send
   them a code that carries the figures through to the portal. */
app.post('/api/driver', async (req, res) => {
  const started = Date.now();
  try {
    const { contact = {}, inputs = {}, consent, website } = req.body || {};
    if (website) return res.json({ ok: true });
    if (!contact.email || !EMAIL_RE.test(String(contact.email)))
      return res.status(400).json({ ok: false, error: 'A valid email address is required.' });
    if (!consent)
      return res.status(400).json({ ok: false, error: 'We need your permission to email and store this.' });
    if (throttled(req.ip))
      return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });

    const c = {
      email: String(contact.email).trim().toLowerCase(),
      name: String(contact.name || '').trim().slice(0, 120),
      phone: String(contact.phone || '').trim().slice(0, 40)
    };
    const parts = c.name.split(/\s+/).filter(Boolean);
    c.firstName = parts[0] || '';
    c.lastName = parts.slice(1).join(' ');

    const m = M.computeDriver(inputs);
    const ref = crypto.randomBytes(3).toString('hex').toUpperCase();
    const portalUrl = PORTAL + '?ref=' + ref;
    const qr = await qrSvg(portalUrl);

    let hsResult = null;
    try {
      hsResult = await hubspot.recordDriver(c, m, ref, portalUrl);
    } catch (e) {
      console.error('[hubspot] driver write failed:', e.message);
    }

    try {
      await sendDriverEmail(c, m, ref, portalUrl);
    } catch (e) {
      console.error('[email] driver send failed:', e.message);
      // the rider still gets their code on screen, so this is not fatal
      return res.json({ ok: true, reference: ref, qr, portalUrl, emailed: false });
    }

    console.log(`[driver] ${c.email} · ${Math.round(m.jobsDay)} jobs/day · saves ${Math.round(m.savingMonth)}/mo · ${Date.now() - started}ms · hs=${hsResult ? hsResult.contactId : 'fail'}`);
    res.json({ ok: true, reference: ref, qr, portalUrl, emailed: true });
  } catch (e) {
    console.error('[driver] unhandled:', e);
    res.status(500).json({ ok: false, error: 'Something went wrong on our side. Please try again.' });
  }
});

// plain code, nothing stored — for riders who would rather not leave details
app.get('/api/driver-qr', async (_req, res) => {
  try {
    res.json({ ok: true, qr: await qrSvg(PORTAL), portalUrl: PORTAL });
  } catch (e) {
    console.error('[driver-qr]', e);
    res.status(500).json({ ok: false });
  }
});

app.get('/healthz', (_req, res) => res.json({
  ok: true,
  hubspot: !!process.env.HUBSPOT_TOKEN,
  resend: !!process.env.RESEND_API_KEY
}));

// Landing site + calculator, served from the same origin as the API above.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],      // /calculators -> /calculators.html
  maxAge: '1h'
}));

// Old paths kept alive
app.get('/savings', (_req, res) => res.redirect(301, '/calculators.html#savings'));
app.get('/sector-data', (_req, res) => res.redirect(301, '/resources.html'));

app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Calculator service on :' + PORT));

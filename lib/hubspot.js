'use strict';
const M = require('../public/model.js');

const BASE = 'https://api.hubapi.com';
const TOKEN = () => process.env.HUBSPOT_TOKEN;

function headers(extra) {
  return Object.assign({ Authorization: 'Bearer ' + TOKEN() }, extra || {});
}

async function hs(pathname, options) {
  const res = await fetch(BASE + pathname, options);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error('HubSpot ' + res.status + ' on ' + pathname + ': ' + (body.message || text).slice(0, 300));
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/* ---------- custom properties ---------- */
// Run once via `npm run setup:hubspot`. Safe to re-run; existing ones are skipped.
const PROPERTIES = [
  { name: 'calc_bikes',            label: 'Calculator — bikes',              type: 'number',  fieldType: 'number' },
  { name: 'calc_funding',          label: 'Calculator — funding method',     type: 'string',  fieldType: 'text' },
  { name: 'calc_term_years',       label: 'Calculator — term (years)',       type: 'number',  fieldType: 'number' },
  { name: 'calc_weekly_rent',      label: 'Calculator — weekly rent charged', type: 'number', fieldType: 'number' },
  { name: 'calc_rider_deposit',    label: 'Calculator — rider deposit',      type: 'number',  fieldType: 'number' },
  { name: 'calc_km_per_week',      label: 'Calculator — km per bike a week', type: 'number',  fieldType: 'number' },
  { name: 'calc_herocare_week',    label: 'Calculator — HeroCare per week',  type: 'number',  fieldType: 'number' },
  { name: 'calc_cash_upfront',     label: 'Calculator — cash up front',      type: 'number',  fieldType: 'number' },
  { name: 'calc_monthly_cash',     label: 'Calculator — cash per month',     type: 'number',  fieldType: 'number' },
  { name: 'calc_return_on_revenue',label: 'Calculator — return on revenue %',type: 'number',  fieldType: 'number' },
  { name: 'calc_payback_months',   label: 'Calculator — payback (months)',   type: 'number',  fieldType: 'number' },
  { name: 'calc_profit',           label: 'Calculator — profit over term',   type: 'number',  fieldType: 'number' },
  { name: 'calc_roi_percent',      label: 'Calculator — ROI %',              type: 'number',  fieldType: 'number' },
  { name: 'calc_fleet_value',      label: 'Calculator — fleet value',        type: 'number',  fieldType: 'number' },
  { name: 'calc_proposal_total',   label: 'Calculator — proposal total',     type: 'number',  fieldType: 'number' },
  { name: 'calc_extras',           label: 'Calculator — extras requested',   type: 'string',  fieldType: 'text' },
  { name: 'calc_last_run',         label: 'Calculator — last run',           type: 'datetime', fieldType: 'date' },
  { name: 'calc_run_count',        label: 'Calculator — times run',          type: 'number',  fieldType: 'number' }
];

async function ensureProperties() {
  const created = [];
  for (const p of PROPERTIES) {
    try {
      await hs('/crm/v3/properties/contacts/' + p.name, { headers: headers() });
    } catch (e) {
      if (e.status !== 404) throw e;
      await hs('/crm/v3/properties/contacts', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: p.name, label: p.label, type: p.type, fieldType: p.fieldType,
          groupName: 'contactinformation', description: 'Set by the ScootHero fleet calculator.'
        })
      });
      created.push(p.name);
    }
  }
  return created;
}

/* ---------- contact upsert ---------- */
async function findContact(email) {
  const body = await hs('/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email'],
      limit: 1
    })
  });
  return (body.results && body.results[0]) || null;
}

function contactProps(contact, m) {
  const p = {
    email: contact.email,
    calc_bikes: m.inputs.bikes,
    calc_funding: M.fundLabel(m.fund),
    calc_term_years: m.years,
    calc_weekly_rent: Math.round(m.grossWk),
    calc_rider_deposit: Math.round(m.inputs.deposit),
    calc_km_per_week: Math.round(m.inputs.kmPerWeek),
    calc_herocare_week: Math.round(m.careWk),
    calc_cash_upfront: Math.round(m.upfront),
    calc_monthly_cash: Math.round(m.netM),
    calc_return_on_revenue: +(m.ror * 100).toFixed(1),
    calc_payback_months: isFinite(m.payback) ? Math.ceil(m.payback) : 0,
    calc_profit: Math.round(m.profit),
    calc_roi_percent: Math.round(m.roi * 100),
    calc_fleet_value: Math.round(m.inputs.price * m.inputs.bikes),
    calc_proposal_total: Math.round(m.proposalTotal || 0),
    calc_extras: [m.wantPdi ? 'PDI' : null, m.wantBoxes ? 'Delivery boxes' : null,
                  m.wantGear ? 'Rider gear (quote)' : null].filter(Boolean).join(', ') || 'none',
    calc_last_run: new Date().setUTCHours(0, 0, 0, 0)
  };
  if (contact.firstName) p.firstname = contact.firstName;
  if (contact.lastName) p.lastname = contact.lastName;
  if (contact.company) p.company = contact.company;
  if (contact.phone) p.phone = contact.phone;
  return p;
}

// Strip out any properties HubSpot says don't exist and report which they were.
function dropMissing(props, err) {
  const body = err && err.body;
  const missing = new Set();
  const scan = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(scan);
    if (typeof v === 'object') {
      if (v.error === 'PROPERTY_DOESNT_EXIST' && v.name) missing.add(v.name);
      return Object.values(v).forEach(scan);
    }
    if (typeof v === 'string') {
      // HubSpot embeds an escaped JSON array inside `message`, so the quotes
      // arrive as \" — drop backslashes before matching.
      const flat = v.replace(/\\/g, '');
      let mm;
      const re1 = /Property "([^"]+)" does not exist/g;
      while ((mm = re1.exec(flat))) missing.add(mm[1]);
      const re2 = /"name"\s*:\s*"([^"]+)"/g;
      while ((mm = re2.exec(flat))) missing.add(mm[1]);
    }
  };
  scan(body);
  if (!missing.size) return null;
  const clean = {};
  Object.keys(props).forEach(k => { if (!missing.has(k)) clean[k] = props[k]; });
  return { clean, missing: [...missing] };
}

// Writes the contact. If the portal doesn't have the calc_* properties — which
// needs a schema scope some HubSpot tiers don't grant — this retries with just
// the standard fields. The full calculation still lands in the attached note,
// so nothing is lost; the custom fields simply start populating if they're
// added later.
async function writeContact(id, props) {
  const url = id ? '/crm/v3/objects/contacts/' + id : '/crm/v3/objects/contacts';
  const method = id ? 'PATCH' : 'POST';
  const send = (body) => hs(url, {
    method,
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ properties: body })
  });
  try {
    return await send(props);
  } catch (e) {
    const stripped = e.status === 400 ? dropMissing(props, e) : null;
    if (!stripped) throw e;
    console.warn('[hubspot] custom properties not present, writing without them: ' +
                 stripped.missing.join(', ') + ' — run "npm run setup:hubspot" once the ' +
                 'private app has the crm.schemas.contacts.write scope.');
    return await send(stripped.clean);
  }
}

async function upsertContact(contact, m) {
  const existing = await findContact(contact.email);
  const props = contactProps(contact, m);
  props.calc_run_count = existing
    ? (parseInt(existing.properties && existing.properties.calc_run_count, 10) || 0) + 1
    : 1;

  if (existing) {
    await writeContact(existing.id, props);
    return { id: existing.id, created: false };
  }
  const made = await writeContact(null, props);
  return { id: made.id, created: true };
}

/* ---------- file upload + note ---------- */
async function uploadPdf(buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
  form.append('fileName', filename);
  form.append('folderPath', process.env.HUBSPOT_FOLDER || '/calculator-reports');
  form.append('options', JSON.stringify({
    access: 'PRIVATE', overwrite: false, duplicateValidationStrategy: 'NONE', duplicateValidationScope: 'EXACT_FOLDER'
  }));
  const body = await hs('/files/v3/files', { method: 'POST', headers: headers(), body: form });
  return body.id;
}

async function attachNote(contactId, fileId, m, contact) {
  const money = M.money, pct = M.percent;
  const lines = [
    '<b>Fleet calculator run</b>',
    contact.company ? 'Company: ' + contact.company : null,
    m.inputs.bikes + ' bikes · ' + M.fundLabel(m.fund) + ' · ' + m.years + ' year view',
    'Weekly rent ' + money(m.inputs.rental) + ' · rider deposit ' + money(m.inputs.deposit),
    '—',
    'Cash up front: ' + money(m.upfront),
    'Cash per month: ' + money(m.netM),
    'Return on revenue: ' + pct(m.ror),
    'Payback: ' + (isFinite(m.payback) ? Math.ceil(m.payback) + ' months' : 'n/a'),
    'Profit over ' + m.years + ' years: ' + money(m.profit),
    'ROI: ' + (m.upfront > 0 ? pct(m.roi) : 'n/a'),
    'Fleet value: ' + money(m.inputs.price * m.inputs.bikes),
    m.onRent ? 'Extras: ' + ([m.wantPdi ? 'PDI ' + money(m.pdiTotal) : null,
                              m.wantBoxes ? 'Boxes ' + money(m.boxTotal) : null,
                              m.wantGear ? 'Rider gear — wants a quote' : null].filter(Boolean).join(' · ') || 'none') : null,
    m.onRent ? '<b>Proposal total, excl VAT: ' + money(m.proposalTotal) + '</b>' : null
  ].filter(Boolean);

  const properties = {
    hs_note_body: lines.join('<br>'),
    hs_timestamp: Date.now()
  };
  if (fileId) properties.hs_attachment_ids = String(fileId);

  await hs('/crm/v3/objects/notes', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      properties,
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] // note → contact
      }]
    })
  });
}

async function record(contact, m, pdfBuffer, filename) {
  const { id, created } = await upsertContact(contact, m);
  let fileId = null;
  try {
    fileId = await uploadPdf(pdfBuffer, filename);
  } catch (e) {
    console.error('[hubspot] file upload failed, note will be text-only:', e.message);
  }
  await attachNote(id, fileId, m, contact);
  return { contactId: id, created, fileId };
}

module.exports = { record, ensureProperties, PROPERTIES };

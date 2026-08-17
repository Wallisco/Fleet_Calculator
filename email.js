'use strict';
const M = require('../public/model.js');

const API = 'https://api.resend.com/emails';

async function send(payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Resend ' + res.status + ': ' + JSON.stringify(body).slice(0, 300));
  return body;
}

function row(label, value, strong) {
  return '<tr>' +
    '<td style="padding:7px 0;border-bottom:1px solid #E3E5EC;font:14px Helvetica,Arial,sans-serif;color:#5A5F73">' + label + '</td>' +
    '<td style="padding:7px 0;border-bottom:1px solid #E3E5EC;font:' + (strong ? 'bold ' : '') + '14px Helvetica,Arial,sans-serif;color:#0A0F23;text-align:right">' + value + '</td>' +
    '</tr>';
}

function customerHtml(contact, m) {
  const money = M.money, pct = M.percent;
  const name = contact.firstName || (contact.name || '').split(' ')[0] || 'there';
  return `<!DOCTYPE html><html><body style="margin:0;background:#F4F5F7;padding:24px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#0A0F23;padding:26px">
    <div style="font:bold 20px Helvetica,Arial,sans-serif;color:#fff">ScootHero</div>
    <div style="font:12px Helvetica,Arial,sans-serif;color:#79F1A1;margin-top:4px">Preferred electric motorcycle provider to Takealot</div>
  </div>
  <div style="padding:26px">
    <p style="font:15px Helvetica,Arial,sans-serif;color:#0A0F23;margin:0 0 14px">Hi ${name},</p>
    <p style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23;line-height:1.55;margin:0 0 18px">
      Here are the numbers you put together. The attached PDF has the full breakdown, what we do about
      each of the risks, and — on the last two pages — your proposal and a sign-off page.
      Tick what you want, sign it, send it back, and we raise the invoice from there.
    </p>
    <div style="background:#F26700;border-radius:10px;padding:18px 20px;margin:0 0 18px">
      <div style="font:bold 11px Helvetica,Arial,sans-serif;color:#fff;letter-spacing:1.5px">RETURN ON INVESTMENT</div>
      <div style="font:bold 34px Helvetica,Arial,sans-serif;color:#fff;margin-top:6px">${m.upfront > 0 ? pct(m.roi) : '—'}</div>
      <div style="font:12px Helvetica,Arial,sans-serif;color:#FFE2CD;margin-top:4px">over ${m.years} years, on the ${money(m.upfront)} you put in</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${row('Bikes', m.inputs.bikes)}
      ${row('Paying by', M.fundLabel(m.fund))}
      ${row('Cash per month', money(m.netM), true)}
      ${row('Return on revenue', pct(m.ror))}
      ${row('Money back in', isFinite(m.payback) ? Math.ceil(m.payback) + ' months' : '—')}
      ${row('Profit over ' + m.years + ' years', money(m.profit), true)}
      ${m.onRent ? row('Proposal total, excl VAT', money(m.proposalTotal), true) : ''}
    </table>
    <p style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23;line-height:1.55;margin:20px 0 0">
      Prices hold for 14 days. On a short call we'll confirm the rent your area supports, check swap
      station coverage on your routes, and talk through rider gear if you asked for it.
    </p>
    <p style="margin:22px 0 0">
      <a href="${process.env.BOOKING_URL || 'https://scoothero.co.za'}"
         style="background:#F26700;color:#fff;text-decoration:none;border-radius:8px;padding:13px 24px;font:bold 14px Helvetica,Arial,sans-serif;display:inline-block">
        Book a 15-minute call
      </a>
    </p>
  </div>
  <div style="padding:18px 26px;background:#F4F5F7">
    <p style="font:11px Helvetica,Arial,sans-serif;color:#5A5F73;line-height:1.5;margin:0">
      Estimates only — not a quote or an offer of finance. Finance is subject to credit approval through
      Eqstra, a Nedbank company. All figures exclude VAT. You received this because you asked us to email
      your calculation. Reply with "unsubscribe" and we'll remove you.
    </p>
  </div>
</div></body></html>`;
}

function teamHtml(contact, m, meta) {
  const money = M.money, pct = M.percent;
  return `<!DOCTYPE html><html><body style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23">
<h2 style="margin:0 0 4px">Calculator run — ${contact.company || contact.name || contact.email}</h2>
<p style="color:#5A5F73;margin:0 0 16px">${contact.name || ''} · ${contact.email}${contact.phone ? ' · ' + contact.phone : ''}</p>
<table style="border-collapse:collapse;width:100%;max-width:520px">
  ${row('Bikes', m.inputs.bikes, true)}
  ${row('Fleet value', money(m.inputs.price * m.inputs.bikes))}
  ${row('Paying by', M.fundLabel(m.fund))}
  ${row('Term', m.years + ' years')}
  ${row('Weekly rent set', money(m.inputs.rental))}
  ${row('Rider deposit set', money(m.inputs.deposit))}
  ${row('Utilisation assumed', Math.round(m.inputs.util * 100) + '%')}
  ${row('Cash up front', money(m.upfront))}
  ${row('Cash per month', money(m.netM), true)}
  ${row('Return on revenue', pct(m.ror))}
  ${row('Payback', isFinite(m.payback) ? Math.ceil(m.payback) + ' months' : 'n/a')}
  ${row('Profit over term', money(m.profit), true)}
  ${row('ROI', m.upfront > 0 ? pct(m.roi) : 'n/a')}
  ${m.onRent ? row('PDI', m.wantPdi ? money(m.pdiTotal) : 'declined') : ''}
  ${m.onRent ? row('Delivery boxes', m.wantBoxes ? money(m.boxTotal) : 'declined') : ''}
  ${m.onRent ? row('Rider gear', m.wantGear ? 'wants a quote' : 'not requested') : ''}
  ${m.onRent ? row('PROPOSAL TOTAL, excl VAT', money(m.proposalTotal), true) : ''}
</table>
<p style="color:#5A5F73;margin:16px 0 0">
  ${meta.hubspot ? 'HubSpot contact ' + meta.hubspot.contactId + (meta.hubspot.created ? ' (new)' : ' (updated)') + '. PDF attached to the record.' : 'HubSpot write failed — check logs.'}
</p>
</body></html>`;
}

async function sendReports(contact, m, pdfBuffer, filename, meta) {
  const from = process.env.MAIL_FROM || 'ScootHero <calculator@scoothero.co.za>';
  const attachment = { filename, content: pdfBuffer.toString('base64') };

  const results = { customer: null, team: null };

  results.customer = await send({
    from,
    to: [contact.email],
    subject: (m.onRent ? 'Your ScootHero proposal — ' : 'Your ScootHero fleet costs — ') +
             m.inputs.bikes + (m.inputs.bikes === 1 ? ' bike' : ' bikes'),
    html: customerHtml(contact, m),
    attachments: [attachment],
    reply_to: process.env.MAIL_REPLY_TO || undefined
  });

  const team = (process.env.SALES_INBOX || '').split(',').map(s => s.trim()).filter(Boolean);
  if (team.length) {
    results.team = await send({
      from,
      to: team,
      subject: 'Calculator run — ' + (contact.company || contact.name || contact.email) +
               ' · ' + m.inputs.bikes + ' bikes',
      html: teamHtml(contact, m, meta),
      attachments: [attachment],
      reply_to: contact.email
    });
  }
  return results;
}

module.exports = { sendReports };

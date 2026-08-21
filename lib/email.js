'use strict';
const M = require('../public/model.js');
const money = M.money;
const LEGAL = require('./legal');

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
      <a href="${process.env.BOOKING_URL || 'https://fleet.scoothero.co.za/demo.html'}"
         style="background:#F26700;color:#fff;text-decoration:none;border-radius:8px;padding:13px 24px;font:bold 14px Helvetica,Arial,sans-serif;display:inline-block">
        Book a 15-minute call
      </a>
    </p>
  </div>
  <div style="padding:18px 26px;background:#F4F5F7">
    <p style="font:11px Helvetica,Arial,sans-serif;color:#5A5F73;line-height:1.5;margin:0">
      <b>Indicative only.</b> ${LEGAL.RETURNS_FULL} Finance is subject to credit approval through
      Eqstra, a Nedbank company. All figures exclude VAT.
      <br><br>
      ${LEGAL.POPIA_SHORT} You received this because you asked us to email your calculation.
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

function savingsHtml(contact, m) {
  const money = M.money;
const LEGAL = require('./legal');
  const name = contact.firstName || (contact.name || '').split(' ')[0] || 'there';
  const ok = m.driverBetterOff;
  return `<!DOCTYPE html><html><body style="margin:0;background:#F4F5F7;padding:24px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#0A0F23;padding:26px">
    <div style="font:bold 20px Helvetica,Arial,sans-serif;color:#fff">ScootHero</div>
    <div style="font:12px Helvetica,Arial,sans-serif;color:#79F1A1;margin-top:4px">Preferred electric motorcycle provider to Takealot</div>
  </div>
  <div style="padding:26px">
    <p style="font:15px Helvetica,Arial,sans-serif;color:#0A0F23;margin:0 0 14px">Hi ${name},</p>
    <p style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23;line-height:1.55;margin:0 0 18px">
      Here is the rider deal you put together. The attached PDF has the full week, what the switch is
      worth to you, and a sign-off page on the last sheet.
    </p>
    <div style="background:#F26700;border-radius:10px;padding:18px 20px;margin:0 0 18px">
      <div style="font:bold 11px Helvetica,Arial,sans-serif;color:#fff;letter-spacing:1.5px">EXTRA RENTAL A YEAR</div>
      <div style="font:bold 30px Helvetica,Arial,sans-serif;color:#fff;margin-top:6px">${money(m.operatorUpliftYear)}</div>
      <div style="font:12px Helvetica,Arial,sans-serif;color:#FFE2CD;margin-top:4px">across ${m.inputs.bikes} bikes, on the same riders</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${row('Bikes', m.inputs.bikes)}
      ${row('Petrol price used', money(m.inputs.fuelPrice) + ' /l')}
      ${row('Rider on petrol, a week', money(m.driverPetrolWk))}
      ${row('Rider on electric, a week', money(m.driverElectricWk))}
      ${row('Rider ' + (ok ? 'saves' : 'loses') + ' a week', money(Math.abs(m.driverSavingWk)), true)}
      ${row('Most you could charge', money(m.breakEvenRental))}
    </table>
    <p style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23;line-height:1.55;margin:20px 0 0">
      ${ok
        ? 'Your riders come out ahead, which is what makes the higher rental stick. On a short call we will confirm the rental your area supports and check swap coverage on your routes.'
        : 'At this petrol price the rider would be worse off, so the rental needs to come down before the deal will hold. Worth a short call to work through it.'}
    </p>
    <p style="margin:22px 0 0">
      <a href="${process.env.BOOKING_URL || 'https://fleet.scoothero.co.za/demo.html'}"
         style="background:#F26700;color:#fff;text-decoration:none;border-radius:8px;padding:13px 24px;font:bold 14px Helvetica,Arial,sans-serif;display:inline-block">
        Book a 15-minute call
      </a>
    </p>
  </div>
  <div style="padding:18px 26px;background:#F4F5F7">
    <p style="font:11px Helvetica,Arial,sans-serif;color:#5A5F73;line-height:1.5;margin:0">
      <b>Indicative only.</b> ${LEGAL.RETURNS_FULL} Petrol cost per kilometre is derived from the pump price
      shown and a fixed 24 km per litre; savings move with the pump price.
      <br><br>
      ${LEGAL.POPIA_SHORT} You received this because you asked us to email your calculation.
    </p>
  </div>
</div></body></html>`;
}

function savingsTeamHtml(contact, m, meta) {
  const money = M.money;
const LEGAL = require('./legal');
  return `<!DOCTYPE html><html><body style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23">
<h2 style="margin:0 0 4px">Savings calculator — ${contact.company || contact.name || contact.email}</h2>
<p style="color:#5A5F73;margin:0 0 16px">${contact.name || ''} · ${contact.email}${contact.phone ? ' · ' + contact.phone : ''}</p>
<table style="border-collapse:collapse;width:100%;max-width:520px">
  ${row('Bikes', m.inputs.bikes, true)}
  ${row('Petrol price', money(m.inputs.fuelPrice) + ' /l')}
  ${row('Petrol rental', money(m.inputs.petrolRental))}
  ${row('Electric rental', money(m.inputs.electricRental))}
  ${row('Weekly km per rider', m.weeklyKm.toFixed(0))}
  ${row('Rider net position a week', money(m.driverSavingWk), true)}
  ${row('Break-even rental', money(m.breakEvenRental))}
  ${row('Extra rental a month', money(m.operatorUpliftMonth), true)}
  ${row('Extra rental a year', money(m.operatorUpliftYear), true)}
</table>
<p style="color:${m.driverBetterOff ? '#0F6E56' : '#993C1D'};margin:16px 0 0"><b>${m.driverBetterOff ? 'Deal works for the rider.' : 'Deal does NOT work for the rider at this petrol price.'}</b></p>
<p style="color:#5A5F73;margin:8px 0 0">
  ${meta.hubspot ? 'HubSpot contact ' + meta.hubspot.contactId + (meta.hubspot.created ? ' (new)' : ' (updated)') + '.' : 'HubSpot write failed — check logs.'}
</p>
</body></html>`;
}

async function sendReports(contact, m, pdfBuffer, filename, meta) {
  const from = process.env.MAIL_FROM || 'ScootHero <calculator@scoothero.co.za>';
  const attachment = { filename, content: pdfBuffer.toString('base64') };

  const results = { customer: null, team: null };

  const isSavings = !!(meta && meta.savings);

  results.customer = await send({
    from,
    to: [contact.email],
    subject: (isSavings ? 'Your ScootHero rider deal — '
                        : (m.onRent ? 'Your ScootHero proposal — ' : 'Your ScootHero fleet costs — ')) +
             m.inputs.bikes + (m.inputs.bikes === 1 ? ' bike' : ' bikes'),
    html: isSavings ? savingsHtml(contact, m) : customerHtml(contact, m),
    attachments: [attachment],
    reply_to: process.env.MAIL_REPLY_TO || undefined
  });

  const team = (process.env.SALES_INBOX || '').split(',').map(s => s.trim()).filter(Boolean);
  if (team.length) {
    results.team = await send({
      from,
      to: team,
      subject: (isSavings ? 'Savings calculator — ' : 'Calculator run — ') +
               (contact.company || contact.name || contact.email) + ' · ' + m.inputs.bikes + ' bikes',
      html: isSavings ? savingsTeamHtml(contact, m, meta) : teamHtml(contact, m, meta),
      attachments: [attachment],
      reply_to: contact.email
    });
  }
  return results;
}


/* ---------- driver offer ---------- */
function driverHtml(contact, m, ref, portalUrl) {
  const money = M.money, moneyC = M.moneyC;
  const name = contact.firstName || (contact.name || '').split(' ')[0] || 'there';
  return `<!DOCTYPE html><html><body style="margin:0;background:#F4F5F7;padding:24px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#0A0F23;padding:26px">
    <div style="font:bold 20px Helvetica,Arial,sans-serif;color:#fff">ScootHero</div>
    <div style="font:12px Helvetica,Arial,sans-serif;color:#79F1A1;margin-top:4px">Electric bikes for delivery riders</div>
  </div>
  <div style="padding:26px">
    <p style="font:15px Helvetica,Arial,sans-serif;color:#0A0F23;margin:0 0 14px">Hi ${name},</p>
    <p style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23;line-height:1.55;margin:0 0 18px">
      Here are the numbers you worked out. Keep this email — your code is at the bottom.
    </p>

    <div style="background:#F26700;border-radius:10px;padding:18px 20px;margin:0 0 16px">
      <div style="font:bold 11px Helvetica,Arial,sans-serif;color:#fff;letter-spacing:1.5px">YOU EARN A MONTH</div>
      <div style="font:bold 32px Helvetica,Arial,sans-serif;color:#fff;margin-top:6px">${money(m.earnMonth)}</div>
      <div style="font:12px Helvetica,Arial,sans-serif;color:#FFE2CD;margin-top:4px">${Math.round(m.jobsWk)} jobs a week, before what the bike costs you</div>
    </div>

    <table style="width:100%;border-collapse:collapse">
      ${row('You get paid, a job', moneyC(m.earnPerJob))}
      ${row('Petrol bike costs you, a week', money(m.pCostWk))}
      ${row('Electric bike costs you, a week', money(m.eCostWk))}
      ${row('You keep on petrol, a week', money(m.pNetWk))}
      ${row('You keep on electric, a week', money(m.eNetWk), true)}
    </table>

    <div style="background:#0F6E56;border-radius:10px;padding:18px 20px;margin:16px 0 0">
      <div style="font:bold 11px Helvetica,Arial,sans-serif;color:#fff;letter-spacing:1.5px">EXTRA IN YOUR POCKET ON ELECTRIC</div>
      <div style="font:bold 30px Helvetica,Arial,sans-serif;color:#fff;margin-top:6px">${money(m.savingMonth)}</div>
      <div style="font:12px Helvetica,Arial,sans-serif;color:#CFF3E2;margin-top:4px">a month — ${money(m.savingYear)} a year</div>
    </div>

    <p style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23;line-height:1.55;margin:20px 0 0">
      On electric your rental covers maintenance, tyres, insurance and tracking. You only pay for charging.
      No late-night breakdowns to sort out yourself, and no repair bills you did not see coming.
    </p>

    <div style="background:#F4F5F7;border-radius:10px;padding:18px;margin:20px 0 0;text-align:center">
      <div style="font:12px Helvetica,Arial,sans-serif;color:#5A5F73">Your code</div>
      <div style="font:bold 26px Helvetica,Arial,sans-serif;color:#0A0F23;letter-spacing:3px;margin:6px 0 12px">${ref}</div>
      <a href="${portalUrl}" style="background:#F26700;color:#fff;text-decoration:none;border-radius:8px;padding:13px 24px;font:bold 14px Helvetica,Arial,sans-serif;display:inline-block">
        Get started
      </a>
    </div>
  </div>
  <div style="padding:18px 26px;background:#F4F5F7">
    <p style="font:11px Helvetica,Arial,sans-serif;color:#5A5F73;line-height:1.5;margin:0">
      <b>Indicative only.</b> ${LEGAL.EARNINGS_FULL}
      <br><br>
      ${LEGAL.POPIA_SHORT} You received this because you asked us to send it.
    </p>
  </div>
</div></body></html>`;
}

function driverTeamHtml(contact, m, ref) {
  const money = M.money, moneyC = M.moneyC;
  const c = M.classifyDriver(m);
  const tone = { 'Yes': '#0F6E56', 'Yes, with checks': '#0F6E56',
                 'Review': '#8A6D1F', 'Verify': '#993C1D', 'Not yet': '#993C1D' }[c.verdict] || '#5A5F73';
  return `<!DOCTYPE html><html><body style="font:14px Helvetica,Arial,sans-serif;color:#0A0F23">
<h2 style="margin:0 0 4px">Driver lead — ${contact.name || contact.email}</h2>
<p style="color:#5A5F73;margin:0 0 16px">${contact.email}${contact.phone ? ' · ' + contact.phone : ''} · code ${ref}</p>

<div style="border-left:4px solid ${tone};background:#F4F5F7;padding:14px 16px;margin:0 0 18px">
  <div style="font:bold 11px Helvetica,Arial,sans-serif;letter-spacing:1.2px;color:#5A5F73">HAND THEM A BIKE?</div>
  <div style="font:bold 20px Helvetica,Arial,sans-serif;color:${tone};margin:4px 0 6px">${c.verdict}</div>
  <div style="font:13px Helvetica,Arial,sans-serif;color:#0A0F23;line-height:1.5">${c.reason}</div>
  <div style="font:12px Helvetica,Arial,sans-serif;color:#5A5F73;margin-top:8px">
    <b>${c.label}</b> on food work · about the ${c.percentile}th percentile · ${c.blurb}.
    Ranked on food earnings of ${money(c.foodEarnDay)} a day against ${c.cohort.riders} riders and
    ${c.cohort.orders.toLocaleString('en-ZA')} food orders, ${c.cohort.source}.
    Express income of ${money(c.earnDay - c.foodEarnDay)} a day sits on top of that and is counted in
    affordability, not in the ranking.
  </div>
</div>
<table style="border-collapse:collapse;width:100%;max-width:520px">
  ${row('Food jobs a day', m.inputs.foodJobs)}
  ${row('Express parcels a day', m.inputs.expressJobs)}
  ${row('Days a week', m.inputs.daysPerWeek)}
  ${row('Earns a month', money(m.earnMonth), true)}
  ${row('Per job', moneyC(m.earnPerJob))}
  ${row('Petrol a day', money(m.inputs.petrolPerDay))}
  ${row('Current bike rental a week', money(m.inputs.petrolRent))}
  ${row('Rides about', Math.round(m.kmWk) + ' km a week')}
  ${row('Keeps on petrol, a week', money(m.pNetWk))}
  ${row('Keeps on electric, a week', money(m.eNetWk), true)}
  ${row('Better off a month', money(m.savingMonth), true)}
</table>

<h3 style="margin:20px 0 6px;font:bold 14px Helvetica,Arial,sans-serif">Food work — the like-for-like ranking</h3>
<table style="border-collapse:collapse;width:100%;max-width:520px">
  ${row('Their food earnings a day', money(c.foodEarnDay), true)}
  ${row('Branch bottom quartile', money(M.EARN_BANDS.p25))}
  ${row('Branch median', money(M.EARN_BANDS.median))}
  ${row('Branch top quartile', money(M.EARN_BANDS.p75) + '+')}
  ${row('Rental as share of ALL earnings', Math.round(c.rentalShare * 100) + '%', true)}
</table>

<h3 style="margin:20px 0 6px;font:bold 14px Helvetica,Arial,sans-serif">Express — upside only, excluded from the decision</h3>
<table style="border-collapse:collapse;width:100%;max-width:520px">
  ${row('Their express parcels a day', m.inputs.expressJobs.toFixed(0), true)}
  ${row('Express income a day', money(c.earnDay - c.foodEarnDay))}
  ${row('Rate', 'R' + M.EXPRESS.ratePerParcel.toFixed(2) + ' a parcel, flat')}
  ${row('Express team size', M.EXPRESS.riders + ' riders — closed and full')}
  ${row('Rental as % of food earnings ONLY', Math.round(c.rentalShare * 100) + '%', true)}
  ${row('Rental as % including express', Math.round(c.coversAllIn * 100) + '%')}
</table>
<p style="color:#5A5F73;font:12px Helvetica,Arial,sans-serif;margin:14px 0 0">
  <b>Express has been excluded from the verdict.</b> The operator runs a closed team of ${M.EXPRESS.riders}
  express riders and it is full — roughly ${M.EXPRESS.addedInTwoYears} riders were added in the last two
  years, and entry depends on a place opening and on the rider having earned it. A rider may never do
  express at all. Approving someone whose rental only works with express income would be lending against
  income they can lose, so affordability is tested on food earnings alone. Express is a flat
  R${M.EXPRESS.ratePerParcel.toFixed(2)} a parcel ${M.EXPRESS.surchargeNote}.
</p>
</body></html>`;
}

async function sendDriverEmail(contact, m, ref, portalUrl) {
  const from = process.env.MAIL_FROM || 'ScootHero <calculator@scoothero.co.za>';
  await send({
    from, to: [contact.email],
    subject: 'Your numbers from ScootHero — code ' + ref,
    html: driverHtml(contact, m, ref, portalUrl),
    reply_to: process.env.MAIL_REPLY_TO || undefined
  });
  const team = (process.env.DRIVER_INBOX || process.env.SALES_INBOX || '').split(',').map(s => s.trim()).filter(Boolean);
  if (team.length) {
    await send({
      from, to: team,
      subject: (function () {
        const k = M.classifyDriver(m);
        // an express-led rider's food bucket is not a fair summary, so say so
        const tag = k.label + ' on food' +
          { busy: ' + busy express', mixed: ' + part express',
            above: ' · express claim too high', none: ' · food only' }[k.expressClaim];
        return '[' + k.verdict + '] Driver lead — ' + (contact.name || contact.email) +
               ' · ' + tag + ' · ' + money(m.savingMonth) + '/mo better off';
      })(),
      html: driverTeamHtml(contact, m, ref),
      reply_to: contact.email
    });
  }
}

module.exports = { sendReports, sendDriverEmail };

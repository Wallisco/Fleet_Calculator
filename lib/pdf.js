'use strict';
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const M = require('../public/model.js');

const NAVY = '#0A0F23';
const NAVY2 = '#141B36';
const EDGE = '#2A3354';
const ORANGE = '#F26700';
const MINT = '#79F1A1';
const LEAF = '#DFFBCB';
const SURFACE = '#F4F5F7';
const LINE = '#E3E5EC';
const MUTED = '#5A5F73';
const WARN = '#FAECE7';
const WARN_INK = '#993C1D';

const FONT_DIR = path.join(__dirname, '..', 'fonts');
const ASSET_DIR = path.join(__dirname, '..', 'assets');
const asset = (f) => {
  const p = path.join(ASSET_DIR, f);
  return fs.existsSync(p) ? p : null;
};
const fontOr = (f, fb) => (fs.existsSync(path.join(FONT_DIR, f)) ? path.join(FONT_DIR, f) : fb);

function buildPdf(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 46, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const H = fontOr('Lexend-SemiBold.ttf', 'Helvetica-Bold');
    const HB = fontOr('Lexend-Bold.ttf', 'Helvetica-Bold');
    const B = fontOr('Poppins-Regular.ttf', 'Helvetica');
    const BB = fontOr('Poppins-Medium.ttf', 'Helvetica-Bold');

    const c = payload.contact || {};
    const m = M.compute(payload.inputs);
    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;
    const BOTTOM = doc.page.height - 76;
    const money = M.money, pct = M.percent;

    let y = 0;
    const need = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 50; } };
    const h2 = (t, yy) => {
      doc.font(HB).fontSize(14).fillColor(NAVY).text(t, L, yy, { lineBreak: false });
      return yy + 21;
    };

    /* ---------- header ---------- */
    doc.rect(0, 0, doc.page.width, 104).fill(NAVY);
    const wordmark = asset('logo-white.png');
    if (wordmark) {
      doc.image(wordmark, L, 24, { width: 132 });   // 1000x92 source
    } else {
      doc.font(HB).fontSize(18).fillColor('#FFFFFF').text('ScootHero', L, 26, { lineBreak: false });
    }
    doc.font(B).fontSize(8).fillColor(MINT)
      .text('Preferred electric motorcycle provider to Takealot', L, 49, { lineBreak: false });
    doc.font(H).fontSize(15).fillColor('#FFFFFF')
      .text('What does a ScootHero fleet return?', L, 68, { lineBreak: false });
    const stamp = new Date(payload.createdAt || Date.now());
    doc.font(B).fontSize(8).fillColor('#9AA0B4').text(
      stamp.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }),
      L, 27, { width: W, align: 'right', lineBreak: false });
    if (c.company || c.name) {
      doc.font(BB).fontSize(10).fillColor('#FFFFFF')
        .text(c.company || c.name, L, 66, { width: W, align: 'right', lineBreak: false });
    }
    y = 124;

    /* ---------- your fleet ---------- */
    doc.roundedRect(L, y, W, 62, 8).fill(SURFACE);
    const setup = [
      ['How many bikes', String(m.inputs.bikes)],
      ['How you pay', M.fundLabel(m.fund, m.leaseRate)],
      ['Over how long', m.years + ' years'],
      m.onRent ? ['Rider deposit', money(m.inputs.deposit)]
               : ['Km per bike a week', m.inputs.kmPerWeek + ' km']
    ];
    const sw = W / 4;
    setup.forEach((s, i) => {
      const cx = L + i * sw + 14;
      doc.font(B).fontSize(6.5).fillColor(MUTED)
        .text(s[0].toUpperCase(), cx, y + 13, { width: sw - 20, characterSpacing: 0.5, lineBreak: false });
      doc.font(BB).fontSize(11).fillColor(NAVY).text(s[1], cx, y + 26, { width: sw - 20 });
    });
    y += 80;

    /* ---------- flow bar ---------- */
    doc.font(HB).fontSize(11).fillColor(NAVY)
      .text(m.onRent ? "Where one bike's rent goes each week" : "What one bike costs you each week",
            L, y, { lineBreak: false });
    doc.font(B).fontSize(9).fillColor(MUTED)
      .text((m.onRent ? 'Rent charged: ' : 'Total: ') + money(m.onRent ? m.grossWk : m.costWk),
            L, y + 2, { width: W, align: 'right', lineBreak: false });
    y += 22;

    const segs = (m.onRent ? [
      { l: 'Empty & unpaid', v: m.lossWk, bg: '#E8EAEF', fg: '#6C7185' },
      { l: 'HeroCare + admin', v: m.careWk + m.adminWk, bg: NAVY2, fg: '#C9CEE0' },
      { l: 'Energy', v: m.fuelWk, bg: '#243055', fg: '#C9CEE0' },
      { l: 'Finance', v: m.finWk, bg: '#3B4468', fg: '#DCE0EC' },
      { l: 'Yours', v: Math.max(m.margWk, 0), bg: ORANGE, fg: '#FFFFFF' }
    ] : [
      { l: 'HeroCare + admin', v: m.careWk + m.adminWk, bg: NAVY2, fg: '#C9CEE0' },
      { l: 'Energy', v: m.fuelWk, bg: '#243055', fg: '#C9CEE0' },
      { l: 'Instalment', v: m.finWk, bg: ORANGE, fg: '#FFFFFF' }
    ]);
    const BARH = 46;
    const tot = segs.reduce((a, s) => a + Math.max(s.v, 0), 0) || 1;
    doc.save();
    doc.roundedRect(L, y, W, BARH, 7).clip();
    let bx = L;
    segs.forEach(s => {
      const w = Math.max(s.v, 0) / tot * W;
      if (w < 0.6) return;
      doc.rect(bx, y, w, BARH).fill(s.bg);
      if (w > 64) {
        doc.font(B).fontSize(5.5).fillColor(s.fg)
          .text(s.l.toUpperCase(), bx + 8, y + 12, { width: w - 16, characterSpacing: 0.4, lineBreak: false });
        doc.font(BB).fontSize(10).fillColor(s.fg)
          .text(money(s.v), bx + 8, y + 23, { width: w - 16, lineBreak: false });
      }
      bx += w;
    });
    doc.restore();
    y += BARH + 9;
    doc.font(B).fontSize(6.5).fillColor(MUTED).text(
      (m.onRent
        ? 'Empty & unpaid = weeks with no rider, plus rent never collected   ·   HeroCare = maintenance, insurance, tracking, recovery, system'
        : 'HeroCare + admin = maintenance, insurance, tracking, system, plus a ' + money(m.inputs.adminMonthly) +
          ' monthly admin fee   ·   Energy = 62c/km on the distance covered   ·   Instalment = your lease payment') +
      (m.onRent ? '   ·   Yours = what you keep' : ''), L, y, { width: W, lineBreak: false });
    y += 16;
    // side-by-side against a petrol bike run single-handedly
    const cgap = 12, ccw = (W - cgap) / 2, CCH = 62;
    doc.roundedRect(L, y, ccw, CCH, 9).fill(NAVY);
    doc.font(H).fontSize(6.5).fillColor(MINT)
      .text(m.onRent ? 'YOURS ON SCOOTHERO' : 'SCOOTHERO, ALL IN', L + 14, y + 12, { characterSpacing: 0.7, lineBreak: false });
    doc.font(HB).fontSize(17).fillColor('#FFFFFF')
      .text(money(m.onRent ? m.margWk : m.costWk), L + 14, y + 24, { lineBreak: false });
    doc.font(B).fontSize(6.5).fillColor('#9AA0B4').text(
      m.onRent
        ? 'a week per bike. We build them, run the swap network, service them and give you the system.'
        : 'a week per bike — HeroCare, energy and instalment, everything in.',
      L + 14, y + 44, { width: ccw - 28 });

    doc.roundedRect(L + ccw + cgap, y, ccw, CCH, 9).fillAndStroke(SURFACE, LINE);
    doc.font(H).fontSize(6.5).fillColor(MUTED)
      .text('AN EQUIVALENT PETROL BIKE', L + ccw + cgap + 14, y + 12, { characterSpacing: 0.7, lineBreak: false });
    doc.font(HB).fontSize(17).fillColor(NAVY)
      .text(money(m.onRent ? m.petrolWk : m.petrolCostWk), L + ccw + cgap + 14, y + 24, { lineBreak: false });
    doc.font(B).fontSize(6.5).fillColor(MUTED).text(
      m.onRent ? 'a week per bike — and only if you do all the work yourself.'
               : 'a week per bike on your own figures — instalment, fuel, servicing, insurance and tracking.',
      L + ccw + cgap + 14, y + 44, { width: ccw - 28 });
    y += CCH + 10;

    doc.roundedRect(L, y, W, 22, 6).fill(LEAF);
    doc.font(B).fontSize(7).fillColor('#1E5B2A').text(
      m.onRent
        ? 'Battery usage is billed to the driver directly at a ' + (m.inputs.kmRate * 100).toFixed(0) +
          'c per km equivalent, so it sits outside your numbers entirely.'
        : 'The lease bars sub-renting, so these bikes run with your own drivers. Energy is billed to your business at 62c per km — ' +
          money(m.fuelWk) + ' a bike a week at ' + m.inputs.kmPerWeek + ' km.',
      L + 11, y + 7.5, { width: W - 22, lineBreak: false });
    y += 32;

    /* ---------- results panel ---------- */
    const kpis = m.onRent ? [
      ['Cash per month', money(m.netM)],
      ['Return on revenue', pct(m.ror)],
      ['Money back in', isFinite(m.payback) ? Math.ceil(m.payback) + ' mo' : '—'],
      ['Cash to start', money(m.upfront)]
    ] : [
      ['Cost per bike a week', money(m.costWk)],
      ['Cost per bike a month', money(m.costWk * 4.345)],
      ['Fleet cost a month', money(m.costM)],
      ['Cash to start', money(m.upfront)]
    ];
    const brRows = m.onRent ? [
      ['Rent collected', money(m.revM * m.months)],
      ['Running costs', '-' + money(m.opM * m.months)],
      ['Finance', m.finM ? '-' + money(m.commit) : '—'],
      ['Less cash you put in', '-' + money(m.upfront)]
    ] : [
      ['HeroCare', money(m.careWk * 4.345 * m.inputs.bikes * m.months)],
      ['Admin fee', money(m.adminWk * 4.345 * m.inputs.bikes * m.months)],
      ['Energy', money(m.fuelWk * 4.345 * m.inputs.bikes * m.months)],
      ['Instalments', money(m.commit)],
      ['Cash up front', money(m.upfront)]
    ];
    const y1 = M.compute(payload.inputs, m.fund, m.years, 1);
    const levH = m.commit > 0 ? 42 : 0;
    const panelH = 57 + 64 + 72 + levH + 14 + brRows.length * 14 + 46;
    need(panelH + 8);

    doc.roundedRect(L, y, W, panelH, 10).fill(NAVY);
    let py = y + 19;
    doc.font(HB).fontSize(13).fillColor('#FFFFFF').text(
      m.inputs.bikes + (m.inputs.bikes === 1 ? ' bike, ' : ' bikes, ') +
      M.fundLabel(m.fund, m.leaseRate).toLowerCase(), L + 18, py, { lineBreak: false });
    py += 17;
    doc.font(B).fontSize(8.5).fillColor('#9AA0B4').text(
      'Cash you put in: ' + money(m.upfront) +
      (m.finM ? '  ·  instalment ' + money(m.finM) + ' a month for ' + m.years + ' years' : ''),
      L + 18, py, { lineBreak: false });
    py += 21;

    const kw = (W - 36 - 27) / 4;
    kpis.forEach((k, i) => {
      const kx = L + 18 + i * (kw + 9);
      doc.roundedRect(kx, py, kw, 52, 7).fillAndStroke(NAVY2, EDGE);
      doc.font(H).fontSize(6).fillColor(MINT)
        .text(k[0].toUpperCase(), kx + 10, py + 11, { width: kw - 20, characterSpacing: 0.5, lineBreak: false });
      doc.font(HB).fontSize(13).fillColor('#FFFFFF')
        .text(k[1], kx + 10, py + 25, { width: kw - 20, lineBreak: false });
    });
    py += 64;

    doc.roundedRect(L + 18, py, W - 36, 60, 8).fill(ORANGE);
    const vsP = m.costWk - m.petrolCostWk;
    doc.font(H).fontSize(9).fillColor('#FFFFFF')
      .text(m.onRent ? 'RETURN ON INVESTMENT' : ('TOTAL COST OVER ' + m.years + ' YEARS').toUpperCase(),
            L + 34, py + 15, { characterSpacing: 1.2, lineBreak: false });
    doc.font(B).fontSize(9.5).fillColor('#FFE9D8').text(
      m.onRent
        ? 'over ' + m.years + ' years, on the ' + money(m.upfront) + ' you put in'
        : m.inputs.bikes + (m.inputs.bikes === 1 ? ' bike, ' : ' bikes, ') + 'everything in — ' +
          (vsP < 0 ? money(Math.abs(vsP)) + ' a week per bike less than petrol'
                   : money(vsP) + ' a week per bike more than petrol'),
      L + 34, py + 30, { width: W - 190 });
    doc.font(HB).fontSize(m.onRent ? 22 : 18).fillColor('#FFFFFF')
      .text(m.onRent ? (m.upfront > 0 ? pct(m.roi) : '—') : money(m.costTotal),
            L + 18, py + (m.onRent ? 21 : 24), { width: W - 52, align: 'right', lineBreak: false });
    py += 72;

    if (levH) {
      doc.roundedRect(L + 18, py, W - 36, 32, 6).fillAndStroke('#2A2010', '#5A431A');
      doc.font(B).fontSize(7).fillColor('#F3D9A8').text(
        'Leasing shows a higher percentage because you risk less of your own cash. The instalment of ' +
        money(m.finM) + ' a month is due whether a bike is rented or not — ' + money(m.commit) +
        ' committed over ' + m.years + ' years.', L + 30, py + 8, { width: W - 60 });
      py += 42;
    }

    const colW = (W - 36 - 12) / 2;
    [[y1, 'OVER 1 YEAR'], [m, 'OVER ' + m.years + ' YEARS']].forEach((pair, ci) => {
      const r = pair[0], cx0 = L + 18 + ci * (colW + 12);
      let cy = py;
      doc.font(H).fontSize(7).fillColor('#FFFFFF')
        .text(pair[1], cx0, cy, { characterSpacing: 1, lineBreak: false });
      cy += 14;
      (m.onRent ? [
        ['Rent collected', money(r.revM * r.months)],
        ['Running costs', '-' + money(r.opM * r.months)],
        ['Finance', r.finM ? '-' + money(r.commit) : '—'],
        ['Less cash you put in', '-' + money(r.upfront)]
      ] : [
        ['HeroCare', money(r.careWk * 4.345 * r.inputs.bikes * r.months)],
        ['Admin fee', money(r.adminWk * 4.345 * r.inputs.bikes * r.months)],
        ['Energy', money(r.fuelWk * 4.345 * r.inputs.bikes * r.months)],
        ['Instalments', money(r.commit)]
      ]).forEach(row => {
        doc.font(B).fontSize(8).fillColor('#C4C9DA').text(row[0], cx0, cy, { lineBreak: false });
        doc.font(BB).fontSize(8).fillColor('#FFFFFF')
          .text(row[1], cx0, cy, { width: colW, align: 'right', lineBreak: false });
        cy += 14;
      });
      doc.moveTo(cx0, cy + 1).lineTo(cx0 + colW, cy + 1).lineWidth(0.5).stroke(EDGE);
      cy += 8;
      doc.font(BB).fontSize(9).fillColor('#FFFFFF')
        .text(m.onRent ? 'Profit on your cash' : 'Total cost', cx0, cy, { lineBreak: false });
      doc.font(HB).fontSize(11).fillColor(MINT)
        .text(money(m.onRent ? r.profit : r.costTotal), cx0, cy - 1, { width: colW, align: 'right', lineBreak: false });
      cy += 15;
      doc.font(B).fontSize(8).fillColor('#C4C9DA')
        .text(m.onRent ? 'Return on investment' : 'Per bike a week', cx0, cy, { lineBreak: false });
      doc.font(BB).fontSize(8).fillColor(MINT).text(
        m.onRent ? (r.upfront > 0 ? pct(r.roi) : '—') : money(r.costWk),
        cx0, cy, { width: colW, align: 'right', lineBreak: false });
    });
    y += panelH + 22;

    /* ---------- how it works ---------- */
    need(250);
    y = h2('How it works', y);

    // one price band
    const OPH = 88;
    doc.roundedRect(L, y, W, OPH, 9).fill(NAVY);
    const ops = ['We build the bikes', 'We run the swap network',
                 'We service the bikes', 'We give you the system to manage it all in'];
    const opw = (W - 36) / 2;
    ops.forEach((t, i) => {
      const ox = L + 18 + (i % 2) * opw;
      const oy = y + 16 + Math.floor(i / 2) * 21;
      doc.circle(ox + 6, oy + 4.5, 5.5).lineWidth(1.1).stroke(MINT);
      doc.font(BB).fontSize(8.5).fillColor('#FFFFFF').text(t, ox + 18, oy, { width: opw - 26, lineBreak: false });
    });
    doc.moveTo(L + 18, y + 62).lineTo(L + W - 18, y + 62).lineWidth(0.5).stroke(EDGE);
    doc.font(B).fontSize(8).fillColor('#C4C9DA')
      .text('All of it in one price. That last part is the bit that matters.', L + 18, y + 70, { lineBreak: false });
    y += OPH + 16;

    function drawSteps(phase, items, dark) {
      doc.roundedRect(L, y, 84, 15, 7).fill(LEAF);
      doc.font(H).fontSize(6).fillColor('#1E5B2A')
        .text(phase.toUpperCase(), L, y + 4.8, { width: 84, align: 'center', characterSpacing: 0.6, lineBreak: false });
      doc.moveTo(L + 92, y + 7.5).lineTo(L + W, y + 7.5).lineWidth(0.5).stroke(LINE);
      y += 23;

      const gap = 10, cw = (W - gap * 2) / 3;
      let tallest = 0;
      items.forEach(s => {
        const th = doc.font(BB).fontSize(9.5).heightOfString(s.t, { width: cw - 22 });
        const dh = doc.font(B).fontSize(7.5).heightOfString(s.d, { width: cw - 22 });
        tallest = Math.max(tallest, 22 + th + 4 + dh + (s.v ? 32 : 10));
      });
      items.forEach((s, i) => {
        const sx = L + i * (cw + gap);
        if (dark) doc.roundedRect(sx, y, cw, tallest, 8).fill(NAVY);
        else doc.roundedRect(sx, y, cw, tallest, 8).fillAndStroke('#FFFFFF', LINE);
        doc.font(H).fontSize(6).fillColor(ORANGE)
          .text(s.n, sx + 11, y + 10, { characterSpacing: 0.8, lineBreak: false });
        doc.font(BB).fontSize(9.5).fillColor(dark ? '#FFFFFF' : NAVY).text(s.t, sx + 11, y + 20, { width: cw - 22 });
        doc.font(B).fontSize(7.5).fillColor(dark ? '#9AA0B4' : MUTED)
          .text(s.d, sx + 11, doc.y + 3, { width: cw - 22 });
        if (s.v) {
          const vy = y + tallest - 27;
          doc.moveTo(sx + 11, vy - 5).lineTo(sx + cw - 11, vy - 5).lineWidth(0.5).stroke(dark ? EDGE : LINE);
          doc.font(HB).fontSize(11).fillColor(dark ? MINT : NAVY)
            .text(s.v, sx + 11, vy, { width: cw - 22, lineBreak: false });
          doc.font(B).fontSize(6).fillColor(dark ? '#9AA0B4' : MUTED)
            .text(s.s, sx + 11, vy + 13, { width: cw - 22, lineBreak: false });
        }
      });
      y += tallest + 15;
    }

    const buyLine = {
      buy: 'Choose your fleet size and pay for the bikes outright. We deliver, register and hand them over ready to ride.',
      oplease: 'Choose your fleet size and take the bikes on an operating lease. We deliver, register and hand them over.',
      lto: 'Choose your fleet size and take the bikes on lease to own. We deliver, register and hand them over.'
    }[m.fund];

    drawSteps('Set up once', [
      { n: 'STEP 1', t: 'Get your bikes', d: buyLine },
      { n: 'STEP 2', t: 'Set your rates in Lighthouse', d: 'Lighthouse is your operator portal. Set the weekly rent and the deposit you charge each rider.',
        v: money(m.inputs.rental), s: 'weekly rent · ' + money(m.inputs.deposit) + ' deposit' },
      { n: 'STEP 3', t: m.onRent ? 'Put riders on the bikes' : 'Put your drivers on the bikes',
        d: m.onRent ? 'Take vetted riders from our marketplace, or bring your own. A filled seat is a bike earning.'
                    : 'Your drivers, your routes. Every bike standing still is a bike not earning.',
        v: String(m.inputs.bikes), s: m.inputs.bikes === 1 ? 'seat to fill' : 'seats to fill' }
    ], false);

    need(160);
    drawSteps('Then every week', [
      { n: 'STEP 4', t: m.onRent ? 'Riders pay you' : 'Your bikes earn',
        d: m.onRent ? 'Paystack collects the rent up front, before the week starts. You hold their deposit against anything unpaid.'
                    : 'Your own drivers run the bikes. The lease bars sub-renting, so the fleet works for your operation.',
        v: money(m.wkCollected), s: m.onRent ? 'collected across your fleet' : 'earned across your fleet' },
      { n: 'STEP 5', t: 'You pay us ' + money(m.careWk) + ' a bike',
        d: 'HeroCare covers maintenance, insurance, tracking, recovery and the system. ' +
           (m.onRent
             ? 'Battery usage is billed to your driver at a ' + (m.inputs.kmRate * 100).toFixed(0) + 'c per km equivalent.'
             : 'Energy is billed to you at 62c per km on the distance your bikes cover.'),
        v: '-' + money(m.wkService),
        s: m.fuelWk > 0 ? money(m.wkCare) + ' care + ' + money(m.wkFuel) + ' energy' : 'out of the money collected' },
      { n: 'STEP 6', t: 'Your payment lands', d: 'The balance is paid into your account weekly. No invoicing, no chasing riders, no surprise repair bills.',
        v: money(m.wkNet), s: m.wkFinance > 0 ? 'before ' + money(m.wkFinance) + ' finance' : 'yours, every week' }
    ], true);

    doc.font(B).fontSize(7).fillColor(MUTED).text(
      'This cycle repeats every week for as long as the bikes are on the road — ' +
      Math.round(m.years * 52) + ' weeks of collections over ' + m.years + ' years.',
      L, y, { width: W, lineBreak: false });
    y += 22;

    /* ---------- three ways to pay ---------- */
    need(135);
    y = h2('The three ways to pay, side by side', y);
    const heads = ['How you pay', 'Cash up front', 'Monthly', 'Cash p/m', 'Profit ' + m.years + 'yr', 'ROI', 'Committed'];
    const cwid = [W * 0.235, W * 0.135, W * 0.115, W * 0.125, W * 0.145, W * 0.11, W * 0.135];
    doc.rect(L, y, W, 19).fill(SURFACE);
    let hx = L;
    heads.forEach((h, i) => {
      doc.font(B).fontSize(6).fillColor(MUTED).text(h.toUpperCase(), hx + 5, y + 7,
        { width: cwid[i] - 10, align: i === 0 ? 'left' : 'right', characterSpacing: 0.4, lineBreak: false });
      hx += cwid[i];
    });
    y += 19;
    ['buy', 'oplease', 'lto'].forEach(f => {
      const r = M.compute(payload.inputs, f, m.years);
      const sel = f === m.fund;
      if (sel) { doc.rect(L, y, W, 21).fill('#FFF4EC'); doc.rect(L, y, 2.5, 21).fill(ORANGE); }
      const cells = [M.fundLabel(f, r.leaseRate), money(r.upfront), r.finM ? money(r.finM) : '—',
        money(r.netM), money(r.profit), r.upfront > 0 ? pct(r.roi) : '—', r.commit ? money(r.commit) : '—'];
      let tx = L;
      cells.forEach((v, i) => {
        doc.font(sel ? BB : B).fontSize(8).fillColor(NAVY).text(v, tx + 5, y + 7,
          { width: cwid[i] - 10, align: i === 0 ? 'left' : 'right', lineBreak: false });
        tx += cwid[i];
      });
      y += 21;
      doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).stroke(LINE);
    });
    y += 20;

    /* ---------- risks ---------- */
    need(145);
    y = h2('What can go wrong — and what we do about it', y);
    const risks = [
      m.onRent
        ? ['Your rider stops paying', 'Rent is collected before the wheels turn. Paystack takes payment up front each week, and you hold a ' + money(m.inputs.deposit) + ' deposit on top.', 'At this deposit, missed payments run at about ' + pct(m.bad) + ' of revenue.']
        : ['A driver is off sick or leaves', 'Our rider marketplace supplies vetted, delivery-experienced drivers so a gap in your team does not park a bike.', 'A bike standing still still costs you HeroCare and your instalment.'],
      m.onRent
        ? ['A bike sits with no rider', 'Our rider marketplace fills the seat, and refills it if someone leaves. Riders want these seats: Takealot volumes mean more deliveries and no petrol bill.', 'Every empty week costs you the full rent.']
        : ['Energy costs run away from you', 'Energy is billed at a flat 62c per km, so it moves with distance covered and nothing else — no fuel price shocks, no card fraud, no filling-station detours.', 'At ' + m.inputs.kmPerWeek + ' km a week that is ' + money(m.fuelWk) + ' a bike.'],
      ['A breakdown takes a bike off the road', 'HeroCare covers maintenance, parts and labour on a fixed weekly fee, with a service turnaround commitment. Swaps take under two minutes.', 'Repairs never arrive as a surprise bill.'],
      ['A bike is crashed or stolen', 'Insurance, tracking, SOS and recovery are all inside the HeroCare fee. Every bike is tracked from the day it is handed over.', 'One uninsured write-off would wipe out a year of profit on that bike.'],
      ['There is no work for the bikes', 'ScootHero is Takealot\u2019s preferred electric motorcycle provider. Demand comes with the fleet — you are not hunting for delivery work on your own.', 'This is why the seats fill in the first place.'],
      ['You have never run a fleet', 'Bikes, swaps, maintenance, insurance, rider supply, payment collection and a named contact for your first 30 days.', 'Your job is the seats. We handle the rest.']
    ];
    const rgap = 10, rw = (W - rgap) / 2;
    for (let i = 0; i < risks.length; i += 2) {
      const pair = risks.slice(i, i + 2);
      const rh = Math.max.apply(null, pair.map(r =>
        30 + doc.font(B).fontSize(7.5).heightOfString(r[1], { width: rw - 22 }) + 22));
      need(rh + 12);
      pair.forEach((r, j) => {
        const rx = L + j * (rw + rgap);
        doc.roundedRect(rx, y, rw, rh, 8).fillAndStroke('#FFFFFF', LINE);
        doc.roundedRect(rx, y, rw, 24, 8).fill(WARN);
        doc.rect(rx, y + 16, rw, 8).fill(WARN);
        doc.font(BB).fontSize(8.5).fillColor(WARN_INK).text(r[0], rx + 11, y + 8, { width: rw - 22, lineBreak: false });
        doc.font(B).fontSize(7.5).fillColor(NAVY).text(r[1], rx + 11, y + 31, { width: rw - 22 });
        doc.font(B).fontSize(6.5).fillColor(MUTED).text(r[2], rx + 11, y + rh - 15, { width: rw - 22, lineBreak: false });
      });
      y += rh + 10;
    }
    y += 6;

    /* ---------- CTA ---------- */
    need(66);
    doc.roundedRect(L, y, W, 56, 9).fill(NAVY);
    doc.font(HB).fontSize(12).fillColor('#FFFFFF')
      .text('Get these numbers on your name', L + 18, y + 13, { lineBreak: false });
    doc.font(B).fontSize(7.5).fillColor('#9AA0B4').text(
      "We'll confirm the rent your area supports, check swap coverage on your routes, and put the finance in front of Eqstra.",
      L + 18, y + 30, { width: W - 190 });
    doc.roundedRect(L + W - 152, y + 17, 134, 23, 6).fill(ORANGE);
    doc.font(HB).fontSize(8.5).fillColor('#FFFFFF')
      .text('scoothero.co.za', L + W - 152, y + 24.5, { width: 134, align: 'center', lineBreak: false });

    /* ================= PROPOSAL PAGES (outright only) ================= */
    if (m.onRent) {
      doc.addPage();
      y = 50;

      doc.font(HB).fontSize(17).fillColor(NAVY).text('Your proposal', L, y, { lineBreak: false });
      y += 24;
      doc.font(B).fontSize(9).fillColor(MUTED).text(
        'Everything below is a one-off cost, excluding VAT. VAT is added at invoicing.',
        L, y, { width: W, lineBreak: false });
      y += 22;

      const qLines = [[m.inputs.bikes + (m.inputs.bikes === 1 ? ' bike' : ' bikes') +
                       ' at ' + money(m.inputs.price), money(m.bikeTotal), false]];
      if (m.wantPdi)   qLines.push(['Pre-delivery inspection, ' + m.inputs.bikes +
                                    (m.inputs.bikes === 1 ? ' bike' : ' bikes'), money(m.pdiTotal), false]);
      if (m.wantBoxes) qLines.push(['Delivery boxes fitted, ' + m.inputs.bikes +
                                    (m.inputs.bikes === 1 ? ' bike' : ' bikes'), money(m.boxTotal), false]);
      if (m.wantGear)  qLines.push(['Helmets and jackets', 'To be quoted', false]);

      doc.roundedRect(L, y, W, 26 + qLines.length * 20 + 34, 9).fill(SURFACE);
      let qy = y + 18;
      qLines.forEach(l => {
        doc.font(B).fontSize(10).fillColor(NAVY).text(l[0], L + 18, qy, { lineBreak: false });
        doc.font(BB).fontSize(10).fillColor(NAVY).text(l[1], L + 18, qy, { width: W - 36, align: 'right', lineBreak: false });
        qy += 20;
        doc.moveTo(L + 18, qy - 5).lineTo(L + W - 18, qy - 5).lineWidth(0.5).stroke('#D9DBE3');
      });
      qy += 6;
      doc.font(BB).fontSize(12).fillColor(NAVY).text('Total, excl VAT', L + 18, qy, { lineBreak: false });
      doc.font(HB).fontSize(16).fillColor(ORANGE)
        .text(money(m.proposalTotal), L + 18, qy - 3, { width: W - 36, align: 'right', lineBreak: false });
      y += 26 + qLines.length * 20 + 48;

      /* ---- the six steps ---- */
      doc.font(HB).fontSize(15).fillColor(NAVY).text('What happens next', L, y, { lineBreak: false });
      y += 22;

      const steps = [
        ['Sign off this proposal', 'Tick the options you want on the last page, sign, and send it back to us. That is the only approval we need to raise the invoice.'],
        ['Receive your invoice', 'We invoice for exactly what you have ticked, with VAT added. Nothing else is added later.'],
        ['Pay the invoice', 'Payment confirms your build slot. Your delivery clock starts the day it clears.'],
        ['Delivery within 7 days', 'Seven days from cleared payment, your bikes arrive inspected, registered and ready to ride.'],
        ['Customer and driver onboarding', 'We set you up on Lighthouse, walk your team through it, train your riders and orient them on the swap network.'],
        ['Go live', 'Your riders start earning. Your named contact stays with you through the first 30 days.']
      ];
      steps.forEach((st, i) => {
        const h = 20 + doc.font(B).fontSize(8.5).heightOfString(st[1], { width: W - 62 });
        if (y + h + 8 > BOTTOM) { doc.addPage(); y = 50; }
        doc.circle(L + 11, y + 10, 11).fill(NAVY);
        doc.font(HB).fontSize(9).fillColor('#FFFFFF')
          .text(String(i + 1), L, y + 6.5, { width: 22, align: 'center', lineBreak: false });
        doc.font(BB).fontSize(10.5).fillColor(NAVY).text(st[0], L + 32, y + 1, { width: W - 42, lineBreak: false });
        doc.font(B).fontSize(8.5).fillColor(MUTED).text(st[1], L + 32, y + 15, { width: W - 62 });
        y += h + 12;
      });

      /* ================= SIGN-OFF PAGE ================= */
      doc.addPage();
      y = 50;
      doc.font(HB).fontSize(17).fillColor(NAVY).text('Acceptance', L, y, { lineBreak: false });
      y += 24;
      doc.font(B).fontSize(9).fillColor(MUTED).text(
        'Confirm the options you want, then sign below. Return this page to your ScootHero contact and we will raise the invoice.',
        L, y, { width: W - 40 });
      y += 30;

      /* tick boxes — pre-ticked to match what was chosen */
      const opts = [
        ['Pre-delivery inspection', money(m.inputs.pdiPrice) + ' a bike  ·  ' + money(m.pdiTotal) + ' total', m.wantPdi],
        ['Delivery boxes, fitted', money(m.inputs.boxPrice) + ' a bike  ·  ' + money(m.boxTotal) + ' total', m.wantBoxes],
        ['Helmets and jackets', 'To be quoted separately', m.wantGear]
      ];
      opts.forEach(o => {
        doc.roundedRect(L, y, W, 40, 8).fillAndStroke('#FFFFFF', LINE);
        doc.roundedRect(L + 16, y + 12, 16, 16, 3).lineWidth(1).stroke(o[2] ? ORANGE : '#B9BDC9');
        if (o[2]) {
          doc.save().lineWidth(2).strokeColor(ORANGE)
            .moveTo(L + 20, y + 20).lineTo(L + 23, y + 24).lineTo(L + 29, y + 15).stroke().restore();
        }
        doc.font(BB).fontSize(10).fillColor(NAVY).text(o[0], L + 44, y + 11, { lineBreak: false });
        doc.font(B).fontSize(8).fillColor(MUTED).text(o[1], L + 44, y + 24, { lineBreak: false });
        y += 48;
      });

      y += 6;
      doc.roundedRect(L, y, W, 44, 8).fill(NAVY);
      doc.font(BB).fontSize(11).fillColor('#FFFFFF')
        .text('Total accepted, excl VAT', L + 18, y + 16, { lineBreak: false });
      doc.font(HB).fontSize(16).fillColor(MINT)
        .text(money(m.proposalTotal), L + 18, y + 13, { width: W - 36, align: 'right', lineBreak: false });
      y += 62;

      /* signature block */
      const half = (W - 20) / 2;
      const sig = [
        ['Full name', ''], ['Capacity (e.g. Director)', ''],
        ['Company', c.company || ''], ['Registration number', ''],
        ['Signature', ''], ['Date', '']
      ];
      sig.forEach((f, i) => {
        const sx = L + (i % 2) * (half + 20);
        if (i % 2 === 0 && i > 0) y += 46;
        const sy = y;
        doc.font(H).fontSize(7).fillColor(MUTED)
          .text(f[0].toUpperCase(), sx, sy, { characterSpacing: 0.6, lineBreak: false });
        if (f[1]) doc.font(B).fontSize(10).fillColor(NAVY).text(f[1], sx, sy + 13, { lineBreak: false });
        doc.moveTo(sx, sy + 30).lineTo(sx + half, sy + 30).lineWidth(0.75).stroke('#B9BDC9');
      });
      y += 58;

      doc.font(B).fontSize(7.5).fillColor(MUTED).text(
        'By signing, you accept this proposal for the items ticked above at the total shown, excluding VAT. ' +
        'This is an acceptance of quotation and not a credit agreement. Delivery is seven days from cleared payment. ' +
        'Prices hold for 14 days from the date of this proposal.',
        L, y, { width: W - 40 });
      y += 34;

      doc.roundedRect(L, y, W, 40, 8).fill(SURFACE);
      doc.font(BB).fontSize(9).fillColor(NAVY)
        .text('Return this page to your ScootHero contact, or email it to sales@scoothero.co.za', L + 18, y + 15, { lineBreak: false });
    }

    /* ---------- footer ---------- */
    const DISCLAIMER = m.onRent
      ? 'Bike, inspection and delivery box prices are firm and hold for 14 days from the date of this proposal; VAT is added at invoicing. ' +
        'Rider gear is quoted separately. Projected returns are estimates on the assumptions shown — rent achievable, utilisation and ' +
        'running costs vary by area, rider and usage, and exclude tax, your own admin costs and any resale value. Delivery is seven days ' +
        'from cleared payment. This is an acceptance of quotation, not a credit agreement.'
      : 'Estimates only — not a quote or an offer of finance. Subject to credit approval through Eqstra, a Nedbank company; the finance ' +
        'rate shown is indicative only. All figures exclude VAT. Running costs vary by area, rider and usage, and exclude tax, admin ' +
        'costs and any residual owing at the end of a lease. Speak to us before making a financial decision.';

    const mark = asset('watermark.png');
    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      doc.page.margins.bottom = 0;
      // faint brand mark, bottom-right, behind nothing that matters
      if (mark) {
        try {
          // small, in the footer gutter — present but never over content
          doc.image(mark, doc.page.width - 74, doc.page.height - 50, { width: 26 });
        } catch (_) { /* non-fatal */ }
      }
      const fy = doc.page.height - 58;
      doc.moveTo(L, fy).lineTo(L + W, fy).lineWidth(0.5).stroke(LINE);
      doc.font(B).fontSize(6).fillColor(MUTED).text(DISCLAIMER, L, fy + 6, { width: W - 44, lineGap: 0.5 });
      doc.font(B).fontSize(7).fillColor(MUTED)
        .text((p - range.start + 1) + ' / ' + range.count, L, fy + 6, { width: W, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}

module.exports = { buildPdf };

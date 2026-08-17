/* ScootHero fleet operator model — shared by the browser page and the server.
   Single source of truth so the PDF can never disagree with what the customer saw. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SHModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C = {
    WPM: 4.345,             // weeks per month
    RES_OP: 0.25,           // operating lease — residual retained by lessor
    RES_LTO: 0,             // lease to own — amortises to zero
    BAD_MAX: 0.08,          // missed payments with no deposit held
    BAD_MIN: 0.02,          // floor once a deposit covers two weeks' rent
    PETROL_WEEKLY: 272,     // what an equivalent petrol bike returns a week when
                            // the operator does all the work themselves
    FUEL_RATE: 0.62         // per km, billed to the business on the two lease models
  };

  /* The two lease models are a different business to buying outright.
     Outright  — you own the bikes and on-rent them to riders. HeroCare R465,
                 battery billed to the rider, deposit held against unpaid rent.
     Leases    — the lease bars sub-renting, so the company runs the bikes with its
                 own drivers. HeroCare R638, and the company is billed for energy at
                 62c/km. No rider, so no deposit and no rider default risk. */
  var MODELS = {
    buy:     { herocare: 465, onRent: true,  fuelToBusiness: false },
    oplease: { herocare: 638, onRent: false, fuelToBusiness: true },
    lto:     { herocare: 638, onRent: false, fuelToBusiness: true }
  };
  function modelRules(fund) { return MODELS[fund] || MODELS.buy; }

  var DEFAULTS = {
    bikes: 5,
    fund: 'buy',            // buy | oplease | lto
    term: 3,                // years
    rental: 850,            // weekly rent charged to a rider, outright model only
    herocare: 465,          // HeroCare when buying outright, excl VAT
    herocareLease: 638,     // HeroCare on either lease, excl VAT
    kmPerWeek: 110,         // average km per bike per week
    leaseRate: 15,          // annual finance rate on either lease, % — indicative
    adminMonthly: 50,       // admin fee per vehicle per month
    // One-off extras, per bike, excl VAT
    boxPrice: 2500,         // delivery box, fitted
    pdiPrice: 2500,         // pre-delivery inspection
    wantBoxes: false,       // customer ticks these on the proposal
    wantPdi: true,          // PDI is standard, ticked by default
    wantGear: false,        // helmets and jackets — priced separately
    // Comparative petrol bike, weekly per bike. PLACEHOLDERS — confirm before use.
    pFinance: 210,          // instalment or depreciation
    pFuelPerKm: 0.63,       // ~35 km/l at ~R22/l
    pService: 55,           // servicing, tyres, consumables
    pInsurance: 140,        // insurance and tracking
    kmRate: 0.60,           // 60c/km equivalent the rider is charged for battery
                            // usage — billed to the rider directly, so it does not
                            // appear in the operator's cash flow
    price: 35000,           // bike price, excl VAT
    util: 0.92,             // share of weeks a bike is on rent (8% idle)
    dep: 0.10,              // deposit on either lease, share of price
    deposit: 1500           // rider deposit held, rand
  };

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
  function n(v, fb) { var x = parseFloat(v); return isFinite(x) ? x : fb; }

  function normalise(raw) {
    raw = raw || {};
    var fund = ['buy', 'oplease', 'lto'].indexOf(raw.fund) > -1 ? raw.fund : DEFAULTS.fund;
    return {
      bikes:   clamp(Math.round(n(raw.bikes, DEFAULTS.bikes)), 1, 50),
      fund:    fund,
      term:    n(raw.term, DEFAULTS.term) === 5 ? 5 : 3,
      rental:      Math.max(n(raw.rental, DEFAULTS.rental), 0),
      petrol:   Math.max(n(raw.petrol, C.PETROL_WEEKLY), 0),
      herocare:      Math.max(n(raw.herocare, DEFAULTS.herocare), 0),
      herocareLease: Math.max(n(raw.herocareLease, DEFAULTS.herocareLease), 0),
      kmPerWeek:     clamp(n(raw.kmPerWeek, DEFAULTS.kmPerWeek), 0, 3000),
      leaseRate:     clamp(n(raw.leaseRate, DEFAULTS.leaseRate), 0, 40),
      adminMonthly:  Math.max(n(raw.adminMonthly, DEFAULTS.adminMonthly), 0),
      boxPrice:      Math.max(n(raw.boxPrice, DEFAULTS.boxPrice), 0),
      pdiPrice:      Math.max(n(raw.pdiPrice, DEFAULTS.pdiPrice), 0),
      wantBoxes:     raw.wantBoxes === undefined ? DEFAULTS.wantBoxes : !!raw.wantBoxes,
      wantPdi:       raw.wantPdi   === undefined ? DEFAULTS.wantPdi   : !!raw.wantPdi,
      wantGear:      raw.wantGear  === undefined ? DEFAULTS.wantGear  : !!raw.wantGear,
      pFinance:      Math.max(n(raw.pFinance, DEFAULTS.pFinance), 0),
      pFuelPerKm:    Math.max(n(raw.pFuelPerKm, DEFAULTS.pFuelPerKm), 0),
      pService:      Math.max(n(raw.pService, DEFAULTS.pService), 0),
      pInsurance:    Math.max(n(raw.pInsurance, DEFAULTS.pInsurance), 0),
      kmRate:   Math.max(n(raw.kmRate, DEFAULTS.kmRate), 0),
      price:    Math.max(n(raw.price, DEFAULTS.price), 0),
      util:    clamp(n(raw.util, DEFAULTS.util), 0.01, 1),
      dep:     clamp(n(raw.dep, DEFAULTS.dep), 0, 1),
      deposit: Math.max(n(raw.deposit, DEFAULTS.deposit), 0)
    };
  }

  function pmt(principal, annual, months, residual) {
    var r = annual / 12, fv = principal * residual;
    if (r === 0) return (principal - fv) / months;
    return (principal - fv / Math.pow(1 + r, months)) * r / (1 - Math.pow(1 + r, -months));
  }

  // Flat per bike whatever the fleet size, but the lease models carry the higher rate.
  function heroCareRate(i, fund) {
    return modelRules(fund).onRent ? i.herocare : i.herocareLease;
  }

  // a deposit worth two weeks' rent takes missed payments down to the floor
  function badDebt(i) {
    var cover = i.rental > 0 ? Math.min(1, i.deposit / (2 * i.rental)) : 0;
    return C.BAD_MAX - (C.BAD_MAX - C.BAD_MIN) * cover;
  }

  /**
   * @param raw            user inputs
   * @param fundOverride   'buy' | 'oplease' | 'lto'
   * @param termOverride   finance term in years — drives the instalment
   * @param horizonYears   reporting window in years — defaults to the finance term.
   *                       Kept separate so a 1-year view of a 3-year lease still
   *                       uses the 3-year instalment.
   */
  function compute(raw, fundOverride, termOverride, horizonYears) {
    var i = normalise(raw);
    var fund = fundOverride || i.fund;
    var years = termOverride || i.term;
    var termMonths = years * 12;
    var horizon = horizonYears || years;
    var months = horizon * 12;
    var bad = badDebt(i);
    var nb = i.bikes;

    var rules = modelRules(fund);
    var careWk = heroCareRate(i, fund);
    // No rider on the lease models, so no deposit and no default risk.
    if (!rules.onRent) bad = 0;
    var fuelWk = rules.fuelToBusiness ? i.kmPerWeek * C.FUEL_RATE * i.util : 0;
    var adminWk = i.adminMonthly / C.WPM;   // R50 a month per vehicle
    // Leases carry no rider revenue — the client is buying capacity, not a rental book.
    var grossWk = rules.onRent ? i.rental : 0;
    var collectWk = rules.onRent ? grossWk * i.util * (1 - bad) : 0;
    var lossWk = grossWk - collectWk;

    var instal = 0, upfront = 0;
    if (fund === 'buy') {
      upfront = i.price * nb;
    } else if (fund === 'oplease') {
      instal = pmt(i.price, i.leaseRate / 100, termMonths, C.RES_OP);
      upfront = (i.price * i.dep + instal) * nb;
    } else {
      instal = pmt(i.price, i.leaseRate / 100, termMonths, C.RES_LTO);
      upfront = (i.price * i.dep + instal) * nb;
    }

    // One-off extras sit on top of the bike price on an outright purchase.
    var boxTotal = rules.onRent && i.wantBoxes ? i.boxPrice * nb : 0;
    var pdiTotal = rules.onRent && i.wantPdi   ? i.pdiPrice * nb : 0;
    var extrasTotal = boxTotal + pdiTotal;

    var finWk = instal / C.WPM;
    var runWk = careWk + fuelWk + adminWk;
    var revM = collectWk * C.WPM * nb;
    var opM = runWk * C.WPM * nb;
    var finM = instal * nb;
    var netM = revM - opM - finM;
    if (fund === 'buy') upfront += extrasTotal;
    var profit = netM * months - upfront;

    return {
      inputs: i, fund: fund, years: years, horizon: horizon,
      months: months, termMonths: termMonths,
      bad: bad,
      grossWk: grossWk, collectWk: collectWk, lossWk: lossWk,
      careWk: careWk, fuelWk: fuelWk, adminWk: adminWk, servWk: runWk,
      onRent: rules.onRent, fuelToBusiness: rules.fuelToBusiness,
      finWk: finWk, margWk: collectWk - runWk - finWk,
      instal: instal, upfront: upfront,
      revM: revM, opM: opM, finM: finM, netM: netM,
      commit: finM * months,
      ror: revM > 0 ? netM / revM : 0,
      profit: profit,
      roi: upfront > 0 ? profit / upfront : 0,
      payback: netM > 0 ? upfront / netM : Infinity,
      wkCollected: collectWk * nb,
      wkService: runWk * nb,
      wkCare: careWk * nb,
      wkFuel: fuelWk * nb,
      wkAdmin: adminWk * nb,
      wkNet: (collectWk - runWk) * nb,
      wkFinance: finWk * nb,
      petrolWk: i.petrol,

      // --- proposal lines ---
      bikeTotal: i.price * nb,
      boxTotal: boxTotal, pdiTotal: pdiTotal, extrasTotal: extrasTotal,
      proposalTotal: i.price * nb + extrasTotal,
      wantBoxes: i.wantBoxes, wantPdi: i.wantPdi, wantGear: i.wantGear,

      // --- cost view, used for the two lease models ---
      costWk: runWk + finWk,                       // per bike per week
      costM: (runWk + finWk) * C.WPM * nb,         // fleet per month
      costTotal: (runWk + finWk) * C.WPM * nb * months + upfront,
      petrolFuelWk: i.kmPerWeek * i.pFuelPerKm,
      petrolCostWk: i.pFinance + i.kmPerWeek * i.pFuelPerKm + i.pService + i.pInsurance,
      leaseRate: i.leaseRate,
      petrolParts: [
        ['Instalment or depreciation', i.pFinance],
        ['Fuel', i.kmPerWeek * i.pFuelPerKm],
        ['Servicing, tyres, consumables', i.pService],
        ['Insurance and tracking', i.pInsurance]
      ]
    };
  }

  function fundLabel(f, rate) {
    var r = (rate === undefined ? DEFAULTS.leaseRate : rate);
    return {
      buy: 'Bought outright',
      oplease: 'Operating lease at ' + r + '%',
      lto: 'Lease to own at ' + r + '%'
    }[f] || f;
  }

  function money(v) {
    var x = Math.round(v);
    return (x < 0 ? '-R' : 'R') + Math.abs(x).toLocaleString('en-ZA').replace(/,/g, ' ');
  }

  function percent(v) {
    var p = v * 100;
    return (p >= 100 ? p.toFixed(0) : p.toFixed(1).replace(/\.0$/, '')) + '%';
  }

  return {
    CONSTANTS: C, DEFAULTS: DEFAULTS,
    normalise: normalise, compute: compute, heroCareRate: heroCareRate, modelRules: modelRules,
    fundLabel: fundLabel, money: money, percent: percent
  };
});

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
      term:    [1, 3, 5].indexOf(n(raw.term, DEFAULTS.term)) > -1 ? n(raw.term, DEFAULTS.term) : 3,
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
    if (i.util >= 1) return 0;   // full occupancy — no idle weeks, no arrears
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

    // Spread the capital over the term rather than dropping it all into year one,
    // so the short view is not distorted by a cost the whole term carries.
    var capitalCharge = upfront * (horizon / years);
    var profit = netM * months - capitalCharge;

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
      capitalCharge: capitalCharge,
      roi: capitalCharge > 0 ? profit / capitalCharge : 0,
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

  // per-km rates need cents; money() rounds to whole rand
  function moneyC(v) {
    var neg = v < 0;
    return (neg ? '-R' : 'R') + Math.abs(v).toFixed(2);
  }

  function percent(v) {
    var p = v * 100;
    return (p >= 100 ? p.toFixed(0) : p.toFixed(1).replace(/\.0$/, '')) + '%';
  }

  /* ------------------------------------------------------------------
     FLEET OPERATOR SAVINGS — the driver deal.
     The rider's fuel saving is what lets the operator charge a higher
     weekly rental. So the driver must still come out ahead, or the deal
     does not hold. Petrol cost per km is derived from the pump price and
     a fixed 30 km/l, rather than assumed.
     ------------------------------------------------------------------ */
  var SAVINGS_DEFAULTS = {
    bikes: 10,
    fuelPrice: 24.50,       // rand per litre at the pump
    kmPerLitre: 24,         // fixed — realistic for a loaded delivery bike in traffic
    electricPerKm: 0.62,    // battery swap cost per km
    petrolRental: 700,      // weekly rental the rider pays on petrol
    electricRental: 850,    // fixed — the ScootHero weekly rider rental
    // average market kilometres a delivery rider covers each day
    days: [80, 100, 100, 125, 140, 160, 0]
  };
  var DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  function normaliseSavings(raw) {
    raw = raw || {};
    var d = (raw.days && raw.days.length === 7) ? raw.days : SAVINGS_DEFAULTS.days;
    return {
      bikes:          clamp(Math.round(n(raw.bikes, SAVINGS_DEFAULTS.bikes)), 1, 200),
      fuelPrice:      Math.max(n(raw.fuelPrice, SAVINGS_DEFAULTS.fuelPrice), 0),
      kmPerLitre:     SAVINGS_DEFAULTS.kmPerLitre,       // fixed, not an input
      electricPerKm:  Math.max(n(raw.electricPerKm, SAVINGS_DEFAULTS.electricPerKm), 0),
      petrolRental:   Math.max(n(raw.petrolRental, SAVINGS_DEFAULTS.petrolRental), 0),
      electricRental: SAVINGS_DEFAULTS.electricRental,   // fixed, not an input
      days: d.map(function (v) { return clamp(n(v, 0), 0, 1000); })
    };
  }

  function computeSavings(raw) {
    var i = normaliseSavings(raw);
    var weeklyKm = i.days.reduce(function (a, b) { return a + b; }, 0);

    var petrolPerKm = i.kmPerLitre > 0 ? i.fuelPrice / i.kmPerLitre : 0;
    var rows = i.days.map(function (km, idx) {
      var pc = km * petrolPerKm, ec = km * i.electricPerKm;
      return { day: DAY_NAMES[idx], km: km, petrol: pc, electric: ec, saving: pc - ec };
    });

    var petrolFuelWk   = weeklyKm * petrolPerKm;
    var electricEnergyWk = weeklyKm * i.electricPerKm;
    var energySaving   = petrolFuelWk - electricEnergyWk;

    var driverPetrolWk   = i.petrolRental + petrolFuelWk;
    var driverElectricWk = i.electricRental + electricEnergyWk;
    var driverSavingWk   = driverPetrolWk - driverElectricWk;

    var rentalGap        = i.electricRental - i.petrolRental;
    var operatorUpliftWk = rentalGap * i.bikes;

    // the highest electric rental that still leaves the rider better off
    var breakEvenRental = i.petrolRental + energySaving;

    return {
      inputs: i, dayNames: DAY_NAMES, rows: rows,
      weeklyKm: weeklyKm, petrolPerKm: petrolPerKm,
      petrolFuelWk: petrolFuelWk, electricEnergyWk: electricEnergyWk,
      energySaving: energySaving,
      driverPetrolWk: driverPetrolWk, driverElectricWk: driverElectricWk,
      driverSavingWk: driverSavingWk,
      driverSavingMonth: driverSavingWk * C.WPM,
      driverSavingYear: driverSavingWk * 52,
      rentalGap: rentalGap,
      operatorUpliftWk: operatorUpliftWk,
      operatorUpliftMonth: operatorUpliftWk * C.WPM,
      operatorUpliftYear: operatorUpliftWk * 52,
      breakEvenRental: breakEvenRental,
      driverBetterOff: driverSavingWk >= 0,
      headroom: breakEvenRental - i.electricRental
    };
  }

  /* ------------------------------------------------------------------
     DRIVER OFFER — what a rider earns and what the bike costs them.
     Rates are the observed averages from a live TDT rider working both
     Express (courier) and Food over June–July 2026:
       Food     R58.05 a delivery, 4.13 km average leg
       Express  R19.63 a parcel
     Kilometres are derived from what the rider already spends on petrol,
     so they never have to know their own consumption.
     ------------------------------------------------------------------ */
  var DRIVER_DEFAULTS = {
    foodJobs: 9,            // deliveries a day
    expressJobs: 40,        // parcels a day
    petrolPerDay: 180,      // rand of fuel a day
    petrolRent: 700,        // weekly rental if the rider does not own the bike
    daysPerWeek: 5,
    foodRate: 58.05,
    expressRate: 19.63,
    fuelPrice: 25.00,
    kmPerLitre: 24,
    electricPerKm: 0.62,
    electricRent: 850,      // ScootHero weekly rental, maintenance and insurance in
    petrolMaintenanceWk: 250 // tyres, services, repairs the rider carries on petrol
  };

  function computeDriver(raw) {
    raw = raw || {};
    var d = {
      foodJobs:     clamp(n(raw.foodJobs, DRIVER_DEFAULTS.foodJobs), 0, 200),
      expressJobs:  clamp(n(raw.expressJobs, DRIVER_DEFAULTS.expressJobs), 0, 500),
      petrolPerDay: Math.max(n(raw.petrolPerDay, DRIVER_DEFAULTS.petrolPerDay), 0),
      petrolRent:   Math.max(n(raw.petrolRent, DRIVER_DEFAULTS.petrolRent), 0),
      daysPerWeek:  clamp(n(raw.daysPerWeek, DRIVER_DEFAULTS.daysPerWeek), 1, 7),
      foodRate:     Math.max(n(raw.foodRate, DRIVER_DEFAULTS.foodRate), 0),
      expressRate:  Math.max(n(raw.expressRate, DRIVER_DEFAULTS.expressRate), 0),
      fuelPrice:    Math.max(n(raw.fuelPrice, DRIVER_DEFAULTS.fuelPrice), 0),
      kmPerLitre:   DRIVER_DEFAULTS.kmPerLitre,
      electricPerKm: DRIVER_DEFAULTS.electricPerKm,
      electricRent: DRIVER_DEFAULTS.electricRent,
      petrolMaintenanceWk: Math.max(n(raw.petrolMaintenanceWk, DRIVER_DEFAULTS.petrolMaintenanceWk), 0)
    };

    var jobsDay   = d.foodJobs + d.expressJobs;
    var earnDay   = d.foodJobs * d.foodRate + d.expressJobs * d.expressRate;
    var earnWk    = earnDay * d.daysPerWeek;
    var earnMonth = earnWk * C.WPM;

    // kilometres inferred from the rider's own fuel spend
    var petrolPerKm = d.kmPerLitre > 0 ? d.fuelPrice / d.kmPerLitre : 0;
    var kmDay  = petrolPerKm > 0 ? d.petrolPerDay / petrolPerKm : 0;
    var kmWk   = kmDay * d.daysPerWeek;

    // --- petrol bike ---
    var pFuelWk  = d.petrolPerDay * d.daysPerWeek;
    var pMaintWk = d.petrolMaintenanceWk;
    var pRentWk  = d.petrolRent;
    var pCostWk  = pFuelWk + pMaintWk + pRentWk;

    // --- electric: rental covers maintenance, insurance and tracking ---
    var eEnergyWk = kmWk * d.electricPerKm;
    var eRentWk   = d.electricRent;
    var eCostWk   = eEnergyWk + eRentWk;

    var jobsWk = jobsDay * d.daysPerWeek;
    return {
      inputs: d,
      jobsDay: jobsDay, jobsWk: jobsWk, jobsMonth: jobsWk * C.WPM,
      earnDay: earnDay, earnWk: earnWk, earnMonth: earnMonth,
      earnPerJob: jobsDay > 0 ? earnDay / jobsDay : 0,
      foodShare: jobsDay > 0 ? d.foodJobs / jobsDay : 0,
      petrolPerKm: petrolPerKm, kmDay: kmDay, kmWk: kmWk, kmMonth: kmWk * C.WPM,

      pFuelWk: pFuelWk, pMaintWk: pMaintWk, pRentWk: pRentWk,
      pCostWk: pCostWk, pCostMonth: pCostWk * C.WPM,
      pNetWk: earnWk - pCostWk, pNetMonth: (earnWk - pCostWk) * C.WPM,
      pCostPerJob: jobsWk > 0 ? pCostWk / jobsWk : 0,

      eEnergyWk: eEnergyWk, eRentWk: eRentWk,
      eCostWk: eCostWk, eCostMonth: eCostWk * C.WPM,
      eNetWk: earnWk - eCostWk, eNetMonth: (earnWk - eCostWk) * C.WPM,
      eCostPerJob: jobsWk > 0 ? eCostWk / jobsWk : 0,

      savingWk: pCostWk - eCostWk,
      savingMonth: (pCostWk - eCostWk) * C.WPM,
      savingYear: (pCostWk - eCostWk) * 52,
      betterOff: (pCostWk - eCostWk) >= 0
    };
  }

  return {
    CONSTANTS: C, DEFAULTS: DEFAULTS,
    DRIVER_DEFAULTS: DRIVER_DEFAULTS, computeDriver: computeDriver,
    SAVINGS_DEFAULTS: SAVINGS_DEFAULTS, DAY_NAMES: DAY_NAMES,
    normaliseSavings: normaliseSavings, computeSavings: computeSavings,
    normalise: normalise, compute: compute, heroCareRate: heroCareRate, modelRules: modelRules,
    fundLabel: fundLabel, money: money, moneyC: moneyC, percent: percent
  };
});

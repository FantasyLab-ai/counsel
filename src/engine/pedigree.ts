// pedigree.ts — where each method comes from, in English. Aurora's caliber
// is invisible if the math never introduces itself: these are the serious
// rooms each technique works in when it isn't working for a food truck.
// Auto-attached to every receipt sheet by keyword — write the MathBlock,
// the pedigree finds it.

export interface Pedigree {
  name: string;   // "PELT change-point detection"
  what: string;   // one plain-English sentence
  home: string;   // the serious-world anchor
}

const P: { match: RegExp; ped: Pedigree }[] = [
  {
    match: /change.?point|PELT|structural break/i,
    ped: {
      name: "PELT change-point detection",
      what: "Finds the exact day your numbers structurally changed — not a dip, a regime change.",
      home: "The same detector used in genomics labs and market-regime analysis. Aurora's port is parity-tested against the scientific reference implementation.",
    },
  },
  {
    match: /Welch|t-test|significance/i,
    ped: {
      name: "Welch's t-test",
      what: "Asks whether a difference is bigger than your normal day-to-day noise.",
      home: "The significance test at the core of clinical trials — the bar medicine uses before believing a result.",
    },
  },
  {
    match: /Kaplan|survival|censored/i,
    ped: {
      name: "Kaplan–Meier survival analysis",
      what: "Reads who's quietly gone versus who just hasn't come back YET — the math knows the difference.",
      home: "The method hospitals use to read patient outcomes. Applied here to customers instead of patients.",
    },
  },
  {
    match: /newsvendor|critical.?fractile/i,
    ped: {
      name: "Newsvendor critical fractile",
      what: "Balances the cost of running out against the cost of sitting on stock — an optimum, not a hunch.",
      home: "The inventory model airlines and major retailers run at scale, sized here to your shelf.",
    },
  },
  {
    match: /Monte Carlo|simulated futures|bootstrap by weekday/i,
    ped: {
      name: "Monte Carlo simulation",
      what: "Runs a thousand plausible versions of your next 90 days and counts how many go wrong.",
      home: "How engineers stress-test bridges and reactors before trusting them — applied to your cash.",
    },
  },
  {
    match: /AR\(1\)|banded forecast|prediction interval/i,
    ped: {
      name: "AR(1) forecasting with analytic bands",
      what: "Projects forward AND tells you how wrong it could be — the band is the honest part.",
      home: "The workhorse of econometric forecasting; the analytic intervals are what most dashboards drop.",
    },
  },
  {
    match: /natural experiment|elasticity/i,
    ped: {
      name: "Natural-experiment elasticity",
      what: "Measures how YOUR buyers responded to YOUR price change — never an industry average.",
      home: "The causal-inference pattern economists use when a lab isn't possible — your price change was the experiment.",
    },
  },
  {
    match: /event stud|48h window|post lift/i,
    ped: {
      name: "Event-study analysis",
      what: "Measures the lift after each post against what that weekday normally does anyway.",
      home: "The method finance uses to measure an announcement's real impact on a stock.",
    },
  },
  {
    match: /weekday.weight|weekday (median|norm|profile|decomposition)|season/i,
    ped: {
      name: "Seasonal decomposition",
      what: "Separates your weekly rhythm from real change, so a slow Tuesday is judged as a Tuesday.",
      home: "The adjustment central banks apply to economic series before reading them.",
    },
  },
  {
    match: /median ±|MAD/i,
    ped: {
      name: "Robust statistics (median ± MAD)",
      what: "Norms that one wild day can't drag around — outliers inform, they don't distort.",
      home: "The robust-statistics toolkit used where data is messy and stakes are high.",
    },
  },
  {
    match: /exact identity|transparent arithmetic|telescop|sums to the move/i,
    ped: {
      name: "Exact accounting identity",
      what: "Not a model at all — the parts sum to the total to the penny, checkable by hand.",
      home: "The decomposition discipline of national accounts: attribution with nothing left over.",
    },
  },
  {
    match: /probability-weighted|weighted AR|13-week/i,
    ped: {
      name: "13-week cash projection",
      what: "Banded revenue plus probability-weighted receivables against the bill schedule, week by week.",
      home: "THE standing deliverable of fractional CFOs and turnaround specialists — the report that costs four figures a month.",
    },
  },
];

export function findPedigree(text: string): Pedigree | null {
  for (const { match, ped } of P) {
    if (match.test(text)) return ped;
  }
  return null;
}

// Calibration — the measured false-fire context for changepoint claims.
//
// Aurora v0.10.0 measured, on seeded synthetic nulls, how often its
// production changepoint detectors fire on data containing NOTHING to
// find. The verdict: autocorrelation is the killer — a detector that's
// quiet on independent data fires on roughly half of stationary series
// once lag-1 autocorrelation reaches 0.6. Counsel surfaces that here:
// we fingerprint YOUR series (length + bias-corrected autocorrelation),
// find the nearest measured cell, and say the number out loud.
//
// Honesty rules (mirrors aurora's lookup contract):
//   * outside the measured envelope -> we say "outside", never a guess
//   * between grid points -> nearest cell, with the distance shown
//   * the corpus version + sha ride along so anyone can check the table
//
// The numbers in calibrationCorpus.ts are GENERATED from the shipped
// aurora corpus file, never hand-typed. Counsel's break detector is the
// ported PELT family; the cited cells are aurora's measured CUSUM/PELT
// rates — same detector family, stated as such, not oversold.

import { CELLS, CORPUS_SHA256, CORPUS_VERSION } from "./calibrationCorpus";

export interface CalibrationRead {
  phiHat: number;          // Kendall bias-corrected lag-1 autocorrelation
  n: number;
  status: "measured" | "outside_envelope";
  method: string;          // which corpus method the cell came from
  cellPhi: number;
  cellN: number;
  fdr: number;             // measured false-fire rate at that cell
  ciLo: number;
  ciHi: number;
  trials: number;
  distancePhi: number;     // |phiHat - cellPhi| — always disclosed
  line: string;            // owner-first sentence: the plain meaning
  detail: string;          // the precise measured line (all the numbers)
  corpusVersion: string;
  corpusSha256: string;
}

/** Kendall bias-corrected lag-1 autocorrelation (matches aurora's
 *  fingerprint estimator — the naive r1 understates phi on short
 *  series, which understates the false-fire risk). */
export function phiHat(series: number[]): number | null {
  const x = series.filter((v) => isFinite(v));
  const n = x.length;
  if (n < 12) return null;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const c = x[i] - mean;
    den += c * c;
    if (i < n - 1) num += c * (x[i + 1] - mean);
  }
  if (den <= 0) return null;
  const r1 = num / den;
  return Math.max(-0.99, Math.min(0.99, r1 + (1 + 3 * r1) / n));
}

/** Read the measured false-fire rate for a series shaped like this one.
 *  Prefers PELT cells (Counsel's detector family), falls back to CUSUM. */
export function calibrationRead(series: number[]): CalibrationRead | null {
  const p = phiHat(series);
  if (p === null) return null;
  const n = series.filter((v) => isFinite(v)).length;

  const phis = [...new Set(CELLS.map((c) => c[2]))].sort((a, b) => a - b);
  const maxPhi = phis[phis.length - 1];
  const ns = [...new Set(CELLS.map((c) => c[1]))].sort((a, b) => a - b);

  const base = {
    phiHat: Math.round(p * 100) / 100, n,
    corpusVersion: CORPUS_VERSION, corpusSha256: CORPUS_SHA256,
  };

  // Outside the measured envelope: say so, never guess.
  if (p > maxPhi + 0.05 || p < -0.05 || n < ns[0] * 0.75 || n > ns[ns.length - 1] * 1.25) {
    return {
      ...base,
      status: "outside_envelope",
      method: "", cellPhi: 0, cellN: 0, fdr: 0, ciLo: 0, ciHi: 0, trials: 0,
      distancePhi: 0,
      line:
        "Your sales pattern is outside the range we've stress-tested, so " +
        "no error rate is quoted here — we don't guess at numbers we " +
        "haven't measured.",
      detail:
        `Series fingerprint φ̂=${p.toFixed(2)}, n=${n} — outside the ` +
        `measured calibration envelope of corpus ${CORPUS_VERSION}.`,
    };
  }

  // Nearest cell, PELT first (Counsel's family), CUSUM as fallback.
  const pick = (method: string) => {
    const cands = CELLS.filter((c) => c[0] === method);
    if (!cands.length) return null;
    let best = cands[0];
    let bestD = Infinity;
    for (const c of cands) {
      const d = Math.abs(c[2] - p) / 0.2 + Math.abs(Math.log(Math.max(n, 1) / c[1])) / Math.log(1.5);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };
  const cell = pick("pelt") ?? pick("cusum");
  if (!cell) return null;
  const [method, cellN, cellPhi, fdr, ciLo, ciHi, trials] = cell;

  const pct = (v: number) => `${(v * 100).toFixed(v < 0.02 ? 1 : 0)}%`;
  // Owner-first: what it MEANS, in words. The precise measurement, with
  // every number, sits right under it — nothing is removed, only ordered.
  const line = fdr > 0.25
    ? `Sales patterns like yours fool this kind of detector often — on ` +
      `lookalike data with no real change, it still fires ${pct(fdr)} of ` +
      `the time. So we treat a single detected break as provisional until ` +
      `it repeats.`
    : fdr > 0.05
    ? `On lookalike data with no real change, this kind of detector fires ` +
      `${pct(fdr)} of the time — worth knowing, not alarming.`
    : `Patterns like yours rarely fool this detector — it fires on only ` +
      `${pct(fdr)} of lookalike data with no real change.`;
  const detail =
    `Measured on ${trials.toLocaleString()} seeded null series shaped like ` +
    `yours (φ≈${cellPhi}, n=${cellN}): ${method.toUpperCase()}-family rate ` +
    `${pct(fdr)}, 95% CI ${pct(ciLo)}–${pct(ciHi)}. Your series: ` +
    `φ̂=${p.toFixed(2)}, n=${n}.`;

  return {
    ...base,
    status: "measured", method, cellPhi, cellN,
    fdr, ciLo, ciHi, trials,
    distancePhi: Math.round(Math.abs(p - cellPhi) * 100) / 100,
    line, detail,
  };
}

/** True when a method label refers to the changepoint family — the only
 *  claims this calibration context applies to. */
export function isChangepointMethod(methodText: string): boolean {
  return /change.?point|break.?line|regime|pelt|cusum|bocpd|segmentation/i
    .test(methodText);
}

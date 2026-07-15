// aurora-core (Rust → WebAssembly) loader — the on-device engine.
// Hand-rolled ABI: f64 arrays through linear memory, no wasm-bindgen.
// The .wasm is the SAME crate that passes golden parity vs the Python engine.

export interface WelchOut { t: number; df: number; p: number }
export interface Ar1Out {
  a: number; b: number; residStd: number;
  forecast: number[]; lo: number[]; hi: number[];
}

interface Exports {
  memory: WebAssembly.Memory;
  ac_alloc(len: number): number;
  ac_free(ptr: number, len: number): void;
  ac_changepoints(vp: number, n: number, model: number, pen: number, op: number, cap: number): number;
  ac_welch(ap: number, an: number, bp: number, bn: number, op: number): void;
  ac_ar1(yp: number, n: number, h: number, alpha: number, fp: number, lp: number, hp: number, pp: number): number;
}

let exportsCache: Exports | null = null;

export async function loadCore(): Promise<void> {
  if (exportsCache) return;
  const resp = await fetch("/aurora_core.wasm");
  const { instance } = await WebAssembly.instantiateStreaming(resp, {});
  exportsCache = instance.exports as unknown as Exports;
}

function ex(): Exports {
  if (!exportsCache) throw new Error("aurora-core not loaded — call loadCore() first");
  return exportsCache;
}

/** Copy an array into wasm memory; returns the pointer. */
function writeF64(values: number[] | Float64Array): { ptr: number; len: number } {
  const e = ex();
  const len = values.length;
  const ptr = e.ac_alloc(len * 8);
  new Float64Array(e.memory.buffer, ptr, len).set(values);
  return { ptr, len };
}

export function detectChangepoints(values: number[], model: "rbf" | "l2", penalty: number): number[] {
  const e = ex();
  const v = writeF64(values);
  const cap = 64;
  const outPtr = e.ac_alloc(cap * 4);
  const k = e.ac_changepoints(v.ptr, v.len, model === "l2" ? 1 : 0, penalty, outPtr, cap);
  const out = Array.from(new Uint32Array(e.memory.buffer, outPtr, Math.max(0, k)));
  e.ac_free(v.ptr, v.len * 8);
  e.ac_free(outPtr, cap * 4);
  return out;
}

export function welch(a: number[], b: number[]): WelchOut {
  const e = ex();
  const av = writeF64(a);
  const bv = writeF64(b);
  const outPtr = e.ac_alloc(3 * 8);
  e.ac_welch(av.ptr, av.len, bv.ptr, bv.len, outPtr);
  const [t, df, p] = new Float64Array(e.memory.buffer, outPtr, 3);
  e.ac_free(av.ptr, av.len * 8);
  e.ac_free(bv.ptr, bv.len * 8);
  e.ac_free(outPtr, 3 * 8);
  return { t, df, p };
}

export function ar1Forecast(y: number[], horizon: number, alpha = 0.05): Ar1Out | null {
  const e = ex();
  const yv = writeF64(y);
  const fp = e.ac_alloc(horizon * 8);
  const lp = e.ac_alloc(horizon * 8);
  const hp = e.ac_alloc(horizon * 8);
  const pp = e.ac_alloc(3 * 8);
  const rc = e.ac_ar1(yv.ptr, yv.len, horizon, alpha, fp, lp, hp, pp);
  let result: Ar1Out | null = null;
  if (rc === 0) {
    const forecast = Array.from(new Float64Array(e.memory.buffer, fp, horizon));
    const lo = Array.from(new Float64Array(e.memory.buffer, lp, horizon));
    const hi = Array.from(new Float64Array(e.memory.buffer, hp, horizon));
    const [a, b, residStd] = new Float64Array(e.memory.buffer, pp, 3);
    result = { a, b, residStd, forecast, lo, hi };
  }
  e.ac_free(yv.ptr, yv.len * 8);
  e.ac_free(fp, horizon * 8);
  e.ac_free(lp, horizon * 8);
  e.ac_free(hp, horizon * 8);
  e.ac_free(pp, 3 * 8);
  return result;
}

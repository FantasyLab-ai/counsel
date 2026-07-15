//! WebAssembly FFI — a minimal hand-rolled C ABI (no wasm-bindgen, no deps).
//!
//! The JS side (Counsel's `src/engine/auroraCore.ts`) writes f64 arrays into
//! linear memory via `ac_alloc`, calls the exported functions, and reads the
//! results back. Keeping the ABI to plain pointers + lengths means the crate
//! stays dependency-free and the .wasm stays tiny.
//!
//! Compiled only for wasm32; native builds (and the uniffi mobile path) never
//! see this module.
#![allow(clippy::missing_safety_doc)]

use crate::{ar1_forecast, detect_changepoints, welch_t, CostModel};

/// Allocate `len` bytes inside wasm memory; returns the pointer.
#[no_mangle]
pub extern "C" fn ac_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free a buffer previously returned by `ac_alloc`.
#[no_mangle]
pub unsafe extern "C" fn ac_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

/// PELT change points. model: 0 = rbf, 1 = l2. Writes up to `out_cap`
/// indices (u32) into `out_ptr`; returns the number found.
#[no_mangle]
pub unsafe extern "C" fn ac_changepoints(
    values_ptr: *const f64,
    n: usize,
    model: u32,
    penalty: f64,
    out_ptr: *mut u32,
    out_cap: usize,
) -> i32 {
    let values = std::slice::from_raw_parts(values_ptr, n);
    let model = if model == 1 { CostModel::L2 } else { CostModel::Rbf };
    let idx = detect_changepoints(values, model, penalty);
    let out = std::slice::from_raw_parts_mut(out_ptr, out_cap);
    let k = idx.len().min(out_cap);
    for (i, v) in idx.iter().take(k).enumerate() {
        out[i] = *v as u32;
    }
    k as i32
}

/// Welch's t-test. Writes [t, df, p] into `out_ptr` (3 f64s).
#[no_mangle]
pub unsafe extern "C" fn ac_welch(
    a_ptr: *const f64,
    an: usize,
    b_ptr: *const f64,
    bn: usize,
    out_ptr: *mut f64,
) {
    let a = std::slice::from_raw_parts(a_ptr, an);
    let b = std::slice::from_raw_parts(b_ptr, bn);
    let r = welch_t(a, b);
    let out = std::slice::from_raw_parts_mut(out_ptr, 3);
    out[0] = r.t;
    out[1] = r.df;
    out[2] = r.p;
}

/// AR(1) forecast with analytic bands. Writes `horizon` f64s into each of
/// fc/lo/hi, and [a, b, resid_std] into params (3 f64s).
/// Returns 0 on success, -1 if the series is too short (< 30).
#[no_mangle]
pub unsafe extern "C" fn ac_ar1(
    y_ptr: *const f64,
    n: usize,
    horizon: usize,
    alpha: f64,
    fc_ptr: *mut f64,
    lo_ptr: *mut f64,
    hi_ptr: *mut f64,
    params_ptr: *mut f64,
) -> i32 {
    let y = std::slice::from_raw_parts(y_ptr, n);
    match ar1_forecast(y, horizon, alpha) {
        None => -1,
        Some(f) => {
            std::slice::from_raw_parts_mut(fc_ptr, horizon).copy_from_slice(&f.forecast);
            std::slice::from_raw_parts_mut(lo_ptr, horizon).copy_from_slice(&f.lo);
            std::slice::from_raw_parts_mut(hi_ptr, horizon).copy_from_slice(&f.hi);
            let p = std::slice::from_raw_parts_mut(params_ptr, 3);
            p[0] = f.a;
            p[1] = f.b;
            p[2] = f.resid_std;
            0
        }
    }
}

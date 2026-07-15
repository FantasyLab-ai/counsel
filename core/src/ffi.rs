//! uniffi surface — the native mobile bindings (Swift for iOS, Kotlin for
//! Android). Compiled only with `--features ffi`; the pure math core stays
//! dependency-free. Same functions the WASM path exposes, typed for uniffi.

use crate::CostModel;

#[derive(uniffi::Record)]
pub struct WelchOutcome {
    pub t: f64,
    pub df: f64,
    pub p: f64,
}

#[derive(uniffi::Record)]
pub struct Ar1Outcome {
    pub a: f64,
    pub b: f64,
    pub resid_std: f64,
    pub forecast: Vec<f64>,
    pub lo: Vec<f64>,
    pub hi: Vec<f64>,
}

/// PELT change points (model: "rbf" | "l2"). Returns break end-indices.
#[uniffi::export]
pub fn changepoints(values: Vec<f64>, model: String, penalty: f64) -> Vec<u32> {
    let m = CostModel::parse(&model).unwrap_or(CostModel::Rbf);
    crate::detect_changepoints(&values, m, penalty)
        .into_iter()
        .map(|i| i as u32)
        .collect()
}

/// Welch's t-test (two-sided p).
#[uniffi::export]
pub fn welch(a: Vec<f64>, b: Vec<f64>) -> WelchOutcome {
    let r = crate::welch_t(&a, &b);
    WelchOutcome { t: r.t, df: r.df, p: r.p }
}

/// AR(1) forecast with analytic 95%-style bands. None if series < 30 points.
#[uniffi::export]
pub fn ar1(y: Vec<f64>, horizon: u32, alpha: f64) -> Option<Ar1Outcome> {
    crate::ar1_forecast(&y, horizon as usize, alpha).map(|f| Ar1Outcome {
        a: f.a,
        b: f.b,
        resid_std: f.resid_std,
        forecast: f.forecast,
        lo: f.lo,
        hi: f.hi,
    })
}

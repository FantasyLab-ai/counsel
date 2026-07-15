//! AR(1) forecast with residual bands — exact port of the Python engine's
//! `_fit_forecast_ar1` (fantasyai/aurora/math/forecasting.py).
//!
//! Bands: Python approximates the residual quantiles with an 800-draw Monte
//! Carlo (`_resid_bands`). We compute the ANALYTIC normal quantiles the MC is
//! estimating — deterministic and exact. The parity suite asserts agreement
//! within the MC's own sampling error.

use crate::stats::norm_ppf;

pub struct Ar1Forecast {
    pub a: f64,
    pub b: f64,
    pub forecast: Vec<f64>,
    pub resid_std: f64,
    pub lo: Vec<f64>,
    pub hi: Vec<f64>,
    pub alpha: f64,
}

fn mean(x: &[f64]) -> f64 {
    x.iter().sum::<f64>() / x.len() as f64
}

/// Mirrors: x = y[:-1]; z = y[1:];
/// a = cov(x, z, ddof=1) / (var(x, ddof=1) + 1e-12); b = mean(z) − a·mean(x);
/// iterate last = a·last + b; resid_std = nanstd(z − (a·x + b), ddof=0).
pub fn ar1_forecast(y: &[f64], horizon: usize, alpha: f64) -> Option<Ar1Forecast> {
    if y.len() < 30 {
        return None; // Python: {"error": "too_few_points"}
    }
    let x = &y[..y.len() - 1];
    let z = &y[1..];
    let (mx, mz) = (mean(x), mean(z));
    let n1 = (x.len() - 1) as f64;
    let cov: f64 = x.iter().zip(z).map(|(xi, zi)| (xi - mx) * (zi - mz)).sum::<f64>() / n1;
    let varx: f64 = x.iter().map(|xi| (xi - mx) * (xi - mx)).sum::<f64>() / n1;
    let a = cov / (varx + 1e-12);
    let b = mz - a * mx;

    let mut last = *y.last().unwrap();
    let mut forecast = Vec::with_capacity(horizon);
    for _ in 0..horizon {
        last = a * last + b;
        forecast.push(last);
    }

    // resid_std = np.nanstd(resid)  (ddof = 0)
    let resid: Vec<f64> = x
        .iter()
        .zip(z)
        .map(|(xi, zi)| zi - (a * xi + b))
        .filter(|v| v.is_finite())
        .collect();
    let rm = mean(&resid);
    let resid_std =
        (resid.iter().map(|r| (r - rm) * (r - rm)).sum::<f64>() / resid.len() as f64).sqrt();

    let zlo = norm_ppf(alpha / 2.0);
    let zhi = norm_ppf(1.0 - alpha / 2.0);
    let lo: Vec<f64> = forecast.iter().map(|f| f + zlo * resid_std).collect();
    let hi: Vec<f64> = forecast.iter().map(|f| f + zhi * resid_std).collect();

    Some(Ar1Forecast { a, b, forecast, resid_std, lo, hi, alpha })
}

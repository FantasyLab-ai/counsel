//! PELT change-point detection — a faithful port of ruptures 1.1.10
//! (`ruptures/detection/pelt.py`, `costs/costrbf.py`, `costs/costl2.py`),
//! the exact code the Python Aurora engine calls. Every constant and
//! ordering quirk is mirrored deliberately: the golden parity suite asserts
//! EXACT index equality with the Python reference.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CostModel {
    Rbf,
    L2,
}

impl CostModel {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "rbf" => Some(CostModel::Rbf),
            "l2" => Some(CostModel::L2),
            _ => None,
        }
    }
}

/// numpy-compatible median (sorted; even n → mean of the middle two).
fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = v.len();
    if n == 0 {
        return f64::NAN;
    }
    if n % 2 == 1 {
        v[n / 2]
    } else {
        0.5 * (v[n / 2 - 1] + v[n / 2])
    }
}

enum Cost {
    /// Full gram matrix (n × n), diagonal = 1.0 (squareform zero → exp(0)).
    Rbf { gram: Vec<f64>, n: usize },
    /// Prefix sums for O(1) SSE: numpy `var(ddof=0) * len` == Σ(x-mean)².
    L2 { values: Vec<f64> },
}

impl Cost {
    fn fit(model: CostModel, x: &[f64]) -> Cost {
        match model {
            CostModel::L2 => Cost::L2 { values: x.to_vec() },
            CostModel::Rbf => {
                let n = x.len();
                // pdist 'sqeuclidean' over the 1-D signal, in scipy's pair order.
                let mut d: Vec<f64> = Vec::with_capacity(n * (n - 1) / 2);
                for i in 0..n {
                    for j in (i + 1)..n {
                        let diff = x[i] - x[j];
                        d.push(diff * diff);
                    }
                }
                // gamma = 1/median(K) if median != 0 else 1  (ruptures CostRbf)
                let med = median(d.clone());
                let gamma = if med != 0.0 && med.is_finite() { 1.0 / med } else { 1.0 };
                // K *= gamma; np.clip(K, 1e-2, 1e2); gram = exp(squareform(-K))
                // squareform puts 0 on the diagonal → exp(0) = 1 (unclipped!).
                let mut gram = vec![1.0f64; n * n];
                let mut k = 0usize;
                for i in 0..n {
                    for j in (i + 1)..n {
                        let clipped = (d[k] * gamma).clamp(1e-2, 1e2);
                        let val = (-clipped).exp();
                        gram[i * n + j] = val;
                        gram[j * n + i] = val;
                        k += 1;
                    }
                }
                Cost::Rbf { gram, n }
            }
        }
    }

    /// Segment cost on [start, end) — mirrors BaseCost.error.
    fn error(&self, start: usize, end: usize) -> f64 {
        let len = (end - start) as f64;
        match self {
            Cost::Rbf { gram, n } => {
                // val = diag_sum − sub.sum()/(end−start); diag of sub = 1s.
                let mut total = 0.0f64;
                for i in start..end {
                    let row = i * n;
                    for j in start..end {
                        total += gram[row + j];
                    }
                }
                (end - start) as f64 - total / len
            }
            Cost::L2 { values } => {
                // numpy: signal[start:end].var(ddof=0) * (end-start)
                let seg = &values[start..end];
                let mean = seg.iter().sum::<f64>() / len;
                seg.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>()
            }
        }
    }
}

#[derive(Clone)]
struct Partition {
    /// Running total == Python's sum(d.values()) — additions happen in the
    /// same order as dict insertion order, so fp results are identical.
    total: f64,
    segs: Vec<(usize, usize)>,
}

/// `Pelt(model=model).fit(x).predict(pen)` with ruptures defaults
/// (min_size = 2, jump = 5), then the Aurora wrapper's post-processing:
/// sorted unique end-indices strictly below n.
pub fn detect_changepoints(values: &[f64], model: CostModel, penalty: f64) -> Vec<usize> {
    let n = values.len();
    let (min_size, jump) = (2usize, 5usize);
    if n < 2 * min_size {
        return Vec::new();
    }
    let cost = Cost::fit(model, values);

    use std::collections::HashMap;
    let mut partitions: HashMap<usize, Partition> = HashMap::new();
    partitions.insert(0, Partition { total: 0.0, segs: vec![(0, 0)] });

    let mut admissible: Vec<usize> = Vec::new();
    // ind = [k for k in range(0, n, jump) if k >= min_size] + [n]
    let mut ind: Vec<usize> = (0..n).step_by(jump).filter(|k| *k >= min_size).collect();
    ind.push(n);

    for &bkp in &ind {
        let new_adm_pt = ((bkp - min_size) / jump) * jump;
        admissible.push(new_adm_pt);

        // Build subproblems in admissible order (skips can't happen with the
        // default grid — every admissible point is a computed partition key —
        // but mirror the guard anyway).
        let mut sub_totals: Vec<f64> = Vec::with_capacity(admissible.len());
        let mut subproblems: Vec<Option<Partition>> = Vec::with_capacity(admissible.len());
        for &t in &admissible {
            match partitions.get(&t) {
                None => subproblems.push(None),
                Some(left) => {
                    let mut p = left.clone();
                    let c = cost.error(t, bkp) + penalty;
                    p.segs.push((t, bkp));
                    p.total += c;
                    sub_totals.push(p.total);
                    subproblems.push(Some(p));
                }
            }
        }

        // partitions[bkp] = min(subproblems) — Python min keeps the FIRST
        // occurrence of the minimum; mirror with strict less-than.
        let mut best_idx: Option<usize> = None;
        let mut best_total = f64::INFINITY;
        for (i, sp) in subproblems.iter().enumerate() {
            if let Some(p) = sp {
                if p.total < best_total {
                    best_total = p.total;
                    best_idx = Some(i);
                }
            }
        }
        let best = match best_idx {
            Some(i) => subproblems[i].clone().unwrap(),
            None => continue,
        };
        let keep_threshold = best.total + penalty;
        partitions.insert(bkp, best);

        // Trim admissible: keep t whose subproblem total <= best + pen.
        let mut next_adm = Vec::with_capacity(admissible.len());
        for (i, sp) in subproblems.iter().enumerate() {
            if let Some(p) = sp {
                if p.total <= keep_threshold {
                    next_adm.push(admissible[i]);
                }
            }
            // Python zip(admissible, subproblems) drops unmatched tails when
            // KeyErrors occurred; with the default grid that never happens.
        }
        admissible = next_adm;
    }

    let best = match partitions.get(&n) {
        Some(p) => p,
        None => return Vec::new(),
    };
    // del best_partition[(0, 0)]; bkps = sorted end indices; wrapper keeps < n.
    let mut idx: Vec<usize> = best
        .segs
        .iter()
        .filter(|(s, e)| !(*s == 0 && *e == 0))
        .map(|(_, e)| *e)
        .filter(|e| *e < n)
        .collect();
    idx.sort_unstable();
    idx.dedup();
    idx
}

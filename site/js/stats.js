/**
 * Математические и статистические функции проекта.
 * Формулы строго соответствуют разделу 2.3 договора (CONTRACT.md) и analysis/stats_reference.py.
 */
const Stats = (() => {
  // Среднее арифметическое: x̄ = Σxᵢ / n
  function mean(x) {
    if (!x || x.length === 0) return NaN;
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i];
    }
    return sum / x.length;
  }

  // Несмещённая выборочная дисперсия: s² = Σ(xᵢ − x̄)² / (n − 1)
  function variance(x) {
    const n = x ? x.length : 0;
    if (n < 2) return NaN;
    const m = mean(x);
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const d = x[i] - m;
      ss += d * d;
    }
    return ss / (n - 1);
  }

  // Смещённая выборочная дисперсия: Σ(xᵢ − x̄)² / n (для демо несмещённости)
  function varBiased(x) {
    const n = x ? x.length : 0;
    if (n === 0) return NaN;
    const m = mean(x);
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const d = x[i] - m;
      ss += d * d;
    }
    return ss / n;
  }

  // Стандартное отклонение: s = √s²
  function std(x) {
    const v = variance(x);
    return Number.isNaN(v) ? NaN : Math.sqrt(v);
  }

  // Коэффициент корреляции Пирсона: r = Σ(xᵢ−x̄)(yᵢ−ȳ) / √(Σ(xᵢ−x̄)² · Σ(yᵢ−ȳ)²)
  function pearson(x, y) {
    if (!x || !y || x.length !== y.length || x.length < 2) return NaN;
    const mx = mean(x);
    const my = mean(y);
    let num = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < x.length; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      num += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    const denom = Math.sqrt(sxx * syy);
    return denom === 0 ? NaN : num / denom;
  }

  // Ковариация двух выборок с делителем (n - 1)
  function covariance(x, y) {
    if (!x || !y || x.length !== y.length || x.length < 2) return NaN;
    const mx = mean(x);
    const my = mean(y);
    let num = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - mx) * (y[i] - my);
    }
    return num / (x.length - 1);
  }

  // Ковариационная матрица по заданным признакам (делитель n - 1)
  function covMatrix(rows, features = ["price_per_m2", "area", "rooms", "floor"]) {
    const cols = features.map((f) => rows.map((r) => Number(r[f])));
    const k = features.length;
    const matrix = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        const val = i === j ? variance(cols[i]) : covariance(cols[i], cols[j]);
        matrix[i][j] = val;
        matrix[j][i] = val;
      }
    }
    return { features, matrix };
  }

  // Корреляционная матрица Пирсона по заданным признакам
  function corrMatrix(rows, features = ["price_per_m2", "area", "rooms", "floor"]) {
    const cols = features.map((f) => rows.map((r) => Number(r[f])));
    const k = features.length;
    const matrix = Array.from({ length: k }, () => Array(k).fill(1));
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const val = pearson(cols[i], cols[j]);
        matrix[i][j] = val;
        matrix[j][i] = val;
      }
    }
    return { features, matrix };
  }

  // Z-оценка: z = (v − x̄) / s
  function zScore(v, x) {
    const m = mean(x);
    const s = std(x);
    if (Number.isNaN(m) || Number.isNaN(s) || s === 0) return NaN;
    return (v - m) / s;
  }

  // Эмпирический процентиль значения v в выборке x (в %)
  function percentile(v, x) {
    if (!x || x.length === 0) return NaN;
    let countLessOrEqual = 0;
    for (let i = 0; i < x.length; i++) {
      if (x[i] <= v) countLessOrEqual++;
    }
    return (countLessOrEqual / x.length) * 100;
  }

  // Встроенный точный расчёт бета-функции и квантиля Стьюдента (резерв, если jStat не загрузился)
  function logGamma(z) {
    const c = [
      76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
    ];
    let x = z;
    let y = z;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < c.length; j++) {
      ser += c[j] / ++y;
    }
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }

  function betacf(a, b, x) {
    const MAXIT = 200;
    const EPS = 3e-14;
    const FPMIN = 1e-300;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function regIncompleteBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      return (bt * betacf(a, b, x)) / a;
    }
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }

  function studentTCdf(t, df) {
    const x = df / (df + t * t);
    const ib = regIncompleteBeta(0.5 * df, 0.5, x);
    return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
  }

  // Квантиль распределения Стьюдента порядка p при df степенях свободы
  function studentTQuantile(p, df) {
    if (typeof window !== "undefined" && window.jStat && window.jStat.studentt) {
      return window.jStat.studentt.inv(p, df);
    }
    let low = -100;
    let high = 100;
    for (let i = 0; i < 100; i++) {
      const mid = 0.5 * (low + high);
      if (studentTCdf(mid, df) < p) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return 0.5 * (low + high);
  }

  // Доверительный интервал для среднего: x̄ ± t · s / √n
  function ciMean(x, level = 0.95) {
    const n = x ? x.length : 0;
    if (n < 2) return null;
    const m = mean(x);
    const s = std(x);
    const df = n - 1;
    const alpha = 1 - level;
    const tCrit = studentTQuantile(1 - alpha / 2, df);
    const margin = tCrit * (s / Math.sqrt(n));
    return {
      level,
      mean: m,
      lower: m - margin,
      upper: m + margin,
      margin,
      t_crit: tCrit,
      df
    };
  }

  // Доверительный интервал для разности средних (критерий Уэлча)
  function ciDiff(x, y, level = 0.95) {
    const n1 = x ? x.length : 0;
    const n2 = y ? y.length : 0;
    if (n1 < 2 || n2 < 2) return null;
    const m1 = mean(x);
    const m2 = mean(y);
    const v1 = variance(x);
    const v2 = variance(y);
    const diff = m1 - m2;
    const se2 = v1 / n1 + v2 / n2;
    const se = Math.sqrt(se2);
    const df =
      (se2 * se2) /
      ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
    const alpha = 1 - level;
    const tCrit = studentTQuantile(1 - alpha / 2, df);
    const margin = tCrit * se;
    return {
      level,
      mean1: m1,
      mean2: m2,
      diff,
      lower: diff - margin,
      upper: diff + margin,
      margin,
      t_crit: tCrit,
      df
    };
  }

  // Логнормальное распределение — метод моментов (MoM)
  function lognormMoM(x) {
    const m = mean(x);
    const v = variance(x);
    if (Number.isNaN(m) || Number.isNaN(v) || m <= 0) return null;
    const sigma2 = Math.log(1 + v / (m * m));
    const mu = Math.log(m) - sigma2 / 2;
    return {
      mu,
      sigma2,
      sigma: Math.sqrt(sigma2)
    };
  }

  // Логнормальное распределение — метод максимального правдоподобия (MLE, делитель n)
  function lognormMLE(x) {
    const n = x ? x.length : 0;
    if (n === 0) return null;
    const logs = x.map((val) => Math.log(val));
    const mu = mean(logs);
    const sigma2 = varBiased(logs);
    return {
      mu,
      sigma2,
      sigma: Math.sqrt(sigma2)
    };
  }

  // Плотность логнормального распределения f(x; μ, σ)
  function lognormPDF(val, mu, sigma) {
    if (val <= 0 || sigma <= 0) return 0;
    const z = (Math.log(val) - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (val * sigma * Math.sqrt(2 * Math.PI));
  }

  // Плотность нормального распределения f(x; μ, σ)
  function normalPDF(val, mu, sigma) {
    if (sigma <= 0) return 0;
    const z = (val - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
  }

  // Бутстрэп-симуляция выборочных средних (reps раз по n значений с возвращением)
  function sampleMeans(x, n, reps = 1000) {
    const N = x.length;
    const out = new Array(reps);
    for (let r = 0; r < reps; r++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += x[Math.floor(Math.random() * N)];
      }
      out[r] = sum / n;
    }
    return out;
  }

  // Демонстрация несмещённости оценки дисперсии (n - 1 против n)
  function simulateUnbiasedness(x, sampleSize, reps = 1000) {
    const N = x.length;
    const truePopVar = varBiased(x);
    let sumUnbiased = 0;
    let sumBiased = 0;
    const sample = new Array(sampleSize);

    for (let r = 0; r < reps; r++) {
      for (let i = 0; i < sampleSize; i++) {
        sample[i] = x[Math.floor(Math.random() * N)];
      }
      sumUnbiased += variance(sample);
      sumBiased += varBiased(sample);
    }

    return {
      truePopVar,
      avgUnbiased: sumUnbiased / reps,
      avgBiased: sumBiased / reps
    };
  }

  return {
    mean,
    variance,
    varBiased,
    std,
    pearson,
    covariance,
    covMatrix,
    corrMatrix,
    zScore,
    percentile,
    studentTQuantile,
    ciMean,
    ciDiff,
    lognormMoM,
    lognormMLE,
    lognormPDF,
    normalPDF,
    sampleMeans,
    simulateUnbiasedness
  };
})();
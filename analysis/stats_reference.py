import json
import math
import random
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
LISTINGS_FILE = BASE_DIR / "data" / "listings.json"
SAMPLE_FILE = BASE_DIR / "data" / "listings_sample.json"
EXPECTED_FILE = BASE_DIR / "data" / "expected_stats.json"

COV_FEATURES = ["price_per_m2", "area", "rooms", "floor"]


def mean(x: list[float]) -> float:
    if not x:
        raise ValueError("Пустой список для mean")
    return sum(x) / len(x)


def variance(x: list[float]) -> float:
    n = len(x)
    if n < 2:
        raise ValueError("Для variance нужно минимум 2 значения")
    m = mean(x)
    return sum((xi - m) ** 2 for xi in x) / (n - 1)


def std(x: list[float]) -> float:
    return math.sqrt(variance(x))


def var_biased(x: list[float]) -> float:
    n = len(x)
    if n < 1:
        raise ValueError("Пустой список для varBiased")
    m = mean(x)
    return sum((xi - m) ** 2 for xi in x) / n


def pearson(x: list[float], y: list[float]) -> float:
    if len(x) != len(y) or len(x) < 2:
        raise ValueError("Для pearson нужны списки одинаковой длины >= 2")
    mx, my = mean(x), mean(y)
    num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    den_x = sum((xi - mx) ** 2 for xi in x)
    den_y = sum((yi - my) ** 2 for yi in y)
    den = math.sqrt(den_x * den_y)
    return num / den if den != 0 else 0.0


def cov_matrix(columns: dict[str, list[float]]) -> dict:
    keys = list(columns.keys())
    n = len(columns[keys[0]])
    means = {k: mean(columns[k]) for k in keys}
    matrix = []
    for k1 in keys:
        row = []
        for k2 in keys:
            cov = sum(
                (columns[k1][i] - means[k1]) * (columns[k2][i] - means[k2])
                for i in range(n)
            ) / (n - 1)
            row.append(cov)
        matrix.append(row)
    return {"features": keys, "matrix": matrix}


def z_score(v: float, x: list[float]) -> float:
    s = std(x)
    if s == 0:
        raise ValueError("Стандартное отклонение равно 0")
    return (v - mean(x)) / s


def _betacf(a: float, b: float, x: float) -> float:
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < 1e-300:
        d = 1e-300
    d = 1.0 / d
    h = d
    for m in range(1, 250):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = 1e-300 if abs(d) < 1e-300 else d
        c = 1.0 + aa / c
        c = 1e-300 if abs(c) < 1e-300 else c
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = 1e-300 if abs(d) < 1e-300 else d
        c = 1.0 + aa / c
        c = 1e-300 if abs(c) < 1e-300 else c
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 3e-15:
            break
    return h


def _betainc(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1.0 - x)
    front = math.exp(lbeta)
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - front * _betacf(b, a, 1.0 - x) / b


def _t_cdf(t: float, df: float) -> float:
    x = df / (df + t * t)
    ib = _betainc(0.5 * df, 0.5, x)
    return 1.0 - 0.5 * ib if t >= 0 else 0.5 * ib


def student_t_ppf(p: float, df: float) -> float:
    try:
        from scipy.stats import t as scipy_t
        return float(scipy_t.ppf(p, df))
    except ImportError:
        low, high = -1000.0, 1000.0
        for _ in range(110):
            mid = 0.5 * (low + high)
            if _t_cdf(mid, df) < p:
                low = mid
            else:
                high = mid
        return 0.5 * (low + high)


def ci_mean(x: list[float], level: float = 0.95) -> dict:
    n = len(x)
    m = mean(x)
    s = std(x)
    alpha = 1.0 - level
    t_crit = student_t_ppf(1.0 - alpha / 2.0, df=n - 1)
    margin = t_crit * s / math.sqrt(n)
    return {
        "level": level,
        "mean": m,
        "lower": m - margin,
        "upper": m + margin,
        "margin": margin,
        "t_crit": t_crit,
        "df": n - 1,
    }


def ci_diff(x: list[float], y: list[float], level: float = 0.95) -> dict:
    n1, n2 = len(x), len(y)
    m1, m2 = mean(x), mean(y)
    v1, v2 = variance(x), variance(y)
    se2_1 = v1 / n1
    se2_2 = v2 / n2
    se = math.sqrt(se2_1 + se2_2)
    df = ((se2_1 + se2_2) ** 2) / ((se2_1 ** 2) / (n1 - 1) + (se2_2 ** 2) / (n2 - 1))
    alpha = 1.0 - level
    t_crit = student_t_ppf(1.0 - alpha / 2.0, df=df)
    diff = m1 - m2
    margin = t_crit * se
    return {
        "level": level,
        "diff": diff,
        "lower": diff - margin,
        "upper": diff + margin,
        "margin": margin,
        "t_crit": t_crit,
        "df": df,
    }


def lognorm_mom(x: list[float]) -> dict:
    m = mean(x)
    v = variance(x)
    sigma2 = math.log(1.0 + v / (m * m))
    mu = math.log(m) - sigma2 / 2.0
    return {"mu": mu, "sigma2": sigma2, "sigma": math.sqrt(sigma2)}


def lognorm_mle(x: list[float]) -> dict:
    ln_x = [math.log(xi) for xi in x]
    n = len(ln_x)
    mu = mean(ln_x)
    sigma2 = sum((val - mu) ** 2 for val in ln_x) / n
    return {"mu": mu, "sigma2": sigma2, "sigma": math.sqrt(sigma2)}


def sample_means(x: list[float], n: int, reps: int = 1000, seed: int = 42) -> list[float]:
    rng = random.Random(seed)
    return [mean([rng.choice(x) for _ in range(n)]) for _ in range(reps)]


def verify_reference_example() -> None:
    arr = [2, 4, 4, 4, 5, 5, 7, 9]
    assert abs(mean(arr) - 5.0) < 1e-9
    assert abs(variance(arr) - (32.0 / 7.0)) < 1e-9
    assert abs(var_biased(arr) - 4.0) < 1e-9
    print("[OK] Проверочный пример [2,4,4,4,5,5,7,9] пройден: mean=5, variance=4.5714, varBiased=4")


def summarize_subset(items: list[dict]) -> dict:
    ppm2 = [x["price_per_m2"] for x in items]
    area = [x["area"] for x in items]
    floor = [x["floor"] for x in items]
    return {
        "n": len(items),
        "mean_price_per_m2": mean(ppm2),
        "variance_price_per_m2": variance(ppm2),
        "std_price_per_m2": std(ppm2),
        "pearson_price_area": pearson(ppm2, area),
        "pearson_price_floor": pearson(ppm2, floor),
        "ci95_mean_price_per_m2": ci_mean(ppm2, 0.95),
        "lognorm_mom": lognorm_mom(ppm2),
        "lognorm_mle": lognorm_mle(ppm2),
    }


def main() -> None:
    verify_reference_example()

    use_sample = "--sample" in sys.argv
    source_path = SAMPLE_FILE if use_sample else LISTINGS_FILE

    if not source_path.exists():
        raise FileNotFoundError(
            f"Файл {source_path} не найден. Сначала запустите clean_and_export.py или передайте флаг --sample"
        )

    with open(source_path, mode="r", encoding="utf-8") as f:
        data = json.load(f)

    listings = data["listings"]
    if len(listings) < 2:
        raise ValueError("Недостаточно объявлений для расчёта статистики (нужно >= 2)")

    columns = {feat: [float(item[feat]) for item in listings] for feat in COV_FEATURES}

    by_district = {}
    for d in data["districts"]:
        subset = [item for item in listings if item["district"] == d]
        if len(subset) >= 2:
            by_district[d] = summarize_subset(subset)

    expected = {
        "schema_version": data["schema_version"],
        "source_file": source_path.name,
        "is_sample": data["is_sample"],
        "all": summarize_subset(listings),
        "by_district": by_district,
        "cov_matrix": cov_matrix(columns),
    }

    with open(EXPECTED_FILE, mode="w", encoding="utf-8") as f:
        json.dump(expected, f, ensure_ascii=False, indent=2)

    print(f"[OK] Контрольные числа сохранены в: {EXPECTED_FILE} (источник: {source_path.name})")
    print(f"     Всего квартир: n = {expected['all']['n']}, средняя цена/м² = {expected['all']['mean_price_per_m2']:,.2f} тг")


if __name__ == "__main__":
    main()
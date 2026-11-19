import csv
import json
import math
from pathlib import Path
from collections import Counter

DISTRICTS = [
    "Бостандыкский",
    "Медеуский",
    "Алмалинский",
    "Ауэзовский",
    "Наурызбайский",
]

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_FILES = [
    BASE_DIR / "data" / "raw" / "listings_A.csv",
    BASE_DIR / "data" / "raw" / "listings_B.csv",
]
OUTPUT_FILE = BASE_DIR / "data" / "listings.json"

REQUIRED_COLS = ["district", "price", "area", "rooms", "floor", "url"]


def normalize_url(url: str) -> str:
    return url.strip().split("?")[0].rstrip("/")


def median(values: list[float]) -> float:
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 == 1 else (s[mid - 1] + s[mid]) / 2.0


def main() -> None:
    raw_rows = []
    for path in RAW_FILES:
        if not path.exists():
            print(f"[ПРЕДУПРЕЖДЕНИЕ] Файл не найден: {path}")
            continue
        with open(path, mode="r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                continue
            missing_cols = [c for c in REQUIRED_COLS if c not in reader.fieldnames]
            if missing_cols:
                raise ValueError(f"В файле {path.name} не хватает колонок: {missing_cols}")
            for row_num, row in enumerate(reader, start=2):
                raw_rows.append((path.name, row_num, row))

    print(f"Всего прочитано строк из CSV: {len(raw_rows)}")

    cleaned = []
    seen_urls = set()
    skipped_missing = 0
    skipped_invalid = 0
    skipped_duplicates = 0

    for fname, row_num, row in raw_rows:
        if any(row.get(col) is None or str(row.get(col)).strip() == "" for col in REQUIRED_COLS):
            skipped_missing += 1
            print(f"  [Пропуск пустых] {fname}:{row_num} -> {row}")
            continue

        district = row["district"].strip()
        if district not in DISTRICTS:
            skipped_invalid += 1
            print(f"  [Неизвестный район] {fname}:{row_num} -> '{district}' (допустимые: {DISTRICTS})")
            continue

        url_raw = row["url"].strip()
        url_norm = normalize_url(url_raw)
        if url_norm in seen_urls:
            skipped_duplicates += 1
            print(f"  [Дубликат URL] {fname}:{row_num} -> {url_raw}")
            continue

        try:
            price = int(round(float(row["price"].replace(" ", ""))))
            area = round(float(row["area"].replace(",", ".")), 2)
            rooms = int(float(row["rooms"]))
            floor = int(float(row["floor"]))
        except ValueError as e:
            skipped_invalid += 1
            print(f"  [Ошибка числа] {fname}:{row_num} -> {e}")
            continue

        if price <= 0 or area <= 0 or rooms <= 0 or floor <= 0:
            skipped_invalid += 1
            print(f"  [Некорректное значение] {fname}:{row_num}")
            continue

        seen_urls.add(url_norm)
        ppm2 = price / area
        cleaned.append({
            "district": district,
            "price": price,
            "area": area,
            "rooms": rooms,
            "floor": floor,
            "price_per_m2": round(ppm2, 2),
            "log_price_per_m2": round(math.log(ppm2), 6),
            "url": url_raw,
        })

    for idx, item in enumerate(cleaned, start=1):
        ordered = {"id": idx}
        ordered.update(item)
        cleaned[idx - 1] = ordered

    print("\n--- ИТОГИ ОЧИСТКИ ---")
    print(f"Удалено строк с пропусками: {skipped_missing}")
    print(f"Удалено строк с ошибками:   {skipped_invalid}")
    print(f"Удалено дубликатов по URL:  {skipped_duplicates}")
    print(f"Осталось чистых объявлений: {len(cleaned)} (цель: >= 120, лучше 200+)")

    counts = Counter(item["district"] for item in cleaned)
    print("\nКоличество объявлений по районам (нужно >= 30 в каждом):")
    for d in DISTRICTS:
        c = counts[d]
        status = "OK" if c >= 30 else f"НУЖНО ЕЩЁ {30 - c}"
        print(f"  - {d}: {c} [{status}]")

    if cleaned:
        med_ppm2 = median([x["price_per_m2"] for x in cleaned])
        outliers = [
            x for x in cleaned
            if x["price_per_m2"] > 5 * med_ppm2 or x["price_per_m2"] < 0.2 * med_ppm2
        ]
        if outliers:
            print(f"\n[ВНИМАНИЕ] Найдены потенциальные выбросы (медиана = {med_ppm2:,.0f} тг/м²):")
            for o in outliers:
                print(f"  id={o['id']} | {o['district']} | {o['price_per_m2']:,.0f} тг/м² | {o['url']}")
            print("Проверьте их вручную и зафиксируйте в отчёте, если решите удалить из CSV.")

    output_data = {
        "schema_version": 1,
        "is_sample": False,
        "districts": DISTRICTS,
        "listings": cleaned,
    }

    with open(OUTPUT_FILE, mode="w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\nФайл успешно сохранён: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
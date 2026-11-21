/**
 * Основная логика интерфейса: загрузка данных, валидация договора и обновление блоков.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const errorBanner = document.getElementById("error-banner");
  const mainContent = document.getElementById("main-content");
  const datasetBadge = document.getElementById("dataset-badge");

  function showError(msg) {
    errorBanner.textContent = "Ошибка данных: " + msg;
    errorBanner.classList.remove("hidden");
    mainContent.classList.add("hidden");
  }

  function formatInt(num) {
    return Number.isFinite(num) ? Math.round(num).toLocaleString("ru-RU") : "—";
  }

  function formatFloat(num, digits = 2) {
    return Number.isFinite(num)
      ? num.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : "—";
  }

  // 1. Загрузка и строгая проверка формата listings.json
  let payload;
  try {
    const response = await fetch("../data/listings.json");
    if (!response.ok) {
      throw new Error(`Не удалось загрузить ../data/listings.json (HTTP ${response.status}). Запустите сайт через локальный сервер.`);
    }
    payload = await response.json();
  } catch (err) {
    showError(err.message);
    return;
  }

  if (payload.schema_version !== 1) {
    showError(`Неподдерживаемая версия схемы данных: ${payload.schema_version}. Ожидается schema_version = 1.`);
    return;
  }

  if (!Array.isArray(payload.listings) || payload.listings.length === 0) {
    showError("Поле listings пустое или имеет неверный формат.");
    return;
  }

  const requiredFields = ["id", "district", "price", "area", "rooms", "floor", "price_per_m2", "log_price_per_m2", "url"];
  for (let i = 0; i < payload.listings.length; i++) {
    const item = payload.listings[i];
    for (const field of requiredFields) {
      if (item[field] === undefined || item[field] === null || item[field] === "") {
        showError(`В записи #${i + 1} отсутствует обязательное поле "${field}".`);
        return;
      }
    }
  }

  const allListings = payload.listings;
  const districts = Array.isArray(payload.districts) && payload.districts.length > 0
    ? payload.districts
    : [...new Set(allListings.map((d) => d.district))];

  const hasDistUniv = allListings.every((d) => typeof d.dist_univ_km === "number" && !Number.isNaN(d.dist_univ_km));

  datasetBadge.textContent = payload.is_sample
    ? `Тестовый сэмпл: ${allListings.length} квартир`
    : `Проверено: ${allListings.length} квартир (${districts.length} районов)`;

  // 2. Инициализация элементов управления
  const filterDistrict = document.getElementById("filter-district");
  const filterRooms = document.getElementById("filter-rooms");
  const filterBudget = document.getElementById("filter-budget");
  const filterBudgetVal = document.getElementById("filter-budget-val");
  const filterSecondary = document.getElementById("filter-secondary");
  const filterSecondaryLabel = document.getElementById("filter-secondary-label");
  const filterSecondaryVal = document.getElementById("filter-secondary-val");
  const btnResetFilters = document.getElementById("btn-reset-filters");

  const histDistrict = document.getElementById("hist-district");
  const diffDist1 = document.getElementById("diff-dist-1");
  const diffDist2 = document.getElementById("diff-dist-2");

  districts.forEach((d) => {
    filterDistrict.add(new Option(d, d));
    histDistrict.add(new Option(d, d));
    diffDist1.add(new Option(d, d));
    diffDist2.add(new Option(d, d));
  });

  if (districts.length >= 2) {
    diffDist1.value = districts[0];
    diffDist2.value = districts[districts.length - 1];
  }

  const maxPriceMln = Math.ceil(Math.max(...allListings.map((d) => d.price)) / 1_000_000 / 10) * 10;
  filterBudget.min = 15;
  filterBudget.max = Math.max(maxPriceMln, 50);
  filterBudget.step = 5;
  filterBudget.value = filterBudget.max;

  if (hasDistUniv) {
    const maxKm = Math.ceil(Math.max(...allListings.map((d) => d.dist_univ_km)));
    filterSecondaryLabel.firstChild.textContent = "Макс. расстояние до вуза: ";
    filterSecondary.min = 1;
    filterSecondary.max = Math.max(maxKm, 5);
    filterSecondary.step = 0.5;
    filterSecondary.value = filterSecondary.max;
  } else {
    const maxArea = Math.ceil(Math.max(...allListings.map((d) => d.area)) / 10) * 10;
    filterSecondaryLabel.firstChild.textContent = "Мин. площадь квартиры: ";
    filterSecondary.min = 15;
    filterSecondary.max = Math.max(maxArea, 40);
    filterSecondary.step = 5;
    filterSecondary.value = 15;
  }

  function getFilteredListings() {
    const dist = filterDistrict.value;
    const roomsVal = filterRooms.value;
    const maxBudget = Number(filterBudget.value) * 1_000_000;
    const secVal = Number(filterSecondary.value);

    filterBudgetVal.textContent = `до ${filterBudget.value} млн тг`;
    filterSecondaryVal.textContent = hasDistUniv ? `до ${secVal} км` : `от ${secVal} м²`;

    return allListings.filter((item) => {
      if (dist !== "all" && item.district !== dist) return false;
      if (roomsVal === "4+" && item.rooms < 4) return false;
      if (roomsVal !== "all" && roomsVal !== "4+" && item.rooms !== Number(roomsVal)) return false;
      if (item.price > maxBudget) return false;
      if (hasDistUniv) {
        if (item.dist_univ_km > secVal) return false;
      } else {
        if (item.area < secVal) return false;
      }
      return true;
    });
  }

  // Элементы блоков
  const ciLevelInput = document.getElementById("ci-level");
  const ciLevelVal = document.getElementById("ci-level-val");
  const zPriceInput = document.getElementById("z-price-input");
  const cltNInput = document.getElementById("clt-n");
  const cltNVal = document.getElementById("clt-n-val");
  const diffLevelSelect = document.getElementById("diff-level");
  const unbiasedNInput = document.getElementById("unbiased-n");
  const unbiasedNVal = document.getElementById("unbiased-n-val");

  let currentFiltered = allListings;

  // Блок 1: Сводка и таблица
  function updateSummaryAndTable() {
    const n = currentFiltered.length;
    const ppm = currentFiltered.map((d) => d.price_per_m2);
    const totals = currentFiltered.map((d) => d.price);

    document.getElementById("kpi-count").textContent = `${n} кв.`;
    document.getElementById("kpi-mean-sqm").textContent = n > 0 ? `${formatInt(Stats.mean(ppm))} тг` : "—";
    document.getElementById("kpi-std-sqm").textContent = n >= 2 ? `${formatInt(Stats.std(ppm))} тг` : "—";
    document.getElementById("kpi-var-sqm").textContent = n >= 2 ? Stats.variance(ppm).toExponential(3) : "—";
    document.getElementById("kpi-mean-total").textContent = n > 0 ? `${formatFloat(Stats.mean(totals) / 1_000_000, 1)} млн тг` : "—";

    const tbody = document.getElementById("listings-tbody");
    tbody.innerHTML = "";
    const preview = currentFiltered.slice(0, 12);
    document.getElementById("table-shown-info").textContent =
      n > 12 ? `Показаны первые 12 из ${n} подходящих квартир` : `Показаны все ${n} подходящих квартир`;

    preview.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.district}</td>
        <td class="num">${formatFloat(row.price / 1_000_000, 2)} млн</td>
        <td class="num">${formatFloat(row.area, 1)}</td>
        <td class="num">${row.rooms}</td>
        <td class="num">${row.floor}</td>
        <td class="num"><strong>${formatInt(row.price_per_m2)}</strong></td>
        <td><a href="${row.url}" target="_blank" rel="noopener">Открыть ↗</a></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Блок 2: Доверительный интервал
  function updateCIBlock() {
    const levelPct = Number(ciLevelInput.value);
    const level = levelPct / 100;
    ciLevelVal.textContent = `${levelPct}%`;

    const resultBox = document.getElementById("ci-result-box");
    const ppm = currentFiltered.map((d) => d.price_per_m2);

    if (ppm.length < 2) {
      resultBox.innerHTML = "Недостаточно квартир в выборке для расчёта доверительного интервала (нужно минимум 2).";
      return;
    }

    const ci = Stats.ciMean(ppm, level);
    resultBox.innerHTML = `
      <strong>${levelPct}% доверительный интервал для текущей выборки (n = ${ppm.length}):</strong>
      от <strong>${formatInt(ci.lower)}</strong> до <strong>${formatInt(ci.upper)} тг/м²</strong>
      (среднее = ${formatInt(ci.mean)} ± ${formatInt(ci.margin)} тг/м², t<sub>крит</sub> = ${ci.t_crit.toFixed(3)}, df = ${ci.df}).
    `;

    const districtItems = districts
      .map((d) => {
        const vals = allListings.filter((item) => item.district === d).map((item) => item.price_per_m2);
        return vals.length >= 2 ? { label: d, ci: Stats.ciMean(vals, level) } : null;
      })
      .filter(Boolean);

    Charts.renderCIChart("chart-ci", districtItems, { label: "Текущий фильтр", ci });
  }

  // Блок 3: Z-оценка и процентиль («Дорогая или выгодная?»)
  function updateZScoreBlock() {
    const ppm = currentFiltered.map((d) => d.price_per_m2);
    const resultBox = document.getElementById("z-result-box");
    const userVal = Number(zPriceInput.value);

    if (ppm.length < 2 || !Number.isFinite(userVal) || userVal <= 0) {
      resultBox.className = "result-strip";
      resultBox.textContent = "Введите корректную цену за м² (нужно минимум 2 квартиры в выборке).";
      return;
    }

    const z = Stats.zScore(userVal, ppm);
    const pct = Stats.percentile(userVal, ppm);
    const m = Stats.mean(ppm);

    let verdictText = "";
    let verdictClass = "result-strip verdict-mid";
    if (z <= -0.5) {
      verdictText = "Выгодное предложение (ниже среднего по выборке)";
      verdictClass = "result-strip verdict-good";
    } else if (z >= 0.5) {
      verdictText = "Дороже среднего рынка по выбранным параметрам";
      verdictClass = "result-strip verdict-high";
    } else {
      verdictText = "Типичная рыночная цена (в пределах ±0.5σ от среднего)";
    }

    resultBox.className = verdictClass;
    resultBox.innerHTML = `
      <strong>Вердикт: ${verdictText}.</strong><br>
      Z-оценка: <strong>${z >= 0 ? "+" : ""}${z.toFixed(2)}σ</strong> ·
      Процентиль: <strong>${pct.toFixed(1)}%</strong> (ваша цена выше или равна ${pct.toFixed(1)}% квартир в выборке).
    `;

    Charts.renderZScoreChart("chart-zscore", ppm, userVal, m);
  }

  // Блок 4: Корреляции и ковариационная матрица
  function updateMatrixBlock() {
    const baseFeatures = ["price_per_m2", "area", "rooms", "floor"];
    if (allListings.every((d) => typeof d.year === "number")) baseFeatures.push("year");
    if (hasDistUniv) baseFeatures.push("dist_univ_km");

    const rowsForMatrix = currentFiltered.length >= 2 ? currentFiltered : allListings;
    const corr = Stats.corrMatrix(rowsForMatrix, baseFeatures);
    const cov = Stats.covMatrix(rowsForMatrix, baseFeatures);

    Charts.renderCorrHeatmap("chart-corr", corr);

    const container = document.getElementById("cov-table-container");
    let html = "<table><thead><tr><th>Признак</th>";
    cov.features.forEach((f) => {
      html += `<th class="num">${Charts.FEATURE_LABELS[f] || f}</th>`;
    });
    html += "</tr></thead><tbody>";

    cov.matrix.forEach((row, i) => {
      html += `<tr><td><strong>${Charts.FEATURE_LABELS[cov.features[i]] || cov.features[i]}</strong></td>`;
      row.forEach((val) => {
        const formatted = Math.abs(val) >= 10000 ? val.toExponential(2) : val.toFixed(2);
        html += `<td class="num">${formatted}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  // Блок 5: Логнормальное распределение (MoM vs MLE)
  function updateLognormBlock() {
    const selectedDist = histDistrict.value;
    const subset = selectedDist === "all"
      ? allListings
      : allListings.filter((d) => d.district === selectedDist);

    const ppm = subset.map((d) => d.price_per_m2);
    const mom = Stats.lognormMoM(ppm);
    const mle = Stats.lognormMLE(ppm);

    document.getElementById("lognorm-stats-box").innerHTML = `
      <strong>Метод моментов (MoM):</strong> μ = ${mom.mu.toFixed(4)}, σ² = ${mom.sigma2.toFixed(4)} (σ = ${mom.sigma.toFixed(4)}) &nbsp;|&nbsp;
      <strong>ММП (MLE):</strong> μ = ${mle.mu.toFixed(4)}, σ² = ${mle.sigma2.toFixed(4)} (σ = ${mle.sigma.toFixed(4)})
    `;

    const title = selectedDist === "all"
      ? `Распределение цены за м² по всей базе (n = ${ppm.length})`
      : `Распределение цены за м² — ${selectedDist} (n = ${ppm.length})`;

    Charts.renderLognormHistogram("chart-hist", ppm, mom, mle, title);
  }

  // Блок 6: Симулятор ЗБЧ и ЦПТ
  function updateCLTBlock() {
    const sampleN = Number(cltNInput.value);
    cltNVal.textContent = sampleN;
    const ppm = allListings.map((d) => d.price_per_m2);
    const trueMean = Stats.mean(ppm);
    const trueStd = Stats.std(ppm);
    const meansArr = Stats.sampleMeans(ppm, sampleN, 1000);

    const empMean = Stats.mean(meansArr);
    const empStd = Stats.std(meansArr);
    const teoSe = trueStd / Math.sqrt(sampleN);

    document.getElementById("clt-stats-box").innerHTML = `
      <strong>Истинное среднее базы:</strong> ${formatInt(trueMean)} тг/м² &nbsp;|&nbsp;
      <strong>Среднее по 1000 выборкам:</strong> ${formatInt(empMean)} тг/м²<br>
      <strong>Теоретическая ошибка s/√n:</strong> ${formatInt(teoSe)} тг/м² &nbsp;|&nbsp;
      <strong>Эмпирическое ст. откл. средних:</strong> ${formatInt(empStd)} тг/м²
    `;

    Charts.renderCLTChart("chart-clt", meansArr, trueMean, trueStd, sampleN);
  }

  // Блок 7: Сравнение двух районов (ДИ разности средних по Уэлчу)
  function updateDiffBlock() {
    const d1 = diffDist1.value;
    const d2 = diffDist2.value;
    const level = Number(diffLevelSelect.value) / 100;
    const box = document.getElementById("diff-result-box");

    if (d1 === d2) {
      box.textContent = "Выберите два разных района для сравнения средних цен.";
      return;
    }

    const x1 = allListings.filter((d) => d.district === d1).map((d) => d.price_per_m2);
    const x2 = allListings.filter((d) => d.district === d2).map((d) => d.price_per_m2);
    const res = Stats.ciDiff(x1, x2, level);

    const significant = res.lower > 0 || res.upper < 0;
    const conclusion = significant
      ? `Ноль НЕ входит в ${Math.round(level * 100)}% доверительный интервал — разница между районами статистически значима.`
      : `Ноль входит в ${Math.round(level * 100)}% доверительный интервал — при таком уровне доверия разница может объясняться случайным разбросом выборки.`;

    box.innerHTML = `
      <strong>${d1}</strong> (${formatInt(res.mean1)} тг/м²) − <strong>${d2}</strong> (${formatInt(res.mean2)} тг/м²) =
      <strong>${res.diff >= 0 ? "+" : ""}${formatInt(res.diff)} тг/м²</strong><br>
      ${Math.round(level * 100)}% ДИ разности: от <strong>${formatInt(res.lower)}</strong> до <strong>${formatInt(res.upper)} тг/м²</strong> (df Уэлча = ${res.df.toFixed(1)}).<br>
      <em>Вывод:</em> ${conclusion}
    `;

    Charts.renderDiffChart("chart-diff", d1, d2, res);
  }

  // Блок 8: Демо несмещённости оценки дисперсии
  function updateUnbiasedBlock() {
    const sampleN = Number(unbiasedNInput.value);
    unbiasedNVal.textContent = sampleN;
    const ppm = allListings.map((d) => d.price_per_m2);
    const sim = Stats.simulateUnbiasedness(ppm, sampleN, 1000);

    const errUnbiasedPct = Math.abs((sim.avgUnbiased - sim.truePopVar) / sim.truePopVar) * 100;
    const errBiasedPct = Math.abs((sim.avgBiased - sim.truePopVar) / sim.truePopVar) * 100;

    document.getElementById("unbiased-result-box").innerHTML = `
      <strong>Истинная дисперсия совокупности σ²:</strong> ${sim.truePopVar.toExponential(4)}<br>
      <strong>Средняя оценка с делителем (n − 1):</strong> ${sim.avgUnbiased.toExponential(4)} (отклонение ${errUnbiasedPct.toFixed(1)}% — попадает в цель)<br>
      <strong>Средняя оценка с делителем n:</strong> ${sim.avgBiased.toExponential(4)} (занижена на ${errBiasedPct.toFixed(1)}%, теория: 1/n = ${(100 / sampleN).toFixed(1)}%)
    `;

    Charts.renderUnbiasedChart("chart-unbiased", sim, sampleN);
  }

  function refreshFilteredBlocks() {
    currentFiltered = getFilteredListings();
    if (!zPriceInput.dataset.touched && currentFiltered.length > 0) {
      zPriceInput.value = Math.round(Stats.mean(currentFiltered.map((d) => d.price_per_m2)));
    }
    updateSummaryAndTable();
    updateCIBlock();
    updateZScoreBlock();
    updateMatrixBlock();
  }

  // События
  [filterDistrict, filterRooms, filterBudget, filterSecondary].forEach((el) => {
    el.addEventListener("input", refreshFilteredBlocks);
  });

  btnResetFilters.addEventListener("click", () => {
    filterDistrict.value = "all";
    filterRooms.value = "all";
    filterBudget.value = filterBudget.max;
    filterSecondary.value = hasDistUniv ? filterSecondary.max : filterSecondary.min;
    delete zPriceInput.dataset.touched;
    refreshFilteredBlocks();
  });

  ciLevelInput.addEventListener("input", updateCIBlock);
  zPriceInput.addEventListener("input", () => {
    zPriceInput.dataset.touched = "1";
    updateZScoreBlock();
  });
  histDistrict.addEventListener("change", updateLognormBlock);
  cltNInput.addEventListener("input", updateCLTBlock);
  document.getElementById("btn-clt-rerun").addEventListener("click", updateCLTBlock);
  diffDist1.addEventListener("change", updateDiffBlock);
  diffDist2.addEventListener("change", updateDiffBlock);
  diffLevelSelect.addEventListener("change", updateDiffBlock);
  unbiasedNInput.addEventListener("input", updateUnbiasedBlock);
  document.getElementById("btn-unbiased-rerun").addEventListener("click", updateUnbiasedBlock);

  // Первичный запуск всех блоков
  refreshFilteredBlocks();
  updateLognormBlock();
  updateCLTBlock();
  updateDiffBlock();
  updateUnbiasedBlock();
});
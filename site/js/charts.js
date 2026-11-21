/**
 * Модуль построения графиков Plotly.js.
 */
const Charts = (() => {
  const FEATURE_LABELS = {
    price_per_m2: "Цена/м²",
    area: "Площадь (м²)",
    rooms: "Комнаты",
    floor: "Этаж",
    year: "Год постройки",
    dist_univ_km: "До вуза (км)"
  };

  const baseLayout = {
    margin: { t: 36, r: 24, b: 48, l: 64 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "#f8fafc",
    font: { family: "Segoe UI, Inter, Arial, sans-serif", color: "#1e293b", size: 12 }
  };

  const plotConfig = { responsive: true, displayModeBar: false };

  // График 1: Доверительные интервалы по районам и текущей выборке
  function renderCIChart(divId, districtItems, currentItem) {
    const allItems = [currentItem, ...districtItems];
    const labels = allItems.map((d) => d.label);
    const means = allItems.map((d) => d.ci.mean);
    const errors = allItems.map((d) => d.ci.margin);
    const colors = allItems.map((_, idx) => (idx === 0 ? "#2563eb" : "#0ea5e9"));

    const trace = {
      type: "scatter",
      mode: "markers",
      x: labels,
      y: means,
      marker: { size: 11, color: colors },
      error_y: {
        type: "data",
        array: errors,
        visible: true,
        color: "#1e3a8a",
        thickness: 2,
        width: 8
      },
      hovertemplate: "<b>%{x}</b><br>Среднее: %{y:,.0f} тг/м²<extra></extra>"
    };

    Plotly.newPlot(
      divId,
      [trace],
      {
        ...baseLayout,
        title: "Средняя цена/м² и доверительный интервал",
        yaxis: { title: "Цена за м² (тг)", tickformat: ",.0f", gridcolor: "#e2e8f0" },
        xaxis: { gridcolor: "#e2e8f0" }
      },
      plotConfig
    );
  }

  // График 2: Положение введённой цены на распределении выборки (Z-оценка)
  function renderZScoreChart(divId, values, userVal, meanVal) {
    const traceHist = {
      type: "histogram",
      x: values,
      nbinsx: 18,
      name: "Квартиры выборки",
      marker: { color: "rgba(37, 99, 235, 0.45)", line: { color: "#2563eb", width: 1 } }
    };

    Plotly.newPlot(
      divId,
      [traceHist],
      {
        ...baseLayout,
        title: "Ваша цена на фоне выбранных квартир",
        xaxis: { title: "Цена за м² (тг)", tickformat: ",.0f" },
        yaxis: { title: "Количество квартир", gridcolor: "#e2e8f0" },
        shapes: [
          {
            type: "line",
            x0: meanVal,
            x1: meanVal,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#64748b", width: 2, dash: "dash" }
          },
          {
            type: "line",
            x0: userVal,
            x1: userVal,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#dc2626", width: 3 }
          }
        ],
        annotations: [
          {
            x: meanVal,
            y: 0.96,
            yref: "paper",
            text: "Среднее",
            showarrow: false,
            font: { color: "#475569", size: 11 }
          },
          {
            x: userVal,
            y: 0.86,
            yref: "paper",
            text: "Ваша цена",
            showarrow: true,
            arrowhead: 2,
            ax: 28,
            ay: -18,
            font: { color: "#dc2626", size: 12 }
          }
        ]
      },
      plotConfig
    );
  }

  // График 3: Тепловая карта корреляций Пирсона
  function renderCorrHeatmap(divId, corrData) {
    const labels = corrData.features.map((f) => FEATURE_LABELS[f] || f);
    const z = corrData.matrix;
    const text = z.map((row) => row.map((v) => v.toFixed(2)));

    const trace = {
      type: "heatmap",
      x: labels,
      y: labels,
      z,
      zmin: -1,
      zmax: 1,
      colorscale: "RdBu",
      reversescale: true,
      text,
      texttemplate: "%{text}",
      hovertemplate: "%{y} × %{x}<br>r = %{z:.4f}<extra></extra>"
    };

    Plotly.newPlot(
      divId,
      [trace],
      {
        ...baseLayout,
        margin: { t: 36, r: 20, b: 56, l: 115 },
        title: "Матрица корреляций Пирсона (r)"
      },
      plotConfig
    );
  }

  // График 4: Гистограмма цен за м² с двумя логнормальными кривыми (MoM и MLE)
  function renderLognormHistogram(divId, values, mom, mle, titleText) {
    const minVal = Math.min(...values) * 0.85;
    const maxVal = Math.max(...values) * 1.1;
    const steps = 140;
    const stepSize = (maxVal - minVal) / steps;

    const xs = [];
    const yMom = [];
    const yMle = [];

    for (let i = 0; i <= steps; i++) {
      const x = minVal + i * stepSize;
      xs.push(x);
      yMom.push(Stats.lognormPDF(x, mom.mu, mom.sigma));
      yMle.push(Stats.lognormPDF(x, mle.mu, mle.sigma));
    }

    const histTrace = {
      type: "histogram",
      x: values,
      histnorm: "probability density",
      nbinsx: 16,
      name: "Эмпирическая гистограмма",
      marker: { color: "rgba(148, 163, 184, 0.45)", line: { color: "#64748b", width: 1 } }
    };

    const momTrace = {
      type: "scatter",
      mode: "lines",
      x: xs,
      y: yMom,
      name: "Логнормаль (Метод моментов)",
      line: { color: "#2563eb", width: 3 }
    };

    const mleTrace = {
      type: "scatter",
      mode: "lines",
      x: xs,
      y: yMle,
      name: "Логнормаль (ММП / MLE)",
      line: { color: "#dc2626", width: 3, dash: "dash" }
    };

    Plotly.newPlot(
      divId,
      [histTrace, momTrace, mleTrace],
      {
        ...baseLayout,
        title: titleText,
        xaxis: { title: "Цена за м² (тг)", tickformat: ",.0f" },
        yaxis: { title: "Плотность вероятности", gridcolor: "#e2e8f0" },
        legend: { orientation: "h", y: -0.22 }
      },
      plotConfig
    );
  }

  // График 5: Симулятор ЗБЧ и ЦПТ
  function renderCLTChart(divId, meansArr, trueMean, trueStd, sampleN) {
    const se = trueStd / Math.sqrt(sampleN);
    const minX = Math.min(...meansArr, trueMean - 3.5 * se);
    const maxX = Math.max(...meansArr, trueMean + 3.5 * se);
    const steps = 120;
    const dx = (maxX - minX) / steps;

    const xs = [];
    const ys = [];
    for (let i = 0; i <= steps; i++) {
      const x = minX + i * dx;
      xs.push(x);
      ys.push(Stats.normalPDF(x, trueMean, se));
    }

    const histTrace = {
      type: "histogram",
      x: meansArr,
      histnorm: "probability density",
      nbinsx: 28,
      name: "Выборочные средние (1000 повторов)",
      marker: { color: "rgba(14, 165, 233, 0.5)", line: { color: "#0284c7", width: 1 } }
    };

    const normTrace = {
      type: "scatter",
      mode: "lines",
      x: xs,
      y: ys,
      name: `Теор. нормальное N(μ, s²/${sampleN})`,
      line: { color: "#1e3a8a", width: 3 }
    };

    Plotly.newPlot(
      divId,
      [histTrace, normTrace],
      {
        ...baseLayout,
        title: `Распределение выборочных средних при n = ${sampleN}`,
        xaxis: { title: "Выборочное среднее цены/м² (тг)", tickformat: ",.0f" },
        yaxis: { title: "Плотность", gridcolor: "#e2e8f0" },
        legend: { orientation: "h", y: -0.22 },
        shapes: [
          {
            type: "line",
            x0: trueMean,
            x1: trueMean,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#dc2626", width: 2.5, dash: "dot" }
          }
        ]
      },
      plotConfig
    );
  }

  // График 6: Сравнение двух районов (ДИ разности средних)
  function renderDiffChart(divId, d1Name, d2Name, diffResult) {
    const trace = {
      type: "scatter",
      mode: "markers",
      x: [`${d1Name} − ${d2Name}`],
      y: [diffResult.diff],
      marker: { size: 13, color: "#2563eb" },
      error_y: {
        type: "data",
        array: [diffResult.margin],
        visible: true,
        color: "#1e3a8a",
        thickness: 2.5,
        width: 12
      },
      hovertemplate: "Разность: %{y:,.0f} тг/м²<extra></extra>"
    };

    Plotly.newPlot(
      divId,
      [trace],
      {
        ...baseLayout,
        title: `Доверительный интервал разности средних (${Math.round(diffResult.level * 100)}%)`,
        yaxis: { title: "Разность средней цены/м² (тг)", tickformat: ",.0f", gridcolor: "#e2e8f0" },
        shapes: [
          {
            type: "line",
            x0: -0.5,
            x1: 0.5,
            y0: 0,
            y1: 0,
            line: { color: "#dc2626", width: 2, dash: "dash" }
          }
        ],
        annotations: [
          {
            x: 0.35,
            y: 0,
            text: "Нулевая разница (0)",
            showarrow: false,
            yshift: 12,
            font: { color: "#dc2626", size: 11 }
          }
        ]
      },
      plotConfig
    );
  }

  // График 7: Демо несмещённости дисперсии (n - 1 против n)
  function renderUnbiasedChart(divId, simResult, sampleN) {
    const trace = {
      type: "bar",
      x: [
        "Истинная дисперсия σ²",
        `Несмещённая s² (делитель n−1 = ${sampleN - 1})`,
        `Смещённая (делитель n = ${sampleN})`
      ],
      y: [simResult.truePopVar, simResult.avgUnbiased, simResult.avgBiased],
      marker: {
        color: ["#0f172a", "#16a34a", "#d97706"]
      },
      hovertemplate: "%{x}<br>%{y:,.0f}<extra></extra>"
    };

    Plotly.newPlot(
      divId,
      [trace],
      {
        ...baseLayout,
        title: `Среднее по 1000 малым выборкам размера n = ${sampleN}`,
        yaxis: { title: "Дисперсия (тг/м²)²", gridcolor: "#e2e8f0" }
      },
      plotConfig
    );
  }

  return {
    FEATURE_LABELS,
    renderCIChart,
    renderZScoreChart,
    renderCorrHeatmap,
    renderLognormHistogram,
    renderCLTChart,
    renderDiffChart,
    renderUnbiasedChart
  };
})();
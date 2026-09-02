const browserWindow = typeof window === "undefined" ? {} : window;
const config = browserWindow.SPENDOPS_CONFIG || {};
const comparisonData = browserWindow.SPENDOPS_COMPARISON_DATA || null;
const spendOpsAuth = browserWindow.SpendOpsAuth || null;
const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
const categoryColors = ["#dfff78", "#79dfb8", "#b9afff", "#ffb56f", "#7fb3ff", "#f58ab2"];
const cloudCategories = new Set(["食費", "日用品", "交通費", "娯楽", "光熱費", "通信費", "医療費", "衣服費", "住居費", "ネットでの購入", "その他"]);
const selectableCategories = [...cloudCategories];
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("ja-JP");

let localAnalysis = null;
let localAnalysisOwnerId = null;
let comparisonMode = "group";
let analysisScope = null;
let breakdownMode = "category";
let currentReport = null;
let storedAnalysisData = null;
let storedTransactionsData = null;
let storedCategoryRules = new Map();
let categoryRulesOwnerId = null;
let categoryReviewRows = [];
let categoryReviewDraft = new Map();
const cloudComparisons = new Map();
const cloudComparisonRequests = new Set();
let transactionPage = 0;
let transactionMerchantFilter = "";
let transactionPeriodFilter = "all";
const TRANSACTIONS_PER_PAGE = 8;
const ALL_PERIOD = "__ALL__";
const YEAR_PERIOD = "__YEAR__";
const CATEGORY_CORRECTION_HEADERS = ["利用先", "支払い元", "件数", "現在の使いみち", "修正後の使いみち"];
const CATEGORY_RULE_BACKUP_HEADERS = ["照合番号", "利用先", "支払い元", "使いみち"];
const merchantChainRules = [
  { label: "セブンイレブン", aliases: ["セブンイレブン", "seveneleven", "7eleven"] },
  { label: "ローソン", aliases: ["ローソン", "lawson"] },
  { label: "ファミリーマート", aliases: ["ファミリーマート", "ファミマ", "familymart"] },
  { label: "ミニストップ", aliases: ["ミニストップ", "ministop"] },
  { label: "デイリーヤマザキ", aliases: ["デイリーヤマザキ", "dailyyamazaki"] },
  { label: "セイコーマート", aliases: ["セイコーマート", "seicomart"] },
  { label: "NewDays", aliases: ["newdays", "ニューデイズ"] },
  { label: "ポプラ", aliases: ["ポプラ"] },
];

const fallbackReport = {
  dataset: "synthetic",
  month: "2026-06",
  generated_at: new Date().toISOString(),
  summary: {
    total_expense: 184620,
    group_average: 197400,
    difference: -12780,
    difference_rate: -6.5,
    transaction_count: 12,
    previous_total: 197500,
    month_over_month: -6.5,
  },
  categories: [
    { name: "食費", amount: 77540, ratio: 42, group_average: 84200, difference: -6660 },
    { name: "日用品", amount: 44310, ratio: 24, group_average: 41700, difference: 2610 },
    { name: "交通費", amount: 33230, ratio: 18, group_average: 29600, difference: 3630 },
    { name: "娯楽", amount: 29540, ratio: 16, group_average: 41900, difference: -12360 },
  ],
  sources: [
    { name: "JCB", amount: 59920, count: 4 },
    { name: "PayPay", amount: 53480, count: 4 },
    { name: "VISA", amount: 71220, count: 4 },
  ],
  trend: [{ month: "2026-06", amount: 184620, count: 12, partial: false }],
  comparison: {
    type: "group",
    label: "みんなの参考平均",
    value: 197400,
    note: "使い方を試すための例です",
    status: "参考例との比較",
  },
  insight: "注目：これは使い方を試すための例です。\n見方：実際の利用者の平均ではありません。\n次の一歩：自分の明細を読み込むと、自分向けの結果に切り替わります。",
};

function formatMonth(value) {
  if (value === ALL_PERIOD) return "読み込んだ全期間";
  if (value === YEAR_PERIOD) return "直近1年間";
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  return match ? `${match[1]}年${Number(match[2])}月` : value;
}

function formatRate(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}%`;
}

function getMonthChangeState(value, previousTotal) {
  if (previousTotal === null || previousTotal === undefined) return "unavailable";
  if (value === null || value === undefined) return "unavailable";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "unavailable";
  if (numeric > 0) return "increase";
  if (numeric < 0) return "decrease";
  return "neutral";
}

function formatFullYen(value) {
  const numeric = Number(value);
  return `${number.format(Number.isFinite(numeric) ? Math.round(numeric) : 0)}円`;
}

function buildAnalysisInsight({
  scope = "ALL",
  totalExpense = 0,
  transactionCount = 0,
  comparison = {},
  difference = null,
  differenceRate = null,
  categories = [],
  sources = [],
  previousTotal = null,
  monthOverMonth = null,
  partial = false,
} = {}) {
  const total = Number(totalExpense);
  const safeTotal = Number.isFinite(total) ? total : 0;
  const count = Number(transactionCount);
  const safeCount = Number.isFinite(count) ? count : 0;
  const numericDifference = Number(difference);
  const numericDifferenceRate = Number(differenceRate);
  const hasComparison = comparison.value !== null
    && comparison.value !== undefined
    && difference !== null
    && difference !== undefined
    && differenceRate !== null
    && differenceRate !== undefined
    && Number.isFinite(Number(comparison.value))
    && Number.isFinite(numericDifference)
    && Number.isFinite(numericDifferenceRate);
  const topCategory = categories.find((category) => Number(category.amount) > 0);
  const otherCategory = categories.find((category) => category.name === "その他" && Number(category.amount) > 0);
  const excessCategory = [...categories]
    .filter((category) => Number.isFinite(Number(category.difference)) && Number(category.difference) > 0)
    .sort((left, right) => Number(right.difference) - Number(left.difference))[0];

  let attention = `${paymentScopeLabel(scope)}は${formatFullYen(safeTotal)}、${number.format(safeCount)}回の支払いです。`;
  if (partial) attention = `まだ月の途中を含むため、${attention}今後増える可能性があります。`;
  if (hasComparison && numericDifference !== 0) {
    attention += `${comparison.label || "比べる目安"}より${formatFullYen(Math.abs(numericDifference))}（${Math.abs(numericDifferenceRate).toFixed(1)}%）${numericDifference > 0 ? "多い" : "少ない"}状態です。`;
  } else if (hasComparison) {
    attention += `${comparison.label || "比べる目安"}とほぼ同じです。`;
  }

  let meaning;
  if (!hasComparison) {
    meaning = comparison.type === "personal"
      ? "過去の月がまだ少ないため、今は前の月からの増減を優先して見ましょう。"
      : "比べられる人数がまだ少ないため、今は自分の前月と使いみちの偏りを優先して見ましょう。";
  } else if (numericDifferenceRate >= 15) {
    meaning = "比べる目安より支出がはっきり多い月です。一時的な出費か、来月も続く出費かを分けて考えると見直しやすくなります。";
  } else if (numericDifferenceRate <= -15) {
    meaning = "比べる目安より支出を抑えられています。無理にさらに削らず、増えた使いみちだけ確認すれば十分です。";
  } else {
    meaning = "比べる目安と大きな差はありません。全体を削るより、増えた使いみちを一つずつ確認する方が効果的です。";
  }

  const numericPreviousTotal = Number(previousTotal);
  const numericMonthOverMonth = Number(monthOverMonth);
  if (Number.isFinite(numericPreviousTotal) && numericPreviousTotal > 0 && Number.isFinite(numericMonthOverMonth) && Math.abs(numericMonthOverMonth) >= 15) {
    meaning += `前の月から${Math.abs(numericMonthOverMonth).toFixed(1)}%${numericMonthOverMonth > 0 ? "増えている" : "減っている"}ため、月ごとの棒グラフでも変化を確認してください。`;
  } else if (topCategory && Number(topCategory.ratio) >= 40) {
    meaning += `${topCategory.name}が全体の${Number(topCategory.ratio).toFixed(1)}%を占め、支出が一か所に集まっています。`;
  }

  let action;
  if (otherCategory && Number(otherCategory.ratio) >= 20) {
    action = `「その他」を開き、金額の大きい明細から使いみちを直してください。結果の理由が見つけやすくなります。`;
  } else if (excessCategory) {
    action = `${excessCategory.name}の明細を金額が大きい順に3件確認し、繰り返し減らせる支出が一つないか探しましょう。目安より多い分は${formatFullYen(excessCategory.difference)}です。`;
  } else if (topCategory) {
    action = `${topCategory.name}の明細を金額が大きい順に3件だけ確認し、必要な支出と減らせる支出に分けてみましょう。`;
  } else {
    action = "明細が増えたら、金額が大きい支出から確認しましょう。";
  }

  if (scope === "ALL") {
    action += "同じ支払いがPayPayとカードの両方に入っていないかも確認してください。";
  }

  return `注目：${attention}\n見方：${meaning}\n次の一歩：${action}`;
}

function buildPeriodInsight({ totalExpense = 0, transactionCount = 0, monthSeries = [], categories = [] } = {}) {
  const months = monthSeries.length;
  const monthlyAverage = months ? Math.round(Number(totalExpense) / months) : 0;
  const highest = [...monthSeries].sort((left, right) => Number(right.amount) - Number(left.amount))[0];
  const topCategory = categories.find((category) => Number(category.amount) > 0);
  const attention = `${months}か月の支出は合計${formatFullYen(totalExpense)}、1か月あたり${formatFullYen(monthlyAverage)}、${number.format(transactionCount)}回です。`;
  const meaning = highest
    ? `${formatMonth(highest.month)}が最も多い月でした。${topCategory ? `${topCategory.name}が対象期間の${Number(topCategory.ratio).toFixed(1)}%を占めています。` : ""}`
    : "月ごとの支出が増えると、変化が分かりやすくなります。";
  const action = topCategory
    ? `${topCategory.name}の明細を対象期間で見比べ、何度も続いている支出を一つ選んで次の月の目標を決めましょう。`
    : "明細を読み込んだら、最も支出が多い月から確認しましょう。";
  return `注目：${attention}\n見方：${meaning}\n次の一歩：${action}`;
}

function formatCompactMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  return match ? `${Number(match[2])}月` : value;
}

function setConnection(mode, text) {
  const element = document.querySelector("#connection-status");
  element.classList.remove("is-online", "is-local");
  if (mode) element.classList.add(mode);
  element.querySelector("span").textContent = text;
}

function renderReport(report, mode = "aws") {
  currentReport = report;
  const summary = report.summary;
  const isPeriodSummary = ["all", "year"].includes(report.period_type) || [ALL_PERIOD, YEAR_PERIOD].includes(report.month);
  const comparison = report.comparison || {
    type: "group",
    label: "みんなの参考平均",
    value: summary.group_average,
    note: "使い方を試すための例",
    status: "参考例との比較",
  };
  const hasComparison = comparison.value !== null && comparison.value !== undefined && Number.isFinite(Number(comparison.value));

  document.querySelector("#empty-state").hidden = true;
  document.querySelector("#result-content").hidden = false;
  document.querySelector("#comparison-control").hidden = isPeriodSummary;
  document.querySelector("#report-period-control").hidden = !["local", "stored"].includes(mode);

  document.querySelector("#report-month").textContent = formatMonth(report.month);
  document.querySelector("#total-expense").textContent = yen.format(summary.total_expense);
  document.querySelector("#total-expense-label").textContent = isPeriodSummary ? "期間内の支出" : "今月の支出";
  document.querySelector("#comparison-label").textContent = isPeriodSummary ? "1か月あたり" : comparison.label;
  document.querySelector("#comparison-value").textContent = isPeriodSummary
    ? yen.format(summary.monthly_average || 0)
    : hasComparison ? yen.format(comparison.value) : "比較待ち";
  document.querySelector("#comparison-note").textContent = isPeriodSummary ? `${summary.period_month_count || 0}か月の平均` : comparison.note;
  document.querySelector("#comparison-status").textContent = isPeriodSummary
    ? `${summary.period_month_count || 0}か月をまとめて表示`
    : comparison.type === "group" && !hasComparison ? "みんなとの比較" : comparison.status;
  document.querySelector("#transaction-count").textContent = `${number.format(summary.transaction_count)}件`;
  document.querySelector("#source-count").textContent = isPeriodSummary ? "期間内のすべて" : "選んだ月の合計";
  document.querySelector("#period-change-label").textContent = isPeriodSummary ? "対象期間" : "前の月から";
  const monthChangeMetric = document.querySelector("#month-over-month-metric");
  const monthChangeValue = document.querySelector("#month-over-month");
  const previousMonthNote = document.querySelector("#previous-month-note");
  const monthChangeState = isPeriodSummary ? "summary" : getMonthChangeState(summary.month_over_month, summary.previous_total);
  const monthChangeNotes = {
    increase: "前月より支出が増加",
    decrease: "前月より支出が減少",
    neutral: "前月と同じ支出額",
    unavailable: "前の月の記録なし",
  };
  monthChangeMetric.classList.remove("is-increase", "is-decrease", "is-neutral");
  if (["increase", "decrease", "neutral"].includes(monthChangeState)) {
    monthChangeMetric.classList.add(`is-${monthChangeState}`);
  }
  monthChangeValue.textContent = isPeriodSummary ? `${summary.period_month_count || 0}か月` : formatRate(summary.month_over_month);
  previousMonthNote.textContent = isPeriodSummary
    ? `${formatMonth(summary.period_start)}〜${formatMonth(summary.period_end)}`
    : monthChangeNotes[monthChangeState];
  monthChangeValue.setAttribute("aria-label", isPeriodSummary
    ? `対象期間 ${summary.period_month_count || 0}か月`
    : `${monthChangeNotes[monthChangeState]} ${formatRate(summary.month_over_month)}`);
  const donutTotal = document.querySelector("#donut-total");
  const fullYen = formatFullYen(summary.total_expense);
  donutTotal.textContent = fullYen;
  donutTotal.classList.toggle("is-long", fullYen.length >= 10);
  donutTotal.classList.toggle("is-very-long", fullYen.length >= 14);
  renderInsight(report.insight);
  document.querySelector("#open-transactions").hidden = !Array.isArray(report.transactions) || !report.transactions.length;
  document.querySelector("#open-category-review").hidden = !Array.isArray(report.transactions) || !report.transactions.length;

  const comparisonText = document.querySelector("#average-comparison");
  comparisonText.textContent = isPeriodSummary
    ? "月ごとの違いは棒グラフで確認できます"
    : hasComparison
    ? `${comparison.label}より ${formatRate(summary.difference_rate)}`
    : comparison.type === "group"
      ? "みんなとの比較"
      : "過去の月がまだ不足";
  if (hasComparison && comparison.type === "personal") {
    comparisonText.textContent = `本人の過去平均より ${formatRate(summary.difference_rate)}`;
  }

  const badge = document.querySelector("#dataset-badge");
  badge.hidden = mode === "local";
  badge.textContent = mode === "stored" ? "保存済み" : mode === "local" ? "" : "お試し表示";

  renderBreakdown(report);
  renderTrend(report.trend || [], isPeriodSummary ? null : report.month);

  const generated = new Date(report.generated_at);
  document.querySelector("#generated-at").textContent = Number.isNaN(generated.getTime())
    ? "分析完了"
    : `分析実行: ${generated.toLocaleString("ja-JP")}`;
}

function renderInsight(insight) {
  const container = document.querySelector("#insight-text");
  container.replaceChildren();
  String(insight || "結果を確認できませんでした。")
    .split(/\n+/)
    .filter(Boolean)
    .forEach((line) => {
      const match = /^([^：]+)：(.*)$/.exec(line);
      const row = document.createElement("div");
      row.className = "insight-row";
      const label = match ? match[1] : "ポイント";
      const text = match ? match[2] : line;
      row.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(text)}</span>`;
      container.append(row);
    });
}

function renderBreakdown(report) {
  const categoryList = document.querySelector("#category-list");
  categoryList.replaceChildren();
  const gradient = [];
  let gradientStart = 0;
  const isCategory = true;
  const items = buildBreakdownItems(report, "category");

  document.querySelector("#breakdown-kicker").textContent = "SPENDING BREAKDOWN";
  document.querySelector("#breakdown-title").textContent = "支出の内訳";

  items.slice(0, 6).forEach((category, index) => {
    const color = categoryColors[index % categoryColors.length];
    const gradientEnd = gradientStart + Number(category.ratio);
    gradient.push(`${color} ${gradientStart}% ${gradientEnd}%`);
    gradientStart = gradientEnd;

    const row = document.createElement("div");
    row.className = "category-item";
    const categoryComparisonText = isCategory && Number.isFinite(Number(category.group_average))
      ? `平均との差 ${yen.format(category.difference)}`
      : `${category.ratio.toFixed(1)}%${isCategory ? "" : `・${number.format(category.count)}件`}`;
    row.innerHTML = `
      <span><i class="color-dot" style="background:${color}"></i>${escapeHtml(category.name)}</span>
      <b>${yen.format(category.amount)}</b>
      <div class="category-bar"><i style="--width:${Math.min(category.ratio, 100)}%;--color:${color}"></i></div>
      <small>${categoryComparisonText}</small>
    `;
    categoryList.append(row);
  });

  if (gradientStart < 100) gradient.push(`#e9ece7 ${gradientStart}% 100%`);
  document.querySelector("#category-donut").style.background = `conic-gradient(${gradient.join(",")})`;
}

function buildBreakdownItems(report, mode) {
  if (mode === "category") return report.categories;
  const total = report.summary.total_expense;
  return report.sources.map((source) => ({
    ...source,
    ratio: total ? Math.round((source.amount / total) * 1000) / 10 : 0,
    group_average: null,
    difference: null,
  }));
}

function normalizeMerchantLookupText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-‐‑‒–—―・･．.／/\\_]+/g, "");
}

function getMerchantFilterValue(merchant) {
  const original = String(merchant || "").trim();
  if (!original) return "";
  const lookupText = normalizeMerchantLookupText(original);
  const chain = merchantChainRules.find(({ aliases }) => aliases.some((alias) => lookupText.includes(alias)));
  return chain?.label || original;
}

function buildMerchantFilterOptions(transactions) {
  const values = new Set();
  (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    const value = getMerchantFilterValue(transaction?.merchant);
    if (value) values.add(value);
  });
  return [...values].sort((left, right) => left.localeCompare(right, "ja"));
}

function getTransactionPage(report, page = 0, pageSize = TRANSACTIONS_PER_PAGE, merchant = "") {
  const transactions = Array.isArray(report?.transactions) ? report.transactions : [];
  const filteredTransactions = merchant
    ? transactions.filter((transaction) => getMerchantFilterValue(transaction.merchant) === merchant)
    : transactions;
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  return {
    items: filteredTransactions.slice(safePage * pageSize, (safePage + 1) * pageSize),
    page: safePage,
    totalPages,
    totalItems: filteredTransactions.length,
    totalAmount: filteredTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
  };
}

function buildTransactionViewReport(report, analysis, scope, period = "all") {
  if (period !== "all" || !analysis) return report;
  const transactions = getScopedTransactions(analysis, scope)
    .sort((left, right) => right.date.localeCompare(left.date))
    .map(({ date, merchant, category, source, amount }) => ({ date, merchant, category, source, amount }));
  return {
    ...report,
    month: ALL_PERIOD,
    period_type: "all",
    transactions,
  };
}

function getTransactionDialogReport() {
  return buildTransactionViewReport(currentReport, localAnalysis, analysisScope, transactionPeriodFilter);
}

function populateTransactionPeriodFilter() {
  const select = document.querySelector("#transaction-period-filter");
  const monthOption = select.querySelector('option[value="month"]');
  const hasSelectedMonth = currentReport?.month && ![ALL_PERIOD, YEAR_PERIOD].includes(currentReport.month);
  monthOption.disabled = !hasSelectedMonth;
  monthOption.hidden = !hasSelectedMonth;
  monthOption.textContent = hasSelectedMonth ? `${formatMonth(currentReport.month)}だけ` : "選択中の期間";
  if (!localAnalysis || !hasSelectedMonth) transactionPeriodFilter = localAnalysis ? "all" : "month";
  select.value = transactionPeriodFilter;
}

function populateTransactionMerchantFilter() {
  const select = document.querySelector("#transaction-merchant-filter");
  const transactionReport = getTransactionDialogReport();
  const merchants = buildMerchantFilterOptions(transactionReport?.transactions);
  select.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "すべての利用店・チェーン";
  select.append(allOption);
  merchants.forEach((merchant) => {
    const option = document.createElement("option");
    option.value = merchant;
    option.textContent = merchant;
    select.append(option);
  });
  select.value = merchants.includes(transactionMerchantFilter) ? transactionMerchantFilter : "";
  transactionMerchantFilter = select.value;
}

function renderTransactionDialog() {
  const pageSize = Number(browserWindow.innerHeight) > 0 && Number(browserWindow.innerHeight) < 650 ? 5 : TRANSACTIONS_PER_PAGE;
  const transactionReport = getTransactionDialogReport();
  const pageData = getTransactionPage(transactionReport, transactionPage, pageSize, transactionMerchantFilter);
  transactionPage = pageData.page;
  const rows = document.querySelector("#transaction-rows");
  rows.replaceChildren();

  pageData.items.forEach((transaction) => {
    const row = document.createElement("div");
    row.className = "transaction-row";
    const categoryOptions = selectableCategories
      .map((category) => `<option value="${escapeHtml(category)}"${category === transaction.category ? " selected" : ""}>${escapeHtml(category)}</option>`)
      .join("");
    row.innerHTML = `
      <time datetime="${escapeHtml(transaction.date)}">${escapeHtml(transaction.date.replaceAll("-", "/"))}</time>
      <strong title="${escapeHtml(transaction.merchant)}">${escapeHtml(transaction.merchant)}</strong>
      <select class="transaction-category-select" data-source="${escapeHtml(transaction.source)}" data-merchant="${escapeHtml(transaction.merchant)}" aria-label="${escapeHtml(transaction.merchant)}の使いみち">
        ${categoryOptions}
      </select>
      <b>${yen.format(transaction.amount)}</b>
    `;
    rows.append(row);
  });

  const scope = currentReport?.scope ? paymentScopeLabel(currentReport.scope) : "支払い";
  const filterText = transactionMerchantFilter ? `・${transactionMerchantFilter}` : "";
  const transactionMonths = [...new Set((transactionReport?.transactions || []).map((transaction) => transaction.date.slice(0, 7)))].sort();
  const periodText = transactionPeriodFilter === "all" && transactionMonths.length
    ? `${formatMonth(transactionMonths[0])}〜${formatMonth(transactionMonths.at(-1))}`
    : formatMonth(currentReport?.month);
  document.querySelector("#transaction-context").textContent = `${periodText}・${scope}${filterText}`;
  document.querySelector("#transaction-filter-total").textContent = yen.format(pageData.totalAmount);
  document.querySelector("#transaction-filter-count").textContent = `${number.format(pageData.totalItems)}件`;
  document.querySelector("#transaction-page").textContent = `${pageData.page + 1} / ${pageData.totalPages}`;
  document.querySelector("#transaction-prev").disabled = pageData.page === 0;
  document.querySelector("#transaction-next").disabled = pageData.page >= pageData.totalPages - 1;
  updateCategoryCorrectionActions();
}

function applyManualCategory(analysis, source, merchant, category) {
  if (!analysis || !cloudCategories.has(category)) return 0;
  const normalizedMerchant = normalizeCategoryRuleMerchant(merchant);
  const normalizedSource = normalizeCategoryRuleSource(source);
  if (!normalizedMerchant) return 0;
  let changedCount = 0;
  analysis.transactions.forEach((transaction) => {
    const sameMerchant = normalizeCategoryRuleMerchant(transaction.merchant) === normalizedMerchant;
    const sameSource = normalizeCategoryRuleSource(transaction.source) === normalizedSource;
    if (sameSource && sameMerchant && transaction.category !== category) {
      transaction.category = category;
      changedCount += 1;
    }
  });
  return changedCount;
}

function normalizeCategoryRuleMerchant(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCategoryRuleSource(value) {
  const normalized = String(value || "").normalize("NFKC").trim().toUpperCase();
  if (normalized.includes("PAYPAY")) return "PAYPAY";
  if (normalized.includes("JCB")) return "JCB";
  if (normalized.includes("VISA")) return "VISA";
  if (normalized.includes("CARD") || normalized.includes("カード")) return "CARD";
  return normalized;
}

function categoryRuleKey(source, merchant) {
  return `${normalizeCategoryRuleSource(source)}\u0000${normalizeCategoryRuleMerchant(merchant)}`;
}

function personalRuleSource(value) {
  const source = normalizeCategoryRuleSource(value);
  return ["PAYPAY", "JCB", "VISA", "CARD"].includes(source) ? source : "CARD";
}

async function sha256Hex(value) {
  const cryptoApi = browserWindow.crypto || globalThis.crypto;
  if (cryptoApi?.subtle) {
    const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  if (typeof require === "function") {
    return require("node:crypto").createHash("sha256").update(String(value), "utf8").digest("hex");
  }
  throw new Error("分類ルールの照合番号を作成できませんでした。");
}

async function createPersonalCategoryRule(source, merchant, category) {
  const normalizedMerchant = normalizeCategoryRuleMerchant(merchant);
  const normalizedSource = personalRuleSource(source);
  if (!normalizedMerchant || !cloudCategories.has(category)) return null;
  const hash = await sha256Hex(`${normalizedSource}\n${normalizedMerchant}`);
  return { rule_key: `${normalizedSource}#${hash}`, source: normalizedSource, category };
}

async function loadCategoryRules() {
  const user = spendOpsAuth?.getSessionUser();
  if (!user) {
    storedCategoryRules = new Map();
    categoryRulesOwnerId = null;
    return false;
  }
  if (categoryRulesOwnerId === user.sub) return true;
  const response = await spendOpsAuth.authenticatedFetch("/category-rules");
  if (!response.ok) throw new Error("このアカウントの使いみち設定を取得できませんでした。");
  const result = await response.json();
  storedCategoryRules = new Map(
    (Array.isArray(result.rules) ? result.rules : [])
      .filter((rule) => typeof rule?.rule_key === "string" && cloudCategories.has(rule.category))
      .map((rule) => [rule.rule_key, rule]),
  );
  categoryRulesOwnerId = user.sub;
  return true;
}

async function saveCategoryRulesToCloud(rules) {
  const user = spendOpsAuth?.getSessionUser();
  if (!user) throw new Error("このアカウントだけに学習するにはログインしてください。");
  const validRules = (Array.isArray(rules) ? rules : []).filter(Boolean);
  if (!validRules.length) return { saved_rule_count: 0 };
  let savedRuleCount = 0;
  for (let index = 0; index < validRules.length; index += 500) {
    const chunk = validRules.slice(index, index + 500);
    const response = await spendOpsAuth.authenticatedFetch("/category-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: chunk }),
    });
    if (!response.ok) throw new Error("使いみちの学習内容を保存できませんでした。");
    const result = await response.json();
    savedRuleCount += Number(result.saved_rule_count) || chunk.length;
    chunk.forEach((rule) => storedCategoryRules.set(rule.rule_key, rule));
  }
  categoryRulesOwnerId = user.sub;
  return { saved_rule_count: savedRuleCount };
}

async function applyPersonalCategoryRules(analysis, rules = storedCategoryRules) {
  if (!analysis || !(rules instanceof Map) || !rules.size) {
    return { changedTransactions: 0, matchedRules: 0 };
  }
  const groups = new Map();
  (analysis.transactions || []).forEach((transaction) => {
    const key = categoryRuleKey(transaction.source, transaction.merchant);
    if (!groups.has(key)) groups.set(key, { source: transaction.source, merchant: transaction.merchant, transactions: [] });
    groups.get(key).transactions.push(transaction);
  });
  let changedTransactions = 0;
  let matchedRules = 0;
  await Promise.all([...groups.values()].map(async (group) => {
    const identity = await createPersonalCategoryRule(group.source, group.merchant, "その他");
    const rule = identity ? rules.get(identity.rule_key) : null;
    if (!rule || !cloudCategories.has(rule.category)) return;
    matchedRules += 1;
    group.transactions.forEach((transaction) => {
      if (transaction.category !== rule.category) {
        transaction.category = rule.category;
        changedTransactions += 1;
      }
    });
  }));
  return { changedTransactions, matchedRules };
}

function buildCategoryReviewRows(analysis) {
  const grouped = new Map();
  (analysis?.transactions || []).forEach((transaction) => {
    const merchant = String(transaction.merchant || "").trim();
    const source = String(transaction.source || "").trim();
    if (!merchant || !source) return;
    const key = categoryRuleKey(source, merchant);
    const current = grouped.get(key) || { key, merchant, source, count: 0, categories: new Map() };
    current.count += 1;
    current.categories.set(transaction.category, (current.categories.get(transaction.category) || 0) + 1);
    grouped.set(key, current);
  });
  return [...grouped.values()].map((row) => {
    const category = [...row.categories.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "その他";
    return { key: row.key, merchant: row.merchant, source: row.source, count: row.count, category };
  }).sort((left, right) => (
    Number(right.category === "その他") - Number(left.category === "その他")
      || left.merchant.localeCompare(right.merchant, "ja")
      || left.source.localeCompare(right.source, "ja")
  ));
}

function buildOtherCategoryRows(analysis) {
  const grouped = new Map();
  (analysis?.transactions || []).forEach((transaction) => {
    if (transaction.category !== "その他") return;
    const merchant = String(transaction.merchant || "").trim();
    const source = String(transaction.source || "").trim();
    if (!merchant || !source) return;
    const key = categoryRuleKey(source, merchant);
    const current = grouped.get(key) || { merchant, source, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((left, right) => (
    left.merchant.localeCompare(right.merchant, "ja") || left.source.localeCompare(right.source, "ja")
  ));
}

function protectSpreadsheetCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function restoreSpreadsheetCell(value) {
  const text = String(value ?? "").trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function encodeCsvRow(values) {
  return values.map((value) => `"${protectSpreadsheetCell(value).replaceAll('"', '""')}"`).join(",");
}

function buildCategoryCorrectionCsv(analysis) {
  const rows = buildOtherCategoryRows(analysis);
  if (!rows.length) return "";
  const body = [
    CATEGORY_CORRECTION_HEADERS,
    ...rows.map((row) => [row.merchant, row.source, row.count, "その他", ""]),
  ].map(encodeCsvRow).join("\r\n");
  return `\uFEFF${body}\r\n`;
}

function parseCategoryCorrectionCsv(text) {
  const rows = parseCsv(String(text || "").replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("修正する内容が見つかりませんでした。");
  const headers = rows[0].map((value) => restoreSpreadsheetCell(value));
  const merchantIndex = findColumn(headers, ["利用先", "取引先", "利用店"]);
  const sourceIndex = findColumn(headers, ["支払い元", "支払い方法", "source"]);
  const categoryIndex = findColumn(headers, ["修正後の使いみち", "修正後の分類", "category"]);
  if ([merchantIndex, sourceIndex, categoryIndex].some((index) => index < 0)) {
    throw new Error("書き出した分類リストと同じ列を残してください。");
  }

  const rulesByKey = new Map();
  let skippedRows = 0;
  rows.slice(1).forEach((row, index) => {
    const merchant = restoreSpreadsheetCell(row[merchantIndex]);
    const source = restoreSpreadsheetCell(row[sourceIndex]);
    const category = restoreSpreadsheetCell(row[categoryIndex]);
    if (!merchant && !source && !category) return;
    if (!category || category === "その他") {
      skippedRows += 1;
      return;
    }
    if (!merchant || !source) throw new Error(`${index + 2}行目の利用先または支払い元が空です。`);
    if (!cloudCategories.has(category)) throw new Error(`${index + 2}行目の使いみち「${category}」は選べません。`);
    const key = categoryRuleKey(source, merchant);
    const existing = rulesByKey.get(key);
    if (existing && existing.category !== category) {
      throw new Error(`${index + 2}行目までに同じ利用先へ異なる使いみちが指定されています。`);
    }
    rulesByKey.set(key, { merchant, source, category });
  });
  return { rules: [...rulesByKey.values()], skippedRows };
}

function applyCategoryCorrections(analysis, rules) {
  if (!analysis || !Array.isArray(rules)) {
    return { changedTransactions: 0, matchedRules: 0, unmatchedRules: 0 };
  }
  const ruleMap = new Map(
    rules
      .filter((rule) => cloudCategories.has(rule.category))
      .map((rule) => [categoryRuleKey(rule.source, rule.merchant), rule.category]),
  );
  const matchedKeys = new Set();
  let changedTransactions = 0;
  analysis.transactions.forEach((transaction) => {
    const key = categoryRuleKey(transaction.source, transaction.merchant);
    const category = ruleMap.get(key);
    if (!category) return;
    matchedKeys.add(key);
    if (transaction.category !== category) {
      transaction.category = category;
      changedTransactions += 1;
    }
  });
  return {
    changedTransactions,
    matchedRules: matchedKeys.size,
    unmatchedRules: Math.max(ruleMap.size - matchedKeys.size, 0),
  };
}

function updateCategoryCorrectionActions() {
  const button = document.querySelector("#export-other-categories");
  if (!button) return;
  const count = buildOtherCategoryRows(localAnalysis).length;
  button.disabled = count === 0;
  button.textContent = count ? `「その他」の分類リストを書き出す（${number.format(count)}件）` : "「その他」はありません";
}

function downloadOtherCategoryCorrections() {
  const csv = buildCategoryCorrectionCsv(localAnalysis);
  const message = document.querySelector("#upload-message");
  if (!csv) {
    message.textContent = "現在の明細に「その他」はありません。";
    message.className = "upload-message is-success";
    return;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = browserWindow.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spendops_category_corrections_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  browserWindow.URL.revokeObjectURL(url);
  message.textContent = "「その他」の利用先を分類リストへ書き出しました。修正後もこのファイルを保管してください。";
  message.className = "upload-message is-success";
}

async function importCategoryCorrections(file) {
  if (!localAnalysis) throw new Error("先に利用明細または保存済みの結果を表示してください。");
  const decoded = decodeCsv(await file.arrayBuffer());
  const parsed = parseCategoryCorrectionCsv(decoded.text);
  if (!parsed.rules.length) throw new Error("「修正後の使いみち」が入力された行がありません。");
  const applied = applyCategoryCorrections(localAnalysis, parsed.rules);
  if (!applied.matchedRules) throw new Error("現在の明細と一致する利用先がありませんでした。");
  renderLocalMonth(false);
  populateTransactionMerchantFilter();
  renderTransactionDialog();

  let saved = null;
  let learnedRuleCount = 0;
  if (spendOpsAuth?.getSessionUser()) {
    const personalRules = (await Promise.all(parsed.rules.map((rule) => (
      createPersonalCategoryRule(rule.source, rule.merchant, rule.category)
    )))).filter(Boolean);
    const learned = await saveCategoryRulesToCloud(personalRules);
    learnedRuleCount = learned.saved_rule_count;
    if (applied.changedTransactions) saved = await saveAnalysisToCloud(localAnalysis);
    await loadStoredAccountData(false);
  }
  return { ...applied, skippedRows: parsed.skippedRows, saved, learnedRuleCount };
}

async function handleCategoryCorrectionFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const message = document.querySelector("#upload-message");
  try {
    message.textContent = "修正した分類リストを確認しています…";
    message.className = "upload-message";
    const result = await importCategoryCorrections(file);
    const saveText = result.learnedRuleCount
      ? `このアカウントへ${number.format(result.learnedRuleCount)}件を学習し、次回から自動で反映します。`
      : spendOpsAuth?.getSessionUser()
        ? "すでに同じ内容が反映されています。"
        : "この画面へ反映しました。ログイン中は保存結果にも反映されます。";
    const unmatchedText = result.unmatchedRules ? ` 現在の明細にない利用先は${number.format(result.unmatchedRules)}件でした。` : "";
    message.textContent = `${number.format(result.matchedRules)}件の利用先、${number.format(result.changedTransactions)}件の明細を修正しました。${saveText}${unmatchedText}`;
    message.className = "upload-message is-success";
    if (result.saved) setConnection("is-online", "分類の修正を保存済み");
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "分類リストを読み取れませんでした。";
    message.className = "upload-message is-error";
  } finally {
    input.value = "";
  }
}

async function handleTransactionCategoryChange(select) {
  if (!localAnalysis) return;
  const category = select.value;
  const changedCount = applyManualCategory(localAnalysis, select.dataset.source, select.dataset.merchant, category);
  if (!changedCount) return;

  renderLocalMonth(false);
  renderTransactionDialog();
  const message = document.querySelector("#upload-message");
  message.textContent = `${select.dataset.merchant}と同じ利用店の${number.format(changedCount)}件を「${category}」へ変更しました。`;
  message.className = "upload-message is-success";

  if (!spendOpsAuth?.getSessionUser()) return;
  try {
    const rule = await createPersonalCategoryRule(select.dataset.source, select.dataset.merchant, category);
    await saveCategoryRulesToCloud([rule]);
    const saved = await saveAnalysisToCloud(localAnalysis);
    await loadStoredAccountData(false);
    message.textContent = `このアカウントに使いみちを学習し、${number.format(saved.saved_transaction_count)}件の明細と${number.format(saved.saved_summary_count)}か月分の結果を保存しました。次回から自動で反映します。`;
    setConnection("is-online", "結果を保存済み");
  } catch (_error) {
    message.textContent = "使いみちの変更は画面へ反映しましたが、保存に失敗しました。";
    message.className = "upload-message is-error";
    setConnection("is-local", "この画面だけに反映");
  }
}

function openTransactionDialog() {
  const transactionReport = buildTransactionViewReport(currentReport, localAnalysis, analysisScope, localAnalysis ? "all" : "month");
  if (!Array.isArray(transactionReport?.transactions) || !transactionReport.transactions.length) return;
  transactionPage = 0;
  transactionMerchantFilter = "";
  transactionPeriodFilter = localAnalysis ? "all" : "month";
  populateTransactionPeriodFilter();
  populateTransactionMerchantFilter();
  renderTransactionDialog();
  const dialog = document.querySelector("#transaction-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeTransactionDialog() {
  const dialog = document.querySelector("#transaction-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function buildCategoryRuleBackupCsv(analysis, rules = storedCategoryRules) {
  if (!(rules instanceof Map) || !rules.size) return "";
  const merchantsByRuleKey = new Map();
  await Promise.all(buildCategoryReviewRows(analysis).map(async (row) => {
    const identity = await createPersonalCategoryRule(row.source, row.merchant, row.category);
    if (identity) merchantsByRuleKey.set(identity.rule_key, row.merchant);
  }));
  const rows = [...rules.values()]
    .filter((rule) => typeof rule?.rule_key === "string" && cloudCategories.has(rule.category))
    .sort((left, right) => left.rule_key.localeCompare(right.rule_key))
    .map((rule) => [rule.rule_key, merchantsByRuleKey.get(rule.rule_key) || "", rule.source, rule.category]);
  if (!rows.length) return "";
  return `\uFEFF${[CATEGORY_RULE_BACKUP_HEADERS, ...rows].map(encodeCsvRow).join("\r\n")}\r\n`;
}

function parseCategoryRuleBackupCsv(text) {
  const rows = parseCsv(String(text || "").replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("学習内容の控えが空です。");
  const headers = rows[0].map((value) => restoreSpreadsheetCell(value));
  const ruleKeyIndex = findColumn(headers, ["照合番号", "rule_key"]);
  const merchantIndex = findColumn(headers, ["利用先", "取引先", "利用店"]);
  const sourceIndex = findColumn(headers, ["支払い元", "支払い方法", "source"]);
  const categoryIndex = findColumn(headers, ["使いみち", "修正後の使いみち", "category"]);
  if (sourceIndex < 0 || categoryIndex < 0 || (ruleKeyIndex < 0 && merchantIndex < 0)) {
    throw new Error("書き出した学習内容の控えと同じ列を残してください。");
  }
  const rules = rows.slice(1).map((row, index) => {
    const ruleKey = ruleKeyIndex >= 0 ? restoreSpreadsheetCell(row[ruleKeyIndex]) : "";
    const merchant = merchantIndex >= 0 ? restoreSpreadsheetCell(row[merchantIndex]) : "";
    const source = restoreSpreadsheetCell(row[sourceIndex]);
    const category = restoreSpreadsheetCell(row[categoryIndex]);
    if (!ruleKey && !merchant && !source && !category) return null;
    if (!cloudCategories.has(category)) throw new Error(`${index + 2}行目の使いみち「${category}」は選べません。`);
    if (ruleKey && !/^(PAYPAY|JCB|VISA|CARD)#[0-9a-f]{64}$/.test(ruleKey)) {
      throw new Error(`${index + 2}行目の照合番号が正しくありません。`);
    }
    if (!ruleKey && (!merchant || !source)) throw new Error(`${index + 2}行目は利用先または支払い元が空です。`);
    const normalizedSource = ruleKey ? ruleKey.split("#")[0] : personalRuleSource(source);
    if (ruleKey && normalizedSource !== personalRuleSource(source)) throw new Error(`${index + 2}行目の支払い元が照合番号と一致しません。`);
    return { rule_key: ruleKey, merchant, source: normalizedSource, category };
  }).filter(Boolean);
  return rules;
}

async function normalizeImportedCategoryRules(rules) {
  return (await Promise.all(rules.map(async (rule) => {
    if (rule.rule_key) return { rule_key: rule.rule_key, source: rule.source, category: rule.category };
    return createPersonalCategoryRule(rule.source, rule.merchant, rule.category);
  }))).filter(Boolean);
}

function renderCategoryReview() {
  const filter = document.querySelector("#category-review-filter")?.value || "other";
  const visibleRows = filter === "other" ? categoryReviewRows.filter((row) => row.category === "その他") : categoryReviewRows;
  const container = document.querySelector("#category-review-rows");
  container.replaceChildren();
  visibleRows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "category-review-row";
    item.dataset.key = row.key;
    const merchant = document.createElement("strong");
    merchant.textContent = row.merchant;
    const source = document.createElement("span");
    source.textContent = row.source;
    const count = document.createElement("span");
    count.textContent = `${number.format(row.count)}件`;
    const select = document.createElement("select");
    select.className = "category-review-select";
    select.dataset.key = row.key;
    select.setAttribute("aria-label", `${row.merchant}の使いみち`);
    selectableCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.append(option);
    });
    select.value = categoryReviewDraft.get(row.key) || row.category;
    item.append(merchant, source, count, select);
    container.append(item);
  });
  document.querySelector("#category-review-count").textContent = visibleRows.length
    ? `${number.format(visibleRows.length)}件の利用先`
    : filter === "other" ? "「その他」はありません" : "見直せる利用先はありません";
  document.querySelector("#save-category-review").disabled = !visibleRows.length;
}

function openCategoryReview() {
  if (!localAnalysis?.transactions?.length) return;
  categoryReviewRows = buildCategoryReviewRows(localAnalysis);
  categoryReviewDraft = new Map(categoryReviewRows.map((row) => [row.key, row.category]));
  document.querySelector("#category-review-filter").value = categoryReviewRows.some((row) => row.category === "その他") ? "other" : "all";
  document.querySelector("#category-review-message").textContent = spendOpsAuth?.getSessionUser()
    ? "変更を保存すると、このアカウントでは次回から同じ利用先へ自動で反映します。"
    : "このアカウントだけに学習するには、先にログインしてください。";
  renderCategoryReview();
  const dialog = document.querySelector("#category-review-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeCategoryReview() {
  const dialog = document.querySelector("#category-review-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function saveCategoryReview() {
  const message = document.querySelector("#category-review-message");
  if (!spendOpsAuth?.getSessionUser()) {
    message.textContent = "このアカウントだけに学習するにはログインしてください。";
    message.className = "category-review-message is-error";
    return;
  }
  const changes = categoryReviewRows.filter((row) => categoryReviewDraft.get(row.key) !== row.category);
  if (!changes.length) {
    message.textContent = "変更された使いみちはありません。";
    message.className = "category-review-message";
    return;
  }
  try {
    message.textContent = "このアカウントへ使いみちを学習しています…";
    message.className = "category-review-message";
    const rules = (await Promise.all(changes.map((row) => (
      createPersonalCategoryRule(row.source, row.merchant, categoryReviewDraft.get(row.key))
    )))).filter(Boolean);
    let changedTransactions = 0;
    changes.forEach((row) => {
      changedTransactions += applyManualCategory(localAnalysis, row.source, row.merchant, categoryReviewDraft.get(row.key));
    });
    await saveCategoryRulesToCloud(rules);
    const saved = await saveAnalysisToCloud(localAnalysis);
    categoryReviewRows = buildCategoryReviewRows(localAnalysis);
    categoryReviewDraft = new Map(categoryReviewRows.map((row) => [row.key, row.category]));
    renderLocalMonth(false);
    renderCategoryReview();
    message.textContent = `${number.format(rules.length)}件の利用先をこのアカウントへ学習し、${number.format(changedTransactions)}件の明細へ反映しました。次回から自動で分類します。`;
    message.className = "category-review-message is-success";
    document.querySelector("#upload-message").textContent = `${number.format(saved.saved_transaction_count)}件の明細と使いみちの学習内容を保存しました。`;
    document.querySelector("#upload-message").className = "upload-message is-success";
    setConnection("is-online", "分類を学習済み");
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "使いみちを保存できませんでした。";
    message.className = "category-review-message is-error";
  }
}

async function downloadCategoryRuleBackup() {
  const message = document.querySelector("#category-review-message");
  try {
    if (!spendOpsAuth?.getSessionUser()) throw new Error("学習内容を書き出すにはログインしてください。");
    await loadCategoryRules();
    const csv = await buildCategoryRuleBackupCsv(localAnalysis);
    if (!csv) throw new Error("書き出せる学習内容はまだありません。");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = browserWindow.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spendops_personal_categories_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    browserWindow.URL.revokeObjectURL(url);
    message.textContent = "学習内容の控えを書き出しました。再構築後に一度読み戻せば、同じ設定を使えます。";
    message.className = "category-review-message is-success";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "学習内容を書き出せませんでした。";
    message.className = "category-review-message is-error";
  }
}

async function handleCategoryRuleBackupFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const message = document.querySelector("#category-review-message");
  try {
    if (!spendOpsAuth?.getSessionUser()) throw new Error("学習内容を読み戻すにはログインしてください。");
    message.textContent = "学習内容を読み戻しています…";
    message.className = "category-review-message";
    const decoded = decodeCsv(await file.arrayBuffer());
    const rules = await normalizeImportedCategoryRules(parseCategoryRuleBackupCsv(decoded.text));
    if (!rules.length) throw new Error("読み戻せる学習内容がありません。");
    const savedRules = await saveCategoryRulesToCloud(rules);
    const applied = await applyPersonalCategoryRules(localAnalysis);
    if (applied.changedTransactions) await saveAnalysisToCloud(localAnalysis);
    if (localAnalysis) {
      categoryReviewRows = buildCategoryReviewRows(localAnalysis);
      categoryReviewDraft = new Map(categoryReviewRows.map((row) => [row.key, row.category]));
      renderLocalMonth(false);
      renderCategoryReview();
    }
    message.textContent = `${number.format(savedRules.saved_rule_count)}件の学習内容をこのアカウントへ読み戻しました。${applied.changedTransactions ? `${number.format(applied.changedTransactions)}件の明細にも反映しました。` : "次回の読み込みから自動で反映します。"}`;
    message.className = "category-review-message is-success";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "学習内容を読み戻せませんでした。";
    message.className = "category-review-message is-error";
  } finally {
    input.value = "";
  }
}

function buildTrendScale(trend, intervals = 4) {
  const highestAmount = Math.max(...trend.map((item) => Number(item.amount) || 0), 0);
  if (highestAmount <= 0) return { maximum: 1, ticks: [0] };
  const magnitude = 10 ** Math.floor(Math.log10(highestAmount));
  const normalized = highestAmount / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const maximum = niceNormalized * magnitude;
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => Math.round(maximum * (1 - index / intervals)));
  return { maximum, ticks };
}

function formatTrendAxisAmount(value) {
  const amount = Number(value) || 0;
  if (amount < 10000) return `${number.format(amount)}円`;
  if (amount < 100000000) {
    const tenThousands = amount / 10000;
    return `${Number.isInteger(tenThousands) ? number.format(tenThousands) : tenThousands.toFixed(1)}万円`;
  }
  const hundredMillions = amount / 100000000;
  return `${Number.isInteger(hundredMillions) ? number.format(hundredMillions) : hundredMillions.toFixed(1)}億円`;
}

function renderTrend(trend, selectedMonth) {
  const container = document.querySelector("#monthly-trend");
  container.replaceChildren();
  const values = trend.slice(-12);
  const scale = buildTrendScale(values);
  const scaleElement = document.createElement("div");
  scaleElement.className = "trend-scale";
  scaleElement.setAttribute("aria-hidden", "true");
  scale.ticks.forEach((tick) => {
    const label = document.createElement("span");
    label.textContent = formatTrendAxisAmount(tick);
    scaleElement.append(label);
  });
  const plot = document.createElement("div");
  plot.className = "trend-plot";

  values.forEach((item) => {
    const element = document.createElement("div");
    element.className = "trend-item";
    if (item.month === selectedMonth) element.classList.add("is-selected");
    if (item.partial) element.classList.add("is-partial");
    element.title = `${formatMonth(item.month)} ${yen.format(item.amount)} / ${number.format(item.count)}件${item.partial ? "（一部期間）" : ""}`;
    const height = Math.max(4, Math.round((item.amount / scale.maximum) * 100));
    element.innerHTML = `
      <div class="trend-bar-wrap"><i class="trend-bar" style="height:${height}%"></i></div>
      <span class="trend-label">${escapeHtml(formatCompactMonth(item.month))}</span>
    `;
    plot.append(element);
  });
  container.append(scaleElement, plot);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadDemoReport() {
  const button = document.querySelector("#run-demo");
  button.disabled = true;
  button.textContent = "分析中…";

  try {
    if (!apiBaseUrl) throw new Error("API URL is not configured");
    const response = await fetch(`${apiBaseUrl}/demo/report`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const report = normalizeDemoReport(await response.json());
    localAnalysis = null;
    localAnalysisOwnerId = null;
    analysisScope = "ALL";
    document.querySelector("#scope-control").hidden = true;
    setComparisonMode("group", false);
    setBreakdownMode("category", false);
    renderReport(report, "aws");
    setConnection("is-online", "お試し画面を表示中");
    setDataMenuOpen(false);
  } catch (_error) {
    fallbackReport.generated_at = new Date().toISOString();
    localAnalysis = null;
    localAnalysisOwnerId = null;
    analysisScope = "ALL";
    document.querySelector("#scope-control").hidden = true;
    setComparisonMode("group", false);
    setBreakdownMode("category", false);
    renderReport(fallbackReport, "fallback");
    setConnection("is-local", "お試し画面を表示中");
    setDataMenuOpen(false);
  } finally {
    button.disabled = false;
    button.textContent = "お試し画面をもう一度見る";
  }
}

function normalizeDemoReport(report) {
  return {
    ...report,
    trend: [{ month: report.month, amount: report.summary.total_expense, count: report.summary.transaction_count, partial: false }],
    comparison: {
      type: "group",
      label: "みんなの参考平均",
      value: report.summary.group_average,
      note: "使い方を試すための例です",
      status: "参考例との比較",
    },
    insight: `注目：これは使い方を試すための例です。\n見方：実際の利用者の平均ではありません。\n次の一歩：自分の明細を読み込むと、自分向けの結果に切り替わります。`,
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function decodeCsv(buffer) {
  for (const encoding of ["utf-8", "shift_jis"]) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
      return { text: text.replace(/^\uFEFF/, ""), encoding };
    } catch (_error) {
      // 次の文字コードを試す。
    }
  }
  throw new Error("ファイルの形式を読み取れませんでした。PayPay、JCB、VISAから出力した利用明細を選んでください。");
}

function normalizeHeader(value) {
  return String(value).replace(/[\s　（）()]/g, "").toLowerCase();
}

function findColumn(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const target = normalizeHeader(candidate);
    const index = normalized.findIndex((header) => header === target || header.includes(target));
    if (index >= 0) return index;
  }
  return -1;
}

function parseAmount(value) {
  const normalized = String(value || "")
    .replace(/[¥￥,円\s]/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/^\((.+)\)$/, "-$1");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function normalizeDate(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[年月]/g, "-")
    .replace(/日/g, "")
    .replace(/[/.]/g, "-");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(normalized);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function classifyCategory(text, providedCategory) {
  const provided = String(providedCategory || "").trim();
  const isSummaryLabel = /^≪.*≫$/.test(provided) || /ショッピング取組|国内.?海外/.test(provided);
  if (!isSummaryLabel && cloudCategories.has(provided)) return provided;
  const providedAliases = [
    ["食費", /食料|飲食|外食|グルメ|スーパー|コンビニ|デリバリー/],
    ["交通費", /交通|鉄道|バス|タクシ|ガソリン|駐車|高速|航空/],
    ["日用品", /日用品|生活用品|生活雑貨|ドラッグ|ホームセンター/],
    ["娯楽", /娯楽|エンタメ|趣味|書籍|動画|音楽|ゲーム/],
    ["光熱費", /光熱|電気|ガス|水道/],
    ["通信費", /通信|携帯|インターネット/],
    ["医療費", /医療|病院|診療|治療|薬代/],
    ["衣服費", /衣服|衣料|アパレル|ファッション/],
    ["住居費", /住居|家賃|住宅/],
  ];
  if (!isSummaryLabel) {
    const normalizedProvided = providedAliases.find(([, pattern]) => pattern.test(provided));
    if (normalizedProvided) return normalizedProvided[0];
  }

  const target = `${provided} ${String(text || "")}`.toLowerCase();
  if (/\bamazon\b|アマゾン|\bapple(?:\.com\/bill)?\b|\bgoogle\b|楽天市場/.test(target)) return "ネットでの購入";
  if (/電車|鉄道|バス|タクシ|交通|suica|pasmo|\bjr\b|metro|高速|駐車場|パーキング|ガソリン|eneos|エネオス|出光|apollostation|コスモ石油|\bjal\b|\bana\b/.test(target)) return "交通費";
  if (/スーパー|コンビニ|飲食|レストラン|食品|カフェ|弁当|セブン|ローソン|ファミリ|ミニストップ|デイリー|イオン|西友|イトーヨーカ|マルエツ|成城石井|業務スーパー|コストコ|マクドナルド|スターバックス|すき家|吉野家|ガスト|サイゼリヤ|スシロー|くら寿司|モスバーガー|ケンタッキー|出前館|uber.?eats/.test(target)) return "食費";
  if (/薬局|ドラッグ|日用品|ホームセンター|マツモトキヨシ|マツキヨ|ウエルシア|スギ薬局|無印|ヨドバシ|ビックカメラ|ニトリ|カインズ|コーナン|ドン.?キホーテ|ダイソー|セリア|ロフト|東急ハンズ/.test(target)) return "日用品";
  if (/映画|ゲーム|娯楽|書店|音楽|netflix|spotify|youtube|toho|hulu|disney|nintendo|任天堂|steam|playstation|カラオケ/.test(target)) return "娯楽";
  if (/電力|電気|ガス|水道|東京電力|関西電力|東京ガス/.test(target)) return "光熱費";
  if (/通信|docomo|ドコモ|softbank|ソフトバンク|楽天モバイル|\bau\b|\buq\b|\bntt\b|kddi|ahamo|povo|linemo|iijmio/.test(target)) return "通信費";
  if (/病院|医院|クリニック|歯科|眼科|皮膚科|内科|調剤/.test(target)) return "医療費";
  if (/ユニクロ|\bgu\b|衣料|アパレル|zozo|しまむら|zara|h&m|abc.?mart|洋服の青山/.test(target)) return "衣服費";
  if (/家賃|管理費|住宅ローン|マンション|アパート|\bur\b/.test(target)) return "住居費";
  return "その他";
}

function detectSource(headers) {
  const joined = headers.map(normalizeHeader).join("|");
  if (joined.includes("取引番号") || joined.includes("出金金額")) return "PayPay";
  if (joined.includes("ご利用先") || joined.includes("お支払い金額")) return "JCB";
  if (joined.includes("利用店名") || joined.includes("visa")) return "VISA";
  return "CSV";
}

function parseCompactDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value || "");
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function parseFilePeriod(fileName) {
  const match = /(\d{8})-(\d{8})/.exec(fileName || "");
  if (!match) return null;
  return { start: parseCompactDate(match[1]), end: parseCompactDate(match[2]) };
}

function daysInMonth(month) {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

function previousMonth(month) {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function detectPartialMonths(months, period) {
  const partial = new Set();
  if (period?.start) {
    const month = period.start.slice(0, 7);
    if (Number(period.start.slice(8, 10)) > 1) partial.add(month);
  }
  if (period?.end) {
    const month = period.end.slice(0, 7);
    if (Number(period.end.slice(8, 10)) < daysInMonth(month)) partial.add(month);
  } else {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (months.includes(currentMonth)) partial.add(currentMonth);
  }
  return partial;
}

function buildLocalAnalysis(rows, fileName) {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    const hasDate = headers.some((value) => value.includes("取引日") || value.includes("利用日") || value === "date");
    const hasAmount = headers.some((value) => value.includes("金額") || value === "amount");
    return hasDate && hasAmount;
  });
  if (headerIndex < 0) return buildFixedColumnAnalysis(rows, fileName);

  const headers = rows[headerIndex];
  const dateIndex = findColumn(headers, ["取引日", "ご利用日", "利用日", "date"]);
  const amountIndex = findColumn(headers, ["出金金額", "ご利用金額", "お支払い金額", "利用金額", "支払金額", "amount"]);
  const incomeIndex = findColumn(headers, ["入金金額", "income"]);
  const categoryIndex = findColumn(headers, ["カテゴリ", "category"]);
  const merchantIndex = findColumn(headers, ["商品名", "品名", "取引先", "取引内容", "ご利用先", "利用店名", "摘要", "merchant"]);
  const contentIndex = findColumn(headers, ["取引内容", "摘要", "備考"]);
  const transactionIdIndex = findColumn(headers, ["取引番号", "取引ID", "transactionid"]);
  const sourceIndex = findColumn(headers, ["source", "支払方法", "取引方法"]);
  if (dateIndex < 0 || amountIndex < 0) throw new Error("対応する日付・金額列がありません。");

  const detectedSource = detectSource(headers);
  let invalidRows = 0;
  let ignoredRows = 0;
  let duplicateCandidates = 0;
  const transactions = [];
  const seenRows = new Set();

  for (const row of rows.slice(headerIndex + 1)) {
    const date = normalizeDate(row[dateIndex]);
    const amount = parseAmount(row[amountIndex]);
    const income = incomeIndex >= 0 ? parseAmount(row[incomeIndex]) : null;
    const rawAmount = String(row[amountIndex] || "").trim();
    if (!date || amount === null || amount <= 0) {
      if ((income !== null && income > 0) || amount !== null || !rawAmount) ignoredRows += 1;
      else invalidRows += 1;
      continue;
    }
    const merchant = merchantIndex >= 0 ? String(row[merchantIndex] || "") : "";
    const content = contentIndex >= 0 ? String(row[contentIndex] || "") : "";
    const transactionId = transactionIdIndex >= 0 ? String(row[transactionIdIndex] || "") : "";
    const rowKey = [date, amount, merchant, content, transactionId].join("|");
    if (seenRows.has(rowKey)) duplicateCandidates += 1;
    seenRows.add(rowKey);
    const source = detectedSource === "CSV" && sourceIndex >= 0 && row[sourceIndex]
      ? String(row[sourceIndex]).slice(0, 20)
      : detectedSource;
    transactions.push({
      date,
      amount,
      merchant: merchant.trim() || content.trim() || "詳細なし",
      category: classifyCategory(merchant, categoryIndex >= 0 ? row[categoryIndex] : ""),
      source,
      dedupKey: rowKey,
    });
  }

  return finalizeLocalAnalysis(transactions, fileName, detectedSource, {
    ignoredRows,
    invalidRows,
    duplicateCandidates,
  });
}

function buildFixedColumnAnalysis(rows, fileName) {
  const transactions = [];
  const seenRows = new Set();
  let ignoredRows = 0;
  let invalidRows = 0;
  let duplicateCandidates = 0;

  rows.forEach((row) => {
    const date = normalizeDate(row[0]);
    const amount = parseAmount(row[2]);
    if (!date) {
      ignoredRows += 1;
      return;
    }
    if (amount === null || amount <= 0) {
      invalidRows += 1;
      return;
    }
    const merchant = String(row[1] || "");
    const rowKey = [date, amount, merchant, "VISA"].join("|");
    if (seenRows.has(rowKey)) duplicateCandidates += 1;
    seenRows.add(rowKey);
    transactions.push({
      date,
      amount,
      merchant: merchant.trim() || "詳細なし",
      category: classifyCategory(merchant, ""),
      source: "VISA",
      dedupKey: rowKey,
    });
  });

  if (transactions.length < 2) throw new Error("日付と金額のヘッダーを見つけられませんでした。");
  return finalizeLocalAnalysis(transactions, fileName, "VISA", {
    ignoredRows,
    invalidRows,
    duplicateCandidates,
  });
}

function finalizeLocalAnalysis(transactions, fileName, detectedSource, validation) {
  if (!transactions.length) throw new Error("集計可能な明細がありませんでした。");
  const months = [...new Set(transactions.map((item) => item.date.slice(0, 7)))].sort();
  const filePeriod = parseFilePeriod(fileName);
  const observedPeriod = {
    start: transactions.map((item) => item.date).sort()[0],
    end: transactions.map((item) => item.date).sort().at(-1),
  };
  const period = filePeriod || observedPeriod;
  const partialMonths = detectPartialMonths(months, filePeriod);
  const detectedScope = paymentScopeForSource(detectedSource);
  const defaultMonth = months.filter((month) => !partialMonths.has(month)).at(-1) || months.at(-1);

  return {
    fileName,
    source: detectedSource,
    transactions,
    months,
    filePeriod,
    period,
    partialMonths,
    partialMonthsByScope: { [detectedScope]: new Set(partialMonths) },
    defaultMonth,
    validation: {
      acceptedRows: transactions.length,
      ignoredRows: validation.ignoredRows,
      invalidRows: validation.invalidRows,
      duplicateCandidates: validation.duplicateCandidates,
    },
  };
}

function buildStoredTransactionAnalysis(transactions, reports = []) {
  if (!Array.isArray(transactions) || !transactions.length) return null;
  const normalizedTransactions = transactions
    .map((transaction, index) => {
      const date = normalizeDate(transaction.date);
      const amount = Number(transaction.amount);
      if (!date || !Number.isFinite(amount) || amount <= 0) return null;
      const source = String(transaction.source || "CARD").slice(0, 20);
      const merchant = String(transaction.merchant || "詳細なし").trim().slice(0, 160) || "詳細なし";
      return {
        date,
        amount: Math.round(amount),
        merchant,
        category: cloudCategories.has(transaction.category) ? transaction.category : "その他",
        source,
        dedupKey: [date, amount, merchant, source, index].join("|"),
      };
    })
    .filter(Boolean);
  if (!normalizedTransactions.length) return null;

  const sources = [...new Set(normalizedTransactions.map((transaction) => transaction.source))];
  const analysis = finalizeLocalAnalysis(
    normalizedTransactions,
    "保存済み明細",
    sources.length === 1 ? sources[0] : "MULTI",
    { ignoredRows: 0, invalidRows: 0, duplicateCandidates: 0 },
  );
  const partialMonthsByScope = {};
  reports.filter((report) => report.partial).forEach((report) => {
    const scope = report.source_type;
    const months = partialMonthsByScope[scope] || new Set();
    months.add(report.month);
    partialMonthsByScope[scope] = months;
  });
  analysis.partialMonthsByScope = partialMonthsByScope;
  analysis.partialMonths = new Set(Object.values(partialMonthsByScope).flatMap((months) => [...months]));
  analysis.defaultMonth = getDefaultMonth(analysis, getAvailableScopes(analysis).includes("ALL") ? "ALL" : getAvailableScopes(analysis)[0]);
  analysis.origin = "stored";
  return analysis;
}

function paymentScopeForSource(source) {
  const normalized = String(source || "").toUpperCase();
  if (normalized.includes("PAYPAY")) return "PAYPAY";
  if (/JCB|VISA|MASTER|AMEX|CARD|カード/.test(normalized)) return "CARD";
  return "ALL";
}

function transactionMatchesScope(transaction, scope) {
  return !scope || scope === "ALL" || paymentScopeForSource(transaction.source) === scope;
}

function getScopedTransactions(analysis, scope) {
  return analysis.transactions.filter((transaction) => transactionMatchesScope(transaction, scope));
}

function getScopedMonths(analysis, scope) {
  return [...new Set(getScopedTransactions(analysis, scope).map((item) => item.date.slice(0, 7)))].sort();
}

function getPartialMonthsForScope(analysis, scope) {
  const scoped = analysis.partialMonthsByScope || null;
  if (!scoped) return analysis.partialMonths || new Set();
  if (scope && scope !== "ALL") return scoped[scope] || new Set();
  const partialMonths = new Set(Object.values(scoped).flatMap((months) => [...months]));
  const availableScopes = ["PAYPAY", "CARD"].filter((value) => (
    analysis.transactions.some((transaction) => paymentScopeForSource(transaction.source) === value)
  ));
  if (availableScopes.length > 1) {
    getScopedMonths(analysis, "ALL").forEach((month) => {
      const hasEverySource = availableScopes.every((value) => (
        analysis.transactions.some((transaction) => (
          transaction.date.startsWith(month) && paymentScopeForSource(transaction.source) === value
        ))
      ));
      if (!hasEverySource) partialMonths.add(month);
    });
  }
  return partialMonths;
}

function getDefaultMonth(analysis, scope) {
  const months = getScopedMonths(analysis, scope);
  const partialMonths = getPartialMonthsForScope(analysis, scope);
  return months.filter((month) => !partialMonths.has(month)).at(-1) || months.at(-1) || null;
}

function mergeLocalAnalyses(analyses) {
  if (analyses.length === 1) return analyses[0];
  const transactions = [];
  const seenRows = new Set();
  let crossFileDuplicates = 0;

  analyses.flatMap((analysis) => analysis.transactions).forEach((transaction) => {
    const key = `${transaction.source}|${transaction.dedupKey}`;
    if (seenRows.has(key)) {
      crossFileDuplicates += 1;
      return;
    }
    seenRows.add(key);
    transactions.push(transaction);
  });

  if (!transactions.length) throw new Error("集計可能な明細がありませんでした。");
  const dates = transactions.map((item) => item.date).sort();
  const months = [...new Set(transactions.map((item) => item.date.slice(0, 7)))].sort();
  const filePeriods = analyses.map((analysis) => analysis.filePeriod).filter(Boolean);
  const filePeriod = filePeriods.length
    ? {
        start: filePeriods.map((period) => period.start).sort()[0],
        end: filePeriods.map((period) => period.end).sort().at(-1),
      }
    : null;
  const partialMonthsByScope = {};
  analyses.forEach((analysis) => {
    const scopes = new Set(analysis.transactions.map((transaction) => paymentScopeForSource(transaction.source)));
    scopes.forEach((scope) => {
      const current = partialMonthsByScope[scope] || new Set();
      getPartialMonthsForScope(analysis, scope).forEach((month) => current.add(month));
      partialMonthsByScope[scope] = current;
    });
  });
  const partialMonths = new Set(Object.values(partialMonthsByScope).flatMap((values) => [...values]));
  const sources = [...new Set(transactions.map((item) => item.source))];

  return {
    fileName: `${analyses.length} files`,
    source: sources.length === 1 ? sources[0] : "MULTI",
    transactions,
    months,
    filePeriod,
    period: { start: dates[0], end: dates.at(-1) },
    partialMonths,
    partialMonthsByScope,
    defaultMonth: months.filter((month) => !partialMonths.has(month)).at(-1) || months.at(-1),
    validation: {
      acceptedRows: transactions.length,
      ignoredRows: analyses.reduce((sum, analysis) => sum + analysis.validation.ignoredRows, 0),
      invalidRows: analyses.reduce((sum, analysis) => sum + analysis.validation.invalidRows, 0),
      duplicateCandidates: analyses.reduce((sum, analysis) => sum + analysis.validation.duplicateCandidates, 0) + crossFileDuplicates,
    },
  };
}

function mergeIncrementalAnalysis(existingAnalysis, newAnalyses) {
  const analyses = [existingAnalysis, ...(newAnalyses || [])].filter(Boolean);
  if (!analyses.length) throw new Error("追加できる明細がありません。");
  return mergeLocalAnalyses(analyses);
}

function buildLocalReport(analysis, month, mode = comparisonMode, scope = analysisScope || paymentScopeForSource(analysis.source)) {
  if (month === ALL_PERIOD) return buildAllPeriodLocalReport(analysis, scope);
  if (month === YEAR_PERIOD) return buildAllPeriodLocalReport(analysis, scope, "year");
  const scopedTransactions = getScopedTransactions(analysis, scope);
  const scopedPartialMonths = getPartialMonthsForScope(analysis, scope);
  const scopedMonths = [...new Set(scopedTransactions.map((item) => item.date.slice(0, 7)))].sort();
  if (!scopedMonths.includes(month)) throw new Error("選択した月の明細がありません。");
  const target = scopedTransactions.filter((item) => item.date.startsWith(month));
  const monthSeries = scopedMonths.map((value) => {
    const items = scopedTransactions.filter((item) => item.date.startsWith(value));
    return {
      month: value,
      amount: items.reduce((sum, item) => sum + item.amount, 0),
      count: items.length,
      partial: scopedPartialMonths.has(value),
    };
  });
  const totalExpense = target.reduce((sum, item) => sum + item.amount, 0);
  const previous = monthSeries.find((item) => item.month === previousMonth(month));
  const personalMonths = monthSeries
    .filter((item) => item.month < month && !item.partial && item.amount > 0)
    .slice(-12);
  const personalAverage = personalMonths.length
    ? Math.round(personalMonths.reduce((sum, item) => sum + item.amount, 0) / personalMonths.length)
    : null;
  const groupBaseline = getGroupBaseline(scope, month);
  const activeComparison = mode === "group"
    ? groupBaseline
    : {
        type: "personal",
        label: "自分の過去の月平均",
        value: personalAverage,
        note: personalMonths.length ? `過去${personalMonths.length}か月の平均` : "過去月データが不足",
        status: personalMonths.length ? `自分の過去${personalMonths.length}か月と比較` : "過去の月がまだ不足",
        categoryAverages: buildPersonalCategoryAverages(scopedTransactions, personalMonths),
      };
  const difference = Number.isFinite(Number(activeComparison.value)) ? totalExpense - activeComparison.value : null;
  const differenceRate = activeComparison.value ? Math.round((difference / activeComparison.value) * 1000) / 10 : null;
  const categories = aggregate(target, "category", totalExpense, activeComparison.categoryAverages || {});
  const sources = aggregateSources(target);
  const monthOverMonth = previous?.amount
    ? Math.round(((totalExpense - previous.amount) / previous.amount) * 1000) / 10
    : null;
  const insight = buildAnalysisInsight({
    scope,
    totalExpense,
    transactionCount: target.length,
    comparison: activeComparison,
    difference,
    differenceRate,
    categories,
    sources,
    previousTotal: previous?.amount ?? null,
    monthOverMonth,
    partial: scopedPartialMonths.has(month),
  });

  return {
    dataset: "local-csv",
    month,
    generated_at: new Date().toISOString(),
    summary: {
      total_expense: totalExpense,
      group_average: activeComparison.type === "group" ? activeComparison.value : null,
      difference,
      difference_rate: differenceRate,
      transaction_count: target.length,
      previous_total: previous?.amount ?? null,
      month_over_month: monthOverMonth,
    },
    categories,
    sources,
    trend: monthSeries,
    transactions: [...target]
      .sort((left, right) => right.date.localeCompare(left.date))
      .map(({ date, merchant, category, source, amount }) => ({ date, merchant, category, source, amount })),
    comparison: activeComparison,
    scope,
    insight,
    privacy: "選んだファイル自体は保存せず、ログイン中は支出を振り返るために必要な内容だけを保存します。",
  };
}

function buildAllPeriodLocalReport(analysis, scope = analysisScope || paymentScopeForSource(analysis.source), periodType = "all") {
  const allScopedTransactions = getScopedTransactions(analysis, scope);
  const scopedPartialMonths = getPartialMonthsForScope(analysis, scope);
  const allScopedMonths = getScopedMonths(analysis, scope);
  const scopedMonths = periodType === "year" ? allScopedMonths.slice(-12) : allScopedMonths;
  if (!scopedMonths.length) throw new Error("表示できる明細がありません。");
  const includedMonths = new Set(scopedMonths);
  const scopedTransactions = allScopedTransactions.filter((transaction) => includedMonths.has(transaction.date.slice(0, 7)));
  const monthSeries = scopedMonths.map((month) => {
    const items = scopedTransactions.filter((item) => item.date.startsWith(month));
    return {
      month,
      amount: items.reduce((sum, item) => sum + item.amount, 0),
      count: items.length,
      partial: scopedPartialMonths.has(month),
    };
  });
  const totalExpense = scopedTransactions.reduce((sum, item) => sum + item.amount, 0);
  const monthlyAverage = Math.round(totalExpense / scopedMonths.length);
  const categories = aggregate(scopedTransactions, "category", totalExpense);
  const sources = aggregateSources(scopedTransactions);
  const insight = buildPeriodInsight({
    totalExpense,
    transactionCount: scopedTransactions.length,
    monthSeries,
    categories,
  });

  return {
    dataset: "local-file",
    month: periodType === "year" ? YEAR_PERIOD : ALL_PERIOD,
    period_type: periodType,
    generated_at: new Date().toISOString(),
    summary: {
      total_expense: totalExpense,
      monthly_average: monthlyAverage,
      period_month_count: scopedMonths.length,
      period_start: scopedMonths[0],
      period_end: scopedMonths.at(-1),
      group_average: null,
      difference: null,
      difference_rate: null,
      transaction_count: scopedTransactions.length,
      previous_total: null,
      month_over_month: null,
    },
    categories,
    sources,
    trend: monthSeries,
    transactions: [...scopedTransactions]
      .sort((left, right) => right.date.localeCompare(left.date))
      .map(({ date, merchant, category, source, amount }) => ({ date, merchant, category, source, amount })),
    comparison: {
      type: "period",
      label: "1か月あたり",
      value: monthlyAverage,
      note: `${scopedMonths.length}か月の平均`,
      status: periodType === "year" ? "直近1年間をまとめて表示" : `${scopedMonths.length}か月をまとめて表示`,
      categoryAverages: {},
    },
    scope,
    insight,
    privacy: "選んだファイル自体は保存せず、必要な支出の内容だけを扱います。",
  };
}

function paymentScopeLabel(scope) {
  if (scope === "PAYPAY") return "PayPay";
  if (scope === "CARD") return "クレジットカード";
  return "すべての支出";
}

function getGroupBaseline(source, month) {
  const sourceKey = paymentScopeForSource(source);
  const sourceData = comparisonData?.sources?.[sourceKey] || comparisonData?.sources?.ALL;
  const realComparison = cloudComparisons.get(`${month}#${sourceKey}`);
  const sourceLabel = sourceData?.label || paymentScopeLabel(sourceKey);
  if (realComparison?.eligible && Number.isFinite(Number(realComparison.average_total))) {
    return {
      type: "group",
      label: "同じ条件のみんなの平均",
      value: Number(realComparison.average_total),
      note: `${Number(realComparison.participant_count)}人分を、個人が分からない形でまとめています`,
      status: `みんなとの比較・${Number(realComparison.participant_count)}人`,
      categoryAverages: realComparison.category_averages || {},
    };
  }
  if (sourceKey === "ALL") {
    const participantCount = Number(realComparison?.participant_count || 0);
    const minimumParticipants = Number(realComparison?.minimum_participants || 5);
    return {
      type: "group",
      label: "同じ条件のみんなの平均",
      value: null,
      note: `比べるにはあと${Math.max(minimumParticipants - participantCount, 0)}人分必要です`,
      status: "みんなとの比較",
      categoryAverages: {},
    };
  }
  const monthData = sourceData?.months?.[month];
  const value = monthData?.average_total ?? sourceData?.monthly_average ?? null;
  const participantCount = Number(monthData?.participant_count ?? sourceData?.participant_count ?? 0);
  const eligible = Boolean(sourceData?.eligible && Number.isFinite(Number(value)));
  return {
    type: "group",
    label: `${sourceLabel}の参考平均`,
    value: eligible ? Number(value) : null,
    note: eligible ? "参考データ（実際の利用者平均ではありません）" : "比べるための記録を準備中",
    status: realComparison
      ? "みんなとの比較"
      : eligible ? `参考例と比較・${participantCount}人分` : "みんなとの比較",
    categoryAverages: eligible ? monthData?.category_averages || sourceData?.category_averages || {} : {},
  };
}

function buildPersonalCategoryAverages(transactions, personalMonths) {
  if (!personalMonths.length) return {};
  const totals = new Map();
  const eligibleMonths = new Set(personalMonths.map((item) => item.month));
  transactions
    .filter((item) => eligibleMonths.has(item.date.slice(0, 7)))
    .forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + item.amount));
  return Object.fromEntries([...totals.entries()].map(([name, total]) => [name, Math.round(total / personalMonths.length)]));
}

function aggregate(transactions, key, total, comparisonAverages = {}) {
  const totals = new Map();
  transactions.forEach((item) => totals.set(item[key], (totals.get(item[key]) || 0) + item.amount));
  return [...totals.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      ratio: total ? Math.round((amount / total) * 1000) / 10 : 0,
      group_average: Number.isFinite(Number(comparisonAverages[name])) ? Number(comparisonAverages[name]) : null,
      difference: Number.isFinite(Number(comparisonAverages[name])) ? amount - Number(comparisonAverages[name]) : null,
    }))
    .sort((left, right) => right.amount - left.amount);
}

function aggregateSources(transactions) {
  const values = new Map();
  transactions.forEach((item) => {
    const current = values.get(item.source) || { amount: 0, count: 0 };
    current.amount += item.amount;
    current.count += 1;
    values.set(item.source, current);
  });
  return [...values.entries()].map(([name, value]) => ({ name, ...value }));
}

function buildAnalysisUploadPayload(analysis) {
  const summaries = [];
  const transactionOccurrences = new Map();
  const transactions = analysis.transactions.map((transaction) => {
    const normalizedSource = String(transaction.source || "").toUpperCase();
    const source = normalizedSource.includes("PAYPAY")
      ? "PAYPAY"
      : normalizedSource.includes("JCB")
        ? "JCB"
        : normalizedSource.includes("VISA")
          ? "VISA"
          : "CARD";
    const merchant = String(transaction.merchant || "詳細なし").trim().slice(0, 160) || "詳細なし";
    const category = cloudCategories.has(transaction.category) ? transaction.category : "その他";
    const occurrenceKey = `${transaction.date}|${transaction.amount}|${merchant}|${source}`;
    const occurrence = transactionOccurrences.get(occurrenceKey) || 0;
    transactionOccurrences.set(occurrenceKey, occurrence + 1);
    return {
      date: transaction.date,
      amount: transaction.amount,
      merchant,
      category,
      source,
      occurrence,
    };
  });
  getAvailableScopes(analysis)
    .filter((scope) => scope === "PAYPAY" || scope === "CARD")
    .forEach((scope) => {
      getScopedMonths(analysis, scope).forEach((month) => {
        const transactions = getScopedTransactions(analysis, scope).filter((item) => item.date.startsWith(month));
        const categories = {};
        const paymentMethods = {};
        transactions.forEach((transaction) => {
          const category = cloudCategories.has(transaction.category) ? transaction.category : "その他";
          const paymentName = scope === "PAYPAY"
            ? "PayPay"
            : /jcb/i.test(transaction.source) ? "JCB" : /visa/i.test(transaction.source) ? "VISA" : "カード";
          categories[category] = (categories[category] || 0) + transaction.amount;
          const payment = paymentMethods[paymentName] || { amount: 0, count: 0 };
          payment.amount += transaction.amount;
          payment.count += 1;
          paymentMethods[paymentName] = payment;
        });
        summaries.push({
          month,
          source_type: scope,
          total_expense: transactions.reduce((sum, item) => sum + item.amount, 0),
          transaction_count: transactions.length,
          categories,
          payment_methods: paymentMethods,
          partial: getPartialMonthsForScope(analysis, scope).has(month),
        });
      });
    });

  return {
    schema_version: 2,
    transactions,
    summaries,
    validation: {
      accepted_count: analysis.validation.acceptedRows,
      ignored_count: analysis.validation.ignoredRows,
      invalid_count: analysis.validation.invalidRows,
    },
  };
}

async function saveAnalysisToCloud(analysis) {
  if (!spendOpsAuth?.getSessionUser()) return null;
  const payload = buildAnalysisUploadPayload(analysis);
  if (!payload.summaries.length) throw new Error("保存できる月ごとの結果がありません。");
  const response = await spendOpsAuth.authenticatedFetch("/imports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "分析結果を保存できませんでした。");
  cloudComparisons.clear();
  return result;
}

async function refreshCloudComparison(month, scope, force = false) {
  if (!spendOpsAuth?.getSessionUser() || !month || !["PAYPAY", "CARD", "ALL"].includes(scope)) return;
  const key = `${month}#${scope}`;
  if ((!force && cloudComparisons.has(key)) || cloudComparisonRequests.has(key)) return;
  cloudComparisonRequests.add(key);
  try {
    const response = await spendOpsAuth.authenticatedFetch(`/reports/${encodeURIComponent(month)}?source=${encodeURIComponent(scope)}`);
    if (!response.ok) return;
    const result = await response.json();
    if (result?.comparison) cloudComparisons.set(key, result.comparison);
  } catch (_error) {
    return;
  } finally {
    cloudComparisonRequests.delete(key);
  }
  if (currentReport?.month === month && currentReport?.scope === scope) renderLocalMonth(false);
}

function getStoredAvailableScopes(reports = storedAnalysisData || []) {
  const scopes = new Set(reports.map((report) => report.source_type));
  const available = ["PAYPAY", "CARD"].filter((scope) => scopes.has(scope));
  return available.length > 1 ? ["ALL", ...available] : available;
}

function getStoredMonths(scope, reports = storedAnalysisData || []) {
  return [...new Set(getStoredReportsForScope(scope, reports).map((report) => report.month))].sort();
}

function combineStoredMonthlyReports(reports) {
  const combined = new Map();
  const availableSources = new Set(
    reports.filter((report) => ["PAYPAY", "CARD"].includes(report.source_type)).map((report) => report.source_type),
  );
  reports
    .filter((report) => ["PAYPAY", "CARD"].includes(report.source_type))
    .forEach((report) => {
      const target = combined.get(report.month) || {
        month: report.month,
        source_type: "ALL",
        total_expense: 0,
        transaction_count: 0,
        categories: {},
        payment_methods: {},
        partial: false,
        updated_at: null,
        included_sources: new Set(),
      };
      target.total_expense += Number(report.total_expense || 0);
      target.transaction_count += Number(report.transaction_count || 0);
      Object.entries(report.categories || {}).forEach(([name, amount]) => {
        target.categories[name] = (target.categories[name] || 0) + Number(amount);
      });
      Object.entries(report.payment_methods || {}).forEach(([name, value]) => {
        const payment = target.payment_methods[name] || { amount: 0, count: 0 };
        payment.amount += Number(value.amount || 0);
        payment.count += Number(value.count || 0);
        target.payment_methods[name] = payment;
      });
      target.partial ||= Boolean(report.partial);
      target.included_sources.add(report.source_type);
      if (!target.updated_at || String(report.updated_at || "") > target.updated_at) target.updated_at = report.updated_at;
      combined.set(report.month, target);
    });
  return [...combined.values()]
    .map((report) => {
      const incompleteSources = [...availableSources].some((source) => !report.included_sources.has(source));
      const { included_sources: _includedSources, ...publicReport } = report;
      return { ...publicReport, partial: publicReport.partial || incompleteSources };
    })
    .sort((left, right) => left.month.localeCompare(right.month));
}

function getStoredReportsForScope(scope, reports = storedAnalysisData || []) {
  if (scope === "ALL") return combineStoredMonthlyReports(reports);
  return reports.filter((report) => report.source_type === scope);
}

function buildStoredReport(reports, month, mode = comparisonMode, scope = analysisScope) {
  if (month === ALL_PERIOD) return buildAllPeriodStoredReport(reports, scope);
  if (month === YEAR_PERIOD) return buildAllPeriodStoredReport(reports, scope, "year");
  const scopedReports = getStoredReportsForScope(scope, reports)
    .sort((left, right) => left.month.localeCompare(right.month));
  const target = scopedReports.find((report) => report.month === month);
  if (!target) throw new Error("選択した月の保存済み分析がありません。");
  const previous = scopedReports.find((report) => report.month === previousMonth(month));
  const personalReports = scopedReports
    .filter((report) => report.month < month && !report.partial && report.total_expense > 0)
    .slice(-12);
  const personalAverage = personalReports.length
    ? Math.round(personalReports.reduce((sum, report) => sum + report.total_expense, 0) / personalReports.length)
    : null;
  const personalCategoryAverages = {};
  personalReports.forEach((report) => {
    Object.entries(report.categories || {}).forEach(([name, amount]) => {
      personalCategoryAverages[name] = (personalCategoryAverages[name] || 0) + Number(amount);
    });
  });
  Object.keys(personalCategoryAverages).forEach((name) => {
    personalCategoryAverages[name] = Math.round(personalCategoryAverages[name] / personalReports.length);
  });

  const activeComparison = mode === "group"
    ? getGroupBaseline(scope, month)
    : {
        type: "personal",
        label: "自分の過去の月平均",
        value: personalAverage,
        note: personalReports.length ? `保存済み過去${personalReports.length}か月の平均` : "過去月データが不足",
        status: personalReports.length ? `自分の過去${personalReports.length}か月と比較` : "過去の月がまだ不足",
        categoryAverages: personalCategoryAverages,
      };
  const difference = Number.isFinite(Number(activeComparison.value)) ? target.total_expense - activeComparison.value : null;
  const differenceRate = activeComparison.value ? Math.round((difference / activeComparison.value) * 1000) / 10 : null;
  const categories = Object.entries(target.categories || {})
    .map(([name, amount]) => ({
      name,
      amount: Number(amount),
      ratio: target.total_expense ? Math.round((Number(amount) / target.total_expense) * 1000) / 10 : 0,
      group_average: Number.isFinite(Number(activeComparison.categoryAverages?.[name])) ? Number(activeComparison.categoryAverages[name]) : null,
      difference: Number.isFinite(Number(activeComparison.categoryAverages?.[name])) ? Number(amount) - Number(activeComparison.categoryAverages[name]) : null,
    }))
    .sort((left, right) => right.amount - left.amount);
  const sources = Object.entries(target.payment_methods || {}).map(([name, value]) => ({
    name,
    amount: Number(value.amount),
    count: Number(value.count),
  }));
  const monthOverMonth = previous?.total_expense
    ? Math.round(((target.total_expense - previous.total_expense) / previous.total_expense) * 1000) / 10
    : null;
  const insight = buildAnalysisInsight({
    scope,
    totalExpense: target.total_expense,
    transactionCount: target.transaction_count,
    comparison: activeComparison,
    difference,
    differenceRate,
    categories,
    sources,
    previousTotal: previous?.total_expense ?? null,
    monthOverMonth,
    partial: Boolean(target.partial),
  });

  return {
    dataset: "stored-summary",
    month,
    generated_at: target.updated_at,
    summary: {
      total_expense: Number(target.total_expense),
      group_average: activeComparison.type === "group" ? activeComparison.value : null,
      difference,
      difference_rate: differenceRate,
      transaction_count: Number(target.transaction_count),
      previous_total: previous?.total_expense ?? null,
      month_over_month: monthOverMonth,
    },
    categories,
    sources,
    trend: scopedReports.map((report) => ({
      month: report.month,
      amount: Number(report.total_expense),
      count: Number(report.transaction_count),
      partial: Boolean(report.partial),
    })),
    comparison: activeComparison,
    scope,
    insight,
    privacy: "選んだファイル自体は保存せず、支出を振り返るために必要な内容だけを保存しています。",
  };
}

function buildAllPeriodStoredReport(reports, scope = analysisScope, periodType = "all") {
  const allScopedReports = getStoredReportsForScope(scope, reports)
    .sort((left, right) => left.month.localeCompare(right.month));
  const scopedReports = periodType === "year" ? allScopedReports.slice(-12) : allScopedReports;
  if (!scopedReports.length) throw new Error("表示できる保存済みの結果がありません。");
  const totalExpense = scopedReports.reduce((sum, report) => sum + Number(report.total_expense), 0);
  const transactionCount = scopedReports.reduce((sum, report) => sum + Number(report.transaction_count), 0);
  const categoryTotals = new Map();
  const sourceTotals = new Map();
  scopedReports.forEach((report) => {
    Object.entries(report.categories || {}).forEach(([name, amount]) => {
      categoryTotals.set(name, (categoryTotals.get(name) || 0) + Number(amount));
    });
    Object.entries(report.payment_methods || {}).forEach(([name, value]) => {
      const current = sourceTotals.get(name) || { amount: 0, count: 0 };
      current.amount += Number(value.amount);
      current.count += Number(value.count);
      sourceTotals.set(name, current);
    });
  });
  const categories = [...categoryTotals.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      ratio: totalExpense ? Math.round((amount / totalExpense) * 1000) / 10 : 0,
      group_average: null,
      difference: null,
    }))
    .sort((left, right) => right.amount - left.amount);
  const sources = [...sourceTotals.entries()].map(([name, value]) => ({ name, ...value }));
  const trend = scopedReports.map((report) => ({
    month: report.month,
    amount: Number(report.total_expense),
    count: Number(report.transaction_count),
    partial: Boolean(report.partial),
  }));
  const monthlyAverage = Math.round(totalExpense / scopedReports.length);
  const insight = buildPeriodInsight({ totalExpense, transactionCount, monthSeries: trend, categories });

  return {
    dataset: "stored-summary",
    month: periodType === "year" ? YEAR_PERIOD : ALL_PERIOD,
    period_type: periodType,
    generated_at: scopedReports.at(-1).updated_at,
    summary: {
      total_expense: totalExpense,
      monthly_average: monthlyAverage,
      period_month_count: scopedReports.length,
      period_start: scopedReports[0].month,
      period_end: scopedReports.at(-1).month,
      group_average: null,
      difference: null,
      difference_rate: null,
      transaction_count: transactionCount,
      previous_total: null,
      month_over_month: null,
    },
    categories,
    sources,
    trend,
    comparison: {
      type: "period",
      label: "1か月あたり",
      value: monthlyAverage,
      note: `${scopedReports.length}か月の平均`,
      status: periodType === "year" ? "直近1年間をまとめて表示" : `${scopedReports.length}か月をまとめて表示`,
      categoryAverages: {},
    },
    scope,
    insight,
    privacy: periodType === "year"
      ? "保存してある月ごとの結果から直近1年間をまとめています。"
      : "保存してある月ごとの結果から全期間をまとめています。",
  };
}

async function loadStoredReports(showWhenAvailable = false) {
  if (!spendOpsAuth?.getSessionUser()) return false;
  const response = await spendOpsAuth.authenticatedFetch("/reports");
  if (!response.ok) return false;
  const result = await response.json();
  storedAnalysisData = Array.isArray(result.reports) ? result.reports : [];
  if (showWhenAvailable && !localAnalysis && storedAnalysisData.length) await showStoredReports();
  return Boolean(storedAnalysisData.length);
}

async function loadStoredTransactions() {
  if (!spendOpsAuth?.getSessionUser()) return false;
  const response = await spendOpsAuth.authenticatedFetch("/transactions");
  if (!response.ok) return false;
  const result = await response.json();
  storedTransactionsData = Array.isArray(result.transactions) ? result.transactions : [];
  return Boolean(storedTransactionsData.length);
}

async function loadStoredAccountData(showWhenAvailable = true) {
  await Promise.all([loadStoredReports(false), loadStoredTransactions(), loadCategoryRules()]);
  if (showWhenAvailable && storedAnalysisData?.length) await showStoredReports();
  return Boolean(storedAnalysisData?.length);
}

async function showStoredReports() {
  if (!storedAnalysisData?.length) {
    document.querySelector("#upload-message").textContent = "保存済みの結果はありません。";
    return;
  }
  localAnalysis = buildStoredTransactionAnalysis(storedTransactionsData, storedAnalysisData);
  await applyPersonalCategoryRules(localAnalysis);
  localAnalysisOwnerId = spendOpsAuth?.getSessionUser()?.sub || null;
  comparisonMode = "group";
  if (localAnalysis) {
    configureScopeSwitch(localAnalysis);
    populateMonthSelect(localAnalysis, analysisScope);
  } else {
    const scopes = getStoredAvailableScopes();
    analysisScope = scopes.includes("ALL") ? "ALL" : scopes[0];
    configureScopeButtons(scopes);
    populateStoredMonthSelect();
  }
  renderStoredSummary();
  setComparisonMode("group", false);
  renderLocalMonth();
  setConnection("is-online", "保存済みの結果を表示中");
  setDataMenuOpen(false);
}

function resetAnalysisView() {
  localAnalysis = null;
  localAnalysisOwnerId = null;
  storedAnalysisData = null;
  storedTransactionsData = null;
  storedCategoryRules = new Map();
  categoryRulesOwnerId = null;
  categoryReviewRows = [];
  categoryReviewDraft = new Map();
  currentReport = null;
  analysisScope = null;
  document.querySelector("#analysis-controls").hidden = true;
  document.querySelector("#scope-control").hidden = true;
  document.querySelector("#result-content").hidden = true;
  document.querySelector("#empty-state").hidden = false;
  document.querySelector("#upload-message").textContent = "ファイルを選択してください";
  setConnection("", "明細の読み込み待ち");
}

async function handleAuthChanged(user) {
  cloudComparisons.clear();
  if (!user) {
    storedCategoryRules = new Map();
    categoryRulesOwnerId = null;
    if (localAnalysisOwnerId) {
      resetAnalysisView();
    } else if (localAnalysis) {
      storedAnalysisData = null;
      storedTransactionsData = null;
      renderLocalMonth(false);
      setConnection("is-local", "端末内分析のみ");
    } else {
      resetAnalysisView();
    }
    return;
  }

  if (localAnalysisOwnerId && localAnalysisOwnerId !== user.sub) resetAnalysisView();

  const message = document.querySelector("#upload-message");
  const shouldSaveLocalAnalysis = Boolean(localAnalysis && localAnalysis.origin !== "stored");
  try {
    if (shouldSaveLocalAnalysis) {
      message.textContent = "ログイン完了・明細と月ごとの結果を保存しています…";
      await loadCategoryRules();
      const learned = await applyPersonalCategoryRules(localAnalysis);
      const saved = await saveAnalysisToCloud(localAnalysis);
      localAnalysisOwnerId = user.sub;
      await loadStoredAccountData(false);
      const month = document.querySelector("#month-select").value;
      await refreshCloudComparison(month, analysisScope, true);
      renderLocalMonth(false);
      const learnedText = learned.changedTransactions ? `・学習済みの使いみちを${number.format(learned.changedTransactions)}件へ反映` : "";
      message.textContent = `ログイン完了・${number.format(saved.saved_transaction_count)}件の明細と${number.format(saved.saved_summary_count)}か月分の結果を保存しました${learnedText}`;
      message.className = "upload-message is-success";
      setConnection("is-online", "結果を保存済み");
    } else {
      const hasStoredData = await loadStoredAccountData(true);
      if (!hasStoredData && !localAnalysis) resetAnalysisView();
    }
  } catch (_error) {
    message.textContent = shouldSaveLocalAnalysis
      ? "ログインは完了しましたが、明細と月ごとの結果を保存できませんでした。"
      : "ログインは完了しましたが、保存済み分析を取得できませんでした。";
    message.className = "upload-message is-error";
  }
}

function populateStoredMonthSelect(preferredMonth = null) {
  const select = document.querySelector("#month-select");
  select.replaceChildren();
  const months = getStoredMonths(analysisScope);
  if (months.length >= 12) {
    const yearOption = document.createElement("option");
    yearOption.value = YEAR_PERIOD;
    yearOption.textContent = "直近1年間のまとめ";
    select.append(yearOption);
  }
  if (months.length !== 12) {
    const allOption = document.createElement("option");
    allOption.value = ALL_PERIOD;
    allOption.textContent = "読み込んだ全期間のまとめ";
    select.append(allOption);
  }
  [...months].reverse().forEach((month) => {
    const report = getStoredReportsForScope(analysisScope).find((item) => item.month === month);
    const option = document.createElement("option");
    option.value = month;
    option.textContent = `${formatMonth(month)}${report?.partial ? "（一部期間）" : ""}`;
    select.append(option);
  });
  const availableSummaryPeriods = new Set([...select.options].map((option) => option.value));
  select.value = preferredMonth && (availableSummaryPeriods.has(preferredMonth) || months.includes(preferredMonth)) ? preferredMonth : months.at(-1);
  document.querySelector("#analysis-controls").hidden = false;
  document.querySelector("#report-period-control").hidden = false;
}

function renderStoredSummary() {
  const months = [...new Set(storedAnalysisData.map((item) => item.month))].sort();
  document.querySelector("#accepted-count").textContent = "保存済み";
  document.querySelector("#ignored-count").textContent = "—";
  document.querySelector("#invalid-count").textContent = "—";
  document.querySelector("#detected-months").textContent = number.format(months.length);
  document.querySelector("#coverage-text").textContent = `${months[0].replaceAll("-", "/")} 〜 ${months.at(-1).replaceAll("-", "/")}`;
  document.querySelector("#integrity-note").textContent = "保存してある月ごとの結果を表示しています。選んだファイル自体は保存していません。";
}

async function analyzeSelectedCsv(event) {
  event.preventDefault();
  const fileInput = document.querySelector("#csv-file");
  const message = document.querySelector("#upload-message");
  const files = [...fileInput.files];
  message.className = "upload-message";

  if (!files.length) {
    message.textContent = "利用明細のファイルを選んでください。";
    message.classList.add("is-error");
    return;
  }

  try {
    message.textContent = "この画面で明細を読み取っています…";
    const results = await Promise.all(files.map(async (file) => {
      const decoded = decodeCsv(await file.arrayBuffer());
      return {
        analysis: buildLocalAnalysis(parseCsv(decoded.text), file.name),
        encoding: decoded.encoding,
      };
    }));
    const sessionUser = spendOpsAuth?.getSessionUser();
    if (sessionUser && categoryRulesOwnerId !== sessionUser.sub) await loadCategoryRules();
    const previousAnalysis = localAnalysis;
    localAnalysis = mergeIncrementalAnalysis(previousAnalysis, results.map((result) => result.analysis));
    const learned = sessionUser ? await applyPersonalCategoryRules(localAnalysis) : { changedTransactions: 0 };
    localAnalysisOwnerId = sessionUser?.sub || null;
    comparisonMode = "group";
    breakdownMode = "category";
    configureScopeSwitch(localAnalysis);
    setBreakdownMode("category", false);
    populateMonthSelect(localAnalysis, analysisScope);
    renderImportSummary(localAnalysis);
    setComparisonMode("group", false);
    renderLocalMonth(false);
    setConnection("is-local", "明細の読み取り完了");
    const scopeText = getAvailableScopes(localAnalysis).map(paymentScopeLabel).join("・");
    const learnedText = learned.changedTransactions ? ` / 学習済みの使いみちを${number.format(learned.changedTransactions)}件へ反映` : "";
    const analysisText = `${files.length}件${previousAnalysis ? "追加" : "読み込み"} / ${scopeText} / ${localAnalysis.months.length}か月${learnedText}`;
    if (spendOpsAuth?.getSessionUser()) {
      message.textContent = `${analysisText}・明細と月ごとの結果を保存しています…`;
      try {
        const saved = await saveAnalysisToCloud(localAnalysis);
        await loadStoredAccountData(false);
        const month = document.querySelector("#month-select").value;
        await refreshCloudComparison(month, analysisScope, true);
        renderLocalMonth(false);
        message.textContent = `${analysisText}・${number.format(saved.saved_transaction_count)}件の明細と${number.format(saved.saved_summary_count)}か月分の結果を保存しました`;
        message.classList.add("is-success");
        setConnection("is-online", "結果を保存済み");
      } catch (saveError) {
        message.textContent = `${analysisText}・読み取りは完了しましたが保存に失敗しました。`;
        message.classList.add("is-error");
        setConnection("is-local", "この画面だけに表示");
      }
    } else {
      message.textContent = `${analysisText}・ログインすると明細と月ごとの結果を保存できます`;
      message.classList.add("is-success");
    }
    setDataMenuOpen(false);
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "利用明細を読み取れませんでした。";
    message.classList.add("is-error");
  }
}

function getAvailableScopes(analysis) {
  const scopes = new Set(analysis.transactions.map((transaction) => paymentScopeForSource(transaction.source)));
  const available = ["PAYPAY", "CARD"].filter((scope) => scopes.has(scope));
  if (available.length > 1) return ["ALL", ...available];
  return available.length ? available : ["ALL"];
}

function configureScopeSwitch(analysis) {
  const scopes = getAvailableScopes(analysis);
  analysisScope = scopes.includes("ALL") ? "ALL" : scopes[0];
  configureScopeButtons(scopes);
}

function configureScopeButtons(scopes) {
  const scopeControl = document.querySelector("#scope-control");
  scopeControl.hidden = scopes.length < 2;
  [
    ["#all-scope", "ALL"],
    ["#paypay-scope", "PAYPAY"],
    ["#card-scope", "CARD"],
  ].forEach(([selector, scope]) => {
    const button = document.querySelector(selector);
    button.hidden = !scopes.includes(scope);
    button.classList.toggle("is-active", analysisScope === scope);
    button.setAttribute("aria-pressed", String(analysisScope === scope));
  });
}

function populateMonthSelect(analysis, scope = analysisScope, preferredMonth = null) {
  const select = document.querySelector("#month-select");
  select.replaceChildren();
  const months = getScopedMonths(analysis, scope);
  if (months.length >= 12) {
    const yearOption = document.createElement("option");
    yearOption.value = YEAR_PERIOD;
    yearOption.textContent = "直近1年間のまとめ";
    select.append(yearOption);
  }
  if (months.length !== 12) {
    const allOption = document.createElement("option");
    allOption.value = ALL_PERIOD;
    allOption.textContent = "読み込んだ全期間のまとめ";
    select.append(allOption);
  }
  [...months].reverse().forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = `${formatMonth(month)}${getPartialMonthsForScope(analysis, scope).has(month) ? "（一部期間）" : ""}`;
    select.append(option);
  });
  const fallbackMonth = getDefaultMonth(analysis, scope);
  const availableSummaryPeriods = new Set([...select.options].map((option) => option.value));
  select.value = preferredMonth && (availableSummaryPeriods.has(preferredMonth) || months.includes(preferredMonth)) ? preferredMonth : fallbackMonth;
  document.querySelector("#analysis-controls").hidden = false;
  document.querySelector("#report-period-control").hidden = false;
}

function renderImportSummary(analysis) {
  document.querySelector("#accepted-count").textContent = number.format(analysis.validation.acceptedRows);
  document.querySelector("#ignored-count").textContent = number.format(analysis.validation.ignoredRows);
  document.querySelector("#invalid-count").textContent = number.format(analysis.validation.invalidRows);
  document.querySelector("#detected-months").textContent = number.format(analysis.months.length);
  document.querySelector("#coverage-text").textContent = `${analysis.period.start.replaceAll("-", "/")} 〜 ${analysis.period.end.replaceAll("-", "/")}`;
  const duplicateText = analysis.validation.duplicateCandidates
    ? `完全一致の重複候補 ${analysis.validation.duplicateCandidates}行を検出。`
    : "完全一致の重複候補なし。";
  document.querySelector("#integrity-note").textContent = `月の途中までの記録は斜線で表示します。入金・チャージ・返金は支出に含めません。${duplicateText}`;
}

function renderLocalMonth(refreshComparison = true) {
  if (!localAnalysis && !storedAnalysisData?.length) return;
  const month = document.querySelector("#month-select").value
    || (localAnalysis ? getDefaultMonth(localAnalysis, analysisScope) : getStoredMonths(analysisScope).at(-1));
  const report = localAnalysis
    ? buildLocalReport(localAnalysis, month, comparisonMode, analysisScope)
    : buildStoredReport(storedAnalysisData, month, comparisonMode, analysisScope);
  renderReport(report, localAnalysis?.origin === "stored" || !localAnalysis ? "stored" : "local");
  if (refreshComparison && comparisonMode === "group" && ![ALL_PERIOD, YEAR_PERIOD].includes(month)) refreshCloudComparison(month, analysisScope);
}

function setAnalysisScope(scope) {
  const scopes = localAnalysis ? getAvailableScopes(localAnalysis) : getStoredAvailableScopes();
  if (!scopes.includes(scope)) return;
  const previousMonthValue = document.querySelector("#month-select").value;
  analysisScope = scope;
  [
    ["#all-scope", "ALL"],
    ["#paypay-scope", "PAYPAY"],
    ["#card-scope", "CARD"],
  ].forEach(([selector, value]) => {
    const button = document.querySelector(selector);
    button.classList.toggle("is-active", value === scope);
    button.setAttribute("aria-pressed", String(value === scope));
  });
  if (localAnalysis) populateMonthSelect(localAnalysis, scope, previousMonthValue);
  else populateStoredMonthSelect(previousMonthValue);
  renderLocalMonth();
}

function setBreakdownMode(mode, rerender = true) {
  breakdownMode = "category";
  if (rerender && currentReport) renderBreakdown(currentReport);
}

function animateComparisonTransition() {
  const content = document.querySelector("#result-content");
  if (!content || content.hidden) return;
  content.classList.remove("is-switching");
  void content.offsetWidth;
  content.classList.add("is-switching");
  browserWindow.setTimeout?.(() => content.classList.remove("is-switching"), 420);
}

function setComparisonMode(mode, rerender = true) {
  comparisonMode = mode;
  const groupButton = document.querySelector("#group-mode");
  const personalButton = document.querySelector("#personal-mode");
  groupButton.classList.toggle("is-active", mode === "group");
  personalButton.classList.toggle("is-active", mode === "personal");
  groupButton.setAttribute("aria-pressed", String(mode === "group"));
  personalButton.setAttribute("aria-pressed", String(mode === "personal"));
  if (rerender && (localAnalysis || storedAnalysisData?.length)) {
    animateComparisonTransition();
    renderLocalMonth();
  }
}

function setDataMenuOpen(open) {
  const workspace = document.querySelector(".workspace");
  const panel = document.querySelector("#control-panel");
  const toggle = document.querySelector("#data-menu-toggle");
  const label = document.querySelector("#data-menu-label");
  workspace.classList.toggle("is-menu-collapsed", !open);
  panel.setAttribute("aria-hidden", String(!open));
  toggle.setAttribute("aria-expanded", String(open));
  label.textContent = open ? "読み込み欄を閉じる" : "明細を読み込む";
}

function initializeApp() {
  document.querySelector("#data-menu-toggle").addEventListener("click", () => {
    const open = document.querySelector("#data-menu-toggle").getAttribute("aria-expanded") === "true";
    setDataMenuOpen(!open);
  });
  document.querySelector("#data-menu-close").addEventListener("click", () => setDataMenuOpen(false));
  document.querySelector("#run-demo").addEventListener("click", loadDemoReport);
  document.querySelector("#csv-form").addEventListener("submit", analyzeSelectedCsv);
  document.querySelector("#month-select").addEventListener("change", () => renderLocalMonth(true));
  document.querySelector("#group-mode").addEventListener("click", () => setComparisonMode("group"));
  document.querySelector("#personal-mode").addEventListener("click", () => setComparisonMode("personal"));
  document.querySelector("#all-scope").addEventListener("click", () => setAnalysisScope("ALL"));
  document.querySelector("#paypay-scope").addEventListener("click", () => setAnalysisScope("PAYPAY"));
  document.querySelector("#card-scope").addEventListener("click", () => setAnalysisScope("CARD"));
  document.querySelector("#open-transactions").addEventListener("click", openTransactionDialog);
  document.querySelector("#open-category-review").addEventListener("click", openCategoryReview);
  document.querySelector("#close-transactions").addEventListener("click", closeTransactionDialog);
  document.querySelector("#close-category-review").addEventListener("click", closeCategoryReview);
  document.querySelector("#transaction-prev").addEventListener("click", () => {
    transactionPage -= 1;
    renderTransactionDialog();
  });
  document.querySelector("#transaction-next").addEventListener("click", () => {
    transactionPage += 1;
    renderTransactionDialog();
  });
  document.querySelector("#transaction-period-filter").addEventListener("change", (event) => {
    transactionPeriodFilter = event.currentTarget.value;
    transactionMerchantFilter = "";
    transactionPage = 0;
    populateTransactionMerchantFilter();
    renderTransactionDialog();
  });
  document.querySelector("#transaction-merchant-filter").addEventListener("change", (event) => {
    transactionMerchantFilter = event.currentTarget.value;
    transactionPage = 0;
    renderTransactionDialog();
  });
  document.querySelector("#transaction-rows").addEventListener("change", (event) => {
    const select = event.target.closest(".transaction-category-select");
    if (select) handleTransactionCategoryChange(select);
  });
  document.querySelector("#export-other-categories").addEventListener("click", downloadOtherCategoryCorrections);
  document.querySelector("#category-correction-file").addEventListener("change", handleCategoryCorrectionFile);
  document.querySelector("#category-review-filter").addEventListener("change", renderCategoryReview);
  document.querySelector("#category-review-rows").addEventListener("change", (event) => {
    const select = event.target.closest(".category-review-select");
    if (select) categoryReviewDraft.set(select.dataset.key, select.value);
  });
  document.querySelector("#save-category-review").addEventListener("click", saveCategoryReview);
  document.querySelector("#export-category-rules").addEventListener("click", downloadCategoryRuleBackup);
  document.querySelector("#category-rule-backup-file").addEventListener("change", handleCategoryRuleBackupFile);
  document.querySelector("#transaction-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeTransactionDialog();
  });
  document.querySelector("#category-review-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeCategoryReview();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector("#data-menu-toggle").getAttribute("aria-expanded") === "true") {
      setDataMenuOpen(false);
    }
  });
  document.querySelector("#load-saved").addEventListener("click", async () => {
    const message = document.querySelector("#upload-message");
    try {
      await loadStoredAccountData(false);
      await showStoredReports();
    } catch (_error) {
      message.textContent = "保存済み分析を取得できませんでした。";
      message.className = "upload-message is-error";
    }
  });
  document.addEventListener("spendops:auth-changed", (event) => {
    handleAuthChanged(event.detail?.user);
  });
  const existingUser = spendOpsAuth?.getSessionUser();
  if (existingUser) handleAuthChanged(existingUser);
  document.querySelector("#csv-file").addEventListener("change", (event) => {
    const files = [...event.target.files];
    document.querySelector("#file-label").textContent = files.length === 1 ? files[0].name : files.length ? `${files.length}ファイルを選択` : "ファイルを選ぶ";
    document.querySelector("#upload-message").textContent = files.length ? "選択しました。「読み取る」を押してください" : "ファイルを選択してください";
  });
}

if (typeof document !== "undefined") initializeApp();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ALL_PERIOD,
    YEAR_PERIOD,
    parseCsv,
    decodeCsv,
    normalizeDate,
    parseAmount,
    classifyCategory,
    applyManualCategory,
    createPersonalCategoryRule,
    applyPersonalCategoryRules,
    buildCategoryReviewRows,
    buildOtherCategoryRows,
    buildCategoryCorrectionCsv,
    parseCategoryCorrectionCsv,
    applyCategoryCorrections,
    buildCategoryRuleBackupCsv,
    parseCategoryRuleBackupCsv,
    normalizeImportedCategoryRules,
    findColumn,
    parseFilePeriod,
    detectPartialMonths,
    buildLocalAnalysis,
    buildStoredTransactionAnalysis,
    mergeLocalAnalyses,
    mergeIncrementalAnalysis,
    buildLocalReport,
    buildBreakdownItems,
    getMerchantFilterValue,
    buildMerchantFilterOptions,
    getTransactionPage,
    buildTransactionViewReport,
    buildTrendScale,
    formatTrendAxisAmount,
    getAvailableScopes,
    paymentScopeForSource,
    getDefaultMonth,
    previousMonth,
    formatFullYen,
    getMonthChangeState,
    buildAnalysisInsight,
    buildAnalysisUploadPayload,
    buildStoredReport,
    getStoredAvailableScopes,
    getStoredMonths,
    getPartialMonthsForScope,
    combineStoredMonthlyReports,
    getStoredReportsForScope,
  };
}

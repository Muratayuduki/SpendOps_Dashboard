const browserWindow = typeof window === "undefined" ? {} : window;
const config = browserWindow.SPENDOPS_CONFIG || {};
const comparisonData = browserWindow.SPENDOPS_COMPARISON_DATA || null;
const spendOpsAuth = browserWindow.SpendOpsAuth || null;
const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
const categoryColors = ["#dfff78", "#79dfb8", "#b9afff", "#ffb56f", "#7fb3ff", "#f58ab2"];
const cloudCategories = new Set(["食費", "日用品", "交通費", "娯楽", "光熱費", "通信費", "医療費", "衣服費", "住居費", "その他"]);
const selectableCategories = [...cloudCategories];
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("ja-JP");

let localAnalysis = null;
let comparisonMode = "group";
let analysisScope = null;
let breakdownMode = "category";
let currentReport = null;
let storedAnalysisData = null;
const cloudComparisons = new Map();
const cloudComparisonRequests = new Set();
let transactionPage = 0;
const TRANSACTIONS_PER_PAGE = 8;

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
    label: "匿名の全体平均",
    value: 197400,
    note: "合成データによるデモ",
    status: "合成比較・実ユーザーではありません",
  },
  insight: "合成データによる比較デモです。実ユーザーの集団比較ではありません。",
};

function formatMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  return match ? `${match[1]}年${Number(match[2])}月` : value;
}

function formatRate(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}%`;
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
  const sentences = [];

  if (partial) sentences.push("期間途中または一部未取込の暫定値です。");

  let summary = `${paymentScopeLabel(scope)}は${formatFullYen(safeTotal)}（${number.format(safeCount)}件）`;
  if (hasComparison && numericDifference !== 0) {
    summary += `、${comparison.label || "比較基準"}より${formatFullYen(Math.abs(numericDifference))}（${Math.abs(numericDifferenceRate).toFixed(1)}%）${numericDifference > 0 ? "高い" : "低い"}です。`;
  } else if (hasComparison) {
    summary += `、${comparison.label || "比較基準"}と同水準です。`;
  } else {
    summary += "。";
    sentences.push(summary);
    summary = comparison.type === "personal"
      ? "本人比較は過去の完了月データが不足しているため保留です。"
      : "他者比較は匿名化に必要な人数が集まるまで保留です。";
  }
  sentences.push(summary);

  const topCategory = categories.find((category) => Number(category.amount) > 0);
  if (topCategory) {
    sentences.push(`最大カテゴリは${topCategory.name}の${formatFullYen(topCategory.amount)}（${Number(topCategory.ratio || 0).toFixed(1)}%）です。`);
  }

  const numericPreviousTotal = Number(previousTotal);
  const numericMonthOverMonth = Number(monthOverMonth);
  if (Number.isFinite(numericPreviousTotal) && numericPreviousTotal > 0 && Number.isFinite(numericMonthOverMonth)) {
    const monthlyDifference = safeTotal - numericPreviousTotal;
    sentences.push(monthlyDifference === 0
      ? "前月と同額です。"
      : `前月より${formatFullYen(Math.abs(monthlyDifference))}（${Math.abs(numericMonthOverMonth).toFixed(1)}%）${monthlyDifference > 0 ? "増加" : "減少"}しています。`);
  }

  if (sources.length > 1 && safeTotal > 0) {
    const topSource = [...sources].sort((left, right) => Number(right.amount) - Number(left.amount))[0];
    const sourceRatio = Math.round((Number(topSource.amount) / safeTotal) * 1000) / 10;
    sentences.push(`${topSource.name}が支払い方法の${sourceRatio.toFixed(1)}%を占めます。`);
  }

  const otherCategory = categories.find((category) => category.name === "その他" && Number(category.amount) > 0);
  const excessCategory = [...categories]
    .filter((category) => Number.isFinite(Number(category.difference)) && Number(category.difference) > 0)
    .sort((left, right) => Number(right.difference) - Number(left.difference))[0];
  if (otherCategory && Number(otherCategory.ratio) >= 20) {
    sentences.push(`「その他」が${Number(otherCategory.ratio).toFixed(1)}%あります。支払い明細から分類すると分析精度が上がります。`);
  } else if (excessCategory) {
    sentences.push(`見直し候補は${excessCategory.name}です。基準超過${formatFullYen(excessCategory.difference)}分の上位明細を確認しましょう。`);
  } else if (topCategory) {
    sentences.push(`まず${topCategory.name}の高額明細を確認すると、改善余地を見つけやすくなります。`);
  }

  if (scope === "ALL") {
    sentences.push("PayPayチャージがカード明細にもある場合は二重計上に注意してください。");
  }

  return sentences.join("");
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
  const comparison = report.comparison || {
    type: "group",
    label: "匿名の全体平均",
    value: summary.group_average,
    note: "合成データ",
    status: "合成比較",
  };
  const hasComparison = Number.isFinite(Number(comparison.value));

  document.querySelector("#empty-state").hidden = true;
  document.querySelector("#result-content").hidden = false;

  document.querySelector("#report-month").textContent = formatMonth(report.month);
  document.querySelector("#total-expense").textContent = yen.format(summary.total_expense);
  document.querySelector("#comparison-label").textContent = comparison.label;
  document.querySelector("#comparison-value").textContent = hasComparison ? yen.format(comparison.value) : "比較待ち";
  document.querySelector("#comparison-note").textContent = comparison.note;
  document.querySelector("#comparison-status").textContent = comparison.status;
  document.querySelector("#transaction-count").textContent = `${number.format(summary.transaction_count)}件`;
  document.querySelector("#source-count").textContent = `${report.sources.length}種類の取得元`;
  document.querySelector("#month-over-month").textContent = formatRate(summary.month_over_month);
  document.querySelector("#previous-month-note").textContent = summary.previous_total === null ? "前月データなし" : "前月の本人データと比較";
  const donutTotal = document.querySelector("#donut-total");
  const fullYen = formatFullYen(summary.total_expense);
  donutTotal.textContent = fullYen;
  donutTotal.classList.toggle("is-long", fullYen.length >= 10);
  donutTotal.classList.toggle("is-very-long", fullYen.length >= 14);
  document.querySelector("#insight-text").textContent = report.insight;
  document.querySelector("#open-transactions").hidden = !Array.isArray(report.transactions) || !report.transactions.length;

  const comparisonText = document.querySelector("#average-comparison");
  comparisonText.textContent = hasComparison
    ? `${comparison.label}より ${formatRate(summary.difference_rate)}`
    : comparison.type === "group"
      ? "他者比較データを準備中"
      : "過去月データが不足";
  if (hasComparison && comparison.type === "personal") {
    comparisonText.textContent = `本人の過去平均より ${formatRate(summary.difference_rate)}`;
  }

  const badge = document.querySelector("#dataset-badge");
  badge.textContent = mode === "local" ? "端末内CSV" : mode === "stored" ? "DynamoDB保存済み" : "AWS 合成デモ";

  renderBreakdown(report);

  const sourceList = document.querySelector("#source-list");
  sourceList.replaceChildren();
  report.sources.forEach((source) => {
    const row = document.createElement("div");
    row.className = "source-item";
    row.innerHTML = `
      <span><i class="source-icon">${escapeHtml(source.name.slice(0, 2).toUpperCase())}</i>${escapeHtml(source.name)}</span>
      <b>${yen.format(source.amount)}</b>
      <small>${number.format(source.count)}件を集計</small>
    `;
    sourceList.append(row);
  });

  renderTrend(report.trend || [], report.month);

  const generated = new Date(report.generated_at);
  document.querySelector("#generated-at").textContent = Number.isNaN(generated.getTime())
    ? "分析完了"
    : `分析実行: ${generated.toLocaleString("ja-JP")}`;
}

function renderBreakdown(report) {
  const categoryList = document.querySelector("#category-list");
  categoryList.replaceChildren();
  const gradient = [];
  let gradientStart = 0;
  const isCategory = breakdownMode === "category";
  const items = buildBreakdownItems(report, breakdownMode);

  document.querySelector("#breakdown-kicker").textContent = isCategory ? "BY CATEGORY" : "BY PAYMENT";
  document.querySelector("#breakdown-title").textContent = isCategory ? "カテゴリ別" : "支払い方法別";

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

function getTransactionPage(report, page = 0, pageSize = TRANSACTIONS_PER_PAGE) {
  const transactions = Array.isArray(report?.transactions) ? report.transactions : [];
  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  return {
    items: transactions.slice(safePage * pageSize, (safePage + 1) * pageSize),
    page: safePage,
    totalPages,
    totalItems: transactions.length,
  };
}

function renderTransactionDialog() {
  const pageSize = Number(browserWindow.innerHeight) > 0 && Number(browserWindow.innerHeight) < 650 ? 5 : TRANSACTIONS_PER_PAGE;
  const pageData = getTransactionPage(currentReport, transactionPage, pageSize);
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
      <select class="transaction-category-select" data-source="${escapeHtml(transaction.source)}" data-merchant="${escapeHtml(transaction.merchant)}" aria-label="${escapeHtml(transaction.merchant)}のカテゴリ">
        ${categoryOptions}
      </select>
      <span>${escapeHtml(transaction.source)}</span>
      <b>${yen.format(transaction.amount)}</b>
    `;
    rows.append(row);
  });

  const scope = currentReport?.scope ? paymentScopeLabel(currentReport.scope) : "支払い";
  document.querySelector("#transaction-context").textContent = `${formatMonth(currentReport?.month)}・${scope}・${number.format(pageData.totalItems)}件`;
  document.querySelector("#transaction-page").textContent = `${pageData.page + 1} / ${pageData.totalPages}`;
  document.querySelector("#transaction-prev").disabled = pageData.page === 0;
  document.querySelector("#transaction-next").disabled = pageData.page >= pageData.totalPages - 1;
}

function applyManualCategory(analysis, source, merchant, category) {
  if (!analysis || !cloudCategories.has(category)) return 0;
  const normalizedMerchant = String(merchant || "").trim().toLowerCase();
  if (!normalizedMerchant) return 0;
  let changedCount = 0;
  analysis.transactions.forEach((transaction) => {
    const sameMerchant = String(transaction.merchant || "").trim().toLowerCase() === normalizedMerchant;
    if (transaction.source === source && sameMerchant && transaction.category !== category) {
      transaction.category = category;
      changedCount += 1;
    }
  });
  return changedCount;
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
    const saved = await saveAnalysisToCloud(localAnalysis);
    await loadStoredReports(false);
    message.textContent = `カテゴリ変更を反映し、${number.format(saved.saved_summary_count)}件の月別集計をDBへ保存しました。`;
    setConnection("is-online", "DynamoDBへ保存済み");
  } catch (_error) {
    message.textContent = "カテゴリ変更は端末内へ反映しましたが、DB保存に失敗しました。";
    message.className = "upload-message is-error";
    setConnection("is-local", "端末内分析のみ");
  }
}

function openTransactionDialog() {
  if (!Array.isArray(currentReport?.transactions) || !currentReport.transactions.length) return;
  transactionPage = 0;
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

function renderTrend(trend, selectedMonth) {
  const container = document.querySelector("#monthly-trend");
  container.replaceChildren();
  const values = trend.slice(-12);
  const maximum = Math.max(...values.map((item) => item.amount), 1);

  values.forEach((item) => {
    const element = document.createElement("div");
    element.className = "trend-item";
    if (item.month === selectedMonth) element.classList.add("is-selected");
    if (item.partial) element.classList.add("is-partial");
    element.title = `${formatMonth(item.month)} ${yen.format(item.amount)} / ${number.format(item.count)}件${item.partial ? "（一部期間）" : ""}`;
    const height = Math.max(4, Math.round((item.amount / maximum) * 100));
    element.innerHTML = `
      <div class="trend-bar-wrap"><i class="trend-bar" style="height:${height}%"></i></div>
      <span class="trend-label">${escapeHtml(formatCompactMonth(item.month))}</span>
    `;
    container.append(element);
  });
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
    analysisScope = "ALL";
    document.querySelector("#scope-switch").hidden = true;
    setComparisonMode("group", false);
    setBreakdownMode("category", false);
    renderReport(report, "aws");
    setConnection("is-online", "AWS API 接続済み");
  } catch (_error) {
    fallbackReport.generated_at = new Date().toISOString();
    localAnalysis = null;
    analysisScope = "ALL";
    document.querySelector("#scope-switch").hidden = true;
    setComparisonMode("group", false);
    setBreakdownMode("category", false);
    renderReport(fallbackReport, "fallback");
    setConnection("is-local", "ローカルデモ動作中");
  } finally {
    button.disabled = false;
    button.textContent = "AWSでデモ分析を再実行";
  }
}

function normalizeDemoReport(report) {
  return {
    ...report,
    trend: [{ month: report.month, amount: report.summary.total_expense, count: report.summary.transaction_count, partial: false }],
    comparison: {
      type: "group",
      label: "匿名の全体平均",
      value: report.summary.group_average,
      note: "合成データによるデモ",
      status: "合成比較・実ユーザーではありません",
    },
    insight: `合成データによる比較デモです。${report.insight || ""}`,
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
  throw new Error("文字コードを判定できませんでした。UTF-8またはShift_JISのCSVを選択してください。");
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
  if (/電車|鉄道|バス|タクシ|交通|suica|pasmo|\bjr\b|metro|高速|駐車場|パーキング|ガソリン|eneos|エネオス|出光|apollostation|コスモ石油|\bjal\b|\bana\b/.test(target)) return "交通費";
  if (/スーパー|コンビニ|飲食|レストラン|食品|カフェ|弁当|セブン|ローソン|ファミリ|ミニストップ|デイリー|イオン|西友|イトーヨーカ|マルエツ|成城石井|業務スーパー|コストコ|マクドナルド|スターバックス|すき家|吉野家|ガスト|サイゼリヤ|スシロー|くら寿司|モスバーガー|ケンタッキー|出前館|uber.?eats/.test(target)) return "食費";
  if (/薬局|ドラッグ|日用品|ホームセンター|マツモトキヨシ|マツキヨ|ウエルシア|スギ薬局|無印|amazon|アマゾン|楽天市場|ヨドバシ|ビックカメラ|ニトリ|カインズ|コーナン|ドン.?キホーテ|ダイソー|セリア|ロフト|東急ハンズ/.test(target)) return "日用品";
  if (/映画|ゲーム|娯楽|書店|音楽|netflix|spotify|youtube|toho|hulu|disney|amazon.?prime|nintendo|任天堂|steam|playstation|カラオケ|apple\.com\/bill/.test(target)) return "娯楽";
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

function buildLocalReport(analysis, month, mode = comparisonMode, scope = analysisScope || paymentScopeForSource(analysis.source)) {
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
        label: "本人の過去月平均",
        value: personalAverage,
        note: personalMonths.length ? `過去${personalMonths.length}か月の平均` : "過去月データが不足",
        status: personalMonths.length ? `本人内比較・${personalMonths.length}か月` : "本人内比較データなし",
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
    privacy: "原本CSVと明細は送信しません。ログイン時は月別集計だけをDynamoDBへ保存します。",
  };
}

function paymentScopeLabel(scope) {
  if (scope === "PAYPAY") return "PayPay";
  if (scope === "CARD") return "クレジットカード";
  return "全支払い方法";
}

function getGroupBaseline(source, month) {
  const sourceKey = paymentScopeForSource(source);
  const sourceData = comparisonData?.sources?.[sourceKey] || comparisonData?.sources?.ALL;
  const realComparison = cloudComparisons.get(`${month}#${sourceKey}`);
  const sourceLabel = sourceData?.label || paymentScopeLabel(sourceKey);
  if (realComparison?.eligible && Number.isFinite(Number(realComparison.average_total))) {
    return {
      type: "group",
      label: `${sourceLabel}他者平均`,
      value: Number(realComparison.average_total),
      note: `他の登録ユーザー${Number(realComparison.participant_count)}人の匿名集計`,
      status: `実他者比較・${Number(realComparison.participant_count)}人`,
      categoryAverages: realComparison.category_averages || {},
    };
  }
  if (sourceKey === "ALL") {
    const participantCount = Number(realComparison?.participant_count || 0);
    const minimumParticipants = Number(realComparison?.minimum_participants || 5);
    return {
      type: "group",
      label: "全支払い他者平均",
      value: null,
      note: `PayPay・カード両方が揃う他ユーザー ${participantCount}/${minimumParticipants}人`,
      status: `統合実比較待ち・${participantCount}/${minimumParticipants}人`,
      categoryAverages: {},
    };
  }
  const monthData = sourceData?.months?.[month];
  const value = monthData?.average_total ?? sourceData?.monthly_average ?? null;
  const participantCount = Number(monthData?.participant_count ?? sourceData?.participant_count ?? 0);
  const seedProfileCount = Number(sourceData?.cohort?.seed_profile_count ?? 0);
  const eligible = Boolean(sourceData?.eligible && Number.isFinite(Number(value)));
  const realProgress = realComparison
    ? `実データ${Number(realComparison.participant_count)}/${Number(realComparison.minimum_participants)}人・`
    : "";
  return {
    type: "group",
    label: `${sourceLabel}合成平均`,
    value: eligible ? Number(value) : null,
    note: eligible ? `${realProgress}合成${participantCount}人・元データ${seedProfileCount}人の参考値` : "比較データを準備中",
    status: realComparison
      ? `実比較待ち・${Number(realComparison.participant_count)}/${Number(realComparison.minimum_participants)}人`
      : eligible ? `${sourceLabel}比較・合成${participantCount}人` : "他者比較データ準備中",
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
    schema_version: 1,
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
  if (!payload.summaries.length) throw new Error("PayPayまたはカードの月別集計がありません。");
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
        label: "本人の過去月平均",
        value: personalAverage,
        note: personalReports.length ? `保存済み過去${personalReports.length}か月の平均` : "過去月データが不足",
        status: personalReports.length ? `本人内比較・${personalReports.length}か月` : "本人内比較データなし",
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
    privacy: "月別集計だけをDynamoDBへ保存し、原本CSVと明細は保存していません。",
  };
}

async function loadStoredReports(showWhenAvailable = true) {
  if (!spendOpsAuth?.getSessionUser()) return false;
  const response = await spendOpsAuth.authenticatedFetch("/reports");
  if (!response.ok) return false;
  const result = await response.json();
  storedAnalysisData = Array.isArray(result.reports) ? result.reports : [];
  if (showWhenAvailable && !localAnalysis && storedAnalysisData.length) showStoredReports();
  return Boolean(storedAnalysisData.length);
}

function showStoredReports() {
  if (!storedAnalysisData?.length) {
    document.querySelector("#upload-message").textContent = "DynamoDBに保存済みの分析はありません。";
    return;
  }
  localAnalysis = null;
  comparisonMode = "group";
  const scopes = getStoredAvailableScopes();
  analysisScope = scopes.includes("ALL") ? "ALL" : scopes[0];
  configureScopeButtons(scopes);
  populateStoredMonthSelect();
  renderStoredSummary();
  setComparisonMode("group", false);
  renderLocalMonth();
  setConnection("is-online", "DynamoDB保存済み分析");
}

function resetAnalysisView() {
  localAnalysis = null;
  storedAnalysisData = null;
  currentReport = null;
  analysisScope = null;
  document.querySelector("#analysis-controls").hidden = true;
  document.querySelector("#scope-switch").hidden = true;
  document.querySelector("#result-content").hidden = true;
  document.querySelector("#empty-state").hidden = false;
  document.querySelector("#upload-message").textContent = "ファイルを選択してください";
  setConnection("", "CSV待機中");
}

async function handleAuthChanged(user) {
  cloudComparisons.clear();
  if (!user) {
    if (localAnalysis) {
      storedAnalysisData = null;
      renderLocalMonth(false);
      setConnection("is-local", "端末内分析のみ");
    } else {
      resetAnalysisView();
    }
    return;
  }

  const message = document.querySelector("#upload-message");
  try {
    if (localAnalysis) {
      message.textContent = "ログイン完了・現在の月別集計をDBへ保存中…";
      const saved = await saveAnalysisToCloud(localAnalysis);
      await loadStoredReports(false);
      const month = document.querySelector("#month-select").value;
      await refreshCloudComparison(month, analysisScope, true);
      renderLocalMonth(false);
      message.textContent = `ログイン完了・${number.format(saved.saved_summary_count)}件の月別集計をDB保存済み`;
      message.className = "upload-message is-success";
      setConnection("is-online", "DynamoDBへ保存済み");
    } else {
      await loadStoredReports(true);
    }
  } catch (_error) {
    message.textContent = localAnalysis
      ? "ログインは完了しましたが、月別集計をDB保存できませんでした。"
      : "ログインは完了しましたが、保存済み分析を取得できませんでした。";
    message.className = "upload-message is-error";
  }
}

function populateStoredMonthSelect(preferredMonth = null) {
  const select = document.querySelector("#month-select");
  select.replaceChildren();
  const months = getStoredMonths(analysisScope);
  [...months].reverse().forEach((month) => {
    const report = getStoredReportsForScope(analysisScope).find((item) => item.month === month);
    const option = document.createElement("option");
    option.value = month;
    option.textContent = `${formatMonth(month)}${report?.partial ? "（一部期間）" : ""}`;
    select.append(option);
  });
  select.value = preferredMonth && months.includes(preferredMonth) ? preferredMonth : months.at(-1);
  document.querySelector("#analysis-controls").hidden = false;
}

function renderStoredSummary() {
  const months = [...new Set(storedAnalysisData.map((item) => item.month))].sort();
  document.querySelector("#accepted-count").textContent = "DB";
  document.querySelector("#ignored-count").textContent = "—";
  document.querySelector("#invalid-count").textContent = "—";
  document.querySelector("#detected-months").textContent = number.format(months.length);
  document.querySelector("#coverage-text").textContent = `${months[0].replaceAll("-", "/")} 〜 ${months.at(-1).replaceAll("-", "/")}`;
  document.querySelector("#integrity-note").textContent = "月別集計をDynamoDBから取得。原本CSVと支払い明細は保存していません。";
}

async function analyzeSelectedCsv(event) {
  event.preventDefault();
  const fileInput = document.querySelector("#csv-file");
  const message = document.querySelector("#upload-message");
  const files = [...fileInput.files];
  message.className = "upload-message";

  if (!files.length) {
    message.textContent = "CSVファイルを選択してください。";
    message.classList.add("is-error");
    return;
  }

  try {
    message.textContent = "端末内で読み取り・集計しています…";
    const results = await Promise.all(files.map(async (file) => {
      const decoded = decodeCsv(await file.arrayBuffer());
      return {
        analysis: buildLocalAnalysis(parseCsv(decoded.text), file.name),
        encoding: decoded.encoding,
      };
    }));
    localAnalysis = mergeLocalAnalyses(results.map((result) => result.analysis));
    comparisonMode = "group";
    breakdownMode = "category";
    configureScopeSwitch(localAnalysis);
    setBreakdownMode("category", false);
    populateMonthSelect(localAnalysis, analysisScope);
    renderImportSummary(localAnalysis);
    setComparisonMode("group", false);
    renderLocalMonth(false);
    setConnection("is-local", "端末内CSVを分析済み");
    const scopeText = getAvailableScopes(localAnalysis).map(paymentScopeLabel).join("・");
    const encodings = [...new Set(results.map((result) => result.encoding.toUpperCase()))].join("/");
    const analysisText = `${files.length}ファイル / ${scopeText} / ${encodings} / ${localAnalysis.months.length}か月`;
    if (spendOpsAuth?.getSessionUser()) {
      message.textContent = `${analysisText}・月別集計をDBへ保存中…`;
      try {
        const saved = await saveAnalysisToCloud(localAnalysis);
        await loadStoredReports(false);
        const month = document.querySelector("#month-select").value;
        await refreshCloudComparison(month, analysisScope, true);
        renderLocalMonth(false);
        message.textContent = `${analysisText}・${number.format(saved.saved_summary_count)}件の月別集計をDB保存済み`;
        message.classList.add("is-success");
        setConnection("is-online", "DynamoDBへ保存済み");
      } catch (saveError) {
        message.textContent = `${analysisText}・端末内分析は完了しましたがDB保存に失敗しました。`;
        message.classList.add("is-error");
        setConnection("is-local", "端末内分析のみ");
      }
    } else {
      message.textContent = `${analysisText}・ログインすると月別集計をDB保存`;
      message.classList.add("is-success");
    }
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "CSVの分析に失敗しました。";
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
  const scopeSwitch = document.querySelector("#scope-switch");
  scopeSwitch.hidden = scopes.length < 2;
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
  [...months].reverse().forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = `${formatMonth(month)}${getPartialMonthsForScope(analysis, scope).has(month) ? "（一部期間）" : ""}`;
    select.append(option);
  });
  const fallbackMonth = getDefaultMonth(analysis, scope);
  select.value = preferredMonth && months.includes(preferredMonth) ? preferredMonth : fallbackMonth;
  document.querySelector("#analysis-controls").hidden = false;
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
  document.querySelector("#integrity-note").textContent = `期間途中の月は斜線表示。入金・チャージ・返金は支出対象外。${duplicateText}`;
}

function renderLocalMonth(refreshComparison = true) {
  if (!localAnalysis && !storedAnalysisData?.length) return;
  const month = document.querySelector("#month-select").value
    || (localAnalysis ? getDefaultMonth(localAnalysis, analysisScope) : getStoredMonths(analysisScope).at(-1));
  const report = localAnalysis
    ? buildLocalReport(localAnalysis, month, comparisonMode, analysisScope)
    : buildStoredReport(storedAnalysisData, month, comparisonMode, analysisScope);
  renderReport(report, localAnalysis ? "local" : "stored");
  if (refreshComparison && comparisonMode === "group") refreshCloudComparison(month, analysisScope);
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
  breakdownMode = mode;
  const categoryButton = document.querySelector("#category-view");
  const paymentButton = document.querySelector("#payment-view");
  categoryButton.classList.toggle("is-active", mode === "category");
  paymentButton.classList.toggle("is-active", mode === "payment");
  categoryButton.setAttribute("aria-pressed", String(mode === "category"));
  paymentButton.setAttribute("aria-pressed", String(mode === "payment"));
  if (rerender && currentReport) renderBreakdown(currentReport);
}

function setComparisonMode(mode, rerender = true) {
  comparisonMode = mode;
  const groupButton = document.querySelector("#group-mode");
  const personalButton = document.querySelector("#personal-mode");
  groupButton.classList.toggle("is-active", mode === "group");
  personalButton.classList.toggle("is-active", mode === "personal");
  groupButton.setAttribute("aria-pressed", String(mode === "group"));
  personalButton.setAttribute("aria-pressed", String(mode === "personal"));
  if (rerender && (localAnalysis || storedAnalysisData?.length)) renderLocalMonth();
}

function initializeApp() {
  document.querySelector("#run-demo").addEventListener("click", loadDemoReport);
  document.querySelector("#csv-form").addEventListener("submit", analyzeSelectedCsv);
  document.querySelector("#month-select").addEventListener("change", () => renderLocalMonth(true));
  document.querySelector("#group-mode").addEventListener("click", () => setComparisonMode("group"));
  document.querySelector("#personal-mode").addEventListener("click", () => setComparisonMode("personal"));
  document.querySelector("#all-scope").addEventListener("click", () => setAnalysisScope("ALL"));
  document.querySelector("#paypay-scope").addEventListener("click", () => setAnalysisScope("PAYPAY"));
  document.querySelector("#card-scope").addEventListener("click", () => setAnalysisScope("CARD"));
  document.querySelector("#category-view").addEventListener("click", () => setBreakdownMode("category"));
  document.querySelector("#payment-view").addEventListener("click", () => setBreakdownMode("payment"));
  document.querySelector("#open-transactions").addEventListener("click", openTransactionDialog);
  document.querySelector("#close-transactions").addEventListener("click", closeTransactionDialog);
  document.querySelector("#transaction-prev").addEventListener("click", () => {
    transactionPage -= 1;
    renderTransactionDialog();
  });
  document.querySelector("#transaction-next").addEventListener("click", () => {
    transactionPage += 1;
    renderTransactionDialog();
  });
  document.querySelector("#transaction-rows").addEventListener("change", (event) => {
    const select = event.target.closest(".transaction-category-select");
    if (select) handleTransactionCategoryChange(select);
  });
  document.querySelector("#transaction-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeTransactionDialog();
  });
  document.querySelector("#load-saved").addEventListener("click", async () => {
    const message = document.querySelector("#upload-message");
    try {
      if (!storedAnalysisData?.length) await loadStoredReports(false);
      showStoredReports();
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
    document.querySelector("#file-label").textContent = files.length === 1 ? files[0].name : files.length ? `${files.length}ファイルを選択` : "CSVを選ぶ";
    document.querySelector("#upload-message").textContent = files.length ? "選択済み。分析ボタンを押してください" : "ファイルを選択してください";
  });
}

if (typeof document !== "undefined") initializeApp();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseCsv,
    decodeCsv,
    normalizeDate,
    parseAmount,
    classifyCategory,
    applyManualCategory,
    findColumn,
    parseFilePeriod,
    detectPartialMonths,
    buildLocalAnalysis,
    mergeLocalAnalyses,
    buildLocalReport,
    buildBreakdownItems,
    getTransactionPage,
    getAvailableScopes,
    paymentScopeForSource,
    getDefaultMonth,
    previousMonth,
    formatFullYen,
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

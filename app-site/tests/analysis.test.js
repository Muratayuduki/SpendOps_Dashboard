const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {
  SPENDOPS_CONFIG: {},
  SPENDOPS_COMPARISON_DATA: {
    dataset: "synthetic-test",
    participant_count: 120,
    sources: {
      PAYPAY: {
        label: "PayPay",
        eligible: true,
        participant_count: 120,
        cohort: { seed_profile_count: 1 },
        monthly_average: 1200,
        category_averages: { その他: 1200 },
        months: {
          "2026-06": {
            average_total: 1500,
            participant_count: 120,
            category_averages: { その他: 1500 },
          },
        },
      },
      CARD: {
        label: "クレジットカード",
        eligible: true,
        participant_count: 120,
        cohort: { seed_profile_count: 2 },
        monthly_average: 5500,
        category_averages: { 食費: 5500 },
        months: {
          "2026-06": {
            average_total: 6000,
            participant_count: 120,
            category_averages: { 食費: 6000 },
          },
        },
      },
    },
  },
};

const core = require("../script.js");

test("CSV parser supports quoted commas and line breaks", () => {
  const rows = core.parseCsv('date,merchant,amount\r\n2026/06/01,"A, B",100\r\n');
  assert.deepEqual(rows[1], ["2026/06/01", "A, B", "100"]);
});

test("donut total uses full yen without compact k notation", () => {
  assert.equal(core.formatFullYen(184620), "184,620円");
  assert.equal(core.formatFullYen(123456789), "123,456,789円");
  assert.equal(core.formatFullYen(0), "0円");
  assert.equal(core.formatFullYen(184620).toLowerCase().includes("k"), false);
});

test("monthly trend scale provides readable yen ticks above the highest expense", () => {
  const scale = core.buildTrendScale([{ amount: 12000 }, { amount: 43000 }]);
  assert.equal(scale.maximum, 50000);
  assert.deepEqual(scale.ticks, [50000, 37500, 25000, 12500, 0]);
  assert.equal(core.formatTrendAxisAmount(50000), "5万円");
  assert.equal(core.formatTrendAxisAmount(12500), "1.3万円");
  assert.equal(core.formatTrendAxisAmount(0), "0円");
});

test("month comparison states distinguish expense increases and decreases", () => {
  assert.equal(core.getMonthChangeState(12.5, 10000), "increase");
  assert.equal(core.getMonthChangeState(-8.2, 10000), "decrease");
  assert.equal(core.getMonthChangeState(0, 10000), "neutral");
  assert.equal(core.getMonthChangeState(null, null), "unavailable");
  assert.equal(core.getMonthChangeState(null, 0), "unavailable");
});

test("analysis insight explains amounts, comparisons, changes, concentration, and next action", () => {
  const insight = core.buildAnalysisInsight({
    scope: "ALL",
    totalExpense: 10000,
    transactionCount: 5,
    comparison: { type: "group", label: "他者平均", value: 8000 },
    difference: 2000,
    differenceRate: 25,
    categories: [
      { name: "食費", amount: 6000, ratio: 60, difference: 2000 },
      { name: "日用品", amount: 4000, ratio: 40, difference: -500 },
    ],
    sources: [
      { name: "PayPay", amount: 6000, count: 3 },
      { name: "JCB", amount: 4000, count: 2 },
    ],
    previousTotal: 9000,
    monthOverMonth: 11.1,
  });

  assert.match(insight, /注目：/);
  assert.match(insight, /10,000円、5回/);
  assert.match(insight, /他者平均より2,000円（25\.0%）多い/);
  assert.match(insight, /見方：/);
  assert.match(insight, /一時的な出費か、来月も続く出費か/);
  assert.match(insight, /次の一歩：/);
  assert.match(insight, /食費の明細を金額が大きい順に3件/);
  assert.match(insight, /PayPayとカードの両方/);
});

test("analysis insight states why comparison is unavailable and marks partial data", () => {
  const insight = core.buildAnalysisInsight({
    scope: "PAYPAY",
    totalExpense: 5000,
    transactionCount: 2,
    comparison: { type: "group", value: null },
    categories: [{ name: "食費", amount: 5000, ratio: 100, difference: null }],
    sources: [{ name: "PayPay", amount: 5000, count: 2 }],
    partial: true,
  });

  assert.match(insight, /まだ月の途中/);
  assert.match(insight, /比べられる人数がまだ少ない/);
  assert.doesNotMatch(insight, /NaN|undefined/);
});

test("column candidates are evaluated in priority order", () => {
  const headers = ["取引日", "取引内容", "取引先", "出金金額"];
  assert.equal(core.findColumn(headers, ["取引先", "取引内容"]), 2);
});

test("provided category aliases and expanded merchant rules reduce other classifications", () => {
  assert.equal(core.classifyCategory("任意の店舗", "食料品"), "食費");
  assert.equal(core.classifyCategory("AMAZON.CO.JP", ""), "ネットでの購入");
  assert.equal(core.classifyCategory("APPLE.COM/BILL", ""), "ネットでの購入");
  assert.equal(core.classifyCategory("GOOGLE *SERVICES", ""), "ネットでの購入");
  assert.equal(core.classifyCategory("ENEOS サービスステーション", ""), "交通費");
  assert.equal(core.classifyCategory("NETFLIX.COM", ""), "娯楽");
  assert.equal(core.classifyCategory("東京電力", "公共料金"), "光熱費");
});

test("manual category change updates the same merchant and source only", () => {
  const analysis = {
    transactions: [
      { merchant: "店舗A", source: "PayPay", category: "その他" },
      { merchant: "店舗A", source: "PayPay", category: "その他" },
      { merchant: "店舗A", source: "JCB", category: "その他" },
      { merchant: "店舗B", source: "PayPay", category: "その他" },
    ],
  };

  assert.equal(core.applyManualCategory(analysis, "PayPay", "店舗A", "食費"), 2);
  assert.deepEqual(analysis.transactions.map((item) => item.category), ["食費", "食費", "その他", "その他"]);
  assert.equal(core.applyManualCategory(analysis, "PayPay", "店舗A", "自由入力"), 0);
});

test("other-category correction list groups merchants and applies edited categories", () => {
  const analysis = {
    transactions: [
      { merchant: "店舗A", source: "PayPay", category: "その他" },
      { merchant: "店舗Ａ", source: "PAYPAY", category: "その他" },
      { merchant: "APPLE.COM/BILL", source: "JCB", category: "その他" },
      { merchant: "分類済み", source: "JCB", category: "食費" },
    ],
  };

  const exported = core.buildCategoryCorrectionCsv(analysis);
  assert.equal(exported.startsWith("\uFEFF"), true);
  const exportedRows = core.parseCsv(exported.slice(1));
  assert.deepEqual(exportedRows[0], ["利用先", "支払い元", "件数", "現在の使いみち", "修正後の使いみち"]);
  assert.equal(exportedRows.length, 3);
  assert.equal(exportedRows.find((row) => row[0] === "店舗A")[2], "2");

  const edited = [
    "利用先,支払い元,件数,現在の使いみち,修正後の使いみち",
    "店舗A,PayPay,2,その他,食費",
    "APPLE.COM/BILL,JCB,1,その他,ネットでの購入",
  ].join("\r\n");
  const parsed = core.parseCategoryCorrectionCsv(edited);
  const result = core.applyCategoryCorrections(analysis, parsed.rules);

  assert.equal(result.matchedRules, 2);
  assert.equal(result.changedTransactions, 3);
  assert.deepEqual(analysis.transactions.map((item) => item.category), [
    "食費",
    "食費",
    "ネットでの購入",
    "食費",
  ]);
});

test("category correction list rejects unsupported category names", () => {
  const edited = [
    "利用先,支払い元,修正後の使いみち",
    "店舗A,PayPay,自由入力",
  ].join("\r\n");
  assert.throws(() => core.parseCategoryCorrectionCsv(edited), /使いみち/);
});

test("personal category rules use a merchant hash and override only the matching payment source", async () => {
  const rule = await core.createPersonalCategoryRule("PayPay", " 店舗Ａ ", "食費");
  assert.match(rule.rule_key, /^PAYPAY#[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(rule).includes("店舗"), false);
  const repeatedRule = await core.createPersonalCategoryRule("PAYPAY", "店舗A", "食費");
  assert.equal(repeatedRule.rule_key, rule.rule_key);

  const analysis = {
    transactions: [
      { merchant: "店舗A", source: "PayPay", category: "その他" },
      { merchant: "店舗Ａ", source: "PAYPAY", category: "その他" },
      { merchant: "店舗A", source: "JCB", category: "その他" },
    ],
  };
  const applied = await core.applyPersonalCategoryRules(analysis, new Map([[rule.rule_key, rule]]));
  assert.deepEqual(applied, { changedTransactions: 2, matchedRules: 1 });
  assert.deepEqual(analysis.transactions.map((item) => item.category), ["食費", "食費", "その他"]);
});

test("category review groups every merchant and learned-rule backup can be restored", async () => {
  const analysis = {
    transactions: [
      { merchant: "店舗A", source: "PayPay", category: "食費" },
      { merchant: "店舗Ａ", source: "PAYPAY", category: "食費" },
      { merchant: "店舗B", source: "JCB", category: "その他" },
    ],
  };
  const reviewRows = core.buildCategoryReviewRows(analysis);
  assert.equal(reviewRows.length, 2);
  assert.equal(reviewRows[0].category, "その他");
  assert.equal(reviewRows.find((row) => row.merchant === "店舗A").count, 2);

  const rule = await core.createPersonalCategoryRule("PayPay", "店舗A", "食費");
  const backup = await core.buildCategoryRuleBackupCsv(analysis, new Map([[rule.rule_key, rule]]));
  assert.equal(backup.startsWith("\uFEFF"), true);
  assert.match(backup, /照合番号/);
  const parsed = core.parseCategoryRuleBackupCsv(backup);
  const restored = await core.normalizeImportedCategoryRules(parsed);
  assert.deepEqual(restored, [rule]);
});

test("product-name columns are retained for local payment details", () => {
  const analysis = core.buildLocalAnalysis([
    ["date", "商品名", "amount"],
    ["2026/06/10", "商品A", "1200"],
  ], "shopping.csv");
  assert.equal(analysis.transactions[0].merchant, "商品A");
});

test("one-year mid-month export defaults to the latest complete month", () => {
  const rows = [
    ["取引日", "出金金額", "入金金額", "取引内容", "取引先", "取引番号"],
    ["2025/07/08", "100", "", "支払い", "店舗A", "A"],
    ["2026/05/10", "100", "", "支払い", "店舗B", "B"],
    ["2026/06/10", "200", "", "支払い", "店舗C", "C"],
    ["2026/07/08", "300", "", "支払い", "店舗D", "D"],
  ];
  const analysis = core.buildLocalAnalysis(rows, "Transactions_20250708-20260708.csv");
  assert.equal(analysis.defaultMonth, "2026-06");
  assert.equal(analysis.partialMonths.has("2025-07"), true);
  assert.equal(analysis.partialMonths.has("2026-07"), true);
});

test("group comparison is default and personal comparison remains selectable", () => {
  const rows = [
    ["取引日", "出金金額", "入金金額", "取引内容", "取引先", "取引番号"],
    ["2026/05/10", "1000", "", "支払い", "店舗A", "A"],
    ["2026/06/10", "2000", "", "支払い", "店舗B", "B"],
  ];
  const analysis = core.buildLocalAnalysis(rows, "paypay.csv");
  const groupReport = core.buildLocalReport(analysis, "2026-06");
  const personalReport = core.buildLocalReport(analysis, "2026-06", "personal");
  assert.equal(groupReport.comparison.type, "group");
  assert.equal(groupReport.comparison.value, 1500);
  assert.equal(groupReport.comparison.status, "参考例と比較・120人分");
  assert.equal(personalReport.comparison.type, "personal");
  assert.equal(personalReport.comparison.value, 1000);
});

test("PayPay and credit-card reports use separate comparison cohorts", () => {
  const payPay = core.buildLocalAnalysis([
    ["取引日", "出金金額", "取引先"],
    ["2026/06/10", "2000", "店舗A"],
  ], "paypay.csv");
  const card = core.buildLocalAnalysis([
    ["ご利用日", "ご利用金額", "カテゴリ", "ご利用先など"],
    ["2026/06/11", "7000", "≪ショッピング取組（国内）≫", "セブン－イレブン"],
  ], "jcb.csv");
  const merged = core.mergeLocalAnalyses([payPay, card]);
  const allReport = core.buildLocalReport(merged, "2026-06", "group", "ALL");
  const payPayReport = core.buildLocalReport(merged, "2026-06", "group", "PAYPAY");
  const cardReport = core.buildLocalReport(merged, "2026-06", "group", "CARD");

  assert.deepEqual(core.getAvailableScopes(merged), ["ALL", "PAYPAY", "CARD"]);
  assert.equal(allReport.summary.total_expense, 9000);
  assert.deepEqual(allReport.sources.map((source) => source.name).sort(), ["JCB", "PayPay"]);
  assert.equal(allReport.sources.reduce((sum, source) => sum + source.amount, 0), 9000);
  assert.equal(allReport.comparison.value, null);
  assert.equal(payPayReport.summary.total_expense, 2000);
  assert.equal(payPayReport.comparison.value, 1500);
  assert.equal(cardReport.summary.total_expense, 7000);
  assert.equal(cardReport.comparison.value, 6000);
  assert.equal(cardReport.categories[0].name, "食費");
  assert.equal(cardReport.transactions[0].merchant, "セブン－イレブン");
  assert.equal("dedupKey" in cardReport.transactions[0], false);
});

test("separate PayPay and card uploads stay combined in the current account session", () => {
  const payPay = core.buildLocalAnalysis([
    ["取引日", "出金金額", "取引先"],
    ["2026/06/10", "2000", "店舗A"],
  ], "paypay.csv");
  const card = core.buildLocalAnalysis([
    ["ご利用日", "ご利用金額", "カテゴリ", "ご利用先など"],
    ["2026/06/11", "7000", "≪ショッピング取組（国内）≫", "店舗B"],
  ], "jcb.csv");

  const afterPayPay = core.mergeIncrementalAnalysis(null, [payPay]);
  const afterCard = core.mergeIncrementalAnalysis(afterPayPay, [card]);
  const report = core.buildLocalReport(afterCard, "2026-06", "group", "ALL");

  assert.deepEqual(core.getAvailableScopes(afterCard), ["ALL", "PAYPAY", "CARD"]);
  assert.equal(report.summary.total_expense, 9000);
  assert.deepEqual(report.sources.map((source) => source.name).sort(), ["JCB", "PayPay"]);
});

test("breakdown can switch from categories to payment methods", () => {
  const report = {
    summary: { total_expense: 10000 },
    categories: [{ name: "食費", amount: 10000, ratio: 100 }],
    sources: [
      { name: "JCB", amount: 6000, count: 3 },
      { name: "VISA", amount: 4000, count: 2 },
    ],
  };
  const items = core.buildBreakdownItems(report, "payment");
  assert.deepEqual(items.map((item) => [item.name, item.ratio, item.count]), [
    ["JCB", 60, 3],
    ["VISA", 40, 2],
  ]);
});

test("payment details are paginated without losing merchant names", () => {
  const report = {
    transactions: Array.from({ length: 10 }, (_, index) => ({
      date: "2026-06-10",
      merchant: `店舗${index + 1}`,
      category: "その他",
      source: "PayPay",
      amount: 1000 + index,
    })),
  };
  const firstPage = core.getTransactionPage(report, 0, 8);
  const secondPage = core.getTransactionPage(report, 1, 8);
  assert.equal(firstPage.items.length, 8);
  assert.equal(secondPage.items.length, 2);
  assert.equal(secondPage.items[0].merchant, "店舗9");
  assert.equal(secondPage.totalPages, 2);
});

test("payment details can be filtered by merchant", () => {
  const report = {
    transactions: [
      { merchant: "店舗A", amount: 1000 },
      { merchant: "店舗B", amount: 2000 },
      { merchant: "店舗A", amount: 3000 },
    ],
  };
  const filtered = core.getTransactionPage(report, 0, 8, "店舗A");
  assert.equal(filtered.totalItems, 2);
  assert.equal(filtered.totalAmount, 4000);
  assert.deepEqual(filtered.items.map((item) => item.amount), [1000, 3000]);
});

test("convenience-store branches are combined into one chain filter", () => {
  const report = {
    transactions: [
      { merchant: "セブン－イレブン 横浜駅前店", amount: 1000 },
      { merchant: "セブンイレブン　渋谷中央店", amount: 2000 },
      { merchant: "7-ELEVEN SHINJUKU", amount: 3000 },
      { merchant: "ローソン 横浜店", amount: 4000 },
      { merchant: "個人商店A", amount: 5000 },
    ],
  };

  assert.deepEqual(core.buildMerchantFilterOptions(report.transactions), [
    "セブンイレブン",
    "ローソン",
    "個人商店A",
  ]);
  const filtered = core.getTransactionPage(report, 0, 8, "セブンイレブン");
  assert.equal(filtered.totalItems, 3);
  assert.equal(filtered.totalAmount, 6000);
  assert.deepEqual(filtered.items.map((item) => item.merchant), [
    "セブン－イレブン 横浜駅前店",
    "セブンイレブン　渋谷中央店",
    "7-ELEVEN SHINJUKU",
  ]);
});

test("major convenience-store spellings share a stable chain name", () => {
  assert.equal(core.getMerchantFilterValue("ナチュラルローソン 千代田店"), "ローソン");
  assert.equal(core.getMerchantFilterValue("ＦＡＭＩＬＹ　ＭＡＲＴ 品川店"), "ファミリーマート");
  assert.equal(core.getMerchantFilterValue("ミニストップ川崎店"), "ミニストップ");
  assert.equal(core.getMerchantFilterValue("個人商店A"), "個人商店A");
});

test("merchant filter can use every loaded month while the report stays on one month", () => {
  const analysis = core.buildLocalAnalysis([
    ["取引日", "出金金額", "取引先"],
    ["2026/05/10", "1000", "店舗A"],
    ["2026/06/10", "2000", "店舗B"],
    ["2026/07/10", "3000", "店舗A"],
  ], "paypay.csv");
  const juneReport = core.buildLocalReport(analysis, "2026-06", "group", "PAYPAY");
  const fullPeriodReport = core.buildTransactionViewReport(juneReport, analysis, "PAYPAY", "all");
  const filtered = core.getTransactionPage(fullPeriodReport, 0, 8, "店舗A");

  assert.equal(juneReport.transactions.length, 1);
  assert.equal(fullPeriodReport.transactions.length, 3);
  assert.equal(filtered.totalItems, 2);
  assert.equal(filtered.totalAmount, 4000);
});

test("fixed-column VISA rows are normalized without reading the metadata row", () => {
  const rows = [
    ["metadata", "metadata", "card metadata"],
    ["2026/05/10", "店舗A", "1200", "1", "1", "1200", ""],
    ["2026/06/10", "店舗B", "1800", "1", "1", "1800", ""],
  ];
  const analysis = core.buildLocalAnalysis(rows, "visa.csv");
  assert.equal(analysis.source, "VISA");
  assert.equal(analysis.validation.acceptedRows, 2);
  assert.equal(analysis.validation.ignoredRows, 1);
});

test("repository PayPay fixture has valid multi-month expense rows", { skip: !fs.existsSync(path.resolve(__dirname, "..", "..", "csv", "paypay")) }, () => {
  const directory = path.resolve(__dirname, "..", "..", "csv", "paypay");
  const fileName = fs.readdirSync(directory).find((name) => name.toLowerCase().endsWith(".csv"));
  const bytes = fs.readFileSync(path.join(directory, fileName));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const analysis = core.buildLocalAnalysis(core.parseCsv(core.decodeCsv(buffer).text), fileName);
  assert.equal(analysis.source, "PayPay");
  assert.equal(analysis.months.length > 1, true);
  assert.equal(analysis.partialMonths.has(analysis.defaultMonth), false);
  assert.equal(analysis.validation.invalidRows, 0);
});

test("cloud upload payload contains normalized transactions without the CSV file", () => {
  const analysis = core.buildLocalAnalysis([
    ["取引日", "出金金額", "取引先"],
    ["2026/06/10", "2000", "秘密の店舗A"],
    ["2026/06/11", "3000", "秘密の店舗B"],
  ], "private-paypay.csv");
  const payload = core.buildAnalysisUploadPayload(analysis);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.summaries.length, 1);
  assert.equal(payload.summaries[0].month, "2026-06");
  assert.equal(payload.summaries[0].source_type, "PAYPAY");
  assert.equal(payload.summaries[0].total_expense, 5000);
  assert.equal(payload.summaries[0].transaction_count, 2);
  assert.equal(Object.values(payload.summaries[0].categories).reduce((sum, amount) => sum + amount, 0), 5000);
  assert.equal(payload.schema_version, 2);
  assert.equal(payload.transactions.length, 2);
  assert.equal(payload.transactions[0].merchant, "秘密の店舗A");
  assert.equal(payload.transactions[0].source, "PAYPAY");
  assert.equal(serialized.includes("秘密の店舗"), true);
  assert.equal(serialized.includes("private-paypay.csv"), false);
  assert.equal(serialized.includes("merchant"), true);
  assert.equal(serialized.includes("dedupKey"), false);
  assert.equal(serialized.includes("transactions"), true);
});

test("saved normalized transactions rebuild combined PayPay and card reports after reload", () => {
  const analysis = core.buildStoredTransactionAnalysis([
    { date: "2026-06-10", amount: 2000, merchant: "店舗A", category: "食費", source: "PAYPAY" },
    { date: "2026-06-11", amount: 7000, merchant: "店舗B", category: "日用品", source: "JCB" },
  ], [
    { month: "2026-06", source_type: "PAYPAY", partial: false },
    { month: "2026-06", source_type: "CARD", partial: false },
  ]);
  const report = core.buildLocalReport(analysis, "2026-06", "group", "ALL");

  assert.equal(analysis.origin, "stored");
  assert.deepEqual(core.getAvailableScopes(analysis), ["ALL", "PAYPAY", "CARD"]);
  assert.equal(report.summary.total_expense, 9000);
  assert.equal(report.transactions.length, 2);
});

test("stored monthly summaries rebuild personal comparisons without raw details", () => {
  const reports = [
    {
      month: "2026-05",
      source_type: "PAYPAY",
      total_expense: 4000,
      transaction_count: 2,
      categories: { "食費": 4000 },
      payment_methods: { PayPay: { amount: 4000, count: 2 } },
      partial: false,
      updated_at: "2026-07-15T00:00:00Z",
    },
    {
      month: "2026-06",
      source_type: "PAYPAY",
      total_expense: 6000,
      transaction_count: 3,
      categories: { "食費": 6000 },
      payment_methods: { PayPay: { amount: 6000, count: 3 } },
      partial: false,
      updated_at: "2026-07-15T00:00:00Z",
    },
  ];
  const report = core.buildStoredReport(reports, "2026-06", "personal", "PAYPAY");

  assert.equal(report.summary.total_expense, 6000);
  assert.equal(report.comparison.value, 4000);
  assert.equal(report.summary.difference, 2000);
  assert.equal(report.transactions, undefined);
  assert.equal(report.privacy.includes("選んだファイル自体は保存せず"), true);
  assert.equal(report.privacy.includes("必要な内容だけを保存"), true);
});

test("all-period local report totals every month and keeps the monthly trend", () => {
  const analysis = core.buildLocalAnalysis([
    ["取引日", "出金金額", "取引先"],
    ["2026/05/10", "1000", "店舗A"],
    ["2026/06/10", "2000", "店舗B"],
  ], "paypay.csv");
  const report = core.buildLocalReport(analysis, core.ALL_PERIOD, "group", "PAYPAY");

  assert.equal(report.period_type, "all");
  assert.equal(report.summary.total_expense, 3000);
  assert.equal(report.summary.monthly_average, 1500);
  assert.equal(report.summary.period_month_count, 2);
  assert.equal(report.trend.length, 2);
  assert.equal(report.transactions.length, 2);
  assert.match(report.insight, /全期間|2か月/);
});

test("one-year report uses the latest 12 months when more history is loaded", () => {
  const rows = [["取引日", "出金金額", "取引先"]];
  for (let index = 0; index < 13; index += 1) {
    const date = new Date(Date.UTC(2025, 6 + index, 10));
    rows.push([date.toISOString().slice(0, 10), "1000", `店舗${index}`]);
  }
  const analysis = core.buildLocalAnalysis(rows, "paypay.csv");
  const report = core.buildLocalReport(analysis, core.YEAR_PERIOD, "group", "PAYPAY");

  assert.equal(report.period_type, "year");
  assert.equal(report.summary.period_month_count, 12);
  assert.equal(report.summary.period_start, "2025-08");
  assert.equal(report.summary.period_end, "2026-07");
  assert.equal(report.summary.total_expense, 12000);
  assert.equal(report.trend.length, 12);
});

test("all-period stored report totals saved monthly results", () => {
  const reports = [
    {
      month: "2026-05", source_type: "PAYPAY", total_expense: 4000, transaction_count: 2,
      categories: { "食費": 4000 }, payment_methods: { PayPay: { amount: 4000, count: 2 } }, partial: false,
      updated_at: "2026-07-15T00:00:00Z",
    },
    {
      month: "2026-06", source_type: "PAYPAY", total_expense: 6000, transaction_count: 3,
      categories: { "食費": 6000 }, payment_methods: { PayPay: { amount: 6000, count: 3 } }, partial: false,
      updated_at: "2026-07-16T00:00:00Z",
    },
  ];
  const report = core.buildStoredReport(reports, core.ALL_PERIOD, "group", "PAYPAY");

  assert.equal(report.summary.total_expense, 10000);
  assert.equal(report.summary.monthly_average, 5000);
  assert.equal(report.summary.transaction_count, 5);
  assert.equal(report.categories[0].amount, 10000);
});

test("one-year stored report uses the latest 12 saved months", () => {
  const reports = Array.from({ length: 13 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 6 + index, 1));
    return {
      month: date.toISOString().slice(0, 7),
      source_type: "PAYPAY",
      total_expense: 1000,
      transaction_count: 1,
      categories: { "食費": 1000 },
      payment_methods: { PayPay: { amount: 1000, count: 1 } },
      partial: false,
      updated_at: date.toISOString(),
    };
  });
  const report = core.buildStoredReport(reports, core.YEAR_PERIOD, "group", "PAYPAY");

  assert.equal(report.period_type, "year");
  assert.equal(report.summary.period_month_count, 12);
  assert.equal(report.summary.period_start, "2025-08");
  assert.equal(report.summary.period_end, "2026-07");
  assert.equal(report.summary.total_expense, 12000);
});

test("stored PayPay and card summaries are combined by month", () => {
  const reports = [
    {
      month: "2026-05",
      source_type: "PAYPAY",
      total_expense: 1000,
      transaction_count: 1,
      categories: { "食費": 1000 },
      payment_methods: { PayPay: { amount: 1000, count: 1 } },
      partial: false,
      updated_at: "2026-07-14T00:00:00Z",
    },
    {
      month: "2026-05",
      source_type: "CARD",
      total_expense: 3000,
      transaction_count: 2,
      categories: { "日用品": 3000 },
      payment_methods: { JCB: { amount: 3000, count: 2 } },
      partial: false,
      updated_at: "2026-07-15T00:00:00Z",
    },
    {
      month: "2026-06",
      source_type: "PAYPAY",
      total_expense: 2000,
      transaction_count: 2,
      categories: { "食費": 2000 },
      payment_methods: { PayPay: { amount: 2000, count: 2 } },
      partial: false,
      updated_at: "2026-07-15T00:00:00Z",
    },
    {
      month: "2026-06",
      source_type: "CARD",
      total_expense: 6000,
      transaction_count: 3,
      categories: { "日用品": 6000 },
      payment_methods: { JCB: { amount: 6000, count: 3 } },
      partial: false,
      updated_at: "2026-07-15T00:00:00Z",
    },
  ];
  const report = core.buildStoredReport(reports, "2026-06", "personal", "ALL");

  assert.deepEqual(core.getStoredAvailableScopes(reports), ["ALL", "PAYPAY", "CARD"]);
  assert.deepEqual(core.getStoredMonths("ALL", reports), ["2026-05", "2026-06"]);
  assert.equal(report.summary.total_expense, 8000);
  assert.equal(report.comparison.value, 4000);
  assert.equal(report.summary.difference, 4000);
  assert.deepEqual(report.sources.map((source) => [source.name, source.amount]), [
    ["PayPay", 2000],
    ["JCB", 6000],
  ]);
  assert.equal(report.categories.reduce((sum, category) => sum + category.amount, 0), 8000);
});

test("all-payment stored months are marked partial when one source is missing", () => {
  const combined = core.combineStoredMonthlyReports([
    {
      month: "2026-05",
      source_type: "PAYPAY",
      total_expense: 1000,
      transaction_count: 1,
      categories: { "食費": 1000 },
      payment_methods: { PayPay: { amount: 1000, count: 1 } },
      partial: false,
    },
    {
      month: "2026-06",
      source_type: "PAYPAY",
      total_expense: 1000,
      transaction_count: 1,
      categories: { "食費": 1000 },
      payment_methods: { PayPay: { amount: 1000, count: 1 } },
      partial: false,
    },
    {
      month: "2026-06",
      source_type: "CARD",
      total_expense: 2000,
      transaction_count: 1,
      categories: { "日用品": 2000 },
      payment_methods: { JCB: { amount: 2000, count: 1 } },
      partial: false,
    },
  ]);

  assert.equal(combined.find((report) => report.month === "2026-05").partial, true);
  assert.equal(combined.find((report) => report.month === "2026-06").partial, false);
});

test("partial-month state remains separated by payment scope", () => {
  const payPay = core.buildLocalAnalysis([
    ["取引日", "出金金額", "取引先"],
    ["2026/06/15", "1000", "店舗A"],
  ], "Transactions_20260615-20260630.csv");
  const card = core.buildLocalAnalysis([
    ["ご利用日", "ご利用金額", "ご利用先など"],
    ["2026/06/01", "2000", "店舗B"],
  ], "card.csv");
  const merged = core.mergeLocalAnalyses([payPay, card]);

  assert.equal(core.getPartialMonthsForScope(merged, "PAYPAY").has("2026-06"), true);
  assert.equal(core.getPartialMonthsForScope(merged, "CARD").has("2026-06"), false);
  assert.equal(core.getPartialMonthsForScope(merged, "ALL").has("2026-06"), true);
  assert.equal(core.buildAnalysisUploadPayload(merged).summaries.find((item) => item.source_type === "PAYPAY").partial, true);
  assert.equal(core.buildAnalysisUploadPayload(merged).summaries.find((item) => item.source_type === "CARD").partial, false);
});

test("all-payment local months are partial when one payment source is missing", () => {
  const payPay = core.buildLocalAnalysis([
    ["取引日", "出金金額", "取引先"],
    ["2026/05/10", "1000", "店舗A"],
    ["2026/06/10", "1000", "店舗B"],
  ], "paypay.csv");
  const card = core.buildLocalAnalysis([
    ["ご利用日", "ご利用金額", "ご利用先など"],
    ["2026/06/11", "2000", "店舗C"],
  ], "jcb.csv");
  const merged = core.mergeLocalAnalyses([payPay, card]);

  assert.equal(core.getPartialMonthsForScope(merged, "ALL").has("2026-05"), true);
  assert.equal(core.getPartialMonthsForScope(merged, "ALL").has("2026-06"), false);
});

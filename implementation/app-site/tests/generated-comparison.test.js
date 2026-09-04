const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../comparison-data.js");
const core = require("../script.js");

test("generated comparison data contains a combined aggregate-only cohort", () => {
  const comparison = global.window.SPENDOPS_COMPARISON_DATA;
  const serialized = JSON.stringify(comparison);
  assert.equal(comparison.dataset, "synthetic-payment-cohorts-v1");
  assert.equal(comparison.participant_count, 120);
  assert.equal(comparison.sources.PAYPAY.participant_count, 120);
  assert.equal(comparison.sources.CARD.participant_count, 120);
  assert.equal(comparison.sources.ALL.participant_count, 120);
  assert.equal(comparison.sources.PAYPAY.cohort.seed_profile_count, 1);
  assert.equal(comparison.sources.CARD.cohort.seed_profile_count, 2);
  assert.equal(Object.values(comparison.sources.PAYPAY.months).every((month) => month.participant_count === 120), true);
  assert.equal(Object.values(comparison.sources.CARD.months).every((month) => month.participant_count === 120), true);
  assert.equal(Object.keys(comparison.sources.PAYPAY.months).length >= 12, true);
  assert.equal(Object.keys(comparison.sources.CARD.months).length >= 10, true);
  assert.equal(serialized.includes("merchant"), false);
  assert.equal(serialized.includes("transaction"), false);
  assert.equal(serialized.includes("dummy-01"), false);
  assert.equal(serialized.includes("≪ショッピング取組"), false);
});

test("repository PayPay data defaults to group comparison with personal mode available", () => {
  const directory = path.resolve(__dirname, "..", "..", "csv", "paypay");
  const fileName = fs.readdirSync(directory).sort().at(-1);
  const bytes = fs.readFileSync(path.join(directory, fileName));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const analysis = core.buildLocalAnalysis(core.parseCsv(core.decodeCsv(buffer).text), fileName);
  const groupReport = core.buildLocalReport(analysis, analysis.defaultMonth);
  const personalReport = core.buildLocalReport(analysis, analysis.defaultMonth, "personal");
  assert.equal(groupReport.comparison.type, "group");
  assert.equal(Number.isFinite(groupReport.comparison.value), true);
  assert.equal(groupReport.comparison.status, "参考例と比較・120人分");
  assert.equal(personalReport.comparison.type, "personal");
  assert.equal(Number.isFinite(personalReport.comparison.value), true);
});

test("repository card data uses the combined comparison cohort", () => {
  const directory = path.resolve(__dirname, "..", "..", "csv", "jcb");
  const fileName = fs.readdirSync(directory).find((name) => name.toLowerCase().endsWith(".csv"));
  const bytes = fs.readFileSync(path.join(directory, fileName));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const analysis = core.buildLocalAnalysis(core.parseCsv(core.decodeCsv(buffer).text), fileName);
  const report = core.buildLocalReport(analysis, analysis.defaultMonth);
  assert.equal(report.comparison.status, "参考例と比較・120人分");
  assert.equal(report.comparison.label, "全支払い方法の参考平均");
  assert.equal(report.categories.some((category) => category.name.includes("ショッピング取組")), false);
});

test("repository PayPay and card files produce an all-payment cumulative report", () => {
  const payPayDirectory = path.resolve(__dirname, "..", "..", "csv", "paypay");
  const cardDirectory = path.resolve(__dirname, "..", "..", "csv", "jcb");
  const payPayName = fs.readdirSync(payPayDirectory).sort().at(-1);
  const cardName = fs.readdirSync(cardDirectory).find((name) => name.toLowerCase().endsWith(".csv"));
  const buildFixture = (directory, fileName) => {
    const bytes = fs.readFileSync(path.join(directory, fileName));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return core.buildLocalAnalysis(core.parseCsv(core.decodeCsv(buffer).text), fileName);
  };
  const merged = core.mergeLocalAnalyses([
    buildFixture(payPayDirectory, payPayName),
    buildFixture(cardDirectory, cardName),
  ]);
  const commonMonths = [...new Set(merged.transactions.map((item) => item.date.slice(0, 7)))]
    .filter((month) => merged.transactions.some((item) => item.date.startsWith(month) && core.paymentScopeForSource(item.source) === "PAYPAY"))
    .filter((month) => merged.transactions.some((item) => item.date.startsWith(month) && core.paymentScopeForSource(item.source) === "CARD"))
    .sort();
  const month = commonMonths.at(-1);
  const allReport = core.buildLocalReport(merged, month, "group", "ALL");
  const payPayReport = core.buildLocalReport(merged, month, "group", "PAYPAY");
  const cardReport = core.buildLocalReport(merged, month, "group", "CARD");
  const paymentBreakdown = core.buildBreakdownItems(allReport, "payment");

  assert.equal(allReport.summary.total_expense, payPayReport.summary.total_expense + cardReport.summary.total_expense);
  assert.equal(paymentBreakdown.length >= 2, true);
  assert.equal(paymentBreakdown.every((item) => item.ratio < 100), true);
  assert.equal(Math.round(paymentBreakdown.reduce((sum, item) => sum + item.ratio, 0)), 100);
});

test("single-screen markup has every element required by the script", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.resolve(__dirname, "..", "styles.css"), "utf8");
  const script = fs.readFileSync(path.resolve(__dirname, "..", "script.js"), "utf8");
  const authScript = fs.readFileSync(path.resolve(__dirname, "..", "auth.js"), "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const requiredIds = [...`${script}\n${authScript}`.matchAll(/querySelector\("#([^"]+)"\)/g)].map((match) => match[1]);
  const missing = [...new Set(requiredIds.filter((id) => !ids.has(id)))];
  assert.deepEqual(missing, []);
  assert.equal(html.includes("class=\"hero\""), false);
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /height:\s*calc\(100vh - 56px\)/);
  assert.match(html, /id="group-mode"[^>]*aria-pressed="true"/);
  assert.match(html, /id="csv-file"[^>]*multiple/);
  assert.equal(html.includes('id="payment-view"'), false);
  assert.equal(html.includes("source-panel"), false);
  assert.match(html, /id="scope-switch"/);
  assert.match(html, /id="all-scope"/);
  assert.match(html, />まとめて</);
  assert.match(html, /id="data-menu-toggle"/);
  assert.match(html, /みんなの月平均/);
  assert.match(html, /他5人以上の完全月/);
  assert.match(html, /自分の過去平均/);
  assert.match(html, /最大12か月の平均/);
  assert.match(html, /<span class="switch-label">比較法<\/span>/);
  assert.match(html, /role="group" aria-label="比較法"/);
  assert.match(html, /id="personal-mode"[^>]*aria-pressed="false"/);
  assert.match(html, /class="comparison-card-state"[^>]*aria-hidden="true"/);
  assert.match(html, /id="comparison-result"[^>]*aria-labelledby="comparison-result-heading"/);
  assert.match(html, /id="comparison-result-heading">比較対象：みんなの月平均/);
  assert.doesNotMatch(html, /id="comparison-target"/);
  assert.match(css, /\.comparison-switch \{[^}]*gap:\s*6px[^}]*background:\s*transparent/s);
  assert.match(css, /\.metric-comparison \{[^}]*border-color:\s*var\(--line\)[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.comparison-difference \{[^}]*background:\s*#f0f2ee[^}]*border-left:\s*3px solid var\(--ink\)/s);
  assert.match(css, /\.comparison-switch button\.is-active \{[^}]*border:\s*2px solid var\(--ink\)/s);
  assert.match(css, /\.comparison-switch button:focus-visible/);
  assert.match(css, /\.comparison-card-copy strong \{[^}]*font-size:\s*12px/s);
  assert.match(css, /\.metric > span \{[^}]*font-size:\s*11px/s);
  assert.match(css, /\.result-content \{[^}]*grid-template-rows:\s*auto auto minmax\(270px, 1fr\) auto/s);
  assert.doesNotMatch(css, /\.analysis-grid \{[^}]*height:\s*clamp\(270px, 34vh, 340px\)/s);
  assert.doesNotMatch(html, /NEXT ACTION/);
  assert.match(css, /\.panel-heading h3 \{[^}]*font-size:\s*16px/s);
  assert.match(css, /\.insight-content \{[^}]*grid-auto-rows:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.insight-row \{[^}]*align-items:\s*center[^}]*font-size:\s*13px/s);
  assert.match(css, /\.category-layout \{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)[^}]*justify-items:\s*center/s);
  assert.match(css, /\.donut \{[^}]*width:\s*156px[^}]*height:\s*156px/s);
  assert.match(css, /\.category-list \{[^}]*align-content:\s*space-evenly[^}]*gap:\s*5px/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.analysis-grid \{[^}]*height:\s*auto/s);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.comparison-switch button \{[^}]*min-width:\s*0/s);
  assert.match(script, /`比較対象：\$\{comparisonTarget\}`/);
  assert.match(script, /`\$\{comparisonTarget\}との差：\$\{formatRate\(summary\.difference_rate\)\}`/);
  assert.match(script, /\.comparison-card-state span/);
  assert.match(html, /id="open-transactions"/);
  assert.match(html, /id="open-category-review"/);
  assert.match(html, /id="open-transactions"[^>]*>支払い明細</);
  assert.match(html, /id="open-category-review"[^>]*>分類修正</);
  assert.match(html, /class="detail-actions"[^>]*id="detail-actions"[^>]*aria-label="明細の確認と修正"[^>]*hidden/);
  assert.match(html, /class="heading-status-summary"[\s\S]*id="dataset-badge"[\s\S]*id="comparison-status"/);
  assert.match(css, /\.result-heading \{[^}]*display:\s*grid[^}]*gap:\s*12px/s);
  assert.match(css, /\.comparison-switch \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.comparison-switch button \{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
  assert.match(css, /\.detail-actions \{[^}]*justify-self:\s*end[^}]*gap:\s*6px/s);
  assert.match(css, /\.detail-button \{[^}]*min-width:\s*84px[^}]*min-height:\s*38px/s);
  assert.match(html, /id="transaction-title">支払い明細</);
  assert.doesNotMatch(html, /支払い明細・使いみちの編集/);
  assert.match(script, /comparisonStatus\.hidden = !isPeriodSummary && comparison\.status\?\.startsWith\("参考例と比較"\)/);
  assert.match(html, /id="category-review-dialog"/);
  assert.match(html, /id="category-review-filter"/);
  assert.match(html, /id="save-category-review"/);
  assert.match(html, /id="export-category-rules"/);
  assert.match(html, /id="category-rule-backup-file"[^>]*accept="\.csv,text\/csv"/);
  assert.match(html, /id="export-other-categories"/);
  assert.match(html, /id="category-correction-file"[^>]*accept="\.csv,text\/csv"/);
  assert.match(html, /id="transaction-dialog"/);
  assert.match(html, /id="transaction-merchant-filter"/);
  assert.match(html, /利用店・チェーンで絞る/);
  assert.match(html, /id="transaction-period-filter"/);
  assert.match(html, /id="transaction-filter-total"/);
  assert.match(html, /id="transaction-filter-count"/);
  assert.match(html, /取引先／利用店/);
  assert.match(html, /品名がない場合/);
  assert.equal(html.indexOf("auth.js") < html.indexOf("script.js"), true);
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="signup-form"/);
  assert.match(html, /id="confirm-form"/);
  assert.match(html, /結果から分かること/);
  assert.match(css, /repeating-linear-gradient\(to top/);
  assert.match(css, /\.trend-scale/);
  assert.match(css, /comparisonReveal/);
  assert.match(html, /id="month-over-month-metric"/);
  assert.match(css, /--expense-increase: #b52d38/);
  assert.match(css, /--expense-decrease: #1d63a5/);
  assert.match(css, /\.metric-change\.is-increase/);
  assert.match(css, /\.metric-change\.is-decrease/);
  assert.match(script, /getMonthChangeState/);
  assert.match(script, /直近1年間のまとめ/);
  assert.match(script, /読み込んだ全期間のまとめ/);
  assert.match(script, /"#79dfb8"/);
  assert.equal(script.includes("total_expense / 1000"), false);
  assert.match(css, /\.donut b\.is-very-long/);
  const uploadPanel = html.slice(html.indexOf('id="control-panel"'), html.indexOf('class="result-area"'));
  const reportPanel = html.slice(html.indexOf('class="result-area"'), html.indexOf('id="transaction-dialog"'));
  assert.doesNotMatch(uploadPanel, /id="month-select"/);
  assert.match(reportPanel, /id="month-select"/);
  assert.equal(reportPanel.indexOf('id="dashboard-title"') < reportPanel.indexOf('id="report-period-control"'), true);
  assert.equal(reportPanel.indexOf('id="report-period-control"') < reportPanel.indexOf('id="comparison-control"'), true);
  assert.equal(reportPanel.indexOf('id="comparison-control"') < reportPanel.indexOf('id="detail-actions"'), true);
});

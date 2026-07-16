const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../comparison-data.js");
const core = require("../script.js");

test("generated comparison data contains separate aggregate-only payment cohorts", () => {
  const comparison = global.window.SPENDOPS_COMPARISON_DATA;
  const serialized = JSON.stringify(comparison);
  assert.equal(comparison.dataset, "synthetic-payment-cohorts-v1");
  assert.equal(comparison.participant_count, 120);
  assert.equal(comparison.sources.PAYPAY.participant_count, 120);
  assert.equal(comparison.sources.CARD.participant_count, 120);
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
  assert.equal(groupReport.comparison.status, "PayPay比較・合成120人");
  assert.equal(personalReport.comparison.type, "personal");
  assert.equal(Number.isFinite(personalReport.comparison.value), true);
});

test("repository card data uses the card-only comparison cohort", () => {
  const directory = path.resolve(__dirname, "..", "..", "csv", "jcb");
  const fileName = fs.readdirSync(directory).find((name) => name.toLowerCase().endsWith(".csv"));
  const bytes = fs.readFileSync(path.join(directory, fileName));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const analysis = core.buildLocalAnalysis(core.parseCsv(core.decodeCsv(buffer).text), fileName);
  const report = core.buildLocalReport(analysis, analysis.defaultMonth);
  assert.equal(report.comparison.status, "クレジットカード比較・合成120人");
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
  assert.match(html, /id="category-view"[^>]*aria-pressed="true"/);
  assert.match(html, /id="payment-view"/);
  assert.match(html, /id="scope-switch"/);
  assert.match(html, /id="all-scope"/);
  assert.match(html, />全支払い</);
  assert.match(html, /id="open-transactions"/);
  assert.match(html, /id="transaction-dialog"/);
  assert.match(html, /取引先／利用店/);
  assert.match(html, /CSVに商品名がない場合/);
  assert.equal(html.indexOf("auth.js") < html.indexOf("script.js"), true);
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="signup-form"/);
  assert.match(html, /id="confirm-form"/);
  assert.equal(html.indexOf("insight-panel") < html.indexOf("source-panel"), true);
  assert.match(css, /\.source-panel\s*\{[^}]*max-height:\s*145px/s);
  assert.equal(script.includes("total_expense / 1000"), false);
  assert.match(css, /\.donut b\.is-very-long/);
});

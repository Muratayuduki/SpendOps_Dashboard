const fs = require("node:fs");
const path = require("node:path");

const {
  parseCsv,
  decodeCsv,
  buildLocalAnalysis,
  parseFilePeriod,
  detectPartialMonths,
} = require("./script.js");

const csvRoot = path.resolve(__dirname, "..", "csv");
const outputPath = path.resolve(__dirname, "comparison-data.js");
const AGE_BANDS = ["20代", "30代", "40代", "50代", "60代"];
const GENDER_GROUPS = ["女性", "男性"];
const PARTICIPANTS_PER_SEGMENT = 12;
const MINIMUM_COMPARISON_PARTICIPANTS = 20;

function readAnalysis(filePath) {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const decoded = decodeCsv(arrayBuffer);
  return buildLocalAnalysis(parseCsv(decoded.text), path.basename(filePath));
}

function toMonthSummary(transactions, partialMonths) {
  const months = new Map();
  transactions.forEach((transaction) => {
    const month = transaction.date.slice(0, 7);
    if (partialMonths.has(month)) return;
    const current = months.get(month) || { total: 0, count: 0, categories: new Map() };
    current.total += transaction.amount;
    current.count += 1;
    current.categories.set(
      transaction.category,
      (current.categories.get(transaction.category) || 0) + transaction.amount,
    );
    months.set(month, current);
  });
  return months;
}

function loadParticipants() {
  return fs
    .readdirSync(csvRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((directory, index) => {
      const directoryPath = path.join(csvRoot, directory.name);
      const files = fs
        .readdirSync(directoryPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
        .map((entry) => path.join(directoryPath, entry.name));

      const analyses = [];
      const skippedFiles = [];
      files.forEach((filePath) => {
        try {
          analyses.push(readAnalysis(filePath));
        } catch (error) {
          skippedFiles.push({ filePath, reason: error instanceof Error ? error.message : String(error) });
        }
      });

      const seen = new Set();
      const transactions = [];
      analyses.flatMap((analysis) => analysis.transactions).forEach((transaction) => {
        const key = transaction.dedupKey || [transaction.date, transaction.amount, transaction.category, transaction.source].join("|");
        if (seen.has(key)) return;
        seen.add(key);
        transactions.push(transaction);
      });

      const months = [...new Set(transactions.map((item) => item.date.slice(0, 7)))].sort();
      const explicitPeriods = files.map((filePath) => parseFilePeriod(path.basename(filePath))).filter(Boolean);
      let partialMonths = new Set();
      if (explicitPeriods.length) {
        const period = {
          start: explicitPeriods.map((item) => item.start).sort()[0],
          end: explicitPeriods.map((item) => item.end).sort().at(-1),
        };
        partialMonths = detectPartialMonths(months, period);
      }

      return {
        id: `dummy-${String(index + 1).padStart(2, "0")}`,
        sourceGroup: directory.name,
        months: toMonthSummary(transactions, partialMonths),
        loadedFileCount: analyses.length,
        skippedFileCount: skippedFiles.length,
        skipReasons: skippedFiles.map((item) => item.reason),
      };
    });
}

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(key) {
  let value = hashString(key) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967295;
}

function deterministicFactor(key, amplitude) {
  return 1 + (deterministicUnit(key) * 2 - 1) * amplitude;
}

function monthNumber(month) {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
}

function nearestMonthSummary(months, targetMonth) {
  return [...months.entries()].sort((left, right) => {
    const leftDistance = Math.abs(monthNumber(left[0]) - monthNumber(targetMonth));
    const rightDistance = Math.abs(monthNumber(right[0]) - monthNumber(targetMonth));
    return leftDistance - rightDistance || left[0].localeCompare(right[0]);
  })[0]?.[1] || null;
}

function buildSyntheticCohort(seedParticipants, cohortKey) {
  const monthNames = [...new Set(seedParticipants.flatMap((participant) => [...participant.months.keys()]))].sort();
  const cohort = [];

  AGE_BANDS.forEach((ageBand, ageIndex) => {
    GENDER_GROUPS.forEach((genderGroup, genderIndex) => {
      const segmentIndex = ageIndex * GENDER_GROUPS.length + genderIndex;
      for (let replica = 0; replica < PARTICIPANTS_PER_SEGMENT; replica += 1) {
        const seedIndex = (segmentIndex + replica) % seedParticipants.length;
        const seed = seedParticipants[seedIndex];
        const participantKey = `${cohortKey}|${ageBand}|${genderGroup}|${replica}|${seedIndex}`;
        const participantFactor = deterministicFactor(`${participantKey}|person`, 0.22);
        const months = new Map();

        monthNames.forEach((month) => {
          const summary = seed.months.get(month) || nearestMonthSummary(seed.months, month);
          if (!summary) return;
          const monthFactor = deterministicFactor(`${participantKey}|${month}`, 0.12);
          const categories = new Map();

          summary.categories.forEach((amount, category) => {
            const categoryFactor = deterministicFactor(`${participantKey}|${month}|${category}`, 0.08);
            categories.set(category, Math.max(1, Math.round(amount * participantFactor * monthFactor * categoryFactor)));
          });

          const total = [...categories.values()].reduce((sum, amount) => sum + amount, 0);
          if (!total) return;
          months.set(month, {
            total,
            count: Math.max(1, Math.round(summary.count * participantFactor * monthFactor)),
            categories,
          });
        });

        cohort.push({ ageBand, genderGroup, months });
      }
    });
  });

  return cohort;
}

function buildSourceData(seedParticipants, sourceType, label) {
  const participants = buildSyntheticCohort(seedParticipants, sourceType);
  const monthNames = [...new Set(participants.flatMap((participant) => [...participant.months.keys()]))].sort();
  const months = {};
  const allPersonMonths = [];
  const overallCategories = new Map();

  monthNames.forEach((month) => {
    const available = participants
      .map((participant) => participant.months.get(month))
      .filter(Boolean);
    if (!available.length) return;
    available.forEach((summary) => allPersonMonths.push(summary.total));

    const categoryNames = [...new Set(available.flatMap((summary) => [...summary.categories.keys()]))];
    const categoryAverages = {};
    categoryNames.forEach((category) => {
      const total = available.reduce((sum, summary) => sum + (summary.categories.get(category) || 0), 0);
      categoryAverages[category] = Math.round(total / available.length);
      overallCategories.set(category, (overallCategories.get(category) || 0) + total);
    });

    months[month] = {
      average_total: average(available.map((summary) => summary.total)),
      participant_count: available.length,
      category_averages: categoryAverages,
    };
  });

  const overallDenominator = Math.max(allPersonMonths.length, 1);
  return {
    source_type: sourceType,
    label,
    eligible: participants.length >= MINIMUM_COMPARISON_PARTICIPANTS,
    participant_count: participants.length,
    cohort: {
      kind: "deterministic-synthetic",
      reference_only: true,
      seed_profile_count: seedParticipants.length,
      age_band_count: AGE_BANDS.length,
      gender_group_count: GENDER_GROUPS.length,
      segment_count: AGE_BANDS.length * GENDER_GROUPS.length,
      participants_per_segment: PARTICIPANTS_PER_SEGMENT,
      observation_month_count: allPersonMonths.length,
    },
    monthly_average: average(allPersonMonths),
    category_averages: Object.fromEntries(
      [...overallCategories.entries()].map(([name, total]) => [name, Math.round(total / overallDenominator)]),
    ),
    months,
  };
}

function buildComparisonData(seedParticipants) {
  const payPaySeeds = seedParticipants.filter((participant) => participant.sourceGroup.toLowerCase() === "paypay");
  const cardSeeds = seedParticipants.filter((participant) => ["jcb", "visa"].includes(participant.sourceGroup.toLowerCase()));
  if (!payPaySeeds.length || !cardSeeds.length) {
    throw new Error("PayPayとクレジットカードの比較用シードを読み込めませんでした。");
  }

  const cohortSize = AGE_BANDS.length * GENDER_GROUPS.length * PARTICIPANTS_PER_SEGMENT;
  return {
    dataset: "synthetic-payment-cohorts-v1",
    participant_count: cohortSize,
    cohort: {
      kind: "deterministic-synthetic",
      reference_only: true,
      age_band_count: AGE_BANDS.length,
      gender_group_count: GENDER_GROUPS.length,
      segment_count: AGE_BANDS.length * GENDER_GROUPS.length,
      participants_per_segment: PARTICIPANTS_PER_SEGMENT,
    },
    sources: {
      PAYPAY: buildSourceData(payPaySeeds, "PAYPAY", "PayPay"),
      CARD: buildSourceData(cardSeeds, "CARD", "クレジットカード"),
      ALL: buildSourceData(seedParticipants, "ALL", "全支払い方法"),
    },
  };
}

const candidates = loadParticipants();
const participants = candidates.filter((participant) => participant.months.size > 0);
if (participants.length < 2) {
  throw new Error("比較用ダミー参加者を2人以上読み込めませんでした。");
}

const comparison = buildComparisonData(participants);
fs.writeFileSync(
  outputPath,
  `window.SPENDOPS_COMPARISON_DATA = ${JSON.stringify(comparison, null, 2)};\n`,
  "utf8",
);

const skippedCount = candidates.reduce((sum, participant) => sum + participant.skippedFileCount, 0);
const inactiveGroups = candidates.filter((participant) => participant.months.size === 0).map((participant) => participant.sourceGroup);
console.log(
  `Comparison aggregate generated: ${comparison.participant_count} synthetic participants per payment cohort from ${participants.length} seed profiles, ${skippedCount} skipped files.`,
);
if (inactiveGroups.length) console.log(`No valid monthly data: ${inactiveGroups.join(", ")}`);
const skipReasons = [...new Set(candidates.flatMap((participant) => participant.skipReasons))];
if (skipReasons.length) console.log(`Skip reason: ${skipReasons.join(" / ")}`);

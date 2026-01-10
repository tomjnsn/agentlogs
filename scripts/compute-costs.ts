/**
 * Cost Estimation Script for VibeInsights Infrastructure
 *
 * Calculates monthly infrastructure costs based on:
 * - Cloudflare R2 (storage + operations)
 * - Cloudflare D1 (database reads/writes + storage)
 * - Cloudflare Workers (requests + CPU time)
 *
 * Run with: bun scripts/compute-costs.ts
 */

// ============================================================================
// CONFIGURABLE PARAMETERS - Tweak these!
// ============================================================================

const config = {
  // Customer usage
  commitsPerMonth: 250,
  sessionsPerCommit: 1, // Assuming 1 Claude Code session per commit

  // Average session data sizes (bytes)
  avgUnifiedJsonSize: 100 * 1024, // ~100 KB - unified transcript JSON
  avgRawJsonlSize: 500 * 1024, // ~500 KB - raw JSONL before compression
  gzipCompressionRatio: 0.35, // Gzip typically achieves 30-40% of original

  // D1 database operations per session
  d1RowsWrittenPerSession: 2, // transcript + possible repo upsert
  d1RowsReadPerSession: 5, // duplicate check, repo lookup, etc.

  // Workers CPU time (milliseconds per request)
  avgCpuMsPerIngest: 50, // Parsing, hashing, gzip, R2 uploads
  avgCpuMsPerRead: 10, // Reading transcript data

  // Read patterns (how often data is accessed after upload)
  readsPerSessionPerMonth: 3, // User views each session ~3 times/month

  // Data retention
  dataRetentionMonths: 12, // How long data accumulates

  // Number of customers (for context)
  numberOfCustomers: 1,
};

// ============================================================================
// CLOUDFLARE PRICING (as of Jan 2025)
// ============================================================================

const pricing = {
  // R2 Storage
  r2: {
    storagePerGbMonth: 0.015, // $0.015/GB/month
    classAPerMillion: 4.5, // PUT, POST, LIST - $4.50 per million
    classBPerMillion: 0.36, // GET, HEAD - $0.36 per million
    egressPerGb: 0, // Free egress!
  },

  // D1 Database
  d1: {
    rowsReadPerMillion: 0.001, // $0.001 per million rows read
    rowsWrittenPerMillion: 0.25, // $0.25 per million rows written
    storagePerGbMonth: 0.75, // $0.75/GB/month (first 5GB free on paid)
    freeStorageGb: 5, // 5GB free
  },

  // Workers
  workers: {
    requestsPerMillion: 0.3, // $0.30 per million requests
    cpuMsPerMillion: 0.02, // $0.02 per million milliseconds
    freeRequestsPerMonth: 10_000_000, // 10M free on paid plan
    freeCpuMsPerMonth: 30_000_000, // 30M ms free
  },
};

// ============================================================================
// CALCULATIONS
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatCurrency(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(6)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function calculateCosts() {
  const sessionsPerMonth = config.commitsPerMonth * config.sessionsPerCommit;
  const totalCustomerSessions = sessionsPerMonth * config.numberOfCustomers;

  console.log("═".repeat(70));
  console.log("VIBEINSIGHTS INFRASTRUCTURE COST ESTIMATION");
  console.log("═".repeat(70));
  console.log();

  // -------------------------------------------------------------------------
  // Session Data Sizes
  // -------------------------------------------------------------------------
  console.log("📊 SESSION DATA PROFILE");
  console.log("-".repeat(70));

  const compressedRawSize = Math.round(config.avgRawJsonlSize * config.gzipCompressionRatio);
  const totalStoragePerSession = config.avgUnifiedJsonSize + compressedRawSize;
  const d1StoragePerSession = 500; // ~500 bytes per D1 row (rough estimate)

  console.log(`  Unified JSON (per session):     ${formatBytes(config.avgUnifiedJsonSize)}`);
  console.log(`  Raw JSONL (before gzip):        ${formatBytes(config.avgRawJsonlSize)}`);
  console.log(`  Raw JSONL (after gzip):         ${formatBytes(compressedRawSize)}`);
  console.log(`  Total R2 storage per session:   ${formatBytes(totalStoragePerSession)}`);
  console.log(`  D1 storage per session:         ${formatBytes(d1StoragePerSession)}`);
  console.log();

  // -------------------------------------------------------------------------
  // Monthly Usage
  // -------------------------------------------------------------------------
  console.log("📈 MONTHLY USAGE (per customer)");
  console.log("-".repeat(70));
  console.log(`  Commits per month:              ${config.commitsPerMonth}`);
  console.log(`  Sessions per month:             ${sessionsPerMonth}`);
  console.log();

  // -------------------------------------------------------------------------
  // R2 Costs
  // -------------------------------------------------------------------------
  console.log("☁️  CLOUDFLARE R2 COSTS");
  console.log("-".repeat(70));

  // Monthly new storage
  const monthlyNewStorageBytes = sessionsPerMonth * totalStoragePerSession;
  const monthlyNewStorageGb = monthlyNewStorageBytes / (1024 * 1024 * 1024);

  // Accumulated storage (for retention period)
  const accumulatedStorageGb = monthlyNewStorageGb * Math.min(config.dataRetentionMonths, 12);

  // R2 operations
  const r2ClassAOps = sessionsPerMonth * 2; // 2 PUTs per session (unified + raw)
  const r2ClassBOps = sessionsPerMonth * config.readsPerSessionPerMonth * 2; // 2 GETs per read

  // R2 costs
  const r2StorageCost = accumulatedStorageGb * pricing.r2.storagePerGbMonth;
  const r2ClassACost = (r2ClassAOps / 1_000_000) * pricing.r2.classAPerMillion;
  const r2ClassBCost = (r2ClassBOps / 1_000_000) * pricing.r2.classBPerMillion;
  const r2TotalCost = r2StorageCost + r2ClassACost + r2ClassBCost;

  console.log(
    `  New data per month:             ${formatBytes(monthlyNewStorageBytes)} (${monthlyNewStorageGb.toFixed(4)} GB)`,
  );
  console.log(`  Accumulated storage (${config.dataRetentionMonths}mo):    ${accumulatedStorageGb.toFixed(4)} GB`);
  console.log(`  Class A ops (PUT):              ${r2ClassAOps.toLocaleString()} ops`);
  console.log(`  Class B ops (GET):              ${r2ClassBOps.toLocaleString()} ops`);
  console.log();
  console.log(`  Storage cost:                   ${formatCurrency(r2StorageCost)}/month`);
  console.log(`  Class A cost:                   ${formatCurrency(r2ClassACost)}/month`);
  console.log(`  Class B cost:                   ${formatCurrency(r2ClassBCost)}/month`);
  console.log(`  R2 TOTAL:                       ${formatCurrency(r2TotalCost)}/month`);
  console.log();

  // -------------------------------------------------------------------------
  // D1 Costs
  // -------------------------------------------------------------------------
  console.log("🗄️  CLOUDFLARE D1 COSTS");
  console.log("-".repeat(70));

  const d1RowsWritten = sessionsPerMonth * config.d1RowsWrittenPerSession;
  const d1RowsRead =
    sessionsPerMonth * config.d1RowsReadPerSession + sessionsPerMonth * config.readsPerSessionPerMonth * 3; // reads when viewing

  const d1StorageBytes = sessionsPerMonth * d1StoragePerSession * config.dataRetentionMonths;
  const d1StorageGb = d1StorageBytes / (1024 * 1024 * 1024);
  const d1BillableStorageGb = Math.max(0, d1StorageGb - pricing.d1.freeStorageGb);

  const d1WriteCost = (d1RowsWritten / 1_000_000) * pricing.d1.rowsWrittenPerMillion;
  const d1ReadCost = (d1RowsRead / 1_000_000) * pricing.d1.rowsReadPerMillion;
  const d1StorageCost = d1BillableStorageGb * pricing.d1.storagePerGbMonth;
  const d1TotalCost = d1WriteCost + d1ReadCost + d1StorageCost;

  console.log(`  Rows written per month:         ${d1RowsWritten.toLocaleString()}`);
  console.log(`  Rows read per month:            ${d1RowsRead.toLocaleString()}`);
  console.log(`  Accumulated D1 storage:         ${d1StorageGb.toFixed(6)} GB`);
  console.log(`  Billable storage (after 5GB):   ${d1BillableStorageGb.toFixed(6)} GB`);
  console.log();
  console.log(`  Write cost:                     ${formatCurrency(d1WriteCost)}/month`);
  console.log(`  Read cost:                      ${formatCurrency(d1ReadCost)}/month`);
  console.log(`  Storage cost:                   ${formatCurrency(d1StorageCost)}/month`);
  console.log(`  D1 TOTAL:                       ${formatCurrency(d1TotalCost)}/month`);
  console.log();

  // -------------------------------------------------------------------------
  // Workers Costs
  // -------------------------------------------------------------------------
  console.log("⚡ CLOUDFLARE WORKERS COSTS");
  console.log("-".repeat(70));

  const ingestRequests = sessionsPerMonth;
  const readRequests = sessionsPerMonth * config.readsPerSessionPerMonth;
  const totalRequests = ingestRequests + readRequests;

  const ingestCpuMs = ingestRequests * config.avgCpuMsPerIngest;
  const readCpuMs = readRequests * config.avgCpuMsPerRead;
  const totalCpuMs = ingestCpuMs + readCpuMs;

  // Apply free tier (these are per-account, not per-customer, but let's show marginal cost)
  const billableRequests = totalRequests; // Assuming we're past free tier with multiple customers
  const billableCpuMs = totalCpuMs;

  const workerRequestCost = (billableRequests / 1_000_000) * pricing.workers.requestsPerMillion;
  const workerCpuCost = (billableCpuMs / 1_000_000) * pricing.workers.cpuMsPerMillion;
  const workersTotalCost = workerRequestCost + workerCpuCost;

  console.log(`  Ingest requests:                ${ingestRequests.toLocaleString()}`);
  console.log(`  Read requests:                  ${readRequests.toLocaleString()}`);
  console.log(`  Total requests:                 ${totalRequests.toLocaleString()}`);
  console.log(`  Total CPU time:                 ${totalCpuMs.toLocaleString()} ms`);
  console.log();
  console.log(`  Request cost:                   ${formatCurrency(workerRequestCost)}/month`);
  console.log(`  CPU time cost:                  ${formatCurrency(workerCpuCost)}/month`);
  console.log(`  Workers TOTAL:                  ${formatCurrency(workersTotalCost)}/month`);
  console.log();

  // -------------------------------------------------------------------------
  // Total Costs
  // -------------------------------------------------------------------------
  const totalMonthlyCost = r2TotalCost + d1TotalCost + workersTotalCost;
  const costPerSession = totalMonthlyCost / sessionsPerMonth;
  const costPerCommit = totalMonthlyCost / config.commitsPerMonth;

  console.log("═".repeat(70));
  console.log("💰 TOTAL INFRASTRUCTURE COST (per customer)");
  console.log("═".repeat(70));
  console.log();
  console.log(`  R2 (storage + ops):             ${formatCurrency(r2TotalCost)}/month`);
  console.log(`  D1 (database):                  ${formatCurrency(d1TotalCost)}/month`);
  console.log(`  Workers (compute):              ${formatCurrency(workersTotalCost)}/month`);
  console.log();
  console.log(`  TOTAL MONTHLY:                  ${formatCurrency(totalMonthlyCost)}/month`);
  console.log(`  TOTAL YEARLY:                   ${formatCurrency(totalMonthlyCost * 12)}/year`);
  console.log();
  console.log(`  Cost per session:               ${formatCurrency(costPerSession)}`);
  console.log(`  Cost per commit:                ${formatCurrency(costPerCommit)}`);
  console.log();

  // -------------------------------------------------------------------------
  // Scaling projections
  // -------------------------------------------------------------------------
  console.log("═".repeat(70));
  console.log("📊 SCALING PROJECTIONS");
  console.log("═".repeat(70));
  console.log();
  console.log("  Customers    Monthly Cost    Yearly Cost     Cost/Customer");
  console.log("  ---------    ------------    -----------     -------------");

  for (const numCustomers of [1, 10, 50, 100, 500, 1000]) {
    // Scale storage and operations linearly
    const scaledR2Storage = accumulatedStorageGb * numCustomers * pricing.r2.storagePerGbMonth;
    const scaledR2Ops =
      ((r2ClassAOps * numCustomers) / 1_000_000) * pricing.r2.classAPerMillion +
      ((r2ClassBOps * numCustomers) / 1_000_000) * pricing.r2.classBPerMillion;

    const scaledD1Ops =
      ((d1RowsWritten * numCustomers) / 1_000_000) * pricing.d1.rowsWrittenPerMillion +
      ((d1RowsRead * numCustomers) / 1_000_000) * pricing.d1.rowsReadPerMillion;

    // D1 storage scales but has 5GB free
    const totalD1StorageGb = d1StorageGb * numCustomers;
    const billableD1Gb = Math.max(0, totalD1StorageGb - pricing.d1.freeStorageGb);
    const scaledD1Storage = billableD1Gb * pricing.d1.storagePerGbMonth;

    const scaledWorkers =
      ((totalRequests * numCustomers) / 1_000_000) * pricing.workers.requestsPerMillion +
      ((totalCpuMs * numCustomers) / 1_000_000) * pricing.workers.cpuMsPerMillion;

    const scaledTotal = scaledR2Storage + scaledR2Ops + scaledD1Ops + scaledD1Storage + scaledWorkers;
    const perCustomer = scaledTotal / numCustomers;

    console.log(
      `  ${numCustomers.toString().padStart(5)}          ${formatCurrency(scaledTotal).padStart(10)}      ${formatCurrency(scaledTotal * 12).padStart(10)}       ${formatCurrency(perCustomer).padStart(10)}`,
    );
  }

  console.log();

  // -------------------------------------------------------------------------
  // Long-term projections (10 years)
  // -------------------------------------------------------------------------
  console.log("═".repeat(70));
  console.log("📅 10-YEAR PROJECTION (per customer, data accumulates)");
  console.log("═".repeat(70));
  console.log();
  console.log("  Year    Accumulated Storage    Monthly Cost    Cumulative Paid");
  console.log("  ----    -------------------    ------------    ---------------");

  let cumulativePaid = 0;
  for (let year = 1; year <= 10; year++) {
    const months = year * 12;
    const accStorageGb = monthlyNewStorageGb * months;
    const accD1StorageGb = (sessionsPerMonth * d1StoragePerSession * months) / (1024 * 1024 * 1024);

    // R2 costs at this accumulation level
    const yearR2Storage = accStorageGb * pricing.r2.storagePerGbMonth;
    const yearR2Ops = r2ClassACost + r2ClassBCost; // ops are per-month, not cumulative

    // D1 costs
    const yearD1BillableGb = Math.max(0, accD1StorageGb - pricing.d1.freeStorageGb);
    const yearD1Storage = yearD1BillableGb * pricing.d1.storagePerGbMonth;
    const yearD1Ops = d1WriteCost + d1ReadCost;

    // Workers (constant per month)
    const yearWorkers = workersTotalCost;

    const monthlyAtYear = yearR2Storage + yearR2Ops + yearD1Storage + yearD1Ops + yearWorkers;

    // Approximate cumulative: average monthly cost over the year * 12
    // Storage grows linearly, so average storage in year N is midpoint
    const avgStorageInYear = monthlyNewStorageGb * ((year - 1) * 12 + 6);
    const avgMonthlyCostInYear = avgStorageInYear * pricing.r2.storagePerGbMonth + yearR2Ops + yearD1Ops + yearWorkers;
    cumulativePaid += avgMonthlyCostInYear * 12;

    console.log(
      `  ${year.toString().padStart(2)}        ${formatBytes(accStorageGb * 1024 * 1024 * 1024).padStart(16)}      ${formatCurrency(monthlyAtYear).padStart(10)}      ${formatCurrency(cumulativePaid).padStart(13)}`,
    );
  }

  console.log();
  console.log("  * Monthly cost increases as storage accumulates");
  console.log("  * Cumulative = total $ paid from year 1 to that year");
  console.log();

  console.log("═".repeat(70));
  console.log("NOTE: These are marginal infrastructure costs only.");
  console.log("Does not include: base Cloudflare subscription, development time,");
  console.log("auth services, monitoring, or other operational costs.");
  console.log("═".repeat(70));
}

// Run calculations
calculateCosts();

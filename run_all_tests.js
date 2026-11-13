// ============================================================================
// Exo Academic Platform — Phase 4.2.1 Categorized Verification & Test Runner
// Strictly separates results into 5 distinct verification tiers:
//   1. Production Cryptographic (Web Crypto PBKDF2) & Static Security Checks
//   2. Unit & Asynchronous Logic Isolation Tests
//   3. Embedded PostgreSQL Compatibility Tests (PGlite WASM Single-Connection)
//   4. Real PostgreSQL 16 Server Integration & Multi-Connection Concurrency Proof
//   5. Real Headless Chromium + IndexedDB Browser E2E Tests (Scenarios A–N)
// ============================================================================

const { spawnSync } = require('child_process');

const SUITES = [
  {
    category: '1. Cryptographic (Web Crypto PBKDF2) & Static Security Checks',
    file: 'run_verification_tests.js'
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'run_comprehensive_verification.js'
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'test_phase3_cross_account_isolation.js'
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'test_phase4_regressions.js'
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'test_wp6_1_unit.js',
    useNodeTest: true
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'test_wp6_2_unit.js',
    useNodeTest: true
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'test_wp6_3_unit.js',
    useNodeTest: true
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'test_wp6_4_unit.js',
    useNodeTest: true
  },
  {
    category: '2. Unit & Asynchronous Logic Isolation Tests',
    file: 'test_wp6_5_unit.js',
    useNodeTest: true
  },
  {
    category: '3. Embedded PostgreSQL Compatibility Tests (PGlite WASM Single-Connection)',
    file: 'test_phase4_2_postgres_integration.js'
  },
  {
    category: '4. Real PostgreSQL 16 Server Concurrency & 10-Point Schema Parity Proof',
    file: 'test_phase4_2_1_pg16_concurrency.js'
  },
  {
    category: '5. Real Headless Chromium + IndexedDB Browser E2E Tests (Scenarios A–N)',
    file: 'test_phase4_1_chromium_e2e.js'
  }
];

function parsePassFailCounts(stdout, useNodeTest = false) {
  if (useNodeTest) {
    const passMatch = stdout.match(/^#\s*pass\s+(\d+)/im);
    const failMatch = stdout.match(/^#\s*fail\s+(\d+)/im);
    if (passMatch || failMatch) {
      return {
        passed: passMatch ? Number(passMatch[1]) : 0,
        failed: failMatch ? Number(failMatch[1]) : 0
      };
    }
  }
  const regex = /PASSED:\s*(\d+)\s*\|\s*FAILED:\s*(\d+)/i;
  const match = stdout.match(regex);
  if (match) {
    return { passed: Number(match[1]), failed: Number(match[2]) };
  }
  return { passed: 0, failed: 0 };
}

function main() {
  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let anySuiteExitFailure = false;

  for (const suite of SUITES) {
    console.log(`\n>>> Running [${suite.category}] -> ${suite.file} ...`);
    const args = suite.useNodeTest ? ['--test', '--test-reporter=tap', suite.file] : [suite.file];
    const proc = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (proc.stdout) process.stdout.write(proc.stdout);
    if (proc.stderr) process.stderr.write(proc.stderr);

    const counts = parsePassFailCounts(proc.stdout || '', Boolean(suite.useNodeTest));
    const status = proc.status === 0 && counts.failed === 0 && (!suite.useNodeTest || counts.passed > 0) ? 'PASS' : 'FAIL';
    if (status !== 'PASS') anySuiteExitFailure = true;

    totalPassed += counts.passed;
    totalFailed += counts.failed;

    results.push({
      category: suite.category,
      file: suite.file,
      passed: counts.passed,
      failed: counts.failed,
      status
    });
  }

  console.log('\n========================================================================================');
  console.log('EXO PHASE 4.2.1 — CATEGORIZED TEST EXECUTION SUMMARY');
  console.log('========================================================================================');
  for (const r of results) {
    console.log(
      `[${r.status}] ${r.file.padEnd(38)} | Passed: ${String(r.passed).padStart(3)} | Failed: ${String(r.failed).padStart(2)} | ${r.category}`
    );
  }
  console.log('----------------------------------------------------------------------------------------');
  console.log(`GRAND TOTAL ASSERTIONS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
  console.log('========================================================================================\n');

  if (anySuiteExitFailure || totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();

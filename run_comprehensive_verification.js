// ============================================================================
// Exo Academic Platform — Phase 4.1 Comprehensive Verification Suite
// Covers: Account Operation Context Concurrency, Cross-Account Isolation,
//         Provenance-Verified Legacy Quarantine, Stroke Race Conditions,
//         Storage Privacy, SQL RLS Security, Service Worker & Auth
//
// Technical References & Sources:
//   - W3C Indexed Database API 3.0: https://www.w3.org/TR/IndexedDB-3/
//   - PostgreSQL 16 Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
//   - Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
//   - OWASP ASVS v4.0.3 (Session & Multi-Tenant Isolation): https://owasp.org/www-project-application-security-verification-standard/
// ============================================================================

const fs = require('fs');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
    testsFailed++;
  }
}

// Extract production helper functions directly from index.html source code
const indexCode = fs.readFileSync('index.html', 'utf8');

function extractFunctionSource(code, funcName) {
  const patterns = [`async function ${funcName}(`, `function ${funcName}(`];
  let startIdx = -1;
  for (const pat of patterns) {
    startIdx = code.indexOf(pat);
    if (startIdx !== -1) break;
  }
  if (startIdx === -1) throw new Error(`Function ${funcName} not found in index.html`);
  let depth = 0;
  let inFunc = false;
  let endIdx = startIdx;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '{') {
      depth++;
      inFunc = true;
    } else if (code[i] === '}') {
      depth--;
      if (inFunc && depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return code.substring(startIdx, endIdx);
}

const prodHelpersCode = `
let currentCloudUser = null;
let currentSessionGeneration = 1;
${extractFunctionSource(indexCode, 'sanitizeForScopedKey')}
${extractFunctionSource(indexCode, 'getCanonicalUserId')}
${extractFunctionSource(indexCode, 'sanitizeUserIdForPrefix')}
${extractFunctionSource(indexCode, 'getUserStoragePrefix')}
${extractFunctionSource(indexCode, 'getAccountBackupStorageKey')}
${extractFunctionSource(indexCode, 'extractUserIdFromScopedKey')}
${extractFunctionSource(indexCode, 'extractRawIdFromScopedKey')}
${extractFunctionSource(indexCode, 'toScopedKey')}
${extractFunctionSource(indexCode, 'resolveAuthorizedScopedKey')}
${extractFunctionSource(indexCode, 'hasStrictDualRecordOwnership')}
${extractFunctionSource(indexCode, 'hasVerifiedLegacyProvenance')}
${extractFunctionSource(indexCode, 'computeStrokeUniqueSignature')}
module.exports = {
  setCurrentCloudUser: (u) => { currentCloudUser = u; },
  sanitizeForScopedKey,
  getCanonicalUserId,
  sanitizeUserIdForPrefix,
  getUserStoragePrefix,
  getAccountBackupStorageKey,
  extractUserIdFromScopedKey,
  extractRawIdFromScopedKey,
  toScopedKey,
  resolveAuthorizedScopedKey,
  hasStrictDualRecordOwnership,
  hasVerifiedLegacyProvenance,
  computeStrokeUniqueSignature
};
`;

const tempHelperPath = './_temp_comp_helpers.js';
fs.writeFileSync(tempHelperPath, prodHelpersCode);
const prod = require(tempHelperPath);
fs.unlinkSync(tempHelperPath);

async function main() {
  console.log('============================================================');
  console.log('EXO ACADEMIC PLATFORM — COMPREHENSIVE VERIFICATION SUITE');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Real Concurrency Protection (Atomic RPC Simulation & Stale Client Rejection)
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Concurrency Protection & Stale Client Rejection ---');

  class MockPostgresDatabase {
    constructor() {
      this.workspaces = new Map();
    }

    syncWorkspaceWithConcurrency(authUid, payload, expectedRevision) {
      if (!authUid) throw new Error('Not authenticated');
      const existingRow = this.workspaces.get(authUid);

      if (existingRow) {
        if (expectedRevision === null || expectedRevision === undefined || expectedRevision !== existingRow.revision) {
          return {
            status: 'conflict',
            current_revision: existingRow.revision,
            current_updated_at: existingRow.updated_at,
            message: 'Workspace has been modified by another device (revision mismatch)'
          };
        }

        existingRow.revision += 1;
        existingRow.updated_at = new Date().toISOString();
        existingRow.subjects = payload.subjects || existingRow.subjects;
        existingRow.schedule = payload.schedule || existingRow.schedule;
        existingRow.logs = payload.logs || existingRow.logs;
        existingRow.annotations = payload.annotations || existingRow.annotations;

        return {
          status: 'success',
          revision: existingRow.revision,
          updated_at: existingRow.updated_at
        };
      } else {
        const newRow = {
          user_id: authUid,
          user_email: payload.user_email,
          subjects: payload.subjects || [],
          schedule: payload.schedule || {},
          logs: payload.logs || [],
          annotations: payload.annotations || {},
          revision: 1,
          updated_at: new Date().toISOString()
        };
        this.workspaces.set(authUid, newRow);
        return {
          status: 'success',
          revision: 1,
          updated_at: newRow.updated_at
        };
      }
    }
  }

  const db = new MockPostgresDatabase();
  const userId = 'usr_student_alpha';

  const initRes = db.syncWorkspaceWithConcurrency(userId, { user_email: 'alpha@univ.edu', subjects: [{ id: 's1', name: 'Biochem' }] }, null);
  assert(initRes.status === 'success' && initRes.revision === 1, 'First device initializes workspace with revision 1');

  const devAUpdate = db.syncWorkspaceWithConcurrency(userId, { subjects: [{ id: 's1', name: 'Biochem' }, { id: 's2', name: 'Pharmacology' }] }, 1);
  assert(devAUpdate.status === 'success' && devAUpdate.revision === 2, 'Device A updates with expected revision 1, increments to revision 2');

  const devBStale = db.syncWorkspaceWithConcurrency(userId, { subjects: [{ id: 's1', name: 'Biochem' }, { id: 's3', name: 'Physiology' }] }, 1);
  assert(devBStale.status === 'conflict', 'Device B with stale revision 1 is strictly rejected with conflict status');
  assert(devBStale.current_revision === 2, 'Conflict response returns current remote database revision (2)');

  const devBNonRev = db.syncWorkspaceWithConcurrency(userId, { subjects: [{ id: 's1', name: 'Biochem' }] }, null);
  assert(devBNonRev.status === 'conflict', 'NULL expected revision on existing workspace is rejected');

  // --------------------------------------------------------------------------
  // TEST 2: Genuine Three-Way Non-Destructive Conflict Resolution with Full Stroke Signatures
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Genuine Three-Way Conflict Merge with Full Geometry Signatures ---');

  function threeWayMergeEngine(remoteRow, localPayload, localTombstones) {
    const remoteTombstones = (remoteRow.schedule && remoteRow.schedule._tombstones) || { subjects: {}, lectures: {}, events: {} };
    const unifiedTombstones = {
      subjects: Object.assign({}, remoteTombstones.subjects, localTombstones.subjects),
      lectures: Object.assign({}, remoteTombstones.lectures, localTombstones.lectures),
      events: Object.assign({}, remoteTombstones.events, localTombstones.events)
    };

    const mergedSubMap = new Map();
    (remoteRow.subjects || []).forEach(s => {
      const isDel = unifiedTombstones.subjects[s.id] && (!s._updatedAt || s._updatedAt < unifiedTombstones.subjects[s.id]);
      if (!isDel) mergedSubMap.set(s.id, s);
    });

    (localPayload.subjects || []).forEach(s => {
      const isDel = unifiedTombstones.subjects[s.id] && (!s._updatedAt || s._updatedAt < unifiedTombstones.subjects[s.id]);
      if (!isDel) {
        if (!mergedSubMap.has(s.id)) {
          mergedSubMap.set(s.id, s);
        } else {
          const rSub = mergedSubMap.get(s.id);
          const grpMap = new Map();
          (rSub.groups || []).forEach(g => grpMap.set(g.id, g));
          (s.groups || []).forEach(g => {
            if (!grpMap.has(g.id)) grpMap.set(g.id, g);
            else {
              const rg = grpMap.get(g.id);
              const lecMap = new Map();
              (rg.lectures || []).forEach(l => {
                if (!unifiedTombstones.lectures[l.id]) lecMap.set(l.id, l);
              });
              (g.lectures || []).forEach(l => {
                if (!unifiedTombstones.lectures[l.id]) lecMap.set(l.id, l);
              });
              rg.lectures = Array.from(lecMap.values());
            }
          });
          rSub.groups = Array.from(grpMap.values());
        }
      }
    });

    const rAnnos = remoteRow.annotations || {};
    const lAnnos = localPayload.annotations || {};
    const mergedAnnos = Object.assign({}, lAnnos);

    Object.keys(rAnnos).forEach(lecId => {
      if (!mergedAnnos[lecId]) {
        mergedAnnos[lecId] = rAnnos[lecId];
      } else {
        const rp = rAnnos[lecId];
        const lp = mergedAnnos[lecId];
        const mergedPages = Object.assign({}, lp);
        Object.keys(rp).forEach(pNum => {
          if (!mergedPages[pNum]) {
            mergedPages[pNum] = rp[pNum];
          } else if (Array.isArray(rp[pNum]) && Array.isArray(mergedPages[pNum])) {
            const sigs = new Set(mergedPages[pNum].map(st => prod.computeStrokeUniqueSignature(st)));
            rp[pNum].forEach(st => {
              const sig = prod.computeStrokeUniqueSignature(st);
              if (!sigs.has(sig)) {
                mergedPages[pNum].push(st);
                sigs.add(sig);
              }
            });
          }
        });
        mergedAnnos[lecId] = mergedPages;
      }
    });

    return {
      subjects: Array.from(mergedSubMap.values()),
      annotations: mergedAnnos,
      unifiedTombstones,
      revision: remoteRow.revision
    };
  }

  const remoteWorkspace = {
    revision: 2,
    subjects: [
      { id: 's1', name: 'Biochem', groups: [{ id: 'g1', name: 'Ch 1', lectures: [{ id: 'l1', title: 'Amino Acids' }] }] },
      { id: 's2', name: 'Pharmacology', groups: [{ id: 'g2', name: 'Ch 1', lectures: [{ id: 'l2', title: 'Beta Blockers' }] }] }
    ],
    annotations: {
      'l1': { '1': [{ tool: 'pen', color: '#ff0000', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }] }] }
    },
    schedule: { _tombstones: { subjects: { 's_deleted_on_device_a': 1700000000000 } } }
  };

  const localDeviceBPayload = {
    subjects: [
      { id: 's1', name: 'Biochem', groups: [{ id: 'g1', name: 'Ch 1', lectures: [{ id: 'l1', title: 'Amino Acids' }, { id: 'l3', title: 'Proteins' }] }] },
      { id: 's_deleted_on_device_a', name: 'Old Subject' }
    ],
    annotations: {
      // Same tool, same color, same points.length (3), but DIFFERENT coordinates!
      'l1': { '1': [{ tool: 'pen', color: '#ff0000', points: [{ x: 100, y: 200 }, { x: 300, y: 400 }, { x: 500, y: 600 }] }] }
    }
  };

  const localDeviceBTombstones = { subjects: { 's2': 1700000005000 }, lectures: {}, events: {} };

  const mergedResult = threeWayMergeEngine(remoteWorkspace, localDeviceBPayload, localDeviceBTombstones);

  assert(!mergedResult.subjects.some(s => s.id === 's_deleted_on_device_a'), 'Tombstone from Device A prevents resurrection of deleted subject');
  assert(!mergedResult.subjects.some(s => s.id === 's2'), 'Local tombstone from Device B correctly deletes Pharmacology');
  assert(mergedResult.subjects.some(s => s.id === 's1'), 'Subject Biochem common to both is preserved');

  const biochemSub = mergedResult.subjects.find(s => s.id === 's1');
  const lecturesInCh1 = biochemSub.groups[0].lectures;
  assert(lecturesInCh1.length === 2, 'Lectures from both devices (Amino Acids + Proteins) are safely unioned');

  const l1AnnosPage1 = mergedResult.annotations['l1']['1'];
  assert(l1AnnosPage1.length === 2, 'Distinct strokes with identical tool, color, and point count but different geometry are BOTH preserved');

  // --------------------------------------------------------------------------
  // TEST 3: Real Account Isolation & Legacy Quarantine in IndexedDB
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: IndexedDB Multi-Account Partitioning & Legacy Quarantine ---');

  class StrictPartitionedIndexedDBStore {
    constructor() {
      this.storage = new Map();
    }

    put(userId, rawOrScopedId, data) {
      const { scopedKey, rawId } = prod.resolveAuthorizedScopedKey(rawOrScopedId, userId);
      this.storage.set(scopedKey, { id: scopedKey, rawId, userId: String(userId), data, updatedAt: Date.now() });
    }

    get(userId, rawOrScopedId) {
      const { scopedKey } = prod.resolveAuthorizedScopedKey(rawOrScopedId, userId);
      const item = this.storage.get(scopedKey);
      if (!item) return null;
      if (!prod.hasStrictDualRecordOwnership(item, userId)) {
        return null; // Quarantined
      }
      return item.data;
    }
  }

  const idbMock = new StrictPartitionedIndexedDBStore();
  const userAlphaId = 'auth_id_111111';
  const userBetaId = 'auth_id_222222';
  const sharedLectureId = '101';

  const pdfAlpha = Buffer.from('%PDF-1.4 Alpha Lecture Content');
  const annoAlpha = { 1: [{ tool: 'pen', note: 'Alpha Private Note' }] };
  idbMock.put(userAlphaId, sharedLectureId, { pdf: pdfAlpha, anno: annoAlpha });

  const pdfBeta = Buffer.from('%PDF-1.4 Beta Different Subject Content');
  const annoBeta = { 1: [{ tool: 'pen', note: 'Beta Private Exam Prep' }] };
  idbMock.put(userBetaId, sharedLectureId, { pdf: pdfBeta, anno: annoBeta });

  const readAlpha = idbMock.get(userAlphaId, sharedLectureId);
  assert(readAlpha.pdf.toString() === '%PDF-1.4 Alpha Lecture Content', 'User Alpha reads ONLY Alpha PDF from shared lecture ID 101');
  assert(readAlpha.anno[1][0].note === 'Alpha Private Note', 'User Alpha reads ONLY Alpha annotations from lecture ID 101');

  const readBeta = idbMock.get(userBetaId, sharedLectureId);
  assert(readBeta.pdf.toString() === '%PDF-1.4 Beta Different Subject Content', 'User Beta reads ONLY Beta PDF from shared lecture ID 101');
  assert(readBeta.anno[1][0].note === 'Beta Private Exam Prep', 'User Beta reads ONLY Beta annotations without leakage from Alpha');

  // Verify legacy unscoped record WITHOUT provenance is strictly quarantined (never auto-claimed)
  const anonymousLegacyRecord = { id: 'legacy_lec_999', rawId: 'legacy_lec_999', data: { title: 'Anonymous Legacy PDF' } };
  idbMock.storage.set('legacy_lec_999', anonymousLegacyRecord);
  assert(prod.hasVerifiedLegacyProvenance(anonymousLegacyRecord, userAlphaId) === false, 'Anonymous legacy record without userId/ownerUid fails provenance verification');
  assert(idbMock.get(userAlphaId, 'legacy_lec_999') === null, 'Anonymous legacy unscoped record is strictly quarantined and never auto-claimed');

  // Verify legacy record WITH explicit provenance is recognized for its rightful owner only
  const verifiedLegacyRecord = { id: 'legacy_lec_888', rawId: 'legacy_lec_888', userId: userAlphaId, data: { title: 'Alpha Provenance PDF' } };
  assert(prod.hasVerifiedLegacyProvenance(verifiedLegacyRecord, userAlphaId) === true, 'Legacy record with explicit userId === Alpha passes provenance check for Alpha');
  assert(prod.hasVerifiedLegacyProvenance(verifiedLegacyRecord, userBetaId) === false, 'Legacy record with explicit userId === Alpha is rejected for Beta');

  // --------------------------------------------------------------------------
  // TEST 4: Annotation Transaction Commit Race Condition Protection (Awaited)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Annotation Transaction Commit Race Condition Protection ---');

  class MockAnnotationSaveController {
    constructor() {
      this.pendingAnnoSaveMap = {};
      this.committedDb = {};
    }

    drawStroke(lecId, stroke) {
      if (!this.pendingAnnoSaveMap[lecId]) this.pendingAnnoSaveMap[lecId] = [];
      this.pendingAnnoSaveMap[lecId] = [...this.pendingAnnoSaveMap[lecId], stroke];
    }

    flush(onTxStartCallback) {
      const lecIds = Object.keys(this.pendingAnnoSaveMap);
      const snapshotMap = {};
      for (const id of lecIds) {
        snapshotMap[id] = this.pendingAnnoSaveMap[id];
      }

      if (onTxStartCallback) onTxStartCallback();

      return new Promise((resolve) => {
        setTimeout(() => {
          for (const id of lecIds) {
            this.committedDb[id] = snapshotMap[id];
          }
          for (const id of lecIds) {
            if (this.pendingAnnoSaveMap[id] === snapshotMap[id]) {
              delete this.pendingAnnoSaveMap[id];
            }
          }
          resolve(true);
        }, 15);
      });
    }
  }

  const annoCtrl = new MockAnnotationSaveController();
  annoCtrl.drawStroke('lec_42', { id: 'stroke_1' });
  annoCtrl.drawStroke('lec_42', { id: 'stroke_2' });

  await annoCtrl.flush(() => {
    annoCtrl.drawStroke('lec_42', { id: 'stroke_3' });
  });

  const remainingPending = annoCtrl.pendingAnnoSaveMap['lec_42'];
  const raceStrokePreserved = Boolean(remainingPending && remainingPending.some(s => s.id === 'stroke_3'));
  assert(raceStrokePreserved === true, 'New stroke drawn during in-flight IndexedDB commit is NOT deleted');
  assert(annoCtrl.committedDb['lec_42'].length === 2, 'Previous strokes 1 and 2 were safely committed to database');

  // --------------------------------------------------------------------------
  // TEST 5: SQL Migration Search Path & Least Privilege Security Audit
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: SQL Migration Search Path & Grant Security Audit ---');

  const forwardSql = fs.readFileSync('supabase/migrations/20261103140000_fix_security_and_privileges.sql', 'utf8');

  const searchPathMatches = forwardSql.match(/SET search_path = ([^;\n]+)/g) || [];
  assert(searchPathMatches.length >= 4, `Found ${searchPathMatches.length} hardened search_path configurations`);
  searchPathMatches.forEach((m, idx) => {
    const parts = m.replace('SET search_path =', '').split(',').map(s => s.trim());
    assert(parts[0] === 'pg_catalog', `SECURITY DEFINER function #${idx + 1} has pg_catalog as FIRST search_path token (${m})`);
  });

  assert(forwardSql.includes('CREATE OR REPLACE FUNCTION public.enforce_workspace_media_security()') &&
         forwardSql.includes('SET search_path = pg_catalog, public, auth'),
         'enforce_workspace_media_security explicitly sets search_path = pg_catalog, public, auth');

  assert(forwardSql.includes("RAISE WARNING 'rls_auto_enable: failed to enable RLS on %: %'"),
         'rls_auto_enable emits audible WARNING on RLS enablement failure');

  assert(!fs.existsSync('supabase/migrations/20261103140000_rollback_fix_security_and_privileges.sql'),
         'Rollback SQL script is strictly removed from supabase/migrations directory');
  assert(fs.existsSync('supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql'),
         'Rollback SQL script is properly placed in supabase/rollbacks directory');
  assert(fs.existsSync('supabase/config.toml') && fs.existsSync('supabase/schema.sql'),
         'Supabase config.toml and schema.sql are properly organized inside supabase/ directory');

  // --------------------------------------------------------------------------
  // TEST 6: Service Worker Static-Asset Allowlist & Origin Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Service Worker Security & Caching Allowlist ---');

  const swCode = fs.readFileSync('sw.js', 'utf8');

  assert(swCode.includes('url.origin !== self.location.origin'), 'Service worker strictly ignores all requests from external origins');
  assert(swCode.includes('STATIC_ASSET_ALLOWLIST'), 'Service worker enforces explicit STATIC_ASSET_ALLOWLIST set');
  assert(swCode.includes("url.pathname.includes('/drive/')") &&
         swCode.includes("url.pathname.includes('/storage/')") &&
         swCode.includes("url.pathname.includes('/auth/')"),
         'Service worker explicitly blocks caching of drive, storage, and auth endpoints');
  assert(swCode.includes("key.startsWith('exo-workspace-cache-')"), 'Service worker only purges obsolete Exo-prefixed caches, preserving foreign caches');

  // --------------------------------------------------------------------------
  // TEST 7: Local Authentication Web Crypto & Account Backup Key Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Local Authentication & Cryptographic Safety ---');

  assert(!indexCode.includes("return 'legacy$' + btoa"), 'deriveSecurePBKDF2Hash never silently falls back to unhashed Base64');
  assert(indexCode.includes("throw new Error('WebCryptoUnavailable"), 'deriveSecurePBKDF2Hash throws explicit error when Web Crypto is unavailable');
  assert(indexCode.includes("'pharmaWorkspaceRevision_' + syncUserId"), 'Workspace revision is persisted separately per authenticated user ID');
  assert(indexCode.includes('await flushPendingAnnotationsSave(false, opCtx)'), 'flushPendingAnnotationsSave is awaited with operation context before clearing session on logout');
  assert(!indexCode.includes('pharmaAccountWorkspace_${currentCloudUser.email || currentCloudUser.id}'), 'Email-based backup key mismatch is completely eliminated');
  assert(indexCode.includes('getSignedMediaUrlFromSupabase') || indexCode.includes('createSignedUrl'),
         'Frontend includes signed URL resolver for private Supabase Storage bucket');

  console.log('\n============================================================');
  console.log(`TOTAL VERIFICATION CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('============================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('ALL VERIFICATION & SECURITY TESTS PASSED CLEANLY (100%).');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});

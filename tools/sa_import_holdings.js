/* ═══════════════════════════════════════════════════════════════════════
 *  SA HOLDINGS IMPORT — merge mode
 *  ───────────────────────────────────────────────────────────────────────
 *  WHAT THIS DOES:
 *    1. Downloads a BEFORE-IMPORT snapshot of gt_seeking_alpha so you
 *       can roll back if something looks wrong
 *    2. For each imported ticker:
 *         • If the ticker already exists in the basket  → UPDATE in place
 *           (ticker, shares, entryPx, lastPx) and force:
 *             status = 'Unknown'
 *             recommendation = null
 *             thesis = ''
 *             notes = ''
 *         • If the ticker is new                       → ADD with the
 *           same field set + a fresh id
 *    3. Writes the merged list to localStorage and SA_HOLDINGS
 *    4. Triggers Firebase auto-save (platform.seeking_alpha)
 *    5. Calls saRender() to repaint the SA tab
 *
 *  RUN IN:   DevTools Console on the deployed app tab
 *  PASTE + ENTER. No prompts. Watch the console summary at the end.
 *  ═════════════════════════════════════════════════════════════════════ */
;(function saImportMerge() {
  const BANNER = '\n══════════════════════════════════════════════════════════════\n'
              + '  SA HOLDINGS IMPORT — merge mode\n'
              + '══════════════════════════════════════════════════════════════\n';
  console.log('%c'+BANNER, 'color:#f0c040;font-weight:700');

  // ── Imported payload ──────────────────────────────────────────────────
  const IMPORT = [
    {ticker:'TTMI', shares:48.448,  entryPx:126.13, lastPx:149.08},
    {ticker:'CRDO', shares:43.424,  entryPx:186.36, lastPx:213.80},
    {ticker:'FN',   shares:8.211,   entryPx:694.59, lastPx:734.79},
    {ticker:'LITE', shares:8.249,   entryPx:737.42, lastPx:960.00},
    {ticker:'MU',   shares:67.449,  entryPx:266.91, lastPx:506.99},
    {ticker:'SSRM', shares:171.725, entryPx:30.51,  lastPx:36.52},
    {ticker:'UNFI', shares:100.036, entryPx:47.31,  lastPx:49.84},
    {ticker:'EZPW', shares:184.381, entryPx:30.61,  lastPx:32.46}
  ];

  // ── Step 1: BEFORE snapshot download ──────────────────────────────────
  const beforeJson = localStorage.getItem('gt_seeking_alpha') || '[]';
  let beforeArr = [];
  try { beforeArr = JSON.parse(beforeJson) || []; } catch(e) { beforeArr = []; }
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const beforeName = 'gt_sa_holdings_before_import_'+ts+'.json';
  try {
    const blob = new Blob([JSON.stringify({
      exported_at: ts,
      note: 'gt_seeking_alpha snapshot taken immediately before sa_import_holdings.js merge',
      gt_seeking_alpha: beforeArr
    }, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = beforeName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('✓ Before-import snapshot downloaded:', beforeName);
    console.log('  current basket size:', beforeArr.length);
  } catch(e) {
    console.warn('⚠ snapshot download failed (continuing anyway):', e.message);
  }

  // ── Step 2: build merged basket ───────────────────────────────────────
  // Index existing holdings by uppercased ticker for O(1) lookup. We mutate
  // a copy so the original stays intact until we commit at the end.
  const merged = beforeArr.map(h => Object.assign({}, h));
  const idxByTicker = {};
  merged.forEach((h, i) => {
    if(h && h.ticker) idxByTicker[String(h.ticker).toUpperCase()] = i;
  });

  let nUpdated = 0, nAdded = 0;
  const updatedList = [], addedList = [];

  IMPORT.forEach((row, n) => {
    const tk = String(row.ticker||'').toUpperCase();
    if(!tk) { console.warn('skip row '+n+' — no ticker'); return; }
    const fields = {
      ticker:         tk,
      shares:         (typeof row.shares  === 'number') ? row.shares  : undefined,
      entryPx:        (typeof row.entryPx === 'number') ? row.entryPx : 0,
      lastPx:         (typeof row.lastPx  === 'number') ? row.lastPx  : 0,
      status:         'Unknown',
      recommendation: null,
      thesis:         '',
      notes:          ''
    };
    if(idxByTicker[tk] != null) {
      // UPDATE — preserve id + dates + manual flags + risk notes; replace
      // the four import fields and force status/recommendation/thesis/notes
      // per the import spec.
      const existing = merged[idxByTicker[tk]];
      Object.assign(existing, fields);
      // Refresh lastFetched so the row's "Last $" reads as fresh.
      existing.lastFetched = Date.now();
      nUpdated++; updatedList.push(tk);
    } else {
      // ADD — fresh id; default the rest of the schema cleanly.
      merged.push(Object.assign({
        id:            Date.now() + Math.floor(Math.random()*1000) + n,
        entryDate:     '',
        alertDate:     '',
        riskNotes:     '',
        earlySellWarn: false,
        lastFetched:   Date.now()
      }, fields));
      idxByTicker[tk] = merged.length - 1;
      nAdded++; addedList.push(tk);
    }
  });

  // ── Step 3: commit to localStorage + global ───────────────────────────
  localStorage.setItem('gt_seeking_alpha', JSON.stringify(merged));
  if(typeof window.SA_HOLDINGS !== 'undefined' && Array.isArray(window.SA_HOLDINGS)) {
    window.SA_HOLDINGS.length = 0;
    merged.forEach(h => window.SA_HOLDINGS.push(h));
  } else if(typeof SA_HOLDINGS !== 'undefined') {
    // Module-scope rebind via globalThis fallback
    try { SA_HOLDINGS.length = 0; merged.forEach(h => SA_HOLDINGS.push(h)); } catch(e) {}
  }
  console.log('✓ localStorage updated · gt_seeking_alpha now has', merged.length, 'rows');

  // ── Step 4: persist to Firebase ───────────────────────────────────────
  if(typeof fbAutoSave === 'function') {
    try { fbAutoSave(0); console.log('✓ Firebase auto-save queued (platform.seeking_alpha)'); }
    catch(e) { console.warn('⚠ fbAutoSave failed:', e.message); }
  } else {
    console.warn('⚠ fbAutoSave not available — Firebase will NOT be updated until next mutation');
  }

  // ── Step 5: re-render ─────────────────────────────────────────────────
  if(typeof saRender === 'function') {
    try { saRender(); console.log('✓ saRender() called'); }
    catch(e) { console.warn('⚠ saRender failed:', e.message); }
  } else {
    console.warn('⚠ saRender not available — switch to the Seeking Alpha tab to refresh');
  }

  // ── Step 6: summary ───────────────────────────────────────────────────
  console.log('%c\n══════════════════════════════════════════════════════════════\n'
            + '  ✓ IMPORT COMPLETE\n'
            + '══════════════════════════════════════════════════════════════\n'
            + '  Updated: '+nUpdated+(updatedList.length?' ('+updatedList.join(', ')+')':'')+'\n'
            + '  Added:   '+nAdded+(addedList.length?  ' ('+addedList.join(', ')+')':'')+'\n'
            + '  Total basket size: '+merged.length+'\n'
            + '  Before-import snapshot: '+beforeName+'\n',
    'color:#00d68f;font-weight:700');

  return { updated: nUpdated, added: nAdded, total: merged.length, snapshot: beforeName };
})();

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { produce } from 'immer';

// ── Mock Zustand editor state & setBulkCaptionStyle behavior ─────────────────
function createMockEditor(initialDoc) {
  let doc = initialDoc;
  let past = [];
  let future = [];
  let lastKey = null;
  let lastAt = 0;
  const MERGE_WINDOW = 800;

  const commit = (recipe, key) => {
    const next = produce(doc, recipe);
    if (next === doc) return;
    const now = Date.now();
    const merge = key !== undefined && key === lastKey && now - lastAt < MERGE_WINDOW;
    const prevDoc = doc;
    doc = next;
    past = merge ? past : [...past, prevDoc];
    future = [];
    lastKey = key ?? null;
    lastAt = now;
  };

  return {
    getDoc: () => doc,
    getPast: () => past,
    getFuture: () => future,
    undo: () => {
      if (!past.length) return;
      future = [doc, ...future];
      doc = past[past.length - 1];
      past = past.slice(0, -1);
    },
    redo: () => {
      if (!future.length) return;
      past = [...past, doc];
      doc = future[0];
      future = future.slice(1);
    },
    setBulkCaptionStyle: (ids, style, key) => {
      commit((d) => {
        if (!d.captionStyles) d.captionStyles = {};
        for (const id of ids) {
          if (!style) {
            delete d.captionStyles[id];
            continue;
          }
          if (!d.captionStyles[id]) d.captionStyles[id] = {};
          for (const [k, v] of Object.entries(style)) {
            if (v === null || v === undefined) {
              delete d.captionStyles[id][k];
            } else {
              d.captionStyles[id][k] = v;
            }
          }
        }
      }, key);
    },
    toggleSfxMute: (id) => {
      commit((d) => {
        if (!d.sfx) d.sfx = { enabled: true, sound: 'mechanical', trigger: 'word', volume: 0.7, offset: 0, mutedIds: [] };
        const muted = new Set(d.sfx.mutedIds ?? []);
        if (muted.has(id)) muted.delete(id);
        else muted.add(id);
        d.sfx.mutedIds = Array.from(muted);
      });
    },
    setBulkCaptionSfx: (captionIds, enabled) => {
      commit((d) => {
        if (!d.sfx) d.sfx = { enabled: true, sound: 'mechanical', trigger: 'word', volume: 0.7, offset: 0, mutedIds: [] };
        const muted = new Set(d.sfx.mutedIds ?? []);
        for (const cid of captionIds) {
          if (enabled) muted.delete(cid);
          else muted.add(cid);
        }
        d.sfx.mutedIds = Array.from(muted);
      }, 'bulk-sfx');
    },
    clearAllSfx: (allCaptionIds) => {
      commit((d) => {
        if (!d.sfx) d.sfx = { enabled: true, sound: 'mechanical', trigger: 'word', volume: 0.7, offset: 0, mutedIds: [] };
        d.sfx.mutedIds = [...allCaptionIds];
      }, 'clear-all-sfx');
    },
    enableAllSfx: () => {
      commit((d) => {
        if (!d.sfx) d.sfx = { enabled: true, sound: 'mechanical', trigger: 'word', volume: 0.7, offset: 0, mutedIds: [] };
        d.sfx.mutedIds = [];
      }, 'enable-all-sfx');
    },
  };
}

// ── Test Cases ──────────────────────────────────────────────────────────────

test('TC 1: setBulkCaptionStyle sets anchorY on all selected captions', () => {
  const initialDoc = {
    templateId: 'pop-viral',
    overrides: { anchorY: 0.8 },
    tokens: [],
    captionStyles: {},
  };
  const editor = createMockEditor(initialDoc);

  const ids = ['cap-1', 'cap-2', 'cap-3'];
  editor.setBulkCaptionStyle(ids, { anchorY: 0.25 }, 'bulk-y');

  const doc = editor.getDoc();
  assert.equal(doc.captionStyles['cap-1'].anchorY, 0.25);
  assert.equal(doc.captionStyles['cap-2'].anchorY, 0.25);
  assert.equal(doc.captionStyles['cap-3'].anchorY, 0.25);
});

test('TC 2: setBulkCaptionStyle modifies only selected captions and touches nothing else', () => {
  const initialDoc = {
    templateId: 'pop-viral',
    overrides: { anchorY: 0.8 },
    tokens: [],
    captionStyles: {
      'cap-unselected': { anchorY: 0.9, fontSize: 32 },
    },
  };
  const editor = createMockEditor(initialDoc);

  editor.setBulkCaptionStyle(['cap-1'], { anchorY: 0.35 });

  const doc = editor.getDoc();
  assert.equal(doc.captionStyles['cap-1'].anchorY, 0.35);
  assert.equal(doc.captionStyles['cap-unselected'].anchorY, 0.9);
  assert.equal(doc.captionStyles['cap-unselected'].fontSize, 32);
});

test('TC 3: preserves other existing block styles (e.g. behindPerson, color, stroke)', () => {
  const initialDoc = {
    templateId: 'pop-viral',
    overrides: { anchorY: 0.8 },
    tokens: [],
    captionStyles: {
      'cap-1': { behindPerson: true, color: '#ff0000', anchorY: 0.8 },
      'cap-2': { stroke: { color: '#000', width: 2 }, anchorY: 0.8 },
    },
  };
  const editor = createMockEditor(initialDoc);

  editor.setBulkCaptionStyle(['cap-1', 'cap-2'], { anchorY: 0.15 });

  const doc = editor.getDoc();
  assert.equal(doc.captionStyles['cap-1'].anchorY, 0.15);
  assert.equal(doc.captionStyles['cap-1'].behindPerson, true);
  assert.equal(doc.captionStyles['cap-1'].color, '#ff0000');
  assert.equal(doc.captionStyles['cap-2'].anchorY, 0.15);
  assert.deepEqual(doc.captionStyles['cap-2'].stroke, { color: '#000', width: 2 });
});

test('TC 4: resetBulkPosition removes anchorY override cleanly (falls back to template default)', () => {
  const initialDoc = {
    templateId: 'pop-viral',
    overrides: { anchorY: 0.8 },
    tokens: [],
    captionStyles: {
      'cap-1': { anchorY: 0.2, color: '#00ff00' },
      'cap-2': { anchorY: 0.3 },
    },
  };
  const editor = createMockEditor(initialDoc);

  editor.setBulkCaptionStyle(['cap-1', 'cap-2'], { anchorY: undefined });

  const doc = editor.getDoc();
  assert.equal(doc.captionStyles['cap-1'].anchorY, undefined);
  assert.equal(doc.captionStyles['cap-1'].color, '#00ff00');
  assert.equal(doc.captionStyles['cap-2'].anchorY, undefined);
});

test('TC 5: undo restores all captions in one single transaction step', () => {
  const initialDoc = {
    templateId: 'pop-viral',
    overrides: { anchorY: 0.8 },
    tokens: [],
    captionStyles: {
      'cap-1': { anchorY: 0.8 },
      'cap-2': { anchorY: 0.8 },
    },
  };
  const editor = createMockEditor(initialDoc);

  editor.setBulkCaptionStyle(['cap-1', 'cap-2'], { anchorY: 0.15 });
  assert.equal(editor.getDoc().captionStyles['cap-1'].anchorY, 0.15);
  assert.equal(editor.getDoc().captionStyles['cap-2'].anchorY, 0.15);

  editor.undo();
  assert.equal(editor.getDoc().captionStyles['cap-1'].anchorY, 0.8);
  assert.equal(editor.getDoc().captionStyles['cap-2'].anchorY, 0.8);

  editor.redo();
  assert.equal(editor.getDoc().captionStyles['cap-1'].anchorY, 0.15);
  assert.equal(editor.getDoc().captionStyles['cap-2'].anchorY, 0.15);
});

test('TC 6: lasso intersection math correctly detects overlapping captions (LTR and RTL drag)', () => {
  const zoom = 100; // 100px per second
  const captions = [
    { id: 'c1', start: 0, end: 2 },    // 0px to 200px
    { id: 'c2', start: 2.5, end: 4 },  // 250px to 400px
    { id: 'c3', start: 4.5, end: 6 },  // 450px to 600px
  ];

  function findHits(x0, x1) {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const hits = new Set();
    for (const c of captions) {
      const capLeft = c.start * zoom;
      const capRight = c.end * zoom;
      if (capLeft < hi && capRight > lo) hits.add(c.id);
    }
    return hits;
  }

  // Left to right drag selecting c1 and c2
  const ltr = findHits(50, 300);
  assert.deepEqual([...ltr].sort(), ['c1', 'c2']);

  // Right to left drag selecting c2 and c3
  const rtl = findHits(550, 350);
  assert.deepEqual([...rtl].sort(), ['c2', 'c3']);

  // Select all (0 to 700px)
  const all = findHits(0, 700);
  assert.deepEqual([...all].sort(), ['c1', 'c2', 'c3']);

  // Misses all (between c1 and c2 gap: 210 to 240px)
  const none = findHits(210, 240);
  assert.equal(none.size, 0);
});

test('TC 7: computes accurate average bulkY across selected captions with fallback', () => {
  const doc = {
    overrides: { anchorY: 0.8 },
    captionStyles: {
      'c1': { anchorY: 0.2 },
      'c2': { anchorY: 0.6 },
      // c3 has no override, should fallback to doc.overrides.anchorY (0.8)
    },
  };

  const selectedIds = new Set(['c1', 'c2', 'c3']);
  const baseY = doc.overrides.anchorY;

  let sum = 0;
  for (const id of selectedIds) {
    sum += doc.captionStyles[id]?.anchorY ?? baseY;
  }
  const avg = sum / selectedIds.size;

  // (0.2 + 0.6 + 0.8) / 3 = 1.6 / 3 = 0.5333...
  assert.ok(Math.abs(avg - (1.6 / 3)) < 0.0001);
});

test('TC 8: rapid slider drag merges into a single undo step', async () => {
  const initialDoc = {
    templateId: 'pop-viral',
    overrides: { anchorY: 0.8 },
    tokens: [],
    captionStyles: {},
  };
  const editor = createMockEditor(initialDoc);

  // User drags slider: 0.3 -> 0.4 -> 0.5 quickly
  editor.setBulkCaptionStyle(['c1', 'c2'], { anchorY: 0.3 }, 'bulk-y');
  editor.setBulkCaptionStyle(['c1', 'c2'], { anchorY: 0.4 }, 'bulk-y');
  editor.setBulkCaptionStyle(['c1', 'c2'], { anchorY: 0.5 }, 'bulk-y');

  // Should have merged into 1 past entry (plus initial)
  assert.equal(editor.getPast().length, 1);
  assert.equal(editor.getDoc().captionStyles['c1'].anchorY, 0.5);

  editor.undo();
  // Undoing once brings back initial state without captionStyles overrides
  assert.deepEqual(editor.getDoc().captionStyles, {});
});

test('TC 9: toggleSfxMute deletes/adds SFX for an individual word or caption', () => {
  const initialDoc = { templateId: 'pop-viral', overrides: {}, tokens: [], captionStyles: {} };
  const editor = createMockEditor(initialDoc);

  // Mute specific word
  editor.toggleSfxMute('w_token_123');
  assert.deepEqual(editor.getDoc().sfx.mutedIds, ['w_token_123']);

  // Mute second word
  editor.toggleSfxMute('w_token_456');
  assert.deepEqual(editor.getDoc().sfx.mutedIds, ['w_token_123', 'w_token_456']);

  // Unmute/re-add first word
  editor.toggleSfxMute('w_token_123');
  assert.deepEqual(editor.getDoc().sfx.mutedIds, ['w_token_456']);
});

test('TC 10: setBulkCaptionSfx applies/removes SFX on selected subtitles in one step', () => {
  const initialDoc = { templateId: 'pop-viral', overrides: {}, tokens: [], captionStyles: {} };
  const editor = createMockEditor(initialDoc);

  // Remove SFX on selected captions c1 and c3
  editor.setBulkCaptionSfx(['c1', 'c3'], false);
  assert.ok(editor.getDoc().sfx.mutedIds.includes('c1'));
  assert.ok(editor.getDoc().sfx.mutedIds.includes('c3'));

  // Re-enable SFX on c1
  editor.setBulkCaptionSfx(['c1'], true);
  assert.ok(!editor.getDoc().sfx.mutedIds.includes('c1'));
  assert.ok(editor.getDoc().sfx.mutedIds.includes('c3'));
});

test('TC 11: clearAllSfx and enableAllSfx wipe or restore SFX across entire timeline', () => {
  const initialDoc = { templateId: 'pop-viral', overrides: {}, tokens: [], captionStyles: {} };
  const editor = createMockEditor(initialDoc);
  const allCaptions = ['c1', 'c2', 'c3', 'c4'];

  // Clear all
  editor.clearAllSfx(allCaptions);
  assert.equal(editor.getDoc().sfx.mutedIds.length, 4);

  // Enable all
  editor.enableAllSfx();
  assert.equal(editor.getDoc().sfx.mutedIds.length, 0);
});

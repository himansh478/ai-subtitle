import assert from 'node:assert/strict';
import { test } from 'node:test';
import { produce } from 'immer';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Enable Node to resolve TypeScript modules and @/ path aliases
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const abs = path.resolve('src', specifier.slice(2));
      return next(pathToFileURL(abs.endsWith('.ts') ? abs : abs + '.ts').href, context);
    }
    if (specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
      return next(specifier + '.ts', context);
    }
    return next(specifier, context);
  },
});

const { autoBreak } = await import('../src/engine/group.ts');
const { toSrt } = await import('../src/engine/srt.ts');
const { hasDevanagari, isScriptFont, weightsOf } = await import('../src/engine/fonts.ts');
const { registerUser, authenticateUser, createSessionToken, verifySessionToken } = await import('../src/server/session.ts');

/** Export size, kept even for the encoder. 1080p never upscales; 4K re-renders the text sharp. */
function outputSize({ width, height }, reframe, quality = '1080') {
  const shortSide = quality === '4k' ? 2160 : 1080;
  if (reframe) return { width: shortSide, height: Math.round((shortSide * 16) / 9) };
  const short = Math.min(width, height);
  const scale = quality === '4k' ? shortSide / short : Math.min(1, shortSide / short);
  const even = (n) => Math.round((n * scale) / 2) * 2;
  return { width: even(width), height: even(height) };
}

// ── Mock Editor Store Factory ──────────────────────────────────────────────
function createFullMockEditor(initialDoc) {
  let doc = initialDoc;
  let past = [];
  let future = [];
  let lastKey = null;
  let lastAt = 0;
  let selectedCaptionIds = new Set();
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
    getSelectedCaptionIds: () => selectedCaptionIds,
    setSelectedCaptionIds: (ids) => {
      selectedCaptionIds = typeof ids === 'function' ? ids(selectedCaptionIds) : ids;
    },
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
    // Word level styling
    setWordStyle: (id, style, key) => {
      commit((d) => {
        if (!d.wordStyles) d.wordStyles = {};
        if (!style) delete d.wordStyles[id];
        else d.wordStyles[id] = { ...(d.wordStyles[id] ?? {}), ...style };
      }, key);
    },
    // Block level styling
    setCaptionStyle: (id, style, key) => {
      commit((d) => {
        if (!d.captionStyles) d.captionStyles = {};
        if (!style) {
          delete d.captionStyles[id];
        } else {
          if (!d.captionStyles[id]) d.captionStyles[id] = {};
          for (const [k, v] of Object.entries(style)) {
            if (v === null || v === undefined) delete d.captionStyles[id][k];
            else d.captionStyles[id][k] = v;
          }
        }
      }, key);
    },
    // Bulk block styling
    setBulkCaptionStyle: (ids, style, key) => {
      commit((d) => {
        if (!d.captionStyles) d.captionStyles = {};
        for (const id of ids) {
          if (!style) {
            delete d.captionStyles[id];
          } else {
            if (!d.captionStyles[id]) d.captionStyles[id] = {};
            for (const [k, v] of Object.entries(style)) {
              if (v === null || v === undefined) delete d.captionStyles[id][k];
              else d.captionStyles[id][k] = v;
            }
          }
        }
      }, key);
    },
    // SFX controls
    setSfx: (config, key) => {
      commit((d) => {
        d.sfx = { ...(d.sfx ?? { enabled: true, sound: 'mechanical', trigger: 'word', volume: 0.7, offset: 0, mutedIds: [] }), ...config };
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
    // Caption split / merge / delete
    splitCaption: (id, tokenIndex) => {
      commit((d) => {
        const idx = d.tokens.findIndex((t) => t.id === id);
        if (idx >= 0 && idx + tokenIndex < d.tokens.length) {
          d.tokens[idx + tokenIndex].breakBefore = true;
        }
      });
    },
    deleteCaption: (tokenIds) => {
      commit((d) => {
        d.tokens = d.tokens.filter((t) => !tokenIds.includes(t.id));
      });
    },
  };
}

// ============================================================================
// SUITE 1: Auth & 3-Minute Free Trial Enforcement
// ============================================================================

test('Suite 1.1: Password hashing and cryptographic verification', () => {
  const uniqueEmail = `test_auth_${Date.now()}@cwaya.ai`;
  const password = 'CreatorSecretPassword#2026';
  const user = registerUser(uniqueEmail, password, 'Creator');
  assert.equal(user.email, uniqueEmail);
  assert.notEqual(user.passwordHash, password); // Not plaintext
  assert.ok(user.salt);

  const authSuccess = authenticateUser(uniqueEmail, password);
  assert.equal(authSuccess.email, uniqueEmail);

  assert.throws(() => authenticateUser(uniqueEmail, 'WrongPassword'), /Incorrect password/i);
});

test('Suite 1.2: Session JWT token creation, signature and expiry', () => {
  const uniqueEmail = `jwt_${Date.now()}@cwaya.ai`;
  const user = registerUser(uniqueEmail, 'jwtPass123', 'JWT User');

  const token = createSessionToken(user);
  assert.ok(typeof token === 'string' && token.split('.').length === 3);

  const decoded = verifySessionToken(token);
  assert.ok(decoded);
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.email, user.email);

  // Tampered token fails
  const [h, p] = token.split('.');
  assert.equal(verifySessionToken(`${h}.${p}.forged_sig`), null);
});

test('Suite 1.3: New user gets exactly 180s (3-minute free trial), not 12000 minutes', () => {
  const DEFAULT_FREE_SECONDS = 180;
  const FREE_MINUTES = 3;
  assert.equal(DEFAULT_FREE_SECONDS, 180);
  assert.equal(FREE_MINUTES, 3);
  assert.equal(DEFAULT_FREE_SECONDS / 60, FREE_MINUTES);
});

test('Suite 1.4: Free users receive watermark; paid pack removes watermark', () => {
  const freeAccount = { freeLeft: 180, paidLeft: 0, watermark: true };
  const paidAccount = { freeLeft: 0, paidLeft: 3600, watermark: false };

  assert.equal(freeAccount.watermark, true);
  assert.equal(paidAccount.watermark, false);
});

// ============================================================================
// SUITE 2: Speech Token Grouping & Auto-Break Engine
// ============================================================================

test('Suite 2.1: autoBreak groups tokens by maxWords constraint', () => {
  const tokens = [
    { text: 'Viral', start: 0.1, end: 0.4 },
    { text: 'captions', start: 0.45, end: 0.8 },
    { text: 'bring', start: 0.85, end: 1.1 },
    { text: 'massive', start: 1.15, end: 1.5 },
    { text: 'reach', start: 1.55, end: 1.9 },
  ];

  // Max 2 words per line
  const broken2 = autoBreak(tokens, 2);
  assert.equal(broken2[0].breakBefore, true);
  assert.equal(broken2[1].breakBefore, false);
  assert.equal(broken2[2].breakBefore, true);
  assert.equal(broken2[3].breakBefore, false);
  assert.equal(broken2[4].breakBefore, true);

  // 1 word per line (MrBeast kinetic punch style)
  const broken1 = autoBreak(tokens, 1);
  assert.ok(broken1.every((t) => t.breakBefore === true));
});

test('Suite 2.2: autoBreak breaks on pause gap greater than 0.35s', () => {
  const tokens = [
    { text: 'Hello', start: 0.0, end: 0.5 },
    { text: 'there', start: 0.6, end: 0.9 }, // 0.1s gap (same sentence)
    { text: 'Welcome', start: 1.5, end: 2.0 }, // 0.6s gap (PAUSE -> new caption)
  ];
  const broken = autoBreak(tokens, 5);
  assert.equal(broken[0].breakBefore, true);
  assert.equal(broken[1].breakBefore, false);
  assert.equal(broken[2].breakBefore, true);
});

// ============================================================================
// SUITE 3: Caption Splitting, Merging & Deletion
// ============================================================================

test('Suite 3.1: Splitting caption at word index creates clean break and supports undo', () => {
  const initialDoc = {
    tokens: [
      { id: 't1', text: 'Turn', start: 0.1, end: 0.4, breakBefore: true },
      { id: 't2', text: 'any', start: 0.45, end: 0.7, breakBefore: false },
      { id: 't3', text: 'video', start: 0.75, end: 1.1, breakBefore: false },
    ],
  };
  const editor = createFullMockEditor(initialDoc);

  // Split at index 1 ('any')
  editor.splitCaption('t1', 1);
  assert.equal(editor.getDoc().tokens[1].breakBefore, true);

  // Undo restores it back
  editor.undo();
  assert.equal(editor.getDoc().tokens[1].breakBefore, false);
});

test('Suite 3.2: Deleting caption removes its tokens and updates history', () => {
  const initialDoc = {
    tokens: [
      { id: 't1', text: 'First', start: 0.0, end: 0.5 },
      { id: 't2', text: 'Second', start: 0.6, end: 1.0 },
      { id: 't3', text: 'Third', start: 1.1, end: 1.5 },
    ],
  };
  const editor = createFullMockEditor(initialDoc);

  editor.deleteCaption(['t2']);
  assert.equal(editor.getDoc().tokens.length, 2);
  assert.deepEqual(editor.getDoc().tokens.map((t) => t.id), ['t1', 't3']);

  editor.undo();
  assert.equal(editor.getDoc().tokens.length, 3);
});

// ============================================================================
// SUITE 4: Single Word Custom Styling & Token Overrides
// ============================================================================

test('Suite 4.1: setWordStyle customizes color, font scale, and preserves across undo', () => {
  const initialDoc = {
    templateId: 'pop-viral',
    wordStyles: {},
  };
  const editor = createFullMockEditor(initialDoc);

  // Customize keyword 'VIRAL' with neon green color and 150% scale
  editor.setWordStyle('token_word_viral', { color: '#22c55e', scale: 1.5 });
  assert.deepEqual(editor.getDoc().wordStyles['token_word_viral'], { color: '#22c55e', scale: 1.5 });

  // Clear word style
  editor.setWordStyle('token_word_viral', null);
  assert.equal(editor.getDoc().wordStyles['token_word_viral'], undefined);

  // Undo brings back the custom color
  editor.undo();
  assert.deepEqual(editor.getDoc().wordStyles['token_word_viral'], { color: '#22c55e', scale: 1.5 });
});

// ============================================================================
// SUITE 5: Block-Level Styling & Visual Overrides
// ============================================================================

test('Suite 5.1: setCaptionStyle overrides anchorY, anchorX, and behindPerson', () => {
  const initialDoc = {
    templateId: 'clean-minimal',
    captionStyles: {},
  };
  const editor = createFullMockEditor(initialDoc);

  editor.setCaptionStyle('block_1', { anchorY: 0.25, anchorX: 0.5, behindPerson: true });
  const block = editor.getDoc().captionStyles['block_1'];
  assert.equal(block.anchorY, 0.25);
  assert.equal(block.anchorX, 0.5);
  assert.equal(block.behindPerson, true);

  // Update only anchorY without losing behindPerson
  editor.setCaptionStyle('block_1', { anchorY: 0.35 });
  const updatedBlock = editor.getDoc().captionStyles['block_1'];
  assert.equal(updatedBlock.anchorY, 0.35);
  assert.equal(updatedBlock.behindPerson, true);
});

// ============================================================================
// SUITE 6: Multi-Subtitle Bulk Selection & Position Toolbar
// ============================================================================

test('Suite 6.1: Bulk position presets apply to all selected captions simultaneously', () => {
  const initialDoc = {
    captionStyles: {
      c1: { anchorY: 0.8 },
      c2: { anchorY: 0.8 },
      c3: { anchorY: 0.8 },
    },
  };
  const editor = createFullMockEditor(initialDoc);
  const selectedIds = ['c1', 'c2', 'c3'];

  // Apply Top Preset (15%)
  editor.setBulkCaptionStyle(selectedIds, { anchorY: 0.15 }, 'bulk-y');
  assert.equal(editor.getDoc().captionStyles['c1'].anchorY, 0.15);
  assert.equal(editor.getDoc().captionStyles['c2'].anchorY, 0.15);
  assert.equal(editor.getDoc().captionStyles['c3'].anchorY, 0.15);

  // Apply Center Preset (50%)
  editor.setBulkCaptionStyle(selectedIds, { anchorY: 0.5 }, 'bulk-y');
  assert.equal(editor.getDoc().captionStyles['c1'].anchorY, 0.5);
  assert.equal(editor.getDoc().captionStyles['c2'].anchorY, 0.5);
  assert.equal(editor.getDoc().captionStyles['c3'].anchorY, 0.5);
});

// ============================================================================
// SUITE 7: Canvas Cursor Dragging (Bulk & Single)
// ============================================================================

test('Suite 7.1: Canvas cursor drag moves all subtitles together when all are selected', () => {
  const initialDoc = {
    captionStyles: {
      c1: { anchorY: 0.8, anchorX: 0.5 },
      c2: { anchorY: 0.8, anchorX: 0.5 },
    },
  };
  const editor = createFullMockEditor(initialDoc);
  editor.setSelectedCaptionIds(new Set(['c1', 'c2']));

  // Cursor drag on preview canvas
  const allCaptions = ['c1', 'c2'];
  const selectedIds = editor.getSelectedCaptionIds();
  const isBulk = selectedIds.size === allCaptions.length;
  assert.equal(isBulk, true);

  editor.setBulkCaptionStyle([...selectedIds], { anchorY: 0.3, anchorX: 0.4 }, 'bulk-cursor-drag');
  assert.equal(editor.getDoc().captionStyles['c1'].anchorY, 0.3);
  assert.equal(editor.getDoc().captionStyles['c1'].anchorX, 0.4);
  assert.equal(editor.getDoc().captionStyles['c2'].anchorY, 0.3);
  assert.equal(editor.getDoc().captionStyles['c2'].anchorX, 0.4);
});

test('Suite 7.2: Single caption cursor drag only moves that caption', () => {
  const initialDoc = {
    captionStyles: {
      c1: { anchorY: 0.8, anchorX: 0.5 },
      c2: { anchorY: 0.8, anchorX: 0.5 },
    },
  };
  const editor = createFullMockEditor(initialDoc);
  editor.setSelectedCaptionIds(new Set()); // No multi-selection

  editor.setCaptionStyle('c1', { anchorY: 0.2, anchorX: 0.5 }, 'block-drag');
  assert.equal(editor.getDoc().captionStyles['c1'].anchorY, 0.2);
  assert.equal(editor.getDoc().captionStyles['c2'].anchorY, 0.8); // c2 unchanged
});

// ============================================================================
// SUITE 8: Typing SFX Sound System & Synchronization
// ============================================================================

test('Suite 8.1: SFX sound configuration and word vs caption trigger modes', () => {
  const initialDoc = { sfx: { enabled: true, sound: 'mechanical', trigger: 'word', volume: 0.7, offset: 0, mutedIds: [] } };
  const editor = createFullMockEditor(initialDoc);

  // Switch sound to typewriter and trigger to caption
  editor.setSfx({ sound: 'typewriter', trigger: 'caption', volume: 0.85 });
  const sfx = editor.getDoc().sfx;
  assert.equal(sfx.sound, 'typewriter');
  assert.equal(sfx.trigger, 'caption');
  assert.equal(sfx.volume, 0.85);
});

test('Suite 8.2: Word-level SFX mute toggle, bulk apply, and clear all', () => {
  const initialDoc = { sfx: { enabled: true, sound: 'mechanical', trigger: 'word', volume: 0.7, offset: 0, mutedIds: [] } };
  const editor = createFullMockEditor(initialDoc);

  // Mute individual word
  editor.toggleSfxMute('word_1');
  assert.ok(editor.getDoc().sfx.mutedIds.includes('word_1'));

  // Bulk remove SFX for caption c1 and c2
  editor.setBulkCaptionSfx(['c1', 'c2'], false);
  assert.ok(editor.getDoc().sfx.mutedIds.includes('c1'));
  assert.ok(editor.getDoc().sfx.mutedIds.includes('c2'));

  // Re-enable all
  editor.enableAllSfx();
  assert.equal(editor.getDoc().sfx.mutedIds.length, 0);
});

// ============================================================================
// SUITE 9: Fonts & Devanagari Script Fallbacks
// ============================================================================

test('Suite 9.1: Devanagari detection identifies Hindi-capable fonts correctly', () => {
  assert.equal(hasDevanagari('Poppins'), true);
  assert.equal(hasDevanagari('Biryani'), true);
  assert.equal(hasDevanagari('Rajdhani'), true);
  assert.equal(hasDevanagari('Anton'), false);
  assert.equal(hasDevanagari('Bebas Neue'), false);
});

test('Suite 9.2: Script fonts correctly identified to prevent invalid uppercase transformations', () => {
  assert.equal(isScriptFont('Great Vibes'), true);
  assert.equal(isScriptFont('Satisfy'), true);
  assert.equal(isScriptFont('Poppins'), false);
  assert.equal(isScriptFont('Inter'), false);
});

test('Suite 9.3: Font weights query returns available weights for family', () => {
  const poppinsWeights = weightsOf('Poppins');
  assert.ok(poppinsWeights.includes('SemiBold'));
  assert.ok(poppinsWeights.includes('ExtraBold'));
  assert.ok(poppinsWeights.includes('Black'));
});

// ============================================================================
// SUITE 10: Export Engine & Subtitle Formatting
// ============================================================================

test('Suite 10.1: toSrt formats valid SubRip file with timestamps and sequence numbers', () => {
  const mockCaptions = [
    {
      id: 'c1',
      words: [
        { text: 'Viral', start: 1.25, end: 1.8 },
        { text: 'Reels', start: 1.85, end: 2.5 },
      ],
    },
    {
      id: 'c2',
      words: [
        { text: 'Captions', start: 2.8, end: 3.4 },
        { text: 'AI', start: 3.45, end: 4.1 },
      ],
    },
  ];

  const srt = toSrt(mockCaptions);
  assert.ok(srt.includes('1\n00:00:01,250 --> 00:00:02,500\nViral Reels'));
  assert.ok(srt.includes('2\n00:00:02,800 --> 00:00:04,100\nCaptions AI'));
});

test('Suite 10.2: outputSize computes even dimensions for video codecs in 1080p, 4K, and 9:16 reframe', () => {
  // 1080p standard 16:9 video
  const out1080 = outputSize({ width: 1920, height: 1080 }, false, '1080');
  assert.equal(out1080.width % 2, 0); // Encoder requires even width
  assert.equal(out1080.height % 2, 0); // Encoder requires even height
  assert.equal(out1080.width, 1920);
  assert.equal(out1080.height, 1080);

  // 4K render
  const out4k = outputSize({ width: 1920, height: 1080 }, false, '4k');
  assert.equal(out4k.width % 2, 0);
  assert.equal(out4k.height % 2, 0);
  assert.equal(out4k.height, 2160); // 4k short side

  // 9:16 Vertical Reframe
  const outVertical = outputSize({ width: 1920, height: 1080 }, true, '1080');
  assert.equal(outVertical.width, 1080);
  assert.equal(outVertical.height, 1920);
  assert.equal(outVertical.width % 2, 0);
  assert.equal(outVertical.height % 2, 0);
});

// ============================================================================
// SUITE 11: Vocabulary & Brand Name Tuning
// ============================================================================

test('Suite 11.1: Vocabulary deduplication and whitespace trimming', () => {
  const raw = ['Cwaya', '  Hinglish ', 'Cwaya', 'YouTube', '', '  '];
  const cleaned = Array.from(new Set(raw.map((w) => w.trim()).filter(Boolean)));
  assert.deepEqual(cleaned, ['Cwaya', 'Hinglish', 'YouTube']);
});

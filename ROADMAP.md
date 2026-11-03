# Cwaya Captions — Strategic Roadmap

A browser caption studio in the class of fluxocut.com/app, built for one goal:
**Premiere Pro–level caption quality** — frame-accurate timing, razor-sharp text,
buttery animation — with **trending styles in one click** and **effortless word fixes**.

Launch languages: **English, Hinglish (Roman Hindi), Hindi (Devanagari)**.

This document is the plan only. No code is written until the decisions in §10 are made.

---

## 1. What "no compromise on quality" means (measurable targets)

Every phase is judged against these numbers, measured on our own test set (§8).

| Quality | Target | How FluxoCut-class tools usually fall short |
|---|---|---|
| Word timing | Each word starts within **±30 ms** of when it's spoken (median), never more than ±80 ms | ASR timestamps alone drift 100–300 ms, words appear early/late |
| Transcript accuracy | Word error rate **< 8%** Hinglish/Hindi, **< 5%** English, on clear speech | Brand/place names wrong ("Seehor" for Sehore) |
| Hinglish readability | Natural WhatsApp-style spelling ("zaroorat", not "zarUrata"), English words in English ("video") | Mechanical transliteration |
| Text sharpness | Text rendered at the **output resolution**, never scaled bitmaps; identical in preview and export | Preview ≠ export, soft edges at 4K |
| Smoothness | Animations computed per frame from exact time; **60 fps** export; no dropped or doubled frames | Animations tied to UI timers, jitter |
| Hindi shaping | Every conjunct and matra correct (क्ष, त्र, ज्ञ, ि, ॅ) in every font and effect | Broken glyphs when effects split text |
| Export fidelity | Output frame N shows exactly the captions due at time N/fps | Off-by-one-frame captions |
| Edit speed | Fix a word in **< 3 s**; timing re-derived automatically | Manual retiming |

---

## 2. Product scope

### Must-have at launch (parity with FluxoCut)
- Upload video or audio; video **never leaves the device** (only audio is sent for transcription).
- Auto language detect; output as English / Hinglish / Hindi.
- Word-timed captions; max words per caption; smart line breaks; caption delay offset.
- Caption list editor + timeline (video, caption and audio tracks), split/merge/delete, undo/redo, shortcuts.
- Template gallery, one click to apply, with per-template animation variants.
- Text controls: font, size, weight, position, line/word/letter spacing, case, colour, stroke, shadow, glow, shine, blend.
- Highlighted/active word styling (colour, pill, scale) and per-word overrides.
- Safe-zone guides (Reels/Shorts), snap guides, auto-fit to frame.
- Export MP4 (1080p/4K, 30/60 fps) and SRT.

### Where we beat it (our differentiators)
1. **Two-pass timing** — ASR + forced alignment → word timing to ±30 ms (§4.2).
2. **Smart word fixing** — edit text freely; we re-align only what changed (§4.4). Spelling and brand-name suggestions, custom vocabulary ("Sehore", client names).
3. **Real Hindi typography** — a curated set of Devanagari fonts with styles designed for them, not English fonts with fallback.
4. **Face-aware captions** — captions avoid faces automatically; text-behind-person; tracking with no jitter (§4.6).
5. **Deterministic rendering** — the preview *is* the export (same engine, same frame math).
6. **Premiere workflow** — SRT, plus transparent caption overlay export (ProRes 4444 / alpha) to drop on a Premiere timeline (Phase 3).

### Out of scope (for now)
Full video editing (cuts, transitions, colour), stock media, AI voiceover, plugins for Premiere/AE/Resolve (Phase 4 at the earliest).

---

## 3. Recommended tech stack (and why it beats a typical setup)

| Layer | Choice | Why this, not the usual |
|---|---|---|
| App | **Next.js 16 + React 19 + TypeScript** | Same stack as the Cwaya site; shared auth, payments and design |
| Editor state | **Zustand + Immer**, command pattern for undo/redo | Predictable, tiny, fast with large caption lists |
| Text rendering | **Skia via CanvasKit (WASM)** — paragraph API with HarfBuzz shaping | Same glyph output in every browser; correct Devanagari shaping; per-glyph control for letter animations; vector-sharp at any resolution |
| Effects & compositing | **WebGL2 shaders** (WebGPU when available) for glow, blur, shine, blend, masks | GPU effects at 60 fps instead of slow CPU canvas filters |
| Video decode/encode | **WebCodecs** through **Mediabunny** (demux → decode → encode → mux, MP4/WebM) | Frame-exact access; hardware encoding; no ffmpeg.wasm slowness |
| Frame-accurate preview | Decode frames via WebCodecs into the render loop (not the `<video>` element's clock) | `<video>` is ±1 frame inaccurate; ours is exact |
| Heavy work off the UI | **Web Workers + OffscreenCanvas** for rendering, decoding, face tracking | UI stays smooth while exporting |
| Local storage | **OPFS** (Origin Private File System) for media + project autosave; IndexedDB for metadata | Large files stay local and survive reloads |
| Speech-to-text (pass 1) | **ElevenLabs Scribe** or **Deepgram Nova-3** (word timestamps, Hindi + code-mixed) — chosen by benchmark (§8) | Best-in-class Hindi/Hinglish accuracy with word timestamps |
| Timing (pass 2) | **Forced alignment** (CTC aligner, MMS/wav2vec2 models) on a GPU serverless worker (Modal or RunPod) | Snaps every word to the exact audio frame |
| Hinglish + proofreading | **Claude** (fast model) with strict 1-word-in → 1-word-out JSON, custom vocabulary | Natural Roman Hindi; keeps timings intact; catches spelling/brand errors |
| Face & person AI | **MediaPipe Tasks Vision** (Face Detector / Face Landmarker, Image Segmenter) in a worker, **One-Euro filter** smoothing | Runs in-browser, Apache-2.0 (commercial-safe), no server cost |
| Backend | **Supabase** (Auth, Postgres, Storage for short-lived audio), Next.js route handlers | Already in use at Cwaya |
| Payments | **Razorpay** (minutes-based plans) | Already in use at Cwaya |
| Fonts | Self-hosted, subsetted **Google Fonts (OFL)**; Devanagari set; user font upload | Commercial-safe licences; fast loads |
| Server-side export fallback | **Remotion** render on a worker (Phase 3) for browsers without WebCodecs (iOS) | Same templates, server-rendered |
| Quality tooling | **Playwright** visual regression (golden frames per template), timing benchmark scripts, Sentry | Quality is tested, not hoped for |

Browser support at launch: **Chrome / Edge desktop & Android** (full WebCodecs). Safari: preview yes, export via server fallback (Phase 3).

---

## 4. Core systems

### 4.1 Audio pipeline
Extract audio in the browser → mono 16 kHz Opus (≈ 1–2 MB for 10 min) → upload to short-lived storage (deleted after processing) → transcription job → results streamed back.

### 4.2 Transcription & timing (two-pass)
1. **Pass 1 — ASR**: transcript + rough word times + language/code-switch tags.
2. **Pass 2 — Forced alignment**: align the transcript to the audio at ~20 ms resolution; fix word start/end; detect silences.
3. **Post-process**: filler detection (um, uh, matlab), punctuation, sentence boundaries, confidence per word (low-confidence words highlighted for review).

### 4.3 Script & language layer
- One **canonical transcript** (tokens with timings) feeds three renderings: English, Hindi (Devanagari), Hinglish (Roman).
- Hinglish conversion: LLM maps each token 1:1, returning JSON validated for token count; English loanwords restored ("वीडियो" → "video").
- **Custom vocabulary** per user/project: brand names, places, people; applied before display and offered as one-click fixes.

### 4.4 Word editing (the "fix mismatched / extra / misspelled words" promise)
- Edit a caption like plain text. A **token diff** classifies changes:
  - *Spelling fix / replace* → keep the original timing.
  - *Extra word deleted* → remove it; neighbours keep their timing.
  - *Missing word added* → re-align just that phrase (local forced alignment, < 1 s).
  - *Split/merge lines* → timing preserved.
- **Proofread panel**: AI suggestions (spelling, names, wrong-language words) as one-click accept/reject, never silent changes.
- Find & replace across all captions; "fix everywhere" for repeated errors.

### 4.5 Caption render engine
- **Layout**: CanvasKit paragraphs → glyph runs with positions; line breaking by words-per-caption + natural phrase rules; auto-fit to the frame and the safe zone.
- **Animation**: each template defines keyframed properties per caption / word / letter (opacity, position, scale, rotation, blur, colour) driven by the exact word times; easing curves (spring, expo, back); deterministic `frame(t)` function — the same call powers preview and export.
- **Effects**: stroke, shadow, glow, shine sweep, gradient, blend modes, pill/box highlights, hand-drawn underline, script accents — GPU shaders.
- **Template format**: versioned JSON (fonts, colours, layout, animation tracks, highlight rules), so new trending styles ship without code changes.

### 4.6 Face & subject intelligence
- Sample frames (≈ 10 fps) in a worker → face boxes / landmarks → smoothed tracks (One-Euro filter, gap filling).
- **Auto-avoid**: captions reposition away from faces, eased so they never jump.
- **Text tracking**: caption anchored to a face/subject, smoothed.
- **Behind subject**: person segmentation mask; text composited behind the person.
- **Auto-reframe** (16:9 → 9:16) following the speaker (Phase 3).

### 4.7 Export
- Worker pipeline: decode source frame → draw frame + captions at output resolution → encode (H.264 high profile, ~12 Mbps 1080p / ~40 Mbps 4K) → mux with the original audio (copied, not re-encoded).
- Progress, pause/cancel, resume after crash (OPFS checkpoints).
- Outputs: MP4, SRT/VTT, transparent overlay (Phase 3), caption-on-colour for audio-only.

---

## 5. Trending fonts & one-click styles

**Launch set (≈ 40 fonts, all OFL — free for commercial use)**

- Bold display: Montserrat (800/900), Poppins, Anton, Bebas Neue, Archivo Black, Kanit, Oswald, Rubik, Luckiest Guy, Bangers, Teko, Alfa Slab One
- Script / accent words: Great Vibes, Alex Brush, Satisfy, Allison, Mea Culpa, Imperial Script, Birthstone
- Editorial: Playfair Display, Instrument Serif, DM Serif Display
- **Devanagari**: Poppins, Baloo 2, Mukta, Hind, Rozha One, Yatra One, Kalam, Teko, Khand, Tiro Devanagari Hindi, Laila, Amita, Martel

**Launch templates (20), each with 3–5 animation variants**

Pop Viral (Hormozi-style active word), Karaoke Fill, Box/Pill Highlight, Script Accent, Glow Caps, Kinetic Stack, Word Stairs, Punch Line, Typewriter, Neon, Lyrical, Minimal Lower, Editorial Serif, Hand Underline, Mixed-Script Duo, **Hindi Bold**, **Hindi Calligraphy**, **Desi Pop** (Devanagari + Roman mix), Gradient Sweep, Spotlight.

**Trend pipeline**: new templates are JSON drops reviewed with golden-frame tests; aim for 2 new trending styles every two weeks after launch.

---

## 6. Phases

### Phase 0 — Foundations (week 1–2)
- Decide §10 items; set up repo in `D:\shivas social\ai caption`, CI, design system.
- **Benchmark first**: 30 real clips (Hindi, Hinglish, English; studio, outdoor, noisy, music) with hand-made "gold" captions. Run 2–3 ASR providers + alignment; pick by data.
- Rendering spike: CanvasKit + WebGL + Mediabunny export of one animated template at 1080p60 — prove sharpness, shaping and frame accuracy before building the UI.

**Exit criteria**: chosen ASR; timing ±30 ms median on the benchmark; one template exports frame-accurately.

**Status (30 Oct 2026)**
- Done: rendering spike passes. 360 of 360 frames decoded back at 1080p60 with every caption on its exact frame, Devanagari shaping correct, export 3.4× real time.
- Done: full pipeline on one real clip (`yt-1-b`, Hindi/Hinglish, 21.5 s): Groq, Gemini, Modal alignment, burned-in Hinglish and Hindi MP4 with original audio, 7× real time. The owner watched both exports and confirmed the timing looks right.
- Done: repo created (no commit yet), CI file written (runs once pushed to GitHub), design tokens in `globals.css`.
- Done: timing measured against true word times, using Windows speech with known word positions (`scripts/make-speech-cases.ps1`, `scripts/check-gold.mjs`, `scripts/benchmark.mjs`). Median error 16 ms on clean speech and 16 ms on passages unseen when the correction was set, 99% within 80 ms, worst 91 ms. Noise and music: 17-18 ms. English only, computer voices, synthetic music.
- Done: repeatability on real Hindi (`scripts/repeatability.mjs`): words kept by the app moved 10 ms at the median and 17 ms at p90 when the audio was cut differently, which shows consistency rather than accuracy. Two of 73 moved more, 88 ms and 328 ms.
- Open: the "never over ±80 ms" limit is 99% met, not 100%.

**Real-clip accuracy (2 Nov 2026)**. The owner set the target at clips of 40 seconds to 1 minute, and the app now refuses videos over 1 minute, in the browser and on the server, before any minutes are charged.

Clips: `yt-1-b` (21.5 s, Hinglish), `wa-1` (7.8 s, Hindi), `en-1` (8 s, English, an AI short), and `cut-43`, `cut-50`, `cut-60`, cut from the looped `yt-1-b` so their words are known exactly. One of those starts mid-sentence.

References: no person has checked them. Gemini heard the raw audio without seeing Whisper's text, on several models. All readings agreed on every word of `wa-1` and `en-1`, and on all of `yt-1-b` except one: at 0:14, "high quality में reel" or "high quality reel". The fit to the sound was mixed, so "में" stays until someone listens. Treat these as machine-agreed references, not hand-checked ones.

| Caption view | Whisper alone | Gemini 3.5 listening, original audio | Final: small audio, backup model | Target | Words scored |
|---|---|---|---|---|---|
| Hindi | 8.4% | 1.1% | 1.4% | under 8% | 783 |
| Hinglish | 4.0% | 1.5% | 2.0% | under 8% | 784 |
| English | 0% | 0% | 0% | under 5% | 18 |

The last column ran on `gemini-3.1-flash-lite`, because my testing used up the daily 500 calls for 3.5 Flash-Lite on 2 Nov. The final setup still needs scoring on 3.5. Most of what remains is "लेके" written as "लेकर". Run `scripts/run-clip.mjs` on a clip, then `scripts/score-clips.mjs`.

Timing against the sound itself, on words after a real pause of 200 ms or more (`scripts/timing-check.mjs`): median 16 to 26 ms on Hindi and Hinglish, against 100 to 370 ms from Whisper alone. English is 40 ms, on 5 words only, and words land about 27 ms early. That may mean `LEAD` was over-set by the computer voices, but 5 words is too few to change it. A few words measure up to about 190 ms off. The ones looked at were loud syllables inside long words, not proven errors.

What changed in the pipeline:
- Gemini now supplies the words (`src/server/listen.ts`). It made 1 to 3% errors where the Whisper pipeline made 8 to 17%, on 40 to 60 second clips. It listens twice, because 2 of 12 test runs lost their place in the repeated text, and Whisper's reading picks the better one. Whisper and forced alignment still give every word its time. If Gemini fails or disagrees badly, Whisper's words stand.
- Whisper reports how sure it was, and that splits good from bad cleanly: misread passages scored -0.7 to -1.0, good ones -0.05 to -0.17. The same audio can read perfectly from one start and as nonsense from another. A doubtful passage, or one with too few words for its sound, is read again from a new start, joined at a word both readings share, and kept only if it really is better. On the 10-minute clip this alone took errors from 9.5% to 7.9% in Hindi and 10.4% to 8.4% in Hinglish.
- Hindi captions show the correct spelling and digits ("2001", "बैन"), and Hinglish keeps digits too. Telling the language step to fix spelling first made it swap words ("न्यू" became "नया" in 3 of 6 runs), so the rule now forbids any change of word.
- All Gemini calls go through `src/server/gemini.ts`, which asks `gemini-3.5-flash-lite` first and `gemini-3.1-flash-lite` if the first has run out for the day. Models are named exactly, because a "latest" name can change its price and habits. Gemini 3.5 Flash was tried and dropped: with Gemini's listening supplying the words, Flash-Lite already scored about 1% errors, and the bigger model cost several times more.
- Two failures that stopped whole jobs are gone: a rate limit with a short "try again" hint, and Gemini returning 119 of 120 words. A batch with the wrong count is now split and tried again.

Speed, from cold, on this PC and free tiers: a 60 second clip fell from 176 s to 44 to 53 s, and 8 s of speech takes about 12 s. `fluxocut-gap-audit.md` lists what each fix did. The server log prints one line per job with each step's time, and a line for every retry. Sound sent to the models is now 24 kHz mono Opus at 48 kbps: errors stayed in range, and word times did not move (median 0 ms on all six clips, 95% within 20 ms).

Cost per minute of video fell from ₹4.94 to ₹1.44 to ₹1.84, measured from Gemini's token reports.

Limits:
- Only 3 independent clips, not the 30 the exit asks for, and none checked by a person.
- The 40 to 60 second clips all repeat 21.5 s of one speaker. A normal clip of that length is still needed.
- English is 18 words. Numbers in English speech cannot be read by the English timing model, so they keep rough times. No English clip with numbers has been tried.
- Clips go to Google on Gemini's free tier, which may use them for training. Warn before private client clips go through it.

Phase 0 verdict: engineering complete, and real speech now lands inside the §1 word targets. Exit still needs more clips checked by a person.

Lessons from the benchmark:
- The Windows voice reports positions on a 16 kHz clock, so test speech must be made at 16 kHz. At 22 kHz every "true" time ran 1.378× long and the first benchmark was meaningless. Always run `check-gold.mjs` first.
- The English model marks words about 38 ms late, a constant delay now removed (`LEAD` in `src/server/align.ts`). It was set from passages 0-1 and held on 2-3. The Hindi model runs about 12 ms early on the one real clip, so it is left alone.
- 0% word errors here does not predict real results: the voices are clean and the music is synthetic tones.

Lessons from the first clip, now built into the pipeline:
- Whisper can silently drop speech: it lost 8 of 21 seconds with no error. Audio now goes in 12-second pieces with 2 seconds of overlap, and `scripts/speech-gaps.mjs` flags loud stretches with no words.
- Forced alignment distorts words at block edges, so blocks overlap by 6 words and edge results are thrown away.
- Whisper mixes scripts unpredictably ("न्यू" but "high"), so the Hindi rendering uses Gemini's `spoken` form, which is always Devanagari.
- Whisper can glue words ("मरील" for "में reel"), so one token may hold two words.

### Phase 1 — Core studio MVP (week 3–6)
Upload → transcribe → three scripts → caption list + timeline editing → word-fix with local re-alignment → 10 templates + 25 fonts → text controls → safe zone → MP4 1080p + SRT export. Local projects with autosave. Runs on localhost only.

**Exit criteria**: all §1 targets met on the benchmark; 10-min clip exports at ≥ real-time speed on a mid-range laptop.

**Status (30 Oct 2026)**: every Phase 1 feature is built and tested; one exit criterion is still open.
- Tested with real input in visible Chrome: playback, Space, frame stepping, S to split, Ctrl+Z, moving a caption on the timeline, dragging text on the preview, clicking a word, typing a fix.
- Tested on hard clips: a phone-style file with a rotation flag, an upright 9:16 reel, and a 10-minute 955 MB clip (833 captions).
- Three scripts: Hindi speech now gives Hinglish, Hindi and English. English is translated phrase by phrase, then cut into captions, because caption-by-caption translation read as broken English. Word fixes now carry over to the other scripts.
- Production build passes, 0 audit issues, and the Next.js update is in.

Exit criteria:
- Met: 10-minute export at 3.5× real time (18,060 frames in 171.8 s) on this PC, written straight to disk. This PC may not be a mid-range laptop.
- Partly met: "all §1 targets on the benchmark". Word targets are met on the real clips so far, against machine-agreed references. The ±80 ms limit is not, and clips checked by a person are still needed. See Phase 0.

§1 targets today:
| Target | Result |
|---|---|
| Timing ±30 ms median | 16 to 26 ms on real Hindi and Hinglish speech; 40 ms on 5 real English words; 16 ms on English computer voices |
| Never over ±80 ms | 99% of words on computer voices, worst 91 ms. Real speech measures up to about 190 ms, mostly loud syllables inside words, unproven |
| Word errors under 8% Hindi, 5% English | 1.4% Hindi, 2.0% Hinglish, 0% English on clips up to 1 minute, against machine-agreed references |
| Sharpness, Hindi shaping, export fidelity | Pass on what was checked; not every font |
| 60 fps | Export keeps the source frame rate; 60 fps export is Phase 2. About 5.6 ms per frame at export. Live playback fps could not be measured because Chrome throttles a covered window |
| Fix a word in under 3 s | Text is instant; re-timing an added word takes a few seconds on CPU |

Warning sign: the 10-minute clip is one 21.5 s clip repeated 28 times, so every copy should read the same. It did not. Word counts ranged from 65 to 92 of about 91, and copies differed by a median of 11% on unified spelling. This measures consistency, not accuracy, but it shows Whisper still drops words. Each piece is now checked against the audio and re-read if its words miss too much loud speech, and the language is locked after the first piece. That lifted the worst copy from 65 to 75 words and the total from 2,431 to 2,449 of about 2,548, so about 4% of words are still missing. Update, 2 Nov 2026: many of those were misread rather than lost. Gemini listening fixes this, and videos over 1 minute are now refused. See Phase 0.

Timing on a 10-minute clip with free tiers: 18 minutes (Groq about 3.5, Gemini about 11, Modal about 3). Gemini was unusually slow that day; a one-word request took 44 s. The paid tier or a GPU would shorten this.

Not tested: 4K sources, true 1080×1920 reels, real English voices, several people in frame, faces turned sideways.

Choices that differ from §3 and §7, to revisit in Phase 2:
- Preview uses the browser's `<video>` with captions on a canvas above it, not WebCodecs decoding. Sound sync is free and text is identical to export, but frame stepping is less exact.
- Export runs on the main thread, not a worker. The editor is blocked during export, behind a progress dialog. It streams to a file on disk, so long videos do not need to fit in memory.
- Update, 2 Nov 2026: audio is now re-encoded in the browser to 24 kHz mono Opus at 48 kbps (`speechAudio` in `src/lib/audio.ts`), a quarter of the size. A browser that can't encode it sends the sound as it is. This uses Opus, not the Windows AAC encoder that ruled out re-encoding earlier.
- Gemini Flash-Lite replaced Flash: 8 s against over 80 s on the first clip, with Hinglish at least as natural.

### Phase 2 — Pro polish & intelligence (week 7–10)
20 templates, 40 fonts, per-word styling, shine/blend/gradient, auto-fit, custom vocabulary, AI proofread panel, find & replace, 4K/60 export, face auto-avoid, text tracking, behind-subject, filler/silence detection (Auto Trim review).

**Status (30 Oct 2026)**: every item built and tested on `yt-1-b` and its test variants. Limits are listed below.
- Per-word styling: click a word on the preview or in the caption list to set its colour, font and size. Words on one line share a baseline. Script fonts never go to capitals.
- 20 templates. New effects: stacked and stair arrangements, accent word, wipe reveal, animated underline, gradient fill, pop entrance. Tall captions now stay inside the frame.
- Face auto-avoid: scan runs in the browser with MediaPipe, 10.5 s for 21.5 s of video. Each caption gets one height for its whole time on screen and glides between heights.
- 21 templates (Overlay Title was dropped: blended white text vanished on a bright wall; blend stays as a control) and 48 font families, 20 with Devanagari.
- Shine sweep, four blend modes, auto-fit for words too wide or stacks too tall.
- Custom vocabulary: steers Whisper and Gemini, and joins split names before timing ("Cap Cut" becomes "CapCut").
- AI proofread: one-click accept or reject, nothing changes silently. Found 3 of 3 planted mistakes, no false alarms on the clean text.
- Find & replace across all captions, words or phrases, as one undo step.
- Export: 1080p or 4K, source frame rate or 60 fps. 4K with the person cutout took 24.8 s for 21.5 s of video. 1080p60 ran at 3.4× real time. Verified 3840×2160 and exactly 60.00 fps from the files.
- Text tracking with a One-Euro filter: the worst frame-to-frame jump fell from 53 to 17 px and mean jitter halved, for about 0.2 s of lag. Face positions are sampled 5 times a second.
- Behind the person: a selfie segmentation mask composites the person over the text, in preview and export.
- Filler and silence review: lists filler words and long pauses, jumps to each one, and removes fillers from captions.

Limits:
- Auto Trim is review only: fillers leave the captions, but the video and audio are not cut.
- 4K export upscales a 1080p source. The text is truly 4K; the video is not. Not yet tried on a real 4K source.
- Find & replace and proofreading are off in the English translation view.
- Behind-person and tracking were tested with one person. The mask is 256 px, so edges are soft, and fine hair detail is not kept.
- 60 fps repeats source frames, so the video stays as smooth as it was shot; only the captions gain frames.

**The owner's liked templates (2 Nov 2026)**. Script Lessons, Red Signature, Mint Pop, Zyada, Word Stairs and Slide Glow were added to match the six the owner liked in FluxoCut, and sit first in the gallery after Pop Viral. Word Stairs replaces our older one of that name. That makes 26 templates and 51 font families: Inter, Goldman and Sofia Sans Extra Condensed are new, all OFL.
- Fonts, colours, shadows, sizes and timings were read from the script FluxoCut's page loads, then rebuilt in our engine, and compared with the owner's cards and with a live frame of the owner's project. None of their code or files is used. See `/dev/templates`.
- The engine gained rows: one caption can mix fonts, sizes, alignments and casing, rows can overlap, letters can stretch taller, and shorter rows can grow to match. Words can also fade, blur or slide in as each one is spoken. Choosing one of these templates sets its own caption length and height.
- Where they differ on purpose: Red Signature keeps a slightly wider word gap, because FluxoCut's nearly-zero gap ran real sentences together. These fonts have no Hindi letters, so Hindi uses Poppins, and rows overlap half as much because Devanagari marks stand tall.
- Only the variant set in the owner's project was added: Red Signature None, Word Stairs Blur Focus, Slide Glow By Word. FluxoCut's other variants are not in.
- The Capitals control has no effect on these, because each row sets its own casing. A transparent MOV with the blur took 24.5 s for 7.8 s of 464×832.
- Their names and looks come from a competitor's product, and FluxoCut's terms §5 ban reverse engineering. Reading that script may have breached §5, and it will not be done again. `fluxocut-gap-audit.md` recommends redesigning and renaming these six before anyone outside Cwaya uses the app. On 3 Nov 2026 the owner chose to keep them for now, so revisit this before launch.

What the face scan needed, learned on the first clip:
- The short-range model found a face in only 27% of a wide 16:9 shot, so each frame is also checked in zoomed tiles.
- Tiles made it fire on a wall drawing and on hands. Boxes are now followed through time: anything that never moves, or lasts under a second, is dropped. Result: one face in all 108 samples.
- Known risks, untested: a person sitting extremely still could be dropped as a picture, and there is no result yet for vertical video, several people, or faces turned sideways.
- The One-Euro filter from §4.6 is not used, because a caption takes one height from all faces in its time window, so box jitter cannot reach the screen. It will be needed for text tracking.

### Phase 3 — Accounts & business (week 11–13)
Cwaya login, minutes-based plans with Razorpay, watermark on free tier, project sync (metadata only), server export fallback (Safari/iOS), transparent overlay export for Premiere, auto-reframe 9:16, usage dashboard.

**Status (31 Oct 2026)**: every item is built and tested on localhost. Login and payments ran against a local stand-in with the real database schema, never against real Supabase or Razorpay, so going live still needs the steps below.
- Login: email and password on Cwaya's Supabase, with sign-up, sign-out and password reset. Every paid route refuses a missing or forged token.
- Minutes: 10 free a month (India time), then packs of ₹199 for 60, ₹499 for 200 and ₹1499 for 800 minutes, valid 30 days. Prices are placeholders in `src/lib/plans.ts`. Minutes come off before work starts and go back if the job fails. The rules live in Postgres, so twelve uploads at once cannot overspend.
- Razorpay: the server sets the price, checks the signature and asks Razorpay to confirm. Browser return and webhook can both arrive; an order only ever credits once.
- Watermark: on for free accounts, off while a pack is valid. If the account check fails, the mark stays on.
- Sync: captions, settings, face scan and a small waveform follow the account, about 66 KB for 21 s. Video and audio never do: on a new device the person picks their own file again, and a file of a different length is refused.
- Transparent export: a QuickTime Animation MOV with alpha, written by hand in the browser. ffmpeg read all 646 frames with no errors and the transparency is clean. 23 s to make 21.5 s of 1080p, 78 MB.
- Server export: the browser still draws the captions, as a transparent layer, and ffmpeg on the worker lays it over the video, so preview still matches export. This differs from §3 (Remotion) for that reason. It took 306 s for this 21.5 s clip: about 25 s drawing the layer in the browser, the rest sending 110 MB, running ffmpeg and downloading, not measured apart. The result matched the browser export.
- Auto-reframe: a 9:16 window follows the main face, looking 1.5 s ahead and behind so it glides. Works with avoid faces and behind the person, in preview, browser export and server export.
- Usage dashboard: `/account` shows minutes left, watermark state, packs, recent videos and payments.

Tests: `scripts/test-accounts.mjs` (66 checks through the real API routes, needs the `captions-accounts` preview), `scripts/test-billing-sql.mjs` (35 checks on the money rules, needs that preview stopped), `scripts/check-mov.py` (a MOV through real ffmpeg on Modal).

What testing found, all fixed:
- Whisper invents a word on a silent clip, which would have charged for a fake caption. A word now needs sound under it. The 91 words of `yt-1-b` were unaffected.
- The watermark never appeared: it was drawn before the fonts loaded, and the empty result was kept. Any caption drawn in that moment had the same fault.
- A file could hide extra audio from the header that sets the charge. The decoded length now has to agree.
- Export options reached an ffmpeg command, so only plain numbers are accepted now. A link like `/\evil.com` could leave the site after sign-in. A reset link could be missed if Supabase read it before the page was ready. A session that had ended on the server still looked signed in on the device, so the page now signs out when the server says so.

To go live, in this order:
1. Run `supabase/caption-schema.sql` in Cwaya's Supabase.
2. Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Until then the app stays in local mode: no login, no limits, no watermark. A deployed copy without them refuses everything.
3. Add this app's address to Supabase's allowed redirect URLs, or reset links will not come back here.
4. Get working Razorpay keys. The keys on file are refused with 401, on the Cwaya site too. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_CAPTION_WEBHOOK_SECRET`, and point a `payment.captured` webhook at `/api/webhook/razorpay`.
5. Long jobs and large uploads will not fit Vercel's function limits. Deploying needs direct uploads and a job queue.

Limits:
- Not tried yet: Safari and iPhone (the fallback was tested by hiding the encoder in Chrome), importing the MOV into Premiere, real Razorpay checkout (a stand-in replaced its popup).
- The watermark is drawn in the browser, so someone skilled could remove it. A burned-in mark would need every export on the server.
- Sync sends the transcript text to Supabase. If two devices edit at once, the later save wins.
- Server export takes files up to 500 MB. A minute of 1080p fits, at about 3.6 MB per second for the caption layer, but 4K would not. Text behind the person is not available there. It does not cost minutes yet, though it costs compute.
- At the default height, text behind the person hides fully in 9:16, because the person fills the frame. Raising the text to head height gives the intended effect.
- Transparent export is MOV Animation, not ProRes 4444 as §2 planned: there is no ProRes encoder in the browser.

### Phase 4 — Growth (later)
Premiere Pro / After Effects panel, more Indian languages (Roman + native), brand kits, team workspaces, template marketplace, API for agencies.

---

## 7. Architecture overview

```
Browser (all heavy media work stays here)
 ├─ UI (Next.js/React, Zustand)           ← caption list, timeline, templates
 ├─ Render worker (CanvasKit + WebGL)      ← frame(t) = video frame + captions
 ├─ Media worker (Mediabunny/WebCodecs)    ← decode, encode, mux
 ├─ Vision worker (MediaPipe)              ← faces, segmentation, smoothing
 └─ OPFS                                   ← media, autosave, export checkpoints

Server (only small, short-lived data)
 ├─ Next.js API routes                     ← auth, jobs, billing, presigned uploads
 ├─ Supabase                               ← users, projects (metadata), minutes, audio (temp)
 ├─ ASR provider                           ← pass 1
 ├─ GPU worker (Modal/RunPod)              ← forced alignment, local re-align
 └─ LLM                                    ← Hinglish, proofreading
```

Privacy: video never uploaded; audio deleted after processing (≤ 24 h); no training on user content.

---

## 8. Quality assurance

- **Benchmark set** (Phase 0): grows to 100+ clips; tracks WER and word-timing error per language after every change.
- **Golden-frame tests**: each template rendered at fixed times, compared pixel-by-pixel in CI (Playwright).
- **Devanagari shaping tests**: a list of tricky words rendered in every Devanagari font and effect.
- **Export accuracy tests**: synthetic clips with known timestamps; verify the caption appears on the exact frame.
- **Performance budgets**: editor at 60 fps with 2,000 caption tokens; export ≥ 1× real-time at 1080p on a mid-range laptop.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hinglish ASR accuracy varies by accent/noise | Benchmark-driven provider choice; confidence highlighting; custom vocabulary; easy word fixes |
| WebCodecs missing on iOS/Safari | Server export fallback (Phase 3); clear browser notice |
| CanvasKit bundle size (~7 MB) | Lazy-load in a worker; cache with a service worker |
| Font licences | Only OFL / commercial-safe fonts; user uploads at user's own responsibility |
| Face model licences | MediaPipe (Apache-2.0). Do **not** reuse InsightFace (non-commercial) here |
| Cost per minute (ASR + alignment + LLM) | Measure in Phase 0; price plans above cost; cache results; only re-align edited phrases |
| Scope creep into a full editor | Hold to §2 scope; captions first |

---

## 10. Decisions (locked 30 Oct 2026)

| # | Decision | Choice |
|---|---|---|
| 1 | Speech-to-text | **Groq Whisper (large-v3)** only — free tier, word timestamps. No multi-provider benchmark; we still measure it on the test clips. |
| 2 | Timing precision (forced alignment) | **Modal** worker (pay per second, free monthly credits). Runs on CPU for now, because GPU needs a payment method on the account. Same accuracy, slower on long videos. |
| 3 | Hinglish conversion + proofreading | **Google Gemini Flash (free tier)** instead of Claude. Note: on the free tier Google may use requests to improve its models; switch to the paid tier before handling client content at scale. |
| 4 | Where it lives | **Separate app** in `D:\shivas social\ai caption` (later `captions.cwaya.me`), shared Cwaya login |
| 5 | Test clips | **~30 real clips** (Hindi, Hinglish, English, 30–90 s) provided in `ai caption/test-clips/` |
| 6 | Browsers | **Chrome / Edge first**; Safari later via server export |

Stack changes from §3 because of these choices: ASR = Groq Whisper; LLM = Gemini Flash (free).
Phase 0 now *verifies* Groq Whisper + Modal alignment against the §1 targets instead of comparing providers;
if Hinglish accuracy misses the target, revisit decision 1.

### Original open questions (answered above)

1. **ASR provider budget** — OK to sign up for 2–3 providers (free credits) for the Phase 0 benchmark?
2. **GPU worker** — Modal or RunPod account for forced alignment (pay per second)?
3. **LLM** — use Claude (Anthropic API key) for Hinglish conversion and proofreading?
4. **Benchmark clips** — can you provide ~30 real client clips (Hindi/Hinglish/English) we're allowed to test with?
5. **Where it lives** — separate app (e.g. `captions.cwaya.me`) or a section of the Cwaya site? (Recommended: separate app, shared login.)
6. **Launch browsers** — Chrome/Edge first (recommended), Safari later?

---

## 11. First week, concretely (once §10 is answered)

1. Repo + CI + design tokens (reuse Cwaya "editor's desk" look).
2. Collect and annotate 30 benchmark clips.
3. Run providers + alignment; report WER and timing error table.
4. Rendering spike: one template, Devanagari + Roman, exported at 1080p60; frame-accuracy check.
5. Review results together → lock stack → start Phase 1.

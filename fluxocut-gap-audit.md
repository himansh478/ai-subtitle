# FluxoCut Gap Audit

- **Date:** 2 November 2026
- **Target:** [fluxocut.com](https://fluxocut.com)
- **Compared with:** Cwaya Captions, this folder
- **How it was researched:** FluxoCut's public pages, opened in the owner's own Chrome. Its editor as the owner sees it, in their own signed-in project. Public price pages of the vendors it likely uses, and competitors' public pages. One earlier step went outside these limits, and "Limits of this research" says so plainly.

Claims about FluxoCut carry a label: **Stated** (the company says so), **Observed** (seen in normal use), **Inferred** (reasoned, with the reason given), **Unknown** (not found). This is practical guidance, not legal advice.

## Bottom line

FluxoCut is a browser caption editor for Indian creators and editors, live since 11 July 2026 (Stated). It covers 82 languages, has 1,942 fonts, really cuts silences and filler words, and has a free Premiere Pro and After Effects plugin (all Stated).

Most of its engine can be bought from other companies, so rebuilding the core is not the hard part, and we already have it. Its real value is in its templates, editor and plugin. We lead on showing people which words to check, and possibly on saved styles and 9:16 reframing. We are behind on phones, real trimming, plugins, fonts and language range.

Recommended wedge: **a 60-second Hindi or Hinglish Reel goes from upload to finished video in under 3 minutes, and a person only checks the words the app flags.**

In this round a 60-second clip went from 176 s to 44 to 53 s, and its cost from ₹4.94 to ₹1.44 to ₹1.84 a minute, with accuracy still well inside the targets.

The biggest risk is the six templates copied closely from FluxoCut (next section).

## Decisions for the owner

| Decision | Why it matters | My recommendation |
|---|---|---|
| Keep, or redesign and rename, the six templates (Script Lessons, Red Signature, Mint Pop, Zyada, Word Stairs, Slide Glow) | I read their values from FluxoCut's page script, and they keep FluxoCut's names and close looks. See Limits. | **Decided 3 Nov 2026: keep them for now.** My advice stands for later: redesign and rename them before anyone outside Cwaya uses the app, or talk to a lawyer if you want to keep them close. |
| Keep the 1-minute limit | Your decision, and it keeps the product focused. It also leaves podcasts and long videos to FluxoCut. | Keep it. |
| Prices | The plans in `src/lib/plans.ts` are my placeholders, and 10 free minutes a month is generous against FluxoCut's 2 once. | Cut the free minutes. The Studio plan needs a higher price or fewer minutes. See the economics section. |

## Limits of this research

- **Terms.** FluxoCut's terms §5 forbid users "to attempt to breach, overload, reverse-engineer or abuse the service". §3 treats automating requests and gaming the minute meters as a violation. Nothing found in the terms is specifically about template designs. Indian law applies, with Telangana courts (Stated).
- **A step that may have breached §5.** To make the six templates "exact same", I downloaded one of FluxoCut's page-script files and read template values from it. That is outside the rules this audit follows, and I did not tell the owner at the time. I have not done it since and will not do it again. Nothing else in this audit depends on that file.
- **Not seen:** how Auto Trim decides, the phone editor, the plugin, what the "Presets" menu holds, and FluxoCut's real accuracy or speed on our clips.
- **Not known:** which speech and language companies it uses, and its real costs. Its privacy policy names some vendors but not those.
- **Reviews:** no independent reviews of FluxoCut were found. The quotes on its site are published by FluxoCut, so they are Stated only.
- **Our own numbers:** accuracy was scored against references that machines agreed on, on 3 independent clips. No person has checked them.

## What it does

**Who it is for:** Indian creators and editors. Its site quotes podcast editors, motivational pages and editors with foreign clients (Stated).

**Core job:** turn speech into styled, word-timed captions, in the browser or inside Premiere Pro or After Effects.

**Workflow:**
1. Drop in a video or audio file.
2. Pick a language.
3. Generate word-timed captions.
4. Pick a template and fix any words.
5. Export in the browser, or use the captions inside the plugin.

## Feature map

| Feature | Detail | Label |
|---|---|---|
| Languages | 82, 14 of them Indian, in native script or Roman letters, detected from the audio | Stated |
| Fonts | 1,942, plus your own uploads (20 on Editor Pro, 40 on Editor MAX) | Stated |
| Templates | Active-word emphasis, entrance animations, Blend with video, Shine, favourites pinned to the top | Stated, partly Observed |
| Auto Trim | Silences, fillers, stutters and repeated takes found from the transcript, each cut reviewable, one-click restore | Stated |
| Plugin | Premiere Pro and After Effects 2022 or newer, free, signs in with the same account | Stated |
| Export | MP4 in the browser, SRT. 720p with watermark on Free, up to 4K 60 fps on MAX. Phone exports use a render server in the EU | Stated |
| Audio projects | Drop an MP3 or WAV, and captions render on a chosen colour | Stated |
| Editor | Timeline with shortcuts, dark and light themes, Reels safe zone, centre guides | Stated, partly Observed |
| "Presets" menu | Seen in the editor, contents unknown | Observed |
| "Fill gaps" button | Seen on the timeline, effect not tested | Observed |

## How it likely works

| Feature | Input → processing → output | Hard part | Group | Label |
|---|---|---|---|---|
| Speech to text | Audio → a speech partner plus a second engine → words | Mixed Hindi and English, keeping every word | Commodity engine, craft tuning | Stated (unnamed vendors) |
| Script writing | Words → language model → native and Roman script | Natural Hinglish, one output per word | Craft | Inferred: there is no other way to offer Roman script for 14 Indian languages |
| Rendering | Video and captions → browser encoder → MP4 | Export must match the preview | Craft | Stated |
| Templates | Style settings → renderer | Taste, and how many good ones exist | Craft | Observed |
| Auto Trim | Transcript → find silences, fillers, repeats → cut list | Not cutting good speech | Craft | Stated |
| Plugin | Editor panel → generate → captions or text layers | Each host app's quirks, shown by its changelog fixes | Craft, early moat | Stated |
| Reach | Plugin users, low prices, word of mouth | Takes time to build | Moat, still small | Inferred from a July 2026 launch |

**Likely stack:**

| Part | Evidence | Label |
|---|---|---|
| Razorpay, Dodo Payments | Privacy policy, pricing page | Stated |
| Cloudflare R2 storage | Privacy policy | Stated |
| Google Analytics 4, Google Fonts, Google sign-in | Privacy policy | Stated |
| Speech and language vendors | Described, not named | Unknown |
| Video privacy | Says customer content never trains AI models, and an iPhone copy is kept up to 48 hours | Stated |

## Pricing and economics

| Plan | Price | Caption minutes | Other limits (Stated) |
|---|---|---|---|
| Free | ₹0 | 2, never expire | 720p with watermark, 2 Auto Trim minutes |
| Feel It | ₹15 once | 3 | 3 exports without watermark |
| Week Pass | ₹69 | 15 | |
| Editor | ₹299 a month | 90 | 2 devices |
| Editor Pro | ₹469 a month | 240 | 90 Auto Trim minutes, 4K, 20 custom fonts, 3 devices |
| Editor MAX | ₹969 a month | 600 | 220 Auto Trim minutes, 4K 60 fps, 40 custom fonts, 5 devices |
| Auto Trim top-up | ₹49 | 120 Auto Trim minutes | Never expire |

**What a minute of video costs us.** Measured on a 60-second clip, using Gemini's own token reports:

| Part | Cost per minute |
|---|---|
| Gemini listens twice | ₹0.22 |
| Language step | ₹0.43 |
| Whisper, 7 to 13 calls of 12 s each | ₹0.23 to ₹0.42 |
| Modal worker, the job plus 60 s idle | ₹0.57 to ₹0.77 |
| **Total** | **₹1.44 to ₹1.84** (it was ₹4.94 at the start of this round) |

Assumptions: ₹88 to $1. 18% GST inside the price, and 2% payment fee. Gemini 3.5 Flash-Lite at $0.30 in and $2.50 out per million tokens. Groq at $0.111 an hour with a 10 s minimum per call. Modal at $0.0000131 a core-second and $0.00000222 a GiB-second. Modal's $30 monthly credit is left out, so early costs are lower. Word fixes, translation, proofreading and hosting are not counted.

**Low cost, ₹1.44 a minute:**

| Plan | Price | Net revenue | Cost at full use | Margin | Margin % | Break-even use |
|---|---|---|---|---|---|---|
| Ours Starter (placeholder) | 199 | 164.66 | 86.40 | 78.26 | 48% | 191% |
| Ours Creator (placeholder) | 499 | 412.90 | 288.00 | 124.90 | 30% | 143% |
| Ours Studio (placeholder) | 1499 | 1240.36 | 1152.00 | 88.36 | 7% | 108% |
| FluxoCut Editor | 299 | 247.41 | 129.60 | 117.81 | 48% | 191% |
| FluxoCut Editor Pro | 469 | 388.08 | 345.60 | 42.48 | 11% | 112% |
| FluxoCut Editor MAX | 969 | 801.81 | 864.00 | -62.19 | -8% | 93% |

**High cost, ₹1.84 a minute:**

| Plan | Price | Net revenue | Cost at full use | Margin | Margin % | Break-even use |
|---|---|---|---|---|---|---|
| Ours Starter (placeholder) | 199 | 164.66 | 110.40 | 54.26 | 33% | 149% |
| Ours Creator (placeholder) | 499 | 412.90 | 368.00 | 44.90 | 11% | 112% |
| Ours Studio (placeholder) | 1499 | 1240.36 | 1472.00 | -231.64 | -19% | 84% |
| FluxoCut Editor | 299 | 247.41 | 165.60 | 81.81 | 33% | 149% |
| FluxoCut Editor Pro | 469 | 388.08 | 441.60 | -53.52 | -14% | 88% |
| FluxoCut Editor MAX | 969 | 801.81 | 1104.00 | -302.19 | -38% | 73% |

FluxoCut's rows use **our** cost as a stand-in, to show scale. Its real costs are Unknown.

**What this means:**
- Starter and Creator make money even if someone uses every minute. Studio only does if most of its minutes go unused.
- There is little room to win on price. Competing on speed and correct words is the better fight.
- 10 free minutes a month costs ₹14 to ₹18 per active free user, every month. FluxoCut gives 2 minutes once. Cut ours before launch.
- `gemini-3.1-flash-lite` has a lower output price and is now the backup. It was slower in our runs, so 3.5 stays first.

## Gaps in FluxoCut

| Gap | Evidence | Strength | Verified in the product? |
|---|---|---|---|
| It does not tell people which words to check | Not mentioned on any public page, and not seen in the owner's project | Medium | Not proven absent |
| No independent trust yet | No outside reviews found, 5 changelog entries, launched July 2026 | Medium | Not applicable |
| No team or agency plan | Plans differ by device count, not by people | Medium | Public pages only |
| Saved styles and batch work | Absent from the changelog, though a "Presets" menu exists | Weak | No, the menu was not opened |
| Trimming looks expensive | Auto Trim minutes are far scarcer than caption minutes (90 against 240, 220 against 600) | Weak | Inferred from allowances |
| Free plan is small | 2 minutes once | Weak | Public pages |

## Competitors

| Product | Strength | Weakness | Price | Source and its bias |
|---|---|---|---|---|
| Submagic | Well-known short-form caption tool | Priced in dollars. Hinglish quality not checked | About $19, $39, $69 a month, roughly 15, 40, 100 videos | Third-party trackers and blogs, not its own pricing page. Typito sells a rival editor |
| CapCut | Free, huge reach | A full editor rather than a caption tool (Inferred). Owned by ByteDance | Free tier | Submagic's own comparison page, so biased |
| Captions | Strong phone app | Phone-first | Not compared | Submagic's own comparison page, so biased |
| VideoCaptions.AI, Capkit, bol studio | Each pitches Hindi or Indian-language captions | Small, little evidence of quality | Varies | Their own pages |

## Recommended wedge

Each scored 1 to 5, higher is better.

| Candidate | Hurts | Easy to reach | Slow rival response | Cheap to build | Total |
|---|---|---|---|---|---|
| **Fastest correct Hindi or Hinglish Reel** | 5 | 4 | 3 | 5 | **17** |
| Agency batch: 20 Reels in an hour with one saved style | 4 | 4 | 3 | 3 | 14 |
| Phone-first editor | 4 | 5 | 2 | 1 | 12 |
| Cheapest plan | 3 | 4 | 1 | 2 | 10 |
| Premiere and After Effects plugin | 3 | 2 | 1 | 1 | 7 |

**Pick: fastest correct Hindi or Hinglish Reel.** It uses what we already have, fits your 1-minute limit, and Cwaya's own client work can test it straight away.

**Success test:** five real creators each take a real 60-second Hindi or Hinglish Reel from upload to exported MP4 in under 3 minutes, changing only flagged words, with under 1% wrong words left when a person checks the result.

## What was slowing it down

A 60-second clip took 176 s from cold, and still 107 s in a run with no rate-limit retries, not the "about a minute" the app promised. A step-by-step timing line in the server log showed why. Each row below was measured.

| Problem found | Evidence | Fix | Result |
|---|---|---|---|
| Audio was far bigger than the models need, and sent four times per job | One listen took 33 to 48 s at 1,424 KB, and about 5 s at 251 KB | The browser makes a small copy: `src/lib/audio.ts` | Gemini 54 s to 4 to 11 s on the main model |
| The worker started from cold twice per job | 41.7 s at the start, and again before alignment | A snapshot skips the slow imports, and the weights load in the background: `workers/align.py` | 5 to 16 s to wake, 13 to 19 s to align (was 35 to 45 s) |
| Whisper queued behind that cold start | Whisper took 59.9 s | First readings now run alongside it: `src/server/transcribe.ts` | 13 to 30 s |
| Each language batch was sent three times | Identical replies in Gemini's logs | The odd word is asked about alone: `src/server/convert.ts` | 9 calls to about 4 |
| Field names filled most of each reply | 2,868 tokens for 120 words | Plain pairs | 824 tokens, a 70% cut |
| The worker used half its threads | 18 s on 4 threads, 10 s on 8 | 8 threads | Alignment nearly twice as fast |
| A daily limit made the app hang for minutes | It kept retrying a 14-hour wait | It moves to a backup model at once: `src/server/gemini.ts` | No hang, tested live |
| A hung Gemini call could hold a job for 5 minutes | One job took 5.3 minutes | Each request gets 60 s, listening is dropped after 60 s, and a job gives up at 4 minutes and refunds: `src/app/api/process/route.ts` | The longest wait now has a limit |

| Clip | At the start of this round | Now, main model | Now, backup model |
|---|---|---|---|
| 43 s | 171.9 s | 42.7 s | 61.7 s |
| 50 s | 105.9 s (back-to-back run) | 44.1 s (first audio setting) | 58.3 s |
| 60 s | 176.3 s | 44.1 s (first audio setting) | 52.8 s |

All from cold, on this PC, on free tiers. Gemini's daily limit ran out during testing, so only the 43 s clip has a main-model time on the final audio setting. This PC's slow upload still inflates these times, and a real server has not been measured.

**The audio quality test.** Over 1,194 words, single listens against the references:

| Audio | Size per minute | Errors |
|---|---|---|
| Original | 1,424 KB | 4.3%, leaving out one run that lost its place (11.4% with it) |
| 16 kHz, 32 kbps | 251 KB | 4.9% |
| 16 kHz, 48 kbps | 368 KB | 4.7% |
| **24 kHz, 48 kbps (chosen)** | **368 KB** | **3.9%** |
| 24 kHz, 64 kbps | 486 KB | 4.0% |
| 48 kHz, 64 kbps | 486 KB | 5.4% |

**Final accuracy** on the chosen audio, through the whole pipeline on the backup model: Hindi 1.4% over 783 words, Hinglish 2.0% over 784, English 0% over 18. The main model scored 1.1% and 1.5% on the original audio. The final setup has not been scored on all clips with the main model, because its daily limit ran out.

**Sync.** Compared with the original audio, the median word did not move at all on any of the six clips, and 95% of words stayed within 20 ms.

## What changed in this round

**Easier to use:**
- The Review tab lists only the words worth checking. "Check N next" jumps to each one, and "Looks right" clears it.
- Template gallery has search, style filters and hearts, with favourites on top.
- Saved styles, and every new video opens in your last look.
- Vertical 9:16, Avoid faces, Follow face and Behind person sit together in the top bar.
- A dragged caption snaps to the middle of the frame, with a guide line.

**Better organised:**
- The side panel has four tabs: Style, Adjust, Word and Review. Adjust folds into groups.
- The project list shows thumbnails and "Edited … ago".
- All Gemini calls now go through one file, `src/server/gemini.ts`.

**Faster and cheaper:** see "What was slowing it down" above.

## Gap table

| Feature or finding | Target | Ours (with file path) | Status | What to do |
|---|---|---|---|---|
| Showing which words to check | Not seen, not proven absent | "Check N next" list from two Gemini listens and Whisper: `src/components/CaptionList.tsx`, `src/server/listen.ts` | Ahead, if absent | Keep. It is the heart of the wedge |
| Hindi and Hinglish accuracy | Unknown | 1.4% Hindi, 2.0% Hinglish, 0% English on 18 words, machine-agreed: `scripts/score-clips.mjs` | Unknown | Run the same 3 clips through FluxoCut by hand and have a person score both |
| Speed | Unknown | 44 to 53 s for a 60-second clip on this PC: `src/app/api/process/route.ts` logs each step | Unknown | Time FluxoCut by hand on the same clip |
| Saved styles | "Presets" menu, contents unknown | Saved styles, and new videos open in the last look: `src/lib/styles.ts`, `src/lib/ingest.ts` | Ahead or equal | Open their menu once as a normal customer |
| Template finding | Bigger picker, live previews, favourites on top (Stated) | Search, style filters, hearts, favourites on top: `src/components/TemplateGallery.tsx` | Equal, previews behind | Animate card previews on hover |
| Template count and variants | Variants seen, count not recorded | 26 templates, one variant each: `src/engine/templates.ts` | Behind | Design our own Hindi-first set, which can replace the six before launch |
| Fonts | 1,942 plus uploads (Stated) | 51 families, no upload: `src/engine/fonts.ts` | Behind | Add font upload. Do not chase the count |
| Face tools | Blend and tracking seen, details unknown | Avoid faces, Follow face, Behind person: `src/components/VideoModes.tsx`, `src/engine/tracking.ts`, `src/engine/segment.ts` | Unknown | Compare by hand on one clip |
| 9:16 reframe | Not shown publicly | Crop follows the face: `src/engine/framing.ts` | Ahead, if absent | Test on real landscape clips |
| Auto Trim | Real cuts, reviewable, one-click restore (Stated) | Review only, video is not cut: `src/lib/review.ts` | Behind | Build real cuts next |
| Plugin | Premiere Pro and After Effects, free (Stated) | Transparent MOV only, not yet tested in Premiere: `src/engine/mov.ts` | Behind | Owner tests the MOV first. Skip a plugin for now |
| Phones | Works, with a render server (Stated) | Editor blocked on narrow screens: `src/app/studio/[id]/page.tsx:112` | Missing | Biggest gap after trimming. Plan it as its own project |
| Languages | 82 (Stated) | Hindi, Hinglish, English: `src/server/convert.ts` | Behind, by choice | Keep the focus |
| Video length | Long form (Stated) | Up to 1 minute, by decision: `src/lib/plans.ts` | Behind, by choice | Keep |
| Audio-only projects | MP3 and WAV (Stated) | Needs a video track: `src/lib/ingest.ts` | Missing | Skip: Reels are video |
| Export quality | Up to 4K 60 fps (Stated) | 1080p and 4K, source fps or 60: `src/components/ExportDialog.tsx` | Equal | Test a real 4K source |
| SRT export | Yes (Stated) | Yes: `src/engine/srt.ts` | Equal | None |
| Safe zone | Yes (Stated) | Yes: `src/components/Preview.tsx` | Equal | None |
| Centre guides | Snap with guide lines (Stated) | Snaps to the middle with a guide line: `src/components/Preview.tsx` | Equal | None |
| Custom words | Unknown | Names steer every step: `src/server/vocabulary.ts` | Unknown | Keep |
| Translation | Mentioned in a quote | English translation: `src/server/translate.ts` | Unknown | Keep |
| Privacy of audio | Content never trains AI (Stated) | Free-tier Gemini may train on audio: `src/server/listen.ts` | Behind | Move to the paid tier before any outside user |
| Paid plans | Live on Razorpay (Stated) | Built and tested on a stand-in only: `src/lib/plans.ts`, `src/server/razorpay.ts` | Behind | Connect real Supabase and Razorpay when you decide to launch |

## Next changes, ranked

1. **Owner decision:** real prices.
2. **Real Auto Trim cuts,** because talking-head Reels need them and FluxoCut has them.
3. **Side-by-side test:** the same 3 clips in both tools, scored by a person.
4. **Font upload.** It is small and paid plans at FluxoCut lead on it.
5. **Animated template previews and our own Hindi-first templates.**
6. **Phone editor,** planned as its own project.

## Where this conflicts with recorded decisions

- **"Exact same" templates.** The owner asked for this on 2 Nov 2026. This audit's rules say to use our own designs and names. On 3 Nov 2026 the owner chose to keep them for now, so they stay in the app. Revisit this before anyone outside Cwaya uses it.
- **1-minute limit.** Comparing with FluxoCut's long-form plans would suggest removing it. The owner decided otherwise, and the wedge above fits their decision.
- **Language range.** FluxoCut's 82 languages would suggest going wider. The original brief says English, Hinglish and Hindi first, so this stays.

## Risks

| Risk | How to reduce it |
|---|---|
| A complaint about the six templates, or about reading FluxoCut's script | Redesign and rename before going public. See a lawyer if keeping them close |
| FluxoCut adds a check list quickly | Keep improving the words it flags, measured on real clips |
| Accuracy is lower on normal clips | Our 40 to 60 s clips all repeat 21.5 s of one speaker. Test on real ones |
| Free tiers mislead speed tests | Measure on paid limits before launch |
| Costs rise | Gemini's listed prices change, so the model names are pinned and cost should be rechecked before launch |
| Free daily limits | Gemini's free tier stops at 500 calls a day per model, and my testing used them all on 2 Nov. The backup model covers this, and a paid key removes it |

## Open questions

- What does FluxoCut's "Presets" menu hold? Open it as a normal customer.
- Is FluxoCut more accurate on our Hinglish clips? Compare by hand.
- How does the transparent MOV behave in Premiere Pro? The owner needs to test it.

## Sources

- FluxoCut: [terms](https://fluxocut.com/terms), [privacy](https://fluxocut.com/privacy), [pricing](https://fluxocut.com/pricing), [changelog](https://fluxocut.com/changelog)
- Vendor prices: [Gemini](https://ai.google.dev/gemini-api/docs/pricing), [Modal](https://modal.com/pricing), [Groq](https://groq.com/pricing), [Groq via Morph](https://morphllm.com/groq-pricing)
- Competitors: [Typito on Submagic](https://typito.com/blog/submagic-alternative-submagic-ai-review/), [Fluxnote](https://fluxnote.io/guides/submagic-vs-capcut-captions-2026), [Submagic comparison](https://submagic.co/vs/capcut-vs-captions-ai), [CostBench](https://costbench.com/software/ai-video-editing-saas/submagic/), [VideoCaptions.AI](https://videocaptions.ai/best/hindi-caption-generator), [Capkit](https://capkit.smallest.ai), [bol studio](https://peerlist.io/amanverma_zip/project/bol-studio)

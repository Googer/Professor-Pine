# Phase 7: OCR research (2026-10-14)

What reads a raid screenshot best, measured on Matt's samples, and how to run it. This decides the design of Phase 7; the spec's section 6.5 (tesseract.js with five recognisers, jimp probes) is superseded where this differs.

## The samples and how they were scored

There are 28 screenshots: 18 from three phones (two Androids at 1080×2400 and 1080×2448, an iPhone at 1320×2868) and three of the game in split screen, cropped to the game by Matt's rule. The very wide one has no clock. They were taken in daylight, at dawn and in rain.

Their content:
- **eggs:** T1, T3, T5, mega, shadow T1 and shadow T5;
- **bosses:** Elgyem, Yveltal, Shadow Landorus, and Dialga twice, its body hiding its name.

Each sample was labelled by hand. A harness reads every sample with an engine, then a layout-free extractor takes the elements from the lines of text and their boxes:
- the clock: the first h:mm in the status bar;
- the countdown: h:mm:ss;
- the gym: the tallest text block at the top and the lines under it;
- CP and boss: the big number and the line under it.

The gym is scored by Pine's own `GymLookup` over the production gyms, in the region of the true gym. The harness, the samples and the gym copy stay out of the repository (`var/ocr-research/`, scratch).

## Results

| Element | Legacy (Matt's estimate) | Tesseract.js, raw screen | PaddleOCR PP-OCRv4 (Node) | Method |
|---|---|---|---|---|
| Gym | 90–95% | 1/24 | **28/28** | OCR, then Pine's gym search: the whole text, or without leading words (text on the gym's picture runs into the name), or without trailing words (a cut name). The first clear hit that is not a misspelling correction wins. |
| Phone clock | poor | 2/24 | **28/28** | The status bar (top 4.5%) is read a second time, alone and 2× enlarged; read whole, the clock runs into the icons. A screen without a clock gives none. |
| Countdown | poor | 2/24 | **28/28** | |
| CP | – | 0/7 | **9/9** | |
| Boss name | – | 0/7 | 7/9 | Dialga hides its name ("Ditta"). |
| Boss | – | – | **9/9** | From the CP: a boss's CP is floor((atk+15)·√(def+15)·√S/10), with S the tier's boss stamina (T1 600, T3 3,600 (shadow 4,000), mega 9,000, T5 15,000, elite 20,000, mega legendary and primal 22,500, super mega 25,000). It matched every sample exactly; with the current boss list and the readable part of the name it decides the boss (Dialga, Reshiram and Zekrom share stats). |
| Tier | 75–80% | – | **28/28** | Not OCR. The game's own head icon (`Images/Raids/ic_raid_small.png` of PokeMiners' pogo_assets) is matched by normalised cross-correlation inside its outline, so the background does not count, at eight scales. The search is a band anchored on the countdown (egg) or the CP (boss); the heads stand in a row centred on the screen, and counts 1 to 7 are tried with a searched spacing. It holds for every per-position threshold from 0.40 to 0.55. Four heads is a mega; mega legendary, super mega and elite head rows are unseen. |
| Shadow | – | – | **28/28** | The share of saturated purple (hue 255–300°) where the egg or boss stands: shadow 4.3–15.6%, the rest at most 0.05%, dawn included. It is a hint only: a hatched raid takes shadow from the boss list, and for T3 the CP tells too. |

Speed and memory (PP-OCRv4 in Node, the screen read at 720 px wide, which reads as well as full size or better):
- **Laptop (Windows):** about 1.8 s a screenshot.
- **`node:24-slim` on 4 cores (Linux):** 1.7 s a screenshot, about 0.5 s to start, about 1 GB peak memory. Full size needs 2 GB and 3 s.
- **Tier count and shadow measure:** about 0.1 s together.

## Ways to run PaddleOCR

| | In-process: onnxruntime-node | A Python container (PaddleOCR 3.x) |
|---|---|---|
| Accuracy here | best (the table above, PP-OCRv4) | PP-OCRv5 server: gym 23/28, because it drops spaces ("MLKCommunity"). PP-OCRv5 mobile: boss 2/9, CP 4/9. |
| Time, CPU | 1.7 s | server 9.5 s, mobile 2.3 s |
| Peak memory | ~1 GB | server 2.8 GB, mobile 1.1 GB |
| Image size | +~75 MB (onnxruntime CPU 44 MB, models 16 MB, OpenCV WASM 12 MB) once other platforms' binaries are pruned | +2.2 GB (Python, paddlepaddle CPU), plus the models 22–167 MB |
| Platforms | Linux x64 and arm64, Windows, macOS: the same npm package (it ran unchanged on Windows and in `node:24-slim`) | Linux x64 for paddlepaddle GPU; arm64 CPU wheels exist |
| GPU | onnxruntime-node ships a CUDA 12 provider for Linux x64 (260 MB, downloaded at install unless skipped), which needs CUDA 12 and cuDNN in the image and the NVIDIA container toolkit on the host | paddlepaddle-gpu: CUDA in the image, the NVIDIA toolkit on the host; an image of several GB |
| Operations | one container, nothing to keep in step | a second service, an HTTP API to define, health and timeouts, version skew |

GPU acceleration is possible both ways, and in-process it costs the least to add: the same code, the CUDA provider chosen by a setting. The laptop has no NVIDIA GPU, so GPU speed was not measured. On CPU a screenshot takes under two seconds, which is enough for the rate at which members post them.

## Recommendation

- **Run it in process** with onnxruntime-node and the PaddleOCR PP-OCRv4 models, behind an interface of Pine's own (`TextReader`: an image in, lines with boxes and confidence out). An external service, such as Python PaddleOCR on a GPU, can then be added later as a second implementation chosen by a setting, without touching the reading logic.
- **Keep the GPU as a setting** (`ocr.device: cpu | cuda`) on the in-process engine. The Dockerfile skips the CUDA provider by default, and a GPU image is a build variant.
- **Use a library or own code for the models.** `@gutenye/ocr-node` (maintained, last release 2026-09) was used for the research. The plan should decide whether to depend on it or keep the thin pre- and post-processing ourselves on `onnxruntime-node`. The latter has fewer dependencies (it drops `@techstark/opencv-js`) and fixes the model version.
- **Read the screen at 720 px wide;** read the status bar a second time.
- **Count the tier from the heads,** with the game's icon fetched with the game data.
- **Name the boss from the CP** and the head count against the current boss list, with the name as a tie-break and a check.
- **Read one screenshot at a time** (a queue), to bound memory at about 1 GB, and load the models on first use.
- **Leave the legacy pre-processing behind** (black and white, many candidate crops): none of it is needed.

## Matt's decisions (2026-10-14)

1. PaddleOCR runs inside the bot (onnxruntime-node), not in a container of its own.
2. The thin layer around the models (input scaling and normalisation, the detector's box finding, the recogniser's decoding) is Pine's own code on onnxruntime-node; `@gutenye/ocr-node` is not a dependency.
3. Raid egg pictures are a task of their own in the Phase 7 plan.

## How it runs (Matt, 2026-10-14, after the decisions above)

- **A child process of its own**, at low priority by default: the JavaScript around the models (image preparation, box finding, the head count) takes hundreds of milliseconds and would stall the bot's one event loop; Linux sets priority per thread and Windows per process, so only a process of its own can be lowered on both (`os.setPriority`, inherited by the model's threads); its memory (about 1 GB at its peak) goes when it exits after a while idle; a read that hangs or crashes costs only that process (a time limit, then a restart).
- **One screenshot at a time**, from a short queue: one read already uses every core it is given, and two at once would share them and double the memory. Beyond the queue a member is told to try again shortly; a member whose screenshot waits is told how many are ahead.
- **Settings:** `ocr.device` (`cpu`, `cuda`, `directml`; default `cpu`), `ocr.threads` (0 is the runtime's own choice), `ocr.priority` (`low`, `normal`; default `low`), `ocr.queue`, `ocr.timeoutSeconds`.
- **DirectML, measured on this laptop** (i5-1135G7, Iris Xe; the 28 samples at 720 px): it reads exactly what the CPU reads, but takes 9.9 s a screenshot on its first run (Windows compiles the shaders once) and 2.0–3.1 s after it, against 1.44–1.47 s on the CPU. The recogniser runs once per line, every line another width, and DirectML prepares its work per shape. A GTX 1060 has far more to give than the Iris Xe, but that cost per shape stays; reading lines of similar width in one batch helps both devices.
- **Threads, measured:** 2, 4 and all threads all took 1.44 s, so the model is not where the time goes; the research layer's JavaScript is (pixels in plain arrays, boxes through OpenCV in WASM). Pine's own layer is measured against these 1.44 s.
- **A check script** (`npm run ocr:check`) reads a folder of screenshots, with their labels when there are any, through the same child process the bot uses, and prints what was read, per element right or wrong, the time per screenshot and the peak memory, for a device and thread count given on the command line: for deciding on the machine that will run Pine (the i7-2600K with a GTX 1060, or a Synology DS1525+ with a Ryzen V1500B and no GPU) by measurement.

**Pine's own layer, spiked in the harness** (`var/ocr-research/engine-own.mjs`: onnxruntime-node and sharp, connected components for the detector's boxes, CTC decoding; no OpenCV): the same 28/28 for gym (through Pine's search), clock, countdown, tier heads and CP, 7/9 boss names, at 1.40 s a screenshot and 614 MB peak memory (the research layer: 1.47 s, 962 MB). Detection is most of the time (about 370 ms a run, two runs a screenshot). Recognising lines in padded batches of six made it neither faster nor as good (gym text 22/28 similar instead of 25/28): lines are read one by one.

## Screenshots for review and members' feedback (Matt, 2026-10-14)

- **A command that only reads** (`/read-screenshot`, an attachment): it creates nothing and answers the member privately with what was read, each element both raw and as Pine understood it: the gym text and the gym it found (or "none"), the phone's clock, the countdown and the time it makes of them (or "guessed from the upload"), egg or hatched, the head count and the tier, the CP, the boss name read and the boss decided, the shadow share. Under it the buttons "All right" and "Something is wrong"; the second opens a form: which elements were wrong (a menu) and what they should be (text). What the member says is recorded.
- **Live reports are kept for review too**: when a screenshot report could not decide something (no gym, no time, a guessed time, no boss or tier) — the cases in which the legacy bot put the screenshot into the raid's channel for people to read — and whenever a member reports a mistake on the answer of a screenshot report.
- **A "Screenshot feedback" button on the post of every raid made from a screenshot** (grey, on a row of its own, like "Move train…"), for anybody who sees the post, while the raid lasts: it shows the presser privately what was read and what Pine made of it, as `/read-screenshot` does, with the same form. The reporter's private answer has the same button. The screenshot of every such raid is kept until a day after the raid ended; one with feedback or something undecided is kept for review as below.
- **What is kept**: the screenshot file and beside it a JSON file with what was read, what Pine made of it, what was wrong and the member's correction, in `var/ocr/review/`, in the shape of the research's `labels.json`, so the check script scores a review folder as it scores the samples. Kept for a configured number of days, then deleted.

## Improving the reader from the feedback

The models are not retrained: what goes wrong on a raid screen is nearly always the layout rules, the thresholds or the search around the models, and those are Pine's own code. The cycle:

1. **Every answered screenshot is a labelled sample.** "All right" makes the reading its own answer key; "Something is wrong" with the member's correction makes the corrected one. Both land in the review folder in the answer key's shape (`labels.json`), so the samples grow by themselves, in the phones and light of the members who use Pine.
2. **A triage report** (`npm run ocr:review -- <folder>`): per element, how often it was wrong, and at which stage, told apart by the raw and the interpreted values: the gym's text was read but the search chose another gym (a search problem: a nickname would fix it) or the text itself is wrong (a reading problem); no clock found or a wrong one; the head count off by how many; a boss not decided although the CP was read. It also lists pairs that come back (the same text corrected to the same gym twice or more) as suggested gym nicknames, which staff add with `/gym edit` without any change of code.
3. **A fix starts from the report:** the largest group of one cause. A rule or a threshold is changed, and `npm run ocr:check` over every sample (the research's and all reviewed ones) shows what it fixes and that nothing else broke. A sweep of a threshold over all samples picks its value, as in the research.
4. **A baseline guards it:** the scores per element of the last release are committed (numbers only, no screenshots or texts), and the check says which samples changed from right to wrong.
5. **When:** the production review folder is copied to the development machine, now and then or when the report shows a new kind of failure (a new phone, a new raid tier, a change of the game's screen). Screenshots never enter the repository unless Matt agrees to one as a fixture.

**Who runs the cycle: a later Claude session** (Matt, 2026-10-14), not Pine itself. Pine does not change its own rules: a rule tuned on a few complaints can break what works, and only the check over every sample shows that. So the cycle is written for a session that knows nothing of this one:

- a project skill, `.claude/skills/improve-screenshot-reading/SKILL.md`, which a session loads when Matt asks it to improve the reader or hands it a review folder: the steps above as a procedure, where the samples are, which commands to run, what may not be committed (screenshots, members' texts), how to judge a change (no sample from right to wrong unless the report says why), and that the baseline and the log are updated with every fix;
- everything the session needs is in the review folder: beside each screenshot, the lines of text the reader saw with their boxes, the band where it looked for heads and the scores, so a session can see why without running the models, and can look at the screenshot itself;
- `docs/superpowers/ocr-improvements.md`, a log the session appends to: the date, the failure group, its cause, the fix, the scores before and after. The next session reads it first, so a cause is not chased twice;
- CLAUDE.md points to the skill and the log.

Retraining the recogniser on crops of corrected samples stays possible later, if the report ever shows text the model itself cannot read; nothing so far does.

## Tier heads expected for raids not in the samples

On every sample, the number of heads is the raid's tier number: T1 shows 1, T3 shows 3, T5 shows 5, and mega (tier 4) shows 4. The fandom wiki's "Raid Battle" page gives each kind of raid a tier. Assuming the screen follows the same rule, a count maps to raids as follows:

| Heads | Raid | Seen | Telling it apart from others with that count |
|---|---|---|---|
| 1 | T1 (shadow too) | yes | |
| 3 | T3 (shadow too) | yes | Shadow from the purple; once hatched, also from the CP (shadow T3 stamina is 4,000 against 3,600; confirmed by a shadow Kirlia raid at CP 8554, 2026-10-14). |
| 4 | Mega | yes | No other current raid has 4 (tier 4 retired in 2020). |
| 5 | T5 (shadow too), ultra beast | yes (T5) | An ultra beast comes from a wormhole, not an egg. |
| 5 | Elite | no | Elite raids are only at elite raid gyms (Pine knows the gym), and the egg is red. Once hatched, the CP tells: stamina 20,000 against 15,000. |
| 6 | Mega legendary, primal | no | The boss list, and once hatched the boss. Both have stamina 22,500. |
| 7 | Super mega (and super mega legendary) | no | |

The counter already tries 1 to 7 heads, so these need no change. A screenshot of each unseen kind should confirm its count before the mapping is trusted. If a count turns out different, it is one line in the table Pine keeps.

## What the samples do not cover yet

- **Dusk:** only dawn and daylight so far.
- **Raid kinds:** no mega legendary, super mega or elite raid, nor a primal.
- **Phones:** no other aspect ratios, and no Android with the clock at the right.
- **Hidden text:** no gym name hidden by something other than its length.
- **Not a raid screen:** no screenshot that isn't one (it must be refused, not misread).

## Raid egg pictures (asked for during the research)

Raid posts of an egg will show the game's egg (pogo_assets `Images/Raids`), fetched like the list of Pokémon pictures and kept in `var/`:

| Raid | Egg picture |
|---|---|
| T1 | `raid_egg_0_icon` |
| T3 | `raid_egg_1_icon` |
| T5 | `raid_egg_2_icon` |
| Mega | `raid_egg_3_icon` |
| Mega legendary | `raid_egg_4_icon` |
| Primal | `raid_egg_primal_icon` |
| Elite | `raid_egg_extended_icon` |
| Super mega | none in pogo_assets (nor in The-Pokemod-Group's copy; both unchanged since 2023-04): no picture for now |
| T5 egg whose current bosses are all ultra beasts | `raid_ultra_icon`, the wormhole |

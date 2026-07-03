# Plan: media-timeline (Tier B, own repo — the stretch/"whoa" demo)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first. Tier B. This is the
> range-demonstrating stretch item; it has real external tool dependencies
> (FFmpeg, a transcription source) so it is NOT zero-dep and needs the most
> careful scoping.

## One-line pitch

Turn long-form video into a **timestamped, typed, structured timeline**:
ingest video/audio, extract a transcript and visual/audio events, and emit a
schema-validated JSON of what happens when — for lectures, sports film, meeting
recordings, training content.

## Why it stands out / why Connor

Almost no skills touch multimodal ingestion; this is the "whoa" demo of the
whole catalog and shows range beyond linters. It's `PaceAI` generalized:
Connor's connected-fitness pipeline already does video+audio ingestion (FFmpeg
frames/waveforms), trainer-cue extraction, and structured control-profile
output with a human review step. media-timeline lifts that pattern off the
fitness domain into a general "video → structured timeline" tool.

## The clever differentiator

**A typed, schema-validated timeline with a human-review checkpoint — not a raw
transcript dump.** The output is a structured event stream (`{ t, type,
payload }` validated against a user-supplied schema), where `type` is
domain-configurable (lecture: topic-change, slide, question; sports: play,
possession-change; meeting: decision, action-item). It combines cheap
deterministic signals (scene cuts via FFmpeg, silence/energy from the waveform,
transcript segments) and *proposes* higher-level events for a human to confirm
— the PaceAI human-in-the-loop discipline, reused. It leans on `zod-first-tools`
for the output schema and `receipts` for grounding each event in its transcript
span.

## Scoping reality (read before building)

This is the only plan that depends on heavyweight external tools. Keep v1
tight:
- **FFmpeg is a required system dependency** (document it; check for it and
  fail with a clear message if absent). Used for: scene-cut detection
  (`ffmpeg ... select='gt(scene,0.4)'`), keyframe extraction, and audio/waveform
  extraction. This is a documented dependency, not an npm one.
- **Transcription is pluggable, not bundled.** Do NOT ship a transcription
  model. Accept an existing transcript (SRT/VTT/JSON) as input, OR shell to a
  user-configured command (`--transcribe-cmd`). v1's core value works on a
  video + an existing transcript. State this loudly.
- Everything else (event assembly, schema validation, timeline emission) is
  plain Node and fully testable on fixtures without any video.

## Repo scaffolding

Repo: `connordibble/media-timeline`. npm `media-timeline` (verify). Uses `tsup`/
plain `.mjs` — no runtime npm deps; FFmpeg is a system dep, transcription is
external.

```
media-timeline/
├── .github/workflows/ci.yml   .releaserc.json   package.json
├── bin/cli.mjs                # subcommands: ingest, timeline, review
├── src/
│   ├── ffmpeg.mjs             # wrappers: scene cuts, keyframes, waveform (shell to ffmpeg)
│   ├── transcript.mjs         # parse SRT/VTT/JSON transcripts into segments
│   ├── events.mjs             # assemble candidate events from signals (PURE, fully tested)
│   ├── schema.mjs             # validate the emitted timeline against a user schema
│   └── report.mjs             # human + --json
├── schemas/                   # example domain schemas (lecture.json, meeting.json)
├── test/*.test.mjs            # all fixture-based: sample transcript + a precomputed signals file
├── examples/                  # a transcript + a precomputed scene-cut list + the timeline it yields
└── README.md CONTRIBUTING.md SECURITY.md LICENSE
```

## Pipeline
- **`media-timeline ingest <video> [--transcript file] [--transcribe-cmd "..."]`**
  → runs FFmpeg for scene cuts + waveform energy, gathers/produces the
  transcript, writes an intermediate `signals.json` (deterministic inputs to
  the next stage). This is the only stage that touches heavy tools.
- **`media-timeline timeline <signals.json> --schema schemas/lecture.json [--json]`**
  → the pure core: assemble candidate events from signals + transcript,
  validate against the schema, emit the timeline. Fully testable without video.
- **`media-timeline review <timeline.json>`** → present events for a human to
  confirm/edit/drop (reuse the signoff/eval-viewer self-contained-HTML pattern,
  or a simple CLI confirm loop for v1). Records confirmed events.

## events.mjs spec (the tested core)
Input: `{ sceneCuts: [t...], energy: [{t, level}...], transcript: [{start, end,
text}...] }` + a domain config. Produce candidate events:
- scene cut + transcript topic shift → `topic-change`/`slide` candidate
- silence→speech transitions, energy spikes → domain events
- transcript keyword patterns (configurable per domain) → tagged events
Each event carries its source signal(s) for grounding (receipts-style), a
timestamp, and a type. Validate the full list against the user schema; report
schema violations as errors.

## Test cases (all fixture-based, zero video)
1. `transcript.mjs`: parse SRT → segments with correct start/end/text; VTT and
   JSON too.
2. `events.mjs`: given a fixture `signals.json`, scene-cut + topic shift →
   `topic-change` event at the right timestamp.
3. Energy spike fixture → the configured domain event.
4. Keyword pattern in transcript → tagged event with the transcript span as
   its source.
5. `schema.mjs`: a valid timeline passes; an event with a bad `type` fails
   validation with a clear message.
6. Empty signals → empty timeline, exit 0, not a crash.
7. `--json` shape stable and schema-valid.
8. `ffmpeg.mjs`: with FFmpeg absent (mock PATH), a clear "install FFmpeg" error,
   non-zero, no stack trace. (Do NOT require FFmpeg in CI tests — guard it.)
9. Two domain schemas (lecture, meeting) each produce different event types
   from the same signals+config.
10. Grounding: every emitted event references a source signal/transcript span.

## README shape
Hero: a short clip → the structured timeline JSON it produces. Install:
`npx media-timeline timeline signals.json --schema lecture.json` (note FFmpeg +
transcript prerequisites up top, honestly). Honest limits: FFmpeg required,
transcription BYO, events are proposals for human review, not ground truth.
Cross-link zod-first-tools (schema) and receipts (grounding).

## Definition of done (v1)
- [ ] `timeline` (pure core) fully works and is fully fixture-tested WITHOUT
      requiring video or FFmpeg in CI
- [ ] `ingest` shells to FFmpeg correctly and fails gracefully when it's absent
- [ ] Transcription is external/pluggable; nothing heavy bundled
- [ ] Two example domain schemas; example runs end-to-end from a fixture
      transcript + precomputed signals
- [ ] Release pipeline, npm name, MIT, identity §0, README passes auditor
- [ ] Listed in the dibble marketplace as external-source (a `media-timeline`
      skill teaching the workflow is optional)

## Effort
Large, and the most external-dependency risk. Mitigate by making the pure
`events`/`schema`/`transcript` core the deliverable and keeping FFmpeg/
transcription at the edges. Ship lecture + meeting domains in v1; sports film is
a great demo but more signal-processing — defer. Build LAST of the ten; it's the
range flex, not a foundation. ~2–3 sessions.

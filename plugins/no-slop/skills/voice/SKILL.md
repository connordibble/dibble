---
name: voice
description: Build a reusable personal voice skill from samples of someone's real writing, so future drafts sound like them instead of like a model. Use when the user wants writing "in my voice" or "like me", asks to capture or clone their writing style, wants a voice/style guide generated from their existing essays, READMEs, or posts, or asks why generated drafts don't sound like them. Produces a new SKILL.md they can install and reuse.
---

# Extracting a voice into a skill

A generic "write well" instruction produces generic writing. What makes prose
sound like a specific person is a small set of concrete, observable habits:
how they open, what they ban, where their sentences land. This skill turns
samples of real writing into a personal voice skill: a SKILL.md the user
installs once and invokes forever.

The failure mode to avoid is the horoscope: a voice skill full of rules that
flatter anyone ("clear, direct, occasionally witty"). The guard against it is
evidence: **every rule in the generated skill must quote the samples.** If a
rule could appear in a stranger's voice skill, cut it.

## Step 1: Collect samples

Ask for 3+ pieces the user considers representative: essays, READMEs, long
PR descriptions, internal docs. Aim for 1,500+ words total. If they offer
polished and unpolished writing, prefer polished: you are extracting the voice
they edit toward, not their first-draft noise. Writing that was itself
AI-assisted is contaminated for this purpose; ask, and prefer pieces they
wrote by hand.

If samples are thin (under ~800 words), say plainly that the skill will be a
sketch and mark low-confidence rules as provisional rather than inventing
certainty.

## Step 2: Analyze on these dimensions

Read all samples before writing anything. For each dimension, collect quoted
evidence, not impressions:

1. **Openings.** How do pieces start: problem first, scene first, thesis
   first? Quote the first two sentences of each sample.
2. **Cadence.** Sentence-length pattern: where do short sentences appear, and
   what work do they do? Find their three most distinctive rhythm moves.
3. **Diction register.** Concrete nouns or abstractions? Engineering
   vernacular or formal? List 10 words/phrases they actually use that a
   generic writer wouldn't.
4. **Constructions they favor.** Parentheticals, colons, second person,
   sentence fragments, with quoted instances.
5. **What they never do.** Absences are voice too: no exclamation points, no
   rhetorical questions, no em dashes, no bullet lists. Verify an absence
   across all samples before claiming it.
6. **How they handle claims.** Hedged or flat? Numbers or narrative? How do
   they admit mistakes or limits? Quote one example.
7. **Endings.** Do pieces land quietly, loop back to the opening, end on
   advice? Quote the final lines.

## Step 3: Generate the skill

Use the template at `references/voice-skill-template.md` in this skill's
directory. Name it `<firstname>-voice` unless the user prefers otherwise.
Rules of construction:

- Every rule cites or quotes sample evidence. The quotes stay in the skill;
  they are what makes the rule executable by a future model rather than
  decorative.
- Prefer 10 sharp rules over 25 mushy ones. A rule earns its place by being
  checkable: a reader holding a draft can say yes or no to it.
- Include a **hard bans** section for the verified absences, because bans are
  the most enforceable rules and the fastest way to kill the default
  model register.
- End with a short review checklist the model runs before delivering.

## Step 4: Calibrate before handing it over

Take a neutral technical paragraph (pick one from the user's current project),
rewrite it using only the generated skill, and show both versions. Ask which
lines ring false. One round of this catches most horoscope rules: the user
will point at the sentence that "isn't me," and the offending rule gets
sharpened or cut. Ship the skill only after this pass.

Suggest the user re-run this extraction after they've written a few more
pieces; voices drift, and the skill should follow the writing, not freeze it.

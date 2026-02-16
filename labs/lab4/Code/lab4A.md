# Lab 4A - ASR Hard Cases Report

## Where confidence is stored
In the dialogue machine `State context`, the ASR result is stored in an array:

- Utterance: `context.lastResult[0].utterance`
- Confidence: `context.lastResult[0].confidence`

I verified this by logging `context.lastResult[0]` in the browser console and observing objects of the form:
`{ utterance: "...", confidence: ... }`.

## Hard cases tested (with logged confidence)
I tested several hard cases consisting of fictional proper nouns, scientific names, and place names. Below are representative outputs from the ASR (each item includes the recognized `utterance` and its `confidence`).

### Fictional names
**Target: Dumbledore**
- Attempt 1: utterance="Dumbledore", confidence=0.71383077
- Attempt 2: utterance="Dumbledore", confidence=0.64811265  
Observation: consistently correct with medium-high confidence.

**Target: Hogwarts**
- Attempt 1: utterance="Hugvas", confidence=0.046794333
- Attempt 2: utterance="Hulkbuch", confidence=0.0439818  
Observation: consistently incorrect with extremely low confidence.

**Target: Gryffindor**
- Attempt 1: utterance="Grief Indoor", confidence=0.38593146
- Attempt 2: utterance="Gryffindor", confidence=0.7458252  
Observation: large variance across attempts; one misrecognition that is phonetically similar, then a correct recognition with much higher confidence.

### Proper names (people)
**Target: Franz Liszt**
- Attempt 1: utterance="Franz Leeds", confidence=0.20538944
- Attempt 2: utterance="France leads", confidence=0.3265176  
Observation: misrecognized as common English words/phrases; confidence remains low to medium-low.

### Scientific name
**Target: Magnolia liliflora**
- Attempt 1: utterance="Magnolia Lily Flora", confidence=0.08632153
- Attempt 2: utterance="Magnolia Lily Flora", confidence=0.28692937  
Observation: the system tends to split the Latin name into common English words ("Lily", "Flora"), with low confidence.

### Geologic term
**Target: Pleistocene**
- Attempt 1: utterance="Play Storm", confidence=0.876879
- Attempt 2: utterance="Play Store Cinema", confidence=0.31233478  
Observation: both attempts are incorrect, but the first is a notable case of being confidently wrong (very high confidence for a wrong hypothesis).

### Additional hard cases (likely place name / uncommon word)
**Target (spoken): Göteborg**
- Attempt 1: utterance="Yotbolia", confidence=0.090519436
- Attempt 2: utterance="Yotbolia", confidence=0.08999915  
Observation: stable, repeated misrecognition with consistently low confidence.

**Target (spoken): Worcestershire**
- Attempt 1: utterance="Bausch, the Share", confidence=0.11728166
- Attempt 2: utterance="Baluster Share", confidence=0.08271567  
Observation: misrecognized as a sequence of more familiar English-like sounds with low confidence.

### No-input behavior
During testing, I also observed `*no input*` events that led to a `NoInput` path and a TTS response ("I can't hear you!"). This suggests sensitivity to timing/pauses or microphone pickup during repeated trials.

## Observations
1. Rare words (fictional names, Latin scientific names, non-English locations) are often mapped to more frequent English words or multi-word sequences (e.g., "Gryffindor" → "Grief Indoor", "Franz Liszt" → "France leads").
2. The same target can yield very different hypotheses across attempts, with large confidence variance (e.g., "Gryffindor" incorrect at 0.386 vs correct at 0.746).
3. Confidence is not a guarantee of correctness. A key example is "Pleistocene" → "Play Storm" with confidence 0.877, i.e., the recognizer can be highly confident in an incorrect transcription.
4. Extremely low confidence often correlates with incorrect output ("Hogwarts" trials at ~0.04), but low confidence can also occur even when the hypothesis is near the intended target (e.g., phonetic approximations).

## Hypothesis: why recognition faltered
- **Low-frequency / out-of-vocabulary terms:** These targets likely appear rarely in general speech training data, so the recognizer prefers higher-frequency words.
- **Phonetic ambiguity and word boundary decisions:** The recognizer tends to segment unfamiliar sounds into plausible word sequences ("Play Store Cinema") or phonetically similar common words ("Grief Indoor").
- **Accent, prosody, and speaking style:** Small variations in pronunciation or stress can move the model toward different hypotheses, explaining why repeated attempts sometimes differ drastically.
- **Environmental/timing factors:** The observed `no input` events suggest sensitivity to pauses, speaking onset timing, or microphone pickup.

## Potential fixes
- **Custom Speech / domain adaptation:** Add these names/terms as phrase lists or training data via Azure Custom Speech to increase the probability of intended hypotheses.
- **Dialogue repair strategy using confidence:** If `confidence` is below a threshold, ask for repetition, spelling, or clarification ("Did you mean ...?").
- **Constrain recognition when possible:** Use grammar/phrase hints (where supported) to reduce the candidate space for expected inputs in the dialogue.

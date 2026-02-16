# Errors and Limitations

## 1. Strict Exact Match Grammar

Initially, the DM required the user's entire utterance to exactly match a key in the grammar dictionary.

**Example**\
If the user says "make an appointment" or "the name is Tom", the DM would fail to recognize these as it only searched for the isolated keywords `appointment` and `Tom`.

### Implemented Solution

Instead of strictly checking if the entire utterance equals a dictionary key, the logic was updated to check if the grammar key is contained within the utterance.

**Example**\
If the user says "let's do it on Monday", the DM can now successfully extract the `Monday` from the phrase.

## 2. Appointment Day Ambiguity

The DM only prompted the user for the day of the week.

**Example**\
If the user says "Monday", the DM had no concept of which Monday the user was referring to, and it lacked a clarification prompt to resolve this ambiguity.

### Implemented Solution

A calculation to derive the absolute calendar date relative to the current day was implemented.

**Example**\
If the user says "Tuesday" and today is Monday 16 Feb 2026, the DM will correctly deduce that the user is referring to Tuesday 17 Feb 2026. The limitation of this implementation is mentioned in the point below.

## 3. The "Same Day" Date Calculation

The relative date calculation has an edge-case limitation regarding same-day deduction.

**Example**\
If the user says "Monday", and today is also Monday. The DM will assume that the user is making an appointment for the same day.

## 4. Closed-Vocabulary Constraint

The DM fails to recognize any entities if the user's utterance falls outside the hardcoded grammar dictionary.

- **Names:** doesn't recognize undefined names (e.g. Mary).
- **Day:** can't parse natural language phrases like "tomorrow", "next Tuesday" or "the day after tomorrow".
- **Time:** rejects any timing format undefined in the grammar. It is too tedious and almost impossible to hardcode every possibility or variation.

## 5. Lack of Mid-Flow Cancellation

Once the appointment system begins, there is no way for the user to stop, cancel halfway or restart the process.

## 6. Lack of Mixed Commands

The information-gathering process is strictly sequential and does not allow the user to skip or combine steps.

**Examples**

- If the user says "let's make an appointment with Tom", the DM only extracts the `appointment` and kicks off the process, redundantly asking for a name in the next step.

- If prompted for a name and the user says "meeting with Tom on Tuesday", the DM only extracts `Tom` but ignore `Tuesday` entirely, redundantly asking for a day in the next step.

## 7. Inefficient Error Correction

When the user reaches the last confirmation step and says "no", the entire appointment process will be restarted from the initial person prompt. There is no way to allow the user to update or modify part of the information without restarting the whole process.

## 8. Ignoring ASR Confidence

The DM blindly accepts the top hypothesis from SpeechState without evaluating the `confidence` score.

**Example**\
The user mutters something and the DM recognizes it as a valid utterance but with very low confidence score, the DM will proceed as per normal.

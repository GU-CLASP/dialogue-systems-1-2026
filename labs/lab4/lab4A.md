# LAB4A

## REPORT

- Frodo Baggins. = 52% CORRECT
- Silmarillion. = 6% CORRECT
- Sauron. = 25 % CORRECT
- Shalm's Dip. = 17% WRONG (Helms deep)
- Isildur. = 10% CORRECT
- Thornton Oakenshield. = 6% WRONG (Thorin Oakenshield)

For this experiment I tested ASR recognition using vocabulary from J.R.R. Tolkien's Middle-earth universe, which contains many invented words and names that do not exist in everyday English. I am a native Greek speaker with a Greek accent in English, which likely adds an additional layer of difficulty for ASR systems trained primarily on American and British English.

The results varied significantly. "Frodo Baggins" achieved 52% confidence and was recognized correctly, possibly because "Frodo" has appeared enough in media that the model has some exposure to it. "Silmarillion" scored only 6%, which although it is a real book title, the model likely rarely encountered the word during training. More interestingly, "Helm's Deep" and "Thorin Oakenshield" were not just low confidence — they were transcribed incorrectly as "Shalm's Dip" and "Thornton Oakenshield" respectively. This illustrates a key weakness of ASR: when it cannot match input to a known word, it substitutes the closest real-world alternative rather than admitting uncertainty.

This problem is directly relevant to my final project, a vowel-substitution game where players deliberately mispronounce words. Testing confirmed that distorted speech (e.g. saying "o go to tho pork" instead of "I go to the park") was actually suprisingly recognizable to ASR but on the contrary phrases like "i hivi i cit" (distorted "I have a cat" with vowel i) was unrecognisable, no matter how many times I tried.

The core issue is that ASR systems are probabilistic — they always try to return something plausible, even when confidence is very low. This can be misleading, as a wrong answer delivered with some confidence looks similar to a right answer.

## Part A-VG results:

- Frodo Baggins. = 79% CORRECT
- Silmarillion. = 31% CORRECT
- Sauron. = 44% CORRECT
- Helms deep. = 60% CORRECT
- Isildur. = 53% CORRECT
- Thorin Oakenshield. = 62% CORRECT

After training a Custom Speech model on the full text of The Lord of the Rings, recognition improved significantly across all tested terms. Frodo Baggins improved from 52% to 79%, Silmarillion from 6% to 31%, and Helm's Deep and Thorin went from incorrect transcriptions to 60% and 62% confidence respectively. This confirms that providing domain-specific training data directly addresses the vocabulary gap in standard ASR models.

**ENDPOINT ID**: 12e4ee2f-9ec3-4296-93e3-e1c168fc5e8d

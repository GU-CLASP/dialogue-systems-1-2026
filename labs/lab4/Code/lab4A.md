Below are some phrases I tried out that I thought would be hard for the speech recognizer to transcribe.
I updated the state machine to log the utterance together with the confidence score in the console.
    
    Miscelaneous:
    Utterance: Bingo Yahtzee, Confidence: 0.27746415
    Utterance: Yahtzee, Confidence: 0.24259858
    Utterance: Nu ah (intended: "nuh-uh", a negation), Confidence: 0.09661487
    Utterance: Mitochondria is the powerhouse of the cell, Confidence: 0.7751532
    
    Harry Potter:
    Utterance: Gringotts Bank, Confidence: 0.73247236 
    Utterance: Alohomora, Confidence: 0.10936433
    
    Celebrities (Zlatan Ibrahimovic and Stellan Skarsgård):
    Utterance: Zlatan Ibrahimovic, Confidence: 0.34906608
    Utterance: Stella and SKA squad, Confidence: 0.3113947
    Utterance: Do you know the actor Stellan Skarsgard?, Confidence: 0.6275258
    Utterance: Stellan's car squad, Confidence: 0.19855052
    Utterance: I once saw Stellan's gosh word, Confidence: 0.42238843
    Utterance: I love movies with Stella Skarsgard in them, Confidence: 0.6784045
    Utterance: Do you know the actor still on Skarsgard?, Confidence: 0.60518414
    
    Places (Udevalla):
    Utterance: Udawala, Confidence: 0.04838143
    Utterance: Today I'm going to udevalla, Confidence: 0.72601545

    It is surprisingly good at recognizing dinosaur names:
    Utterance: Watch out for the Brontosaurus, Confidence: 0.933717
    Utterance: This is my pet triceratops, Confidence: 0.927503
    Utterance: I am scared of velociraptors, Confidence: 0.6059279
    Utterance: Velociraptors are really fast, Confidence: 0.886705

Out of the categories of utterances that I tried, the speech recognizer was best at
recognizing dinosaur names. 3 out of 4 of the utterances were correctly transcribed
with around 90% confidence. Perhaps dinosaur data or archeological topics were featured
in the training data.

I also noticed that Swedish cities and celebrities were more frequently misinterpreted and
had lower confidence scores. This makes sense since an English ASR probably was not 
trained with a lot of foreign content. Using the Swedish words in a full sentences gave
better accuracy than if the word was uttered alone. For example, the speech recognizer
had a hard time recognizing the actor Stellan Skarsgård, and when his name was said
alone in an utterance the confidence was 31% and 19% (both transcribed incorrectly),
but when the actors name was mentioned in a sentence the confidence increased to around 
60% and at least one of his names was transcribed correctly (minus the special character å).
Similarly, when saying a Swedish city, Udevalla, the speech recognizer has a confidence of 
4% and mistranscribed the utterance when Udevalla was mentioned by itself. The confidence
then increased to 72% and was transcribed correctly when it was used in a sentence. The
reason for the increase in confidence is probably because there are easily identified 
words in the utterance that inflate the score even though the actor/city itself still has
a very low confidence score. 
import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { azureLanguageCredentials, KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";
import { createBrowserInspector } from "@statelyai/inspect";


const azureCredentials = {
  endpoint: "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureLanguageCredentials: azureLanguageCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 2000,
  asrDefaultNoInputTimeout: 8000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-JennyNeural",
};

let speakTimer: ReturnType<typeof setTimeout> | null = null;

function speak(context: DMContext, utterance: string) {
  if (speakTimer) {
    clearTimeout(speakTimer);
    speakTimer = null;
  }
  speakTimer = setTimeout(() => {
    context.spstRef.send({ type: "SPEAK", value: { utterance } });
    speakTimer = null;
  }, 300);
}

// ── listen helper ─────────────────────────────────────────────────────────────
function listenAfterDelay(context: DMContext, delay = 200) {
  setTimeout(() => {
    context.spstRef.send({ type: "LISTEN", value: { nlu: true }});
  }, delay);
}

// ── Parse spoken number e.g. "forty two" → 42 ────────────────────────────────
function parseSpokenNumber(utterance: string): number | null {
  const noSpaces = utterance.replace(/\s+/g, "");
  const direct = Number(noSpaces.trim());
  if (!isNaN(direct)) return direct;

  const words: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };

  let total = 0, found = false;
  for (const token of utterance.toLowerCase().trim().split(/\s+/)) {
    if (token in words) { total += words[token]; found = true; }
  }
  return found ? total : null;
}

// ── Check repeated digits ─────────────────────────────────────────────────────
function hasRepeatedDigits(n: number): boolean {
  const digits = String(n).split("");
  return digits.length !== new Set(digits).size;
}

// ── Wordle-style digit feedback ───────────────────────────────────────────────
function getDigitFeedback(secret: number, guess: number): string {
  const secretStr = String(secret);
  const guessStr  = String(guess).padStart(secretStr.length, "0");
  const results: string[] = [];

  for (let i = 0; i < secretStr.length; i++) {
    const digit = guessStr[i];
    const pos   = i + 1;
    if (digit === secretStr[i])         results.push(`digit ${digit} at position ${pos} is correct`);
    else if (secretStr.includes(digit)) results.push(`digit ${digit} is present but misplaced`);
    else                                results.push(`digit ${digit} is not in the number`);
  }
  return results.join(". ") + ".";
}

function isVeryClose(secret: number, guess: number): boolean {
  return Math.abs(secret -guess) <= 5;
}

//score helper function
function calcScore(attempt$: number, timeTaken: number): number {
  const base = Math.max(100 - (attempt$ - 1) * 8, 20);
  const timeBonus = timeTaken < 30 ? 20 : timeTaken < 60 ? 10: 0;
  return base + timeBonus;
}


// ─────────────────────────────────────────────────────────────────────────────
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events:  {} as DMEvents,
  },
  actions: {
    "spst.listen": ({ context }) =>
      context.spstRef.send({ type: "LISTEN", value: {nlu: true }}),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef:      spawn(speechstate, { input: settings }),
    level:        "easy" as const,
    number:       0,
    guess:        0,
    attempts:     0,
    min:          1,
    max:          99,
    hintMin:      1,
    hintMax:      99,
    asrResult:    "",
    noInputCount: 0,
    score:        0,
    totalScore:    0,
    startTime:      0,
    timeTaken:      0,
  }),

  id: "DM",
  initial: "Prepare",

  states: {

    // ── PREPARE ───────────────────────────────────────────────────────────────
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },

    // ── WAIT TO START ─────────────────────────────────────────────────────────
    WaitToStart: {
      on: { CLICK: "Greeting" },
    },

    // ── GREETING ─────────────────────────────────────────────────────────────
    Greeting: {
      initial: "Prompt",
      states: {

        Prompt: {
          entry: ({ context }) =>
            speak(context, "Hello! Welcome to the Number Guessing Game. Say yes to play, or exit to quit."),
          on: { SPEAK_COMPLETE: "Ask" },
        },

        NoInput: {
          entry: ({ context }) =>
            speak(context,
              context.noInputCount >= 2
                ? "Still no response. Say yes to play or exit to quit."
                : "I did not hear you. Say yes to play or exit to quit."
            ),
          on: { SPEAK_COMPLETE: "Ask" },
        },

        NoInputQuit: {
          entry: ({ context }) =>
            speak(context, "No response received. Goodbye!"),
          on: { SPEAK_COMPLETE: "#DM.WaitToStart" },
        },

        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => /\byes\b|\bplay\b/i.test(event.value[0]?.utterance ?? ""),
                actions: assign(({ event }) => ({
                  asrResult:    event.value[0]?.utterance ?? "",
                  noInputCount: 0,
                })),
                target: "#DM.Instructions",
              },
              {
                guard: ({ event }) => /\bexit\b|\bquit\b/i.test(event.value[0]?.utterance ?? ""),
                actions: assign({ noInputCount: () => 0 }),
                target: "#DM.Exit",
              },
              {
                actions: assign(({ event }) => ({ asrResult: event.value[0]?.utterance ?? "" })),
                target: "Prompt",
              },
            ],
            ASR_NOINPUT: [
              {
                guard: ({ context }) => context.noInputCount >= 2,
                target: "NoInputQuit",
              },
              {
                actions: assign(({ context }) => {
                  console.log("ASR_NOINPUT fired, count:", context.noInputCount);
                  return { noInputCount: context.noInputCount + 1 };
                }),
                target: "NoInput",
              },
            ],
          },
        },
      },
    },

    // ── INSTRUCTIONS ─────────────────────────────────────────────────────────
    Instructions: {
      initial: "Prompt",
      states: {

        Prompt: {
          entry: ({ context }) =>
            speak(context, "There are three levels. Easy: 1 to 99. Medium: 100 to 999. Hard: 1000 to 99999. You have 10 attempts. After 7 wrong guesses I will give you a closer hint. Say hint anytime for a clue. Say start when ready."),
          on: { SPEAK_COMPLETE: "Ask" },
        },

        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => /\bstart\b|\bready\b|\bok\b/i.test(event.value[0]?.utterance ?? ""),
                target: "#DM.ChooseLevel",
              },
              {
                actions: assign(({ event }) => ({ asrResult: event.value[0]?.utterance ?? "" })),
                target: "Prompt",
              },
            ],
            ASR_NOINPUT: "Prompt",
          },
        },
      },
    },

    // ── CHOOSE LEVEL ──────────────────────────────────────────────────────────
    ChooseLevel: {
      initial: "Prompt",
      states: {

        Prompt: {
          entry: ({ context }) =>
            speak(context, "Choose your level. Say easy, medium, or hard."),
          on: { SPEAK_COMPLETE: "Ask" },
        },

        NoInput: {
          entry: ({ context }) =>
            speak(context, "I did not hear you. Please say easy, medium, or hard."),
          on: { SPEAK_COMPLETE: "Ask" },
        },

        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => /\beasy\b/i.test(event.value[0]?.utterance ?? ""),
                actions: assign({ level: () => "easy" as const }),
                target: "#DM.GenerateNumber",
              },
              {
                guard: ({ event }) => /\bmedium\b/i.test(event.value[0]?.utterance ?? ""),
                actions: assign({ level: () => "medium" as const }),
                target: "#DM.GenerateNumber",
              },
              {
                guard: ({ event }) => /\bhard\b/i.test(event.value[0]?.utterance ?? ""),
                actions: assign({ level: () => "hard" as const }),
                target: "#DM.GenerateNumber",
              },
              {
                actions: assign(({ event }) => ({ asrResult: event.value[0]?.utterance ?? "" })),
                target: "Prompt",
              },
            ],
            ASR_NOINPUT: "NoInput",
          },
        },
      },
    },

    // ── GENERATE NUMBER ───────────────────────────────────────────────────────
    GenerateNumber: {
      entry: ({ context }) => {
        let min = 1, max = 99;
        switch (context.level) {
          case "easy":   min = 1;    max = 99;    break;
          case "medium": min = 100;  max = 999;   break;
          case "hard":   min = 1000; max = 99999; break;
        }
        const number = Math.floor(Math.random() * (max - min + 1)) + min;
        // assign via a side-effect workaround — context is updated before speak
        (context as any)._pendingUpdate = { number, min, max, hintMin: min, hintMax: max, attempts: 0, guess: 0, noInputCount: 0, startTime: Date.now(), score: 0,};

        const utterance = context.level === "hard"
          ? `Hard level! I have chosen a number between ${min} and ${max}. After each guess I tell you which digits are correct or misplaced. Start guessing!`
          : `Great! I have chosen a number between ${min} and ${max}. Start guessing!`;

        speak(context, utterance);
      },
      on: { SPEAK_COMPLETE: "GenerateNumberDone" },
    },

    GenerateNumberDone: {
      entry: assign(({ context }) => {
        const update = (context as any)._pendingUpdate ?? {};
        return update;
      }),
      always: "Guessing",
    },

    // ── GUESSING ─────────────────────────────────────────────────────────────
    Guessing: {
      initial: "Listen",
      states: {
        Listen: {
          entry: ({ context }) => 
            context.spstRef.send({
              type: "LISTEN",
            value: {
              nlu: true,
              completeTimeout: context.level === "hard" ? 5000 : 2000,
              noInputTimeout: context.level === "hard" ? 8000 : 5000,
            },
           }),
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => ( event as any).nluValue?.topIntent === "request_hint",
                target: "#DM.HintRepeat",
              },
              {
                guard: ({ event }) => (event as any).nluValue?.topIntent === "request_digit_count",
                target: "#DM.HintDigitCount",
              },
              {
                guard: ({ event }) => parseSpokenNumber(event.value[0]?.utterance ?? "") !== null,
                actions: assign(({ context, event }) => {
                  const utterance  = event.value[0]?.utterance ?? "";
                  const parsed     = parseSpokenNumber(utterance)!;
                  const newHintMin = parsed < context.number ? Math.max(context.hintMin, parsed + 1) : context.hintMin;
                  const newHintMax = parsed > context.number ? Math.min(context.hintMax, parsed - 1) : context.hintMax;
                  return { asrResult: utterance, guess: parsed, attempts: context.attempts + 1, hintMin: newHintMin, hintMax: newHintMax };
                }),
                target: "#DM.CheckGuess",
              },
              {
                actions: assign(({ event }) => ({ asrResult: event.value[0]?.utterance ?? "" })),
                target: "NoInput",
              },
            ],
            ASR_NOINPUT: "NoInput",
            GUESS: {
              actions: assign(({ context, event }) => ({
                guess:    event.value,
                attempts: context.attempts + 1,
                hintMin:  event.value < context.number ? Math.max(context.hintMin, event.value + 1) : context.hintMin,
                hintMax:  event.value > context.number ? Math.min(context.hintMax, event.value - 1) : context.hintMax,
              })),
              target: "#DM.CheckGuess",
            },
          },
        },

        NoInput: {
          entry: ({ context }) =>
            speak(context, "I did not hear a number. Please say your guess or say hint for a clue."),
          on: { SPEAK_COMPLETE: "Listen" },
        },

      },
    },

    // ── HINT REPEAT ───────────────────────────────────────────────────────────
    HintRepeat: {
      entry: ({ context }) =>
        speak(context,
          hasRepeatedDigits(context.number)
            ? "Yes! The number has repeated digits. Good luck!"
            : "No, the number has no repeated digits. Good luck!"
        ),
      on: { SPEAK_COMPLETE: "#DM.Guessing" },
    },


    // ── HINT DIGIT COUNT ──────────────────────────────────────────────────────────
HintDigitCount: {
  entry: ({ context }) =>
    speak(context,
      `The number has ${String(context.number).length} digits.`
    ),
  on: { SPEAK_COMPLETE: "#DM.Guessing" },
},

    // ── CHECK GUESS ───────────────────────────────────────────────────────────
    CheckGuess: {
      always: [
        { guard: ({ context }) => context.guess === context.number, target: "Win"            },
        { guard: ({ context }) => context.attempts >= 10,           target: "Lose"           },
        { guard: ({ context }) => context.attempts >= 7,            target: "AutoHint"       },
        { guard: ({ context }) => context.level === "hard",         target: "FeedbackDigits" },
        {                                                            target: "Feedback"       },
      ],
    },

    // ── AUTO HINT (after 7 attempts) ──────────────────────────────────────────
    AutoHint: {
  entry: ({ context }) =>
    speak(context,
      isVeryClose(context.number, context.guess)
        ? `So close! The number is between ${context.hintMin} and ${context.hintMax}. You have ${10 - context.attempts} attempt${10 - context.attempts !== 1 ? "s" : ""} left. You can do it!`
        : `Ugh, still not there! The number is between ${context.hintMin} and ${context.hintMax}. You have ${10 - context.attempts} attempt${10 - context.attempts !== 1 ? "s" : ""} left. You can do it!`
    ),
  on: { SPEAK_COMPLETE: "#DM.Guessing" },
},

    // ── FEEDBACK (easy + medium) ──────────────────────────────────────────────
    Feedback: {
      entry: ({ context }) =>
      speak(context,
        isVeryClose(context.number, context.guess)
        ? `${context.guess}. You are very close! Go ${context.guess < context.number ? "higher" : "lower"}. You have ${10 - context.attempts} attempt${10 - context.attempts !== 1 ? "s" : ""} left.`
        : `${context.guess}. Go ${context.guess < context.number ? "higher" : "lower"}. You have ${10 - context.attempts} attempt${10 - context.attempts !== 1 ? "s" : ""} left.`
    ),
  on: { SPEAK_COMPLETE: "#DM.Guessing" },
},
    // ── FEEDBACK DIGITS (hard level) ──────────────────────────────────────────
    FeedbackDigits: {
      entry: ({ context }) =>
        speak(context,
          `${context.guess} is ${context.guess < context.number ? "too low" : "too high"}. ${isVeryClose(context.number, context.guess) ? "You are very close! " : ""} Here is the digit feedback. ${getDigitFeedback(context.number, context.guess)} You have ${10 - context.attempts} attempt${10 - context.attempts !== 1 ? "s" : ""} left.`
        ),
      on: { SPEAK_COMPLETE: "#DM.Guessing" },
    },

    // ── WIN ───────────────────────────────────────────────────────────────────
    Win: {
      initial: "Prompt",
      states: {

        Prompt: {
          entry: assign(({ context }) => {
            const timeTaken = Math.floor((Date.now() - context.startTime) / 1000);
            const base = Math.max(100 - (context.attempts -1) * 8, 20);
            const timeBonus = timeTaken < 30 ? 20 : timeTaken < 60 ? 10: 0;
            const finalScore = calcScore(context.attempts, timeTaken);
            speak(context,
              `Correct! You guessed ${context.number} in ${context.attempts} attempt${context.attempts !== 1 ? "s" : ""} and ${timeTaken} seconds. you scored ${finalScore} points! Total score: ${context.totalScore + finalScore} .Say restart to play again or exit to quit.`
            );
            return {
              timeTaken,
              score: finalScore,
              totalScore: context.totalScore + finalScore,
            };
          }),
          on: { SPEAK_COMPLETE: "Ask" },
        },

        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => /\brestart\b|\bagain\b|\bplay\b/i.test(event.value[0]?.utterance ?? ""),
                target: "#DM.Greeting",
              },
              {
                guard: ({ event }) => /\bexit\b|\bquit\b/i.test(event.value[0]?.utterance ?? ""),
                target: "#DM.Exit",
              },
              { target: "Prompt" },
            ],
            ASR_NOINPUT: "#DM.Exit",
          },
        },
      },
    },

    // ── LOSE ──────────────────────────────────────────────────────────────────
    Lose: {
      initial: "Prompt",
      states: {

        Prompt: {
          entry: ({ context }) =>
            speak(context,
              `Out of attempts! The number was ${context.number}. Say restart to try again or exit to quit.`
            ),
          on: { SPEAK_COMPLETE: "Ask" },
        },

        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => /\brestart\b|\bagain\b|\bplay\b/i.test(event.value[0]?.utterance ?? ""),
                target: "#DM.Greeting",
              },
              {
                guard: ({ event }) => /\bexit\b|\bquit\b/i.test(event.value[0]?.utterance ?? ""),
                target: "#DM.Exit",
              },
              { target: "Prompt" },
            ],
            ASR_NOINPUT: "#DM.Exit",
          },
        },
      },
    },

    // ── EXIT ──────────────────────────────────────────────────────────────────
    Exit: {
      entry: ({ context }) =>
        speak(context, "Goodbye! Thanks for playing."),
      on: { SPEAK_COMPLETE: "#DM.WaitToStart" },
    },
  },
});

//-----Inspector -------------------------------------------------------

const Inspector = createBrowserInspector();

// ── Actor ─────────────────────────────────────────────────────────────────────
export const dmActor = createActor(dmMachine, {
  inspect: Inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.log("State:", state.value);
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta()
    )[0] || { view: undefined };
    element.innerHTML = meta.view ?? "Click to start";
  });
}
import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://norwayeast.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials,
  azureRegion: "norwayeast",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  answer?: boolean;
}

function extractUtterance(result: unknown): string {
  if (typeof result === "string") return result;
  if (
    Array.isArray(result) &&
    result.length > 0 &&
    typeof result[0] === "object" &&
    result[0] !== null &&
    "utterance" in result[0]
  ) {
    const first = result[0] as { utterance?: unknown };
    if (typeof first.utterance === "string") return first.utterance;
  }
  return "";
}

function classifyAnswer(
  utterance: string,
): "positive" | "neutral" | "negative" {
  const text = utterance.toLowerCase();

  const positiveWords = [
    "teach",
    "openly",
    "share",
    "knowledge",
    "learn",
    "unity",
    "unite",
    "peace",
    "justice",
    "speak",
    "truth",
    "help",
    "combat",
    "support",
    "defend",
    "fight",
    "advise",
    "rights",
  ];

  const neutralWords = [
    "wait",
    "careful",
    "cautious",
    "quietly",
    "later",
    "slowly",
    "protect",
  ];

  const negativeWords = [
    "stop",
    "silent",
    "silence",
    "ignore",
    "divide",
    "manipulate",
    "suppress",
    "hide",
    "abandon",
    "gain",
  ];

  if (positiveWords.some((word) => text.includes(word))) return "positive";
  if (negativeWords.some((word) => text.includes(word))) return "negative";
  if (neutralWords.some((word) => text.includes(word))) return "neutral";

  return "neutral";
}

const dmMachine = setup({
  types: {
    context: {} as {
      spstRef: any;
      lastResult: unknown;
      score: number;
      currentScene: string | null;
    },
    events: {} as
      | { type: "CLICK" }
      | { type: "ASRTTS_READY" }
      | { type: "SPEAK_COMPLETE" }
      | { type: "LISTEN_COMPLETE" }
      | { type: "ASR_NOINPUT" }
      | { type: "RECOGNISED"; value: unknown },
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),

    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
      }),
  },
}).createMachine({
  id: "DM",

  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    score: 0,
    currentScene: null,
  }),

  initial: "Prepare",

  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: {
        ASRTTS_READY: "WaitToStart",
      },
    },

    WaitToStart: {
      on: {
        CLICK: "#DM.Intro",
      },
    },

    Intro: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "Welcome to Historical Voices. You will travel through time and interact with three influential women from history. They will present you with dilemmas. Your decisions will change history and affect the future.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.HypatiaPrompt",
      },
    },

    HypatiaPrompt: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I am Hypatia of Alexandria. Knowledge is under threat. Should I continue teaching openly and advising Orestes, work on philosophy and science quietly, or stop to avoid an outburst?",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.HypatiaListen",
      },
    },

    HypatiaListen: {
      entry: [
        assign({
          lastResult: null,
        }),
        { type: "spst.listen" },
      ],
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({
            lastResult: null,
          }),
        },
        LISTEN_COMPLETE: [
          {
            target: "#DM.HypatiaEvaluate",
            guard: ({ context }) => !!extractUtterance(context.lastResult),
          },
          {
            target: "#DM.HypatiaNoInput",
          },
        ],
      },
    },

    HypatiaNoInput: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I could not hear your advice. Please answer again: teach openly and advise, work quietly, or stop.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.HypatiaListen",
      },
    },

    HypatiaEvaluate: {
      entry: assign(({ context }) => {
        const heard = extractUtterance(context.lastResult);
        const result = classifyAnswer(heard);

        if (result === "positive") {
          return {
            score: context.score + 1,
            currentScene: "hypatia_positive",
          };
        }

        if (result === "negative") {
          return {
            score: context.score - 1,
            currentScene: "hypatia_negative",
          };
        }

        return {
          score: context.score,
          currentScene: "hypatia_neutral",
        };
      }),
      always: [
        {
          target: "#DM.HypatiaPositive",
          guard: ({ context }) => context.currentScene === "hypatia_positive",
        },
        {
          target: "#DM.HypatiaNegative",
          guard: ({ context }) => context.currentScene === "hypatia_negative",
        },
        {
          target: "#DM.HypatiaNeutral",
        },
      ],
    },

    HypatiaPositive: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "Knowledge spreads and benefits the future.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.AspasiaPrompt",
      },
    },

    HypatiaNegative: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "Knowledge is lost. The future is negatively affected.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.AspasiaPrompt",
      },
    },

    HypatiaNeutral: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "The knowledge that survives is likely to be less influential.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.AspasiaPrompt",
      },
    },

    AspasiaPrompt: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I am Aspasia of Miletus. Athens is divided. Should I speak in the name of unity, be cautious, or manipulate others for my personal gain?",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.AspasiaListen",
      },
    },

    AspasiaListen: {
      entry: [
        assign({
          lastResult: null,
        }),
        { type: "spst.listen" },
      ],
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({
            lastResult: null,
          }),
        },
        LISTEN_COMPLETE: [
          {
            target: "#DM.AspasiaEvaluate",
            guard: ({ context }) => !!extractUtterance(context.lastResult),
          },
          {
            target: "#DM.AspasiaNoInput",
          },
        ],
      },
    },

    AspasiaNoInput: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I did not hear your advice. Please answer again: speak for unity, be cautious, or manipulate for personal gain.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.AspasiaListen",
      },
    },

    AspasiaEvaluate: {
      entry: assign(({ context }) => {
        const heard = extractUtterance(context.lastResult);
        const result = classifyAnswer(heard);

        if (result === "positive") {
          return {
            score: context.score + 1,
            currentScene: "aspasia_positive",
          };
        }

        if (result === "negative") {
          return {
            score: context.score - 1,
            currentScene: "aspasia_negative",
          };
        }

        return {
          score: context.score,
          currentScene: "aspasia_neutral",
        };
      }),
      always: [
        {
          target: "#DM.AspasiaPositive",
          guard: ({ context }) => context.currentScene === "aspasia_positive",
        },
        {
          target: "#DM.AspasiaNegative",
          guard: ({ context }) => context.currentScene === "aspasia_negative",
        },
        {
          target: "#DM.AspasiaNeutral",
        },
      ],
    },

    AspasiaPositive: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "Your advice will encourage public dialogue and bring unity.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.SojournerPrompt",
      },
    },

    AspasiaNegative: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "This will cause the division to grow.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.SojournerPrompt",
      },
    },

    AspasiaNeutral: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "The changes are limited and unity is uncertain.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.SojournerPrompt",
      },
    },

    SojournerPrompt: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I am Sojourner Truth. When people face injustice, should I combat it and fight for human rights, act carefully to protect myself, or remain silent?",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.SojournerListen",
      },
    },

    SojournerListen: {
      entry: [
        assign({
          lastResult: null,
        }),
        { type: "spst.listen" },
      ],
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({
            lastResult: null,
          }),
        },
        LISTEN_COMPLETE: [
          {
            target: "#DM.SojournerEvaluate",
            guard: ({ context }) => !!extractUtterance(context.lastResult),
          },
          {
            target: "#DM.SojournerNoInput",
          },
        ],
      },
    },

    SojournerNoInput: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I could not hear you. Please answer again: combat injustice and fight for human rights, act carefully to protect myself, or remain silent.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.SojournerListen",
      },
    },

    SojournerEvaluate: {
      entry: assign(({ context }) => {
        const heard = extractUtterance(context.lastResult);
        const result = classifyAnswer(heard);

        if (result === "positive") {
          return {
            score: context.score + 1,
            currentScene: "sojourner_positive",
          };
        }

        if (result === "negative") {
          return {
            score: context.score - 1,
            currentScene: "sojourner_negative",
          };
        }

        return {
          score: context.score,
          currentScene: "sojourner_neutral",
        };
      }),
      always: [
        {
          target: "#DM.SojournerPositive",
          guard: ({ context }) => context.currentScene === "sojourner_positive",
        },
        {
          target: "#DM.SojournerNegative",
          guard: ({ context }) => context.currentScene === "sojourner_negative",
        },
        {
          target: "#DM.SojournerNeutral",
        },
      ],
    },

    SojournerPositive: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "This decision will bring big change to the treatment and rights of minorities.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.FinalResult",
      },
    },

    SojournerNegative: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "Your decision will allow injustice to continue.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.FinalResult",
      },
    },

    SojournerNeutral: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "It is not certain that society will progress and limit injustice.",
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.FinalResult",
      },
    },

    FinalResult: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => {
          if (context.score > 0) {
            return {
              utterance:
                "Your decisions improved the course of history. You win.",
            };
          }

          if (context.score < 0) {
            return {
              utterance:
                "Your choices negatively affected the future. You lose.",
            };
          }

          return {
            utterance:
              "Your choices will bring an uncertain future.",
          };
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.Done",
      },
    },

    Done: {
      on: {
        CLICK: "#DM.Intro",
      },
    },
  },
});

const dmActor = createActor(dmMachine).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.innerHTML = "Loading audio...";

  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });

  dmActor.subscribe((snapshot) => {
    const stateValue =
      typeof snapshot.value === "string"
        ? snapshot.value
        : JSON.stringify(snapshot.value);

    if (stateValue === "Prepare") {
      element.innerHTML = "Loading audio...";
    } else if (stateValue === "WaitToStart") {
      element.innerHTML = "Start Historical Voices";
    } else if (
      stateValue === "HypatiaListen" ||
      stateValue === "AspasiaListen" ||
      stateValue === "SojournerListen"
    ) {
      element.innerHTML = "Listening...";
    } else if (stateValue === "Done") {
      element.innerHTML = "Restart Historical Voices";
    } else {
      element.innerHTML = "Historical Voices";
    }
  });
}
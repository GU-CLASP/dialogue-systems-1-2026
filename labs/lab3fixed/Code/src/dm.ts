import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();
const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};
const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
}
const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  andrew: { person: "Andreas Bartsiokas" },
  clara: { person: "Clara Schunemann"},

  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },

  "08": { time: "08:00" },
  "09": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  "17": { time: "17:00" },
  "18": { time: "18:00" },
};

function isInGrammar(utterance: string): boolean {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string): string | undefined {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getDay(utterance: string): string | undefined {
  return (grammar[utterance.toLowerCase()] || {}).day;
}

function getTime(utterance: string): string | undefined {
  return (grammar[utterance.toLowerCase()] || {}).time;
}

function isYes(utterance: string): boolean {
  const yesWords = ["yes", "yeah", "yep", "sure", "okay", "ok", "yup"];
  return yesWords.includes(utterance.toLowerCase().trim());
}

function isNo(utterance: string): boolean {
  const noWords = ["no", "nope", "nah"];
  return noWords.includes(utterance.toLowerCase().trim());
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
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
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,      // What the user just said
    name: "",             // Who they're meeting (full name)
    day: "",              // What day
    time: "",             // What time
    isWholeDay: false,    // Is it an all-day meeting?
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { 
        ASRTTS_READY: "WaitToStart" 
      },
    },

    WaitToStart: {
      on: { 
        CLICK: "PromptStart" 
      },
    },

    PromptStart: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Let's create an appointment!" }
      },
      on: {
        SPEAK_COMPLETE: "Who"
      }
    },

    Who: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarPerson",
            guard: ({ context }) => !!context.lastResult,
          },
          {
            target: ".NoInput",
          }
        ],
      },
      states: {
        Prompt: {
          entry: { 
            type: "spst.speak", 
            params: { utterance: "Who are you meeting with?" } 
          },
          on: { 
            SPEAK_COMPLETE: "Listen" 
          },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I can't hear you!" },
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },

    CheckGrammarPerson: {
      always: [
        {
          target: "WhenDay",
          guard: ({ context }) => 
            isInGrammar(context.lastResult![0].utterance),
          actions: assign(({ context }) => {
            const utterance = context.lastResult![0].utterance;
            return {
              name: getPerson(utterance) || utterance
            };
          }),
        },
        {
          // If not in grammar, ask them to repeat
          target: "NotInGrammarPerson",
        }
      ],
    },

    // --------------------------------------------------------------------------
    // NOT IN GRAMMAR PERSON - Handle invalid input
    // --------------------------------------------------------------------------
    NotInGrammarPerson: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Sorry, I don't know ${context.lastResult![0].utterance}. Please try again.`
        }),
      },
      on: {
        SPEAK_COMPLETE: "Who"
      }
    },

    // --------------------------------------------------------------------------
    // WHEN DAY - Ask what day
    // --------------------------------------------------------------------------
    WhenDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarDay",
            guard: ({ context }) => !!context.lastResult,
          },
          {
            target: ".NoInput",
          }
        ],
      },
      states: {
        Prompt: {
          entry: { 
            type: "spst.speak", 
            params: { utterance: "On which day is your meeting?" } 
          },
          on: { 
            SPEAK_COMPLETE: "Listen" 
          },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I can't hear you!" },
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },

    // --------------------------------------------------------------------------
    // CHECK GRAMMAR DAY - Validate and save the day
    // --------------------------------------------------------------------------
    CheckGrammarDay: {
      always: [
        {
          target: "AllDay",
          guard: ({ context }) => 
            isInGrammar(context.lastResult![0].utterance),
          actions: assign(({ context }) => {
            const utterance = context.lastResult![0].utterance;
            return {
              day: getDay(utterance) || utterance
            };
          }),
        },
        {
          target: "NotInGrammarDay",
        }
      ],
    },

    // --------------------------------------------------------------------------
    // NOT IN GRAMMAR DAY - Handle invalid input
    // --------------------------------------------------------------------------
    NotInGrammarDay: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Sorry, I don't recognize ${context.lastResult![0].utterance} as a day. Please try again.`
        }),
      },
      on: {
        SPEAK_COMPLETE: "WhenDay"
      }
    },

    // --------------------------------------------------------------------------
    // ALL DAY - Ask if it's an all-day meeting
    // --------------------------------------------------------------------------
    AllDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckAllDayResponse",
            guard: ({ context }) => !!context.lastResult,
          },
          {
            target: ".NoInput",
          }
        ],
      },
      states: {
        Prompt: {
          entry: { 
            type: "spst.speak", 
            params: { utterance: "Will it take the whole day?" } 
          },
          on: { 
            SPEAK_COMPLETE: "Listen" 
          },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I can't hear you!" },
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },

    CheckAllDayResponse: {
      always: [
        {
          // User said YES → It's a whole day meeting
          target: "ConfirmWholeDay",
          guard: ({ context }) => isYes(context.lastResult![0].utterance),
          actions: assign({ isWholeDay: true }),
        },
        {
          // User said NO → Ask for specific time
          target: "WhenTime",
          guard: ({ context }) => isNo(context.lastResult![0].utterance),
          actions: assign({ isWholeDay: false }),
        },
        {
          // User said something else → Didn't understand
          target: "DidntUnderstandAllDay",
        }
      ],
    },

    DidntUnderstandAllDay: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Sorry, I didn't understand. Please say yes or no." },
      },
      on: {
        SPEAK_COMPLETE: "AllDay"
      }
    },

    WhenTime: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarTime",
            guard: ({ context }) => !!context.lastResult,
          },
          {
            target: ".NoInput",
          }
        ],
      },
      states: {
        Prompt: {
          entry: { 
            type: "spst.speak", 
            params: { utterance: "What time is your meeting?" } 
          },
          on: { 
            SPEAK_COMPLETE: "Listen" 
          },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I can't hear you!" },
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },

    CheckGrammarTime: {
      always: [
        {
          target: "ConfirmSpecificTime",
          guard: ({ context }) => 
            isInGrammar(context.lastResult![0].utterance),
          actions: assign(({ context }) => {
            const utterance = context.lastResult![0].utterance;
            return {
              time: getTime(utterance) || utterance
            };
          }),
        },
        {
          target: "NotInGrammarTime",
        }
      ],
    },

    NotInGrammarTime: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Sorry, I don't recognize ${context.lastResult![0].utterance} as a time. Please try again.`
        }),
      },
      on: {
        SPEAK_COMPLETE: "WhenTime"
      }
    },

    ConfirmWholeDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckConfirmationWholeDay",
            guard: ({ context }) => !!context.lastResult,
          },
          {
            target: ".NoInput",
          }
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Do you want me to create an appointment with ${context.name} on ${context.day} for the whole day?`
            })
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          }
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I can't hear you!" },
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },

    CheckConfirmationWholeDay: {
      always: [
        {
          target: "AppointmentCreated",
          guard: ({ context }) => isYes(context.lastResult![0].utterance),
        },
        {
          target: "PromptStart",
          guard: ({ context }) => isNo(context.lastResult![0].utterance),
        },
        {
          target: "DidntUnderstandConfirmWholeDay",
        }
      ],
    },

    DidntUnderstandConfirmWholeDay: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Sorry, I didn't understand. Please say yes or no." },
      },
      on: {
        SPEAK_COMPLETE: "ConfirmWholeDay"
      }
    },

    ConfirmSpecificTime: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckConfirmationSpecificTime",
            guard: ({ context }) => !!context.lastResult,
          },
          {
            target: ".NoInput",
          }
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Do you want me to create an appointment with ${context.name} on ${context.day} at ${context.time}?`
            })
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          }
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I can't hear you!" },
          },
          on: {
            SPEAK_COMPLETE: "Listen"
          },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },

    CheckConfirmationSpecificTime: {
      always: [
        {
          target: "AppointmentCreated",
          guard: ({ context }) => isYes(context.lastResult![0].utterance),
        },
        {
          target: "PromptStart",
          guard: ({ context }) => isNo(context.lastResult![0].utterance),
        },
        {
          target: "DidntUnderstandConfirmSpecificTime",
        }
      ],
    },

    DidntUnderstandConfirmSpecificTime: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Sorry, I didn't understand. Please say yes or no." },
      },
      on: {
        SPEAK_COMPLETE: "ConfirmSpecificTime"
      }
    },

    AppointmentCreated: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Your appointment has been created!" }
      },
      on: {
        SPEAK_COMPLETE: "Done"
      }
    },

    Done: {
      on: {
        CLICK: "PromptStart"
      },
    }
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}

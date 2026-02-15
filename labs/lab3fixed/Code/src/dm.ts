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
  vladislav: { person: "Vladislav Maraev" },
  maraev: { person: "Vladislav Maraev" },

  bora: { person: "Bora Kara" },
  kara: { person: "Bora Kara" },

  tal: { person: "Talha Bedir" },
  talha: { person: "Talha Bedir" },
  bedir: { person: "Talha Bedir" },

  tom: { person: "Tom Södahl Bladsjö" },

  andreas: { person: "Andreas Bartsiokas" },
  andrew: { person: "Andreas Bartsiokas" },
  bartsiokas: { person: "Andreas Bartsiokas" },

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

// function isInGrammar(utterance: string): boolean {
//   return utterance.toLowerCase() in grammar;
// }

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
        value: { utterance: params.utterance },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({ type: "LISTEN" }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    name: "",
    day: "",
    time: "",
    isWholeDay: false
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },

    WaitToStart: {
      on: { CLICK: "PromptStart" },
    },

    PromptStart: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Let's create an appointment!" }
      },
      on: { SPEAK_COMPLETE: "CollectInfo" }
    },

    CollectInfo: {
      initial: "Who",
      history: true,
      
      states: {
        Who: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckPerson", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" }
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "Who are you meeting with?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" }
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({ lastResult: event.value })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },

        CheckPerson: {
          always: [
            {
              target: "WhenDay",
              // CHECK: Does this utterance have a .person field?
              guard: ({ context }) => {
                const utterance = context.lastResult![0].utterance;
                return getPerson(utterance) !== undefined;
              },
              actions: assign(({ context }) => ({
                name: getPerson(context.lastResult![0].utterance)!
              })),
            },
            { target: "ErrorPerson" }
          ],
        },

        ErrorPerson: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Sorry, I don't know ${context.lastResult![0].utterance}. Please try again.`
            }),
          },
          on: { SPEAK_COMPLETE: "Who" }
        },

        WhenDay: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckDay", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" }
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "On which day is your meeting?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" }
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({ lastResult: event.value })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },

        CheckDay: {
          always: [
            {
              target: "AllDay",
              // CHECK: Does this utterance have a .day field?
              guard: ({ context }) => {
                const utterance = context.lastResult![0].utterance;
                return getDay(utterance) !== undefined;
              },
              actions: assign(({ context }) => ({
                day: getDay(context.lastResult![0].utterance)!
              })),
            },
            { target: "ErrorDay" }
          ],
        },

        ErrorDay: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Sorry, I don't recognize ${context.lastResult![0].utterance} as a day. Please try again.`
            }),
          },
          on: { SPEAK_COMPLETE: "WhenDay" }
        },

        AllDay: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckAllDay", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" }
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "Will it take the whole day?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" }
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({ lastResult: event.value })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },

        CheckAllDay: {
          always: [
            {
              target: "#DM.Confirm",
              guard: ({ context }) => isYes(context.lastResult![0].utterance),
              actions: assign({ isWholeDay: true }),
            },
            {
              target: "WhenTime",
              guard: ({ context }) => isNo(context.lastResult![0].utterance),
              actions: assign({ isWholeDay: false }),
            },
            { target: "ErrorAllDay" }
          ],
        },

        ErrorAllDay: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Sorry, I didn't understand. Please say yes or no." },
          },
          on: { SPEAK_COMPLETE: "AllDay" }
        },

        WhenTime: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckTime", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" }
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" }
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({ lastResult: event.value })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },

        CheckTime: {
          always: [
            {
              target: "#DM.Confirm",
              // CHECK: Does this utterance have a .time field?
              guard: ({ context }) => {
                const utterance = context.lastResult![0].utterance;
                return getTime(utterance) !== undefined;
              },
              actions: assign(({ context }) => ({
                time: getTime(context.lastResult![0].utterance)!
              })),
            },
            { target: "ErrorTime" }
          ],
        },

        ErrorTime: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Sorry, I don't recognize ${context.lastResult![0].utterance} as a time. Please try again.`
            }),
          },
          on: { SPEAK_COMPLETE: "WhenTime" }
        },
      },
    },

    Confirm: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          { target: "CheckConfirmation", guard: ({ context }) => !!context.lastResult },
          { target: ".NoInput" }
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: context.isWholeDay
                ? `Do you want me to create an appointment with ${context.name} on ${context.day} for the whole day?`
                : `Do you want me to create an appointment with ${context.name} on ${context.day} at ${context.time}?`
            })
          },
          on: { SPEAK_COMPLETE: "Listen" }
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
          on: { SPEAK_COMPLETE: "Listen" }
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({ lastResult: event.value })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },

    CheckConfirmation: {
      always: [
        {
          target: "AppointmentCreated",
          guard: ({ context }) => isYes(context.lastResult![0].utterance),
        },
        {
          target: "CollectInfo",
          guard: ({ context }) => isNo(context.lastResult![0].utterance),
        },
        { target: "ErrorConfirmation" }
      ],
    },

    ErrorConfirmation: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Sorry, I didn't understand. Please say yes or no." },
      },
      on: { SPEAK_COMPLETE: "Confirm" }
    },

    AppointmentCreated: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Your appointment has been created!" }
      },
      on: { SPEAK_COMPLETE: "Done" }
    },

    Done: {
      on: { CLICK: "PromptStart" },
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
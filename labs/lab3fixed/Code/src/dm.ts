import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

/* ---------------- Azure settings ---------------- */
const azureCredentials = {
  endpoint: "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/* ---------------- Grammars ---------------- */
interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
}

const grammar: { [index: string]: GrammarEntry } = {
  // people
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  emma: { person: "Emma Collins" },
  liam: { person: "Liam Parket" },
  sofia: { person: "Sofia Bennett" },
  yeganeh: { person: "Yeganeh Vahabi" },

  // days
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },

  // times
  "9": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  "17": { time: "17:00" },
  "18": { time: "18:00" },
  "19": { time: "19:00" },
  "20": { time: "20:00" },

};

const yesNoGrammar: { [index: string]: boolean } = {
  // yes‑like
  yes: true,
  yeah: true,
  yep: true,
  "of course": true,
  sure: true,
  absolutely: true,
  "for sure": true,
  "why not": true,
  "sounds good": true,
  ok: true,
  okay: true,
  alright: true,

  // no‑like
  no: false,
  nope: false,
  "no way": false,
  nah: false,
  "not really": false,
  "i don't think so": false,
  "absolutely not": false,
};

/* ---------------- Helper functions ---------------- */
function getGreeting(utterance: string) {
  const text = utterance.toLowerCase();
  const greetings = [
    "hi",
    "hello",
    "hey",
  ];
  return greetings.find(g => text.includes(g));
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getDay(utterance: string) {
  return grammar[utterance.toLowerCase()]?.day;
}

function getYesNo(utterance: string): boolean | null {
  const key = utterance.toLowerCase();
  return key in yesNoGrammar ? yesNoGrammar[key] : null;
}

function getTime(utterance: string) {
  return grammar[utterance.toLowerCase()]?.time;
}

/* ---------------- Dialogue Manager ---------------- */
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents, // what events are allowed
  },

  actions: {
    // for speaking
    "spst.speak": ({ context }, params: { utterance: string }) => {
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      });
    },

    // for listening
    "spst.listen": ({ context }) => {
      context.spstRef.send({ type: "LISTEN" });
    },
  },
}).createMachine({
  // machine metadata
  id: "DM",
  initial: "Prepare",
  deferEvents: true,

  // memory of the dialogue context
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,

    person: undefined,
    day: undefined,
    time: undefined,
    wholeDay: undefined,
    confirm: undefined,
    retryCount: 0,
  }),

  states: {
    /* -------- PREPARE -------- */
    Prepare: {
      entry: ({ context }) =>
        context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },


    /* -------- START -------- */
    WaitToStart: {
      entry: assign({
        person: undefined,
        day: undefined,
        time: undefined,
        wholeDay: undefined,
        confirm: undefined,
        retryCount: 0,
      }),
      on: {
        CLICK: "Greeting",
      },
    },

    Greeting: {
      initial: "ListenHi",
      states: {
        ListenHi: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              guard: ({ event }) =>
                !!getGreeting(event.value[0].utterance),
              actions: assign(({ event }) => ({
                lastResult: event.value,
              })),
            },
            LISTEN_COMPLETE: [
              {
                target: "#introduction",
                guard: ({ context }) => !!context.lastResult,
              },
              {
                target: "SayHi",
              },
            ],
          },
        },
        SayHi: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Hi!" }
          },
          on: { SPEAK_COMPLETE: "ListenHi" }
        },
      },
    },

    Introduction: {
      id: "introduction",
      entry: {
        type: "spst.speak",
        params: { utterance: "Let's create an appointment!" }
      },
      on: { SPEAK_COMPLETE: "Person" }
    },

    /* -------- PERSON -------- */
    Person: {
      initial: "AskPerson",

      states: {

        AskPerson: {
          entry: [
            assign({ retryCount: 0 }),
            {
              type: "spst.speak",
              params: { utterance: "Who are you meeting with?" }
            }
          ],
          on: { SPEAK_COMPLETE: "ListenPerson" }
        },

        ListenPerson: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
                person: getPerson(event.value[0].utterance),
              })),
            },
            LISTEN_COMPLETE: [
              {
                target: "#DM.Day",
                guard: ({ context }) => !!context.person,
              },
              {
                guard: ({ context }) => (context.retryCount ?? 0) < 2,
                actions: assign({
                  retryCount: ({ context }) =>
                    (context.retryCount ?? 0) + 1
                }),
                target: "RepromptPerson"
              },
              {
                target: "#DM.Fallback"
              }
            ],
          },
        },

        RepromptPerson: {
          entry: {
            type: "spst.speak",
            params: {
              utterance:
                "Sorry, I didn’t catch that. Who are you meeting?"
            }
          },
          on: { SPEAK_COMPLETE: "ListenPerson" }
        },

      }
    },

    /* -------- DAY -------- */
    Day: {
      initial: "AskDay",

      states: {

        AskDay: {
          entry: [
            assign({ retryCount: 0 }),
            {
              type: "spst.speak",
              params: { utterance: "On which day is your meeting?" },
            }
          ],
          on: { SPEAK_COMPLETE: "ListenDay" },
        },

        ListenDay: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
                day: getDay(event.value[0].utterance),
              })),
            },
            LISTEN_COMPLETE: [
              {
                target: "#DM.WholeDay",
                guard: ({ context }) => !!context.day,
              },
              {
                guard: ({ context }) => (context.retryCount ?? 0) < 2,
                actions: assign({
                  retryCount: ({ context }) =>
                    (context.retryCount ?? 0) + 1
                }),
                target: "RepromptDay",
              },
              {
                target: "#DM.Fallback",
              }
            ],
          },
        },

        RepromptDay: {
          entry: {
            type: "spst.speak",
            params: {
              utterance: "I didn't hear that. What day you said?"
            }
          },
          on: { SPEAK_COMPLETE: "ListenDay" }
        },

      }
    },

    /* -------- WHOLE DAY -------- */
    WholeDay: {
      initial: "AskWholeDay",

      states: {

        AskWholeDay: {
          entry: [
            assign({ retryCount: 0 }),
            {
              type: "spst.speak",
              params: { utterance: "Will it take the whole day?" },
            }
          ],
          on: { SPEAK_COMPLETE: "ListenWholeDay" },
        },

        ListenWholeDay: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) =>
                  getYesNo(event.value[0].utterance) === true,
                actions: assign(({ event }) => ({
                  lastResult: event.value,
                  wholeDay: true,
                })),
              },
              {
                guard: ({ event }) =>
                  getYesNo(event.value[0].utterance) === false,
                actions: assign(({ event }) => ({
                  lastResult: event.value,
                  wholeDay: false,
                })),
              },
            ],

            LISTEN_COMPLETE: [
              {
                target: "#DM.Confirming",
                guard: ({ context }) => context.wholeDay === true,
              },
              {
                target: "#DM.Time",
                guard: ({ context }) => context.wholeDay === false,
              },
              {
                guard: ({ context }) =>
                  (context.retryCount ?? 0) < 2,
                actions: assign({
                  retryCount: ({ context }) =>
                    (context.retryCount ?? 0) + 1
                }),
                target: "RepromptWholeDay",
              },
              {
                target: "#DM.Fallback",
              }
            ],
          },
        },

        RepromptWholeDay: {
          entry: {
            type: "spst.speak",
            params: {
              utterance:
                "Sorry, I didn’t hear you. Will it take the whole day?"
            }
          },
          on: { SPEAK_COMPLETE: "ListenWholeDay" }
        },

      }
    },

    /* -------- TIME -------- */
    Time: {
      initial: "AskTime",

      states: {

        AskTime: {
          entry: [
            assign({ retryCount: 0 }),
            {
              type: "spst.speak",
              params: { utterance: "What time is your meeting?" },
            }
          ],
          on: { SPEAK_COMPLETE: "ListenTime" },
        },

        ListenTime: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
                time: getTime(event.value[0].utterance),
              })),
            },

            LISTEN_COMPLETE: [
              {
                target: "#DM.Confirming",
                guard: ({ context }) => !!context.time,
              },
              {
                guard: ({ context }) =>
                  (context.retryCount ?? 0) < 2,
                actions: assign({
                  retryCount: ({ context }) =>
                    (context.retryCount ?? 0) + 1
                }),
                target: "RepromptTime",
              },
              {
                target: "#DM.Fallback",
              }
            ],
          },
        },

        RepromptTime: {
          entry: {
            type: "spst.speak",
            params: {
              utterance:
                "I didn't here the time. What time is your meeting?"
            }
          },
          on: { SPEAK_COMPLETE: "ListenTime" }
        },

      }
    },

    /* -------- CONFIRMs -------- */
    Confirming: {
      initial: "Confirm",
      states: {
        Confirm: {
          entry: [
            assign({ retryCount: 0 }),
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: context.wholeDay
                  ? `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`
                  : `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.time}?`
              }),

            }],
          on: { SPEAK_COMPLETE: "ListenConfirm" },
        },

        ListenConfirm: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => getYesNo(event.value[0].utterance) === true,
                actions: assign(({ event }) => ({
                  lastResult: event.value,
                  confirm: true,
                })),
              },
              {
                guard: ({ event }) => getYesNo(event.value[0].utterance) === false,
                actions: assign(({ event }) => ({
                  lastResult: event.value,
                  confirm: false,
                })),
              },
            ],
            LISTEN_COMPLETE: [
              {
                target: "#DM.Done",
                guard: ({ context }) => context.confirm === true,
              },
              {
                target: "#DM.Person",
                guard: ({ context }) => context.confirm === false,
              },
              {
                guard: ({ context }) => (context.retryCount ?? 0) < 2,
                actions: assign({
                  retryCount: ({ context }) => (context.retryCount ?? 0) + 1
                }),
                target: "RepromptConfirm",
              },
              {
                target: "#DM.Fallback",
              }
            ],
          },
        },

        RepromptConfirm: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Sorry, I didn't here you. Do you want to create the appointment?" }
          },
          on: { SPEAK_COMPLETE: "ListenConfirm" }
        },

      },
    },

    /* -------- FALLBACK -------- */
    Fallback: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "I'm having trouble understanding. Let's start over."
        }
      },
      on: {
        SPEAK_COMPLETE: "WaitToStart"
      }
    },

    /* -------- DONE -------- */
    Done: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Your appointment has been created!" },
      },
      on: { CLICK: "WaitToStart" },
    },

  },
});

/* ---------------- Actor ---------------- */
const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

/* ---------------- Button ---------------- */
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

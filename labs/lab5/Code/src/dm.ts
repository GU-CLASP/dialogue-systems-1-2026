import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, NLUObject, DMEvents } from "./types";


const inspector = createBrowserInspector();

/* ---------------- Azure settings ---------------- */
const azureCredentials = {
  endpoint: "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://lab-gusvahaye.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
  key: NLU_KEY /** reference to your Azure CLU key */,
  deploymentName: "appointment" /** your Azure CLU deployment */,
  projectName: "appointment" /** your Azure CLU project name */,
};

const settings: Settings = {
  azureLanguageCredentials,
  azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/* ---------------- Helper functions ---------------- */

function getPerson(nlu: NLUObject | null): string | undefined {
  if (nlu) {
    for (const entity of nlu.entities) {
      if (entity.category === "person") {
        return entity.text;
      }
    }
  }
  return undefined;
}

function getDay(nlu: NLUObject | null): string | undefined {
  if (nlu) {
    for (const entity of nlu.entities) {
      if (entity.category === "day") {
        return entity.text;
      }
    }
  }
  return undefined;
}

function getTime(nlu: NLUObject | null): string | undefined {
  if (nlu) {
    for (const entity of nlu.entities) {
      if (entity.category === "time") {
        return entity.text;
      }
    }
  }
  return undefined;
}

function getYesNo(nlu: NLUObject | null): boolean | null {
  if (!nlu || !nlu.entities) return null;

  for (const entity of nlu.entities) {
    const category = entity.category?.toLowerCase();

    if (category === "yes") return true;
    if (category === "no") return false;
  }

  return null;
}

function getWholeDay(nlu: NLUObject | null): boolean | null {
  if (!nlu?.entities?.length) return null;

  for (const entity of nlu.entities) {
    const category = entity.category?.toLowerCase();

    if (category === "wholeday") return true;
  }

  return null;
}

/* ---------------- Dialogue Manager ---------------- */
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
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
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true }, /** Local activation of NLU */
      });
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
    interpretation: null,

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
        CLICK: "AskForIntent",
      },
    },

    /* -------- ASK FOR INTENT -------- */
    AskForIntent: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Hi! How can I help you?" }
      },
      on: { SPEAK_COMPLETE: "ListenForIntent" }
    },

    /* -------- LISTEN FOR THE INTENT -------- */
    ListenForIntent: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            interpretation: event.nluValue
          })),
        },
        LISTEN_COMPLETE: [
          {
            target: "#DM.HandleIntent",
            guard: ({ context }) => !!context.interpretation
          },
          {
            guard: ({ context }) => (context.retryCount ?? 0) < 2,
            actions: assign({
              retryCount: ({ context }) =>
                (context.retryCount ?? 0) + 1
            }),
            target: "AskForIntent"
          },
          {
            target: "#DM.Fallback"
          }
        ],
      },
    },

    /* -------- HANDLE INTENT -------- */
    HandleIntent: {
      entry: assign(({ context }) => {
        const interpretation = context.interpretation;
        const intent = interpretation?.topIntent;

        if (intent === "Create Meeting") {
          return {
            person: getPerson(interpretation) ?? undefined,
            day: getDay(interpretation) ?? undefined,
            time: getTime(interpretation) ?? undefined,
            wholeDay: getWholeDay(interpretation) ?? undefined,
          };
        }

        if (intent === "Who is X") {
          return {
            person: getPerson(interpretation),
          };
        }

        return {};
      }),

      always: [
        // ---------- CREATE MEETING ----------
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Create Meeting" &&
            !context.person,
          target: "Person",
        },
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Create Meeting" &&
            !context.day,
          target: "Day",
        },
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Create Meeting" &&
            !context.wholeDay &&
            !context.time,
          target: "WholeDay",
        },
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Create Meeting",
          target: "Confirming",
        },

        // ---------- WHO IS ----------
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Who is X" &&
            !!context.person,
          target: "TellWhoIs",
        },
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Who is X",
          target: "WhoIs",
        },

        // ---------- FALLBACK ----------
        {
          target: "Fallback",
        },
      ],
    },

    /* -------- WHO IS -------- */
    WhoIs: {
      initial: "Ask",
      states: {
        Ask: {
          entry: [
            assign({
              retryCount: 0,
            }),
            {
              type: "spst.speak",
              params: { utterance: "So, who do you want to know about?" }
            }
          ],
          on: { SPEAK_COMPLETE: "Listen" }
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                person: getPerson(event.nluValue)
              })),
            },
            LISTEN_COMPLETE: [
              {
                target: "#DM.TellWhoIs",
                guard: ({ context }) => !!context.person,
              },
              {
                guard: ({ context }) => (context.retryCount ?? 0) < 2,
                actions: assign({
                  retryCount: ({ context }) =>
                    (context.retryCount ?? 0) + 1
                }),
                target: "RepromptPersonWho"
              },
              {
                target: "#DM.Fallback"
              }
            ],
          },
        },
        Answer: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `${context.person} is someone I can tell you about.`
            })
          },
          on: { SPEAK_COMPLETE: "#DM.WaitToStart" }
        },
        RepromptPersonWho: {
          entry: {
            type: "spst.speak",
            params: {
              utterance:
                "Sorry, I didn’t catch that. What famous person you want to know about?"
            }
          },
          on: { SPEAK_COMPLETE: "Listen" }
        },
      },
    },

    /* -------- TELL WHO IS -------- */
    TellWhoIs: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${context.person} is someone I can tell you about.`,
        }),
      },
      on: {
        SPEAK_COMPLETE: "WaitToStart"
      }
    },

    /* -------- PERSON -------- */
    Person: {
      initial: "CheckPerson",

      states: {
        CheckPerson: {
          always: [
            { target: "#DM.Day", guard: ({ context }) => !!context.person },
            { target: "AskPerson" }
          ]
        },
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
              actions: assign(({ event }) => ({ person: getPerson(event.nluValue) })),
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
      },
    },

    /* -------- DAY -------- */
    Day: {
      initial: "CheckDay",
      states: {
        CheckDay: {
          always: [
            { target: "#DM.WholeDay", guard: ({ context }) => !!context.day },
            { target: "AskDay" }
          ]
        },
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
              actions: assign(({ event }) => ({ day: getDay(event.nluValue) })),
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
      },
    },

    /* -------- WHOLE DAY -------- */
    WholeDay: {
      initial: "CheckTime",
      states: {
        CheckTime: {
          always: [
            // If whole-day is true → skip time
            { target: "#DM.Confirming", guard: ({ context }) => context.wholeDay === true },

            // If whole-day is false AND time exists → continue
            { target: "#DM.Confirming", guard: ({ context }) => !!context.time },

            // Otherwise → ask if it's a whole-day meeting
            { target: "AskWholeDay" }
          ]
        },
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
                  getYesNo(event.nluValue) === true,
                actions: assign(({ event }) => ({
                  lastResult: event.nluValue,
                  wholeDay: true,
                })),
              },
              {
                guard: ({ event }) =>
                  getYesNo(event.nluValue) === false,
                actions: assign(({ event }) => ({
                  lastResult: event.nluValue,
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
      },
    },

    /* -------- TIME -------- */
    Time: {
      initial: "Check",
      states: {
        Check: {
          always: [
            // If whole-day is true → skip time
            { target: "#DM.Confirming", guard: ({ context }) => context.wholeDay === true },

            // If whole-day is false AND time exists → continue
            { target: "#DM.Confirming", guard: ({ context }) => !!context.time },

            // Otherwise → ask for time
            { target: "AskTime" }
          ]
        },
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
                lastResult: event.nluValue,
                time: getTime(event.nluValue),
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
            },
          },
          on: { SPEAK_COMPLETE: "ListenTime" }
        },
      },
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
                guard: ({ event }) => getYesNo(event.nluValue) === true,
                actions: assign(({ event }) => ({
                  lastResult: event.nluValue,
                  confirm: true,
                })),
              },
              {
                guard: ({ event }) => getYesNo(event.nluValue) === false,
                actions: assign(({ event }) => ({
                  lastResult: event.nluValue,
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
                target: "#DM.AskForIntent",
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

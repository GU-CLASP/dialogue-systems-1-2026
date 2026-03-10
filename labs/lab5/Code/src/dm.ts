import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://ds2026-gusbaranj.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2022-10-01-preview",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "lab5",
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureLanguageCredentials: azureLanguageCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

// helper functions

function getTopIntent(context: DMContext): string | undefined {
  return context.interpretation?.topIntent;
}

function getEntity(context: DMContext, category: string): string | undefined {
  return context.interpretation?.entities.find(
    (e) => e.category === category
  )?.text;
}

function isAgree(context: DMContext): boolean {
  return getTopIntent(context) === "Agree";
}

function isDisagree(context: DMContext): boolean {
  return getTopIntent(context) === "Disagree";
}

// machine
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
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true },
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    name: "",
    day: "",
    time: "",
    isWholeDay: false,
  }),
  id: "DM",
  initial: "Prepare",
  states: {

    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },

    WaitToStart: {
      on: { CLICK: "GetIntent" },
    },

    GetIntent: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          { target: "RouteIntent", guard: ({ context }) => !!context.lastResult },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: { utterance: "What can I help you with?" },
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I can't hear you!" },
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
                interpretation: event.nluValue,
              })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null, interpretation: null }),
            },
          },
        },
      },
    },

    RouteIntent: {
      always: [
        {
          target: "CollectInfo",
          guard: ({ context }) => getTopIntent(context) === "CreateAppointment",
        },
        { target: "ErrorIntent" },
      ],
    },

    ErrorIntent: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Sorry, I'm not sure how to help with that yet." },
      },
      on: { SPEAK_COMPLETE: "GetIntent" },
    },

// main state for collecting info about the appointment
    CollectInfo: {
      initial: "Who",
      states: {

        Who: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckPerson", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" },
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "Who are you meeting with?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue,
                  })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null, interpretation: null }),
                },
              },
            },
          },
        },

        CheckPerson: {
          always: [
            {
              target: "WhenDay",
              guard: ({ context }) => !!getEntity(context, "Who"),
              actions: assign(({ context }) => ({
                name: getEntity(context, "Who")!,
              })),
            },
            { target: "ErrorPerson" },
          ],
        },

        ErrorPerson: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Sorry, I don't know ${context.lastResult![0].utterance}. Please try again.`,
            }),
          },
          on: { SPEAK_COMPLETE: "Who" },
        },

        WhenDay: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckDay", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" },
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "On which day is your meeting?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue,
                  })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null, interpretation: null }),
                },
              },
            },
          },
        },

        CheckDay: {
          always: [
            {
              target: "AllDay",
              guard: ({ context }) => !!getEntity(context, "Day"),
              actions: assign(({ context }) => ({
                day: getEntity(context, "Day")!,
              })),
            },
            { target: "ErrorDay" },
          ],
        },

        ErrorDay: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Sorry, I don't recognize ${context.lastResult![0].utterance} as a day. Please try again.`,
            }),
          },
          on: { SPEAK_COMPLETE: "WhenDay" },
        },

        AllDay: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckAllDay", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" },
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "Will it take the whole day?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue,
                  })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null, interpretation: null }),
                },
              },
            },
          },
        },

        CheckAllDay: {
          always: [
            {
              target: "#DM.Confirm",
              guard: ({ context }) => isAgree(context),
              actions: assign({ isWholeDay: true }),
            },
            {
              target: "WhenTime",
              guard: ({ context }) => isDisagree(context),
              actions: assign({ isWholeDay: false }),
            },
            { target: "ErrorAllDay" },
          ],
        },

        ErrorAllDay: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Sorry, I didn't understand. Please say yes or no." },
          },
          on: { SPEAK_COMPLETE: "AllDay" },
        },

        WhenTime: {
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              { target: "CheckTime", guard: ({ context }) => !!context.lastResult },
              { target: ".NoInput" },
            ],
          },
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            NoInput: {
              entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue,
                  })),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null, interpretation: null }),
                },
              },
            },
          },
        },

        CheckTime: {
          always: [
            {
              target: "#DM.Confirm",
              guard: ({ context }) => !!getEntity(context, "Time"),
              actions: assign(({ context }) => ({
                time: getEntity(context, "Time")!,
              })),
            },
            { target: "ErrorTime" },
          ],
        },

        ErrorTime: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Sorry, I don't recognize ${context.lastResult![0].utterance} as a time. Please try again.`,
            }),
          },
          on: { SPEAK_COMPLETE: "WhenTime" },
        },
      },
    },
// confirmation state
    Confirm: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          { target: "CheckConfirmation", guard: ({ context }) => !!context.lastResult },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: context.isWholeDay
                ? `Do you want me to create an appointment with ${context.name} on ${context.day} for the whole day?`
                : `Do you want me to create an appointment with ${context.name} on ${context.day} at ${context.time}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "I can't hear you!" } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
                interpretation: event.nluValue,
              })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null, interpretation: null }),
            },
          },
        },
      },
    },

    CheckConfirmation: {
      always: [
        {
          target: "AppointmentCreated",
          guard: ({ context }) => isAgree(context),
        },
        {
          target: "CollectInfo",
          guard: ({ context }) => isDisagree(context),
          actions: assign({
            name: "",
            day: "",
            time: "",
            isWholeDay: false,
            lastResult: null,
            interpretation: null,
          }),
        },
        { target: "ErrorConfirmation" },
      ],
    },

    ErrorConfirmation: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Sorry, I didn't understand. Please say yes or no." },
      },
      on: { SPEAK_COMPLETE: "Confirm" },
    },

    AppointmentCreated: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Your appointment has been created!" },
      },
      on: { SPEAK_COMPLETE: "Done" },
    },

    Done: {
      on: { CLICK: "GetIntent" },
    },
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
    )[0] || { view: undefined };
    element.innerHTML = `${meta.view}`;
  });
}
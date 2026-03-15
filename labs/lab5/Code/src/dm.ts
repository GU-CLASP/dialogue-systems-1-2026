import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: "https://germanywestcentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://language-resource-leila.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "appointment",
};


const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
  azureRegion: "germanywestcentral",
};

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
        value: { nlu: true } /** Local activation of NLU */,
      }),
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QBECyA6ACgJzABwENcBiAQQGUAlAFWvIH1KBRU5ATQG0AGAXUVDwB7WAEsALiMEA7fiAAeiAExcu6AJwBWAMwBGRRoA0IAJ6IdXACzoNAXxtG06AOoFx1QeTFExxAMIAZAElfAGluPiQQIVEJaVkFBA1FI1NEgA4NdAsuADZ9OwcMAHFcMAkpKGIg8momADl6XwB5VEx-Jlrw2WjxSRlIhJ09RXQAdhyNPMMTRA01UfVc-PsQRxKwMpEKqsCa+saWto6mDh0IgWFeuIGzNVUuUbS9adSNUZG7qYLV4tLyqCw2EEAFs8D5yJgWCEDq12p1eN1LrF+qAEqMuCMMVoLFpRi9EDlHlklrYVms-lsAXVBIEpHgAK7gyGkaHNWHHLqRHrI+KIdGYxTY3H4xLvRZfMm-Db-dCkWAAa2IzGaRTquyYyE5FxifV5CDUynQih0aTxKVm2nU2me33J0spsoVZCo9DqTUCdUwAFVqFqokjdTd9TocugtMpdPpzQgLG9rLaML4ABZgADG8pKBGBwKIxAhUJhR3h539OuuqIJyRmCCGgvQEwlhXQyGkYD8QVCfu5gYrNY0mQeTyj1YyOnQOkmyxWUkEEDgsjQiLLKPkiAAtDloxuE4D8EQwEuriuEhYq6knvHJc5XGJ3J5vIeeUGtBfFKeTWbq+ZSU31psKo+ParjWp7oIOzzRriXA7n+Mo4CCYKAeWwEaFwaTqDkpoihMmTZI2PzoLBDrUrSDJiEhx6zGhGFYdGGgWGo4rLL+FIVI68oUXqdxaPWXATlM0Y4cS+GOMmaYZtgWY5tgnFBjoFg6DxGj8cOryjFYnzMQRLZSAeXIBshCSKDkSmPBBX56IxoxaJoaRaPZDn2XYdhAA */
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    last_answer: null,
    booked_person: null,
    booked_day: null,
    booked_time: null,
    interpretation: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "WaitForHi" },
    },
    WaitForHi: {
      initial: "Ask",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Start_booking",
            guard: ({ context }) => !!context.last_answer && (context.last_answer.topIntent === "greeting" || context.last_answer.topIntent === "create a meeting"),
          },
          {
            target: "WhoIsX",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "who is X" && context.last_answer.entities.length > 0,
          },
          {
            target: ".UnknownX",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "who is X",
          },
          {
            target: ".InvalidInput",
            guard: ({ context }) => !!context.last_answer,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }) => console.log("RECOGNISED event:", event),
                assign(({ event }) => {                  
                  return { last_answer: event.nluValue };
                }),
              ],
            },
            ASR_NOINPUT: {
              actions: assign({ last_answer: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: {utterance: `Your answer wasn't what I expected. Try again.`},
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        UnknownX: {
          entry: {
            type: "spst.speak",
            params: { utterance: `You just asked about a celebrity I don't know! Try again.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    WhoIsX: {
      entry: {
        type: "spst.speak", params: ({ context }) => ({ utterance: `${context.last_answer!.entities[0].text} is a famous celebrity.`, }),
      },
      on: {
        CLICK: "WaitForHi",
      },
    },
    Start_booking: {
      initial: "Prompt",
      on: {
        SPEAK_COMPLETE: "Query_who",
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Let's create an appointment.` } },
        },
      },
    },
    Query_who: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Query_day",
            guard: ({ context }) => !!context.booked_person && context.booked_person.topIntent === "Invitee" && context.booked_person.entities.length > 0,
          },
          {
            target: ".Unknown",
            guard: ({ context }) => !!context.booked_person && context.booked_person.topIntent === "Invitee",
          },
          {
            target: ".InvalidInput",
            guard: ({ context }) => !!context.booked_person,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Who are you meeting with?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you! Who are you meeting with?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }) => console.log("RECOGNISED event:", event),
                assign(({ event }) => {return { booked_person: event.nluValue };
              })],
            },
            ASR_NOINPUT: {
              actions: assign({ booked_person: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: {utterance: `That wasn't what I asked. Who are you meeting with?`},
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Unknown: {
          entry: {
            type: "spst.speak",
            params: { utterance: `You just mentioned about an invitee that I don't know! Try again.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    Query_day: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Query_whole",
            guard: ({ context }) => !!context.booked_day && context.booked_day.topIntent === "Day" && context.booked_day.entities.length > 0,
          },
          {
            target: ".Unknown",
            guard: ({ context }) => !!context.booked_day && context.booked_day.topIntent === "Day",
          },
          {
            target: ".InvalidInput",
            guard: ({ context }) => !!context.booked_day,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `On which day is your meeting?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you! On which day is your meeting?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }) => console.log("RECOGNISED event:", event),
                assign(({ event }) => {
                  return { booked_day: event.nluValue };
                })
              ],
            },
            ASR_NOINPUT: {
              actions: assign({ booked_day: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: {utterance: `That wasn't what I asked. On which day is your meeting?`,},
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Unknown: {
          entry: {
            type: "spst.speak",
            params: { utterance: `You just mentioned about a day that I don't know! Try again.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        }
      },
    },
    Query_whole: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Confirm_day",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "YesNo" && context.last_answer.entities.length > 0 && context.last_answer.entities[0].category === "Yes",
          },
          {
            target: "Query_time",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "YesNo" && context.last_answer.entities.length > 0 && context.last_answer.entities[0].category === "No",
          },
          {
            target: ".InvalidInput",
            guard: ({ context }) => !!context.last_answer,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Will it take the whole day?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you! Will it take the whole day?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }) => console.log("RECOGNISED event:", event),
                assign(({ event }) => {return { last_answer: event.nluValue};})
              ],
            },
            ASR_NOINPUT: {
              actions: assign({ last_answer: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: {utterance: `I expect a yes or no. Will it take the whole day?`,},
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    Query_time: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Confirm_time",
            guard: ({ context }) => !!context.booked_time && context.booked_time.topIntent === "Time" && context.booked_time.entities.length > 0,
          },
          {
            target: ".Unknown",
            guard: ({ context }) => !!context.booked_time && context.booked_time.topIntent === "Time",
          },
          {
            target: ".InvalidInput",
            guard: ({ context }) => !!context.booked_time,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `What time is your meeting?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you! What time is your meeting?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }) => console.log("RECOGNISED event:", event),
                assign(({ event }) => {
                  return { booked_time: event.nluValue };
                }),
              ],
            },
            ASR_NOINPUT: {
              actions: assign({ booked_time: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: {utterance: `That wasn't what I asked. What time is your meeting?`},
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Unknown: {
          entry: {
            type: "spst.speak",
            params: { utterance: `You just mentioned about a time that I don't know! Try again.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        }
      },
    },
    Confirm_time: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Done",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "YesNo" && context.last_answer.entities.length > 0 && context.last_answer.entities[0].category === "Yes",
          },
          {
            target: "Query_who",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "YesNo" && context.last_answer.entities.length > 0 && context.last_answer.entities[0].category === "No",
          },
          {
            target: ".InvalidInput",
            guard: ({ context }) => !!context.last_answer,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Do you want me to create an appointment with ${context.booked_person.entities![0].category} on ${context.booked_day.entities![0].category} at ${context.booked_time.entities![0].category}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `I can't hear you! Do you want me to create an appointment with ${context.booked_person.entities![0].category} on ${context.booked_day.entities![0].category} at ${context.booked_time.entities![0].category}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }) => console.log("RECOGNISED event:", event),
                assign(({ event }) => {return { last_answer: event.nluValue };}),
              ]
            },
            ASR_NOINPUT: {
              actions: assign({ last_answer: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `I expect a yes or no. Do you want me to create an appointment with ${context.booked_person.entities![0].category} on ${context.booked_day.entities![0].category} at ${context.booked_time.entities![0].category}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    Confirm_day: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Done",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "YesNo" && context.last_answer.entities.length > 0 && context.last_answer.entities[0].category === "Yes",
          },
          {
            target: "Query_who",
            guard: ({ context }) => !!context.last_answer && context.last_answer.topIntent === "YesNo" && context.last_answer.entities.length > 0 && context.last_answer.entities[0].category === "No",
          },
          {
            target: ".InvalidInput",
            guard: ({ context }) => !!context.last_answer,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Do you want me to create an appointment with ${context.booked_person.entities![0].category} on ${context.booked_day.entities![0].category} for the whole day?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `I can't hear you! Do you want me to create an appointment with ${context.booked_person.entities![0].category} on ${context.booked_day.entities![0].category} for the whole day?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }) => console.log("RECOGNISED event:", event),
                assign(({ event }) => {return { last_answer: event.value };}),
              ]
            },
            ASR_NOINPUT: {
              actions: assign({ last_answer: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `I expect a yes or no. Do you want me to create an appointment with ${context.booked_person.entities![0].category} on ${context.booked_day.entities![0].category} for the whole day?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    Done: {
      entry: {
        type: "spst.speak", params: { utterance: `Your appointment has been created!.`, },
      },
      on: {
        CLICK: "WaitForHi",
      },
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
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}

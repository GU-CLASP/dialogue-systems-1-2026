import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://germanywestcentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "germanywestcentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  answer?: string;
  greeting?: string;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  "8": { time: "08:00" },
  "9": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  yes: { answer: "yes" },
  no: { answer: "no" },
  "of course": { answer: "yes" },
  "no way": { answer: "no" },
  "oh yeah": { answer: "yes" },
  "not at all": { answer: "no" },
  "nah": { answer: "no" },
  "yep": { answer: "yes" },
  "nope": { answer: "no" },
  "sure": { answer: "yes" },
  "hi": { greeting: "hi" },
  "hello": { greeting: "hi" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getDay(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).day;
}

function getTime(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).time;
}

function getAnswer(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).answer;
}

function getGreeting(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).greeting;
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
  /** @xstate-layout N4IgpgJg5mDOIC5QBECyA6ACgJzABwENcBiAQQGUAlAFWvIH1KBRU5ATQG0AGAXUVDwB7WAEsALiMEA7fiAAeiAExcu6AJwBWAMwBGRRoA0IAJ6IdXACzoNAXxtG06AOoFx1QeTFExxAMIAZAElfAGluPiQQIVEJaVkFBA1FI1NEgA4NdAsuADZ9OwcMAHFcMAkpKGIg8momADl6XwB5VEx-Jlrw2WjxSRlIhJ09RXQAdhyNPMMTRA01UfVc-PsQRxKwMpEKqsCa+saWto6mDh0IgWFeuIGzNVUuUbS9adSNUZG7qYLV4tLyqCw2EEAFs8D5yJgWCEDq12p1eN1LrF+qAEqMuCMMVoLFpRi9EDlHlklrYVms-lsAXVBIEpHgAK7gyGkaHNWHHLqRHrI+KIdGYxTY3H4xLvRZfMm-Db-dCkWAAa2IzGaRTquyYyE5FxifV5CDUynQih0aTxKVm2nU2me33J0spsoVZCo9DqTUCdUwAFVqFqokjdTd9TocugtMpdPpzQgLG9rLaML4ABZgADG8pKBGBwKIxAhUJhR3h539OuuqIJyRmCCGgvQEwlhXQyGkYD8QVCfu5gYrNY0mQeTyj1YyOnQOkmyxWUkEEDgsjQiLLKPkiAAtDloxuE4D8EQwEuriuEhYq6knvHJc5XGJ3J5vIeeUGtBfFKeTWbq+ZSU31psKo+ParjWp7oIOzzRriXA7n+Mo4CCYKAeWwEaFwaTqDkpoihMmTZI2PzoLBDrUrSDJiEhx6zGhGFYdGGgWGo4rLL+FIVI68oUXqdxaPWXATlM0Y4cS+GOMmaYZtgWY5tgnFBjoFg6DxGj8cOryjFYnzMQRLZSAeXIBshCSKDkSmPBBX56IxoxaJoaRaPZDn2XYdhAA */
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    last_answer: null,
    booked_person: null,
    booked_day: null,
    booked_time: null,
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
            guard: ({ context }) => !!context.last_answer && isInGrammar(context.last_answer![0].utterance) && getGreeting(context.last_answer![0].utterance) !== undefined,
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
              actions: assign(({ event }) => {
                return { last_answer: event.value };
              }),
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
              utterance: `You just said: ${context.last_answer![0].utterance}, but I am waiting for a greeting. Please say hi or hello to start!`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
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
            guard: ({ context }) => !!context.booked_person && isInGrammar(context.booked_person![0].utterance) && getPerson(context.booked_person![0].utterance) !== undefined,
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
              actions: assign(({ event }) => {
                return { booked_person: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ booked_person: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `You just said: ${context.booked_person![0].utterance}, but this name is not in the list. Who are you meeting with?`,
            }),
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
            guard: ({ context }) => !!context.booked_day && isInGrammar(context.booked_day![0].utterance) && getDay(context.booked_day![0].utterance) !== undefined,
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
              actions: assign(({ event }) => {
                return { booked_day: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ booked_day: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `You just said: ${context.booked_day![0].utterance}, but this day is not in the list. On which day is your meeting?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    Query_whole: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Confirm_day",
            guard: ({ context }) => !!context.last_answer && isInGrammar(context.last_answer![0].utterance) && getAnswer(context.last_answer![0].utterance) == "yes",
          },
          {
            target: "Query_time",
            guard: ({ context }) => !!context.last_answer && isInGrammar(context.last_answer![0].utterance) && getAnswer(context.last_answer![0].utterance) == "no",
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
              actions: assign(({ event }) => {
                return { last_answer: event.value };
              }),
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
              utterance: `You just said: ${context.last_answer![0].utterance}, but I expect a yes or no. Will it take the whole day?`,
            }),
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
            guard: ({ context }) => !!context.booked_time && isInGrammar(context.booked_time![0].utterance) && getTime(context.booked_time![0].utterance) !== undefined,
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
              actions: assign(({ event }) => {
                return { booked_time: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ booked_time: null }),
            },
          },
        },
        InvalidInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `You just said: ${context.booked_time![0].utterance}, but this time is not in the list. What time is your meeting?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    Confirm_time: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Done",
            guard: ({ context }) => !!context.last_answer && isInGrammar(context.last_answer![0].utterance) && getAnswer(context.last_answer![0].utterance) == "yes",
          },
          {
            target: "Query_who",
            guard: ({ context }) => !!context.last_answer && isInGrammar(context.last_answer![0].utterance) && getAnswer(context.last_answer![0].utterance) == "no",
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
              utterance: `Do you want me to create an appointment with ${context.booked_person![0].utterance} on ${context.booked_day![0].utterance} at ${context.booked_time![0].utterance}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `I can't hear you! Do you want me to create an appointment with ${context.booked_person![0].utterance} on ${context.booked_day![0].utterance} at ${context.booked_time![0].utterance}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { last_answer: event.value };
              }),
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
              utterance: `You just said: ${context.last_answer![0].utterance}, but I expect a yes or no. Do you want me to create an appointment with ${context.booked_person![0].utterance} on ${context.booked_day![0].utterance} at ${context.booked_time![0].utterance}?`,
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
            guard: ({ context }) => !!context.last_answer && isInGrammar(context.last_answer![0].utterance) && getAnswer(context.last_answer![0].utterance) == "yes",
          },
          {
            target: "Query_who",
            guard: ({ context }) => !!context.last_answer && isInGrammar(context.last_answer![0].utterance) && getAnswer(context.last_answer![0].utterance) == "no",
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
              utterance: `Do you want me to create an appointment with ${context.booked_person![0].utterance} on ${context.booked_day![0].utterance} for the whole day?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `I can't hear you! Do you want me to create an appointment with ${context.booked_person![0].utterance} on ${context.booked_day![0].utterance} for the whole day?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { last_answer: event.value };
              }),
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
              utterance: `You just said: ${context.last_answer![0].utterance}, but I expect a yes or no. Do you want me to create an appointment with ${context.booked_person![0].utterance} on ${context.booked_day![0].utterance} for the whole day?`,
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

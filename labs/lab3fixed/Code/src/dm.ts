import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://norwayeast.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "norwayeast",
  asrDefaultCompleteTimeout: 1000,
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
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "1": { time: "13:00" },
  "2": { time: "14:00" },
  "3": { time: "15:00" },
  "4": { time: "16:00" },
  "5": { time: "17:00" },
  "6": { time: "18:00" },
  yes: { answer: true },
  yep: { answer: true },
  yeah: { answer: true },
  sure: { answer: true },
  definitely: { answer: true },
  "of course": { answer: true },
  no: { answer: false },
  nah: { answer: false },
  nope: { answer: false },
  "no way": { answer: false }
};

function getUtterance(context: DMContext) {
  return context.lastResult?.[0]?.utterance.toLowerCase() ?? ""; 
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

const resetAppointment = {
  lastResult: null,
  person: null,
  day: null,
  wholeDay: null,
  time: null,
  answer: null,
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
        value: {}
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    person: null,
    day: null,
    wholeDay: null, 
    time: null,
    answer: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { 
        CLICK: {
          target: "AskPersonPrompt",
          actions: assign(resetAppointment),
        },
      },
    },
    AskPersonPrompt: {
      entry: {
        type: "spst.speak",
        params: { 
          utterance: "Let's create an appointment. Who are you meeting with?",
        },
      },
      on: { SPEAK_COMPLETE: "AskPersonListen" },
    },
    AskPersonListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({ 
            lastResult: event.value, 
          })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null}),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => !!getPerson(getUtterance(context)),
            target: "AskDayPrompt",
            actions: assign(({ context }) => ({
              person: getPerson(getUtterance(context)) ?? null,
            })),
          },
          { target: "AskPersonRetry" },
        ],
      },
    },

    AskPersonRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "Sorry. I did not get the name. Who are you meeting with?",
        },
      },
      on: { SPEAK_COMPLETE: "AskPersonListen"},
    },
    AskDayPrompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "On which day is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "AskDayListen" },
    },
    AskDayListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value, 
          })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => !!getDay(getUtterance(context)),
            target: "AskWholeDayPrompt",
            actions: assign(({ context }) => ({
              day: getDay(getUtterance(context)) ?? null
            })),
          },
          { target: "AskDayRetry" },
        ],
      },
    },
    AskDayRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: 
            "Sorry. I did not get the day. Could you please repeat?"
        },
      },
      on: { SPEAK_COMPLETE: "AskDayListen" },
    },
    
    AskWholeDayPrompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Will it take the whole day?" },
      },
      on: { SPEAK_COMPLETE: "AskWholeDayListen" },
    },
    AskWholeDayListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE : [
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === true,
            target: "ConfirmWholeDay",
            actions: assign({ wholeDay: true}),
          },
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === false,
            target: "AskTimePrompt",
            actions: assign({ wholeDay: false}),
          },
          { target: "AskWholeDayRetry" },
        ],
      },
    },
    AskWholeDayRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Will it take the whole day?",         
        },
      },
      on: { SPEAK_COMPLETE: "AskWholeDayListen" },
    },    
    
    AskTimePrompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "What time is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "AskTimeListen" },
    },
    AskTimeListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => !!getTime(getUtterance(context)),
            target: "ConfirmTime",
            actions: assign(({ context }) => ({
              time: getTime(getUtterance(context)) ?? null,
            })),
          },
          { target: "AskTimeRetry" },
        ],
      },
    },
    AskTimeRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
          "Sorry I did not get the time. Could you please repeat?",
        },
      },
      on: { SPEAK_COMPLETE: "AskTimeListen" },
    },

    ConfirmTime: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.time}?`,
        }),
      },
      on: { SPEAK_COMPLETE: "ConfirmTimeListen"},
    },
    ConfirmTimeListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === true,
            target: "Booked",
            actions: assign({ answer: true }),
          },
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === false,
            target: "AskPersonPrompt",
            actions: assign(resetAppointment),
          },
          { target: "ConfirmTimeRetry" },
        ],
      },
    },
    ConfirmTimeRetry: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Please answer yes or no." },
      },
      on: { SPEAK_COMPLETE: "ConfirmTimeListen" },
    },
    ConfirmWholeDay: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`,
        }),
      },
      on: { SPEAK_COMPLETE: "ConfirmWholeDayListen" },
    },
    ConfirmWholeDayListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null}),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === true,
            target: "Booked",
            actions: assign({ answer: true}),
          },
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === false,
            target: "AskPersonPrompt",
            actions: assign(resetAppointment),
          },
          { target: "ConfirmWholeDayRetry" },
        ],
      },
    },
    ConfirmWholeDayRetry: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Could you please answer with a yes or a no?" },
      },
      on: { SPEAK_COMPLETE: "ConfirmWholeDayListen" },
    },
      
    Booked: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Your appointment has been created!" },
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: {
      on: {
        CLICK: {
          target: "AskPersonPrompt",
          actions: assign(resetAppointment),
        },
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

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
  help?:string;
  wholeDay?:string;
  
}

const grammar: { [index: string]: GrammarEntry } = {
  
  appointment: { help: "create appointment" },
  meeting: { help: "create appointment" },
  
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  ann: {person : "Ann David"},
  john: {person : "John Jacob"},
  
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday:{ day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday:   { day: "Friday" },
  saturday: { day: "Saturday" },
  
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  "17": { time: "17:00" },
  "18": { time: "18:00" },
  
  yes: {wholeDay : "Yes"},
  ya: {wholeDay : "Yes"},
  yep: {wholeDay : "Yes"},
  sure: {wholeDay : "Yes"},
  "of course": {wholeDay : "Yes"},
  "ya sure": {wholeDay : "Yes"},
  "okay sure": {wholeDay : "Yes"},
  no : {wholeDay : "No"},
  nope : {wholeDay : "No"},
  nah : {wholeDay : "No"},
  "no way" : {wholeDay : "No"},
  "no guess no": {wholeDay : "No"},
  "maybe not": {wholeDay : "No"},
  

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

function getwholeDay(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).wholeDay;
}

function isYes(utterance: string) {
  const yesWords = ["yes", "yeah", "yep", "sure", "of course","ya sure","okay sure"];
  return yesWords.includes(utterance.toLowerCase());
}

function isNo(utterance: string) {
  const noWords = ["no", "nope", "nah", "no way","no guess no","maybe not"];
  return noWords.includes(utterance.toLowerCase());
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
    lastResult: null,
    person:undefined,
  day:undefined,
  wholeDay : undefined,
  time:undefined
  
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "AskHelp" },
    },
    //AskHelp
    
    AskHelp: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarForHelp",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello. How can I help you?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `Sorry.I can't hear you!Can you repeat?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
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
    CheckGrammarForHelp: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `You just said you wanna help with ${context.lastResult![0].utterance}. And  ${
            isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
          } possible.`,
        }),
      },
      on: { SPEAK_COMPLETE: "AskPerson" },
    },
    
    //AskPerson
    
    AskPerson: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarForPerson",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Who do you want to meet with?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `Sorry.I can't hear you!Can you repeat with whom to schedule your meeting with?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                const utterance = event.value[0].utterance;
                return { 
                  lastResult: event.value,
                  person: getPerson(utterance) 
                };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    
    CheckGrammarForPerson: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
            isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
          } possible`,
        }),
      },
      on: { SPEAK_COMPLETE: "AskDay" },
    },
    
    //AskDay
    AskDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarForDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `On which day do you want to schedule the meeting?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `Sorry.I can't hear you!Can you repeat which day you wanna meet?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                const utterance = event.value[0].utterance;
                return { 
                  lastResult: event.value,
                  day: getDay(utterance) 
                };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    
    CheckGrammarForDay: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `You just said you wanna meet on ${context.lastResult![0].utterance}. And the day ${
            isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
          } available.`,
        }),
      },
      on: { SPEAK_COMPLETE: "AskWholeDay" },
    },
    
    //AskWholeDay
    
    AskWholeDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Confirm",
            guard: ({ context }) => {
              if (!context.lastResult) return false;
              const utterance = context.lastResult[0].utterance;
              return isYes(utterance);
            },
          },
          {
            target: "AskTime",
            guard: ({ context }) => {
              if (!context.lastResult) return false;
              const utterance = context.lastResult[0].utterance;
              return isNo(utterance);
            },
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
            params: { utterance: `Sorry.Can you repeat with yes or no?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                const utterance = event.value[0].utterance;
                return { 
                  lastResult: event.value,
                  wholeDay: utterance  
                };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    
    
    
    //AskTime
    AskTime: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarForTime",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `If not whole day,on what time do you want to meet?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `Sorry.I can't hear you!Can you repeat the time again?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                const utterance = event.value[0].utterance;
                return { 
                  lastResult: event.value,
                  time: getTime(utterance)  
                };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    
    CheckGrammarForTime: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `You just said you wanna meet at ${context.lastResult![0].utterance}. And that time ${
            isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
          } available.`,
        }),
      },
      on: { SPEAK_COMPLETE: "Confirm" },
    },
    
    
//Confirm
Confirm: {
  initial: "Prompt",
  on: {
    LISTEN_COMPLETE: [
      {
        target: "Done",
        guard: ({ context }) => {
          if (!context.lastResult) return false;
          const utterance = context.lastResult[0].utterance;
          return isYes(utterance);
        },
      },
      {
        target: "AskHelp",
        guard: ({ context }) => {
          if (!context.lastResult) return false;
          const utterance = context.lastResult[0].utterance;
          return isNo(utterance);
        },
      },
      { target: ".NoInput" },
    ],
  },
  states: {
    Prompt: {
      entry: { 
        type: "spst.speak", 
        params: ({ context }) => ({
          utterance: context.wholeDay?.toLowerCase() === "yes"
            ? `Do you want to create an appointment with ${context.person} on ${context.day} for the whole day?`
            : `Do you want to create an appointment with ${context.person} on ${context.day} at ${context.time}?`
        }),
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },
    NoInput: {
      entry: {
        type: "spst.speak",
        params: { utterance: `Sorry. I didn't hear you. Should I create this appointment?` },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },
    Ask: {
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
    
Done: {
  entry: {
    type: "spst.speak",
    params: { utterance: "Your appointment has been created!" },
  },
  on: {
    SPEAK_COMPLETE: "WaitToStart",
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
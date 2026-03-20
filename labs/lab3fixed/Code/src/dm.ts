import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://francecentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "francecentral",
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
  //people
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },

  //days
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },

//times
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  "17": { time: "17:00" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getTime(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).time;
}

function isYes(utterance: string) {
  const u = utterance.trim().toLowerCase();
  return (
    u === "yes" ||
    u === "yeah" ||
    u === "yep" ||
    u === "ok" ||
    u === "okay" ||
    u === "sure" ||
    u.includes("of course") ||
    u.includes("absolutely")
  );
}

function isNo(utterance: string) {
  const u = utterance.trim().toLowerCase();
  return (
    u === "no" ||
    u === "nope" ||
    u === "nah" ||
    u.includes("no way") ||
    u.includes("absolutely not")
  );
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
    meetingWith: undefined,
    date: undefined,
    wholeDay: undefined,
    time: undefined,
  }),

  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Greeting" },
    },

    Greeting: {
  initial: "Prompt",
  on: {
    LISTEN_COMPLETE: [
      {
        target: "CheckGrammar",
        guard: ({ context }) => !!context.lastResult,
      },
      { target: ".NoInput" },
    ],
    ASR_NOINPUT: {
      target: ".NoInput",
      actions: assign({ lastResult: null }),
    },
  },
  states: {
    Prompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: `Hi, let's create an appointment.` },
      },
      on: { SPEAK_COMPLETE: "#DM.AskPerson" },
    },

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
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
      },
    },
  },
},


AskPerson: {
  initial: "Prompt",
  on: {
    LISTEN_COMPLETE: [
      { target: "#DM.AskDay", guard: ({ context }) => !!context.meetingWith },
      { target: ".NotRecognised", guard: ({ context }) => !!context.lastResult },
      { target: ".NoInput" },
    ],
    ASR_NOINPUT: {
      target: ".NoInput",
      actions: assign({ lastResult: null }),
    },
  },
  states: {
    Prompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Who are you meeting with?" },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NoInput: {
      entry: {
        type: "spst.speak",
        params: { utterance: "I can't hear you. Who are you meeting with?" },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NotRecognised: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "I didn't recognise the person you are meeting with. Try Vladislav, Bora, Talha or Tom.",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    Ask: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            const utt = event.value?.[0]?.utterance ?? "";
            const person = getPerson(utt);
            return {
              lastResult: event.value,
              meetingWith: person,
            };
          }),
        },
      },
    },
  },
},



AskDay: {
  initial: "Prompt",
  on: {
    LISTEN_COMPLETE: [
      { target: "AskWholeDay", guard: ({ context }) => !!context.date },
      { target: ".NotRecognised", guard: ({ context }) => !!context.lastResult },
      { target: ".NoInput" },
    ],
    ASR_NOINPUT: {
      target: ".NoInput",
      actions: assign({ lastResult: null }),
    },
  },

  states: {
    Prompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Perfect, on which day is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NoInput: {
      entry: {
        type: "spst.speak",
        params: { utterance: "I can't hear you. On which day is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NotRecognised: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I heard you, but I didn't recognize the day. Try Monday, Tuesday, Wednesday, Thursday, or Friday.",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    Ask: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }: any) => {
            const utt = event.value?.[0]?.utterance ?? "";
            const key = utt.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            const day = (grammar[key] || {}).day;

            return {
              lastResult: event.value,
              date: day,
            };
          }),
        },
      },
    },
  },
},


 // aggiunti //
AskWholeDay: {
  initial: "Prompt",

  // ✅ decisione dopo che finisce l’ascolto
  on: {
    LISTEN_COMPLETE: [
      { target: "ConfirmWholeDay", guard: ({ context }) => context.wholeDay === true },
      { target: "AskTime", guard: ({ context }) => context.wholeDay === false },
      { target: ".NotRecognised", guard: ({ context }) => !!context.lastResult },
      { target: ".NoInput" },
    ],
    ASR_NOINPUT: {
      target: ".NoInput",
      actions: assign({ lastResult: null, wholeDay: undefined }),
    },
  },

  states: {
    Prompt: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Will it take the whole day?",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NoInput: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "I can't hear you! Is it going to last the whole day?",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NotRecognised: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "I didn't understand. Please answer yes or no.",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    Ask: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            const utt = event.value?.[0]?.utterance ?? "";

            let wholeDay: boolean | undefined = undefined;
            if (isYes(utt)) wholeDay = true;
            else if (isNo(utt)) wholeDay = false;

            return {
              lastResult: event.value,
              wholeDay, 
            };
          }),
        },
      },
    },
  },
},


AskTime: {
  initial: "Prompt",
  on: {
    LISTEN_COMPLETE: [
      { target: "ConfirmTimed", guard: ({ context }) => !!context.time },
      { target: ".NotRecognised", guard: ({ context }) => !!context.lastResult },
      { target: ".NoInput" },
    ],
    ASR_NOINPUT: {
      target: ".NoInput",
      actions: assign({ lastResult: null, time: undefined }),
    },
  },

  states: {
    Prompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "What time is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NoInput: {
      entry: {
        type: "spst.speak",
        params: { utterance: "I can't hear you. What time is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NotRecognised: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "I didn't recognize the time. Try 10, 11, 12, 13, 14, 15, 16 or 17.",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    Ask: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            const utt = event.value?.[0]?.utterance ?? "";
            const time = getTime(utt);
            return {
              lastResult: event.value,
              time,
            };
          }),
        },
      },
    },
  },
},


ConfirmWholeDay: {
  initial: "Prompt",

  on: {
    LISTEN_COMPLETE: [
      {
        target: "Created",
        guard: ({ context }) => {
          const utt = context.lastResult?.[0]?.utterance ?? "";
          return isYes(utt);
        },
      },
      {
        target: "AskPerson",
        guard: ({ context }) => {
          const utt = context.lastResult?.[0]?.utterance ?? "";
          return isNo(utt);
        },
      },
      { target: ".NotRecognised", guard: ({ context }) => !!context.lastResult },
      { target: ".NoInput" },
    ],
    ASR_NOINPUT: {
      target: ".NoInput",
      actions: assign({ lastResult: null }),
    },
  },

  states: {
    Prompt: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Do you want me to create an appointment with ${context.meetingWith} on ${context.date} for the whole day?`,
        }),
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NoInput: {
      entry: {
        type: "spst.speak",
        params: { utterance: "I can't hear you! Please say yes or no." },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NotRecognised: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "I didn't understand. Please answer yes or no.",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    Ask: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
      },
    },
  },
},


ConfirmTimed: {
  initial: "Prompt",

  on: {
    LISTEN_COMPLETE: [
      {
        target: "Created",
        guard: ({ context }) => {
          const utt = context.lastResult?.[0]?.utterance ?? "";
          return isYes(utt);
        },
      },
      {
        target: "AskPerson",
        guard: ({ context }) => {
          const utt = context.lastResult?.[0]?.utterance ?? "";
          return isNo(utt);
        },
      },
      { target: ".NotRecognised", guard: ({ context }) => !!context.lastResult },
      { target: ".NoInput" },
    ],
    ASR_NOINPUT: {
      target: ".NoInput",
      actions: assign({ lastResult: null }),
    },
  },

  states: {
    Prompt: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Do you want me to create an appointment with ${context.meetingWith} on ${context.date} at ${context.time}?`,
        }),
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NoInput: {
      entry: {
        type: "spst.speak",
        params: { utterance: "I can't hear you! Please say yes or no." },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    NotRecognised: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "I didn't understand. Please answer yes or no.",
        },
      },
      on: { SPEAK_COMPLETE: "Ask" },
    },

    Ask: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
          })),
        },
      },
    },
  },
},


Created: {
  entry: {
    type: "spst.speak",
    params: { utterance: "Your appointment has been created!" },
  },
},

    CheckGrammar: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
            isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
          } in the grammar.`,
        }),
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: {
  entry: assign({
    meetingWith: undefined,
    date: undefined,
    wholeDay: undefined,
    time: undefined,
    lastResult: null,
  }),
  always: "Greeting",
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

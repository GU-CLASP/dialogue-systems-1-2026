import { assign, createActor, setup } from "xstate";
import type { Settings} from "speechstate";
import {speechstate} from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure.ts";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};


 const azureLanguageCredentials = {
  endpoint:"https://clu-gusnobadtest.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "lab_5",
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-gb",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  yesno?: string;
}

const grammar: { [index: string]: GrammarEntry } = { //short grammer list, yes, no and time utterences are covered by a function lower down.
  adam: { person: "Adam" },
  vlad: { person: "Vladislav Maraev"},
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
};



function isInGrammar(utterance: string, field: "person" | "day") {
  const tokens = (utterance ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean);//splits on non-letters

  for (const t of tokens) {
    const hit = grammar[t]; //looks through what the user said and determines if any of the words are in the grammer.
                            //it gets kinda messy if you mention multiple things in the grammer at once, but it works okay
    if (hit && hit[field]) return hit[field];
  }
  return null;
}

//the three getx functions below are no longer in use
//the two function below just dictate what field isInGrammer should use, a switch statment could also work. but these two function are just resued from earlier code
function getPerson(utterance: string) {
  return isInGrammar(utterance, "person");
}

function getDay(utterance: string) {
  return isInGrammar(utterance, "day");
}



function getTime(utterance: string) { //gets the time the user said and transforms it into am or pm
  utterance = (utterance || "").toLowerCase();

  //please note that the regex this code uses was made with the help of chatgpt as regex is very confusing

  // grab first time-like thing: "15:30", "3pm", "3:30 pm", "3"
  const m = utterance.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;


  //splits what the user said into 3 diffrent variabales
  let hour = +m[1]; //hour
  const min = m[2] || "00"; //min
  let ampm = m[3]; //am or pm time

//format converter, convers 0:00 to 12 am and any number above 12 is changed to pm form
if (hour === 0) {
  hour = 12;
} 
else if (hour > 12) {
  hour = hour - 12;
}

if (!ampm) { //user may or may not mention am or pm, the user could also say 3 o clock which this code dosent cover
  if (hour < 12) {
    ampm = "am";
  } 
  else {
    ampm = "pm";
  }
}

return hour + ":" + min + " " + ampm; //combineds all the variables into a single string
}


//the model had some issues with yes and no so i keept it hardcoded for now
function yesNo(utterance: string): boolean | null { //yes and no grammer function
  utterance = (utterance ?? "").toLowerCase();
  if (utterance.includes("yes") || utterance.includes("yeah") || utterance.includes("yea") || utterance.includes("yep") || utterance.includes("yas") || utterance.includes("ja")) return true;
  if (utterance.includes("no") || utterance.includes("nope") || utterance.includes("nah") || utterance.includes("oh") || utterance.includes("don't") || utterance.includes("do not")) return false;
  return null;
}

function setSlot(slot: string, parse: (u: string) => any) { //saves what the user said into person, day etc so we can use it again later
  return ({ event }: any) => {
    const utterance = event.value?.[0]?.utterance || "";
    const value = parse(utterance) ?? null;

    return value !== null
      ? ({ lastResult: event.value, [slot]: value } as any)
      : ({ lastResult: null, [slot]: null } as any);
  };
}

function getLookOrMeet(event: any) { //decide if look up or meeting
  const intent = event.nluValue?.topIntent;

  if (intent === "create_meeting") return true;
  if (intent === "who_is") return false;
  //  if (intent === "getPerson") return false;

  return null;
}

function setSlotFromEvent(slot: string, parse: (event: any) => any) { //saves what the user said into person, day etc so we can use it again later
  return ({ event }: any) => {
    const value = parse(event) ?? null;

    return value !== null
      ? ({ lastResult: event.value, [slot]: value } as any)
      : ({ lastResult: null, [slot]: null } as any);
  };
}


function getEntityText(event: any, category: string) {//gets all entities form the model
  const entities = event.nluValue?.entities ?? [];
  const hit = entities.find((e: any) => e.category === category); //get the first enity that matches the request
  return hit?.text ?? null;
}

function setSlotFromEntity(slot: string, category: string) { //get text from RECOGNISED 
  return ({ event }: any) => {
    const value = getEntityText(event, category); //get entity from RECOGNISED text

    return value !== null
      ? ({ lastResult: event.value, [slot]: value } as any)
      : ({ lastResult: null, [slot]: null } as any);
  };
}


const famousPeople: Record<string, string> = { //some look up people
  "Taylor Swift": "Taylor Swift is a singer.",
  "Albert Einstein": "Albert Einstein was a physicist.",
  "Barack Obama": "Barack Obama was the president of the United States.",
  "Tom Cruise": "Tom Cruise is an American actor.",
  "Adam": "Adam is a university student",
  "Tom Södahl Bladsjö": "Tom Södahl Bladsjö is a university teacher",
  "Vladislav Maraev": "Vladislav Maraev is a university teacher",
  "Bora Kara": "Bora Kara is a university teacher",
  "Talha Bedir": "Talha Bedir is a university teacher",
};

const dmMachine = setup({
  types: {
    /** you might need to extend these */
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    /** define your actions here */
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
        value: { nlu: true }
      }),
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QBECyA6ACgJzABwENcBiAQQGUAlAFWvIH1KBRU5ATQG0AGAXUVDwB7WAEsALiMEA7fiAAeiAIwAmLgA50ANgAsargGZlAVk1GA7ObUAaEAE8lytcvRqVJi-sX6jiowF8-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-Q0d-Y-ddjHhrMbLKx31CBdDAQJlXPdXHNmPVFk1ddegC3IJFGcdo6sOO8xUBiNOpJiFivowagqQ9NGjz9Byi4ycOEUY9N+IztH12hg9BDCwrx7iBkxFKbT+NdPcYM4oJzAnJYuYeG7Dz5JOgBN8y7SkgDZN6C48UsBEDlMmcnKoRU6Atzge-F6DEso-OayhoFi6wWtlOIMXRpJgGHjyh3BfS40jiK7gcgMnZlTL21dyj8yT3gmO0jE9M7JZIQLGCs+oIGlWSnVYqWIBtvXMaFgaIJETw2hpsaUB0rpeCTDSkJp1oZi3EN1dpTiNTHwMVaYVeNvJU2cSuFeYCFz7WIaYhEpifYjhx7tK4eC9cQMvWmB4auuFLmU1CUDKrS7v4fT-ZqEcCFhKLP0QCEAA */
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    person: null,
    day: null,
    time: null,
    wholeday: null,
    complete: null,
    interpretation: null,
    lookormeet: null,
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
    Greeting:{
      initial: "Prompt",
      //entry: { type: "spst.speak", params: { utterance: `Hi, would you like to create an appointment or look someone up?` } },
      on: {
        LISTEN_COMPLETE: [
          {target: "Meeting", guard: ({ context }) => context.lookormeet === true }, 
          {target: "Lookup", guard: ({ context }) => context.lookormeet === false },
          {target: ".NoInput" },
        ]
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hi, would you like to create an appointment or look someone up?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `Hi, would you like to create an appointment or look someone up?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: [
                ({ event }: any) => console.log("NLU:", event.nluValue),
                assign(setSlotFromEvent("lookormeet", getLookOrMeet)),
              ],
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
          
        },
      },
    },

    Lookup: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "PersonLookup",
            guard: ({ context }) => context.person !== null,
          },
          { target: ".NoInput" },
        ]
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Who do you want to look up?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
             params: { utterance: `Who do you want to look up?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: { actions: [
                ({ event }: any) => console.log("NLU:", event.nluValue),
                assign(setSlotFromEntity("person", "person")),
              ], },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
          
        },
      },
    },

    PersonLookup: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: famousPeople[context.person ?? ""] ?? `I do not know much about ${context.person}.`,
        }),
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Meeting: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Day",
            guard: ({ context }) => context.person !== null,
          },
          { target: ".NoInput" },
        ]
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Who are you meeting with?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
             params: { utterance: `Who are you meeting with?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: { actions: [
                ({ event }: any) => console.log("NLU:", event.nluValue),
                assign(setSlotFromEntity("person", "person")),
              ], },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
          
        },
      },
    },
    Day: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Whole",
            guard: ({ context }) => context.day !== null,
          },
          { target: ".NoInput" },
        ]
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: ({ context }) => ({utterance: `on which day are you meeting: ${context.person}.`})},
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({utterance: `on which day are you meeting: ${context.person}.`}),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: { actions: assign(setSlotFromEntity("day", "day")) },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
          
        },
      },
    },
    Whole: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {target: "CompAppoint", guard: ({ context }) => context.wholeday === true },
          {target: "Time", guard: ({ context }) => context.wholeday === false },
          {target: ".NoInput" },
        ]
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `will your apointment take the whole day?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `will your apointment take the whole day?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: { actions: assign(setSlot("wholeday", yesNo)) },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
          
        },
      },
    },
    Time: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CompAppoint",
            guard: ({ context }) => context.time !== null,
          },
          { target: ".NoInput" },
        ]
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: ({ context }) => ({utterance: `what time on ${context.day} do you whish to meet: ${context.person}.`})},
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({utterance: `what time on ${context.day} do you whish to meet: ${context.person}.`}),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: { actions: assign(setSlotFromEntity("time", "time")) },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
          
        },
      },
    },
    CompAppoint: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {target: "Fin", guard: ({ context }) => context.complete === true },
          {target: "Meeting", guard: ({ context }) => context.complete === false },
          {target: ".NoInput" },
        ]
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
                utterance: context.wholeday
                ? `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`
                : `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.time}?`,
            }),
          },
        on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
                utterance: context.wholeday
                ? `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`
                : `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.time}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: { actions: assign(setSlot("complete", yesNo)) },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
          
        },
      },
    },
     Fin:{
      entry: { type: "spst.speak", params: { utterance: `Your apointment has been created` } },
      on: { SPEAK_COMPLETE: "Done" },
    },

    Done: {
      on: {
        CLICK: "Greeting",
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

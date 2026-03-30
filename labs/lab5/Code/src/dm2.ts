import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();


  const azureLanguageCredentials = {
    endpoint: "https://lab-gussulthsa.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
    key: NLU_KEY /** reference to your Azure CLU key */,
    deploymentName: "appointment" /** your Azure CLU deployment */,
    projectName: "appointment" /** your Azure CLU project name */,
  };

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 10000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

//Famous people database for "who is X" intent
const famousPeople: { [key: string]: string } = {
  "elon musk": "Elon Musk is a billionaire entrepreneur known for Tesla and SpaceX.",
  "albert einstein": "Albert Einstein was a physicist famous for the theory of relativity.",
  "taylor swift": "Taylor Swift is an American singer-songwriter and pop star.",
  "barack obama": "Barack Obama was the 44th President of the United States.",
  "sharukh khan": "Sharukh Khan is a famous Hollywood Actor.",
  "salman khan": "Salman Khan is a famous Hollywood Actor.",
  "amitabh bachan": "Amitabh Bachan is a  oldest famous Hollywood Actor.",

};

function getPersonInfo(name: string): string {
  const key = name.toLowerCase().trim();
  for ( const k in famousPeople) {
    if (key.includes(k) || k.includes(key)) {
      return famousPeople[k];
    }
  }
  return ` I'm sorry, I dont have information about ${name}.`;
}

function getEntity(entities: any[], category: string): string | undefined {
  const found = entities?.find((e) =>e.category === category);
  return found ? found.text : undefined;
}

function speakAfterDelay(context: DMContext, utterance: string, delay = 1000) {
  setTimeout(() => {
    context.spstRef.send({ type: "SPEAK", value: {utterance }});
  }, delay);
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
        value: { nlu: true }
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    person: undefined,
    day: undefined,
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
      states: {
        Prompt: {
          entry: { 
            type: "spst.speak", 
            params: { utterance: `Hello! Would you like to create a meeting, or ask who someone is?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you! Please say something.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) =>
                  (event as any).nluValue?.topIntent === "book_meeting",
                target: "#DM.AskPerson",
              actions: assign(({ event }): Partial<DMContext> => ({ 
                interpretation: (event as any).nluValue,
              })),
            },
            {
              guard: ({ event }) =>
              (event as any). nluValue?.topIntent === "who_is X",
              target: "#DM.WhoIs",
              actions: assign(({ event }): Partial<DMContext> => ({
                interpretation: (event as any).nluValue,
              })),
            },
            {
              target: "#DM.NotRecognised",
            },
          ],
          ASR_NOINPUT: {
            target: "#DM.Greeting.NoInput",
          },
        },
      },
    },
  },

  //------Who is X PATH
  WhoIs: {
    entry: ({ context }) => {
      speakAfterDelay(context, (() => {
      const entities = (context.interpretation as any)?.entities || [];
      const personEntity = getEntity(entities, "person");
      return personEntity
        ? getPersonInfo(personEntity)
        : "I'm sorry, I didn't catch the name. Who would you like to know about?";
      })());
    },
  on: { SPEAK_COMPLETE: "WhoIsDone"},
},

WhoIsDone: {
  entry:{
    type: "spst.speak",
    params: { utterance: "I hope that was helpful. Goodbye!"},
  },
  on: { SPEAK_COMPLETE: "WaitToStart"},
},

  //-----NOT Recognised ---------------
  NotRecognised: {
    entry: {
      type: "spst.speak",
      params: { utterance: "Sorry, I didn't understand. Please say 'create a meeting' or 'who is someone'."},
    },
    on: { SPEAK_COMPLETE: "Greeting"},
  },
  
  //--------CREATE MEEtING PATH
  AskPerson: {
    entry: ({ context }) => 
        speakAfterDelay(context, "Who would you like to meet?", 500),
        on: { SPEAK_COMPLETE: "ListenPerson"},
    },
    ListenPerson: {
      entry: { type: "spst.listen"},
      on: {
        RECOGNISED: [
          {
            guard: ({ event }) =>
              !!getEntity((event as any).nluValue?.entities || [], "person") ||
              !!(event as any).value?.[0]?.utterance,
            target: "AskDay",
            actions: assign(({ event }): Partial<DMContext> => ({
              person: getEntity((event as any).nluValue?.entities || [], "person")
              ?? ( event as any).value?.[0]?.utterance,
            interpretation: (event as any).nluValue,
          })),
        },
         {target: "NotRecognisedPerson" },
      ],
      ASR_NOINPUT: "AskPerson",
    },
  },
  NotRecognisedPerson: {
    entry: ({ context }) => 
      speakAfterDelay(context, "Sorry, I did not recognise that name.Please try again."),
    on: { SPEAK_COMPLETE: "AskPerson"},
},
  AskDay:{
    entry: ({ context }) => speakAfterDelay(context, "Which day works for you?", 500),
    on: { SPEAK_COMPLETE: "ListenDay"},
},
ListenDay: {
  entry: { type: "spst.listen"},
  on: {
    RECOGNISED: [
      {
        guard: ({ event }) =>
          !!getEntity((event as any).nluValue?.entities || [], "day") ||
          !!(event as any).value?.[0]?.utterance,
        target: "AskTime",
        actions: assign(({ event }): Partial<DMContext> => ({
          day: getEntity((event as any).nluValue?.entities || [], "day")
          ?? ( event as any).value?.[0]?.utterance,
        interpretation: (event as any).nluValue,
        })),
      },
      { target: "NotRecognisedDay"},
      ],
      ASR_NOINPUT: "AskDay",
    },
  },

  NotRecognisedDay: {
    entry: ({ context }) => 
      speakAfterDelay(context, "Sorry, I did not recognise that day. Please try again." ),
    on: { SPEAK_COMPLETE: "AskDay"},
  },
  

  AskTime: {
    entry: ({ context }) => speakAfterDelay( context, "At what time?"),
    on: { SPEAK_COMPLETE: "ListenTime" },
  },

  ListenTime: {
    entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            guard: ({ event }) =>
              !!getEntity((event as any).nluValue?.entities || [],"time") ||
              !!(event as any).value?.[0]?.utterance,
            target: "Confirm",
            actions: assign(({ event }): Partial<DMContext> => ({
              time: getEntity((event as any).nluValue?.entities || [], "time")
              ?? (event as any).value?.[0]?.utterance,
              interpretation: (event as any).nluValue,
            })),
          },
          { target: "NotRecognisedTime" },
        ],
      
        ASR_NOINPUT: "AskTime",
      },
    },

    NotRecognisedTime: {
      entry: ({ context }) => speakAfterDelay( context, "Sorry, I did not recognise that time.Please try again."),
      on: { SPEAK_COMPLETE: "AskTime"},
    },
    
    Confirm: {
      entry: ({ context }) => speakAfterDelay( context, `You are meeting with ${context.person} on ${context.day} at ${context.time}. Is this correct?`),
      on: { SPEAK_COMPLETE: "ListenConfirm"},
    },
    ListenConfirm: {
      entry: ({ context }) => {
        setTimeout(() => {
          context.spstRef.send({ type: "LISTEN", value: {nlu: true} });
        }, 500);
      },
      on: {
        RECOGNISED: [
          {
            guard: ({ event }) =>
              (event as any).nluValue?.topIntent === "confirm",
            target: "Done",
          },
          {
            guard: ({ event }) =>
              (event as any).nluValue?.topIntent === "deny",
            target: "#DM.AskPerson",
          },
          { target: "NotRecognisedConfirm" },
        ],
        ASR_NOINPUT: "Confirm",
      },
    },

   NotRecognisedConfirm: {
      entry: ({ context }) => speakAfterDelay(context, "Sorry, please say yes to confirm or no to start over."),
      on: { SPEAK_COMPLETE: "Confirm" },
    },
    
    // ── DONE ──────────────────────────────────────────────
    Done: {
      entry: ({ context }) => 
        speakAfterDelay( context, "Great! Your meeting is confirmed. Goodbye!"),
        on: { SPEAK_COMPLETE: "WaitToStart" },
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
    element.innerHTML = meta.view ?? "Click to start";
  });
}

import { assign, createActor, setup, fromPromise  } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY} from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};


  const azureLanguageCredentials = {
    endpoint: "https://languageresourceswitz1318.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview"
     /** your Azure CLU prediction URL */,
    key: NLU_KEY /** reference to your Azure CLU key */,
    deploymentName: "appointment" /** your Azure CLU deployment */,
    projectName: "Appointment" /** your Azure CLU project name */,
  };

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials,
  azureCredentials: azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/*
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
  book: {help: "create appointment" },
  schedule: {help: "create appointment" },
  
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
  
  "10": { time: "10:00 AM" },
  "11": { time: "11:00 AM" },
  "12": { time: "12:00 PM" },
  "13": { time: "1:00 PM" },
  "14": { time: "2:00 PM" },
  "15": { time: "3:00 PM" },
  "16": { time: "4:00 PM" },
  "17": { time: "5:00 PM" },
  "18": { time: "6:00 PM" },
  
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
*/
/*
function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}
/*
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
*/
function isYes(utterance: string) {
  const yesWords = ["yes", "yeah", "yep", "sure", "of course","ya sure","okay sure"];
  for (const word of yesWords) {
    if (utterance.toLowerCase().includes(word)) {
      return true;
    }
  }
  return false;
}


function isNo(utterance: string) {
  const noWords = ["no", "nope", "nah", "no way","no guess no","maybe not"];
  for (const word of noWords) {
    if (utterance.toLowerCase().includes(word)) {
      return true;
    }
  }
  return false;
}
/*
function getPersonFromSentence(utterance:string){
  const personNames = ["vlad", "bora", "tal", "tom", "ann", "john"];
  for (const name of personNames) {
    if (utterance.toLowerCase().includes(name)) {
      return getPerson(name);
    }   
  }
  return undefined;
}

function getHelpFromSentence(utterance:string){
  const helpWords = ["appointment", "meeting","book","schedule"];
  for (const word of helpWords) {
    if (utterance.toLowerCase().includes(word)) {
      return (word);
    }   
  }
  return undefined;
}
function getDayFromSentence(utterance:string){
  const weekDays = ["monday","tuesday","wednesday","thursday","friday","saturday"];
  for (const days of weekDays) {
    if (utterance.toLowerCase().includes(days)) {
      return getDay(days);
    }   
  }
  return undefined;
}
function getTimeFromSentence(utterance: string){
  const times = ["10", "11", "12", "13", "14", "15", "16", "17", "18"];
  for (const time of times) {
    if (utterance.toLowerCase().includes(time)) {
      return getTime(time);
    }
  }
  return undefined;
}
*/

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actors: {
    fetchCelebrityInfo: fromPromise<string, { person: string }>(
      async ({ input }) => {
        const name = input.person.replace(/ /g, "_");
        const response = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${name}`
        );
        const data = await response.json();
        return data.extract ?? "Sorry, I couldn't find information about that person.";
      }
    ),
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
        value: { nlu: true },
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    person:undefined,
    day:undefined,
    wholeDay : undefined,
    time:undefined,
    interpretation: null,
    celebrityInfo: undefined
  
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
            target: "CheckIntent",
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
                const personEntity = event.nluValue?.entities?.find(
                  (e: { category: string }) => e.category === "person"
                );
                const dayEntity = event.nluValue?.entities?.find(
                  (e: { category: string }) => e.category === "day"
                );
                const timeEntity = event.nluValue?.entities?.find(
                  (e: { category: string }) => e.category === "time"
                );
                return { 
                  lastResult: event.value,
                  interpretation: event.nluValue || null,
                  person: personEntity?.text || undefined,
                  day: dayEntity?.text || undefined,
                  time: timeEntity?.text || undefined,
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
    
    CheckIntent: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: context.interpretation?.topIntent === "CreateMeeting"
            ? "Sure, I will help you to create the meeting"
            : context.interpretation?.topIntent === "WhoIs"
            ? "I can tell that"
            : "Sorry, I did not understand that.",
        }),
      },
      on: {
        SPEAK_COMPLETE: [
          {
            target: "FetchCelebrityInfo",
            guard: ({ context }) =>
              context.interpretation?.topIntent === "WhoIs",
          },
          {
            target: "Confirm",
            guard: ({ context }) =>
              context.interpretation?.topIntent === "CreateMeeting" && !!context.person && !!context.day && !!context.time,
          },
          {
            target: "AskWholeDay",
            guard: ({ context }) =>
              context.interpretation?.topIntent === "CreateMeeting" && !!context.person && !!context.day,
          },
          {
            target: "AskDay",
            guard: ({ context }) =>
              context.interpretation?.topIntent === "CreateMeeting" && !!context.person,
          },
          {
            target: "AskPerson",
            guard: ({ context }) =>
              context.interpretation?.topIntent === "CreateMeeting",
          },
          {
            target: "AskHelp",
          },
        ],
      },
    },
    
    WhoIsState: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: context.celebrityInfo ?? 
        "Sorry, I couldn't find information about that person.",
    }),
  },
  on:{
        SPEAK_COMPLETE: "WaitToStart",
      },
    },
    
    FetchCelebrityInfo: {
      invoke: {
        src: "fetchCelebrityInfo",
        input: ({ context }) => ({
          person: context.person ?? context.lastResult![0].utterance,
        }),
        onDone: {
          target: "WhoIsState",
          actions: assign(({ event }) => ({
            celebrityInfo: event.output,
          })),
        },
        onError: {
          target: "WhoIsState",
          actions: assign({
            celebrityInfo: "Sorry, I had trouble looking that up.",
          }),
        },
      },
    },
    /*
    CheckGrammarForHelp: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `You just said you wanna help with ${context.lastResult![0].utterance}. And  ${
            !!getHelpFromSentence(context.lastResult![0].utterance) ? "is" : "is not"
          } possible.`,
        }),
      },
      on: { SPEAK_COMPLETE: [
        {
          target: "AskPerson",
          guard: ({ context }) => {
            const utterance = context.lastResult![0].utterance;
            return !!getHelpFromSentence(utterance);
          },
        },
        {
          target: "AskHelp.Prompt",
        },
      ],
      },
    
    },
    */
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
                return { 
                  lastResult: event.value,
                  interpretation: event.nluValue || null,
                  person: event.nluValue?.entities?.find(
                    (e: { category: string }) => e.category === "person"
                  )?.text,
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
          utterance: context.person
            ? `You said you want to meet ${context.person}. Sure it can be arranged!`
            : `Sorry I didn't get that. Can you please say again who you want to meet with?`,
        }),
      },
      on: {
        SPEAK_COMPLETE: [
          {
            target: "AskPerson.Prompt",
            guard: ({ context }) => !context.person,
          },
          {
            target: "AskWholeDay",
            guard: ({ context }) => !!context.person && !!context.day,
          },
          {
            target: "AskDay",
          },
        ],
      },
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
                return { 
                  lastResult: event.value,
                  interpretation: event.nluValue || null,
                  day: event.nluValue?.entities?.find(
                    (e: { category: string }) => e.category === "day"
                  )?.text,
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
         utterance : context.day
      ? `You said you want to meet ${context.day}. Sure it can be arranged!`
  : `Sorry, can you repeat the day again?`,
        }),
      },
      on: { 
        SPEAK_COMPLETE:[
        {
          target: "AskWholeDay",
          guard: ({ context }) => !!context.day,
        },
        {
          target: "AskDay.Prompt",
        },
      ],
      },
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
                return {
                  lastResult: event.value,
                  interpretation: event.nluValue || null,
                  time: event.nluValue?.entities?.find(
                    (e: { category: string }) => e.category === "time"
                  )?.text,
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
          utterance: `Okay so you want the meeting to be at ${context.time}!`,
        }),
      },
      on: { 
        SPEAK_COMPLETE: [
          {
            target: "Confirm",
            guard: ({ context }) => !!context.time,
          },
          {
            target: "AskTime.Prompt",
          },
        ],
      },
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
          utterance: isYes(context.wholeDay || "")
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
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
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  greeting?:string;
  yesno?:string;
}



const grammar: { [index: string]: GrammarEntry } = {
  yes:{yesno:"Yes"},
  no:{yesno:"No"},
  hello:{greeting:"Hello"},
  vlad: { person: "Vladislav Maraev"},
  bora: { person: "Bora Kara" }, 
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  charles: { person: "Charles" },
  doctor:{person:"doctor"},
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
  today: {day:"Today"},
  tomorrow:{day:"tomorrow"},
  "8": { time: "08:00" },
  "9": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}



function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}
function getDay(utterance: string) {
  let day: int = new Date().getDay();
  let week: string[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if(utterance.toLowerCase()=="today")
  {
	  return week[day];
  }
  else if (utterance.toLowerCase()=="tomorrow")
  {
	  return week[day+1];
  }
  return (grammar[utterance.toLowerCase()] || {}).day;
}
function getTime(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).time;
}
function yes(utterance: string) {
  return utterance.toLowerCase()=="yes";
}
function no(utterance: string) {
  return utterance.toLowerCase()=="no";
}
function yesOrNo(utterance: string){
	if(no(utterance)){
		return true;
	}
	else if(yes(utterance)){
		return true;
	}
	else{
		return false;
	}
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
	
	"setPerson": assign(({ context }) => ({
      person: getPerson( context.lastResult![0].utterance),
    })),
	"setDay": assign(({ context }) => ({
      day: getDay( context.lastResult![0].utterance),
    })),
	"setTime": assign(({ context }) => ({
      time: getTime( context.lastResult![0].utterance),
    })),
	"setWholeDay": assign(({ context }) => ({
      time: "the whole day",
    })),
	
	
	  
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
	person: null ,
	day: null ,
	time: null,
    lastResult: null,
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
	
	//Saying hello
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
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },			
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
			  //target:"Prompt",
            },
          },
		  
        },
		
      },
    },
    CheckGrammar: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: ` ${
            isInGrammar(context.lastResult![0].utterance) ? "" : "I don't recognize what you said, but let's continue"
          }.`,
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "SelectPerson",
        /*guard: ({ context }) =>
          isInGrammar(context.lastResult![0].utterance),*/
      },
      {
        target: "Greeting", // eller reprompt-state
      },
    ],
	},
    },
    Done: {
      on: {
        CLICK: "Greeting",
      },
    },
	
	//Select person
	SelectPerson: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckPerson",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Who do you want to see?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
    CheckPerson: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${getPerson(context.lastResult![0].utterance) ? "Confirming" : "I could not understand"} ${context.lastResult![0].utterance}.`,
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "SelectDay",
		actions: "setPerson", 
        guard: ({ context }) =>
          getPerson(context.lastResult![0].utterance),
		
      },
      {
        target: "SelectPerson", // eller reprompt-state
      },
    ], },
    },
	
	
	
	//Select day
	SelectDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `On which day do you want to make an appointment?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
    CheckDay: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${getDay(context.lastResult![0].utterance) ? "Confirming" : "I could not understand"} ${context.lastResult![0].utterance}.`,
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "ChangeDay",
		actions: "setDay", 
        guard: ({ context }) =>
          isInGrammar(context.lastResult![0].utterance),
      },
      {
        target: "SelectDay", // looping back if failing
      },
    ], },
    },
	
	
	// Checking if they ar happy with that day
	
	ChangeDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckChangeDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: ({ context })=>({ utterance: `You have picked ${context.day}. Is this OK?` }) },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
    CheckChangeDay :{
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${yesOrNo(context.lastResult![0].utterance) ? "OK!" : "Please answer yes or no!"}`,  
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "SelectWholeDay",
		actions: "setWholeDay",
        guard: ({ context }) =>
          yes(context.lastResult![0].utterance),
      },
	  {
        target: "SelectDay",
        guard: ({ context }) =>
          no(context.lastResult![0].utterance),
      },
      /*{
        target: "SelectWholeDay", // looping back as a last option
      },*/
    ], 
	},
    },
	
	
	
	
	
	
	
	//Is it the whole day?
	SelectWholeDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckSelectWholeDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Will the appointment last the whole day!` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
    CheckSelectWholeDay: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${yesOrNo(context.lastResult![0].utterance) ? "OK!" : "Please answer yes or no!"}`, 
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "ConfirmDay",
		actions: "setWholeDay",
        guard: ({ context }) =>
          yes(context.lastResult![0].utterance),
      },
	  {
        target: "SelectTime",
        guard: ({ context }) =>
          no(context.lastResult![0].utterance),
      },
      {
        target: "SelectWholeDay", // looping back as a last option
      },
    ], 
	},
    },
	
	
	
	//Select time, if not whole day
	SelectTime: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckTime",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `At what time do you want to have the appointment?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
    CheckTime: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${getTime(context.lastResult![0].utterance) ? "Confirming" : "I could not understand"} ${context.lastResult![0].utterance}.`,
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "ConfirmTime",
		actions: "setTime",
        guard: ({ context }) =>
          isInGrammar(context.lastResult![0].utterance),
      },
      {
        target: "SelectTime", // eller reprompt-state
      },
    ], 
	},
    },
	
	
	// Confirm whole day
	ConfirmDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckConfirmDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: ({ context })=>({ utterance: `Confirm apointment with ${context.person} on ${context.day} the whole day. Is this correct? ` }) },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
    CheckConfirmDay :{
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${yesOrNo(context.lastResult![0].utterance) ? "OK!" : "Please answer yes or no!"}`,  
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "RepeatInfo",
		actions: "setWholeDay",
        guard: ({ context }) =>
          yes(context.lastResult![0].utterance),
      },
	  {
        target: "SelectTime",
        guard: ({ context }) =>
          no(context.lastResult![0].utterance),
      },
      {
        target: "SelectWholeDay", // looping back as a last option
      },
    ], 
	},
    },
	
	
	
	
	// Confirm time at day
	
	ConfirmTime: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckConfirmTime",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: ({ context })=>( { utterance: `Confirm appointment with ${context.person} on ${context.day} at ${context.time}. Is this correct? ` } )},
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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
    CheckConfirmTime: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `${yesOrNo(context.lastResult![0].utterance) ? "OK!" : "Please answer yes or no!"}`, 
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "RepeatInfo",
        guard: ({ context }) =>
          yes(context.lastResult![0].utterance),
      },
	  {
        target: "Greeting",
        guard: ({ context }) =>
          no(context.lastResult![0].utterance),
      },
      {
        target: "CheckConfirmTime", // looping back as a last option
      },
    ],
	},
    },
	
	
		// Repeat the selected info back to the user
	
	RepeatInfo: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Done",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: ({ context }) => ( { utterance: `You have made an appointment with ${context.person}, on ${context.day}, ${context.time}` } )},
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Prompt" },
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

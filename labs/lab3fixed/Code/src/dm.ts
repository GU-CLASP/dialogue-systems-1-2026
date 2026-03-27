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



let index: int = 0;
let fantasy_names : string[] = ["Gandalf", "Azeroth", "Voldemort", "Fëanor"];
let utterance_names: string[] =[];


function initialize(){
	index=0;
	utterance_names=[];
	const btn =document.getElementById("names");
	btn.innerHTML=fantasy_names[index];
}

//using this to match Fantasynames with utterance
function listen_fantasy(utterance:string, confidence: number){
	utterance_names.push(utterance);
	let results: string ="<h3>Results</h3>";
	for(let i:int=0; i<utterance_names.length; i++)
	{
		results = results+"<p>"+fantasy_names[i]+" : "+utterance_names[i]+" confidence: "+confidence +"</p>";
		
	}
	document.getElementById("results").innerHTML=results;
	index++;
	if(index<fantasy_names.length)
	{
		
		document.getElementById("names").innerHTML=fantasy_names[index];
	}
	else
	{
		document.getElementById("names").innerHTML="Done";
	}
	return utterance;
}

//Checking if all the names are done
function is_last()
{
	if(index==fantasy_names.length)
	{
		return true;
	}
	else
	{
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
	"initialize": initialize(),
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
            target: "Check",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Speak the name to the left` } },
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
    Check: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `I heard: ${listen_fantasy(context.lastResult![0].utterance, context.lastResult![0].confidence)}`,
        }),
      },
      on: { SPEAK_COMPLETE: [
      {
        target: "Done",
        guard: ({ context }) =>
        is_last(),
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

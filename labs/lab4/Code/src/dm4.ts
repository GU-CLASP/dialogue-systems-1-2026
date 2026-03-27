import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure.ts";
import type { DMContext, DMEvents } from "./types.ts";

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
  asrDefaultNoInputTimeout: 10000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
  speechRecognitionEndpointId: "609c444a-349f-4f9d-a0a8-4c264618d21b",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
}
type ASRResult = { utterance: string; confidence: number }[];

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
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
    lastResult: null as null | ASRResult,
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
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello world!` } },
          on: { SPEAK_COMPLETE: "Ask" },
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
              actions: assign(({ event }) => {
                //Log confidence scores for all recognition alternatives
                console.group("ASR Results");
                event.value.forEach((result, index) => {
                  console.log(`Alternative ${index + 1}: "${result.utterance}" - confidence: ${result.confidence.toFixed(3)}`);
                });
                console.groupEnd();
                return { lastResult: event.value };
              }),
            },
         
            
      
            ASR_NOINPUT: {
              actions: assign({ lastResult: null as null | ASRResult}),
            },
          },
        },
      },
    },
    CheckGrammar: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => { 
          if (!context.lastResult || context.lastResult.length === 0) {
            return { utterance: "i did not hear anything clearly."};
          }
          const result = context.lastResult[0];
          return {
          utterance: `You just said: "${result.utterance}" with confidence ${Math.round(
            result.confidence * 100
          )}%. And it ${
            isInGrammar(result.utterance) ? "is" : "is not"
          } in the grammar.`,
        };
      },
    },
    on: { SPEAK_COMPLETE: "Done" },
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

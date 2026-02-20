import { assign, createActor, setup } from "xstate";
import { speechstate } from "speechstate";
import type { Settings } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: "https://germanywestcentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials,
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
}

const grammar: Record<string, GrammarEntry> = {
  andreas: { person: "Andreas" },
  clara: { person: "Clara Magic" },
  my: { person: "Mittle My" },
  snufkin: { person: "Snufkin" },
  stinky: { person: "Stinky" },
  moomintroll: { person: "Moomintroll" },
  moominmamma: { person: "Moominmamma" },
  moominpappa: { person: "Moominpappa" },
  snorkmaiden: { person: "Snorkmaiden" },
  sniff: { person: "Sniff" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  "9": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },

  //Affirmative variations
  yes: {},
  yeah: {},
  sure: {},
  yep: {},
  correct: {},
  ok: {},

  //Negative variations 
  no: {},
  nope: {},
  not: {},
  wrong: {},
  never: {},
};

const SLOT_PROMPTS = {
  person: "Who would you like to meet with?",
  day: "What day would you like to meet?",
  time: "What time would you like to meet?",
} as const;

const isInGrammar = (utterance: string) => utterance.toLowerCase() in grammar;
const getPerson = (u: string) => grammar[u.toLowerCase()]?.person;
const getDay = (u: string) => grammar[u.toLowerCase()]?.day;
const getTime = (u: string) => grammar[u.toLowerCase()]?.time;

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  guards: {
    hasPerson: ({ context }) => context.currentSlot === "person" && !!context.person,
    hasDay: ({ context }) => context.currentSlot === "day" && !!context.day,
    hasTime: ({ context }) => context.currentSlot === "time" && !!context.time,
    isConfirmed: ({ context }) => context.currentSlot === "confirmation" && context.confirmation === "yes",
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({ type: "LISTEN" }),
    "speak.feedback": ({ context }) => {
      const utterance = context.lastResult?.[0]?.utterance || "";
      const feedback = isInGrammar(utterance)
        ? `You just said ${utterance}.`
        : `I'm sorry, I didn't catch that.`;
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: feedback },
      });
    },
  },
}).createMachine({
  id: "DM",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    day: null,
    time: null,
    person: null,
    confirmation: null,
    currentSlot: null,
  }),
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
      entry: {
        type: "spst.speak",
        params: { utterance: "Welcome to Moominvalley! I will help you to meet all the Moomins." },
      },
      on: {
        SPEAK_COMPLETE: {
          target: "FillSlot.Ask",
          actions: assign({ currentSlot: "person" }),
        },
      },
    },
    FillSlot: {
      initial: "Ask",
      states: {
        Ask: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => {
              const slot = context.currentSlot!;
              if (slot === "confirmation") {
                return { utterance: `Do you want to have a picnic with ${context.person} on ${context.day} at ${context.time}?` };
              }
              return { utterance: SLOT_PROMPTS[slot as keyof typeof SLOT_PROMPTS] };
            },
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              target: "CheckGrammar",
              actions: assign(({ event }) => ({ lastResult: event.value })),
            },
            ASR_NOINPUT: "NoInput",
          },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({ utterance: `I can't hear you. Please tell me the ${context.currentSlot}.` }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        CheckGrammar: {
          entry: assign(({ context }) => {
            const utterance = context.lastResult![0].utterance.toLowerCase();
            const slot = context.currentSlot;
            if (slot === "person") return { person: getPerson(utterance) || null };
            if (slot === "day") return { day: getDay(utterance) || null };
            if (slot === "time") return { time: getTime(utterance) || null };
            if (slot === "confirmation") {
                const positiveWords = ["yes", "yeah", "sure", "yep", "correct", "ok"];
                const negativeWords = ["no", "nope", "not", "wrong", "never"];
                  const isYes = positiveWords.some(word => utterance.includes(word));
                  const isNo = negativeWords.some(word => utterance.includes(word));
                  return { confirmation: isYes ? "yes" : isNo ? "no" : null };
            };
            return {};
          }),
          always: "SpeakingFeedback"
        },
        SpeakingFeedback: {
          entry: { type: "speak.feedback" },
          on: { 
            SPEAK_COMPLETE: "#DM.NextSlot",
            SPEAK_DONE: "#DM.NextSlot"
          },
          after: { 3500: "#DM.NextSlot" }
        }
      }
    },
    NextSlot: {
      always: [
        {
          guard: "hasPerson",
          actions: assign({ currentSlot: "day" }),
          target: "FillSlot",
        },
        {
          guard: "hasDay",
          actions: assign({ currentSlot: "time" }),
          target: "FillSlot",
        },
        {
          guard: "hasTime",
          actions: assign({ currentSlot: "confirmation" }),
          target: "FillSlot",
        },
        {
          guard: "isConfirmed",
          target: "Done" 
        },
        // Fallback: repeats current slot if data is missing or confirmation was "no"
        { target: "FillSlot" }
      ],
    },
    Done: {
      entry: {
        type: "spst.speak",
        params: { utterance: "The moomins don't really do meetings, just stop by. See you soon in Moominvalley!" }
      },
      on: { CLICK: "Greeting" },
    },
  },
});

const dmActor = createActor(dmMachine, {inspect: inspector.inspect,}).start();

dmActor.subscribe((state) => {
console.group("State update");
console.log("State value:", state.value);
console.log("State context:", state.context);
console.groupEnd();});

export function setupButton(element: HTMLButtonElement) 
{element.addEventListener("click", () => {dmActor.send({ type: "CLICK" });
});

dmActor.subscribe((snapshot) => {const meta: { view?: string } = Object.values(
snapshot.context.spstRef.getSnapshot().getMeta(),)[0] || {
view: undefined,
};
element.innerHTML = `${meta.view}`;
});
} 

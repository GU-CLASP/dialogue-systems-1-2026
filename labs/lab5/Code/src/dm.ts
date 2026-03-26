import { assign, createActor, setup } from "xstate";
import { speechstate } from "speechstate";
import type { Settings } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: "https://germanywestcentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
    endpoint: "https://nlu565699988.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
    key: NLU_KEY,
    deploymentName: "appointment" /** your Azure CLU deployment name */,
    projectName: "picnic" /** your Azure CLU project name */,
  };

const settings: Settings = {
  azureCredentials,
  azureLanguageCredentials,
  azureRegion: "germanywestcentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

const SLOT_PROMPTS = {
  person: "Who would you like to meet with?",
  day: "What day would you like to meet?",
  time: "What time would you like to meet?",
} as const;

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
    "spst.speak": ({ context, event }, params: any) => {
      const p = typeof params === "function" ? params({ context, event }) : params;
      console.log("Attempting to speak:", p.utterance);
      context.spstRef.send({
      type: "SPEAK",
      value: { utterance: p.utterance },
    });
    },
    "spst.listen": ({ context }) =>{
         context.spstRef.send({
           type: "LISTEN",
           value: { nlu: true } /** Local activation of NLU */,
        })
      },
    }

}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QBECyA6ACgJzABwENcBiAQQGUAlAFWvIH1KBRU5ATQG0AGAXUVDwB7WAEsALiMEA7fiAAeiAExcu6AJwBWAMwBGLVw2bFanQHYANCACeiEzvUAWAGxbtpxQ+0AODQF9flmjoAOoE4tSC5GJEYsQAwgAyAJJxANLcfEggQqIS0rIKCBqK9jqaWopaWk6mTk6KljYIdo4ubh7efgEgQQDiuGASUlDE5JgsqfRxAPKomAlM1EwZsjnikjJZhYpOqgbOalwmag6mXHWNSuelDpo6lV4eThqm-oEYAGIiADbf5N+CMToUiwADWo3GpEmMzmCyWKyyazym1AhScJ3Q6O0OjKakqGgcDkuCB0Xme6C8OicVK8j1MVR0XXe6C+v3+gPQCREsDEYCkxGYM16ADkkuQmMgEQJhOt8ltEDouD50ITil4uLpjLSnMTSS90ErNGpDk5PNS3j1Pj8-gCgVyeXyyFR6MLpklhZgAKrUKXZGXIgoKpUaFWeRTqzVqbW60xeUzqR5kko+U61C1BVk2jnCwRJKR4ACusTGEyms3mi2WvFW-o2gZJwdDao19yjZJjikUBrqpNpnhOenTVrZtvQcQAFmAAMag-oEAC286IxF9SLr8pJDnVBp8hz0PjjHl1tPsGh71K3ujKTMtLOt7KB5DwYAIoJEww+YEgACMCDOIaWMIVvC1aIrWcqokGDTWAq4ZaKGLheGo7hUjsQ53iOHJPi+b4fl+EC-v+JZQvQyDTMKVaZNKuTrpBzTQU0jKVK0Wh9jsUYaF46GZg+6DYa+75QJ+P5-uCcg8gQvLoAQABmvLYAAFK4KgAJTEBm96jvxuFCfhhGgqu4EovICr0iq2LXjohL4l4x5dgSKiMmoprGkcrzdEEwpgHIYgPiuoHUbKxmFI8uqmg4mLOaxpgxc5zzoV5Pl+RwOhUX6NEQSZCDKPBnhXnc1muLZMEIA4FQGg4jm7HoGplTenneb5torooaVrpl2x6OZ+UaFZDg2cSxTwcaugODiY0aFwpIJY1yVaG1Rn1p2uUWQV-VFcSXjlWULi1ZVXB1TNSXNRwDgLRlwWIO4uonF2Lm9cYSp6Io9UYMg0hgPEyRpIZF31vU8FUpVSFcDsW1VJtxgsRqZ5Ush-jdFIggQHAshoDWf0bgAtDqJWaBVKiE0TKivVguCELgGNBfW-WbbSLFAxUlJKuhoThJE0TYGIVMBhurH2B4nZHAYcb0rjTQmF2hIuFomicbGY3of0X5DFAPO0VlNTEso1LoPcuwnF4ZXPC83GaYC6sdYghJeJilX1Iq7i0qxYVaBFZ71FNJQdGoZuYUCIKgpbl2lc5dvnCUXBO1txWMY8TgUsaBJnHitzxR5w5Zna3K8sZ7Uh0hCfhvc-VWS8NTiwqRtdpS1InlGDt+1n6A5nmhbc2BmN0fccYGpqirOKaU0WCVZi9egHudoy9TIQdTe8RO06ztgC5Ltgwf1q28YlFuU17qNlckj48bnHXTEvJNXEZxhzfaYJwkEaJG8boypghmYpK3IqlSnFox76qfUk58346COk1C2ndqYblpiVSk8F1T0iQsaRQpgqRaHQu9KQYBn50TKqoRUahqjITfimTa5xWg7HqOiZyhCEa+CAA */
  id: "DM",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, {
      input: settings, 
      syncSnapshot: true}),
    lastResult: null,
    interpretation: null,
    isSpeaking: false,
    day: null,
    time: null,
    person: null,
    confirmation: null,
    decision: null,
    currentSlot: null,
  }),
  initial: "Prepare",

  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { 
        CLICK: "Greeting",
        ASRTTS_READY: {},
       },      
    },

    Greeting: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Welcome to Moominvalley! What can I help you with?" },
      },
      on: {
        SPEAK_COMPLETE: "DecisionListen",
        ASRTTS_READY: {}, 
      },
    },
    DecisionListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: event.nluValue
          })),
          target: "DecisionCheck"
      },
        ASR_NOINPUT: "DecisionNoInput",
        ASRTTS_READY: {}, 
    }
    },
    DecisionNoInput: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Sorry, I didn't hear you. Do you want to go on a picnic or ask who someone is?" }
      },
      on: { 
        SPEAK_COMPLETE: "DecisionListen",
        ASRTTS_READY: {}, 
       }
    },
    DecisionCheck: {
      always: [
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Who is X",
          actions: assign({ decision: "who is" }),
          target: "WhoIs"
        },
        {
          guard: ({ context }) =>
            context.interpretation?.topIntent === "Create_picnic",
          actions: assign({ 
            decision: "create picnic", 
            currentSlot: "person"
          }),
          target: "FillSlot",
        },
        { target: "DecisionListen" }
      ]
    },

WhoIs: {
  initial: "AwaitReady",
  states: {
    AwaitReady: {
      on: {
        ASRTTS_READY: "WhoIsSpeak",
        SPEAK_COMPLETE: "WhoIsSpeak",
      },
    },
    WhoIsSpeak: {
      entry: {
        type: "spst.speak",
        params: ({ context }: { context: DMContext }) => {
          const entity = context.interpretation?.entities?.find(
            e => e.category === "meeting person"
          );
          const person = entity?.text ?? "that person";
          return {
            utterance: `${person} is a famous person, that sometimes visits Moominvalley just like you want to. You should visit together some time!`
          };
        },
      },
      on: {
        SPEAK_COMPLETE: "#DM.DecisionListen",
      }
    },
  }
},

  FillSlot: {
  initial: "AwaitReady",
  states: {
    AwaitReady: {
      on: {
        ASRTTS_READY: "Ask",
        SPEAK_COMPLETE: "Ask",
        },
      },
    Ask: {
      entry: {
        type: "spst.speak",
            params: ({ context }: { context: DMContext }) => {
              const slot = context.currentSlot;
              if (slot === "confirmation") {
                return {
                  utterance: `Do you want to have a picnic with ${context.person} on ${context.day} at ${context.time}?`,
                };
              }
           return {
             utterance: 
             SLOT_PROMPTS[slot as keyof typeof SLOT_PROMPTS] ??
             "Could you repeat that?"
            };
         },
      },
      on: { 
        SPEAK_COMPLETE: "Listen",
        ASRTTS_READY: {},
       },
       
    },

    Listen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            lastResult: event.value,
            interpretation: event.nluValue
          })),
          target: "Process"
        },
        ASR_NOINPUT: "NoInput",
      }
    },
    NoInput: {
      entry: {
        type: "spst.speak",
        params: ({ context }: { context: DMContext }) => ({
          utterance: `I can't hear you. Please tell me the ${context.currentSlot}.`
        })
      },
      on: { 
        SPEAK_COMPLETE: "Ask",
      },
       
    },

    Process: {

      always: [
        {
          actions: assign(({ context }) => {
            const entities = context.interpretation?.entities ?? [];
            const slot = context.currentSlot;
            const rawUtterance = context.lastResult?.[0]?.utterance ?? null;

            const person = entities.find(e => e.category === "person");
            const day = entities.find(e => e.category === "meeting day");
            const time = entities.find(e => e.category === "meeting time");
            const confirmationYes = entities.find(e => e.category === "confirmation yes");
            const confirmationNo = entities.find(e => e.category === "confirmation no");

            if (slot === "person")
              return { person: person?.text ?? rawUtterance };
            if (slot === "day")
              return { day: day?.text ?? rawUtterance };
            if (slot === "time")
              return { time: time?.text ?? rawUtterance };
            if (slot === "confirmation") {
            if (confirmationYes) return { confirmation: "yes" };
            if (confirmationNo) return { confirmation: "no" };
              return { confirmation: rawUtterance };
            }
            return {};
          }),
          target: "#DM.NextSlot"
        }
      ]
    },
        Feedback: {
          entry: {
            type: "spst.speak",
            params: ({ context }: { context: DMContext }) => ({
              utterance: `You said: ${context.lastResult?.[0]?.utterance ?? ""}`,
            }),
          },
          on: { 
            SPEAK_COMPLETE: "#DM.NextSlot",
            ASRTTS_READY: {}, 
           },
          
        },
      },
    },

    NextSlot: {
      always: [
        {
          guard: ({ context }) => context.currentSlot === "person" && !!context.person,
          actions: assign({ currentSlot: "day" }),
          target: "FillSlot.AwaitReady",
          reenter: true,
        },
        {
          guard: ({ context }) => context.currentSlot === "day" && !!context.day,
          actions: assign({ currentSlot: "time" }),
          target: "FillSlot.AwaitReady",
          reenter: true,
        },
        {
          guard: ({ context }) => context.currentSlot === "time" && !!context.time,
          actions: assign({ currentSlot: "confirmation" }),
          target: "FillSlot.AwaitReady",
          reenter: true,
        },
        {
          guard: ({ context }) => context.currentSlot === "confirmation" && context.confirmation === "yes",
          target: "ReadyDone" 
        },
        {
          guard: ({ context }) => context.currentSlot === "confirmation" && context.confirmation === "no",
          actions: assign({ currentSlot: "person", person: null, day: null, time: null, confirmation: null }),
          target: "FillSlot.AwaitReady",
          reenter: true
        },
        
        { target: "FillSlot.AwaitReady" }
      ],
    },
    ReadyDone: {
      on: {
        ASRTTS_READY: "Done",
        SPEAK_COMPLETE: "Done",
      },
    },
    Done: {
      entry: {
        type: "spst.speak",
        params: { utterance: "The moomins don't really do meetings, just stop by. See you soon in Moominvalley!" }
      },
      on: { 
        CLICK: "Greeting",
        SPEAK_COMPLETE: "WaitToStart",
       },
    },
  },
});

const dmActor = createActor(dmMachine, {inspect: inspector.inspect,}).start();
const spst = dmActor.getSnapshot().context.spstRef;

let wasSpeaking = false;
let lastReadyState = false;

spst.subscribe((speechSnapshot) => {
  const nowSpeaking = speechSnapshot.matches("speaking");
  const nowReady = speechSnapshot.matches("ready");

  if (wasSpeaking && !nowSpeaking) {
    dmActor.send({ type: "SPEAK_COMPLETE" });
  }
  wasSpeaking = nowSpeaking;

  if (nowReady && !lastReadyState) {
    dmActor.send({ type: "ASRTTS_READY" });
  }
  lastReadyState = nowReady;

  const result = speechSnapshot.context.recResult;
  if (result) {
    dmActor.send({
      type: "RECOGNISED",
      value: result,
      nluValue: speechSnapshot.context.nluResult,
    });
  }
});
dmActor.subscribe((snapshot) => {
  const spst = snapshot.context.spstRef.getSnapshot();
 
  if (spst.value === 'error') { 
    console.error("SPEECH ENGINE ERROR STATE REACHED:", spst.context);
  }
});

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

import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { NLU_KEY } from "./azure";
import type { DMContext, DMEvents, NLUObject, Entity } from "./types";


const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://italynorth.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};
const azureLanguageCredentials = {
  endpoint: "https://dimlanguage33.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
  key: NLU_KEY /** reference to your Azure CLU key */,
  deploymentName: "MakeAnAppointment" /** your Azure CLU deployment */,
  projectName: "Appointment" /** your Azure CLU project name */,
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials, 
  azureCredentials: azureCredentials,
  azureRegion: "italynorth",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

function getEntity(event: any, name: string) {
  if (!event.nluValue?.entities) return null;
  const entity = event.nluValue.entities.find((e: Entity) => e.category === name);
  return entity ? entity.text : null;
}

function isYes(text: string | null) {
  if (!text) return false;
  const t = text.toLowerCase();

  return ["yes", "yeah", "yep", "sure", "correct", "right"].some(word =>
    t.includes(word)
  );
}

function isNo(text: string | null) {
  if (!text) return false;
  const t = text.toLowerCase();

  return ["no", "nope", "not"].some(word =>
    t.includes(word)
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
        value: { nlu: true }
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
  spstRef: spawn(speechstate, { input: settings }),

  person: null as string | null,
  day: null as string | null,
  time: null as string | null,

  agree: null as boolean | null,
  disagree: null as boolean | null,     

  interpretation: null as NLUObject | null,
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
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Hey there! I am here to help you with your appointment."
    }
  },
  on: {
    SPEAK_COMPLETE: "AskForPerson"
  }
},

AskForPerson: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Who would you like to meet with?"
    }
  },
  on: {
    SPEAK_COMPLETE: "ListenPerson"
  }
},

ListenPerson: {
  entry: {
    type: "spst.listen",
    params: { nlu: true }
  },
  on: {
    RECOGNISED: {
      actions: assign(({ event }) => {
        const person = getEntity(event, "meeting_person");

        return {
          person,
          interpretation: event.nluValue
        };
      }),
    },

    LISTEN_COMPLETE: [
      {
        guard: ({ context }) => !!context.person,
        target: "AskForDay",
      },
      {
        target: "PersonRetry",
      },
    ],

    ASR_NOINPUT: {
      target: "PersonRetry",
    },
  },
},
PersonRetry: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Sorry, I didn't catch the name. Who would you like to meet with?"
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenPerson",
  },
},




AskForDay: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Which day would you like to schedule the meeting?"
    }
  },
  on: {
    SPEAK_COMPLETE: "ListenTheDay"
  }
},
ListenTheDay: {
  entry: {
    type: "spst.listen",
    params: { nlu: true }
  },
  on: {
    RECOGNISED: {
      actions: assign(({ event }) => {
        const day = getEntity(event, "meetingDay");

        return {
          day,
          interpretation: event.nluValue
        };
      })
    },
    LISTEN_COMPLETE: [
      {
        guard: ({ context }) => !!context.day,
        target: "AskForWholeDay"
      },
      {
        target: "DayRetry"
      }
    ],

    ASR_NOINPUT: {
      target: "DayRetry"
    }
  }
},
DayRetry: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Sorry, I didn't catch the day. Which day would you like to schedule the meeting?"
    }
  },
  on: {
    SPEAK_COMPLETE: "ListenTheDay"
  }
},




AskForWholeDay: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Will it take the whole day?",
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenTheWholeDay",
  },
},
ListenTheWholeDay: {
  entry: [
    assign({ 
      agree: null,
      disagree: null,
    }),
    { type: "spst.listen", params: { nlu: true } },
  ],

  on: {
    RECOGNISED: {
  actions: assign(({ event }) => {
    const answer = getEntity(event, "yes_no")?.toLowerCase() || null;

    return {
      agree: isYes(answer),
      disagree: isNo(answer),
    };
  }),
},
  LISTEN_COMPLETE: [
  { guard: ({ context }) => !!context.agree, target: "AskForConfirmation2" },
  { guard: ({ context }) => !!context.disagree, target: "AskForTime" },
  { target: "WholeDayRetry" },
],

    ASR_NOINPUT: { target: "WholeDayRetry" },
  },
},
WholeDayRetry: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Sorry, I did not catch that. Will the meeting take the whole day?",
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenTheWholeDay",
  },
},




AskForTime: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "What time should we plan the meeting?",
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenTime", 
  },
},
ListenTime: {
  entry: [
    assign({ time: null }),
    { type: "spst.listen", params: { nlu: true } },
  ],
  on: {
    RECOGNISED: {
      actions: assign(({ event }) => ({
        time: getEntity(event, "meeting_time"),
        interpretation: event.nluValue,
      })),
    },
    LISTEN_COMPLETE: [
      { guard: ({ context }) => !!context.time, target: "AskForConfirmation2" },
      { target: "TimeRetry" },
    ],
    ASR_NOINPUT: { target: "TimeRetry" },
  },
},
TimeRetry: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Sorry, I didn't catch the time. What time should we plan the meeting?",
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenTime",
  },
},




AskForConfirmation2: {
  entry: {
    type: "spst.speak",
    params: ({ context }) => ({
      utterance: `To finalize, you will meet with ${context.person} on ${context.day}${
        context.time ? ` at ${context.time}` : ""
      }. Is that correct?`,
    }),
  },
  on: {
    SPEAK_COMPLETE: "ListenConfirmation2",
  },
},

ListenConfirmation2: {
  entry: [
    assign({
      agree: null,
      disagree: null,
    }),
    { type: "spst.listen", params: { nlu: true } },
  ],

  on: {
    RECOGNISED: {
      actions: assign(({ event }) => {
        const answer = getEntity(event, "yes_no")?.toLowerCase() || null;

        return {
          agree: isYes(answer),
          disagree: isNo(answer),
        };
      }),
    },

    LISTEN_COMPLETE: [
      { guard: ({ context }) => !!context.disagree, target: "AskForPerson" },
      { guard: ({ context }) => !!context.agree, target: "Done" },
      { target: "Confirmation2Retry" },
    ],

    ASR_NOINPUT: { target: "Confirmation2Retry" },
  },
},

Confirmation2Retry: {
  entry: {
    type: "spst.speak",
    params: ({ context }) => ({
      utterance: `Sorry, I didn't catch that. You will meet with ${context.person} on ${context.day}${
        context.time ? ` at ${context.time}` : ""
      }. Is that correct?`,
    }),
  },
  on: {
    SPEAK_COMPLETE: "ListenConfirmation2",
  },
},




Done: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: "Your appointment has been created!"
    }
  },
  on: {
    CLICK: "Greeting"
   }
  },
 } 
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
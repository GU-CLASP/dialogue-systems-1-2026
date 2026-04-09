import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://italynorth.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "italynorth",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  answer?: string;
  agree?: boolean;
  disagree?: boolean;
  correct?: boolean;
}

const grammar: { [index: string]: GrammarEntry } = {
  // people
  vlad: {person: "Vladislav Maraev"},
  bora: {person: "Bora Kara"},
  tal: {person: "Talha Bedir"},
  tom: {person: "Tom Södahl Bladsjö"},
  dimitris: {person: "Dimitris Goutas"},
  athina: {person: "Athina Panteli"},
  victoria: {person: "Victoria Daniilidou"},

  // days
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday"},
  thursday: {day: "Thursday"},
  friday: {day: "Friday"},
  saturday: {day: "Saturday"},
  sunday: {day: "Sunday"},

  //hours
  "1": {time: "1:00"},
  "2": {time: "2:00"},
  "3": {time: "3:00"},
  "4": {time: "4:00"},
  "5": {time: "5:00"},
  "6": {time: "6:00"},
  "7": {time: "7:00"},
  "8": {time: "8:00"},
  "9": {time: "9:00"},
  "10": {time: "10:00"},
  "11": {time: "11:00"},
  "12": {time: "12:00"},

  //yes&no
  "yes": {agree: true},
  "no": {disagree: true},
  "nope": {disagree: true},
  "sure":{agree: true},
  "fine":{agree: true},
  "good":{agree:true},
  "correct":{agree: true},
  "of course": {answer: "of course"},
  "no way": {answer: "no way"},
}

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function positiveAnswer(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).agree; 
}
  
function negativeAnswer(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).disagree;
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
    whoToMeet: null,
    meetingDay: null,
    meetingTime: null,
    confirmationOne: null,
    confirmationTwo: null,
    agree: null,
    disagree: null,
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
      initial: "Prompt",
      on: {
  LISTEN_COMPLETE: [
    {
      guard: ({ context }) =>
        !!context.whoToMeet &&
        isInGrammar(context.whoToMeet[0].utterance),
      target: "AskForDay",
    },
    {
      guard: ({ context }) =>
        !!context.whoToMeet &&
        !isInGrammar(context.whoToMeet[0].utterance),
      target: "PersonNotInGrammar",
    },
    { target: ".NoInput" },
  ],
},
    states: {
      Prompt: {
        entry: { type: "spst.speak", params: { utterance: `Who would you like to meet with?`} },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you! Can you say who you would like to meet with again?` },
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { whoToMeet: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ whoToMeet: null }),
            },
          },
        },
      },
    },
  PersonNotInGrammar: {
   entry: {
    type: "spst.speak",
    params: ({ context }) => ({
      utterance: `You just said: ${context.whoToMeet![0].utterance}. That person is not available. Please try again with another candidate.`,
    }),
  },
  on: {
    SPEAK_COMPLETE: "AskForPerson",
  },
},




AskForDay: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: `Which day would you like to schedule the meeting?`
    }
  },
  on: {
    SPEAK_COMPLETE: "Listentheday"
  }
},

Listentheday: {
  entry: { type: "spst.listen" },

  on: {
    RECOGNISED: {
      actions: assign(({ event }) => ({
        meetingDay: event.value
      })),
    },

    LISTEN_COMPLETE: [
      {
        guard: ({ context }) => 
          !!context.meetingDay &&
          isInGrammar(context.meetingDay[0].utterance),
        target: "AskForWholeDay",
      },
      {
        guard: ({ context }) =>
          !!context.meetingDay &&
          !isInGrammar(context.meetingDay[0].utterance),
        target: "DayNotInGrammar"
      },
      {
        target: "NoInput1"
      }
    ],

    ASR_NOINPUT: {
      actions: assign({
        meetingDay: null
      })
    }
  }
},
NoInput1: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: `I can't hear you! Which day would you like to schedule the meeting?`
    }
  },
  on: {
    SPEAK_COMPLETE: "Listentheday"
  }
},
  DayNotInGrammar: {
    entry: {
    type: "spst.speak",
    params: ({ context }) => ({
      utterance: `You just said: ${context.meetingDay![0].utterance}. That day is not available.`,
    }),
  },
  on: {
    SPEAK_COMPLETE: "AskForDay",
  },
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
    { type: "spst.listen" },
  ],

  on: {
    RECOGNISED: {
      actions: assign(({ event }) => {
        const utt = event.value?.[0]?.utterance?.toLowerCase();

        return {
          agree: positiveAnswer(utt),
          disagree: negativeAnswer(utt),
        };
      }),
    },
    LISTEN_COMPLETE: [
      {
        guard: ({ context }) => context.disagree === true,
        target: "AskForTime",
      },
      {
        guard: ({ context }) => context.agree === true,
        target: "AskForConfirmation",
      },
      {
        target: "WholeDayNotInGrammar",
      },
    ],
  },
},
    ASR_NOINPUT: {
      target: "NoInput2",  
    },

WholeDayNotInGrammar: {
  entry: {
    type: "spst.speak",
    params: {
      utterance:
        `Please answer yes or no.`,
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenTheWholeDay",
  },
},

NoInput2: {
  entry: {
    type: "spst.speak",
    params: {
      utterance:
        "I can't hear you! Will the meeting take the whole day?",
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenTheWholeDay",
  },
},





AskForTime: {
  entry: { type: "spst.speak", params: { utterance: `What time should we plan the meeting?` } },
          on: { SPEAK_COMPLETE: "ListenThetime" },
},

ListenThetime: {
  entry: { type: "spst.listen" },

  on: {
    RECOGNISED: {
      actions: assign(({ event }) => ({
        meetingTime: event.value
      })),
    },

    LISTEN_COMPLETE: [
      {
      guard: ({ context }) =>
        !!context.meetingTime &&
        isInGrammar(context.meetingTime[0].utterance),
      target: "AskForConfirmation",
      },
      {
        guard: ({ context }) =>
          !!context.meetingTime &&
          !isInGrammar(context.meetingTime[0].utterance),
        target: "TimeNotInGrammar",
      },
      {
        target: "NoInput3"
      }
    ],

    ASR_NOINPUT: {
      actions: assign({
        meetingTime: null
      })
    }
  }
},

NoInput3: {
  entry: {
    type: "spst.speak",
    params: {
      utterance: `I can't hear you! What time should we plan the meeting?`
    }
  },
  on: {
    SPEAK_COMPLETE: "ListenThetime"
  }
},
    TimeNotInGrammar: {
     entry: {
      type: "spst.speak",
    params: ({ context }) => ({
      utterance: `You just said: ${context.meetingTime![0].utterance}. That time slot is not available.`,
    }),
  },
  on: {
    SPEAK_COMPLETE: "AskForTime",
  },
    },




AskForConfirmation: {
  entry: { type: "spst.speak", 
    params: ({context}) => ({
        utterance: `So, to finalize it. You will meet with ${context.whoToMeet![0].utterance} on ${context.meetingDay![0].utterance}. Is that correct?` 
      }) 
    },
    on: { SPEAK_COMPLETE: "ListenConfirmation" },
},
ListenConfirmation: {
  entry: [
    assign({
      agree: null,
      disagree: null
    }),
    { type: "spst.listen" }
  ],

  on: {
    RECOGNISED: {
      guard: ({ event }) => isInGrammar(event.value[0].utterance),
      actions: assign(({ event }) => ({
        confirmationOne: event.value,
        agree: positiveAnswer(event.value[0].utterance),
        disagree: negativeAnswer(event.value[0].utterance)
      })),
    },

    LISTEN_COMPLETE: [
      {
        guard: ({ context }) => context.disagree === true,
        target: "AskForPerson",
      },
      {
        guard: ({ context }) => context.agree === true,
        target: "Done",
      },
      {
        target: "ConfirmationNotInGrammar",
      },
      {
        target: "NoInput4"
      }
    ],

    ASR_NOINPUT: {
      actions: assign({
        confirmationOne: null
      })
    },
  }
},

ConfirmationNotInGrammar: {
  entry: {
    type: "spst.speak",
    params: {
      utterance:
        `Please answer yes or no.`,
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenConfirmation",
  },
},
NoInput4: {
  entry: {
    type: "spst.speak",
    params: ({context}) => ({  utterance: `I repeat. You will meet with ${context.whoToMeet![0].utterance} on ${context.meetingDay![0].utterance}. Is that correct?` })
  },
  on: {
    SPEAK_COMPLETE: "ListenConfirmation"
  }
},




AskForConfirmation2: {
  entry: { type: "spst.speak", 
    
    params: ({context}) => ({  utterance: `So, to finalize it. You will meet with ${context.whoToMeet![0].utterance} on ${context.meetingDay![0].utterance} at ${context.meetingTime![0].utterance}. Is that correct?` }) 
  
  },
    on: { SPEAK_COMPLETE: "ListenConfirmation2" },

},
ListenConfirmation2: {
  entry: [
    assign({
      agree: null,
      disagree: null
    }),
    { type: "spst.listen" }
  ],

  on: {
    RECOGNISED: {
      guard: ({ event }) => isInGrammar(event.value[0].utterance),
      actions: assign(({ event }) => ({
        agree: positiveAnswer(event.value[0].utterance),
        disagree: negativeAnswer(event.value[0].utterance)
      })),
    },

    LISTEN_COMPLETE: [
      {
        target: "AskForPerson",
        guard: ({ context }) => context.disagree === true,
      },
      {
        target: "Done",
        guard: ({ context }) => context.agree === true,
      },
      {
        target: "Confirmation2NotInGrammar",
      },
      {
        target: "NoInput5"
      }
    ],

    ASR_NOINPUT: {
      actions: assign({
        confirmationTwo: null
      })
    },
  }
},
Confirmation2NotInGrammar: {
  entry: {
    type: "spst.speak",
    params: {
      utterance:
        `Please answer yes or no.`,
    },
  },
  on: {
    SPEAK_COMPLETE: "ListenConfirmation2",
  },
},
NoInput5: {
  entry: {
    type: "spst.speak",
    params: ({context}) => ({  utterance: `I repeat. You will meet with ${context.whoToMeet![0].utterance} on ${context.meetingDay![0].utterance} at ${context.meetingTime![0].utterance}. Is that correct?` })
  },
  on: {
    SPEAK_COMPLETE: "ListenConfirmation2"
  }
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

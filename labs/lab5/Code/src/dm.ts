import { KEY, NLU_KEY } from "./azure";
import { assign, createActor, setup } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: 
    "https://norwayeast.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: 
    "https://athina-05.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "appointment",
};

const settings = {
  azureLanguageCredentials: azureLanguageCredentials,
  azureCredentials: azureCredentials,
  azureRegion: "norwayeast",
  asrDefaultCompleteTimeout: 1000,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
  bargeIn: false as const,
};

interface GrammarEntry {
  answer?: boolean;
}

const grammar: { [index: string]: GrammarEntry } = {
  yes: { answer: true }, 
  yep: { answer: true},
  yeah: { answer: true},
  sure: { answer: true},
  definitely: { answer: true},
  "of course": { answer: true},
  no: { answer: false},
  nope: { answer: false},
  nah: { answer: false},
  "no way": { answer: false},
};

function getUtterance(context: DMContext) {
  return context.lastResult?.[0]?.utterance ?? ""; 
}

function getPerson(context: DMContext): string | null {
  const personEntity = context.interpretation?.entities.find(
    (e) => e.category === "person"
  );
  return personEntity?.text ?? null;
}

function getDay(context: DMContext): string | null {
  const dayEntity = context.interpretation?.entities.find(
    (e) => e.category === "day"
  );
  return dayEntity?.text ?? null;
}

function getTime(context: DMContext): string | null {
  const timeEntity = context.interpretation?.entities.find(
    (e) => e.category === "time"
  );
  return timeEntity?.text ?? null;
}

function getIntent(context: DMContext): string | null {
  return context.interpretation?.topIntent ?? null;
}  

function getAnswer(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).answer;
}

const personInfo: Record<string, string> = {
  "Ada Lovelace": "Augusta Ada King, Countess of Lovelace, also known as Ada Lovelace, was an English mathematician and writer chiefly known for work on Charles Babbage's proposed mechanical general-purpose computer, the analytical engine. She was the first to recognise the machine had applications beyond pure calculation. Lovelace is often considered the first computer programmer.",
  "Noam Chomsky": "Avram Noam Chomsky is an American intellectual, philosopher, linguist, political activist, and social critic. Sometimes called the father of modern linguistics, Chomsky is also a major figure in analytic philosophy and one of the founders of the field of cognitive science.",
  "Søren Kierkegaard": "Søren Aabye Kierkegaard was a Danish Lutheran theologian, philosopher, poet, social critic, and religious author who is widely considered to be the first existentialist philosopher.",
  "Ferdinand de Saussure": "Ferdinand Mongin de Saussure was a Swiss linguist, semiotician and philosopher. His ideas laid a foundation for many significant developments in both linguistics and semiotics in the 20th century. He is widely considered one of the founders of 20th-century linguistics and one of two major founders of semiotics, or semiology, as Saussure called it.",
  "Edgar Allan Poe": "Edgar Allan Poe was an American writer, poet, editor, and literary critic who is best known for his poetry and short stories, particularly his tales involving mystery and the macabre. He is widely regarded as one of the central figures of Romanticism and Gothic fiction in the United States and of early American literature.",
  "Fyodor Dostoevsky": "Fyodor Mikhailovich Dostoevsky was a Russian philosopher, novelist, short story writer, essayist and journalist. He is regarded as one of the greatest novelists in both Russian and world literature, and many of his works are considered highly influential masterpieces.",
  "Bruce Dickinson": "Paul Bruce Dickinson is an English singer who is best known as the lead vocalist of the heavy metal band Iron Maiden. Dickinson has performed in the band across two stints, from 1981 to 1993 and from 1999 to the present day. He is known for his wide-ranging operatic vocal style and energetic stage presence.",
  "Kevin Parker": "Kevin Richard Parker is an Australian singer, songwriter, musician, record producer, and DJ, best known for his psychedelic rock musical project Tame Impala, for which he writes, performs, records, and produces the music. Parker has released five Tame Impala albums: Innerspeaker, Lonerism, Currents, The Slow Rush, and Deadbeat. He has won 13 ARIA Music Awards, two APRA Awards, and a Brit Award, and two Grammy Awards from five nominations.",
  "Serj Tankian": "Serj Tankian is an Armenian-American musician. He is best known as the lead vocalist of the heavy metal band System of a Down, which was formed in 1994.",
};

const resetAppointment = {
  lastResult: null,
  interpretation: null,
  person: null,
  day: null,
  wholeDay: null,
  time: null,
  answer: null,
};  

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
        value: { nlu: true },
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    person: null,
    day: null,
    wholeDay: null, 
    time: null,
    answer: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { 
        CLICK: {
          target: "AskIntentPrompt",
          actions: assign(resetAppointment),
        },
      },
    },
    AskIntentPrompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "What would you like to do?" },
      },
        on: { SPEAK_COMPLETE: "AskIntentListen"},
    },
    AskIntentListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            console.log("NLU:", event.nluValue);
            return {
              lastResult: event.value,
              interpretation: event.nluValue,
            };
          }),
        },
          ASR_NOINPUT: {
            actions: assign({ lastResult: null}),
          },
          LISTEN_COMPLETE: [
            {
              guard: ({ context }) => 
                getIntent(context) === "whoIs" && !!getPerson(context),
              target: "whoIsAnswer",
              actions: assign(({ context }) => ({
                person: getPerson(context),
              })),
            },
            {
              guard: ({ context }) => getIntent(context) === "createMeeting",
              target: "RouteMeetingInfo",
              actions: assign(({context}) => ({
                person: getPerson(context),
                day: getDay(context),
                time: getTime(context),
              })),
            },
            { target: "AskIntentPrompt" },
          ],
        },
      },
    whoIsAnswer: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: 
            personInfo[context.person ?? ""] ??
            `Sorry, I do not have information about ${context.person}.`,
        }),
      },
    on: { SPEAK_COMPLETE: "Done"},
  },

  RouteMeetingInfo: {
    always: [
      {
        guard: ({ context }) => !context.person,
        target: "AskPersonPrompt",
      },
      {
        guard: ({ context }) => !context.day,
        target: "AskDayPrompt",
      },
      {
        guard: ({ context }) => !!context.time,
        target: "ConfirmTime",
      },
      {
        guard: ({ context }) => context.wholeDay === true,
        target: "ConfirmWholeDay"
      },
      {
        guard: ({ context }) => context.wholeDay === null,
        target: "AskWholeDayPrompt"
      },
      {
        guard: ({ context }) => !context.time,
        target: "AskTimePrompt",
      },
      { target: "ConfirmTime" },
    ],
  },

  AskPersonPrompt: {
    entry: {
      type: "spst.speak",
      params: { utterance: "Who are you meeting with?"},
    },
    on: { SPEAK_COMPLETE: "AskPersonListen" },
  },
    AskPersonListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            console.log("NLU:", event.nluValue);
            return {
              lastResult: event.value,
              interpretation: event.nluValue,
            };
          }),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => 
              getIntent(context) === "whoIs" && !!getPerson(context),
            target: "whoIsAnswer",
            actions: assign(({ context }) => ({
              person: getPerson(context),
            })),
          },
          {
            guard: ({ context }) => !!getPerson(context) || !!getUtterance(context),
            target: "RouteMeetingInfo",
            actions: assign(({ context }) => ({
              person: getPerson(context) ?? getUtterance(context),
            })),
          },
          { target: "AskPersonRetry" },
        ],
      },
    },
    AskPersonRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Sorry, I did not get the name. Who are you meeting with?",
        },
      },
      on: { SPEAK_COMPLETE: "AskPersonListen"},
    },
    AskDayPrompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "On which day is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "AskDayListen" },
    },
    AskDayListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            console.log("NLU:", event.nluValue);
            return {
              lastResult: event.value,
              interpretation: event.nluValue,
            };
          }),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => !!getDay(context) || !!getUtterance(context),
            target: "RouteMeetingInfo",
            actions: assign(({ context }) => ({
              day: getDay(context) ?? getUtterance(context), 
            })),
          },
          { target: "AskDayRetry" },
        ],
      },
    },
    AskDayRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: 
            "Sorry. I did not get the day. Could you please repeat?"
        },
      },
      on: { SPEAK_COMPLETE: "AskDayListen" },
    },
    
    AskWholeDayPrompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Will it take the whole day?" },
      },
      on: { SPEAK_COMPLETE: "AskWholeDayListen" },
    },
    AskWholeDayListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            console.log("NLU:", event.nluValue);
            return {
              lastResult: event.value,
              interpretation: event.nluValue,
            };
          }),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE : [
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === true,
            target: "ConfirmWholeDay",
            actions: assign({ wholeDay: true}),
          },
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === false,
            target: "AskTimePrompt",
            actions: assign({ wholeDay: false}),
          },
          { target: "AskWholeDayRetry" },
        ],
      },
    },
    AskWholeDayRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Will it take the whole day? Please give a yes or no answer.",         
        },
      },
      on: { SPEAK_COMPLETE: "AskWholeDayListen" },
    },    
    
    AskTimePrompt: {
      entry: {
        type: "spst.speak",
        params: { utterance: "What time is your meeting?" },
      },
      on: { SPEAK_COMPLETE: "AskTimeListen" },
    },
    AskTimeListen: {
      entry: { type: "spst.listen" },
      on: {
       RECOGNISED: {
          actions: assign(({ event }) => {
            console.log("NLU:", event.nluValue);
            return {
              lastResult: event.value,
              interpretation: event.nluValue,
            };
          }),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => !!getTime(context) || !!getUtterance(context),
            target: "ConfirmTime",
            actions: assign(({ context }) => ({
              time: getTime(context) ?? getUtterance(context),
            })),
          },
          { target: "AskTimeRetry" },  
        ],
      },
    },      

    AskTimeRetry: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Sorry I did not get the time. Could you please repeat?",
        },
      },
      on: { SPEAK_COMPLETE: "AskTimeListen" },
    },

    ConfirmTime: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.time}?`,
        }),
      },
      on: { SPEAK_COMPLETE: "ConfirmTimeListen"},
    },
    ConfirmTimeListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            console.log("NLU:", event.nluValue);
            return {
              lastResult: event.value,
              interpretation: event.nluValue,
            };
          }),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === true,
            target: "Booked",
            actions: assign({ answer: true }),
          },
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === false,
            target: "AskIntentPrompt",
            actions: assign(resetAppointment),
          },
          { target: "ConfirmTimeRetry" },
        ],
      },
    },
    ConfirmTimeRetry: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Please answer yes or no." },
      },
      on: { SPEAK_COMPLETE: "ConfirmTimeListen" },
    },
    ConfirmWholeDay: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`,
        }),
      },
      on: { SPEAK_COMPLETE: "ConfirmWholeDayListen" },
    },
    ConfirmWholeDayListen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => {
            console.log("NLU:", event.nluValue);
            return {
              lastResult: event.value,
              interpretation: event.nluValue,
            };
          }),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: null}),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === true,
            target: "Booked",
            actions: assign({ answer: true}),
          },
          {
            guard: ({ context }) => getAnswer(getUtterance(context)) === false,
            target: "AskIntentPrompt",
            actions: assign(resetAppointment),
          },
          { target: "ConfirmWholeDayRetry" },
        ],
      },
    },
    ConfirmWholeDayRetry: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Could you please answer with a yes or a no?" },
      },
      on: { SPEAK_COMPLETE: "ConfirmWholeDayListen" },
    },
      
    Booked: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Your appointment has been created!" },
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: {
      on: {
        CLICK: {
          target: "AskIntentPrompt",
          actions: assign(resetAppointment),
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

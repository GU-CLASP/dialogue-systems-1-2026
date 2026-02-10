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
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
  
  "07": { time: "07:00" },
  "08": { time: "08:00" },
  "09": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  "17": { time: "17:00" },
  "18": { time: "18:00" },
  "19": { time: "19:00" },
  "20": { time: "20:00" },
  "21": { time: "21:00" },
  "22": { time: "22:00" },
  "23": { time: "23:00" },
};

function isInGrammar(utterance: string) 
{
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) 
{
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getDay(utterance: string) 
{
  return (grammar[utterance.toLowerCase()] || {}).day;
}

function getTime(utterance: string) 
{
  return (grammar[utterance.toLowerCase()] || {}).time;
}

const dmMachine = setup
(
  {
    types: 
      {
        context: {} as DMContext,
        events: {} as DMEvents,
      },

    actions: 
      {
        "spst.speak": ({ context }, params: { utterance: string }) => context.spstRef.send
          (
            {
              type: "SPEAK",
              value: 
                {
                  utterance: params.utterance,
                },
            }
          ),

        "spst.listen": ({ context }) => context.spstRef.send
          (
            {
              type: "LISTEN",
            }
          ),
      },
  }
)

.createMachine({
  context: ({ spawn }) => 
    (
      {
        spstRef: spawn(speechstate, { input: settings }),
        lastResult: null,
        person: undefined,
        day: undefined,
        time: undefined,
        allDay: undefined,
      }
    ),
  
    id: "DM",
    initial: "Prepare",
    states: 
      {
        Prepare: 
          {
            entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
            on: { ASRTTS_READY: "WaitToStart" },
          },

        WaitToStart: 
          {
            on: { CLICK: "Greeting" },
          },

        Greeting: 
          {
            initial: "Prompt",
            on: 
              {
                LISTEN_COMPLETE: 
                [
                  {
                    //target: "CheckGrammar",
                    target: "#Who",
                    guard: ({ context }) => !!context.lastResult,
                  },
                  { 
                    target: ".NoInput" 
                  },
                ],
              },

            states: 
              {
                Prompt: 
                  {
                    entry: { type: "spst.speak", params: { utterance: `Hello!` } },
                    on: { SPEAK_COMPLETE: "Ask" },
                  },

                NoInput: 
                  {
                    entry: 
                      {
                        type: "spst.speak",
                        params: { utterance: `I can't hear you!` },
                      },
                    on: 
                      { SPEAK_COMPLETE: "Ask" },
                  },

                Ask: 
                {
                  entry: 
                    { type: "spst.listen" },
                  on: 
                    {
                      RECOGNISED:
                        {
                          actions: assign(({ event }) => 
                            {
                              return { lastResult: event.value };
                            }),
                        },
                      ASR_NOINPUT: 
                        {
                          actions: assign({ lastResult: null }),
                        },
                    },
                },
              },
          },

        Who: 
          {
            id: "Who",
            initial: "Prompt",
            states: 
              {
                Prompt: 
                  {
                    entry: { type: "spst.speak", params: { utterance: `Who are you meeting with?` } },
                    on: { SPEAK_COMPLETE: "Ask" },
                  },
              
                Ask: 
                  {
                    entry: 
                      { type: "spst.listen" },
                    on: 
                      {
                        RECOGNISED:
                          [ 
                            {
                              //TODO: this crashes
                              guard: (_, event:any) => !!getPerson(event.value[0].utterance),
                              actions:assign({
                                person: (_,event:any) => getPerson(event.value[0].utterance),
                                lastResult: (_, event:any) => event.value}),
                                //target: "#Day",
                            },
                            {
                              target: "Error",
                            },
                          ],
                          ASR_NOINPUT: "Error",
                      },
                  },
                Error:
                  {
                    entry: 
                      {
                        type: "spst.speak",
                        params: { utterance: `I don't recognize that person. Try again` },
                      },
                    on: 
                      { SPEAK_COMPLETE: "Ask"},
                  },
          },
        },
        CheckGrammar: 
          {
            entry: 
              {
                type: "spst.speak",
                params: ({ context }: {context: DMContext}) => 
                  ({
                    utterance: `You just said: ${context.lastResult![0].utterance}. And it 
                    ${isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"} in the grammar.`,
                  }),
              },

            on: 
              { SPEAK_COMPLETE: "Done" },
          },

        Done: 
          {
            on: 
              { CLICK: "Greeting", },
          },

        // BookAppointment: 
        //   { 
        //     initial: "Who",
        //     states:
        //       {
        //         Who: 
        //         {
        //           entry: { type: "spst.speak", params: { utterance: `Who are you meeting with?` } },
        //           on: 
        //             {
        //               RECOGNISED: 
        //                 {
        //                   actions: assign(({ event }) => 
        //                     ({
        //                       person: event.value[0].utterance,
        //                       lastResult: event.value,
        //                     })),
        //                   target: "Day",
        //                 },
        //                 ASR_NOINPUT: 
        //                   {
        //                     actions: assign({ person:undefined }),
        //                   },
        //             },
        //         },
        //         Day:
        //         {},
        //         AllDay:
        //         {
        //           // yes or no
        //         },
        //         Time:
        //         {},
        //         CreateAppointment:
        //         {
        //           //no tillbaka till who men yes till confirmation
        //         },
        //         Confirmation:
        //         {},
        //       },
        //   },
      },
});




const dmActor = createActor(dmMachine, {inspect: inspector.inspect,}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) 
{
  element.textContent = "Click to start";
  
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => 
    {
      const meta: { view?: string } = Object.values(
        snapshot.context.spstRef.getSnapshot().getMeta(),
      )[0] || {
        view: undefined,
      };
      element.innerHTML = `${meta.view}`;
    });
}

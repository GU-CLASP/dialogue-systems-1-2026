import {assign, createActor, log, setup} from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
      "https://switzerlandnorth.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};


const azureLanguageCredentials = {
  endpoint: "https://appointment-gus2026-lang.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
  key: NLU_KEY /** reference to your Azure CLU key */,
  deploymentName: "appointment-lab5" /** your Azure CLU deployment */,
  projectName: "appointment-gus2026-CLU" /** your Azure CLU project name */,
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  azureRegion: "switzerlandnorth",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};


function getEntity(entities: any, category: string) {
  /*
  This function extracts and returns the specified entity from the NLU.
   */
  return entities.find((e: any) => e.category === category)?.text;
}

function parseDateFromTimex(timex: string) {
  const datePart = timex.split("T")[0];
  const [, month, day] = datePart.split("-");
  const date = new Date(2026, parseInt(month)-1, parseInt(day));
  return date.toLocaleDateString("en-US", {month: "long", day: "numeric"}); // day only month and day
}

function parseTimeFromTimex(timex: string) {
  if (!timex.includes("T")) {
    return null;
  }
  const timePart = timex.split("T")[1];
  const [hours, minutes] = timePart.split(":").map(Number);
  const date = new Date(2026, 0, 1, hours, minutes);
  return date.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"});
}

function getDateEntity(entities: any[]) {
  /*
  This function extracts and returns the section of the entity related to date.
  If the utterance mentions a weekday word such as Monday, then the function will return that. Otherwise it will
  return the month and day mentioned.
   */
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const pureDate = entities.find((e:any) => e.extraInformation?.some((info: any) => info.value === "datetime.date"));
  if (pureDate) {
    // check if a weekday word was used in the utterance
    const lowerText = pureDate.text.toLowerCase();
    const weekday = weekdays.find(day => lowerText.includes(day));
    if (weekday) {
      return weekday
    }
  }

  const dateTime = entities.find((e:any) => e.extraInformation?.some((info: any) => info.value === "datetime.dateandtime"));
  if (dateTime) {
    // check if a weekday word was used in the utterance
    const lowerText = dateTime.text.toLowerCase();
    const weekday = weekdays.find(day => lowerText.includes(day));
    if (weekday) {
      return weekday
    }
    return parseDateFromTimex(dateTime.resolutions?.[0]?.timex);
  }

  return null;
}

function getTimeEntity(entities: any[]) {
  /*
  This function extracts and returns the section of the entity related to time.
   */
  // return entities.find((e:any) => e.extraInformation?.some((info: any) => info.value === "datetime.time"))?.text ?? null;
  const pureTime = entities.find((e:any) => e.extraInformation?.some((info: any) => info.value === "datetime.time"));
  if (pureTime) {
    return pureTime;
  }

  const dateTime = entities.find((e:any) => e.extraInformation?.some((info: any) => info.value === "datetime.dateandtime"));
  if (dateTime) {
    return parseTimeFromTimex(dateTime.resolutions?.[0]?.timex);
  }

  return null;
}


const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) => {
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      });
      console.log("Utterance: ", params.utterance);
    },
    "spst.listen": ({ context }) => {
      context.spstRef.send({
        type: "LISTEN",
      });
    },
    "spst.listen.nlu": ({ context }) => {
      context.spstRef.send({
        type: "LISTEN",
        value: {nlu: true},
      });
    },
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    person: null,
    day: null,
    wholeDay: null,
    affirmation: null,
    meetingTime: null,
    lastQuestionState: null as string | null
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
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello!` } },
          on: { SPEAK_COMPLETE: "AskAction" },
        },
        AskAction: {
          entry: [
            { type: "spst.speak", params: { utterance: `What can I help you with?` } }
          ],
          on: { SPEAK_COMPLETE: "ActionResponse" },
        },
        ConfirmProvider: {
          entry: [
            { type: "spst.speak", params: { utterance: `Who are you meeting with?` } }
          ],
          on: { SPEAK_COMPLETE: "ProviderResponse" },
        },
        ConfirmWeekday: {
          entry: [
            ({ context }) => {
              console.log("in ConfirmWeekday entry: ", context.spstRef.getSnapshot().value)
            },
            { type: "spst.speak", params: { utterance: `On which day is your meeting?` } }
          ],
          on: { SPEAK_COMPLETE: "WeekdayResponse" },
        },
        ConfirmDuration: {
          entry: { type: "spst.speak", params: { utterance: `Will it take the whole day?` } },
          on: { SPEAK_COMPLETE: "DurationResponse" },
        },
        ConfirmMeetingTime: {
          entry: { type: "spst.speak", params: { utterance: `What time is your meeting?` } },
          on: { SPEAK_COMPLETE: "MeetingTimeResponse" },
        },
        ActionResponse: {
          entry: [
            { type: "spst.listen.nlu" },
            ({ context, event}) => {
              console.log("Entering NLU Action Response state", {context, event});
            },
          ],
          on: {
            RECOGNISED: [{
              // handle CreateMeeting intent
              guard: ({event}) => {
                console.log("Full event: ", JSON.stringify(event, null, 2));
                const action = event.nluValue.topIntent;
                return action === "CreateMeeting";
              },
              actions: [
                assign(({ event }) => {
                  const nluValue = (event as any).nluValue;
                  const entities = nluValue.entities;
                  const extractedTime = getTimeEntity(entities) ?? null;
                  return {
                    lastResult: event.value,
                    person: getEntity( entities, "Person"),
                    day: getDateEntity( entities),
                    meetingTime: extractedTime,
                    wholeDay: extractedTime ? false : null, // if a specific time is given, automatically set wholeDay to false
                  };
                }),
              ],
              target: "WaitForSpeechIdleAfterAction"
            },
              {
                // handle WhoIsX intent
                guard: ({ event}) => (event as any).nluValue?.topIntent === "WhoIsX",
                actions: assign(({ event}) => {
                  const entities = (event as any).nluValue?.entities ?? [];
                  const extractedPerson = getEntity(entities, "Person") ?? null;
                  return {
                    lastResult: event.value,
                    person: extractedPerson,
                  };
                }) ,
                target: "WaitForWhoIsX"
              },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForActionReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForActionReprompt"
            },
          },
        },
        ProviderResponse: {
          entry: [
              { type: "spst.listen.nlu" },
            ({ context, event}) => {
            console.log("Entering Provider state", {context, event});
            },
          ],
          on: {
            RECOGNISED: [{
              // check if the response is a valid person
              guard: ({event}) => {
                const entities = ( event as any).nluValue?.entities ?? [];
                return getEntity(entities, "Person") != null;
              },
              actions: [
                assign(({ event }) => {
                  const entities = ( event as any).nluValue?.entities ?? [];
                  return {
                    lastResult: event.value,
                    person: getEntity(entities, "Person") ?? null,
                  };
                }),
              ],
              target: "WaitForSpeechIdleAfterProvider"
            },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForProviderReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForProviderReprompt"
            },
          },
        },
        WaitForProviderReprompt: {
          on: {
            LISTEN_COMPLETE: "ProviderReprompt"
          }
        },
        ProviderReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. Who are you meeting with?"} },
          on: { SPEAK_COMPLETE: "ProviderResponse"}
        },
        WaitForActionReprompt: {
          on: {
            LISTEN_COMPLETE: "ActionReprompt"
          }
        },
        ActionReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. What can I help you with?"} },
          on: { SPEAK_COMPLETE: "ActionResponse"}
        },
        WaitForSpeechIdleAfterProvider: {
          on: {
            LISTEN_COMPLETE: "CheckSlots"
          }
        },
        WaitForSpeechIdleAfterAction: {
          on: {
            LISTEN_COMPLETE: "CheckSlots"
          }
        },
        WaitForWhoIsX: {
          on: {
            LISTEN_COMPLETE: "WhoIsX"
          }
        },
        WhoIsX: {
          entry: {
            type: "spst.speak",
            params: ({ context}) => ({
              utterance: context.person ? `${context.person} is a person who you can schedule a meeting with.` : `I don't know who that is, sorry.`
            })
          },
          on: { SPEAK_COMPLETE: "AskAction"}
        },
        CheckSlots: {
          always: [
              // person is missing -> ask for person
            {
              guard: ({ context }) => !context.person,
              target: "ConfirmProvider"
            },
            // day is missing -> ask for day
            {
              guard: ({ context }) => !context.day,
              target: "ConfirmWeekday"
            },
            // wholeDay is mising -> ask if it will take the whole day
            {
              guard: ({ context }) => context.wholeDay === null,
              target: "ConfirmDuration"
            },
            // wholeDay is false, and meeting time is missing -> ask what time the meeting is
            {
              guard: ({ context }) => context.wholeDay === false && !context.meetingTime,
              target: "ConfirmMeetingTime"
            },
            // all slots filled -> check which final confirmation to go to
            {
              target: "CheckFinalConfirmation"
            },
          ]
        },
        CheckFinalConfirmation: {
          always: [
            // whole day is true
            {
              guard: ({ context }) => context.wholeDay === true,
              target: "FinalConfirmationWholeDay"
            },
            // specific time slot given
            {
              target: "FinalConfirmationMeetingTime"
            },
          ]
        },
        MeetingTimeResponse: {
          entry: { type: "spst.listen.nlu" },
          on: {
            RECOGNISED: [{
              guard: ({ event }) => {
                const entities = (event as any).nluValue?.entities ?? [];
                return getTimeEntity(entities) != null;
              },
              actions: [
                assign(({ event }) => {
                  const entities = (event as any).nluValue?.entities ?? [];
                  return {
                    lastResult: event.value,
                    meetingTime: getTimeEntity(entities) ?? null,
                  };
                }),
              ],
              target: "WaitForSpeechIdleAfterMeetingTime"
            },
              {
                // response not recognized
                target: "WaitForTimeReprompt"
              }],
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForTimeReprompt"
            },
          },
        },
        WaitForSpeechIdleAfterMeetingTime: {
          on: {
            LISTEN_COMPLETE: "CheckSlots"
          }
        },
        WaitForTimeReprompt: {
          on: {
            LISTEN_COMPLETE: "TimeReprompt"
          }
        },
        TimeReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. What time is your meeting?"} },
          on: { SPEAK_COMPLETE: "MeetingTimeResponse"}
        },
        WeekdayResponse: {
          entry: { type: "spst.listen.nlu" },
          on: {
            RECOGNISED: [{
              // check if the response is a valid day
              guard: ({event}) => {
                const entities = ( event as any).nluValue?.entities ?? [];
                console.log("WeekdayResponse event: ", JSON.stringify(event, null, 2));
                return getDateEntity(entities) != null;
                },
              actions: [
                assign(({ event }) => {
                  const entities = ( event as any).nluValue?.entities ?? [];
                  console.log("*** date entity: ", getDateEntity(entities));
                  return {
                    lastResult: event.value,
                    day: getDateEntity(entities),
                  };
                }),
              ],
              // state successful
              target: "WaitForSpeechIdleAfterWeekday"
            },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForWeekdayReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForWeekdayReprompt"
            },
          },
        },
        WaitForWeekdayReprompt: {
          on: {
            LISTEN_COMPLETE: "WeekdayReprompt"
          }
        },
        WeekdayReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. On which day is your meeting?"} },
          on: { SPEAK_COMPLETE: "WeekdayResponse"}
        },
        WaitForSpeechIdleAfterWeekday: {
          on: {
            LISTEN_COMPLETE: "CheckSlots"
          }
        },
        DurationResponse: {
          entry: { type: "spst.listen.nlu" },
          on: {
            RECOGNISED: [{
              // check if the person responded yes
              guard: ({event}) => ( event as any).nluValue?.topIntent === "Agree",
              actions: [
                assign(({ event }) => {
                  return {
                    lastResult: event.value,
                    wholeDay: true
                  };
                }),
              ],
              target: "WaitForSpeechIdleAfterDuration"
            },
              {
                // check if the person responded no
                guard: ({event}) => ( event as any).nluValue?.topIntent === "Disagree",
                actions: [
                  assign(({ event }) => {
                    return {
                      lastResult: event.value,
                      wholeDay: false
                    };
                  }),
                ],
                target: "WaitForConfirmMeetingTime"
              },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForDurationReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForDurationReprompt"
            },
          },
        },
        WaitForSpeechIdleAfterDuration: {
          on: {
            LISTEN_COMPLETE: "CheckSlots"
          }
        },
        WaitForDurationReprompt: {
          on: {
            LISTEN_COMPLETE: "DurationReprompt"
          }
        },
        DurationReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. Will it take the whole day?"} },
          on: { SPEAK_COMPLETE: "DurationResponse"}
        },
        FinalConfirmationWholeDay: {
          entry: {
            type: "spst.speak",
            params:  ( {context}) => ({
              utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`
            })
          },
          on: { SPEAK_COMPLETE: "FinalConfirmResponse" },
        },
        FinalConfirmationMeetingTime: {
          entry: {
            type: "spst.speak",
            params:  ( {context}) => ({
              utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.meetingTime}?`
            })
          },
          on: { SPEAK_COMPLETE: "FinalConfirmResponse" },
        },
        FinalConfirmResponse: {
          entry: { type: "spst.listen.nlu"},
          on: {
            RECOGNISED: [
              {
                // answers yes
                guard: ({ event }) => ( event as any).nluValue?.topIntent === "Agree",
                actions: assign(({event}) => ({
                  lastResult: event.value,
                  affirmation: true
                })),
                target: "WaitForGoodbye"
              },
              {
                // answers no
                guard: ({ event }) => ( event as any).nluValue?.topIntent === "Disagree",
                actions: assign(({event}) => ({
                  lastResult: event.value,
                  affirmation: false
                })),
                target: "WaitForSpeechIdleRetry"
              },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForFinalConfirmReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForFinalConfirmReprompt"
            },
          }
        },
        WaitForFinalConfirmReprompt: {
          on: {
            LISTEN_COMPLETE: "FinalConfirmReprompt"
          }
        },
        FinalConfirmReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. Can you repeat that please?"} },
          on: { SPEAK_COMPLETE: "FinalConfirmResponse"}
        },
        WaitForSpeechIdleRetry: {
          on: {
            // go back to step 2 (asking who they are meeting with)
            LISTEN_COMPLETE: "AskAction"
          }
        },
        WaitForGoodbye: {
          on: {
            LISTEN_COMPLETE: "Goodbye"
          }
        },
        WaitForConfirmMeetingTime: {
          on: {
            LISTEN_COMPLETE: "ConfirmMeetingTime"
          }
        },
        Goodbye: {
          entry: { type: "spst.speak", params: { utterance: `Your appointment has been created!` } },
          on: { SPEAK_COMPLETE: { target: "#DM.Done"} },
        },
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
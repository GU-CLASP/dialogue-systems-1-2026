import {assign, createActor, log, setup} from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

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
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  affirmation?: boolean;
  wholeDay?: boolean;
  meetingTime?: string;
}

const weekdayGrammar: { [index: string]: GrammarEntry } = {
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
};

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  anna: { person: "Anna Banana" },
  steve: { person: "Steve Carell" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
  yes: { affirmation: true},
  yep: { affirmation: true},
  yeah: { affirmation: true},
  right: { affirmation: true},
  correct: { affirmation: true},
  no: { affirmation: false},
  nope: { affirmation: false},
  nah: { affirmation: false},
  wrong: { affirmation: false},
  incorrect: { affirmation: false},
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getDay(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).day;
}

function getAffirmation(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).affirmation;
}

function getTime(utterance: string) {
  /* VG part - extending the getTime function to make it more flexible.
  The getTime function is able to handle times in the following formats:
      - 9:30
      - 1523
      - 5 o'clock
      - 2
      - 14
      - 5:35 pm

   Note: it also works if someone says "half past x" or "quarter past x" because
   speechstate already parses those utterances into the correct time format.

   Area for improvement: a problem with the current solution is that if someone says "half past three"
   the interprets it as 03:30. However, most likely the person meant 15:30...
   It is a little tricky to implement logic for when someone is speaking in 24h format if they didn't say AM/PM and
   you don't have more context.
  */

  // return null if there is no input
  if (!utterance) return null;
  // clean the input: make it lowercase, remove the word "o'clock" if it is present, remove whitespaces
  const utterance_clean = utterance.toLowerCase().replace(/o\s?clock/, "o'clock").replace(/\s+/g, "").trim();

  // handle utterance with semicolon. Eg. 13:45
  const semicolonMatch = utterance_clean.match(/^(\d{1,2}):(\d{2})$/);

  if (semicolonMatch) {
    let hour = parseInt(semicolonMatch[1], 10);
    const minutes = parseInt(semicolonMatch[2], 10);

    // make sure hour and minutes are valid numbers
    if (hour > 23 || minutes > 59) return null;

    return `${hour.toString().padStart(2,"0")}: ${minutes.toString().padStart(2,"0")}`;
  }

  // handle all-digit utterance. Eg 1345
  if (/^\d{3,4}$/.test(utterance_clean)) {
    let hour: number;
    let minutes: number;

    if (utterance_clean.length === 3) {
      // time is in format: 930 or 245
      hour = parseInt(utterance_clean.slice(0, 1), 10);
      minutes = parseInt(utterance_clean.slice(1), 10);
    } else {
      // time is in format: 1130 or 2245
      hour = parseInt(utterance_clean.slice(0, 2), 10);
      minutes = parseInt(utterance_clean.slice(2), 10);
    }

    // check that hours and minutes are within the appropriate ranges
    if ( hour <= 23 && minutes <= 59) {
      const formatted = `${hour.toString().padStart(2,"0")}: ${minutes.toString().padStart(2,"0")}`;

      return formatted;
    }
    return null;
  }

  // handles if the utterance was just a single number. For example, 14 or 2
  if (/^\d{1,2}$/.test(utterance_clean)) {
    let hour = parseInt(utterance_clean, 10);

    if (hour <= 23) {
      return `${hour.toString().padStart(2, "0")}:00`;
    }
    return null;
  }

  // handle if the utterance uses AM or PM
  const ampmMatch = utterance_clean.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    let minutes = parseInt(ampmMatch[2], 10);
    const meridiem = ampmMatch[3];

    // check that hours and minutes are within the appropriate ranges
    if ( hour > 23 || minutes > 59) return null;

    if (hour === 12) {
      hour = meridiem === "am" ? 0 : 12;
    } else if (meridiem === "pm") {
      hour += 12;
    }

    return `${hour.toString().padStart(2,"0")}: ${minutes.toString().padStart(2,"0")}`;
  }

  return (grammar[utterance.toLowerCase()] || {}).time;
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
    "spst.listen": ({ context }) =>
        context.spstRef.send({
          type: "LISTEN",
        }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    person: null,
    day: null,
    time: null,
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
          entry: { type: "spst.speak", params: { utterance: `Let's create an appointment` } },
          on: { SPEAK_COMPLETE: "ConfirmProvider" },
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
        // NoInput: {
        //   entry: {
        //     type: "spst.speak",
        //     params: { utterance: `I can't hear you!` },
        //   },
        //   on: { SPEAK_COMPLETE: "Ask" },
        // },
        ProviderResponse: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [{
              // check if the response is a valid person
              guard: ({event}) => { return getPerson(event.value[0].utterance) !== undefined},
              actions: [
                  assign(({ event }) => {
                    const utterance = event.value[0].utterance;
                    return {
                      lastResult: event.value,
                      person: getPerson(utterance)
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
        // note: commented out the below states, they don't work. Tried to dynamically reference the previous state when needing to reprompt.
        // Reprompt: {
        //   entry: { type: "spst.speak", params: { utterance: `Sorry, I didn't understand that. Could you repeat please?` } },
        //   on: { SPEAK_COMPLETE: "PreviousQuestion"}
        // },
        // // add a history node to go back to the previous question when an utterance is unclear/missing
        // PreviousQuestion: {
        //   type: "history", history: "shallow"
        // }
        WaitForProviderReprompt: {
          on: {
            LISTEN_COMPLETE: "ProviderReprompt"
          }
        },
        ProviderReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. Who are you meeting with?"} },
          on: { SPEAK_COMPLETE: "ProviderResponse"}
        },
        WaitForSpeechIdleAfterProvider: {
          on: {
            LISTEN_COMPLETE: "ConfirmWeekday"
          }
        },
        MeetingTimeResponse: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [{
              guard: ({ event }) => {
                const utterance = event.value[0].utterance;
                const parsed = getTime(utterance);
                return parsed != null;
                //getTime(event.value[0].utterance) !== null
              },
              actions: [
                assign(({ event }) => {
                  const utterance = event.value[0].utterance;
                  console.log("Assigning meeting time: ", utterance);
                  return {
                    lastResult: event.value,
                    meetingTime: getTime(utterance)
                  };
                }),
              ],
              target: "WaitForFinalConfirmationMeetingTime"
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
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [{
              // check if the response is a valid day
              guard: ({event}) => { return getDay(event.value[0].utterance.toLowerCase()) !== undefined;},
              actions: [
                  assign(({ event }) => {
                    const utterance = event.value[0].utterance;
                    return {
                      lastResult: event.value,
                      day: getDay(utterance)
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
            LISTEN_COMPLETE: "ConfirmDuration"
          }
        },
        DurationResponse: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [{
              // check if the person responded yes
              guard: ({event}) => getAffirmation(event.value[0].utterance) === true,
              actions: [
                  assign(({ event }) => {
                  const utterance = event.value[0].utterance;
                  return {
                    lastResult: event.value,
                    wholeDay: getAffirmation(utterance)
                  };
                }),
              ],
              target: "WaitForFinalConfirmationWholeDay"
            },
              {
                // check if the person responded no
                guard: ({event}) => getAffirmation(event.value[0].utterance) === false,
                actions: [
                  assign(({ event }) => {
                    const utterance = event.value[0].utterance;
                    return {
                      lastResult: event.value,
                      wholeDay: getAffirmation(utterance)
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
        WaitForDurationReprompt: {
          on: {
            LISTEN_COMPLETE: "DurationReprompt"
          }
        },
        DurationReprompt: {
          entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that. Will it take the whole day?"} },
          on: { SPEAK_COMPLETE: "DurationResponse"}
        },
        WaitForFinalConfirmationWholeDay: {
          on: {
            LISTEN_COMPLETE: "FinalConfirmationWholeDay"
          }
        },
        WaitForFinalConfirmationMeetingTime: {
          on: {
            LISTEN_COMPLETE: "FinalConfirmationMeetingTime"
          }
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
          entry: { type: "spst.listen"},
          on: {
            RECOGNISED: [
              {
                // answers yes
                guard: ({ event }) => getAffirmation(event.value[0].utterance) === true,
                actions: assign(({event}) => ({
                  lastResult: event.value,
                  affirmation: getAffirmation(event.value[0].utterance)
                })),
                target: "WaitForGoodbye"
              },
              {
                // answers no
                guard: ({ event }) => getAffirmation(event.value[0].utterance) === false,
                actions: assign(({event}) => ({
                  lastResult: event.value,
                  affirmation: getAffirmation(event.value[0].utterance)
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
            LISTEN_COMPLETE: "ConfirmProvider"
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
        // Ask: {
        //   entry: { type: "spst.listen" },
        //   on: {
        //     RECOGNISED: {
        //       actions: assign(({ event }) => {
        //         return { lastResult: event.value };
        //       }),
        //     },
        //     ASR_NOINPUT: {
        //       actions: assign({ lastResult: null }),
        //     },
        //   },
        // },
      },
    },
    CheckGrammar: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
              isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
          } in the grammar.`,
        }),
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

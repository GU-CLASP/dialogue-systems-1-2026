import { assign, createActor, fromPromise, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NINJA_API_KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents, Entity, NLUObject } from "./types";
import { prompts } from "./prompts";

const inspector = createBrowserInspector({
  filter: (inspectEvent: any) => {
    if (
      inspectEvent.type === "@xstate.event" &&
      !inspectEvent.event?.type.includes("xstate")
    ) {
      console.log("🖥️ [DM] Event:", inspectEvent.event);
    }
    return true; // Return true to ensure the event still goes to the visualizer
  },
});

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint:
    "https://lt2216.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "Lab-5",
  projectName: "Lab-5",
};

const settings: Settings = {
  azureLanguageCredentials,
  azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-JaneNeural",
};

// checks if a datetime entity from the nlu matches the specific target we need (date or time).
// e.g. if target is `date`, it accepts `datetime.date` or combined types like `datetime.datetime`.
// e.g. if target is `time` but the user just said `tomorrow` (datetime.date), it returns false.
const isDateTimeMatch = (subType: string, target: string) => {
  const isCombined =
    subType === "datetime.datetime" || subType === "datetime.dateandtime";

  if (target === "date") return subType === "datetime.date" || isCombined;
  if (target === "time") return subType === "datetime.time" || isCombined;

  return false;
};

// extracts the normalized value from an entity, falling back to the raw spoken text if missing.
// e.g. extracts `2024-05-20` from a date entity instead of the spoken word `tomorrow`.
// if nlu returns a combined date and time string (e.g. `2024-05-20 17:00:00`), it splits it and returns just the requested half.
const getEntityValue = (entity: Entity, targetCategory: string) => {
  const resolution = entity.resolutions?.[0]?.value;

  if (resolution === "not resolved") {
    return "not resolved";
  }

  // fallback to spoken text if the NLU didn't provide a resolved value
  if (resolution === null || resolution === undefined) {
    return entity.text;
  }

  const category = entity.category.toLowerCase();

  const isCombinedDateTime =
    category === "datetime" &&
    typeof resolution === "string" &&
    resolution.includes(" ");

  if (
    isCombinedDateTime &&
    (targetCategory === "date" || targetCategory === "time")
  ) {
    const [datePart, timePart] = resolution.split(" ");
    return targetCategory === "date" ? datePart : timePart;
  }

  return resolution;
};

// searches the nlu result for a specific entity category (like `person` or `time`).
// e.g. extractEntity(event, "person") looks for an entity categorized as "person".
// handles `datetime` as a special case since azure clu groups dates and times together.
const extractEntity = <T extends string | boolean = string>(
  event: { nluValue?: NLUObject },
  category: string,
): T | null => {
  const entities = event?.nluValue?.entities;
  if (!entities?.length) return null;

  const targetCategory = category.toLowerCase();

  const entity = entities.find((e) => {
    const myCategory = e.category.toLowerCase();

    if (myCategory === "datetime") {
      const subType = (e.extraInformation?.[0]?.value as string) ?? "";
      return isDateTimeMatch(subType, targetCategory);
    }

    return myCategory === targetCategory;
  });

  return entity ? (getEntityValue(entity, targetCategory) as T) : null;
};

// extracts the person to search for if the user's intent is "WhoIs".
const extractTargetPerson = (event: {
  nluValue?: NLUObject;
}): string | null => {
  if (event.nluValue?.topIntent !== "WhoIs") return null;

  return extractEntity<string>(event, "Person");
};

const fetchCelebrityDetails = async (person: string) => {
  try {
    const response = await fetch(
      `https://api.api-ninjas.com/v1/celebrity?name=${person}`,
      {
        headers: { "X-Api-Key": NINJA_API_KEY },
      },
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("fetch celebrity error:", error);
    throw error;
  }
};

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actors: {
    fetchCelebrityDetails: fromPromise(
      ({ input }: { input: { person: string } }) =>
        fetchCelebrityDetails(input.person),
    ),
  },
  guards: {
    isIntentCreateMeeting: ({ context }) =>
      context.interpretation?.topIntent === "CreateMeeting",
    isIntentWhoIs: ({ context }) =>
      context.interpretation?.topIntent === "WhoIs",
    hasAllMeetingDetails: ({ context }) =>
      !!context.meetingDetails?.person &&
      !!context.meetingDetails?.date &&
      !!context.meetingDetails?.time &&
      context.meetingDetails?.date !== "not resolved" &&
      context.meetingDetails?.time !== "not resolved",
    hasConfirmed: ({ context }) => {
      const intent = context.interpretation?.topIntent;
      const value = extractEntity<boolean>(
        { nluValue: context.interpretation! },
        "Yes-No",
      );
      return intent === "ConfirmAction" && value === true;
    },
    hasDenied: ({ context }) => {
      const intent = context.interpretation?.topIntent;
      const value = extractEntity<boolean>(
        { nluValue: context.interpretation! },
        "Yes-No",
      );
      return intent === "ConfirmAction" && value === false;
    },
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) => {
      if (!params.utterance) return;
      console.log("DM speaking:", params.utterance);
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      });
    },
    "spst.listen": ({ context }) =>
      context.spstRef.send({ type: "LISTEN", value: { nlu: true } }),
    "spst.recognised": assign(({ event, context }) => {
      if (event.type !== "RECOGNISED") return {};

      const targetPersonName = extractTargetPerson(event);

      const person =
        extractEntity(event, "Person") ??
        context.meetingDetails?.person ??
        null;

      const date =
        extractEntity(event, "Date") ?? context.meetingDetails?.date ?? null;

      const time =
        extractEntity(event, "Time") ?? context.meetingDetails?.time ?? null;

      return {
        interpretation: event.nluValue,
        targetPersonName,
        meetingDetails: {
          ...context.meetingDetails,
          person,
          date,
          time,
        },
      };
    }),
    "spst.clearTurn": assign({
      interpretation: null,
      targetPersonName: null,
    }),
    "spst.resetSession": assign({
      interpretation: null,
      targetPersonName: null,
      personDetails: null,
      error: null,
      meetingDetails: null,
    }),
    "spst.clearInvalidDate": assign({
      meetingDetails: ({ context }) => ({
        ...context.meetingDetails!,
        date: null,
      }),
    }),
    "spst.clearInvalidTime": assign({
      meetingDetails: ({ context }) => ({
        ...context.meetingDetails!,
        time: null,
      }),
    }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    interpretation: null,
    targetPersonName: null,
    personDetails: null,
    error: null,
    meetingDetails: null,
  }),
  id: "DM",
  initial: "Prepare",
  on: {
    RECOGNISED: { actions: "spst.recognised" },
  },
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Greeting" },
    },
    CreateMeeting: {
      initial: "CheckInitialSlots",
      states: {
        CheckInitialSlots: {
          always: [
            { target: "ConfirmMeeting", guard: "hasAllMeetingDetails" },
            { target: "Prompt" },
          ],
        },
        Prompt: {
          entry: [
            {
              type: "spst.speak",
              params: { utterance: prompts.createMeetingPrompt },
            },
          ],
          on: { SPEAK_COMPLETE: "CheckPerson" },
        },
        CheckPerson: {
          always: [
            {
              target: "CheckDate",
              guard: ({ context }) => !!context.meetingDetails?.person,
            },
            { target: "AskPerson" },
          ],
        },
        AskPerson: {
          entry: [
            { type: "spst.speak", params: { utterance: prompts.askPerson } },
          ],
          on: { SPEAK_COMPLETE: "Listen" },
        },
        CheckDate: {
          always: [
            {
              target: "InvalidDate",
              guard: ({ context }) =>
                context.meetingDetails?.date === "not resolved",
            },
            {
              target: "CheckTime",
              guard: ({ context }) => !!context.meetingDetails?.date,
            },
            { target: "AskDate" },
          ],
        },
        InvalidDate: {
          entry: [
            { type: "spst.speak", params: { utterance: prompts.invalidDate } },
            "spst.clearInvalidDate",
          ],
          on: { SPEAK_COMPLETE: "Listen" },
        },
        AskDate: {
          entry: [
            { type: "spst.speak", params: { utterance: prompts.askDate } },
          ],
          on: { SPEAK_COMPLETE: "Listen" },
        },
        CheckTime: {
          always: [
            {
              target: "InvalidTime",
              guard: ({ context }) =>
                context.meetingDetails?.time === "not resolved",
            },
            {
              target: "ConfirmMeeting",
              guard: ({ context }) => !!context.meetingDetails?.time,
            },
            { target: "AskTime" },
          ],
        },
        InvalidTime: {
          entry: [
            { type: "spst.speak", params: { utterance: prompts.invalidTime } },
            "spst.clearInvalidTime",
          ],
          on: { SPEAK_COMPLETE: "Listen" },
        },
        AskTime: {
          entry: [
            { type: "spst.speak", params: { utterance: prompts.askTime } },
          ],
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              {
                target: "CheckPerson",
                guard: ({ context }) => !!context.interpretation,
              },
              { target: "NoInput" },
            ],
            ASR_NOINPUT: { actions: "spst.clearTurn" },
          },
        },
        NoInput: {
          entry: [
            { type: "spst.speak", params: { utterance: prompts.noInput } },
          ],
          on: { SPEAK_COMPLETE: "CheckPerson" },
        },
        ConfirmMeeting: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: prompts.confirmMeeting(
                  context.meetingDetails?.person ?? "",
                  context.meetingDetails?.date ?? "",
                  context.meetingDetails?.time ?? "",
                ),
              }),
            },
          ],
          on: { SPEAK_COMPLETE: "ListenToConfirm" },
        },
        ListenToConfirm: {
          entry: { type: "spst.listen" },
          on: {
            LISTEN_COMPLETE: [
              { target: "MeetingBooked", guard: "hasConfirmed" },
              { target: "MeetingCancelled", guard: "hasDenied" },
              {
                target: "NoInput",
                guard: ({ context }) => !context.interpretation,
              },
              { target: "ConfirmMeeting" },
            ],
            ASR_NOINPUT: { actions: "spst.clearTurn" },
          },
        },
        MeetingBooked: {
          entry: [
            {
              type: "spst.speak",
              params: { utterance: prompts.meetingBooked },
            },
          ],
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
        MeetingCancelled: {
          entry: [
            {
              type: "spst.speak",
              params: { utterance: prompts.meetingCancelled },
            },
          ],
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
      },
    },
    WhoIs: {
      initial: "Prompt",
      states: {
        Prompt: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: prompts.whoIsPrompt(context.targetPersonName),
              }),
            },
          ],
          on: {
            SPEAK_COMPLETE: [
              {
                target: "FindOutWho",
                guard: ({ context }) => !!context.targetPersonName,
              },
              { target: "#DM.Greeting.Listen" },
            ],
          },
        },
        FindOutWho: {
          invoke: {
            src: "fetchCelebrityDetails",
            input: ({ context }) => ({
              person: context.targetPersonName ?? "",
            }),
            onDone: [
              {
                target: "Success",
                actions: assign({
                  personDetails: ({ event }) => event.output[0],
                }),
                guard: ({ event }) => event.output?.length > 0,
              },
              { target: "Failure" },
            ],
            onError: {
              target: "Failure",
              actions: assign({ error: ({ event }) => event.error }),
            },
          },
        },
        Success: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: prompts.whoIsResult(context.personDetails),
              }),
            },
          ],
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
        Failure: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: prompts.whoIsFailure(context.targetPersonName),
              }),
            },
          ],
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
      },
    },
    Greeting: {
      initial: "Prompt",
      entry: "spst.resetSession",
      on: {
        LISTEN_COMPLETE: [
          { target: "CreateMeeting", guard: "isIntentCreateMeeting" },
          { target: "WhoIs", guard: "isIntentWhoIs" },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: { utterance: prompts.greeting },
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listen" },
          on: {
            ASR_NOINPUT: { actions: "spst.clearTurn" },
          },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: prompts.noInput } },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },
    Done: {
      on: { CLICK: "Greeting" },
    },
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((snapshot) => {
  console.group("State update");
  console.log("🖥️ [DM] State:", snapshot.value);
  console.log("🖥️ [DM] Context:", snapshot.context);

  // const spstSnapshot = snapshot.context.spstRef?.getSnapshot();
  // if (spstSnapshot) console.log("🔊 [SpeechState] Value:", spstSnapshot.value);

  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    console.log("Button clicked!");
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const spstSnap = snapshot.context.spstRef.getSnapshot();
    const meta = Object.values(spstSnap.getMeta() as Record<string, any>)[0] as
      | { view?: string }
      | undefined;
    element.innerHTML = meta?.view ?? "";
  });
}

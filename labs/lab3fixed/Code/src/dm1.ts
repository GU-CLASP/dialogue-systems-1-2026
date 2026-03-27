import { createActor, setup, assign } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { KEY } from "./azure";

// ---------------- SETTINGS ----------------
const settings: Settings = {
  azureCredentials: {
    endpoint:
      "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
    key: KEY,
  },
  azureRegion: "swedencentral",
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
  asrDefaultNoInputTimeout: 10000,
};

// ---------------- GRAMMAR ----------------
const grammar: Record<string, any> = {
  // People
  vlad: { person: "Vladislav Maraev" },
  vladislav: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  talha: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  sarah: { person: "Sarah connor" },
  anna: { person: "Anna john" },
  peter: { person: "Peter James" },
  max: { person: "maxine" },


  // Days
  monday: { day: "Monday" },
  mon: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  tues: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  wed: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  thurs: { day: "Thursday" },
  friday: { day: "Friday" },
  fri: { day: "Friday" },

  // Times
  ten: { time: "10:00" },
  "ten o'clock": { time: "10:00" },
  eleven: { time: "11:00" },
  "eleven o'clock": { time: "11:00" },
  twelve: { time: "12:00" },
  noon: { time: "12:00" },
  "10": { time: "10:00" },
  "11": {time: "11:00"},
  "12": { time: "12:00" },


  // Confirm
  yes: { confirm: true },
  yeah: { confirm: true },
  yep: { confirm: true },
  correct: { confirm: true },
  no: { confirm: false },
  nope: { confirm: false },
  wrong: { confirm: false },
};

const getUtterance = (event: any): string =>
  event.value?.[0]?.utterance?.toLowerCase().trim() ?? "";

// Helper: send SPEAK with 500ms delay to avoid race conditions
const speak = (context: any, utterance: string) => {
  setTimeout(() => {
    context.spstRef.send({ type: "SPEAK", value: { utterance } });
  }, 500);
};

// ---------------- MACHINE ----------------
const dmMachine = setup({
  types: {} as {
    context: {
      spstRef: any;
      person?: string;
      day?: string;
      time?: string;
    };
  },
  actors: { speechstate },
}).createMachine({
  id: "DM",
  initial: "Prepare",

  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
  }),

  states: {
    Prepare: {
      entry: [
        () => console.log("[PREPARE] Sending PREPARE to speech actor..."),
        ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      ],
      on: {
        ASRTTS_READY: {
          target: "Idle",
          actions: () => console.log("[PREPARE] ✅ Speech system ready!"),
        },
      },
    },

    Idle: {
      entry: () => console.log("[IDLE] Ready — click the button to start."),
      on: { CLICK: "Greeting" },
    },

    Greeting: {
      entry: ({ context }) =>
        speak(context, "Hello! Welcome to the application booking system."),
      on: { SPEAK_COMPLETE: "AskPerson" },
    },

    // ── PERSON ────────────────────────────────────────────
    AskPerson: {
      entry: ({ context }) =>
        speak(context, "Who would you like to meet?"),
      on: { SPEAK_COMPLETE: "ListenPerson" },
    },

    ListenPerson: {
      entry: ({ context }) => context.spstRef.send({ type: "LISTEN" }),
      on: {
        SPEAK_COMPLETE: undefined,
        RECOGNISED: [
          {
            // Word found in grammar → store and proceed
            guard: ({ event }) => !!grammar[getUtterance(event)]?.person,
            actions: assign(({ event }) => ({
              person: grammar[getUtterance(event)]?.person,
            })),
            target: "AskDay",
          },
          {
            // Word NOT in grammar → tell the user and re-ask
            target: "NotRecognisedPerson",
          },
        ],
        NOINPUT: "AskPerson",
      },
    },

    NotRecognisedPerson: {
      // Speaks an informative rejection message, then goes back to AskPerson
      entry: ({ context }) =>
        speak(
          context,
          "Sorry, I did not recognise that name. Please say one of: vlad, bora, tal, or tom."
        ),
      on: { SPEAK_COMPLETE: "AskPerson" },
    },

    // ── DAY ───────────────────────────────────────────────
    AskDay: {
      entry: ({ context }) =>
        speak(context, "Which day works for you?"),
      on: { SPEAK_COMPLETE: "ListenDay" },
    },

    ListenDay: {
      entry: ({ context }) => context.spstRef.send({ type: "LISTEN" }),
      on: {
        SPEAK_COMPLETE: undefined,
        RECOGNISED: [
          {
            guard: ({ event }) => !!grammar[getUtterance(event)]?.day,
            actions: assign(({ event }) => ({
              day: grammar[getUtterance(event)]?.day,
            })),
            target: "AskTime",
          },
          {
            target: "NotRecognisedDay",
          },
        ],
        NOINPUT: "AskDay",
      },
    },

    NotRecognisedDay: {
      entry: ({ context }) =>
        speak(
          context,
          "Sorry, I did not recognise that day. Please say one of: monday, tuesday, wednesday, thursday, or friday."
        ),
      on: { SPEAK_COMPLETE: "AskDay" },
    },

    // ── TIME ──────────────────────────────────────────────
    AskTime: {
      entry: ({ context }) => speak(context, "At what time?"),
      on: { SPEAK_COMPLETE: "ListenTime" },
    },

    ListenTime: {
      entry: ({ context }) => context.spstRef.send({ type: "LISTEN" }),
      on: {
        SPEAK_COMPLETE: undefined,
        RECOGNISED: [
          {
            guard: ({ event }) => !!grammar[getUtterance(event)]?.time,
            actions: assign(({ event }) => ({
              time: grammar[getUtterance(event)]?.time,
            })),
            target: "Confirm",
          },
          {
            target: "NotRecognisedTime",
          },
        ],
        NOINPUT: "AskTime",
      },
    },

    NotRecognisedTime: {
      entry: ({ context }) =>
        speak(
          context,
          "Sorry, I did not recognise that time. Please say ten, eleven, or twelve."
        ),
      on: { SPEAK_COMPLETE: "AskTime" },
    },

    // ── CONFIRM ───────────────────────────────────────────
    Confirm: {
      entry: ({ context }) =>
        speak(
          context,
          `You are meeting ${context.person} on ${context.day} at ${context.time}. Is this correct?`
        ),
      on: { SPEAK_COMPLETE: "ListenConfirm" },
    },

    ListenConfirm: {
      entry: ({ context }) => context.spstRef.send({ type: "LISTEN" }),
      on: {
        SPEAK_COMPLETE: undefined,
        RECOGNISED: [
          {
            guard: ({ event }) =>
              grammar[getUtterance(event)]?.confirm === true,
            target: "Done",
          },
          {
            guard: ({ event }) =>
              grammar[getUtterance(event)]?.confirm === false,
            target: "AskPerson",
          },
          {
            // Not yes or no → tell the user
            target: "NotRecognisedConfirm",
          },
        ],
        NOINPUT: "Confirm",
      },
    },

    NotRecognisedConfirm: {
      entry: ({ context }) =>
        speak(
          context,
          "Sorry, I did not understand. Please say yes to confirm or no to start over."
        ),
      on: { SPEAK_COMPLETE: "Confirm" },
    },

    // ── DONE ──────────────────────────────────────────────
    Done: {
      entry: ({ context }) => speak(context, "Booking completed!"),
      on: { SPEAK_COMPLETE: "Idle" },
    },
  },
});

// ---------------- INSPECTOR ----------------
import { createBrowserInspector } from "@statelyai/inspect";

const inspector = createBrowserInspector({
  autoStart: true, // automatically starts inspector, no popup needed
});

// ---------------- ACTOR ----------------
export const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,

});

dmActor.start();

// ---------------- BUTTON ----------------
export function setupButton(button: HTMLButtonElement) {
  button.addEventListener("click", () => {
    console.log("[EVENT] CLICK received");
    dmActor.send({ type: "CLICK" });
  });

  dmActor.subscribe((state) => {
    console.log("[STATE UPDATE]", state.value, state.context);
  });
}
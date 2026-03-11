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
  vlad: { person: "Vladislav Maraev" },
  vladislav: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  talha: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },

  monday: { day: "Monday" },
  "mon day": { day: "Monday" },
  mon: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  "choose day": { day: "Tuesday" },
  "twoesday": { day: "Tuesday" },
  tues: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  "wentz day": { day: "Wednesday" },
  wed: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  "thurs day": { day: "Thursday" },
  thurs: { day: "Thursday" },
  friday: { day: "Friday" },
  "fry day": { day: "Friday" },
  fri: { day: "Friday" },
  "10": { time: "10:00"},
  ten: { time: "10:00" },
  "ten o'clock": { time: "10:00" },
  "11": {time: "11:00"},
  eleven: { time: "11:00" },
  "eleven o'clock": { time: "11:00" },
  "12": {time: "12:00"},
  twelve: { time: "12:00" },
  noon: { time: "12:00" },

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

const speak = (context: any, utterance: string) => {
  setTimeout(() => {
    context.spstRef.send({
      type: "SPEAK",
      value: { utterance },
    });
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
  actors: {
    speechstate,
  },
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
      entry: ({ context }) => speak(context, "Hello! Welcome to speech booking system."),
      on: { SPEAK_COMPLETE: "AskPerson" },
    },

    AskPerson: {
      entry: ({ context }) => speak(context, "Who would you like to meet?"),
      on: { SPEAK_COMPLETE: "ListenPerson" },
    },

    ListenPerson: {
      entry: ({ context }) => {
        context.spstRef.send({ type: "LISTEN" });
      },
      on: {
        SPEAK_COMPLETE: undefined,
        RECOGNISED: [
          {
            guard: ({ event }) => !!grammar[getUtterance(event)]?.person,
            actions: assign(({ event }) => ({
              person: grammar[getUtterance(event)]?.person,
            })),
            target: "AskDay",
          },
          { target: "AskPerson" },
        ],
        NOINPUT: "AskPerson",
      },
    },

    AskDay: {
      entry: ({ context }) => speak(context, "Which day works for you?"),
      on: { SPEAK_COMPLETE: "ListenDay" },
    },

    ListenDay: {
      entry: ({ context }) => {
        context.spstRef.send({ type: "LISTEN" });
      },
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
          { target: "AskDay" },
        ],
        NOINPUT: "AskDay",
      },
    },

    AskTime: {
      entry: ({ context }) => speak(context, "At what time?"),
      on: { SPEAK_COMPLETE: "ListenTime" },
    },

    ListenTime: {
      entry: ({ context }) => {
        context.spstRef.send({ type: "LISTEN" });
      },
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
          { target: "AskTime" },
        ],
        NOINPUT: "AskTime",
      },
    },

    Confirm: {
      entry: ({ context }) =>
        speak(
          context,
          `You are meeting ${context.person} on ${context.day} at ${context.time}. Is this correct?`
        ),
      on: { SPEAK_COMPLETE: "ListenConfirm" },
    },

    ListenConfirm: {
      entry: ({ context }) => {
        context.spstRef.send({ type: "LISTEN" });
      },
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
          { target: "Confirm" },
        ],
        NOINPUT: "Confirm",
      },
    },

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
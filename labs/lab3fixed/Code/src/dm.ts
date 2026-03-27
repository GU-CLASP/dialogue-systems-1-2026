import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";
import type { Hypothesis } from "speechstate";

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
  value?: boolean;
  type?: string;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  eugene: { person: "Eugene Wong" },
  john: { person: "John Doe" },

  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },

  "1": { time: "01:00" },
  "2": { time: "02:00" },
  "3": { time: "03:00" },
  "4": { time: "04:00" },
  "5": { time: "05:00" },
  "6": { time: "06:00" },
  "7": { time: "07:00" },
  "8": { time: "08:00" },
  "9": { time: "09:00" },
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
  "24": { time: "00:00" },

  "1:00 AM": { time: "01:00" },
  "2:00 AM": { time: "02:00" },
  "3:00 AM": { time: "03:00" },
  "4:00 AM": { time: "04:00" },
  "5:00 AM": { time: "05:00" },
  "6:00 AM": { time: "06:00" },
  "7:00 AM": { time: "07:00" },
  "8:00 AM": { time: "08:00" },
  "9:00 AM": { time: "09:00" },
  "10:00 AM": { time: "10:00" },
  "11:00 AM": { time: "11:00" },
  "12:00 PM": { time: "12:00" },
  "1:00 PM": { time: "13:00" },
  "2:00 PM": { time: "14:00" },
  "3:00 PM": { time: "15:00" },
  "4:00 PM": { time: "16:00" },
  "5:00 PM": { time: "17:00" },
  "6:00 PM": { time: "18:00" },
  "7:00 PM": { time: "19:00" },
  "8:00 PM": { time: "20:00" },
  "9:00 PM": { time: "21:00" },
  "10:00 PM": { time: "22:00" },
  "11:00 PM": { time: "23:00" },
  "12:00 AM": { time: "00:00" },

  yes: { value: true },
  yeah: { value: true },
  yep: { value: true },
  yup: { value: true },
  sure: { value: true },
  "of course": { value: true },
  absolutely: { value: true },
  "that's right": { value: true },
  correct: { value: true },
  "sounds good": { value: true },
  "do it": { value: true },
  ja: { value: true },
  positive: { value: true },

  no: { value: false },
  nope: { value: false },
  nah: { value: false },
  "no way": { value: false },
  cancel: { value: false },
  incorrect: { value: false },
  wrong: { value: false },
  "don't do that": { value: false },
  nej: { value: false },
  negative: { value: false },

  appointment: { type: "appointment" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}
const hasMatch = (utterance: string) =>
  Object.keys(grammar).some((key) => utterance.includes(key.toLowerCase()));

const getMatch = (utterance: string) =>
  Object.keys(grammar).find((key) => utterance.includes(key.toLowerCase()));

const capitalized = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1);

const getPerson = (context: DMContext): string =>
  context.metadata?.person || getMatch(context.lastUtterance ?? "");

const getDay = (context: DMContext): keyof typeof DayOfWeek =>
  context.metadata?.day ||
  capitalized(getMatch(context.lastUtterance ?? "") ?? "");

// @ts-expect-error
enum DayOfWeek {
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
  Sunday = 0,
}

const getDate = (day: keyof typeof DayOfWeek) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDay();

  const getDayRelative = (targetDay: number) => {
    const result = new Date(today);
    const diff = (targetDay + 7 - currentDay) % 7;
    result.setDate(today.getDate() + diff);
    return result;
  };

  return getDayRelative(
    DayOfWeek[capitalized(day) as keyof typeof DayOfWeek],
  ).toLocaleDateString();
};

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  guards: {
    isAppointment: ({ context }) => {
      const utterance = context.lastUtterance || "";
      return (
        utterance.includes("appointment") ||
        context.metadata?.type === "appointment"
      );
    },

    hasIdentifiedPerson: ({ context }) =>
      !!context.metadata?.person || hasMatch(context.lastUtterance ?? ""),

    hasIdentifiedDay: ({ context }) =>
      !!context.metadata?.day || hasMatch(context.lastUtterance ?? ""),

    hasIdentifiedWholeDay: ({ context }) =>
      context.metadata?.value !== undefined,

    isWholeDay: ({ context }) => context.appointmentDetails?.wholeDay === true,
    hasIdentifiedTime: ({ context }) =>
      !!context.metadata?.time || hasMatch(context.lastUtterance ?? ""),
    hasConfirmed: ({ context }) => context.metadata?.value === true,
    hasDenied: ({ context }) => context.metadata?.value === false,
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
    "spst.recognised": assign(({ event, context }) => {
      const recognisedEvent = event as {
        type: "RECOGNISED";
        value: Hypothesis[];
      };
      const utterance = recognisedEvent.value[0].utterance.toLowerCase();
      return {
        lastResult: recognisedEvent.value,
        lastUtterance: utterance,
        metadata: grammar[utterance] || {},
        appointmentDetails: context.appointmentDetails,
      };
    }),
    "spst.clearData": assign({
      lastResult: null,
      metadata: null,
    }),
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QBECyA6ACgJzABwENcBiAQQGUAlAFWvIH1KBRU5ATQG0AGAXUVDwB7WAEsALiMEA7fiAAeiAExcu6AJwAWAKyKtARi0B2ABwHjxgGwAaEAE9EerhvRaLai1qMBmbV58Bffxs0dAB1AnFqQXIxIjFiAGEAGQBJBIBpbj4kECFRCWlZBQQdG3sERT01LxcLDQ9zPzUtDUDgjFI8IREpMQBbMF7iZgSAeQBxADkU8iZkLNk88UkZHOKvQxb0RTUDLXdXLy0uQzKlLxV1L0ULQ3dFLz1tNpAQzu7egaGKSnpJ0ZSk0wAFVqAscksCqtQMUDE50MZDIYLodjsY-GcKno9DVFMY1Pikfc9IoXm8uoIev1BvFUuRqExJvQxqhMEkmAzwQJhMtCmsHMdnIjkVxUVx0V5MYplMZavUvOYLKKNMYyR0KVSvmIsNhBH08PFyJgWOlmaNWezObxFjyoUVEFo-IZttVReZ0ftFFLRaptAYjo7Kic1eh3pTPjT0JNBCkpHgAK6G42kU0stkcphc3K2lb2hAaEw1DRcCxeNyGDRqEvWOxKSpqdCOQwGCzGG7XTwhsOayPR2MJpMms0WjMcPTZbn5XP8-OF9DF0vlyvV72XCw3FSmDdeAldjUR3pRmNxxPEI1DtOWzOKCfZqd8mGIAvo+clstqCtViw18pVY4IlQVUDNRpS4UkgledUPmpQ8+xPQcU2HdNOS8W9IWnR9ZxfBd30-FdawqH1530R0uBAvF9j3aCtR1PUDUwMBsFgaQz2TVNzWQzNrQhHMH3kB1jlUZRrk2O5DC4HxMTuRQXBuNsWjUD9kQsKjwxg7VSFgABrBimJYukGSZS9R24ydeWhfj8xLZ1FKVYwSM8VtMUcNsXGaa46ncDQHnA9pQ33dTQ203TmKkYgDMZJCrzHNDeIs4oFxs9xxQc1xjExXYZOqZo2zxfEjlVCDyWoyMQukFIIBpEQADMREgViLw46LTLvcy82fIs3yXL8fwccUZP2QNPLqHzVJ7Q8cDosRkAIWwGsQ4yrVi+94qfKs9G2PRzA-G4P2c8SGw-Stqg3ZtDBUoqoLUmjNK0ma5oioympM5a2pnRL1GS+y9jS5yWg2x5NCeAkLCeaUxoPDTtPu8KZkMqLR3HG0Vva6zPrs1KnIIraLnQBUkR3HZK1bQwIcC+6Kqq2r6vPBbnqW5G3swjrX0XI6er+jQAaqLnK0sMGLr87tIdo-UxFCAALQQABswBh2n2JHBmeJR971s27bDF205sd0Da9bI6zkT0b8yZu7TJZluXZth+lIsWrjXrtGc9GbZxFG0EwSVBzREUxddnBVZRPAU7yubNyNbst2WYcehHOSRlWmcs12nm2T2tx9lUdd-DYNu-BUy2bFskQjw9o+t2xKd6Gq6ogebFc4rN0L44ofJqFp21uElvI2TEVSE7FBUcLgSUsMvtQrinKpr6n64V+PM0Tszncw9uXG8xdmw9h4c8QOpnSLj30ROUHKMu-ySom3UxeoEQBgbxfm7ivMdmbdBvyJMsuelXqEAL7YjokTnQeCiLQE8gpaTvg-OODtn6q0wj4O46BR4m36h+H2e9-6VgRLccUO5sTYk0BA260CwC23hnA5erVV6WTfvnW4dxv4khuP7HE848QUU8APPwECyHVwkHPR+cCWot1WlZW46MUo-SxuUTyuCtYqguOdAwagIGTTFgkXABAxBgGFupUI4gJZkOEfTR2jNaEJTnDhbq+E5E4MsIok+KjOwX30TRDRBotFgB0XogKWop42wXiIp2GE6EfgYV-OoLC-4D02nCLmKgx5PAgQkaQtVsB9B0SsCh9szHwOTsUR0GwXQondEcECmJ9gNhlN5HYookT4lSekkQmTsn6ThnkpWS9QmtwdE6UpbpGien9jgiSBDKwVk4RA5A0hyHBPyaIl+M4tZShPh-EC+glS3CDK0C+4xcBgAkFIKAuSnrdIKZYhwJJVBuBJDiO4mUNAaClFUCwKC6gNAlM0PZfkDlgCOT0U5sD8nULEXmbEygNn3I2IpHuLyCI72dNoLmjp9AFi1oVP5hzjnAs6ecpuN4LFhNhPiPGOVrJVGUOWV5pgPn1C0I0HcLQQz-MBSc0WBpTEXKWQgyy4lbkiTAsuUejKpR4neYXUsPgjCg2ePsnFQKjz9lPAsnlvTxECo-kKj2VZRXpURVtDaJYGVMp+ayxVHLbrDCYGMKYMw5iXJJYgTKeN0QgTwZsTKrz1y4PrGBTQFwNgWoBbiyBZAqB-ABECUETq+kIF2M4Rl51NhGFHrsPQ3pJHJo0MokCSkQwJAlmAAAxlpA5BA+hZOwNypuvLCn7y9Ii8wqh9DGE3DiIwJJwEX1mVIchyQ0iZHrVchABhnDMvbd3ECJY9qIpaM6SwbhEnXF0OBCCUhBCVXgDkNAxL40AFo-5HpDDgfARAwD7vEd5TEdLV1VmeeJPWihSYX3CJEaIsRsBiCvXmBUraVSu3soiYpWDHDOGRCo9cmhNAnB7ULfxNJf0u20O84UKJSxogxARd8H8uYzqMM2Hc7h1E3wNMhzC+hpSNldlwiS5FVz63FLcQ40HzoQLggOCjlltA3A4c2bh4kNgGvKJUcS2w6jonbfZbhvzIKX2uqVMjYgyoWXBTOLtG1HAmzqBJbtnhb0gUbPmnyZElSVhIcFRioVuPrEsDUD05SRJNt-BJd5518QtERBUts6jrPlRnoIuutmnyVk6hcRSZYu26GcuMvGOgfBtgOCdUjU17ohZKCwmjmLPD0elM5dtqgXIfhKy+jYr6ENXyhndWaGWFSlgRAVJlL6XMOBMEm0GjgfDMddjM2aAja6QAy886or4IvVA8NvLQzlKwyVPoyl92hTDmFS2LQJ5QV7Osy9R7EOXjiE1a2O-Qxriz2TImg8UehLNaXWxlgwjgUEyeMM8ghm5nIdkaxWP0-oyxeAgetgbc8MtBllGWVs0qRILqqZsbYB2-DndWwaMhwPjayW0KPR4z2VCSgIgHRsygcKaDuL5txiHDykPvpepOo7rhku+lzJ4FYkSHfXO89cTg3xE4JL5eT7jIz8MC4NiAdXnsyTbHp12mx8RqH9muHexwcS5rEojsQ3jfF896IYsQxjKfDZey4TYSoHjs7xP7Pj7PCcFm5yrtXuiNfiyljHWr1Ots3ALHjR9IF7kE2mwRVD6hJO6CcMiTKf3SdVfQGkqQGSsm0PU5RrLu26MHaqZoWHHh6hmdsld8PinDx9qp5t+NmnGyj2-MWR4ugDMESMFoAPZgyL5tBhV+TbLcV3a5uSxllKZ00uxgSISdQVSli9Q8kN7KoCcp-S74vJwDfVDRMHypiL2yNnfCSL3w1x9hs44mDLxxnRGAX+KJfh3KhGAREB9wpgCyg230q26GX1aOkcFWRRu8EWidXziO5OxKhb4viLVLXLWwErWrQ728gRC1n-00G-GPilGLHdhOFzTfhbSxXkwLxRzFwJAVDbB8GlBNjWRMEbEsHTR3HazD0CCAA */
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    appointmentDetails: {},
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
    Appointment: {
      initial: "Prompt",
      on: {
        RECOGNISED: {
          actions: "spst.recognised",
        },
        ASR_NOINPUT: {
          target: ".NoInput",
          actions: "spst.clearData",
        },
        LISTEN_COMPLETE: ".NoInput",
      },
      states: {
        Prompt: {
          entry: [
            {
              type: "spst.speak",
              params: {
                utterance: "Let's create an appointment.",
              },
            },
            "spst.clearData",
            assign({ appointmentDetails: {} }),
          ],
          on: { SPEAK_COMPLETE: "PromptPerson" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: {
            SPEAK_COMPLETE: [
              {
                target: "PromptPerson",
                guard: ({ context }) => !context.appointmentDetails?.person,
              },
              {
                target: "PromptDay",
                guard: ({ context }) =>
                  !context.appointmentDetails?.day ||
                  !context.appointmentDetails?.date,
              },
              {
                target: "PromptWholeDay",
                guard: ({ context }) =>
                  context.appointmentDetails?.wholeDay === undefined,
              },
              {
                target: "PromptTime",
                guard: ({ context }) =>
                  context.appointmentDetails?.wholeDay === false &&
                  !context.appointmentDetails?.time,
              },
              {
                target: "PromptCreateAppointmentWholeDay",
                guard: ({ context }) =>
                  context.appointmentDetails?.wholeDay === true,
              },
              {
                target: "PromptCreateAppointmentWithTime",
                guard: ({ context }) =>
                  context.appointmentDetails?.wholeDay === false &&
                  !!context.appointmentDetails?.time,
              },
              { target: "Prompt" },
            ],
          },
        },
        PromptPerson: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: context.lastResult
                  ? "I didn't catch the name. Who are you meeting with?"
                  : "Who are you meeting with?",
              }),
            },
            "spst.clearData",
            assign({ appointmentDetails: {} }),
          ],
          on: { SPEAK_COMPLETE: "AskPerson" },
        },
        AskPerson: {
          entry: "spst.listen",
          on: {
            LISTEN_COMPLETE: [
              { target: "PersonIdentified", guard: "hasIdentifiedPerson" },
              { target: "PromptPerson" },
            ],
          },
        },
        PersonIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: {
                ...context.appointmentDetails,
                person: getPerson(context),
              },
            })),
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: `You are meeting with ${context.appointmentDetails?.person}`,
              }),
            },
            "spst.clearData",
          ],
          on: { SPEAK_COMPLETE: "PromptDay" },
        },
        PromptDay: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: context.lastResult
                ? "I didn't catch the day. On which day is your meeting?"
                : "On which day is your meeting?",
            }),
          },
          on: { SPEAK_COMPLETE: "AskDay" },
        },
        AskDay: {
          entry: "spst.listen",
          on: {
            LISTEN_COMPLETE: [
              { target: "DayIdentified", guard: "hasIdentifiedDay" },
              { target: "PromptDay" },
            ],
          },
        },
        DayIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: {
                ...context.appointmentDetails,
                day: getDay(context),
                date: getDate(getDay(context)),
              },
            })),
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: `You are meeting with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} ${context.appointmentDetails?.date}`,
              }),
            },
            "spst.clearData",
          ],
          on: { SPEAK_COMPLETE: "PromptWholeDay" },
        },
        PromptWholeDay: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: context.lastResult
                ? "I didn't catch your answer. Will it take the whole day?"
                : "Will it take the whole day?",
            }),
          },
          on: { SPEAK_COMPLETE: "AskWholeDay" },
        },
        AskWholeDay: {
          entry: "spst.listen",
          on: {
            LISTEN_COMPLETE: [
              { target: "WholeDayIdentified", guard: "hasIdentifiedWholeDay" },
              { target: "PromptWholeDay" },
            ],
          },
        },
        WholeDayIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: {
                ...context.appointmentDetails,
                wholeDay: context.metadata?.value,
              },
            })),
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: `You are meeting with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} ${context.appointmentDetails?.date} and ${context.appointmentDetails?.wholeDay ? "it will take the whole day" : "it will not take the whole day"}`,
              }),
            },
            "spst.clearData",
          ],
          on: {
            SPEAK_COMPLETE: [
              {
                target: "PromptCreateAppointmentWholeDay",
                guard: "isWholeDay",
              },
              { target: "PromptTime" },
            ],
          },
        },
        PromptTime: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: context.lastResult
                ? "I didn't catch the time. What time is your meeting?"
                : "What time is your meeting?",
            }),
          },
          on: { SPEAK_COMPLETE: "AskTime" },
        },
        AskTime: {
          entry: "spst.listen",
          on: {
            LISTEN_COMPLETE: [
              { target: "TimeIdentified", guard: "hasIdentifiedTime" },
              { target: "PromptTime" },
            ],
          },
        },
        TimeIdentified: {
          entry: [
            assign(({ context }) => ({
              appointmentDetails: {
                ...context.appointmentDetails,
                time: context.metadata?.time,
              },
            })),
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: `You are meeting with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} ${context.appointmentDetails?.date} at ${context.appointmentDetails?.time}`,
              }),
            },
            "spst.clearData",
          ],
          on: {
            SPEAK_COMPLETE: "PromptCreateAppointmentWithTime",
          },
        },
        PromptCreateAppointmentWithTime: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Do you want me to create an appointment with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} ${context.appointmentDetails?.date} at ${context.appointmentDetails?.time}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Confirmation" },
        },
        PromptCreateAppointmentWholeDay: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Do you want me to create an appointment with ${context.appointmentDetails?.person} on ${context.appointmentDetails?.day} ${context.appointmentDetails?.date} for the whole day?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Confirmation" },
        },
        Confirmation: {
          entry: ["spst.listen", "spst.clearData"],
          on: {
            LISTEN_COMPLETE: [
              { target: "Done", guard: "hasConfirmed" },
              { target: "PromptPerson", guard: "hasDenied" },
              {
                target: "PromptCreateAppointmentWholeDay",
                guard: "isWholeDay",
              },
              { target: "PromptCreateAppointmentWithTime" },
            ],
          },
        },
        Done: {
          entry: {
            type: "spst.speak",
            params: {
              utterance: "Your appointment has been created!",
            },
          },
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
      },
    },
    Greeting: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "Appointment",
            guard: "isAppointment",
          },
          {
            target: "CheckGrammar",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "spst.speak",
            params: { utterance: `Hello! How can I help you today?` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: "spst.recognised",
            },
            ASR_NOINPUT: {
              actions: "spst.clearData",
            },
          },
        },
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

import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureRegion = "norwayeast";
const azureCredentials = {
  endpoint: `https://${azureRegion}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion,
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
  today: { day: "Today" },
  tomorrow: { day: "Tomorrow" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
};

const grammarLists = {
  name: Object.entries(grammar)
    .filter(([, entry]) => entry.person)
    .map(([key]) => key),
  day: Object.entries(grammar)
    .filter(([, entry]) => entry.day)
    .map(([key]) => key),
  date: Object.entries(grammar)
    .filter(([, entry]) => entry.day)
    .map(([key]) => key),
  time: Object.entries(grammar)
    .filter(([, entry]) => entry.time)
    .map(([key]) => key),
} as const;

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getTopHypothesis(ev: any) {
  return Array.isArray(ev?.value) && ev.value.length > 0 ? ev.value[0] : undefined;
}

function getEntity(h: any, key: string): string | undefined {
  const e1 = h?.entities?.[key];
  if (Array.isArray(e1) && e1.length > 0) return String(e1[0]);

  const e2 = h?.entities?.[key]?.value;
  if (typeof e2 === "string" && e2.length > 0) return e2;

  const e3 = h?.slots?.[key];
  if (typeof e3 === "string" && e3.length > 0) return e3;

  return undefined;
}

function getUtterance(h: any): string {
  return typeof h?.utterance === "string" ? h.utterance.toLowerCase() : "";
}

function matchFromList(u: string, list: readonly string[]) {
  const text = (u ?? "").toLowerCase();
  return list.find((w) => text.includes(w.toLowerCase()));
}

function editDistance(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function fuzzyMatchFromList(u: string, list: readonly string[], maxDistance = 2) {
  const tokens = (u.toLowerCase().match(/[a-z]+/g) ?? []).filter((t) => t.length >= 4);
  let best: { word: string; dist: number } | undefined;

  for (const token of tokens) {
    for (const word of list) {
      const dist = editDistance(token, word.toLowerCase());
      if (!best || dist < best.dist) best = { word, dist };
    }
  }

  return best && best.dist <= maxDistance ? best.word : undefined;
}

function matchDay(u: string) {
  return matchFromList(u, grammarLists.day) ?? fuzzyMatchFromList(u, grammarLists.day, 2);
}

function isSpstIdle(spstValue: any): boolean {
  return spstValue?.Active?.AsrTtsManager?.Ready === "Idle";
}

function createStartListening(hints: readonly string[]) {
  return ({ context }: any) => {
    const spstRef = context.spstRef;
    const sendListenWhenIdle = (attempt = 0) => {
      const snapshot = spstRef?.getSnapshot?.();
      const value = snapshot?.value;
      console.log(`DM -> SpSt LISTEN check #${attempt}`, value);

      if (isSpstIdle(value)) {
        spstRef.send({
          type: "LISTEN",
          value: {
            noInputTimeout: 6000,
            completeTimeout: 0,
            hints: [...hints],
          },
        });
        console.log("DM -> SpSt LISTEN sent", hints);
        return;
      }

      if (attempt < 30) {
        setTimeout(() => sendListenWhenIdle(attempt + 1), 50);
        return;
      }

      console.warn("DM -> SpSt LISTEN aborted: speechstate not idle");
    };

    sendListenWhenIdle();
  };
}

const yesNoHints = ["yes", "no", "yeah", "nope", "yep", "nah"] as const;
const startListeningAny = createStartListening([]);
const startListeningName = createStartListening(grammarLists.name);
const startListeningDate = createStartListening(grammarLists.day);
const startListeningYesNo = createStartListening(yesNoHints);
const startListeningTime = createStartListening(grammarLists.time);

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
    storeName: assign({
      name: ({ event }: any) => {
        const h = getTopHypothesis(event);
        const u = getUtterance(h);
        const ent = getEntity(h, "person");
        const fromList = matchFromList(u, grammarLists.name);
        return (ent ?? fromList ?? "").toLowerCase();
      },
    }),
    storeDate: assign({
      date: ({ event }: any) => {
        const h = getTopHypothesis(event);
        const u = getUtterance(h);
        const ent = getEntity(h, "day");
        const fromList = matchDay(u);
        return (ent ?? fromList ?? "").toLowerCase();
      },
    }),
    storeTime: assign({
      time: ({ event }: any) => {
        const h = getTopHypothesis(event);
        const token = matchFromList(getUtterance(h), grammarLists.time);
        return getEntity(h, "time") ?? (token ? grammar[token]?.time ?? token : undefined);
      },
    }),
    askNamePrompt: ({ context }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: "Who are you meeting with?" },
      }),
    askDatePrompt: ({ context }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: "On which day is your meeting?" },
      }),
    askDatePromptLog: () => {
      console.log("askDate.prompt entry");
    },
    askAllDayPrompt: ({ context }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: "Will it take the whole day?" },
      }),
    listenWithLog: ({ context }: any) => {
      console.log(
        "LISTEN START",
        Date.now(),
        "spstRef:",
        !!context.spstRef,
        "event:",
        { type: "LISTEN" },
      );
    },
    logDmRecognised: () => console.log("DM got RECOGNISED"),
    logDmNoInput: () => console.log("DM got NOINPUT"),
    logDmListenComplete: () => console.log("DM got LISTEN_COMPLETE"),
    logNoInput: () => {
      console.log("NOINPUT", Date.now());
    },
    askTimePrompt: ({ context }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: "What time is your meeting?" },
      }),
    confirmAllDayPrompt: ({ context }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: `Do you want me to create an appointment with ${context.name} on ${context.date} for the whole day?`,
        },
      }),
    confirmTimedPrompt: ({ context }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: `Do you want me to create an appointment with ${context.name} on ${context.date} at ${context.time}?`,
        },
      }),
    sayCreated: ({ context }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: "Your appointment has been created!" },
      }),
    logRecognised: ({ event }) => {
      const h = getTopHypothesis(event);
      console.log("RECOGNISED top hypothesis:", h);
    },
    logCreated: ({ context }) => {
      console.log("APPOINTMENT CREATED:", {
        name: context.name,
        date: context.date,
        time: context.time,
        allDay: context.allDay,
      });
    },
    setAllDayTrue: assign({ allDay: (_ctx) => true }),
    setAllDayFalse: assign({ allDay: (_ctx) => false }),
    clearTime: assign({ time: (_ctx) => undefined }),
  },
  guards: {
    hasName: ({ event }: any) => {
      const h = getTopHypothesis(event);
      const u = getUtterance(h);
      const ent = getEntity(h, "person");
      const fromList = matchFromList(u, grammarLists.name);
      console.log("DEBUG hasName:", {
        u,
        conf: h?.confidence,
        ent,
        fromList,
        list: grammarLists.name,
      });
      return Boolean(ent ?? fromList);
    },
    hasDate: ({ event }: any) => {
      const h = getTopHypothesis(event);
      const u = getUtterance(h);
      const ent = getEntity(h, "day");
      const fromList = matchDay(u);
      console.log("DEBUG hasDate:", {
        u,
        conf: h?.confidence,
        ent,
        fromList,
        list: grammarLists.day,
      });
      return Boolean(ent ?? fromList);
    },
    hasTime: ({ event }: any) => {
      const h = getTopHypothesis(event);
      const token = matchFromList(getUtterance(h), grammarLists.time);
      return Boolean(getEntity(h, "time") ?? token);
    },
    isYes: ({ event }: any) => {
      const h = getTopHypothesis(event);
      if (getEntity(h, "yes")) return true;
      const u = getUtterance(h);
      return ["yes", "yeah", "yep", "sure", "ok", "okay", "of course"].some((w) =>
        u.includes(w),
      );
    },
    isNo: ({ event }: any) => {
      const h = getTopHypothesis(event);
      if (getEntity(h, "no")) return true;
      const u = getUtterance(h);
      return ["no", "nope", "nah", "no way"].some((w) => u.includes(w));
    },
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "askName" },
    },
    askName: {
      initial: "prompt",
      states: {
        prompt: {
          entry: ["askNamePrompt"],
          on: { SPEAK_COMPLETE: "listen" },
          after: { 1500: "listen" },
        },
        listen: {
          entry: ["listenWithLog"],
          after: {
            120: { actions: [startListeningName] },
          },
          on: {
            ASR_NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            LISTEN_COMPLETE: { actions: ["logDmListenComplete"], target: "prompt" },
            RECOGNISED: [
              {
                actions: ["logDmRecognised", "logRecognised", "storeName"],
                guard: "hasName",
                target: "#DM.askDate",
              },
              { actions: ["logDmRecognised"], target: "prompt" },
            ],
          },
        },
      },
    },
    askDate: {
      initial: "prompt",
      states: {
        prompt: {
          entry: ["askDatePromptLog", "askDatePrompt"],
          on: { SPEAK_COMPLETE: "listen" },
          after: { 1500: "listen" },
        },
        listen: {
          entry: ["listenWithLog"],
          after: {
            120: { actions: [startListeningDate] },
          },
          on: {
            ASR_NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            LISTEN_COMPLETE: { actions: ["logDmListenComplete"], target: "prompt" },
            RECOGNISED: [
              {
                actions: ["logDmRecognised", "logRecognised", "storeDate"],
                guard: "hasDate",
                target: "#DM.askAllDay",
              },
              { actions: ["logDmRecognised"], target: "prompt" },
            ],
          },
        },
      },
    },
    askAllDay: {
      initial: "prompt",
      states: {
        prompt: {
          entry: ["askAllDayPrompt"],
          on: { SPEAK_COMPLETE: "listen" },
          after: { 1500: "listen" },
        },
        listen: {
          entry: ["listenWithLog"],
          after: {
            120: { actions: [startListeningYesNo] },
          },
          on: {
            ASR_NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            LISTEN_COMPLETE: { actions: ["logDmListenComplete"], target: "prompt" },
            RECOGNISED: [
              {
                actions: ["logDmRecognised", "logRecognised", "setAllDayTrue"],
                guard: "isYes",
                target: "#DM.confirmAllDay",
              },
              {
                actions: ["logDmRecognised", "logRecognised", "setAllDayFalse"],
                guard: "isNo",
                target: "#DM.askTime",
              },
              {
                actions: ["logDmRecognised", "logRecognised"],
                target: "prompt",
              },
            ],
          },
        },
      },
    },
    confirmAllDay: {
      initial: "prompt",
      states: {
        prompt: {
          entry: ["confirmAllDayPrompt"],
          on: { SPEAK_COMPLETE: "listen" },
          after: { 1500: "listen" },
        },
        listen: {
          entry: ["listenWithLog"],
          after: {
            120: { actions: [startListeningYesNo] },
          },
          on: {
            ASR_NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            LISTEN_COMPLETE: { actions: ["logDmListenComplete"], target: "prompt" },
            RECOGNISED: [
              {
                actions: ["logDmRecognised", "logRecognised"],
                guard: "isYes",
                target: "#DM.created",
              },
              {
                actions: ["logDmRecognised", "logRecognised", "setAllDayFalse"],
                guard: "isNo",
                target: "#DM.askTime",
              },
              {
                actions: ["logDmRecognised", "logRecognised"],
                target: "prompt",
              },
            ],
          },
        },
      },
    },
    askTime: {
      initial: "prompt",
      states: {
        prompt: {
          entry: ["askTimePrompt"],
          on: { SPEAK_COMPLETE: "listen" },
          after: { 1500: "listen" },
        },
        listen: {
          entry: ["listenWithLog"],
          after: {
            120: { actions: [startListeningTime] },
          },
          on: {
            ASR_NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            LISTEN_COMPLETE: { actions: ["logDmListenComplete"], target: "prompt" },
            RECOGNISED: [
              {
                actions: ["logDmRecognised", "logRecognised", "storeTime"],
                guard: "hasTime",
                target: "#DM.confirmTimed",
              },
              {
                actions: ["logDmRecognised", "logRecognised"],
                target: "prompt",
              },
            ],
          },
        },
      },
    },
    confirmTimed: {
      initial: "prompt",
      states: {
        prompt: {
          entry: ["confirmTimedPrompt"],
          on: { SPEAK_COMPLETE: "listen" },
          after: { 1500: "listen" },
        },
        listen: {
          entry: ["listenWithLog"],
          after: {
            120: { actions: [startListeningYesNo] },
          },
          on: {
            ASR_NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            NOINPUT: { actions: ["logDmNoInput"], target: "prompt" },
            LISTEN_COMPLETE: { actions: ["logDmListenComplete"], target: "prompt" },
            RECOGNISED: [
              {
                actions: ["logDmRecognised", "logRecognised"],
                guard: "isYes",
                target: "#DM.created",
              },
              {
                actions: ["logDmRecognised", "logRecognised", "clearTime"],
                guard: "isNo",
                target: "#DM.askTime",
              },
              {
                actions: ["logDmRecognised", "logRecognised"],
                target: "prompt",
              },
            ],
          },
        },
      },
    },
    created: {
      entry: ["sayCreated", "logCreated"],
      type: "final",
    },
    Greeting: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammar",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello world!` } },
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
          entry: startListeningAny,
          on: {
            RECOGNISED: {
              actions: ["logRecognised"],
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
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

export const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  const spstSnapshot: any = state.context.spstRef?.getSnapshot?.();
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.log("SpSt value:", JSON.stringify(spstSnapshot?.value));
  console.log("SpSt status:", spstSnapshot?.status);
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

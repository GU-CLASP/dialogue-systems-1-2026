import { assign, createActor, setup } from "xstate";
import { speechstate } from "speechstate";
import type { Settings } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents, NLUObject } from "./types";

const inspector = createBrowserInspector();

const ENTITY_CONFIDENCE_THRESHOLD = 0.6;

const azureCredentials = {
  endpoint:
    "https://norwayeast.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint:
    "https://gu2026young.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
  key: NLU_KEY /** reference to your Azure CLU key */,
  deploymentName: "deployment" /** your Azure CLU deployment */,
  projectName: "appointment" /** your Azure CLU project name */,
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  azureRegion: "norwayeast",
  asrDefaultCompleteTimeout: 1500,
  asrDefaultNoInputTimeout: 10000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

function normalize(text: string) {
  return text.toLowerCase().replace(/[\s_-]+/g, "");
}

function isMeetingIntent(intent: string) {
  const normalized = normalize(intent);
  return normalized === "createameeting" || normalized === "createmeeting";
}

function isWhoIsIntent(intent: string) {
  const normalized = normalize(intent);
  return normalized === "whoisx" || normalized === "whois";
}

function getEntityText(
  interpretation: NLUObject | null,
  categoryHints: string[],
  threshold = ENTITY_CONFIDENCE_THRESHOLD,
) {
  if (!interpretation) {
    return null;
  }

  const normalizedHints = categoryHints.map(normalize);
  const entity = interpretation.entities.find((candidate) => {
    if (candidate.confidenceScore < threshold) {
      return false;
    }
    const category = normalize(candidate.category);
    return normalizedHints.some((hint) => category.includes(hint));
  });

  return entity?.text ?? null;
}

function extractMeetingSlots(interpretation: NLUObject | null) {
  return {
    title: getEntityText(interpretation, ["title", "meetingtitle", "topic", "subject"]),
    person: getEntityText(interpretation, ["person", "attendee", "name", "participant"]),
    time: getEntityText(interpretation, ["time", "datetime", "date", "day", "when"]),
  };
}

function extractWhoIsPerson(interpretation: NLUObject | null) {
  return getEntityText(interpretation, ["person", "name", "celebrity", "publicfigure"]);
}

function getPersonInfo(personName: string) {
  const knownPeople: Record<string, string> = {
    "ada lovelace":
      "Ada Lovelace was a mathematician known for writing one of the first algorithms for Charles Babbage's Analytical Engine.",
    "alan turing":
      "Alan Turing was a pioneering computer scientist, famous for the Turing machine and codebreaking work at Bletchley Park.",
    "grace hopper":
      "Grace Hopper was a computer scientist and U.S. Navy rear admiral, known for compiler development and COBOL.",
    "vladislav maraev":
      "Vladislav Maraev is one of the researchers and instructors associated with this dialogue systems course.",
    "bora kara":
      "Bora Kara is one of the researchers and instructors associated with this dialogue systems course.",
    "talha bedir":
      "Talha Bedir is one of the researchers and instructors associated with this dialogue systems course.",
    "tom södahl bladsjö":
      "Tom Södahl Bladsjö is one of the researchers and instructors associated with this dialogue systems course.",
  };

  return (
    knownPeople[personName.toLowerCase()] ||
    `I know ${personName}, but I do not have a detailed profile yet.`
  );
}

function updateRecognition(event: any) {
  return {
    lastResult: event.value ?? null,
    interpretation: event.nluValue ?? null,
  };
}

function getTopUtterance(event: any) {
  return event.value?.[0]?.utterance?.trim() || null;
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "ui.setPrompt": (_args, params: { utterance: string }) => {
      lastPrompt = params.utterance;
    },
    "spst.speak": ({ context }, params: { utterance: string }) => {
      lastPrompt = params.utterance;
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      });
    },
    "spst.listenNlu": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true } /** Local activation of NLU */,
      }),
    "spst.listenRaw": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: false },
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    person: null,
    time: null,
    title: null,
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
      entry: assign({
        lastResult: null,
        interpretation: null,
        person: null,
        time: null,
        title: null,
      }),
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "RouteIntent",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: {
            type: "ui.setPrompt",
            params: {
              utterance:
                "Hello! You can ask me to create a meeting, or ask who someone is.",
            },
          },
          always: "Ask",
        },
        NoInput: {
          entry: {
            type: "ui.setPrompt",
            params: { utterance: "I can't hear you. Please try again." },
          },
          always: "Ask",
        },
        Ask: {
          entry: { type: "spst.listenNlu" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => updateRecognition(event)),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null, interpretation: null }),
            },
          },
        },
      },
    },
    RouteIntent: {
      always: [
        {
          target: "HandleMeetingIntent",
          guard: ({ context }) =>
            !!context.interpretation && isMeetingIntent(context.interpretation.topIntent),
        },
        {
          target: "HandleWhoIsIntent",
          guard: ({ context }) =>
            !!context.interpretation && isWhoIsIntent(context.interpretation.topIntent),
        },
        { target: "UnknownIntent" },
      ],
    },
    HandleMeetingIntent: {
      initial: "Extract",
      states: {
        Extract: {
          entry: assign(({ context }) => {
            const extracted = extractMeetingSlots(context.interpretation);
            return {
              title: extracted.title ?? context.title,
              person: extracted.person ?? context.person,
              time: extracted.time ?? context.time,
            };
          }),
          always: [
            {
              target: "Confirm",
              guard: ({ context }) =>
                !!context.title && !!context.person && !!context.time,
            },
            { target: "AskTitle", guard: ({ context }) => !context.title },
            { target: "AskPerson", guard: ({ context }) => !context.person },
            { target: "AskTime" },
          ],
        },
        AskTitle: {
          entry: {
            type: "ui.setPrompt",
            params: { utterance: "What is the meeting title?" },
          },
          always: "ListenForTitle",
        },
        ListenForTitle: {
          entry: { type: "spst.listenRaw" },
          on: {
            RECOGNISED: {
              actions: assign(({ context, event }) => {
                const recognition = updateRecognition(event);
                const extracted = extractMeetingSlots(recognition.interpretation);
                const rawTitle = getTopUtterance(event);
                return {
                  ...recognition,
                  interpretation: context.interpretation,
                  title: rawTitle ?? extracted.title ?? context.title,
                  person: extracted.person ?? context.person,
                  time: extracted.time ?? context.time,
                };
              }),
              target: "Extract",
            },
            ASR_NOINPUT: { target: "AskTitle" },
          },
        },
        AskPerson: {
          entry: {
            type: "ui.setPrompt",
            params: { utterance: "Who is the meeting with?" },
          },
          always: "ListenForPerson",
        },
        ListenForPerson: {
          entry: { type: "spst.listenNlu" },
          on: {
            RECOGNISED: {
              actions: assign(({ context, event }) => {
                const recognition = updateRecognition(event);
                const extracted = extractMeetingSlots(recognition.interpretation);
                return {
                  ...recognition,
                  title: extracted.title ?? context.title,
                  person: extracted.person ?? context.person,
                  time: extracted.time ?? context.time,
                };
              }),
              target: "Extract",
            },
            ASR_NOINPUT: { target: "AskPerson" },
          },
        },
        AskTime: {
          entry: {
            type: "ui.setPrompt",
            params: { utterance: "When should I schedule it?" },
          },
          always: "ListenForTime",
        },
        ListenForTime: {
          entry: { type: "spst.listenNlu" },
          on: {
            RECOGNISED: {
              actions: assign(({ context, event }) => {
                const recognition = updateRecognition(event);
                const extracted = extractMeetingSlots(recognition.interpretation);
                return {
                  ...recognition,
                  title: extracted.title ?? context.title,
                  person: extracted.person ?? context.person,
                  time: extracted.time ?? context.time,
                };
              }),
              target: "Extract",
            },
            ASR_NOINPUT: { target: "AskTime" },
          },
        },
        Confirm: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Okay. I will create the meeting \"${context.title}\" with ${context.person} at ${context.time}.`,
            }),
          },
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
      },
    },
    HandleWhoIsIntent: {
      initial: "Extract",
      states: {
        Extract: {
          entry: assign(({ context }) => ({
            person: extractWhoIsPerson(context.interpretation) ?? context.person,
          })),
          always: [
            { target: "Answer", guard: ({ context }) => !!context.person },
            { target: "AskPerson" },
          ],
        },
        AskPerson: {
          entry: {
            type: "ui.setPrompt",
            params: { utterance: "Who do you want to know about?" },
          },
          always: "ListenForPerson",
        },
        ListenForPerson: {
          entry: { type: "spst.listenNlu" },
          on: {
            RECOGNISED: {
              actions: assign(({ context, event }) => {
                const recognition = updateRecognition(event);
                return {
                  ...recognition,
                  person: extractWhoIsPerson(recognition.interpretation) ?? context.person,
                };
              }),
              target: "Extract",
            },
            ASR_NOINPUT: { target: "AskPerson" },
          },
        },
        Answer: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: getPersonInfo(context.person!),
            }),
          },
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
      },
    },
    UnknownIntent: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `I heard "${context.lastResult?.[0]?.utterance ?? ""}", but I could not match it to create a meeting or who is X.`,
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

let lastPrompt = "Idle";

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

function getStatus(snapshot: any) {
  const dmState = JSON.stringify(snapshot.value);

  if (
    dmState.includes('"Ask"') ||
    dmState.includes("ListenForTitle") ||
    dmState.includes("ListenForPerson") ||
    dmState.includes("ListenForTime")
  ) {
    return "Listening";
  }
  if (
    dmState.includes("Confirm") ||
    dmState.includes("Answer") ||
    dmState.includes("UnknownIntent")
  ) {
    return "Speaking";
  }
  return "Idle";
}

function updateUiText(element: HTMLElement, value: string) {
  element.textContent = value;
}

type UiElements = {
  button: HTMLButtonElement;
  status: HTMLElement;
  prompt: HTMLElement;
  lastHeard: HTMLElement;
  nlu: HTMLElement;
  listeningIndicator: HTMLElement;
};

let previousUiStatus = "Idle";
let audioContext: AudioContext | null = null;

function playListeningCue() {
  const ContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!ContextCtor) {
    return;
  }

  audioContext = audioContext ?? new ContextCtor();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1046.5, now);
  oscillator.frequency.setValueAtTime(1318.5, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

export function setupUI(elements: UiElements) {
  elements.button.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });

  dmActor.subscribe((snapshot) => {
    const status = getStatus(snapshot);
    const utterance = snapshot.context.lastResult?.[0]?.utterance ?? "-";
    const topIntent = snapshot.context.interpretation?.topIntent ?? "-";
    const person = snapshot.context.person ?? "-";
    const time = snapshot.context.time ?? "-";
    const title = snapshot.context.title ?? "-";

    if (status === "Listening" && previousUiStatus !== "Listening") {
      playListeningCue();
    }
    previousUiStatus = status;

    elements.listeningIndicator.classList.toggle("is-on", status === "Listening");

    updateUiText(elements.button, "Start / Continue");
    updateUiText(elements.status, status);
    updateUiText(elements.prompt, lastPrompt);
    updateUiText(elements.lastHeard, utterance);
    updateUiText(
      elements.nlu,
      `topIntent: ${topIntent}\nperson: ${person}\ntime: ${time}\ntitle: ${title}`,
    );
  });
}

export function setupButton(element: HTMLButtonElement) {
  setupUI({
    button: element,
    status: document.createElement("div"),
    prompt: document.createElement("div"),
    lastHeard: document.createElement("div"),
    nlu: document.createElement("div"),
    listeningIndicator: document.createElement("div"),
  });
}

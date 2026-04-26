import { createBrowserInspector } from "@statelyai/inspect";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { assign, createActor, setup } from "xstate";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: "https://germanywestcentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://language-resource-leila.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "wumpus",
  projectName: "wumpus",
};


const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
  azureRegion: "germanywestcentral",
  bargeIn: false,
};

// ##################################### Wumpus World helpers #####################################

const GRID = 4; // 4×4 grid cave, fixed for simplicity. Rooms are [row][col], indexed from top-left.
const START_ROW = 3; // bottom row of the grid (row 0 = north)
const START_COL = 0; // leftmost column of the grid

// 4-side neighbour cells inside the grid
function getNeighbors(row: number, col: number): [number, number][] {
  const result: [number, number][] = [];
  if (row > 0) result.push([row - 1, col]);
  if (row < GRID - 1) result.push([row + 1, col]);
  if (col > 0) result.push([row, col - 1]);
  if (col < GRID - 1) result.push([row, col + 1]);
  return result;
}

// Pick a random room not in the provided exclusion list.
function pickRoom(exclude: [number, number][]): [number, number] {
  let r: number, c: number;
  do {
    r = Math.floor(Math.random() * GRID);
    c = Math.floor(Math.random() * GRID);
  } while (exclude.some(([er, ec]) => er === r && ec === c));
  return [r, c];
}

// True when [row,col] is an immediate neighbour of target.
function isAdjacentTo(
  row: number,
  col: number,
  [tr, tc]: [number, number],
): boolean {
  return getNeighbors(tr, tc).some(([r, c]) => r === row && c === col);
}

// Sensor percepts the player detects in the current room.
function computeSensorPercepts(
  row: number,
  col: number,
  wumpus: [number, number],
  pit: [number, number],
  gold: [number, number],
  wumpusAlive: boolean,
  hasGold: boolean,
): string[] {
  const p: string[] = [];
  if (wumpusAlive && isAdjacentTo(row, col, wumpus)) p.push("stench");
  if (isAdjacentTo(row, col, pit)) p.push("breeze");
  if (!hasGold && gold[0] === row && gold[1] === col) p.push("glitter");
  return p;
}

// Convert a list of percepts into a natural language sentence.
function perceptText(percepts: string[]): string {
  if (percepts.length === 0) return "You sense nothing.";
  return `You sense ${percepts.join(" and ")}.`;
}

// Map a raw transcript to a game command token. 
function parseCommand(command: string, direction: string | null): string {
  if (!direction) return command.toLowerCase()
  else return `${command.toLowerCase()}_${direction.toLowerCase()}`;
}

// Build a fresh world and return the initial context slice.
function initGame(): Partial<DMContext> {
  const start: [number, number] = [START_ROW, START_COL];
  const start_north: [number, number] = [START_ROW-1, START_COL];
  const start_east: [number, number] = [START_ROW, START_COL+1];
  const wumpus = pickRoom([start, start_north, start_east]);
  const pit = pickRoom([start, start_north, start_east, wumpus]);
  const gold = pickRoom([start, start_north, start_east, pit]);
  const intro = perceptText(
    computeSensorPercepts(START_ROW, START_COL, wumpus, pit, gold, true, false),
  );
  return {
    wumpus,
    pit,
    gold,
    playerRow: START_ROW,
    playerCol: START_COL,
    hasGold: false,
    hasArrow: true,
    wumpusAlive: true,
    gameStatus: "playing",
    command: null,
    direction: null,
    gameMessage: 
      `Welcome to Wumpus World! ` +
      `You entered a cave that is a four by four grid. ` +
      `You start the the bottom-left corner of the cave. ` +
      `There is a Wumpus, a bottomless pit, and a pile of gold in this cave. ` +
      `You carry one arrow. ` +
      `Explore, grab the gold and climb out from the starting room to win. ` +
      `Say: move north, move south, move east, move west, grab, shoot to a direction, or climb. ` +
      `${intro} What do you do?`,
  };
}

/**
 * Apply a spoken command to the current game context.
 * Returns only the fields that change so XState's assign can merge them.
 */
function applyCommand(ctx: DMContext): Partial<DMContext> {
  console.log("Received context:", ctx);
  const {
    wumpus,
    pit,
    gold,
    playerRow,
    playerCol,
    wumpusAlive,
    hasGold,
    hasArrow,
    command,
    direction,
  } = ctx;
  if (!wumpus || !pit || !gold) return {};

  const cmd = parseCommand(command ?? "", direction ?? "");
  let row = playerRow;
  let col = playerCol;
  let alive = wumpusAlive;
  let gotGold = hasGold;
  let gotArrow = hasArrow;
  let msg = "";
  let status: DMContext["gameStatus"] = "playing";

  // Percept sentence at (r,c) with given flags.
  const pt = (r: number, c: number, wa: boolean, gg: boolean) =>
    perceptText(computeSensorPercepts(r, c, wumpus, pit, gold, wa, gg));

  const deltas: Record<string, [number, number]> = {
    move_north: [-1, 0],
    move_south: [1, 0],
    move_east: [0, 1],
    move_west: [0, -1],
  };

  if (cmd in deltas) {
    // Moves
    const [dr, dc] = deltas[cmd];
    const direction = cmd.slice(5); // "north" | "south" | "east" | "west"
    const nr = row + dr;
    const nc = col + dc;
    if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) {
      msg = `You walk into a wall. ${pt(row, col, alive, gotGold)} What do you do?`;
    } else {
      row = nr;
      col = nc;
      if (alive && wumpus[0] === nr && wumpus[1] === nc) {
        msg = "You walk into the Wumpus! It devours you. Game over.";
        status = "dead";
      } else if (pit[0] === nr && pit[1] === nc) {
        msg = "You plunge into a bottomless pit! Game over.";
        status = "dead";
      } else {
        msg = `You move to ${direction}. ${pt(nr, nc, alive, gotGold)} What do you do?`;
      }
    }
  } else if (cmd === "grab") {
    // Grab gold
    if (!hasGold && gold[0] === row && gold[1] === col) {
      gotGold = true;
      msg =
        `You grab the gold! ` +
        `Now find the starting room and climb out. ` +
        `${pt(row, col, alive, true)} What do you do?`;
    } else if (hasGold) {
      msg = `You are already carrying the gold. ${pt(row, col, alive, hasGold)} What do you do?`;
    } else {
      msg = `There is no gold here. ${pt(row, col, alive, hasGold)} What do you do?`;
    }
  } else if (cmd.startsWith("shoot_")) {
    // Shoot arrow
    if (!hasArrow) {
      msg = `You have no arrows left. ${pt(row, col, alive, gotGold)} What do you do?`;
    } else {
      gotArrow = false;
      const dir = cmd.slice(6); // "north" | "south" | "east" | "west"
      // Arrow travels the full row or column in the chosen direction.
      let hit = false;
      if (dir === "north" && wumpus[1] === col && wumpus[0] < row) hit = true;
      if (dir === "south" && wumpus[1] === col && wumpus[0] > row) hit = true;
      if (dir === "east" && wumpus[0] === row && wumpus[1] > col) hit = true;
      if (dir === "west" && wumpus[0] === row && wumpus[1] < col) hit = true;
      if (hit && alive) {
        alive = false;
        msg =
          `You hear a terrible scream! ` +
          `The Wumpus is dead! ` +
          `${pt(row, col, false, gotGold)} What do you do?`;
      } else {
        msg = `Your arrow vanishes into the dark. ${pt(row, col, alive, gotGold)} What do you do?`;
      }
    }
  } else if (cmd === "climb") {
    // Climb out
    if (row === START_ROW && col === START_COL) {
      if (hasGold) {
        msg = "You climb out of the cave with the gold! You win!";
        status = "won";
      } else {
        msg =
          "You leave the cave without the gold. The gold is still down there. Better luck next time!";
        status = "quit";
      }
    } else {
      msg = `You can only climb from the starting room. ${pt(row, col, alive, gotGold)} What do you do?`;
    }
  } else if (cmd === "help") {
    // Help
    msg =
      `Commands: move north, move south, move east, move west, grab, ` +
      `shoot north (or south, east, west), climb. ` +
      `${pt(row, col, alive, gotGold)} What do you do?`;
  } else {
    // Unknown / no-input commands
    msg = `I did not understand. Try a valid action. ${pt(row, col, alive, gotGold)} What do you do?`;
  }

  return {
    playerRow: row,
    playerCol: col,
    wumpusAlive: alive,
    hasGold: gotGold,
    hasArrow: gotArrow,
    gameMessage: msg,
    gameStatus: status,
  };
}

// ###################################### XState machine ######################################

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true } /** Local activation of NLU */,
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    command: null,
    direction: null,
    wumpus: null,
    pit: null,
    gold: null,
    playerRow: START_ROW,
    playerCol: START_COL,
    hasGold: false,
    hasArrow: true,
    wumpusAlive: true,
    gameMessage: "",
    gameStatus: "idle" as const,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },

    WaitToStart: {
      on: { CLICK: "GameInit" },
    },

    GameInit: {
      entry: assign(() => initGame()),
      always: "SpeakMessage",
    },

    SpeakMessage: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({ utterance: context.gameMessage }),
      },
      on: {
        SPEAK_COMPLETE: [
          {
            target: "GameEnd",
            guard: ({ context }) => context.gameStatus !== "playing",
          },
          { target: "Listen" },
        ],
      },
    },

    Listen: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: [
            ({ event }) => console.log("RECOGNISED event:", event),
            assign(({ event }) => ({
              command: event.nluValue?.topIntent ?? null,
              direction: event.nluValue?.entities.find((e: any) => e.category === "direction")?.text ?? null,
          })),
        ]
        },
        ASR_NOINPUT: {
          actions: assign({ command: null, direction: null }),
        },
        LISTEN_COMPLETE: {
          actions: [
            ({ event }) => console.log("LISTEN_COMPLETE event:", event),
            assign(({ context }) => applyCommand(context)),
          ],
          target: "SpeakMessage",
        },
      },
    },

    GameEnd: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Click 'Start Game' to play again." },
      },
      on: { SPEAK_COMPLETE: "WaitToStart" },
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
    const label = meta.view === "idle" ? "Start Game" : (meta.view ?? "");
    element.textContent = label;
  });
}

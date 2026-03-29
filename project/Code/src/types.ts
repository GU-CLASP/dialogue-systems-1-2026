import type { SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastUtterance: string | null;
  /** Wumpus World state */
  wumpus: [number, number] | null;
  pit: [number, number] | null;
  gold: [number, number] | null;
  playerRow: number;
  playerCol: number;
  hasGold: boolean;
  hasArrow: boolean;
  wumpusAlive: boolean;
  gameMessage: string;
  gameStatus: "idle" | "playing" | "dead" | "won" | "quit";
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" };

import type { SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;

  person: string | null;
  day: string | null;
  time: string | null;

  agree: boolean | null;
  disagree: boolean | null;

  interpretation: NLUObject | null;
}

export interface Entity {
  category: string;
  text: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

export interface Intent {
  category: string;
  confidenceScore: number;
}
 
export interface NLUObject { 
  entities: Entity[];
  intents: Intent[];
  projectKind: string;
  topIntent: string;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };
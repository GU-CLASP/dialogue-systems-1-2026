import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { AnyActorRef } from "xstate";

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  person: string | null;
  day: string | null;
  time: string | null; 
  wholeday: boolean | null;
  complete: boolean | null;
  interpretation: NLUObject | null;
  lookormeet: boolean | null;
  // nextUtterance: string;
}

export interface Entity { // This is the type of the entities array in the NLUObject. 
  category: string;
  text: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

export interface Intent { // This is the type of the intents array in the NLUObject.
  category: string;
  confidenceScore: number;
}

export interface NLUObject { // This is the type of the interpretation in the DMContext.
  entities: Entity[];
  intents: Intent[];
  projectKind: string;
  topIntent: string;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | {type: "DONE"};


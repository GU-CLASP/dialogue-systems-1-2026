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

import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";

export interface DMContext {
  spstRef: any;
  lastResult: Hypothesis[] | null;
  interpretation: NLUObject | null;
  person: string | null;
  day: string | null;
  time: string | null;
  wholeDay: boolean | null;
  answer: boolean | null;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };

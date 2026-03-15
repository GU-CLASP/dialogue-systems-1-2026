import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
  day: string | null;
  time: string | null;
  person: string | null;
  confirmation: string | null;
  isSpeaking: boolean;
  currentSlot: "person" | "day" | "time" | "confirmation" | null;
  decision: "who is" | "create picnic" | null;
  interpretation: NLUObject | null;
}


export interface Entity { 
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

export type DMEvents = SpeechStateExternalEvent 
  | { type: "CLICK" } 
  | { type: "DONE" }
  | { type: "ASRTTS_READY" }
  | { type: "SPEAK_COMPLETE" }
  | { type: "RECOGNISED"; value: Hypothesis[]; nluValue: NLUObject }
  | { type: "ASR_NOINPUT" };
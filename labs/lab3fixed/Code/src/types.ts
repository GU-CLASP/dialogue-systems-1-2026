import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
  day: string | null;
  time: string | null;
  person: string | null;
  confirmation: string | null;
  currentSlot: "person" | "day" | "time" | "confirmation" | null;
}


export type DMEvents = SpeechStateExternalEvent 
  | { type: "CLICK" } 
  | { type: "DONE" }
  | { type: "ASRTTS_READY" }
  | { type: "SPEAK_COMPLETE" }
  | { type: "RECOGNISED"; value: Hypothesis[] }
  | { type: "ASR_NOINPUT" };

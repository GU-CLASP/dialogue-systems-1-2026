import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
  time: string;
  day: string;
  name: string;
  isWholeDay: boolean;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };

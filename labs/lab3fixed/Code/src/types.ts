import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;

  // appointment slots
  person?: string;
  day?: string;
  time?: string;
  wholeDay?: boolean;
  confirm?: boolean;
  retryCount?: number;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };

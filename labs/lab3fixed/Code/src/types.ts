import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  last_answer: Hypothesis[] | null;
  booked_person: Hypothesis[] | null;
  booked_day: Hypothesis[] | null;
  booked_time: Hypothesis[] | null;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };

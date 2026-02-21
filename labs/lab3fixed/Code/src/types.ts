import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  meetingDay: Hypothesis[] | null;
  whoToMeet: Hypothesis[] | null;
  meetingTime: Hypothesis[] | null;
  confirmationOne: Hypothesis[] | null;
  confirmationTwo: Hypothesis[] | null;
  agree: Boolean | null;
  disagree: Boolean | null;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };

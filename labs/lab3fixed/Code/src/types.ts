import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

type AppointmentState = {
  name?: string
  day?: string
  time?: string
}

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
  appt: AppointmentState
}

export type SlotInput = {
  prompt: string;
  slot?: keyof AppointmentState;
};

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };

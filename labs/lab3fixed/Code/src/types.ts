import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis | null;
  selectedPerson?: string;
  selectedDay?: string;
  selectedTime?: string;
  confirmation?: boolean;
  retryCount: number;
}

export type DMEvents = 
| { type: "CLICK" } 
| { type: "SPEAK_COMPLETE" }
| SpeechStateExternalEvent;

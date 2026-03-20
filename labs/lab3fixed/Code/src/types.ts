import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
  meetingWith?: string;   
  date?: string;          
  wholeDay?: boolean;     
  time?: string;
}

export type DMEvents = SpeechStateExternalEvent 
  | { type: "CLICK" }
  | { type: "ASRTTS_READY" }
  | { type: "SPEAK_COMPLETE" }
  | { type: "LISTEN_COMPLETE" }
  | { type: "RECOGNISED"; value: any }
  | { type: "ASR_NOINPUT" };
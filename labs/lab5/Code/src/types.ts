import type { SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface MeetingDetails {
  person: string | null;
  date: string | null;
  time: string | null;
}

export interface DMContext {
  spstRef: ActorRef<any, any>;

  interpretation: NLUObject | null;

  targetPersonName: string | null;
  personDetails: Record<string, any> | null;
  error: unknown;

  meetingDetails: MeetingDetails | null;
}

export type DMEvents =
  | SpeechStateExternalEvent
  | { type: "CLICK" }
  | { type: "DONE" };

export interface EntityResolution {
  value: string | boolean;
  [key: string]: any;
}

export interface ExtraInformation {
  value: string | boolean;
  [key: string]: any;
}

export interface Entity {
  // this is the type of the entities array in the NLUObject.
  category: string;
  text: string;
  confidenceScore: number;
  offset: number;
  length: number;
  resolutions?: EntityResolution[];
  extraInformation?: ExtraInformation[];
}

export interface Intent {
  // this is the type of the intents array in the NLUObject.
  category: string;
  confidenceScore: number;
}

export interface NLUObject {
  // this is the type of the interpretation in the DMContext.
  entities: Entity[];
  intents: Intent[];
  projectKind: string;
  topIntent: string;
}

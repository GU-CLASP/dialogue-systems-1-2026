import type { AnyActorRef } from "xstate";

export interface DMContext {
  spstRef:      AnyActorRef;
  level:        "easy" | "medium" | "hard";
  number:       number;
  guess:        number;
  attempts:     number;
  min:          number;
  max:          number;
  hintMin:      number;   // narrowed lower bound updated after each guess
  hintMax:      number;   // narrowed upper bound updated after each guess
  asrResult:    string;
  noInputCount: number;
  score:        number;            //score for current game
  totalScore:   number;       //cumulative score
  startTime:    number;        //when game started
  timeTaken:    number;      //seconds taken
}

export type DMEvents =
  | { type: "CLICK" }
  | { type: "ASRTTS_READY" }
  | { type: "SPEAK_COMPLETE" }
  | { type: "ASR_NOINPUT" }
  | { type: "RECOGNISED"; value: { utterance: string; confidence: number }[] }
  | { type: "YES" }
  | { type: "EXIT" }
  | { type: "START" }
  | { type: "EASY" }
  | { type: "MEDIUM" }
  | { type: "HARD" }
  | { type: "request_digit_count" }
  | { type: "GUESS"; value: number }
  | { type: "RESTART" };
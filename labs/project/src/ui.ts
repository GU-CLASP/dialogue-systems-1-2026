import { dmActor } from "./dm";
import type { DMContext } from "./types";

const infoBox  = document.getElementById("info-box")!;
const stateEl  = document.getElementById("state-label")!;
const feedback = document.getElementById("feedback")!;
const attempts = document.getElementById("attempts")!;
const pipsEl   = document.getElementById("pips")!;
const scoreEl = document.getElementById("score")!;
const totalScoreEl = document.getElementById("total-score")!;

function renderPips(used: number, total = 10) {
  pipsEl.innerHTML = Array.from({ length: total }, (_, i) => {
    let cls = "pip";
    if (i < used) cls += i === used - 1 ? " last" : " used";
    return `<div class="${cls}"></div>`;
  }).join("");
}

export function setupUI() {
  dmActor.subscribe((snapshot) => {
    const state   = snapshot.value as any;
    const context = snapshot.context as DMContext;
    const top     = typeof state === "string" ? state : Object.keys(state)[0];

    if (top !== "Prepare" && top !== "WaitToStart") {
      infoBox.style.display = "flex";
    }

    stateEl.textContent = top;
    feedback.className  = "";

    scoreEl.textContent = `🏆 Score: ${context.score}`;
    totalScoreEl.textContent = `Total: ${context.totalScore}`;

    switch (top) {
      case "Greeting":
        feedback.textContent = "Say YES to play or EXIT to quit";
        pipsEl.innerHTML     = "";
        attempts.textContent = "";
        break;
      case "Instructions":
        feedback.textContent = "Say START when ready";
        break;
      case "ChooseLevel":
        feedback.textContent = "Say EASY, MEDIUM or HARD";
        break;
      case "GenerateNumber":
        feedback.textContent = "Picking a secret number...";
        break;
      case "Guessing":
        feedback.textContent = `🎤 Say your guess! (${context.min} – ${context.max})`;
        renderPips(context.attempts);
        attempts.textContent = `Attempts: ${context.attempts} / 10`;
        break;
      case "HintRepeat":
        feedback.classList.add("hint");
        feedback.textContent = "💡 Checking for repeated digits...";
        break;
      case "AutoHint":
        feedback.classList.add("hint");
        feedback.textContent = `💡 Closer range hint: ${context.hintMin} – ${context.hintMax}`;
        renderPips(context.attempts);
        attempts.textContent = `Attempts: ${context.attempts} / 10`;
        break;
      case "Feedback":
        feedback.classList.add(context.guess < context.number ? "higher" : "lower");
        const diff = Math.abs(context.number - context.guess);
        feedback.textContent = context.guess < context.number
          ? `📈 ${context.guess} → Go HIGHER! ${diff <= 5 ? "🔥 Very close!" : ""}`
          : `📉 ${context.guess} → Go LOWER! ${diff <= 5 ? "🔥 Very close!" : ""}`;
        renderPips(context.attempts);
        attempts.textContent = `Attempts: ${context.attempts} / 10`;
        break;
      case "FeedbackDigits":
        feedback.classList.add(context.guess < context.number ? "higher" : "lower");
        feedback.textContent = `${context.guess} → ${context.guess < context.number ? "Too low ↑" : "Too high ↓"} | Digit feedback speaking...`;
        renderPips(context.attempts);
        attempts.textContent = `Attempts: ${context.attempts} / 10`;
        break;
      case "Win":
        feedback.classList.add("win");
        feedback.textContent = `🎉 Correct! The number was ${context.number}. You got it in ${context.attempts} attempt${context.attempts !== 1 ? "s" : ""}!`;
        renderPips(context.attempts);
        attempts.textContent = "";
        break;
      case "Lose":
        feedback.classList.add("lose");
        feedback.textContent = `💀 Out of attempts! The number was ${context.number}.`;
        renderPips(10);
        attempts.textContent = "";
        break;
      case "Exit":
        feedback.textContent = "👋 Goodbye! Thanks for playing.";
        pipsEl.innerHTML     = "";
        attempts.textContent = "";
        break;
      case "HintDigitCount":
        feedback.classList.add("hint");
        feedback.textContent = "💡 Checking digit count... ";
        break;
      case "CheckGuess":
      feedback.textContent = "⚙️ Checking your guess...";
      break;
    }
  });
}
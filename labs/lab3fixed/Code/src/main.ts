import "./style.css";
import { setupButton, dmActor } from "./dm1.ts";

const startButton = document.getElementById("startButton") as HTMLButtonElement;
document.getElementById("task1")?.addEventListener("click", () => {
  window.open("task1.html", "_blank");
});
// Start disabled
startButton.disabled = true;
startButton.textContent = "Initializing...";

// Setup click handler
setupButton(startButton);

// Update button based on state
dmActor.subscribe((state) => {
  console.log("[MAIN] Current state:", state.value);
  console.log("[MAIN] Context:", state.context);

  if (state.matches("Idle")) {
    startButton.disabled = false;
    startButton.textContent = "Start";
  } else if (state.matches("Prepare")) {
    startButton.disabled = true;
    startButton.textContent = "Initializing...";
  } else {
    startButton.disabled = true;
    startButton.textContent = "Listening...";
  }
});
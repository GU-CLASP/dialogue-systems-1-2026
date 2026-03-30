import { setupButton } from "./dm";   //setupButton connects the HTML button to XState actor
import { setupUI } from "./ui";       //setupUI subscribes to state changes and update the screen
const button = document.querySelector<HTMLButtonElement>("#button")!;
setupButton(button);
setupUI();


//querySelector finds the element with id="button"
//! means we are sure it exists - no null  check needed
// setupButton(button)----connect button to the state machine.
//when user clicks the button it send CLICK event to the actor
// ── Start the UI subscription ─────────────────────────────────────────────────
// Watches for state changes and updates feedback, pips, attempts on screen

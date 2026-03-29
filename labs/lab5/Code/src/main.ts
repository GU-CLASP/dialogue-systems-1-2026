import "./style.css";
import { setupUI } from "./dm.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="app">
    <div class="toolbar">
      <button id="trigger" type="button">Start / Continue</button>
      <div id="listening-indicator" class="listening-indicator">Listening...</div>
    </div>
    <div class="grid">
      <section class="panel">
        <h2>Status</h2>
        <pre id="status">Idle</pre>
      </section>
      <section class="panel">
        <h2>Prompt</h2>
        <pre id="prompt">-</pre>
      </section>
      <section class="panel">
        <h2>Last heard</h2>
        <pre id="last-heard">-</pre>
      </section>
      <section class="panel">
        <h2>NLU</h2>
        <pre id="nlu">topIntent: -\nperson: -\ntime: -\ntitle: -</pre>
      </section>
    </div>
  </div>
`;

setupUI({
  button: document.querySelector<HTMLButtonElement>("#trigger")!,
  status: document.querySelector<HTMLElement>("#status")!,
  prompt: document.querySelector<HTMLElement>("#prompt")!,
  lastHeard: document.querySelector<HTMLElement>("#last-heard")!,
  nlu: document.querySelector<HTMLElement>("#nlu")!,
  listeningIndicator: document.querySelector<HTMLElement>("#listening-indicator")!,
});

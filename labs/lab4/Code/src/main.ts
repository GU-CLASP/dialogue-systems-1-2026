import "./style.css";
import { setupButton } from "./dm.ts";
import { setupButton as setupButtonVG } from "./dm4.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<div>
  <div class="card">
      <p>G part</p>
      <button id="counter" type="button"></button>
      <p>VG part</p>
      <button id="counterVG" type="button"></button>
  </div>
  <p>Supercalifragilisticexpialidocious</p>
</div>
`;

setupButton(document.querySelector<HTMLButtonElement>("#counter")!);
setupButtonVG(document.querySelector<HTMLButtonElement>("#counterVG")!);

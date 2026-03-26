import "./style.css";
import { dmActor, setupButton } from "./dm.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
  </div>
`;

setupButton(document.querySelector<HTMLButtonElement>("#counter")!);

function ensureHintUI() {
  let el = document.getElementById("dm-hint");
  if (!el) {
    el = document.createElement("div");
    el.id = "dm-hint";
    el.style.position = "fixed";
    el.style.top = "16px";
    el.style.left = "16px";
    el.style.right = "16px";
    el.style.padding = "12px 14px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(0,0,0,0.75)";
    el.style.color = "white";
    el.style.fontSize = "18px";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    el.style.zIndex = "9999";
    el.style.lineHeight = "1.35";
    document.body.appendChild(el);
  }
  return el;
}

function ensureSlotsUI() {
  let el = document.getElementById("dm-slots");
  if (!el) {
    el = document.createElement("div");
    el.id = "dm-slots";
    el.style.position = "fixed";
    el.style.right = "16px";
    el.style.bottom = "16px";
    el.style.minWidth = "260px";
    el.style.padding = "12px 14px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(10,10,10,0.82)";
    el.style.color = "white";
    el.style.fontSize = "14px";
    el.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
    el.style.zIndex = "9999";
    el.style.lineHeight = "1.45";
    el.style.whiteSpace = "pre-line";
    document.body.appendChild(el);
  }
  return el;
}

function slotValue(value: unknown) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function getStepHintFromState(state: any): { title: string; sub: string; listening: boolean } {
  const listening =
    state.matches({ askName: "listen" }) ||
    state.matches({ askDate: "listen" }) ||
    state.matches({ askAllDay: "listen" }) ||
    state.matches({ askTime: "listen" }) ||
    state.matches({ confirmTimed: "listen" }) ||
    state.matches({ confirmAllDay: "listen" });

  if (state.matches("WaitToStart")) {
    return { title: "Let's create an appointment", sub: "Click to start.", listening: false };
  }

  if (state.matches({ askName: "prompt" }) || state.matches({ askName: "listen" })) {
    return { title: "Who are you meeting with?", sub: "Say one name: vlad / bora / tal / tom", listening };
  }

  if (state.matches({ askDate: "prompt" }) || state.matches({ askDate: "listen" })) {
    return {
      title: "On which day is your meeting?",
      sub: "Say a day: monday / tuesday / ... / sunday (or today / tomorrow)",
      listening,
    };
  }

  if (state.matches({ askAllDay: "prompt" }) || state.matches({ askAllDay: "listen" })) {
    return { title: "Will it take the whole day?", sub: "Say: yes or no", listening };
  }

  if (state.matches({ askTime: "prompt" }) || state.matches({ askTime: "listen" })) {
    return { title: "What time is your meeting?", sub: "Say: ten / eleven / 10 / 11", listening };
  }

  if (state.matches({ confirmAllDay: "prompt" }) || state.matches({ confirmAllDay: "listen" })) {
    return { title: "Confirm the all-day appointment", sub: "Say: yes to create, no to add time", listening };
  }

  if (state.matches({ confirmTimed: "prompt" }) || state.matches({ confirmTimed: "listen" })) {
    return { title: "Confirm the timed appointment", sub: "Say: yes to create, no to change time", listening };
  }

  if (state.matches("created")) {
    return { title: "Appointment created", sub: "Refresh to try again.", listening: false };
  }

  const stateText =
    typeof state.value === "string" ? state.value : JSON.stringify(state.value);
  return { title: "Running...", sub: stateText, listening };
}

const hintEl = ensureHintUI();
const slotsEl = ensureSlotsUI();

dmActor.subscribe((state) => {
  const hint = getStepHintFromState(state);
  hintEl.textContent = "";
  const header = `${hint.listening ? "🎙 Listening... " : ""}${hint.title}`;
  hintEl.textContent = hint.sub ? `${header}\n${hint.sub}` : header;

  const c = state.context ?? {};
  const allDayText = c.allDay === undefined ? "—" : c.allDay ? "true" : "false";
  slotsEl.textContent = [
    "Slots",
    `name: ${slotValue(c.name)}`,
    `date: ${slotValue(c.date)}`,
    `time: ${slotValue(c.time)}`,
    `allDay: ${allDayText}`,
  ].join("\n");
});

// Keyboard event -> Electron accelerator ("CommandOrControl+Alt+1"), and back for display.

const CODE_KEYS: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  NumpadAdd: "numadd", NumpadSubtract: "numsub", NumpadMultiply: "nummult", NumpadDivide: "numdiv",
  NumpadDecimal: "numdec", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  Pause: "Pause", ScrollLock: "Scrolllock", PrintScreen: "PrintScreen",
};

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return CODE_KEYS[code] ?? null;
}

/** null while only modifiers are held, or for keys Electron cannot bind. */
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const key = keyFromCode(e.code);
  if (!key) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  // A bare letter or digit would be stolen from every other app: require a modifier,
  // except for keys nobody types (F13-F24, numpad, Pause...).
  const safeAlone = /^(F1[3-9]|F2[0-4]|num.+|Pause|Scrolllock|PrintScreen|Insert)$/.test(key);
  if (!mods.length && !safeAlone && !/^F([1-9]|1[0-2])$/.test(key)) return null;
  return [...mods, key].join("+");
}

export function formatAccelerator(acc: string): string {
  return acc
    .replace("CommandOrControl", "Ctrl")
    .replace("Super", "Win")
    .replace(/num(\d)/, "Num $1")
    .replace("numadd", "Num +")
    .replace("numsub", "Num −")
    .replace("nummult", "Num ×")
    .replace("numdiv", "Num ÷")
    .replace("numdec", "Num .")
    .split("+")
    .join(" + ");
}

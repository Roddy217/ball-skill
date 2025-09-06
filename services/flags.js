/**
 * Mutable demo flag for the client app.
 * Use getDemo() to read, setDemo(bool) to change at runtime.
 * NOTE: This is in-memory and resets when the app reloads.
 */
let DEMO = true;

export function getDemo() {
  return DEMO;
}

export function setDemo(v) {
  DEMO = !!v;
}

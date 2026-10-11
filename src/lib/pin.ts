import { isWeakPin } from "./validation";

/** Uniformly random numeric PIN for the browser (rejection sampling, never trivial). */
export function randomPin(digits = 6): string {
  for (;;) {
    let pin = "";
    while (pin.length < digits) {
      for (const b of crypto.getRandomValues(new Uint8Array(16))) {
        if (b < 250 && pin.length < digits) pin += String(b % 10);
      }
    }
    if (!isWeakPin(pin)) return pin;
  }
}

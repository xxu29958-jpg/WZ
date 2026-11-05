// One clock for input timestamps and the animation loop. Normally real time;
// the ?manual test mode swaps in a virtual clock that advances frame by frame.

let source = () => performance.now() / 1000;

export const now = () => source();

export function setClock(fn) {
  source = fn;
}

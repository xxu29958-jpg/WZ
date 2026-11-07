// What Kon remembers about you, kept in this browser only (localStorage).
// Everything degrades gracefully: with storage blocked, every visit is the first.

const KEY = 'zen70.kon.v1';

const fresh = () => ({ visits: 0, first: Date.now(), last: 0, satori: 0, bestEnso: 0 });

export function loadMemory() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    return fresh();
  }
}

export function saveMemory(m) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* private mode or storage disabled: Kon simply forgets */
  }
}

/** Record a visit. Returns the memory plus how long you were away (hours, or null). */
export function arrive() {
  const m = loadMemory();
  const now = Date.now();
  const awayHours = m.last ? (now - m.last) / 3.6e6 : null;
  m.visits += 1;
  m.last = now;
  saveMemory(m);
  return { memory: m, awayHours };
}

/** Keep "last seen" fresh so the next visit knows how long you were gone. */
export function touch(m) {
  m.last = Date.now();
  saveMemory(m);
}

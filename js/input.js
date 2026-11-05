// InputTracker — turns raw DOM events into a small "senses" snapshot that the
// brain reads once per frame. Pointer and typing are tracked independently.
//
// Privacy: the text field's value is never read. Only the *fact* that input
// happened (and whether it was a deletion) is recorded, to move Kon's eyes.

import { clamp } from './math.js';
import { now } from './clock.js';

export class InputTracker {
  /**
   * @param {object} o
   * @param {HTMLElement} o.surface   element that receives pointer events
   * @param {(cx:number, cy:number)=>{x:number,y:number}} o.toWorld
   * @param {HTMLInputElement} o.input
   * @param {HTMLFormElement} o.form
   * @param {()=>{x0:number,x1:number,y:number}} o.inputSpan  world-space span of the text line
   */
  constructor({ surface, toWorld, input, form, inputSpan }) {
    this.toWorld = toWorld;
    this.inputSpan = inputSpan;
    this.input = input;
    this.pointer = {
      present: false, x: 800, y: 500, clientX: 0, clientY: 0,
      lastMove: -1e9, lastT: 0, vx: 0, vy: 0, speed: 0,
      isTouch: false, down: false,
    };
    this.typing = { focused: false, lastInput: -1e9, lastKey: -1e9, focusAt: -1e9, chars: 0 };
    this.events = [];
    this.hiddenAt = null;
    this.lastSample = now();

    const opts = { passive: true };
    surface.addEventListener('pointermove', (e) => this.onMove(e), opts);
    surface.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    surface.addEventListener('pointerup', (e) => this.onUp(e), opts);
    surface.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    surface.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.leave();
    }, opts);
    window.addEventListener('blur', () => this.leave());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = now();
        this.push({ type: 'hide' });
      } else if (this.hiddenAt !== null) {
        this.push({ type: 'return', away: now() - this.hiddenAt });
        this.hiddenAt = null;
      }
    });

    input.addEventListener('focus', () => {
      this.typing.focused = true;
      this.typing.focusAt = now();
      this.push({ type: 'focus' });
    });
    input.addEventListener('blur', () => {
      this.typing.focused = false;
      this.push({ type: 'blur' });
    });
    input.addEventListener('input', (e) => {
      const t = now();
      const del = typeof e.inputType === 'string' && e.inputType.startsWith('delete');
      this.typing.lastInput = t;
      // an approximate caret estimate from event counts — no content involved
      this.typing.chars = clamp(this.typing.chars + (del ? -1 : 1), 0, 40);
      this.push({ type: 'input', del });
    });
    input.addEventListener('compositionupdate', () => { this.typing.lastInput = now(); });
    input.addEventListener('keydown', () => { this.typing.lastKey = now(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.push({ type: 'submit' });
      form.reset();
      this.typing.chars = 0;
    });
  }

  push(ev) {
    ev.t = now();
    this.events.push(ev);
  }

  leave() {
    if (!this.pointer.present) return;
    this.pointer.present = false;
    this.pointer.vx = this.pointer.vy = 0;
    this.push({ type: 'leave' });
  }

  place(e) {
    const p = this.pointer;
    const w = this.toWorld(e.clientX, e.clientY);
    p.clientX = e.clientX;
    p.clientY = e.clientY;
    return w;
  }

  onMove(e) {
    const t = now();
    const p = this.pointer;
    const w = this.place(e);
    const wasPresent = p.present;
    if (!wasPresent) this.push({ type: 'enter' });
    p.isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (p.isTouch && !p.down) {
      // a hovering pen or a stray touch move: just place it
      p.x = w.x; p.y = w.y; p.present = true; p.lastT = t;
      return;
    }
    const dx = w.x - p.x, dy = w.y - p.y;
    const dt = t - p.lastT;
    if (wasPresent && dt > 0.0005 && dt < 0.25) {
      // exponential smoothing with a ~45ms time constant: no jitter, little lag
      const a = 1 - Math.exp(-dt / 0.045);
      p.vx += (dx / dt - p.vx) * a;
      p.vy += (dy / dt - p.vy) * a;
    } else {
      p.vx = p.vy = 0;
    }
    p.x = w.x;
    p.y = w.y;
    p.lastT = t;
    p.present = true;
    if (Math.hypot(dx, dy) > 0.35) p.lastMove = t;
  }

  onDown(e) {
    const t = now();
    const p = this.pointer;
    const w = this.place(e);
    p.isTouch = e.pointerType !== 'mouse';
    p.down = true;
    if (p.isTouch) {
      // touches have no hover, so the touch point itself becomes the cursor
      p.x = w.x; p.y = w.y; p.vx = p.vy = 0;
      p.lastT = t;
      p.lastMove = t;
      if (!p.present) this.push({ type: 'enter' });
      p.present = true;
    }
    this.downAt = { t, x: e.clientX, y: e.clientY };
    this.push({ type: 'down', x: w.x, y: w.y, touch: p.isTouch, target: e.target });
  }

  onUp(e) {
    const p = this.pointer;
    p.down = false;
    if (!this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    if (now() - this.downAt.t < 0.35 && moved < 14) {
      const w = this.toWorld(e.clientX, e.clientY);
      this.push({ type: 'tap', x: w.x, y: w.y, touch: p.isTouch });
    }
    this.downAt = null;
  }

  /** Re-project the pointer after the viewBox changes (resize / keyboard). */
  reproject() {
    const p = this.pointer;
    if (!p.present) return;
    const w = this.toWorld(p.clientX, p.clientY);
    p.x = w.x;
    p.y = w.y;
  }

  sample() {
    const t = now();
    const dt = t - this.lastSample;
    this.lastSample = t;
    const p = this.pointer;
    if (t - p.lastMove > 0.05) {
      const k = Math.exp(-dt * 9);
      p.vx *= k;
      p.vy *= k;
    }
    p.speed = Math.hypot(p.vx, p.vy);
    const ty = this.typing;
    const span = this.inputSpan();
    // the eyes "read" along the line: centered text grows from the middle
    const u = clamp(0.5 + ty.chars * 0.022, 0.5, 0.97);
    const anchor = { x: span.x0 + (span.x1 - span.x0) * u, y: span.y };
    return {
      now: t,
      pointer: { ...p },
      typing: { ...ty, anchor },
      events: this.events.splice(0),
    };
  }
}

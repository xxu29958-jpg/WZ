// Small shared helpers for building and moving SVG, plus a mixin for classes
// whose methods are split across files by responsibility.

export const NS = 'http://www.w3.org/2000/svg';
export const $ = (id) => document.getElementById(id);

/** Number → short string for SVG attributes. */
export const f2 = (v) => (Math.abs(v) < 1e-4 ? '0' : v.toFixed(2));
export const tr = (x, y) => `translate(${f2(x)} ${f2(y)})`;

export function rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Create an SVG element with attributes, optionally appending it to a parent. */
export function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

/** Copy the methods of each source class onto target's prototype. */
export function mixin(target, ...sources) {
  for (const S of sources) {
    for (const k of Object.getOwnPropertyNames(S.prototype)) {
      if (k !== 'constructor') Object.defineProperty(target.prototype, k, Object.getOwnPropertyDescriptor(S.prototype, k));
    }
  }
}

// Dreams — when Kon is fast asleep, a thought bubble drifts up beside its head
// and shows what a small fox dreams about: inari sushi, the sparrow it will
// definitely catch one day, the ball… and you.
// Mixed into Scene (see scene.js); `this` is the scene.

import { clamp, bump } from '../math.js';
import { $, f2, svgEl } from '../util.js';

const EACH = 4.8; // seconds per dream

export class GardenDreams {
  buildDream() {
    const g = svgEl('g', { id: 'dream', 'aria-hidden': 'true' }, $('fx-world'));
    g.style.display = 'none';
    const dots = [svgEl('circle', { cx: 40, cy: 34, r: 3.6, class: 'dream-bubble' }, g), svgEl('circle', { cx: 30, cy: 22, r: 6, class: 'dream-bubble' }, g)];
    const bubble = svgEl('g', {}, g);
    svgEl('path', { d: 'M -38,-4 C -50,-22 -28,-42 -8,-35 C 2,-50 32,-48 36,-31 C 54,-29 56,-5 40,1 C 38,16 12,22 2,11 C -12,22 -38,14 -38,-4 Z', class: 'dream-bubble' }, bubble);
    const item = () => svgEl('g', { transform: 'translate(1 -13)' }, bubble);
    const items = [];
    // inari sushi, two pieces (what else would a fox dream of?)
    let it = item();
    for (const [dx, dy] of [[-12, 1], [8, 4]]) {
      svgEl('path', { d: `M ${dx - 10},${dy + 9} Q ${dx - 12},${dy - 7} ${dx},${dy - 9} Q ${dx + 12},${dy - 7} ${dx + 10},${dy + 9} Z`, class: 'dream-tofu' }, it);
      svgEl('path', { d: `M ${dx - 6},${dy - 6} q 6,-7 12,0 q -6,3 -12,0 Z`, class: 'dream-rice' }, it);
    }
    items.push(it);
    // you (a cursor, and what Kon thinks of it)
    it = item();
    svgEl('path', { d: 'M -12,-13 L -12,9 L -6.5,4 L -2.5,12.5 L 1.5,10.8 L -2.4,2.6 L 5,2.6 Z', class: 'dream-arrow' }, it);
    svgEl('path', { d: 'M 14,-1 C 6,-7 7,-13 11,-13 C 13,-13 14,-11.5 14,-10 C 14,-11.5 15,-13 17,-13 C 21,-13 22,-7 14,-1 Z', class: 'dream-heart' }, it);
    items.push(it);
    // the sparrow (in the dream, it stays put)
    it = item();
    svgEl('path', { d: 'M -8,2 L -19,-3 L -17,6 Z', class: 'dream-bird' }, it);
    svgEl('ellipse', { cx: -1, cy: 3, rx: 10.5, ry: 8, class: 'dream-bird' }, it);
    svgEl('circle', { cx: 8, cy: -6, r: 6.2, class: 'dream-bird' }, it);
    svgEl('path', { d: 'M 13.4,-7.4 L 18,-6 L 13.4,-4.6 Z M 10,-7.2 v 0.1', class: 'dream-ink' }, it);
    items.push(it);
    // the ball
    it = item();
    svgEl('circle', { r: 12, class: 'dream-rice' }, it);
    svgEl('ellipse', { rx: 11, ry: 4.2, class: 'dream-ink', transform: 'rotate(30)' }, it);
    svgEl('ellipse', { rx: 11, ry: 4.2, class: 'dream-ink', transform: 'rotate(-40)' }, it);
    items.push(it);
    this.dream = { g, dots, bubble, items, k: 0, t: 0, shown: false };
  }

  updateDream(dt) {
    const D = this.dream;
    const on = !!this.konDreaming && !this.reduced && !!this.konBody;
    D.k += ((on ? 1 : 0) - D.k) * (1 - Math.exp(-dt * (on ? 1.6 : 7)));
    const show = D.k > 0.02;
    if (show !== D.shown) { D.shown = show; D.g.style.display = show ? '' : 'none'; if (show) D.t = 0; }
    if (!show) return;
    D.t += dt;
    const crown = this.konBody.crown;
    const ks = (this.konBody.scale || 1.15) / 1.15;
    const bob = Math.sin(D.t * 0.9) * 3;
    D.g.setAttribute('transform', `translate(${f2(crown.x - 104 * ks)} ${f2(crown.y - 58 * ks + bob)}) scale(${f2(ks * 1.35)})`);
    D.g.style.opacity = f2(clamp(D.k * 1.2));
    // the bubble swells up after the two little puffs
    D.dots[0].style.opacity = f2(clamp(D.k * 3));
    D.dots[1].style.opacity = f2(clamp(D.k * 3 - 0.7));
    D.bubble.setAttribute('transform', `scale(${f2(clamp(D.k * 1.6 - 0.5))})`);
    const which = Math.floor(D.t / EACH) % D.items.length;
    const u = (D.t % EACH) / EACH;
    D.items.forEach((it, i) => { it.style.opacity = i === which ? f2(clamp(bump(0, 1, u) * 2.4)) : '0'; });
  }
}

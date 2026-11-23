// The coach card: one short lesson at a time, bottom centre under the interact pill (below her feet) (story's spar lessons, src/story/spar-lessons.js).
//   G.ui.coach({ who, line, task, n, of })   show / replace: the speaker's line, the task (keys already filled in by the
//                                             caller with story/dialogue.js fill(), so touch shows button names), and n / of
//   G.ui.coach({ done: true })               tick the current task off (a brass check, then it fades unless replaced)
//   G.ui.coach(null)                          hide
// Parchment pill in the grimoire look (docs/api/ui.md "Grimoire round"); no pointer events, never blocks play.
import { G } from '../core/game.js';
import { el, setText, setOn } from './dom.js';
import { addCss } from './style.js';

addCss(`
.mv-coach { position: absolute; left: 50%; bottom: 66u; width: 560u; margin-left: -280u; display: flex; justify-content: center; pointer-events: none;
  opacity: 0; transform: translateY(6u); transition: opacity .35s, transform .35s; z-index: 6; }
.mv-coach.on { opacity: 1; transform: none; }
.mv-coach .card { position: relative; max-width: 560u; padding: 7u 22u 8u 16u; border-radius: 4u 18u 18u 4u; color: var(--ink);
  background: linear-gradient(90deg, rgba(250,245,233,.96), rgba(238,227,203,.92));
  box-shadow: inset 0 0 0 1u rgba(122,92,46,.45), inset 3u 0 0 var(--wine), 0 6u 16u rgba(4,6,16,.3); }
.mv-coach .ln { font: 400 13.5u/1.45 var(--fb); letter-spacing: .03em; opacity: .9; }
.mv-coach .ln b { font: 700 12u/1 var(--fd); color: var(--wine); letter-spacing: .12em; margin-right: 6u; }
.mv-coach .tk { margin-top: 3u; font: 700 15u/1.4 var(--fd); letter-spacing: .04em; }
.mv-coach .tk::before { content: '✦'; color: var(--brass2); margin-right: 7u; font-size: 12u; vertical-align: 1u; }
.mv-coach .nn { position: absolute; right: 10u; top: 6u; font: 600 10u/1 var(--fd); letter-spacing: .12em; color: rgba(90,66,30,.65); }
.mv-coach.done .tk { color: #6a7d3a; }
.mv-coach.done .tk::before { content: '✓'; color: #6a7d3a; font-size: 14u; }
.mv-ui.touch .mv-coach { bottom: 6u; left: 270u; width: 400u; margin-left: 0; justify-content: flex-start; }   /* between the stick and the buttons */
`);

export function createCoach(root) {
  const box = el('div', 'mv-coach', root);
  const card = el('div', 'card', box);
  const ln = el('div', 'ln', card);
  const who = el('b', '', ln), line = el('span', '', ln);
  const tk = el('div', 'tk', card);
  const nn = el('div', 'nn', card);
  let fadeT = 0, vis = false;
  return {
    set(o) {
      if (!o) { vis = false; fadeT = 0; return; }
      if (o.done) { box.classList.add('done'); fadeT = o.hold ?? 2.2; return; }
      box.classList.remove('done');
      setText(who, o.who || ''); setText(line, o.line || '');
      ln.style.display = o.line || o.who ? '' : 'none';
      setText(tk, o.task || ''); tk.style.display = o.task ? '' : 'none';
      setText(nn, o.of ? `${o.n} / ${o.of}` : '');
      vis = true;
      fadeT = o.dur || 0;
    },
    update(rdt) {
      if (fadeT > 0 && (fadeT -= rdt) <= 0) vis = false;
      setOn(box, vis && G.mode === 'play');   // hidden under menus and dialogue, back when play resumes
    },
  };
}

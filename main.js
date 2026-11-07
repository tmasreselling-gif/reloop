/* RELOOP – Ereignisse & Start */
'use strict';

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (el.tagName !== 'INPUT') e.preventDefault();
  try { const r = fn(el, e); if (r && r.catch) r.catch((err) => { console.error(err); toast('Fehler: ' + (err.message || err.code || err), 'bad'); }); }
  catch (err) { console.error(err); toast('Fehler: ' + err.message, 'bad'); }
});

function onAnyInput(e) {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.f !== undefined && S.view === 'artikel') return onItemField(el, e);
  if (e.type === 'change' && el.dataset.mailsel !== undefined) return mailSelChange(el);
  if (e.type !== 'input') return;
  if (el.dataset.l !== undefined) return ON_INPUT.listing(el);
  if (el.dataset.inv !== undefined) return ON_INPUT.inv(el);
  if (el.dataset.st !== undefined) return ON_INPUT.studio(el);
  if (el.dataset.s !== undefined) return ON_INPUT.settings(el);
  if (el.dataset.calc !== undefined) return ON_INPUT.calc(el);
  if (el.dataset.ship !== undefined) return ON_INPUT.ship(el);
}
document.addEventListener('input', onAnyInput);
document.addEventListener('change', onAnyInput);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.settings.theme === 'auto') applyTheme(); });

if (window.Chart) { Chart.defaults.font.family = CHART_FONT; }
init().catch((e) => { console.error(e); S.blocker = blockerHTML('Start fehlgeschlagen', String(e && (e.message || e.code) || e)); render(); });

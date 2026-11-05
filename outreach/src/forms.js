import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { config } from './config.js';
import { mapFields } from './llm.js';

// Fills one pitch / apply form with Playwright. Guardrails:
// - stays on the form's own site (other top-level navigations are blocked),
// - a CAPTCHA / bot check / login / e-mail verification stops at once (never worked around) → owner's queue,
// - answers only from the approved profile; a required answer it lacks → owner's queue with the question,
// - review mode stops before Submit with a screenshot; the owner approves, then the saved answers are replayed
//   without calling the model again,
// - screenshots before and after submit are kept with the job.

const CAPTCHA = /recaptcha|hcaptcha|turnstile|challenges\.cloudflare|arkoselabs|funcaptcha|geetest/i;

export class Stop extends Error {
  constructor(kind, message, extra = {}) { super(message); this.kind = kind; Object.assign(this, extra); }
}

/** Visible fields and buttons of the frame with the most fields, tagged with data-bx ids. Compact on purpose. */
function extract() {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return (r.width > 0 && r.height > 0 || el.type === 'file') && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const labelOf = (el) => {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return clean(l.innerText); }
    const wrap = el.closest('label'); if (wrap) return clean(wrap.innerText);
    if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
    const by = el.getAttribute('aria-labelledby'); if (by) return clean(by.split(' ').map((i) => document.getElementById(i)?.innerText).join(' '));
    let p = el.parentElement;
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) { const t = clean(p.innerText); if (t && t.length < 200) return t; }
    return clean(el.placeholder || el.name);
  };
  for (const el of document.querySelectorAll('[data-bx]')) el.removeAttribute('data-bx'); // fresh ids every pass
  let n = 0;
  const fields = [];
  const radios = new Map();
  for (const el of document.querySelectorAll('input, textarea, select, [contenteditable="true"]')) {
    const type = (el.type || el.tagName).toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type) || !visible(el) || el.disabled) continue;
    if (type === 'radio') {
      const key = el.name || `r${n}`;
      if (!radios.has(key)) { const id = `f${++n}`; radios.set(key, { id, type: 'radio', name: key, label: labelOf(el.closest('fieldset') || el.parentElement?.parentElement || el), required: el.required, options: [] }); fields.push(radios.get(key)); }
      const g = radios.get(key); el.setAttribute('data-bx', `${g.id}:${g.options.length}`); g.options.push(labelOf(el)); continue;
    }
    const id = `f${++n}`;
    el.setAttribute('data-bx', id);
    const f = { id, type, label: labelOf(el), required: el.required || el.getAttribute('aria-required') === 'true' };
    if (el.name) f.name = el.name.slice(0, 60);
    if (el.maxLength > 0) f.maxlength = el.maxLength;
    if (el.accept) f.accept = el.accept;
    if (type === 'select-one' || type === 'select-multiple') f.options = [...el.options].map((o) => clean(o.text)).filter(Boolean).slice(0, 40);
    fields.push(f);
  }
  const buttons = [];
  for (const el of document.querySelectorAll('button, input[type=submit], [role=button]')) {
    if (!visible(el) || el.disabled) continue;
    const text = clean(el.innerText || el.value || el.getAttribute('aria-label'));
    if (!text) continue;
    const id = `b${buttons.length + 1}`; el.setAttribute('data-bx', id); buttons.push({ id, text });
    if (buttons.length >= 15) break;
  }
  const password = !!document.querySelector('input[type=password]');
  const human = /verify (that )?you are (a )?human|are you a robot|i'?m not a robot/i.test(document.body?.innerText || '');
  return { title: document.title.slice(0, 120), fields, buttons, password, human };
}

async function bestFrame(page) {
  let best = { frame: page.mainFrame(), data: await page.mainFrame().evaluate(extract) };
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    if (CAPTCHA.test(f.url())) throw new Stop('captcha', 'The form has a CAPTCHA / bot check');
    try { const d = await f.evaluate(extract); if (d.fields.length > best.data.fields.length) best = { frame: f, data: d }; } catch { /* cross-origin frame we cannot read */ }
  }
  return best;
}

const sig = (f) => `${f.type}|${f.name ?? ''}|${f.label}`;

async function apply(frame, fields, fills, deckPath) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  for (const { id, value } of fills) {
    const f = byId.get(id);
    if (!f || value == null || value === '') continue;
    if (f.type === 'radio') {
      const i = f.options.findIndex((o) => o.toLowerCase() === String(value).toLowerCase());
      if (i >= 0) await frame.locator(`[data-bx="${id}:${i}"]`).check({ force: true });
      continue;
    }
    const el = frame.locator(`[data-bx="${id}"]`);
    if (f.type === 'file') { if (value === 'DECK' && deckPath) await el.setInputFiles(deckPath); continue; }
    if (f.type === 'checkbox') { if (value === 'true') await el.check({ force: true }); continue; }
    if (f.type.startsWith('select')) { await el.selectOption({ label: String(value) }).catch(() => el.selectOption(String(value))); continue; }
    if (f.type === 'contenteditable' || f.type === 'div') { await el.click(); await el.pressSequentially(String(value).slice(0, f.maxlength || 5000)); continue; }
    await el.fill(String(value).slice(0, f.maxlength || 5000));
  }
}

const shot = (page) => page.screenshot({ type: 'jpeg', quality: 55, fullPage: true, clip: undefined, timeout: 15_000 }).catch(() => null);

/**
 * Runs a form job. `saved` = answers from an earlier run (review mode); `submit` = allowed to press Submit.
 * Returns { status: 'review' | 'submitted', steps, shots: [{kind, image}], usage }. Throws Stop for the owner's queue.
 */
export async function runForm({ url, profile, deck, saved, submit, budget, mapper = mapFields }) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const usage = { in: 0, out: 0, calls: 0 };
  const shots = [];
  const steps = [];
  let deckPath = null;
  let page = null;
  try {
    if (deck) { deckPath = `/tmp/${deck.filename.replace(/[^\w.\-]/g, '_') || 'deck.pdf'}`; await writeFile(deckPath, deck.data); }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
    page = await ctx.newPage();
    // Stay on the form's site: block top-level navigations to other sites (form providers' own subdomains are fine).
    await page.route('**/*', (route) => {
      const r = route.request();
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) {
        const h = new URL(r.url()).hostname.replace(/^www\./, '');
        if (!(h === host || h.endsWith(`.${host}`) || host.endsWith(`.${h}`))) return route.abort();
      }
      return route.continue();
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);

    for (let step = 0; step < config.maxFormSteps; step++) {
      const { frame, data } = await bestFrame(page);
      if (data.human) throw new Stop('captcha', 'The page asks to prove you are human');
      if (data.password) throw new Stop('login', 'The form needs a login');
      if (!data.fields.length && !data.buttons.length) throw new Stop('empty', 'No form found on the page');
      const prior = saved?.[step];
      let plan;
      if (prior && prior.fields.length === data.fields.length && prior.fields.every((s, i) => s === sig(data.fields[i]))) {
        plan = prior.plan; // same step as when the owner reviewed it: replay, no model call
      } else {
        if (usage.calls >= config.maxModelCallsPerJob || usage.in + usage.out >= budget) throw new Stop('budget', 'Token budget for this form used up');
        const r = await mapper(profile, { url: page.url(), title: data.title, step: step + 1, fields: data.fields, buttons: data.buttons });
        usage.in += r.usage.in; usage.out += r.usage.out; usage.calls++;
        plan = r.plan;
      }
      steps.push({ fields: data.fields.map(sig), plan });
      if (plan.missing.length) throw new Stop('missing', `Needs answers: ${plan.missing.join(' | ')}`, { missing: plan.missing, steps, usage });
      if (plan.action === 'stop') throw new Stop('empty', 'This page is not a form the agent can fill', { steps, usage });
      await apply(frame, data.fields, plan.fills, deckPath);
      const btn = data.buttons.find((b) => b.id === plan.button);
      if (!btn) throw new Stop('unclear', 'Could not tell which button continues the form', { steps, usage });
      if (plan.action === 'submit') {
        shots.push({ kind: 'form.filled', image: await shot(page) });
        if (!submit) return { status: 'review', steps, shots, usage };
        await frame.locator(`[data-bx="${btn.id}"]`).click();
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const after = await bestFrame(page).catch(() => null);
        shots.push({ kind: 'form.after-submit', image: await shot(page) });
        const invalid = await frame.locator('[aria-invalid="true"]').count().catch(() => 0);
        if (invalid > 0 || (after && after.data.fields.length && sig(after.data.fields[0]) === steps.at(-1).fields[0])) {
          throw new Stop('rejected', 'The form did not accept the answers (still on the same page)', { steps, usage, shots });
        }
        return { status: 'submitted', steps, shots, usage };
      }
      await frame.locator(`[data-bx="${btn.id}"]`).click();
      await page.waitForTimeout(2000);
    }
    throw new Stop('unclear', 'Too many steps', { steps, usage });
  } catch (e) {
    if (e instanceof Stop) {
      e.usage ??= usage; e.steps ??= steps; e.shots ??= shots;
      // What the owner will see in their queue: the page as the agent left it.
      if (page && !e.shots.some((s) => s.kind === 'form.stopped')) e.shots.push({ kind: 'form.stopped', image: await shot(page) });
    }
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}

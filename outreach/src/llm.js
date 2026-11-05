import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

// The model is used for ONE thing: mapping a form's fields to answers from the approved company profile.
// Emails never go through the model (their text is the one the owner approved in Admin → Investors).
// Cost control: the rules + profile are a cached system prefix, the page is sent as a compact field list (no
// screenshots, no HTML), output is a small JSON object, low effort, and the worker caps calls and tokens per job
// and per day.

const client = config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey, maxRetries: 2 }) : null;
export const modelReady = () => !!(client && config.model);

const RULES = `You fill in a startup's pitch / application form on its behalf.
You get the company PROFILE (the only facts you may use) and the form's FIELDS as JSON.
Return one JSON object that fills the fields of THIS step.

Rules:
- Use only facts from PROFILE. Never invent numbers, names, links, dates or claims. If a field needs a fact that PROFILE does not have, leave it out; if that field is required, add a short question to "missing".
- Keep answers short and factual, in English, in the founder's voice. Respect any maxlength.
- Text fields: put the text in "value". Select / radio: "value" is exactly one of the field's options. Checkbox: "value" is "true" or "false"; tick consent / privacy / terms boxes only when they are required to submit.
- File inputs that ask for a deck, pitch, presentation or PDF: "value" is "DECK". Any other file input: leave it out (and add to "missing" if required).
- Never fill password fields, payment fields or fields asking for an ID number; if such a field is required, put it in "missing".
- "action": "next" when a button moves to the next step, "submit" when this step's button submits the form, "stop" when the page is not a form you can fill. "button" is the id of that button (or "" for stop).
- Never answer questions about investing personal money, securities or legal attestations beyond PROFILE; put them in "missing".`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fills', 'missing', 'action', 'button'],
  properties: {
    fills: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['id', 'value'], properties: { id: { type: 'string' }, value: { type: 'string' } } },
    },
    missing: { type: 'array', items: { type: 'string' } },
    action: { type: 'string', enum: ['next', 'submit', 'stop'] },
    button: { type: 'string' },
  },
};

/** One step: returns { plan, usage }. Throws on refusal or an unusable answer. */
export async function mapFields(profile, page) {
  const res = await client.messages.create({
    model: config.model,
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: [
      { type: 'text', text: RULES },
      { type: 'text', text: `PROFILE:\n${JSON.stringify(profile)}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: `FIELDS:\n${JSON.stringify(page)}` }],
  });
  const usage = {
    in: (res.usage?.input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0),
    out: res.usage?.output_tokens ?? 0,
  };
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('model declined this form'), { usage });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let plan;
  try { plan = JSON.parse(text); } catch { throw Object.assign(new Error('model answer was not JSON'), { usage }); }
  if (!Array.isArray(plan.fills) || !Array.isArray(plan.missing)) throw Object.assign(new Error('model answer had the wrong shape'), { usage });
  return { plan, usage };
}

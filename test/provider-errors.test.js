import test from 'node:test';
import assert from 'node:assert/strict';
import { services } from '../lib/services.js';
import { sanitizeDesign, template } from '../lib/designer.js';
import { geminiFailureMessage } from '../lib/config.js';

test('Gemini errors preserve actionable codes while redacting credentials', async () => {
  const key = 'synthetic-private-key';
  const svc = services({ GEMINI_API_KEY: key }, async () => Response.json({ error: {
    status: 'INVALID_ARGUMENT', message: `Invalid request for ${key}`,
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
  } }, { status: 400 }));
  await assert.rejects(svc.call('Gemini', 'https://test.invalid'), error => {
    assert.equal(error.status, 400); assert.equal(error.code, 'INVALID_ARGUMENT'); assert.equal(error.reason, 'API_KEY_INVALID');
    assert(!error.providerMessage.includes(key)); return true;
  });
});
test('malformed AI scenes and choices do not bypass local validation or crash', () => {
  const previous = template('vn');
  const safe = sanitizeDesign({ ...previous, scenes: [null, false, 'bad', { id: 'start', speaker: 'Guide', text: 'hello', choices: [null, 'invalid', { label: 'next', next: 'missing' }] }] }, previous, []);
  assert.equal(safe.scenes.length, 1); assert.deepEqual(safe.scenes[0].choices, []);
  const fallback = sanitizeDesign({ ...previous, scenes: [null, 'invalid'] }, previous, []);
  assert.equal(fallback.scenes.length, previous.scenes.length);
});
test('payload rejection is distinguished from credentials and quota problems', () => {
  assert.match(geminiFailureMessage({ status: 400 }), /รูปแบบคำขอ/);
  assert.match(geminiFailureMessage({ status: 400, reason: 'API_KEY_INVALID' }), /ปฏิเสธ API key/);
  assert.match(geminiFailureMessage({ status: 429 }), /โควตา/);
});

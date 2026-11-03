import test from 'node:test';
import assert from 'node:assert/strict';
import { services } from '../lib/services.js';

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

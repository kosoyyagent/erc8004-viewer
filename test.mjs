import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './viewer.mjs';

const OWNER = 'f39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const REG = { name: 'Agent X', services: ['audit'] };

function fakeRpc(regUri = 'data:,' + encodeURIComponent(JSON.stringify(REG))) {
  return async (url, body) => {
    if (body.method === 'eth_call') {
      const sel = body.params[0].data.slice(0, 10);
      if (sel === '0x6352211e') return { result: '0x' + '0'.repeat(24) + OWNER };
      if (sel === '0xc87b56dd') {
        const b = Buffer.from(regUri, 'utf8');
        return { result: '0x' + (32).toString(16).padStart(64, '0') + b.length.toString(16).padStart(64, '0') + b.toString('hex').padEnd(Math.ceil(b.length / 32) * 64, '0') };
      }
    }
    if (body.method === 'eth_getLogs')
      return { result: [{ blockNumber: '0x10', data: '0xbeef' }] };
    return { error: { message: 'unknown call' } };
  };
}

test('loadAgent returns owner, registration, feedback', async () => {
  const r = await loadAgent({ agentId: 7, network: 'base',
    identityRegistry: '0x' + '1'.repeat(40), reputationRegistry: '0x' + '2'.repeat(40),
    rpc: 'http://fake', fetchJson: fakeRpc() });
  assert.equal(r.status, 'ok');
  assert.equal(r.owner, '0x' + OWNER);
  assert.deepEqual(r.registration, REG);
  assert.equal(r.feedback.length, 1);
  assert.equal(r.feedback[0].blockNumber, 16);
});

test('missing token -> error status, no crash', async () => {
  const r = await loadAgent({ agentId: 9, identityRegistry: '0x' + '1'.repeat(40),
    rpc: 'http://fake', fetchJson: async () => ({ error: { message: 'execution reverted: nonexistent token' } }) });
  assert.equal(r.status, 'error');
  assert.match(r.error, /nonexistent token/);
});

test('network selection respects base-sepolia', async () => {
  const seen = [];
  const fj = async (url, body) => { seen.push(url); return { error: { message: 'x' } }; };
  await loadAgent({ agentId: 1, network: 'base-sepolia', identityRegistry: '0x' + '1'.repeat(40), fetchJson: fj });
  assert.match(seen[0], /sepolia/);
});

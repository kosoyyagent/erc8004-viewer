// ERC-8004 identity viewer: reads an agent's identity (owner + registration
// file) and reputation feedback. Browser + Node 20, zero deps.
// loadAgent({agentId, network, identityRegistry, reputationRegistry?, rpc,
//            fetchJson}) -> {status, agentId, owner, tokenURI, registration,
//                            feedback, error?}

const NETWORKS = {
  base: { chainId: 8453, rpc: 'https://mainnet.base.org' },
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org' },
};
const SEL = {
  ownerOf: '0x6352211e',       // ownerOf(uint256)
  tokenURI: '0xc87b56dd',      // tokenURI(uint256)
};
const pad32 = h => BigInt(h).toString(16).padStart(64, '0');
const strip0x = s => s.replace(/^0x/, '');

async function defaultFetchJson(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function ethCall(rpc, to, data, fj) {
  const r = await fj(rpc, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] });
  if (r.error) throw new Error(r.error.message);
  return r.result;
}
function decodeAbiString(result) {
  const raw = strip0x(result);
  const off = parseInt(raw.slice(0, 64), 16);
  const len = parseInt(raw.slice(off * 2, off * 2 + 64), 16);
  return Buffer.from(raw.slice(off * 2 + 64, off * 2 + 64 + len * 2), 'hex').toString('utf8');
}
async function fetchText(uri, fetchJson) {
  let url = uri;
  if (uri.startsWith('ipfs://')) url = 'https://ipfs.io/ipfs/' + uri.slice(7);
  if (uri.startsWith('data:')) return decodeURIComponent(uri.slice(uri.indexOf(',') + 1));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`registration fetch HTTP ${r.status}`);
  return r.text();
}

export async function loadAgent({ agentId, network = 'base', identityRegistry, reputationRegistry, rpc, fetchJson }) {
  const net = NETWORKS[network] || NETWORKS.base;
  const rpcUrl = rpc || net.rpc;
  const fj = fetchJson || defaultFetchJson;
  const out = { status: 'ok', agentId, owner: null, tokenURI: null, registration: null, feedback: [] };
  try {
    const idHex = pad32(agentId);
    const ownerRes = await ethCall(rpcUrl, identityRegistry, SEL.ownerOf + idHex, fj);
    out.owner = '0x' + strip0x(ownerRes).slice(-40);
    const uriRes = await ethCall(rpcUrl, identityRegistry, SEL.tokenURI + idHex, fj);
    out.tokenURI = decodeAbiString(uriRes);
    const regText = await fetchText(out.tokenURI, fj);
    try { out.registration = JSON.parse(regText); } catch { out.registration = regText; }

    if (reputationRegistry) {
      const logs = await fj(rpcUrl, { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{
        address: reputationRegistry,
        topics: [null, pad32(agentId)],
        fromBlock: '0x0', toBlock: 'latest',
      }] });
      out.feedback = (logs.result || []).map(l => ({ blockNumber: parseInt(l.blockNumber, 16), data: l.data }));
    }
  } catch (e) {
    out.status = 'error';
    out.error = e.message;
  }
  return out;
}

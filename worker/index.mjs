const types = ['Specification', 'Design', 'Code', 'Distribution'];
const keyPattern = /^[a-f0-9]{64}$/;
const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

function json(data, status = 200) {
  return Response.json(data, { status, headers });
}

async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function payload(request) {
  const raw = await request.text();
  if (raw.length > 12000) return {};
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function field(data, name, limit) {
  const value = typeof data[name] === 'string' ? data[name].trim() : '';
  return value.length <= limit ? value : '';
}

const registry = '0x42c707149d48a4203febe2e6c98b13f2740f5496';
const seedSubmitted = '0x9d7fef261dfbf53c4a1e78a0e55492ea46860e96b992fd368ab1f0162d1dece7';
const hashPattern = /^0x[0-9a-f]{64}$/;

async function transactionReceipt(transaction) {
  const response = await fetch('https://mainnet.base.org', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [transaction]}),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Base receipt lookup failed');
  const result = await response.json();
  if (result.error) throw new Error('Base receipt lookup returned an error');
  return result.result;
}

async function publish(db, request) {
  const data = await payload(request);
  const title = field(data, 'title', 100);
  const problem = field(data, 'problem', 1500);
  const mechanism = field(data, 'mechanism', 2000);
  const roles = field(data, 'roles', 200);
  if (!title || !problem || !mechanism || !keyPattern.test(data.owner) || !keyPattern.test(data.invite)) {
    return json({error: 'Enter a title, problem, and proposed mechanism.'}, 400);
  }
  const [ownerHash, inviteHash] = await Promise.all([hash(data.owner), hash(data.invite)]);
  const id = ownerHash.slice(0, 32);
  const transaction = typeof data.transaction === 'string' ? data.transaction.toLowerCase() : '';
  const originator = typeof data.originator === 'string' ? data.originator.toLowerCase() : '';
  if (!hashPattern.test(transaction) || !/^0x[0-9a-f]{40}$/.test(originator)) {
    return json({error: 'A confirmed registry submission is required.'}, 400);
  }
  const matched = await db.prepare('SELECT * FROM chain_seeds WHERE workspace_id = ?').bind(id).first();
  if (matched) {
    if (matched.transaction_hash !== transaction) return json({error: 'This workspace already has a Seed ID.'}, 409);
    return json({id, chainSeedId: matched.chain_seed_id});
  }
  const commitment = '0x' + await hash(JSON.stringify(['crucible-seed-v1', originator, title, problem, mechanism, roles, data.owner]));
  const receipt = await transactionReceipt(transaction);
  if (!receipt) return json({error: 'Submission is awaiting confirmation. Retry verification when it confirms.'}, 425);
  if (receipt.status !== '0x1') return json({error: 'The registry transaction reverted. Submit again to retry.', code: 'registry_reverted'}, 422);
  const originatorTopic = '0x' + originator.slice(2).padStart(64, '0');
  const log = receipt.logs.find(log =>
    log.address.toLowerCase() === registry &&
    log.topics[0] === seedSubmitted &&
    hashPattern.test(log.topics[1]) &&
    log.topics[2] === originatorTopic &&
    log.data === commitment
  );
  if (!log) return json({error: 'This transaction does not match the private Seed commitment.'}, 400);
  const chainSeedId = BigInt(log.topics[1]).toString();
  await db.batch([
    db.prepare('INSERT INTO seeds (id,title,problem,mechanism,roles,owner_hash,invite_hash) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .bind(id, title, problem, mechanism, roles, ownerHash, inviteHash),
    db.prepare('INSERT INTO chain_seeds VALUES (?,?,?,?) ON CONFLICT(workspace_id) DO NOTHING')
      .bind(id, chainSeedId, transaction, originator)
  ]);
  const saved = await db.prepare('SELECT transaction_hash FROM chain_seeds WHERE workspace_id = ?').bind(id).first();
  if (saved.transaction_hash !== transaction) return json({error: 'This workspace already has a Seed ID.'}, 409);
  return json({id, chainSeedId}, 201);
}

async function seedRoute(db, request, id, action) {
  const key = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!key) return json({error: 'Open the original invitation link or use the browser that published this Seed.'}, 403);
  const digest = await hash(key);
  const seed = await db.prepare('SELECT * FROM seeds WHERE id = ? AND (owner_hash = ? OR invite_hash = ?)')
    .bind(id, digest, digest).first();
  if (!seed) return json({error: 'This Seed is unavailable with the supplied link.'}, 404);
  const owner = seed.owner_hash === digest;

  if (request.method === 'POST' && action === 'branches') {
    const data = await payload(request);
    const title = field(data, 'title', 100);
    const author = field(data, 'author', 80);
    const proposal = field(data, 'proposal', 2000);
    if (!title || !author || !proposal || !types.includes(data.kind) || !keyPattern.test(data.id)) {
      return json({error: 'Enter your name, a Branch title, and a proposal.'}, 400);
    }
    const branchId = (await hash(id + digest + data.id)).slice(0, 32);
    await db.prepare('INSERT INTO branches VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO NOTHING')
      .bind(branchId, id, title, author, data.kind, proposal).run();
  } else if (request.method === 'POST' && action?.startsWith('merge/')) {
    if (!owner) return json({error: 'Only the Seed publisher can merge a Branch.'}, 403);
    const {weight} = await payload(request);
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
      return json({error: 'Enter a whole-number weight from 1 to 1,000.'}, 400);
    }
    const result = await db.prepare('UPDATE branches SET weight = ? WHERE seed_id = ? AND id = ? AND weight IS NULL')
      .bind(weight, id, action.slice(6)).run();
    if (!result.meta.changes) return json({error: 'This Branch has already been merged or is unavailable.'}, 409);
  } else if (request.method !== 'GET' || action) {
    return json({error: 'Unknown action.'}, 404);
  }

  const chain = await db.prepare('SELECT chain_seed_id, transaction_hash FROM chain_seeds WHERE workspace_id = ?').bind(id).first();
  const {results: branches} = await db.prepare(
    'SELECT id, title, author, kind, proposal, weight FROM branches WHERE seed_id = ? ORDER BY rowid'
  ).bind(id).all();
  const merged = branches.filter(branch => branch.weight !== null);
  const total = merged.reduce((sum, branch) => sum + BigInt(branch.weight), 0n);
  let dust = merged.length ? 5500 : 0;
  for (const branch of merged) {
    branch.share = Number(5500n * BigInt(branch.weight) / total);
    dust -= branch.share;
  }
  return json({
    id, title: seed.title, problem: seed.problem, mechanism: seed.mechanism, roles: seed.roles,
    owner, branches, dust, chainSeedId: chain?.chain_seed_id, transaction: chain?.transaction_hash,
    stage: merged.length ? 'Prototype' : branches.length ? 'Incubation' : 'Spark'
  });
}

export default {
  async fetch(request, env) {
    const {pathname} = new URL(request.url);
    try {
      if (request.method === 'POST' && pathname === '/api/seeds') return await publish(env.DB, request);
      const route = pathname.match(/^\/api\/seeds\/([a-f0-9]{32})(?:\/(branches|merge\/[a-f0-9]{32}))?$/);
      if (route) return await seedRoute(env.DB, request, route[1], route[2]);
      const pages = {'/': 'index.html', '/admin': 'admin.html', '/about': 'about.html', '/help': 'help.html'};
      const file = pages[pathname] ?? pathname.slice(1);
      if (request.method === 'GET' && Object.hasOwn(assets, file)) {
        const type = file.endsWith('.html') ? 'text/html' : 'text/javascript';
        return new Response(assets[file], {headers: {...headers, 'Content-Type': type + '; charset=utf-8'}});
      }
      return json({error: 'Page not found.'}, 404);
    } catch (error) {
      console.error('Crucible request failed', error.message);
      return json({error: 'The Seed workspace is temporarily unavailable. Try again shortly.'}, 503);
    }
  }
};

const sharedStorage = 'crucible-shared-seeds';
const workspace = document.querySelector('#shared');
const sharedStatus = document.querySelector('#shared-status');
const sharedContent = document.querySelector('#shared-content');
const sharedTitle = document.querySelector('#shared-title');
let sharedSeeds = {};
let pendingPublication;
let currentWorkspace;
try {
  const saved = JSON.parse(localStorage.getItem(sharedStorage) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) sharedSeeds = saved;
} catch {}

function sharedCards() {
  return Object.values(sharedSeeds).filter(seed => seed?.title).map(seed => ({...seed, shared: true}));
}

function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function rememberSeed(seed) {
  sharedSeeds[seed.id] = {...sharedSeeds[seed.id], ...seed};
  try {
    localStorage.setItem(sharedStorage, JSON.stringify(sharedSeeds));
    return true;
  } catch {
    return false;
  }
}

async function api(path, key, body) {
  const headers = {};
  if (key) headers.Authorization = 'Bearer ' + key;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/seeds' + path, {
    headers,
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The workspace is unavailable. Try again.');
    error.code = result.code;
    throw error;
  }
  return result;
}

const pendingKey = 'crucible-pending-registry-submission';
const registryAddress = '0x42C707149D48a4203FEbE2E6c98B13F2740F5496';
const evoAddress = '0x7AD70484B84E2ED7A902395472Ab1DA413Ee89CA';
const transactionPattern = /^0x[0-9a-f]{64}$/i;
const submissionInput = document.querySelector('#submission-tx');
const submissionLabel = document.querySelector('label[for="submission-tx"]');

function showSubmissionRecovery(transaction) {
  submissionInput.hidden = false;
  submissionLabel.hidden = false;
  submissionInput.value = transaction || '';
}

function savePending() {
  localStorage.setItem(pendingKey, JSON.stringify(pendingPublication));
}

try {
  pendingPublication = JSON.parse(localStorage.getItem(pendingKey));
  if (pendingPublication?.seed) {
    const form = document.querySelector('#draft');
    for (const key of ['title', 'problem', 'mechanism', 'roles']) {
      form.elements.namedItem(key).value = pendingPublication.seed[key] || '';
    }
    if (pendingPublication.sent) showSubmissionRecovery(pendingPublication.transaction);
  }
} catch {}

async function sendRegistrySubmission(seed, status) {
  const provider = window.crucibleWallet.provider;
  if (!provider?.request) throw new Error('Connect a wallet from the Crucible header first.');
  const rpc = (method, params = []) => provider.request({method, params});
  const [address] = await rpc(window.crucibleWallet.managed ? 'eth_accounts' : 'eth_requestAccounts');
  const originator = address?.toLowerCase();
  if (!originator || await rpc('eth_chainId') !== '0x2105') {
    throw new Error('Connect your wallet on Base Mainnet.');
  }
  const fee = 30n;
  pendingPublication.originator = originator;
  savePending();
  const word = address => address.slice(2).toLowerCase().padStart(64, '0');
  const allowance = await rpc('eth_call', [{
    to: evoAddress, data: '0xdd62ed3e' + word(originator) + word(registryAddress)
  }, 'latest']);
  if (BigInt(allowance) < fee) {
    status.textContent = 'Approve the EVO deposit in your wallet, then retry once the approval confirms.';
    const approval = await rpc('eth_sendTransaction', [{
      from: originator, to: evoAddress, data: '0x095ea7b3' + word(registryAddress) + fee.toString(16).padStart(64, '0')
    }]);
    if (transactionPattern.test(approval)) {
      status.textContent = 'EVO approval sent. Once it confirms, click Submit to Incubator again.';
      return false;
    }
    throw new Error('The wallet did not return an approval transaction hash.');
  }
  const {title, problem, mechanism, roles} = seed;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    JSON.stringify(['crucible-seed-v1', originator, title, problem, mechanism, roles || '', pendingPublication.owner])
  ));
  const commitment = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (await rpc('eth_chainId') !== '0x2105' || (await rpc('eth_accounts'))[0]?.toLowerCase() !== originator) {
    throw new Error('The wallet account or network changed. Select the original Base wallet and try again.');
  }
  status.textContent = 'Review the registry submission in your wallet.';
  pendingPublication.sent = true;
  savePending();
  try {
    const transaction = await rpc('eth_sendTransaction', [{
      from: originator, to: registryAddress, data: '0x14344f6b' + commitment
    }]);
    if (!transactionPattern.test(transaction)) throw new Error('Paste the submitted transaction hash to recover this Seed.');
    pendingPublication.transaction = transaction;
    savePending();
  } catch (error) {
    if (error?.code === 4001) {
      pendingPublication.sent = false;
      savePending();
    } else {
      showSubmissionRecovery(pendingPublication.transaction);
    }
    throw error;
  }
  showSubmissionRecovery(pendingPublication.transaction);
  return true;
}

async function publishFromDraft(seed, status, form) {
  const submitButtons = [...form.querySelectorAll('button')];
  if (submitButtons.some(button => button.disabled)) return;
  submitButtons.forEach(button => button.disabled = true);
  try {
    const fingerprint = JSON.stringify(seed);
    if (pendingPublication?.sent && pendingPublication.fingerprint !== fingerprint) {
      throw new Error('Restore the original Seed fields before verifying the pending submission.');
    }
    if (pendingPublication?.fingerprint !== fingerprint) {
      pendingPublication = {fingerprint, seed, owner: randomKey(), invite: randomKey()};
      savePending();
    }
    if (!pendingPublication.sent && !await sendRegistrySubmission(seed, status)) return;
    const transaction = submissionInput.value.trim() || pendingPublication.transaction;
    if (!transactionPattern.test(transaction || '')) {
      throw new Error('Paste the registry submission transaction hash from your wallet.');
    }
    const {owner, invite, originator} = pendingPublication;
    status.textContent = 'Verifying the Base transaction…';
    const result = await api('', null, {...seed, owner, invite, originator, transaction});
    const {title, problem} = seed;
    const saved = rememberSeed({id: result.id, title, problem, stage: 'Spark', key: owner, invite});
    if (saved) {
      pendingPublication = null;
      localStorage.removeItem(pendingKey);
      submissionInput.hidden = true;
      submissionLabel.hidden = true;
    }
    form.reset();
    status.textContent = '';
    drop.close();
    filter = 'All';
    renderBoard();
    await openWorkspace(result.id);
    if (!saved && currentWorkspace === result.id) {
      sharedStatus.textContent = 'Submitted. Browser storage is full. Keep this tab open to retain merge access.';
    }
  } catch (error) {
    if (error.code === 'registry_reverted' && submissionInput.value.trim().toLowerCase() === pendingPublication?.transaction?.toLowerCase()) {
      pendingPublication.sent = false;
      delete pendingPublication.transaction;
      savePending();
      submissionInput.value = '';
      submissionInput.hidden = true;
      submissionLabel.hidden = true;
    }
    status.textContent = error.message;
  } finally {
    submitButtons.forEach(button => button.disabled = false);
  }
}

async function openWorkspace(id, invitation) {
  currentWorkspace = id;
  sharedTitle.textContent = 'Seed workspace';
  sharedContent.replaceChildren();
  sharedStatus.textContent = 'Loading Seed…';
  if (!workspace.open) workspace.showModal();
  const key = sharedSeeds[id]?.key || invitation;
  try {
    const data = await api('/' + id, key);
    if (currentWorkspace !== id || !workspace.open) return;
    rememberSeed({id, key, title: data.title, problem: data.problem, stage: data.stage});
    renderBoard();
    renderWorkspace(data);
    sharedStatus.textContent = '';
  } catch (error) {
    if (currentWorkspace === id) sharedStatus.textContent = error.message;
  }
}

function workspaceForm(form, action, seed, success) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const data = await action(new FormData(form));
      if (currentWorkspace !== seed.id || !workspace.open) return;
      rememberSeed({id: seed.id, stage: data.stage});
      renderBoard();
      renderWorkspace(data);
      sharedStatus.textContent = success;
      sharedStatus.scrollIntoView({block: 'nearest'});
    } catch (error) {
      if (currentWorkspace === seed.id) sharedStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function renderWorkspace(seed) {
  const record = sharedSeeds[seed.id];
  const path = '/' + seed.id;
  sharedTitle.textContent = seed.title;
  sharedContent.replaceChildren(element('p', seed.stage + ' · Shared Seed', 'tag'));
  for (const [label, value] of [['Problem', seed.problem], ['Proposed mechanism', seed.mechanism], ['Needed roles', seed.roles]]) {
    if (value) sharedContent.append(element('h3', label), element('p', value, 'muted'));
  }

  if (seed.chainSeedId) {
    const link = element('a', 'Base Seed #' + seed.chainSeedId + ' ↗', 'btn');
    link.href = 'https://basescan.org/tx/' + seed.transaction;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    sharedContent.append(link);
  }

  if (seed.owner && record.invite) {
    const invite = element('section', '');
    invite.innerHTML = '<h3>Invite a collaborator</h3><p class="muted">Give them viewer access through the Site’s sharing settings, then send this link. Anyone with both can propose a Branch.</p><label for="invite-link">Seed invitation link</label><input id="invite-link" readonly><div class="form-actions"><button class="btn" type="button">Copy invitation link</button></div>';
    const link = invite.querySelector('input');
    link.value = location.origin + '/#invite=' + seed.id + '.' + record.invite;
    invite.querySelector('button').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link.value);
        sharedStatus.textContent = 'Invitation link copied.';
      } catch {
        link.select();
        sharedStatus.textContent = 'Copy the selected invitation link.';
      }
    });
    sharedContent.append(invite);
  }

  const branches = element('section', '');
  const refresh = element('button', 'Refresh workspace', 'btn');
  refresh.addEventListener('click', () => openWorkspace(seed.id));
  branches.append(element('h3', 'Branches'), refresh);
  if (!seed.branches.length) branches.append(element('p', 'No proposals yet.', 'muted'));
  for (const branch of seed.branches) {
    const card = element('article', '', 'card');
    const merged = branch.weight !== null;
    card.append(element('span', branch.kind + ' · ' + (merged ? 'Merged' : 'Open for review'), 'tag'),
      element('h3', branch.title), element('p', 'By ' + branch.author), element('p', branch.proposal));
    if (merged) card.append(element('strong', branch.share + ' BPS · Weight ' + branch.weight));
    if (seed.owner && !merged) {
      const form = element('form', '', 'merge');
      form.innerHTML = '<label>Contribution weight<input name="weight" type="number" min="1" max="1000" value="1" required></label><button class="btn">Merge Branch</button>';
      workspaceForm(form, data => api(path + '/merge/' + branch.id, record.key, {weight: Number(data.get('weight'))}), seed, 'Branch merged. Builder shares updated.');
      card.append(form);
    }
    branches.append(card);
  }
  sharedContent.append(branches);

  const allocation = element('section', '');
  allocation.append(element('h3', 'Builder allocation'));
  const merged = seed.branches.filter(branch => branch.weight !== null);
  for (const branch of merged) {
    const row = element('div', branch.title + ' · ' + branch.author, 'row');
    row.append(element('strong', branch.share + ' BPS'));
    allocation.append(row);
  }
  allocation.append(element('p', merged.length
    ? 'Originator receives ' + (1500 + seed.dust) + ' BPS, including ' + seed.dust + ' BPS from rounding.'
    : 'The 5,500 BPS builder pool is allocated after the first merge.', 'muted'));
  sharedContent.append(allocation);

  const propose = element('section', '');
  propose.innerHTML = '<h3>Propose a Branch</h3><form><label for="branch-title">Branch title</label><input id="branch-title" name="title" maxlength="100" required><label for="branch-author">Your display name</label><input id="branch-author" name="author" maxlength="80" required><label for="branch-kind">Branch type</label><select id="branch-kind" name="kind"><option>Specification</option><option>Design</option><option>Code</option><option>Distribution</option></select><label for="branch-proposal">Proposal</label><textarea id="branch-proposal" name="proposal" rows="3" maxlength="2000" required></textarea><button class="btn primary">Submit for review</button></form>';
  const proposalId = randomKey();
  workspaceForm(propose.querySelector('form'), data => api(path + '/branches', record.key, {
    ...Object.fromEntries(data), id: proposalId
  }), seed, 'Branch submitted for review.');
  sharedContent.append(propose);
}

function checkInvite() {
  const match = location.hash.match(/^#invite=([a-f0-9]{32})\.([a-f0-9]{64})$/);
  if (match) openWorkspace(match[1], match[2]);
}
window.addEventListener('hashchange', checkInvite);
workspace.addEventListener('close', () => {
  currentWorkspace = null;
  if (location.hash.startsWith('#invite=')) history.replaceState(null, '', '#seeds');
});
renderBoard();
checkInvite();

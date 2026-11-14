const selectors = {
  "graduationConfigurationHash": "0x9479dca8",
  "HOUSE_WALLET": "0x00578353",
  "incubator": "0xebceda32",
  "quorumVerifier": "0x8e8e822a",
  "acceptSeed": "0x024e225f",
  "setWorkspaceMember": "0xed272688",
  "inviteCurator": "0x69e689e3",
  "allocateReserve": "0x689cd240",
  "reserveMilestone": "0x7e6b5dd1",
  "acceptMilestone": "0x6664ea74",
  "attestGraduation": "0x4921586a",
  "graduateSeed": "0x46e39a83"
};

const house = '0x6736d2eA9807297F0e56967361B9410854B86a5f';
const network = '0x2105';
const addressPattern = /^0x[0-9a-f]{40}$/i;
const byId = id => document.getElementById(id);
const registry = byId('registry');
const status = byId('status');
const controls = byId('controls');
const actions = byId('action');
const txStatus = byId('tx-status');
let verifiedAddress = '';
let verificationAttempt = 0;

const seed = ['Seed ID', 'uint'];
const milestone = ['Milestone ID', 'bytes32'];
const amount = ['Amount (smallest EVO units)', 'uint'];
const definitions = {
  acceptSeed: ['Accept Seed', seed],
  setWorkspaceMember: ['Set workspace membership', seed, ['Member address', 'address'], ['Access', 'bool']],
  inviteCurator: ['Set curator invitation', seed, ['Curator address', 'address'], ['Stake (smallest EVO units, 0 revokes)', 'uint']],
  allocateReserve: ['Allocate global reserve', seed, amount],
  reserveMilestone: ['Reserve milestone', seed, milestone, ['Recipient address', 'address'], amount],
  acceptMilestone: ['Approve and pay milestone', seed, milestone],
  attestGraduation: ['Attest graduation quorum', seed, ['Release digest', 'bytes32'], ['Builder payout address', 'address'], ['Curator payout address', 'address']],
  graduateSeed: ['Graduate Seed', seed, ['Release digest', 'bytes32'], ['Builder payout address', 'address'], ['Curator payout address', 'address']]
};

byId('house').textContent = house;
for (const [name, [label]] of Object.entries(definitions)) actions.add(new Option(label, name));

function request(method, params = []) {
  const wallet = window.crucibleWallet.provider;
  if (!wallet?.request) throw new Error('Connect the House wallet first.');
  return wallet.request({ method, params });
}

function clearVerification(message) {
  verificationAttempt++;
  verifiedAddress = '';
  controls.disabled = true;
  status.textContent = message;
}

async function checkWallet() {
  const [accounts, chain] = await Promise.all([request('eth_accounts'), request('eth_chainId')]);
  if (accounts[0]?.toLowerCase() !== house.toLowerCase()) throw new Error('Select the House wallet.');
  if (chain !== network) throw new Error('Switch your wallet to Base Mainnet.');
}

function encode(value, type) {
  if (type === 'bytes32' && /^0x[0-9a-f]{64}$/i.test(value)) return value.slice(2);
  if (type === 'address' && addressPattern.test(value) && !/^0x0{40}$/i.test(value)) return value.slice(2).padStart(64, '0');
  if (type === 'bool') return (value === 'true' ? '1' : '0').padStart(64, '0');
  if (type === 'uint' && /^[0-9]{1,78}$/.test(value) && BigInt(value) < 2n ** 256n) {
    return BigInt(value).toString(16).padStart(64, '0');
  }
  throw new Error('Check the action fields. Use whole numbers, full wallet addresses, and 32-byte hex values.');
}

function showFields() {
  const [, ...fields] = definitions[actions.value];
  byId('fields').replaceChildren(...fields.map(([label, type], index) => {
    const wrapper = document.createElement('div');
    const caption = document.createElement('label');
    const field = document.createElement(type === 'bool' ? 'select' : 'input');
    field.name = String(index);
    field.id = 'argument-' + index;
    field.required = true;
    field.autocomplete = 'off';
    field.spellcheck = false;
    if (type === 'uint') field.inputMode = 'numeric';
    if (type === 'bool') {
      field.add(new Option('Allow', 'true'));
      field.add(new Option('Revoke', 'false'));
    }
    caption.htmlFor = field.id;
    caption.textContent = label;
    wrapper.append(caption, field);
    return wrapper;
  }));
}

byId('connect').addEventListener('click', async () => {
  clearVerification('Connecting wallet…');
  try {
    await request('eth_requestAccounts');
    await checkWallet();
    status.textContent = 'House wallet connected. Enter the deployed Registry address.';
  } catch (error) {
    status.textContent = error.message;
  }
});
registry.addEventListener('input', () => clearVerification('Verify the entered Registry address.'));
for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) {
  window.ethereum?.on?.(event, () => clearVerification('Wallet changed. Verify the Registry again.'));
}

window.addEventListener('crucible-wallet-change', () => clearVerification('Verify the Registry with the connected House wallet.'));

async function verifyRoles(address) {
  const expected = '0x' + house.slice(2).toLowerCase().padStart(64, '0');
  const roles = await Promise.all(['HOUSE_WALLET', 'incubator', 'quorumVerifier'].map(role =>
    request('eth_call', [{to: address, data: selectors[role]}, 'latest'])
  ));
  if (roles.some(role => role.toLowerCase() !== expected)) {
    throw new Error('This address did not return the expected House-only Registry roles.');
  }
}

byId('verify').addEventListener('click', async () => {
  clearVerification('Verifying Registry…');
  const attempt = verificationAttempt;
  const address = registry.value.trim();
  try {
    if (!addressPattern.test(address)) throw new Error('Enter the deployed Registry address.');
    await checkWallet();
    await verifyRoles(address);
    if (attempt !== verificationAttempt) return;
    verifiedAddress = address;
    controls.disabled = false;
    status.textContent = 'House wallet and Registry roles verified on Base Mainnet.';
  } catch (error) {
    if (attempt === verificationAttempt) status.textContent = error.message;
  }
});

let submitting = false;
byId('action-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!verifiedAddress || submitting) return;
  const address = verifiedAddress;
  const action = actions.value;
  const [, ...fields] = definitions[action];
  const values = new FormData(event.target);
  const attempt = verificationAttempt;
  submitting = true;
  controls.disabled = true;
  txStatus.textContent = 'Checking transaction…';
  try {
    let args = fields.map(([, type], index) => encode(values.get(String(index)).trim(), type));
    if (action === 'attestGraduation') {
      const digest = await request('eth_call', [{to: address, data: selectors.graduationConfigurationHash + args.slice(1).join('')}, 'latest']);
      args = [args[0], encode(digest, 'bytes32')];
    }
    await checkWallet();
    await verifyRoles(address);
    const transaction = {from: house, to: address, data: selectors[action] + args.join('')};
    await request('eth_call', [transaction, 'latest']);
    if (attempt !== verificationAttempt) throw new Error('Wallet or Registry changed. Verify again.');
    txStatus.textContent = 'Review the transaction in your wallet.';
    const hash = await request('eth_sendTransaction', [transaction]);
    txStatus.textContent = 'Submitted. Check confirmation in your wallet. ' + hash;
  } catch (error) {
    txStatus.textContent = error.message;
  } finally {
    submitting = false;
    controls.disabled = !verifiedAddress;
  }
});
actions.addEventListener('change', showFields);
showFields();

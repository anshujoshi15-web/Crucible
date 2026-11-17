const storageKey = 'crucible-seed-drafts';
let drafts = [];
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) drafts = saved.filter(seed => seed && typeof seed.title === 'string');
} catch {}
let filter = 'All';
const board = document.querySelector('#cards');
const boardStatus = document.querySelector('#board-status');
const drop = document.querySelector('#drop');
const detail = document.querySelector('#detail');
const filters = [...document.querySelectorAll('[data-filter]')];

function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function showSeed(seed) {
  document.querySelector('#detail-title').textContent = seed.title;
  const content = document.querySelector('#detail-content');
  content.replaceChildren(element('p', seed.local ? 'Spark · Local draft' : seed.stage, 'tag'));
  for (const [label, value] of [['Problem', seed.problem], ['Proposed mechanism', seed.mechanism], ['Needed roles', seed.roles], ['Branches', seed.branches]]) {
    if (value) content.append(element('h3', label), element('p', value, 'muted'));
  }
  if (seed.local) {
    const publish = element('button', 'Open draft to submit', 'btn');
    publish.addEventListener('click', () => {
      const form = document.querySelector('#draft');
      for (const key of ['title', 'problem', 'mechanism', 'roles']) form.elements.namedItem(key).value = seed[key] || '';
      detail.close();
      drop.showModal();
    });
    content.append(publish);
  }
  detail.showModal();
}

function renderBoard() {
  filters.forEach(button => button.setAttribute('aria-pressed', button.dataset.filter === filter));
  const seeds = [...drafts, ...sharedCards()].filter(seed => filter === 'All' || seed.stage === filter);
  board.replaceChildren();
  if (!seeds.length) {
    board.append(element('p', filter === 'All'
      ? 'No Seeds in this browser yet. Drop a Seed to start, or open a collaborator invitation.'
      : 'No Seeds at this stage in this browser.', 'muted'));
  }
  for (const seed of seeds) {
    const card = element('article', '', 'card');
    const open = element('button', 'View Seed ↗', 'btn');
    open.setAttribute('aria-label', 'View ' + seed.title);
    open.addEventListener('click', () => seed.shared ? openWorkspace(seed.id) : showSeed(seed));
    card.append(element('span', seed.local ? 'Spark · Local draft' : seed.stage + (seed.shared ? ' · Shared' : ''), 'tag'), element('h3', seed.title), element('p', seed.problem), open);
    board.append(card);
  }
}

filters.forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  boardStatus.textContent = '';
  renderBoard();
}));
document.querySelectorAll('[data-drop]').forEach(button => button.addEventListener('click', () => drop.showModal()));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelector('#draft').addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const formStatus = document.querySelector('#form-status');
  const seed = {stage:'Spark',local:true};
  for (const [key,value] of data) seed[key] = value.trim();
  if (!seed.title || !seed.problem || !seed.mechanism) {
    formStatus.textContent = 'Enter a title, problem, and proposed mechanism.';
    return;
  }
  if (event.submitter?.value === 'publish') {
    await publishFromDraft(seed, formStatus, event.target);
    return;
  }
  const updated = [seed, ...drafts];
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    formStatus.textContent = 'Browser storage is unavailable. Your draft is still in the form.';
    return;
  }
  drafts = updated;
  filter = 'All';
  renderBoard();
  event.target.reset();
  formStatus.textContent = '';
  drop.close();
  boardStatus.textContent = 'Draft saved in this browser.';
  document.querySelector('#seeds').scrollIntoView();
});

const weights = document.querySelector('#weights');
const results = document.querySelector('#results');
function calculate() {
  const values = weights.value.split(',').map(value => value.trim());
  if (!values.every(value => /^\d+$/.test(value) && BigInt(value) > 0n)) {
    results.textContent = 'Enter one or more positive whole numbers, separated by commas.';
    return;
  }
  const integers = values.map(BigInt);
  const total = integers.reduce((sum, weight) => sum + weight, 0n);
  const shares = integers.map(weight => 5500n * weight / total);
  const remainder = 5500n - shares.reduce((sum, share) => sum + share, 0n);
  results.replaceChildren();
  shares.forEach((share, index) => {
    const row = element('div', 'Builder ' + (index + 1), 'row');
    row.append(element('strong', share.toString() + ' BPS'));
    results.append(row);
  });
  results.append(element('p', 'Originator total: ' + (1500n + remainder) + ' BPS (' + remainder + ' BPS from rounding).'));
}
weights.addEventListener('input', calculate);
calculate();

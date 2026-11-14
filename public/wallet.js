(() => {
  const button = document.querySelector('#connect-wallet');
  const status = document.querySelector('#wallet-status');
  const base = '0x2105';
  const provider = window.crucibleWallet.provider;
  let account;
  let chain;
  let updateId = 0;

  function render() {
    button.textContent = account
      ? (chain === base ? account.slice(0, 6) + '…' + account.slice(-4) : 'Switch to Base')
      : 'Connect wallet';
    status.textContent = account
      ? (chain === base ? 'Connected on Base Mainnet · ' + account : 'Wallet connected. Switch to Base Mainnet.')
      : '';
  }

  async function refresh() {
    const id = ++updateId;
    const [accounts, network] = await Promise.all([
      provider.request({method: 'eth_accounts'}),
      provider.request({method: 'eth_chainId'})
    ]);
    if (id !== updateId) return;
    account = accounts[0];
    chain = network;
    render();
  }

  button.addEventListener('click', async () => {
    if (!provider?.request) {
      status.textContent = 'Open Crucible in a browser with an Ethereum wallet extension.';
      return;
    }
    button.disabled = true;
    try {
      if (!account) {
        await provider.request({method: 'eth_requestAccounts'});
      } else if (chain !== base) {
        await provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: base}]});
      }
      await refresh();
    } catch (error) {
      status.textContent = error?.code === 4001
        ? 'Wallet request canceled.'
        : error?.code === 4902
          ? 'Add Base Mainnet in your wallet, then try again.'
          : 'Wallet connection failed. Check your wallet and try again.';
    } finally {
      button.disabled = false;
    }
  });

  if (provider?.request) {
    const sync = () => refresh().catch(() => {
      status.textContent = 'Could not read wallet status.';
    });
    provider.on?.('accountsChanged', sync);
    provider.on?.('chainChanged', sync);
    provider.on?.('disconnect', () => {
      updateId++;
      account = undefined;
      chain = undefined;
      render();
    });
    sync();
  }
})();

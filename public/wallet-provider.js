(() => {
  let managed = false;
  let provider;
  window.crucibleWallet = {
    get managed() { return managed; },
    get provider() {
      return managed ? provider : window.ethereum;
    }
  };

  const element = document.querySelector('[data-wallet-picker]');
  const fallback = document.getElementById(element.dataset.fallback);
  const status = document.getElementById('wallet-status');

  let walletHelp;
  fallback.addEventListener('click', event => {
    if (window.crucibleWallet.provider?.request) return;
    event.stopImmediatePropagation();

    if (!walletHelp) {
      walletHelp = document.createElement('dialog');
      walletHelp.className = 'wallet-help';
      walletHelp.setAttribute('aria-labelledby', 'wallet-help-title');
      walletHelp.innerHTML = `
        <h2 id="wallet-help-title">Connect a wallet</h2>
        <p>On your phone, open Crucible in the MetaMask app and tap Connect wallet again. On a computer, install MetaMask or use another Base-compatible wallet extension, then reload this page.</p>
        <div class="wallet-help-actions">
          <a data-metamask>Open in MetaMask</a>
          <a href="https://metamask.io/download/">Get MetaMask</a>
          <form method="dialog"><button type="submit">Close</button></form>
        </div>`;
      const path = fallback.id === 'connect' ? '/admin' : '/';
      // Pass only the public page address, since Seed links may carry access keys.
      const url = location.protocol === 'https:'
        ? location.host + path
        : 'crucible.thehouseofjoshi.com' + path;
      walletHelp.querySelector('[data-metamask]').href = 'https://link.metamask.io/dapp/' + url;
      document.body.append(walletHelp);
    }
    walletHelp.showModal();
  }, { capture: true });

  function setProvider(nextProvider) {
    provider = nextProvider;
    window.dispatchEvent(new Event('crucible-wallet-change'));
  }

  async function initialize() {
    const response = await fetch('/api/wallet-config');
    if (!response.ok) return;
    const { projectId } = await response.json();
    if (!projectId) return;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/wallet-kit/wallet.css';
    const styled = new Promise((resolve, reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
    });
    document.head.append(stylesheet);

    const [{ mountWalletPicker }] = await Promise.all([import('/wallet-kit/wallet.js'), styled]);
    mountWalletPicker({
      element,
      projectId,
      setProvider,
      onReady() {
        managed = true;
        fallback.hidden = true;
        element.hidden = false;
        if (status) status.hidden = true;
        window.dispatchEvent(new Event('crucible-wallet-change'));
      }
    });
  }

  initialize().catch(() => {
    // The injected wallet button stays available if configuration or assets fail to load.
  });
})();

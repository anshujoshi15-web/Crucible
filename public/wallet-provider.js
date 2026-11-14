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

import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectButton, darkTheme, getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { injectedWallet, rainbowWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, useAccount, WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';

const theme = darkTheme({ accentColor: '#d7fc76', accentColorForeground: '#141a09' });

function ProviderBridge({ setProvider }) {
  const { address, chainId, connector, status } = useAccount();

  useEffect(() => {
    let active = true;
    if (status !== 'connected' || !address || !connector) {
      setProvider(undefined);
      return;
    }

    Promise.resolve()
      .then(() => connector.getProvider({ chainId }))
      .then(provider => {
        if (active) setProvider(provider);
      })
      .catch(() => {
        if (active) setProvider(undefined);
      });

    return () => {
      active = false;
      setProvider(undefined);
    };
  }, [address, chainId, connector, status, setProvider]);

  return null;
}

export function mountWalletPicker({ element, projectId, setProvider, onReady }) {
  const config = getDefaultConfig({
    appName: 'Crucible',
    appDescription: 'The Crucible idea incubator',
    appUrl: window.location.origin,
    appIcon: new URL('/crucible-logo.png', window.location.origin).href,
    projectId,
    chains: [base],
    transports: { [base.id]: http() },
    wallets: [{ groupName: 'Wallets', wallets: [rainbowWallet, walletConnectWallet, injectedWallet] }]
  });
  const queryClient = new QueryClient();

  function Picker() {
    useEffect(onReady, []);
    return (
      <>
        <ProviderBridge setProvider={setProvider} />
        <ConnectButton chainStatus="none" accountStatus="address" showBalance={false} />
      </>
    );
  }

  createRoot(element).render(
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} modalSize="compact" initialChain={base}>
          <Picker />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

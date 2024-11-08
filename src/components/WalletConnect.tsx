import React, { useState, useEffect } from 'react';
import { PeraWalletConnect } from '@perawallet/connect';
import algosdk from 'algosdk';

const peraWallet = new PeraWalletConnect({
  shouldShowSignTxnToast: true
});

const ALGOD_MAINNET = 'https://mainnet-api.algonode.cloud';
const ALGOD_TESTNET = 'https://testnet-api.algonode.cloud';
const RECEIVER_ADDRESS = 'Y4532MAF7R46EHON24GMDKPZAD4RK7B3QYQ22KXAVZMPXYL7YF475E2CIU';

const getAlgodClient = (network: 'MainNet' | 'TestNet') => {
  const server = network === 'MainNet' ? ALGOD_MAINNET : ALGOD_TESTNET;
  return new algosdk.Algodv2('', server, '');
};

const createPaymentTxn = async (
  from: string,
  network: 'MainNet' | 'TestNet'
): Promise<algosdk.Transaction> => {
  const client = getAlgodClient(network);
  const suggestedParams = await client.getTransactionParams().do();
  
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from,
    to: RECEIVER_ADDRESS,
    amount: 1_000_000, 
    suggestedParams,
  });
};


interface VerifiedAssetsResponse {
  results?: VerifiedAsset[];
  [key: string]: any;
}

interface VerifiedAsset {
  verification_tier: 'trusted' | 'verified' | 'unverified' | 'suspicious';
  asset_id?: number;
  name?: string;
  unitName?: string;
  logo?: string;
}

interface OptInStatus {
  [assetId: number]: 'pending' | 'success' | 'failed';
}


const fetchVerifiedAssets = async (): Promise<VerifiedAsset[]> => {
  try {
    const response = await fetch('https://mainnet.api.perawallet.app/v1/public/verified-assets/', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: VerifiedAssetsResponse = await response.json();
    console.log('API Response:', data); // Debug log
    

    if (!data.results || !Array.isArray(data.results)) {
      console.error('Invalid API response format:', data);
      return [];
    }


    return data.results.filter(asset => 
      asset && asset.verification_tier && (
        asset.verification_tier === 'trusted' || 
        asset.verification_tier === 'verified'
      )
    );

  } catch (error) {
    console.error('Error fetching verified assets:', error);
    return [];
  }
};


interface SwapParams {
  assetIdA: number;
  assetIdB: number;
  amountA: number;
  amountB: number;
  senderAddress: string;
  receiverAddress: string;
}

interface SwapState {
  status: 'idle' | 'creating' | 'awaiting_signature' | 'pending' | 'completed' | 'failed';
  error?: string;
}

const createAtomicSwapTxn = async (
  params: SwapParams,
  network: 'MainNet' | 'TestNet'
): Promise<algosdk.Transaction[]> => {
  const client = getAlgodClient(network);
  const suggestedParams = await client.getTransactionParams().do();

  const txn1 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: params.senderAddress,
    to: params.receiverAddress,
    amount: params.amountA,
    assetIndex: params.assetIdA,
    suggestedParams,
  });

  const txn2 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: params.receiverAddress,
    to: params.senderAddress,
    amount: params.amountB,
    assetIndex: params.assetIdB,
    suggestedParams,
  });

  algosdk.assignGroupID([txn1, txn2]);

  return [txn1, txn2];
};

const WalletConnect: React.FC = () => {
  const [accountAddress, setAccountAddress] = useState<string>('');
  const [network, setNetwork] = useState<'MainNet' | 'TestNet'>('TestNet');
  const [accounts, setAccounts] = useState<string[]>([]);
  const [showAccountSelect, setShowAccountSelect] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [txnStatus, setTxnStatus] = useState<'idle' | 'pending' | 'confirmed' | 'failed'>('idle');
  const [txnError, setTxnError] = useState<string>('');
  const [verifiedAssets, setVerifiedAssets] = useState<VerifiedAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string>('');
  const [optInStatus, setOptInStatus] = useState<OptInStatus>({});
  const [optInError, setOptInError] = useState<string>('');
  const [swapState, setSwapState] = useState<SwapState>({ status: 'idle' });
  const [swapParams, setSwapParams] = useState<Partial<SwapParams>>({});

  useEffect(() => {
    // Reconnect to session when the component is mounted
    peraWallet.reconnectSession().then((accounts) => {
      if (accounts.length) {
        setAccounts(accounts);
        setAccountAddress(accounts[0]);
      }
    });

    // Handle disconnect event
    peraWallet.connector?.on('disconnect', handleDisconnect);

    return () => {
      peraWallet.connector?.off('disconnect');
    };
  }, []);

  useEffect(() => {
    const loadAssets = async () => {
      if (accountAddress) {
        try {
          setAssetsLoading(true);
          setAssetsError('');
          const assets = await fetchVerifiedAssets();
          
          if (assets.length === 0) {
            setAssetsError('No verified assets found');
          } else {
            setVerifiedAssets(assets);
          }
        } catch (error) {
          setAssetsError('Failed to load verified assets');
        } finally {
          setAssetsLoading(false);
        }
      }
    };

    loadAssets();
  }, [accountAddress]);

  const handleDisconnect = () => {
    setAccountAddress('');
    setAccounts([]);
    setShowAccountSelect(false);
  };

  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      const walletAccounts = await peraWallet.connect();
      setAccounts(walletAccounts);
      
      if (walletAccounts.length > 1) {
        setShowAccountSelect(true);
      } else if (walletAccounts.length === 1) {
        setAccountAddress(walletAccounts[0]);
      }
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAccountSelect = (account: string) => {
    setAccountAddress(account);
    setShowAccountSelect(false);
  };

  const handleNetworkChange = (newNetwork: 'MainNet' | 'TestNet') => {
    setNetwork(newNetwork);
    peraWallet.disconnect();
    handleDisconnect();
  };

  const disconnectWallet = () => {
    peraWallet.disconnect();
    handleDisconnect();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const switchAccount = () => {
    setShowAccountSelect(true);
  };

  const handleDonation = async () => {
    if (!accountAddress) return;
    
    try {
      setTxnStatus('pending');
      setTxnError('');
  
      const txn = await createPaymentTxn(accountAddress, network);
      const singleTxnGroups = [{ txn, signers: [accountAddress] }];
      
      const signedTxn = await peraWallet.signTransaction([singleTxnGroups]);
      const client = getAlgodClient(network);
      
      const { txId } = await client.sendRawTransaction(signedTxn).do();
      
      await algosdk.waitForConfirmation(client, txId, 4);
      
      setTxnStatus('confirmed');
      setTimeout(() => setTxnStatus('idle'), 3000);
    } catch (error) {
      console.error('Transaction failed:', error);
      setTxnStatus('failed');
      setTxnError(error instanceof Error ? error.message : 'Transaction failed');
    }
  };

  const createOptInTxn = async (
    from: string,
    assetId: number,
    network: 'MainNet' | 'TestNet'
  ): Promise<algosdk.Transaction> => {
    const client = getAlgodClient(network);
    const suggestedParams = await client.getTransactionParams().do();
    
    return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from,
      to: from,
      assetIndex: assetId,
      amount: 0,
      suggestedParams,
    });
  };

  const handleOptIn = async (assetId: number) => {
    if (!accountAddress || !assetId) return;
    
    try {
      setOptInStatus(prev => ({ ...prev, [assetId]: 'pending' }));
      setOptInError('');
  
      const txn = await createOptInTxn(accountAddress, assetId, network);
      const singleTxnGroups = [{ txn, signers: [accountAddress] }];
      
      const signedTxn = await peraWallet.signTransaction([singleTxnGroups]);
      const client = getAlgodClient(network);
      
      const { txId } = await client.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(client, txId, 4);
      
      setOptInStatus(prev => ({ ...prev, [assetId]: 'success' }));
      
      // Clear success status after 3 seconds
      setTimeout(() => {
        setOptInStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[assetId];
          return newStatus;
        });
      }, 3000);
  
    } catch (error) {
      console.error('Opt-in failed:', error);
      setOptInStatus(prev => ({ ...prev, [assetId]: 'failed' }));
      setOptInError(error instanceof Error ? error.message : 'Opt-in failed');
    }
  };

  const handleSwap = async () => {
    if (!accountAddress || !swapParams.assetIdA || !swapParams.assetIdB) return;

    try {
      setSwapState({ status: 'creating' });

      const params: SwapParams = {
        senderAddress: accountAddress,
        receiverAddress: swapParams.receiverAddress!,
        assetIdA: swapParams.assetIdA,
        assetIdB: swapParams.assetIdB,
        amountA: swapParams.amountA!,
        amountB: swapParams.amountB!,
      };

      const txns = await createAtomicSwapTxn(params, network);
      
      setSwapState({ status: 'awaiting_signature' });
      
      const txnGroups = txns.map(txn => ({
        txn,
        signers: [accountAddress],
      }));

      const signedTxns = await peraWallet.signTransaction([txnGroups]);
      
      setSwapState({ status: 'pending' });
      
      const client = getAlgodClient(network);
      const { txId } = await client.sendRawTransaction(signedTxns).do();
      
      await algosdk.waitForConfirmation(client, txId, 4);
      
      setSwapState({ status: 'completed' });

    } catch (error) {
      console.error('Swap failed:', error);
      setSwapState({ 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Swap failed' 
      });
    }
  };

  // AtomicSwap component with access to parent state
  const AtomicSwap: React.FC = () => {
    const [swapState, setSwapState] = useState<SwapState>({ status: 'idle' });
    const [swapParams, setSwapParams] = useState<Partial<SwapParams>>({});

    const handleSwap = async () => {
      if (!accountAddress || !swapParams.assetIdA || !swapParams.assetIdB) return;

      try {
        setSwapState({ status: 'creating' });

        const params: SwapParams = {
          senderAddress: accountAddress,
          receiverAddress: swapParams.receiverAddress!,
          assetIdA: swapParams.assetIdA,
          assetIdB: swapParams.assetIdB,
          amountA: swapParams.amountA!,
          amountB: swapParams.amountB!,
        };

        const txns = await createAtomicSwapTxn(params, network);
        
        setSwapState({ status: 'awaiting_signature' });
        
        const txnGroups = txns.map(txn => ({
          txn,
          signers: [accountAddress],
        }));

        const signedTxns = await peraWallet.signTransaction([txnGroups]);
        
        setSwapState({ status: 'pending' });
        
        const client = getAlgodClient(network);
        const { txId } = await client.sendRawTransaction(signedTxns).do();
        
        await algosdk.waitForConfirmation(client, txId, 4);
        
        setSwapState({ status: 'completed' });

      } catch (error) {
        console.error('Swap failed:', error);
        setSwapState({ 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Swap failed' 
        });
      }
    };

    return (
      <div className="atomic-swap">
        <h3>Atomic Swap</h3>
        {accountAddress ? (
          <div className="swap-form">
            <input
              type="number"
              placeholder="Asset ID A"
              onChange={e => setSwapParams(prev => ({ 
                ...prev, 
                assetIdA: parseInt(e.target.value) 
              }))}
            />
            <input
              type="number"
              placeholder="Amount A"
              onChange={e => setSwapParams(prev => ({ 
                ...prev, 
                amountA: parseInt(e.target.value) 
              }))}
            />
            <input
              type="number"
              placeholder="Asset ID B"
              onChange={e => setSwapParams(prev => ({ 
                ...prev, 
                assetIdB: parseInt(e.target.value) 
              }))}
            />
            <input
              type="number"
              placeholder="Amount B"
              onChange={e => setSwapParams(prev => ({ 
                ...prev, 
                amountB: parseInt(e.target.value) 
              }))}
            />
            <input
              type="text"
              placeholder="Receiver Address"
              onChange={e => setSwapParams(prev => ({ 
                ...prev, 
                receiverAddress: e.target.value 
              }))}
            />
            <button 
              onClick={handleSwap}
              disabled={swapState.status !== 'idle'}
            >
              {swapState.status === 'idle' ? 'Swap' : 
               swapState.status === 'creating' ? 'Creating Swap...' :
               swapState.status === 'awaiting_signature' ? 'Sign Transaction' :
               swapState.status === 'pending' ? 'Processing...' :
               swapState.status === 'completed' ? 'Completed!' : 'Failed'}
            </button>
            {swapState.error && (
              <div className="error">{swapState.error}</div>
            )}
          </div>
        ) : (
          <p>Please connect your wallet first</p>
        )}
      </div>
    );
  };

  return (
    <div className="wallet-connect">
      <div className="network-selector">
        <button 
          onClick={() => handleNetworkChange('MainNet')}
          className={network === 'MainNet' ? 'active' : ''}
          disabled={isConnecting}
        >
          MainNet
        </button>
        <button 
          onClick={() => handleNetworkChange('TestNet')}
          className={network === 'TestNet' ? 'active' : ''}
          disabled={isConnecting}
        >
          TestNet
        </button>
      </div>

      {!accountAddress ? (
        <button 
          onClick={connectWallet} 
          className="connect-button"
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Connect with Pera Wallet'}
        </button>
      ) : (
        <div className="account-info">
          <p>Connected Address: {formatAddress(accountAddress)}</p>
          {accounts.length > 1 && (
            <button onClick={switchAccount} className="switch-account">
              Switch Account
            </button>
          )}
          <button onClick={disconnectWallet}>Disconnect</button>
        </div>
      )}

      {accountAddress && (
        <div className="transaction-section">
          <button 
            onClick={handleDonation}
            disabled={txnStatus === 'pending' || !accountAddress}
            className="donate-button"
          >
            {txnStatus === 'pending' ? 'Processing...' : 'Donate 1 ALGO'}
          </button>
          
          {txnStatus === 'confirmed' && (
            <div className="status-message success">
              Transaction confirmed!
            </div>
          )}
          
          {txnStatus === 'failed' && (
            <div className="status-message error">
              {txnError || 'Transaction failed'}
            </div>
          )}
        </div>
      )}

      {accountAddress && (
        <div className="assets-section">
          <h3>Verified Assets</h3>
          {assetsLoading ? (
            <div className="loading">Loading assets...</div>
          ) : assetsError ? (
            <div className="error">{assetsError}</div>
          ) : (
            <>
              <AssetList 
                assets={verifiedAssets} 
                onOptIn={handleOptIn}
                optInStatus={optInStatus}
              />
              {optInError && (
                <div className="error opt-in-error">{optInError}</div>
              )}
            </>
          )}
        </div>
      )}

      {showAccountSelect && (
        <div className="account-select">
          <h3>Select an Account</h3>
          {accounts.map((account) => (
            <button 
              key={account}
              onClick={() => handleAccountSelect(account)}
              className={`account-button ${account === accountAddress ? 'active' : ''}`}
            >
              {formatAddress(account)}
            </button>
          ))}
        </div>
      )}

      {accountAddress && (
        <AtomicSwap />
      )}
    </div>
  );
};

// Update AssetList component
const AssetList: React.FC<{ 
  assets: VerifiedAsset[];
  onOptIn: (assetId: number) => void;
  optInStatus: OptInStatus;
}> = ({ assets, onOptIn, optInStatus }) => (
  <div className="assets-grid">
    {assets.map((asset) => (
      <div key={asset.asset_id || Math.random()} className="asset-card">
        <div className="asset-logo-placeholder">
          {asset.unitName?.[0] || 'A'}
        </div>
        <div className="asset-info">
          <h4>{asset.asset_id ? `Asset ${asset.asset_id}` : 'Unknown Asset'}</h4>
          <p>{asset.verification_tier}</p>
          {asset.asset_id && (
            <button
              onClick={() => onOptIn(asset.asset_id!)}
              disabled={optInStatus[asset.asset_id] === 'pending'}
              className={`opt-in-button ${optInStatus[asset.asset_id] || ''}`}
            >
              {optInStatus[asset.asset_id] === 'pending' ? 'Processing...' : 
               optInStatus[asset.asset_id] === 'success' ? 'Opted In!' : 
               'Opt In'}
            </button>
          )}
        </div>
      </div>
    ))}
  </div>
);

export default WalletConnect;
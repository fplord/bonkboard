import {
  createContext,
  Dispatch,
  PropsWithChildren,
  SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";
import ReactShadow from "react-shadow/emotion";
import { ClusterType } from "@soceanfi/stake-pool-sdk";
import {
  WalletAdapterNetwork,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  BackpackWalletAdapter,
  Coin98WalletAdapter,
  GlowWalletAdapter,
  PhantomWalletAdapter,
  SlopeWalletAdapter,
  SolflareWalletAdapter,
  SolletExtensionWalletAdapter,
  SolletWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

import { TX_CONFIRM_TIMEOUT_MS } from "@/utils/err";

type SolanaContextType = {
  cluster: SolanaCluster;
  setCluster: Dispatch<SetStateAction<SolanaCluster>>;
};

type SolanaCluster = {
  label: string;
  network: ClusterType | "localnet"; // TODO: remove localnet when stake pool sdk supports it
  endpoint: string;
  isDisabled?: boolean;
};

export const MAINNET_NETWORK = "mainnet-beta";

export const CLUSTERS: SolanaCluster[] = [
  {
    label: "Mainnet (Extrnode)",
    network: MAINNET_NETWORK,
    endpoint: "https://solana-mainnet.rpc.extrnode.com",
  },
  {
    label: "Mainnet (Syndica)",
    network: MAINNET_NETWORK,
    endpoint:
      "https://solana-api.syndica.io/access-token/J379i04dAndxEW0Oz3FGLRK4slZdxP4ElTNuDqzVtSihiJRvPffBSGnkQ3baUY0b/rpc",
  },
  {
    label: "Mainnet (Ankr)",
    network: MAINNET_NETWORK,
    endpoint: "https://rpc.ankr.com/solana",
  },
  {
    label: "Mainnet (Solana)",
    network: MAINNET_NETWORK,
    endpoint: clusterApiUrl("mainnet-beta"),
  },
  {
    label: "Devnet",
    network: "devnet",
    endpoint: clusterApiUrl("devnet"),
  },
  {
    label: "Testnet",
    network: "testnet",
    endpoint: clusterApiUrl("testnet"),
  },
  {
    label: "Localnet",
    network: "localnet",
    endpoint: "http://localhost:8899",
  },
];

const SolanaContext = createContext<SolanaContextType>({} as SolanaContextType);

export function SolanaProvider({ children }: PropsWithChildren<{}>) {
  const [cluster, setCluster] = useState<SolanaCluster>(CLUSTERS[0]);

  const endpoint = useMemo(() => cluster.endpoint, [cluster.endpoint]);

  const wallets = useMemo(
    () =>
      [
        // mobile wallet adapter is included by default
        new PhantomWalletAdapter(),
        new SlopeWalletAdapter(),
        new SolflareWalletAdapter({
          network: cluster.network as WalletAdapterNetwork,
        }),
        new SolletWalletAdapter({
          network: cluster.network as WalletAdapterNetwork,
        }),
        new SolletExtensionWalletAdapter({
          network: cluster.network as WalletAdapterNetwork,
        }),
        new Coin98WalletAdapter(),
        new BackpackWalletAdapter(),
        new GlowWalletAdapter(),
      ].filter((w) => w.readyState !== WalletReadyState.Unsupported),
    [cluster.network]
  );

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{
        confirmTransactionInitialTimeout: TX_CONFIRM_TIMEOUT_MS,
      }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SolanaContext.Provider
            value={useMemo(() => ({ cluster, setCluster }), [cluster])}
          >
            {/* <WalletConnector /> */}
            {children}
          </SolanaContext.Provider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function useSolana() {
  const solanaContext = useContext(SolanaContext);

  if (!solanaContext)
    throw new Error("Make sure to wrap your app in a SolanaProvider");

  return solanaContext;
}

/**
 * Call wallet.connect() once a wallet is selected in the <WalletModal>
 * Workaround to get mobile wallet adapter
 * and phantom to work without `autoConnect={true}` on `<WalletProvider>`
 *
 * Note: MWA is still wonky af, you cant disconnect from FakeWallet and when you decline
 * it tries again
 */
// function WalletConnector() {
//   const { wallet, connect, connected, connecting, disconnecting } = useWallet();
//   useEffect(() => {
//     if (wallet && !connected && !connecting && !disconnecting) {
//       connect();
//     }
//   }, [wallet, connect, connected, connecting, disconnecting]);
//   return null;
// }

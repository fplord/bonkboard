import { Button } from "@chakra-ui/react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { MAX_PIXELS } from "src/config/constants";

import { useBoardProgramContext } from "@/contexts/BoardProgramContext";
import { useSnackbarContext } from "@/contexts/SnackbarContext";
import { useSolana } from "@/contexts/SolanaContext";
import { useBoardPixels } from "@/hooks/useBoardPixels";
import {
  BOARD_ACCOUNT,
  BOARD_DATA_ACCOUNT,
  MINT_TOKEN_ACCOUNT,
} from "@/hooks/useBoardProgram";
import { txToSimulationLink, txToSolanaFMLink } from "@/utils/links";
import { findFeeAccount } from "@/utils/token";
import { signSendConfirm } from "@/utils/transaction";

type ActionData = [number, number, Uint8ClampedArray];

type SubmitButtonProps = {
  actions: [ActionData, ActionData][];
  isPending: boolean;
  setIsPending: (isPending: boolean) => void;
  resetDrawnPixels: () => void;
};

export function SubmitButton({
  actions,
  isPending,
  setIsPending,
  resetDrawnPixels,
}: SubmitButtonProps) {
  const { boardProgram } = useBoardProgramContext();
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const {
    cluster: { network },
  } = useSolana();

  const { enqueueSnackbar } = useSnackbarContext();

  const { mutate } = useBoardPixels();

  const handleSubmit = async () => {
    if (!wallet?.publicKey || actions.length === 0 || isPending) return;

    setIsPending(true);

    let closeCurrentSnackbar: () => void | undefined;
    let lastTx: Transaction | undefined;

    try {
      const tmp: Record<string, any> = {};
      actions.forEach(([, action]) => {
        const [r, g, b] = action[2];

        // @ts-ignore
        tmp[[action[0], action[1]]] = [r, g, b];
      });

      const toSend: { x: BN; y: BN; r: number; g: number; b: number }[] = [];
      Object.entries(tmp).forEach(([key, value]) => {
        const [x, y] = key.split(",").map((num) => new BN(num));
        const [r, g, b] = value;
        toSend.push({ x, y, r, g, b });
      });

      const feeAccount = findFeeAccount(
        boardProgram.programId,
        new PublicKey(BOARD_ACCOUNT[network])
      )[0];

      const payerTokenAccount = await getAssociatedTokenAddress(
        MINT_TOKEN_ACCOUNT[network],
        wallet.publicKey
      );

      const { feeDestination } = await boardProgram.account.fee.fetch(
        feeAccount
      );

      const ixs: TransactionInstruction[] = [];

      for (const { x, y, r, g, b } of toSend) {
        // eslint-disable-next-line no-await-in-loop
        const ix = await boardProgram.methods
          .draw({ x, y }, { r, g, b })
          .accounts({
            boardAccount: BOARD_ACCOUNT[network],
            boardDataAccount: BOARD_DATA_ACCOUNT[network],
            payer: wallet.publicKey,
            payerTokenAccount,
            feeAccount,
            feeDestination,
          })
          .instruction();

        ixs.push(ix);
      }

      const batches = ixs.length / MAX_PIXELS;

      const txs: Transaction[] = [];

      for (let i = 0; i < batches; i++) {
        const batchIxs = ixs.slice(i * MAX_PIXELS, (i + 1) * MAX_PIXELS);
        txs.push(new Transaction().add(...batchIxs));
      }

      const { close: closeProgressSnackbar } = enqueueSnackbar({
        title: "Bonk in progress",
        description: `Bonking ${toSend.length} pixels...`,
        variant: "standard",
        options: {
          duration: null,
        },
      });
      closeCurrentSnackbar = closeProgressSnackbar;

      const sigs = await signSendConfirm(
        wallet,
        txs.map((tx) => ({ tx, signers: [] })),
        connection
      );

      const lastSig = sigs[sigs.length + 1];

      await mutate();

      resetDrawnPixels();

      closeCurrentSnackbar();

      enqueueSnackbar({
        title: "Success",
        description: "Successfully bonked a pixel!",
        variant: "success",
        links: [
          {
            label: "View on explorer",
            href: txToSolanaFMLink(lastSig, network),
          },
        ],
      });
    } catch (err) {
      const links = [
        ...(lastTx
          ? [
              {
                label: "View on explorer",
                href: txToSimulationLink(lastTx, network),
              },
            ]
          : []),
      ];

      enqueueSnackbar({
        title: "Error",
        description: (err as Error).message,
        variant: "critical",
        links,
        options: {
          duration: null,
        },
      });
    } finally {
      // @ts-ignore
      if (closeCurrentSnackbar) {
        closeCurrentSnackbar();
      }
      setIsPending(false);
    }
  };

  return (
    <Button size="lg" onClick={handleSubmit} isLoading={isPending}>
      Submit!
    </Button>
  );
}

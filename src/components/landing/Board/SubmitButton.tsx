import { Button } from "@chakra-ui/react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";

import { useBoardProgramContext } from "@/contexts/BoardProgramContext";
import { useSnackbarContext } from "@/contexts/SnackbarContext";
import { useSolana } from "@/contexts/SolanaContext";
import { useBoardPixels } from "@/hooks/useBoardPixels";
import {
  BOARD_ACCOUNT,
  BOARD_DATA_ACCOUNT,
  MINT_TOKEN_ACCOUNT,
} from "@/hooks/useBoardProgram";
import { MAX_PIXELS } from "@/utils/consts";
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
    let tx: Transaction | undefined;

    try {
      const tmp: Record<string, any> = {};

      actions.forEach((action) => {
        Object.entries(action).forEach(([, value]) => {
          // @ts-ignore
          const [r, g, b] = value[2];
          // @ts-ignore
          tmp[[value[0], value[1]]] = [r, g, b];
        });
      });

      console.log(tmp);

      const toSend: {
        coord: { x: number; y: number };
        color: { r: number; g: number; b: number };
      }[] = [];
      Object.entries(tmp).forEach(([key, value]) => {
        const [x, y] = key.split(",").map((num) => Number(num));
        const [r, g, b] = value;
        toSend.push({ coord: { x, y }, color: { r, g, b } });
      });

      if (Object.keys(toSend).length > MAX_PIXELS) {
        enqueueSnackbar({
          title: "Error",
          description:
            "Too many pixels. Please reduce the number of pixels before submitting.",
          variant: "critical",
          options: {
            duration: null,
          },
        });
      } else {
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

        console.log(toSend);

        tx = await boardProgram.methods
          .draw(toSend)
          .accounts({
            boardAccount: BOARD_ACCOUNT[network],
            boardDataAccount: BOARD_DATA_ACCOUNT[network],
            payer: wallet.publicKey,
            payerTokenAccount,
            feeAccount,
            feeDestination,
          })
          .transaction();

        const { close: closeProgressSnackbar } = enqueueSnackbar({
          title: "Bonk in progress",
          description: `Bonking ${toSend.length} pixels...`,
          variant: "standard",
          options: {
            duration: null,
          },
        });
        closeCurrentSnackbar = closeProgressSnackbar;

        console.log(tx);

        const [sig] = await signSendConfirm(
          wallet,
          [{ tx, signers: [] }],
          connection
        );

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
              href: txToSolanaFMLink(sig, network),
            },
          ],
        });
      }
    } catch (err) {
      const links = [
        ...(tx
          ? [
              {
                label: "View on explorer",
                href: txToSimulationLink(tx, network),
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
      console.error(err);
    } finally {
      // @ts-ignore
      if (closeCurrentSnackbar) {
        closeCurrentSnackbar();
      }
      setIsPending(false);
    }
  };

  return (
    <Button display="flex" my={2} onClick={handleSubmit} isLoading={isPending}>
      Submit!
    </Button>
  );
}

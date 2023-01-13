import { NextPage } from "next";
import type { AppProps } from "next/app";
import Head from "next/head";
import { ChakraProvider } from "@chakra-ui/react";

import { ChatProviders } from "@strata-foundation/chat-ui";
import ReactShadow from "react-shadow/emotion";

import { SnackbarProvider } from "@/contexts/SnackbarContext";
import theme from "@/theme/index";

require("@solana/wallet-adapter-react-ui/styles.css");

type NextPageWithLayout = NextPage & {
  getLayout?: (page: React.ReactNode) => React.ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function MyApp({ Component, pageProps }: AppPropsWithLayout) {
  // Persistent Layout as per https://adamwathan.me/2019/10/17/persistent-layout-patterns-in-nextjs/
  const getLayout = Component.getLayout || ((page) => page);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <ChakraProvider theme={theme}>
        <ReactShadow.div>
          {/*@ts-ignore*/}
          <ChatProviders resetCss onError={err => console.error(err)}>
            <SnackbarProvider>
              {getLayout(<Component {...pageProps} />)}
            </SnackbarProvider>
          </ChatProviders>
        </ReactShadow.div>
      </ChakraProvider>
    </>
  );
}

export default MyApp;

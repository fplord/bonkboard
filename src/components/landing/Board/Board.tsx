import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import Image from "next/image";
import { RgbStringColorPicker } from "react-colorful";
import { useKey } from "react-use";
import {
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Input,
  InputGroup,
  InputLeftAddon,
  keyframes,
  Text,
} from "@chakra-ui/react";

import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js"
import * as anchor from "@project-serum/anchor";
import { BN } from "bn.js";
import { ChatSdk } from "@strata-foundation/chat";
import { NATIVE_MINT } from "@solana/spl-token";
import { useMessages, Chatroom, SendMessageProvider } from "@strata-foundation/chat-ui";

import { HowToDraw } from "@/components/landing/Board/HowToDraw";
import { RgbInput } from "@/components/landing/Board/RgbInput";
import { SubmitButton } from "@/components/landing/Board/SubmitButton";
import { useSnackbarContext } from "@/contexts/SnackbarContext";
import { useBoardPixels } from "@/hooks/useBoardPixels";
import { usePreventKeyboardScrolling } from "@/hooks/usePreventKeyboardScrolling";
import { getColorStr, getRgb, hexToRgb, rgbToHex } from "@/utils/color";
import { MAX_PIXELS } from "@/utils/consts";

const spinner = keyframes`
  0% {
    -webkit-filter: hue-rotate(0deg);
  }

  50% {
    box-shadow: 35px 35px 0 0,
                -35px -35px 0 0,
                35px -35px 0 0,
                -35px 35px 0 0,
                0 15px 0 0,
                15px 0 0 0,
                -15px 0 0 0,
                0 -15px 0 0;
  }

  75% {
    box-shadow: 35px 35px 0 0,
                -35px -35px 0 0,
                35px -35px 0 0,
                -35px 35px 0 0,
                0 15px 0 0,
                15px 0 0 0,
                -15px 0 0 0,
                0 -15px 0 0;
  }

  100% {
    transform: rotate(360deg);
    -webkit-filter: hue-rotate(360deg);
  }
`;

const CANVAS_SIZE = {
  width: 500,
  height: 500,
};

const ZOOM_CANVAS_SIZE = {
  width: 400,
  height: 400,
};

const ZOOM_SENSITIVITY = 100; // bigger for lower zoom per scroll
const ZOOM_MULTIPLIER = 1.1;

// Count all the non-zero values of keys in o
// Used to count the number of unique changed pixels
function pixelsChanged(o: { [k: string]: number }) {
  return Object.keys(o).reduce((acc, key) => acc + Number(o[key] > 0), 0);
}

function uint8torgb(u: Uint8ClampedArray) {
  return getColorStr(u[0], u[1], u[2]);
}

const numFormat = new Intl.NumberFormat("en-us");

type ActionMode = "normal" | "eyedropper" | "draw" | "translate";

const LEFT_MOUSE_BUTTON = 0;
const MOUSEWHEEL_BUTTON = 1;

const DEFAULT_SCALE = 5;

export function Board() {
  const [isPending, setIsPending] = useState(false);
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [zoomContext, setZoomContext] =
    useState<CanvasRenderingContext2D | null>(null);
  const [hexColor, setHexColor] = useState<string>("000000");
  const [color, setColor] = useState<string>(getColorStr(0, 0, 0));
  const [scale, setScale] = useState<number>(DEFAULT_SCALE);
  const [translateX, setTranslateX] = useState<number>(0);
  const [translateY, setTranslateY] = useState<number>(0);
  const [actions, setActions] = useState<any[]>([]);
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const [actionMode, setActionMode] = useState<ActionMode>("normal");
  const [pixelsTouched, setPixelsTouched] = useState<{ [key: string]: number }>(
    {}
  );
  const [chatObject, setChatObject] = useState<any>(null);
  const [drawBuffer, setdrawBuffer] = useState<{ [key: string]: [] }>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);

  const {
    messages,
    loadingInitial,
    loadingMore,
    hasMore,
    fetchMore,
    fetchNew,
  } = useMessages({
    chat: chatObject,
    numTransactions: 50,
  });

  console.log("loading messages....", messages);

  const handleRgbChange = (rgb: string) => {
    const hex = rgbToHex(rgb);
    setColor(rgb);
    setHexColor(hex);
  };

  function handleHexChange(hex: string) {
    const { r, g, b } = hexToRgb(hex);
    setHexColor(hex);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      setColor(getColorStr(r, g, b));
    }
  }

  const { pixels, error, mutate } = useBoardPixels();

  const { enqueueSnackbar } = useSnackbarContext();

  const pixelsChangedNumber = pixelsChanged(pixelsTouched);

  const totalCost = useMemo(
    () => numFormat.format(pixelsChangedNumber * 10000),
    [pixelsChangedNumber]
  );

  // Disable page scrolling with arrow keys and space
  usePreventKeyboardScrolling();

  useEffect(() => {
    if (publicKey && wallet && connection) {
      const provider = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
      });
      // @ts-ignore
      async function doChatThings() {
        const chatSdk = await ChatSdk.init(provider);
        var { chat } =
          await chatSdk.initializeChat({
            name: "Bonk Board Chat",
            permissions: {
              readPermissionKey: NATIVE_MINT,
              postPermissionKey: NATIVE_MINT,
              postPermissionAmount: 0.00,
            },
          });
        console.log('chat', chat);
        setChatObject(chat);
      }
      doChatThings();
    }
  }, [publicKey, wallet, connection]);

  useEffect(() => {
    if (error) {
      enqueueSnackbar({
        title: "Error loading pixels",
        description: error.message,
        variant: "critical",
      });
    }
  }, [enqueueSnackbar, error]);

  // Set context just once, on load
  useEffect(() => {
    const canvasContext = canvasRef.current?.getContext("2d");
    if (canvasContext) {
      setContext(canvasContext);
      canvasContext.imageSmoothingEnabled = false;
    }

    const zoomCanvasContext = zoomCanvasRef.current?.getContext("2d");

    if (zoomCanvasContext) {
      setZoomContext(zoomCanvasContext);
    }
  }, []);

  // Redraw the board every time it changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && pixels) {
      if (context) {
        // draw something on canvas on load
        // TODO get attr from Box, no magic numbers
        const imageData = context.createImageData(
          CANVAS_SIZE.width,
          CANVAS_SIZE.height
        );

        const { data } = imageData;
        for (let i = 0; i < data.length; i += 4) {
          const j = (3 * i) / 4;
          data[i] = pixels[j]; // red
          data[i + 1] = pixels[j + 1]; // green
          data[i + 2] = pixels[j + 2]; // blue
          data[i + 3] = 255; // alpha channel
        }

        context.putImageData(imageData, 0, 0);

        console.log(`Actions array length: ${actions.length}`);
        actions.forEach((action) => {
          Object.keys(action).forEach((key) => {
            const pixel = action[key];
            context.fillStyle = getColorStr(
              pixel[2][0],
              pixel[2][1],
              pixel[2][2]
            );
            context.fillRect(pixel[0], pixel[1], 1, 1);
          });
        });
      }
    }
  }, [actions, pixels, context]);

  // Updates the drawbuffer when the mouse moves if the current actionMode is draw
  useEffect(() => {
    if (actionMode === "draw") {
      if (context) {
        const [r, g, b] = getRgb(color);
        // @ts-ignore
        const newPixel: [number, number, Uint8ClampedArray] = [
          mouseX,
          mouseY,
          new Uint8ClampedArray([Number(r), Number(g), Number(b), 255]),
        ];

        setdrawBuffer((prev) => {
          // @ts-ignore
          const tmp = { ...prev, [[mouseX, mouseY]]: newPixel };
          return tmp;
        });
      }
    }
  }, [mouseX, mouseY, actionMode, color, context]);

  // Update canvas every time drawBuffer changes
  useEffect(() => {
    function paintOnCanvas() {
      if (context && Object.keys(drawBuffer).length > 0) {
        // @ts-ignore
        Object.keys(drawBuffer).forEach((key: [number, number]) => {
          context.fillStyle = getColorStr(
            // @ts-ignore
            drawBuffer[key][2][0],
            // @ts-ignore
            drawBuffer[key][2][1],
            // @ts-ignore
            drawBuffer[key][2][2]
          );
          // @ts-ignore
          context?.fillRect(drawBuffer[key][0], drawBuffer[key][1], 1, 1);
        });
      }
    }

    paintOnCanvas();
  }, [drawBuffer, context]);

  // Handle when actionMode changes
  // If actionMode has changed to normal, clear the draw buffer, add it to actions
  // If actionMode has changed to draw, do nothing
  // If actionMode has changed to eyedropper, do nothing
  useEffect(() => {
    if (actionMode === "normal") {
      console.log("Action mode normal");
      if (Object.keys(drawBuffer).length > 0) {
        setActions((prev) => [...prev, drawBuffer]);
      }

      // Set pixels touched so we can impose pixel change limit
      setPixelsTouched((prev) => {
        const tmp = { ...prev };
        Object.keys(drawBuffer).forEach((key) => {
          if (key in tmp) {
            tmp[key] += 1;
          } else {
            tmp[key] = 1;
          }
        });
        return tmp;
      });

      setdrawBuffer({});
    } else if (actionMode === "draw") {
      console.log("Action mode draw");
      setdrawBuffer((prev) => {
        const tmp = prev;
        const [r, g, b] = getRgb(color);
        // @ts-ignore
        const newPixel: [number, number, Uint8ClampedArray] = [
          mouseX,
          mouseY,
          new Uint8ClampedArray([Number(r), Number(g), Number(b), 255]),
        ];
        // @ts-ignore
        tmp[[mouseX, mouseY]] = newPixel;
        return tmp;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionMode]);

  // Update Zoom view everytime a pixel is changed or the mouse moves
  useEffect(() => {
    function paintOnZoomCanvas() {
      const canvas = canvasRef.current;
      if (canvas && zoomContext) {
        zoomContext.imageSmoothingEnabled = false;
        zoomContext.drawImage(
          canvas,
          Math.min(Math.max(0, mouseX - 5), CANVAS_SIZE.width - 10),
          Math.min(Math.max(0, mouseY - 5), CANVAS_SIZE.height - 10),
          11,
          11,
          0,
          0,
          ZOOM_CANVAS_SIZE.width,
          ZOOM_CANVAS_SIZE.height
        );
        zoomContext.strokeStyle = "yellow";
        zoomContext.lineWidth = 3;
        zoomContext.strokeRect(
          (ZOOM_CANVAS_SIZE.width - ZOOM_CANVAS_SIZE.width / 11) / 2,
          (ZOOM_CANVAS_SIZE.height - ZOOM_CANVAS_SIZE.height / 11) / 2,
          ZOOM_CANVAS_SIZE.width / 11,
          ZOOM_CANVAS_SIZE.height / 11
        );
      }
    }
    paintOnZoomCanvas();
  }, [mouseX, mouseY, actions, zoomContext]);

  // zoom
  const zoom = useCallback((delta: number) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const multiplier = ZOOM_MULTIPLIER ** delta;
      setScale((prevScale) => prevScale * multiplier);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();

      if (!context) return;

      const delta = -event.deltaY / ZOOM_SENSITIVITY;
      zoom(delta);
    }

    canvas.addEventListener("wheel", handleWheel);
    // eslint-disable-next-line consistent-return
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [mouseX, mouseY, scale, context, zoom]);

  // Undo function
  const undo = () => {
    if (context && actions.length > 0) {
      // Pop out the last element of the array

      setPixelsTouched((prev) => {
        const tmp = { ...prev };
        Object.keys(actions.slice(-1)[0]).forEach((key) => {
          // key should always be in setPixelsTouched
          console.log(key);
          tmp[key] -= 1;
        });
        return tmp;
      });

      setActions(actions.slice(0, -1));
    }
  };

  function getCursorPosition(event: any) {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) / scale) - 1;
      const y = Math.floor((event.clientY - rect.top) / scale) - 1;
      return [x, y];
    }
    return [-1, -1];
  }

  const zoomIn = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      zoom(1);
    }
  };

  const zoomOut = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      zoom(-1);
    }
  };

  const panLeft = () => {
    setTranslateX(translateX + 40);
  };

  const panRight = () => {
    setTranslateX(translateX - 40);
  };

  const panUp = () => {
    setTranslateY(translateY + 40);
  };

  const panDown = () => {
    setTranslateY(translateY - 40);
  };

  // Handle arrow keys navigation
  useKey("ArrowUp", panUp, {}, [translateY]);
  useKey("ArrowDown", panDown, {}, [translateY]);
  useKey("ArrowRight", panRight, {}, [translateX]);
  useKey("ArrowLeft", panLeft, {}, [translateX]);

  const resetDrawnPixels = () => {
    setActions([]);
    setPixelsTouched({});
  };

  const handleRefreshImage = () => {
    mutate();
  };

  const handleClearImage = () => {
    setActions([]);
    setPixelsTouched({});
    mutate();
  };

  const handleResetZoom = () => {
    setScale(DEFAULT_SCALE);
    setTranslateX(0);
    setTranslateY(0);
  };

  return (
    <Grid templateColumns="3fr 1fr" minHeight="calc(100% - 96px - 1px)">
      <GridItem
        backgroundColor="rgb(255,230,220)"
        display="flex"
        justifyContent="center"
        alignItems="center"
        overflow="hidden"
        position="relative"
      >
        {!pixels ? (
          <Box
            w={4}
            h={4}
            bg="#f35626"
            color="#f35626"
            boxShadow="30px 30px 0 0,
            -30px -30px 0 0,
            30px -30px 0 0,
            -30px 30px 0 0,
            0 30px 0 0,
            30px 0 0 0,
            -30px 0 0 0,
            0 -30px 0 0"
            animation={`${spinner} 2s linear infinite`}
          />
        ) : null}
        <Box
          display={pixels ? "auto" : "none"}
          sx={{ translate: `${translateX}px ${translateY}px` }}
        >
          <canvas
            // @ts-ignore
            ref={canvasRef}
            width={CANVAS_SIZE.width}
            height={CANVAS_SIZE.height}
            style={{
              imageRendering: "pixelated",
              border: "1px solid black",
              transform: `scale(${scale})`,
              cursor: "crosshair",
            }}
            onMouseMove={(e) => {
              const [x, y] = getCursorPosition(e);
              if (actionMode === "translate") {
                const deltaX = x - mouseX;
                const deltaY = y - mouseY;
                const panX = deltaX * 2;
                const panY = deltaY * 2;
                setTranslateX(translateX + panX);
                setTranslateY(translateY + panY);
              } else {
                setMouseX(x);
                setMouseY(y);
              }
            }}
            // onClick={(e) => {
            //   performActionOnCanvas(e);
            // }}
            onMouseDown={({ button }) => {
              if (button === LEFT_MOUSE_BUTTON) {
                if (actionMode === "normal") {
                  setActionMode("draw");
                }
                if (actionMode === "eyedropper" && context) {
                  const pixel = context.getImageData(mouseX, mouseY, 1, 1);
                  setColor(uint8torgb(pixel.data));
                }
              } else if (button === MOUSEWHEEL_BUTTON) {
                setActionMode("translate");
              }
            }}
            onMouseUp={({ button }) => {
              if (button === LEFT_MOUSE_BUTTON) {
                setActionMode("normal");
              } else if (button === MOUSEWHEEL_BUTTON) {
                setActionMode("normal");
              }
            }}
          />
        </Box>

        <HowToDraw limit={MAX_PIXELS} />
      </GridItem>

      <GridItem px={10} pt={4}>
        <Button variant="outline" size="sm" onClick={zoomIn}>
          <Image
            src="/icons/Increase.png"
            priority
            width={25}
            height={25}
            alt="Zoom in"
          />
        </Button>
        <Button variant="outline" size="sm" onClick={zoomOut}>
          <Image
            src="/icons/Reduce.png"
            priority
            width={25}
            height={25}
            alt="Zoom out"
          />
        </Button>
        <Button variant="outline" size="sm" onClick={panLeft}>
          <Image
            src="/icons/Left.png"
            priority
            width={25}
            height={25}
            alt="Pan left"
          />
        </Button>
        <Button variant="outline" size="sm" onClick={panRight}>
          <Image
            src="/icons/Right.png"
            priority
            width={25}
            height={25}
            alt="Pan right"
          />
        </Button>
        <Button variant="outline" size="sm" onClick={panUp}>
          <Image
            src="/icons/Up.png"
            priority
            width={25}
            height={25}
            alt="Pan up"
          />
        </Button>
        <Button variant="outline" size="sm" onClick={panDown}>
          <Image
            src="/icons/Down.png"
            priority
            width={25}
            height={25}
            alt="Pan down"
          />
        </Button>
        <Button variant="outline" size="sm" onClick={undo}>
          <Image
            src="/icons/Back.png"
            priority
            width={25}
            height={25}
            alt="Undo"
          />
        </Button>
        <Button variant="outline" size="sm" onClick={handleClearImage}>
          <Image
            src="/icons/Clear.png"
            priority
            width={25}
            height={25}
            alt="Clear image"
          />
        </Button>
        <Button
          variant={actionMode !== "eyedropper" ? "outline" : "solid"}
          size="sm"
          onClick={() => {
            if (actionMode === "eyedropper") {
              setActionMode("normal");
            } else {
              setActionMode("eyedropper");
            }
          }}
        >
          <Image
            src="/icons/Eyedropper.png"
            priority
            width={25}
            height={25}
            alt="Eyedropper"
            style={{
              transition: "filter 300ms ease 0s",
              ...(actionMode === "eyedropper" && {
                filter: "invert(1)",
              }),
            }}
          />
          Eyedropper Mode
        </Button>
        <Button variant="outline" size="sm" onClick={handleRefreshImage}>
          Refresh Image
        </Button>
        <Button variant="outline" size="sm" onClick={handleResetZoom}>
          Reset Zoom
        </Button>
        <SubmitButton
          actions={actions}
          isPending={isPending}
          setIsPending={setIsPending}
          resetDrawnPixels={resetDrawnPixels}
        />

        <Text>
          Pixels changed: {pixelsChangedNumber}/{MAX_PIXELS}. BONK cost:{" "}
          {totalCost}
        </Text>

        <Flex align="center" mb={4}>
          <RgbStringColorPicker
            color={color}
            onChange={(rgb) => handleRgbChange(rgb)}
          />

          <Box mx={4}>
            <InputGroup>
              <InputLeftAddon>#</InputLeftAddon>
              <Input
                variant="outline"
                value={hexColor}
                onChange={(e) => handleHexChange(e.target.value)}
              />
            </InputGroup>
            <RgbInput color={color} handleRgbChange={handleRgbChange} />
          </Box>
        </Flex>

        <canvas
          // @ts-ignore
          ref={zoomCanvasRef}
          width={ZOOM_CANVAS_SIZE.width}
          height={ZOOM_CANVAS_SIZE.height}
          style={{
            imageRendering: "pixelated",
            border: "1px solid black",
          }}
        />
        {chatObject ? (
          <div style={{ height: "300px" }}>
            {/*@ts-ignore*/}
            <SendMessageProvider chatKey={chatObject}>
              <Chatroom
                chatKey={chatObject}
              />
            </SendMessageProvider>
          </div>
        ) : null
        }
      </GridItem >
    </Grid >
  );
}

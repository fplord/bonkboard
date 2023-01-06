import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RgbStringColorPicker } from "react-colorful";
import { Button, Grid, GridItem, Text } from "@chakra-ui/react";

// import { MAX_PIXELS } from "src/config/constants";
import { RgbInput } from "@/components/landing/Board/RgbInput";
import { SubmitButton } from "@/components/landing/Board/SubmitButton";
import { useSnackbarContext } from "@/contexts/SnackbarContext";
import { useBoardPixels } from "@/hooks/useBoardPixels";
import { getColorStr, getRgb } from "@/utils/color";

const CANVAS_SIZE = {
  width: 500,
  height: 500,
};

const ZOOM_CANVAS_SIZE = {
  width: 400,
  height: 400,
};

// Count all the non-zero values of keys in o
// Used to count the number of unique changed pixels
function pixelsChanged(o: { [k: string]: number }) {
  return Object.keys(o).reduce((acc, key) => acc + Number(o[key] > 0), 0);
}

function parse(pixelsChangedNumber: number) {
  return `Pixels changed: ${pixelsChangedNumber}. BONK cost: ${
    pixelsChangedNumber * 10000
  }`;
}

export function Board() {
  const [isPending, setIsPending] = useState(false);

  const [color, setColor] = useState<string>(getColorStr(0, 0, 0));
  const [scale, setScale] = useState<number>(1);
  const [translateX, setTranslateX] = useState<number>(0);
  const [translateY, setTranslateY] = useState<number>(0);
  const [actions, setActions] = useState<any[]>([]);
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const [actionMode, setActionMode] = useState<string>("normal");
  const [pixelsTouched, setPixelsTouched] = useState<{ [key: string]: number }>(
    {}
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);

  const { pixels, error, mutate } = useBoardPixels();

  const { enqueueSnackbar } = useSnackbarContext();

  const pixelsChangedNumber = pixelsChanged(pixelsTouched);

  // useEffect(() => {
  //   document.addEventListener('keydown', (event) => {
  //     if (event.ctrlKey && event.key === 'z') {
  //       console.log("Undo")
  //       undo();
  //     }
  //   });
  // // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [])

  useEffect(() => {
    if (error) {
      enqueueSnackbar({
        title: "Error loading pixels",
        description: error.message,
        variant: "critical",
      });
    }
  }, [enqueueSnackbar, error]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && pixels) {
      const context = canvas.getContext("2d");
      if (context) {
        // draw something on canvas on load
        // TODO get attr from Box, no magic numbers
        const imageData = context.createImageData(
          CANVAS_SIZE.width,
          CANVAS_SIZE.height
        );
        console.log(pixels);
        const { data } = imageData;
        for (let i = 0; i < data.length; i += 4) {
          const j = (3 * i) / 4;
          data[i] = pixels[j]; // red
          data[i + 1] = pixels[j + 1]; // green
          data[i + 2] = pixels[j + 2]; // blue
          data[i + 3] = 255; // alpha channel
        }
        console.log(data);
        context.putImageData(imageData, 0, 0);
      }
    }
  }, [pixels]);

  function uint8torgb(u: Uint8ClampedArray) {
    return getColorStr(u[0], u[1], u[2]);
  }

  function performActionOnCanvas(e: any) {
    // Eyedropper mode
    if (actionMode === "eyedropper") {
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext("2d");
        if (context) {
          const [x, y] = getCursorPosition(e);
          const pixel = context.getImageData(x, y, 1, 1);
          setColor(uint8torgb(pixel.data));
        }
      }
    } else {
      paint(e);
    }
  }

  function paint(e: any) {
    // if (pixelsChangedNumber >= MAX_PIXELS) return;

    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext("2d");
      if (context) {
        const [x, y] = getCursorPosition(e);
        const pixel = context.getImageData(x, y, 1, 1);
        const [r, g, b] = getRgb(color);
        // @ts-ignore
        const newPixel = [x, y, new Uint8ClampedArray([r, g, b, 255])];

        // Do a very quick and dirty dedupe
        if (
          actions.length >= 1 &&
          JSON.stringify(actions.slice(-1)[0][1]) === JSON.stringify(newPixel)
        ) {
          // pass don't do anything
        } else {
          setActions([...actions, [[x, y, pixel.data], newPixel]]);

          setPixelsTouched((prev) => {
            const tmp = prev;
            // @ts-ignore
            tmp[[x, y]] = 1;
            return tmp;
          });
        }
      }
    }
  }

  // Update Canvas every time a pixel is changed
  useEffect(() => {
    function paintOnCanvas() {
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext("2d");
        if (context) {
          actions.forEach((action) => {
            const lastAction = action[1];
            context.fillStyle = getColorStr(
              lastAction[2][0],
              lastAction[2][1],
              lastAction[2][2]
            );
            context?.fillRect(lastAction[0], lastAction[1], 1, 1);
          });
        }
      }
    }

    paintOnCanvas();
  }, [actions, pixels]);

  // Update Zoom view everytime a pixel is changed or the mouse moves
  // FIXME this is not working
  useEffect(() => {
    function paintOnZoomCanvas() {
      const canvas = canvasRef.current;
      const zoomCanvas = zoomCanvasRef.current;
      if (canvas && zoomCanvas) {
        const zoomContext = zoomCanvas.getContext("2d");
        if (zoomContext) {
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
    }
    paintOnZoomCanvas();
  }, [mouseX, mouseY, actions]);

  function undo() {
    const canvas = canvasRef.current;
    if (canvas && actions.length > 0) {
      const context = canvas.getContext("2d");
      if (context) {
        const [x, y, prevColour] = actions[actions.length - 1][0];
        context.fillStyle = getColorStr(
          prevColour[0],
          prevColour[1],
          prevColour[2]
        );
        context?.fillRect(x, y, 1, 1);
        // Pop out the last element of the array

        setActions(actions.slice(0, -1));

        setPixelsTouched((prev) => {
          const tmp = prev;
          // @ts-ignore
          if ([x, y] in tmp) {
            // @ts-ignore
            tmp[[x, y]] = Math.max(tmp[[x, y]] - 1, 0);
          } else {
            // @ts-ignore
            tmp[[x, y]] = 0;
          }
          return tmp;
        });
      }
    }
  }

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

  function zoomIn() {
    const canvas = canvasRef.current;
    if (canvas) {
      setScale(scale + 1);
    }
  }

  function zoomOut() {
    const canvas = canvasRef.current;
    if (canvas) {
      setScale(Math.max(scale - 1, 1));
    }
  }

  function panLeft() {
    setTranslateX(translateX + 40);
  }

  function panRight() {
    setTranslateX(translateX - 40);
  }

  function panUp() {
    setTranslateY(translateY + 40);
  }

  function panDown() {
    setTranslateY(translateY - 40);
  }

  function resetDrawnPixels() {
    setActions([]);
    setPixelsTouched({});
  }

  function handleRefreshImage() {
    mutate();
  }

  return (
    // <Flex direction="column" align="center" justify="center" gap={8}>

    <Grid templateColumns="3fr 1fr" minHeight="calc(100% - 96px - 1px)">
      <GridItem
        backgroundColor="rgb(255,230,220)"
        display="flex"
        justifyContent="center"
        alignItems="center"
        overflow="hidden"
      >
        <div
          style={{
            translate: `${translateX}px ${translateY}px`,
          }}
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
              setMouseX(x);
              setMouseY(y);
              if (e.buttons === 1) {
                paint(e);
              }
            }}
            onClick={(e) => {
              performActionOnCanvas(e);
            }}
          />
        </div>
      </GridItem>

      <GridItem px={10} pt={4}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            zoomIn();
          }}
        >
          <Image
            src="/icons/Increase.png"
            priority
            width={25}
            height={25}
            alt="Zoom in"
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            zoomOut();
          }}
        >
          <Image
            src="/icons/Reduce.png"
            priority
            width={25}
            height={25}
            alt="Zoom out"
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            panLeft();
          }}
        >
          <Image
            src="/icons/Left.png"
            priority
            width={25}
            height={25}
            alt="Pan left"
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            panRight();
          }}
        >
          <Image
            src="/icons/Right.png"
            priority
            width={25}
            height={25}
            alt="Pan right"
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            panUp();
          }}
        >
          <Image
            src="/icons/Up.png"
            priority
            width={25}
            height={25}
            alt="Pan up"
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            panDown();
          }}
        >
          <Image
            src="/icons/Down.png"
            priority
            width={25}
            height={25}
            alt="Pan down"
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            undo();
          }}
        >
          <Image
            src="/icons/Back.png"
            priority
            width={25}
            height={25}
            alt="Undo"
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleRefreshImage()}
        >
          Refresh Image
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
          />
          Eyedropper Mode
        </Button>

        <SubmitButton
          actions={actions}
          isPending={isPending}
          setIsPending={setIsPending}
          resetDrawnPixels={() => resetDrawnPixels()}
        />
        <Text>{parse(pixelsChangedNumber)}</Text>
        <RgbStringColorPicker color={color} onChange={setColor} />
        <RgbInput color={color} setColor={setColor} />
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
      </GridItem>
    </Grid>
    //  </Flex>
  );
}

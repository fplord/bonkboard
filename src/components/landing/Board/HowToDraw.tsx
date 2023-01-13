import { QuestionOutlineIcon } from "@chakra-ui/icons";
import { Box, Text, Tooltip } from "@chakra-ui/react";

type HowToDrawProps = {
  limit: number;
};

export function HowToDraw({ limit }: HowToDrawProps) {
  return (
    <Box
      position="absolute"
      top={5}
      right={5}
      borderRadius="full"
      cursor="pointer"
    >
      <Tooltip
        label={
          <>
            <Text fontWeight={700}>How to draw?</Text>
            <Text>
              To move around the canvas, use the arrow keys on your keyboard or
              the buttons on the right sidebar. To pan the canvas, hold the
              mouse wheel button or right-click and drag.
            </Text>
            <Text mt={2}>
              Please keep in mind that currently there is a limit of {limit}{" "}
              pixels per submission. When drawing, plan accordingly and submit
              your work in segments of no more than {limit} pixels each to
              ensure your work is saved properly.
            </Text>
          </>
        }
        borderRadius="12px"
        py={2}
        px={3}
        fontSize="md"
        bg="card.top"
      >
        <QuestionOutlineIcon boxSize={8} color="violet" />
      </Tooltip>
    </Box>
  );
}

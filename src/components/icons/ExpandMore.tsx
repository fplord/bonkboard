import { Icon, IconProps } from "@chakra-ui/react";

export function ExpandMoreIcon(props: IconProps) {
  return (
    <Icon h={6} w={6} viewBox="0 0 24 24" {...props}>
      <path
        d="M15.88 9.29L12 13.17L8.11998 9.29C7.72998 8.9 7.09998 8.9 6.70998 9.29C6.31998 9.68 6.31998 10.31 6.70998 10.7L11.3 15.29C11.69 15.68 12.32 15.68 12.71 15.29L17.3 10.7C17.69 10.31 17.69 9.68 17.3 9.29C16.91 8.91 16.27 8.9 15.88 9.29Z"
        fill="currentColor"
      />
    </Icon>
  );
}

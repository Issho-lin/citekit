import { useCallback } from "react";
import { useToast as useChakraToast } from "@chakra-ui/react";

export function useToast() {
  const toast = useChakraToast();
  return useCallback(
    (msg: string) => {
      toast({
        description: msg,
        status: "info",
        duration: 2800,
        isClosable: true,
        position: "bottom-right",
      });
    },
    [toast],
  );
}

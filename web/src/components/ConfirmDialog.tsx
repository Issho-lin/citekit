import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
} from "@chakra-ui/react";
import { useRef, type ReactNode } from "react";

export function ConfirmDialog({
  isOpen,
  onClose,
  title,
  children,
  confirmText = "删除",
  confirmScheme = "red",
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmText?: string;
  confirmScheme?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const cancelRef = useRef(null);
  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef as never} onClose={onClose}>
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="16px">{title}</AlertDialogHeader>
          <AlertDialogBody fontSize="14px" color="myGray.600">
            {children}
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} variant="outline" colorScheme="gray" onClick={onClose}>
              取消
            </Button>
            <Button
              colorScheme={confirmScheme}
              ml={3}
              onClick={() => {
                void (async () => {
                  try {
                    await onConfirm();
                    onClose();
                  } catch {
                    /* 调用方自己提示错误 */
                  }
                })();
              }}
            >
              {confirmText}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

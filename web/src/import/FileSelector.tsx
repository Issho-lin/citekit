import { Box, Flex, useToast } from "@chakra-ui/react";
import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { documentFileType, formatFileSize, getNanoid } from "./fileTools";
import type { ImportSourceItemType } from "./types";

export type SelectFileItemType = {
  fileId: string;
  folderPath: string;
  file: File;
};

const MAX_COUNT = 5;
const MAX_MB = 50;

export function FileSelector({
  selectFiles,
  onSelectFiles,
  fileType = documentFileType,
}: {
  selectFiles: ImportSourceItemType[];
  onSelectFiles: (e: SelectFileItemType[]) => void;
  fileType?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const maxSize = MAX_MB * 1024 * 1024;
  const [isDragging, setIsDragging] = useState(false);
  const isMaxSelected = selectFiles.length >= MAX_COUNT;

  const filterTypeReg = useMemo(
    () =>
      new RegExp(
        `(${fileType
          .split(",")
          .map((item) => item.trim())
          .join("|")})$`,
        "i",
      ),
    [fileType],
  );

  const selectFileCallback = useCallback(
    (files: SelectFileItemType[]) => {
      let next = files;
      if (selectFiles.length + files.length > MAX_COUNT) {
        next = files.slice(0, Math.max(MAX_COUNT - selectFiles.length, 0));
        toast({
          status: "warning",
          title: `超出 ${MAX_COUNT} 个文件，已自动截取`,
        });
      }
      const filterFiles = next.filter((item) => item.file.size <= maxSize);
      if (filterFiles.length < next.length) {
        toast({
          status: "warning",
          title: `部分文件超出 ${formatFileSize(maxSize)}，已被过滤`,
        });
      }
      return onSelectFiles(filterFiles);
    },
    [maxSize, onSelectFiles, selectFiles.length, toast],
  );

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const items = e.dataTransfer.items;
    const fileList: SelectFileItemType[] = [];
    const firstEntry = items[0]?.webkitGetAsEntry?.();

    if (!firstEntry) {
      fileList.push(
        ...Array.from(e.dataTransfer.files)
          .filter((item) => filterTypeReg.test(item.name))
          .map((file) => ({ fileId: getNanoid(), folderPath: "", file })),
      );
      selectFileCallback(fileList);
      return;
    }

    const readFile = (entry: FileSystemFileEntry) =>
      new Promise<void>((resolve) => {
        entry.file((file) => {
          const folderPath = (entry.fullPath || "").split("/").slice(2, -1).join("/");
          if (filterTypeReg.test(file.name)) {
            fileList.push({ fileId: getNanoid(), folderPath, file });
          }
          resolve();
        });
      });

    const traverseFileTree = (dirReader: FileSystemDirectoryReader): Promise<void> =>
      new Promise((resolve) => {
        let fileNum = 0;
        dirReader.readEntries(async (entries) => {
          for (const entry of entries) {
            if (entry.isFile) {
              await readFile(entry as FileSystemFileEntry);
              fileNum++;
            } else if (entry.isDirectory) {
              await traverseFileTree((entry as FileSystemDirectoryEntry).createReader());
            }
          }
          if (fileNum === 100) await traverseFileTree(dirReader);
          resolve();
        });
      });

    if (firstEntry?.isDirectory && items.length === 1) {
      for (const item of Array.from(items)) {
        const entry = item.webkitGetAsEntry?.();
        if (!entry) continue;
        if (entry.isFile) await readFile(entry as FileSystemFileEntry);
        else if (entry.isDirectory) await traverseFileTree((entry as FileSystemDirectoryEntry).createReader());
      }
    } else if (firstEntry?.isFile) {
      fileList.push(
        ...Array.from(e.dataTransfer.files)
          .filter((item) => filterTypeReg.test(item.name))
          .map((file) => ({ fileId: getNanoid(), folderPath: "", file })),
      );
    } else {
      toast({ title: "单次只支持上传多个文件或者一个文件夹", status: "error" });
      return;
    }
    selectFileCallback(fileList);
  };

  return (
    <Flex
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      px={3}
      py={[4, 7]}
      borderWidth="1.5px"
      borderStyle="dashed"
      borderRadius="md"
      borderColor={isDragging ? "primary.600" : "myGray.200"}
      cursor={isMaxSelected ? "default" : "pointer"}
      _hover={
        isMaxSelected
          ? undefined
          : { bg: "primary.50", borderColor: "primary.600" }
      }
      onDragEnter={(e) => {
        e.preventDefault();
        if (!isMaxSelected) setIsDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={isMaxSelected ? undefined : handleDrop}
      onClick={() => {
        if (!isMaxSelected) inputRef.current?.click();
      }}
    >
      <Box color="primary.500" fontSize="2xl" lineHeight={1} mb={1}>
        ↑
      </Box>
      {isMaxSelected ? (
        <Box color="myGray.500" fontSize="xs">
          已达到最大文件数量
        </Box>
      ) : (
        <>
          <Box fontWeight="bold">
            {isDragging ? "松开鼠标上传文件" : "点击或拖动文件到此处上传"}
          </Box>
          <Box color="myGray.500" fontSize="xs">
            支持 {fileType} 类型文件
          </Box>
          <Box color="myGray.500" fontSize="xs">
            单次可上传 {MAX_COUNT} 个 {formatFileSize(maxSize)} 的文件
          </Box>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept={fileType}
            onChange={(e) => {
              selectFileCallback(
                Array.from(e.target.files ?? []).map((file) => ({
                  fileId: getNanoid(),
                  folderPath: "",
                  file,
                })),
              );
              e.target.value = "";
            }}
          />
        </>
      )}
    </Flex>
  );
}

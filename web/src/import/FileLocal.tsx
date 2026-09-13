import { Box, Button } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useDatasetImport } from "./Context";
import { DataProcess } from "./DataProcess";
import { FileSelector, type SelectFileItemType } from "./FileSelector";
import { formatFileSize } from "./fileTools";
import { PreviewData } from "./PreviewData";
import { RenderUploadFiles } from "./RenderUploadFiles";
import type { ImportSourceItemType } from "./types";
import { UploadStep } from "./Upload";

export function FileLocal({ fileType }: { fileType?: string }) {
  const { activeStep } = useDatasetImport();
  return (
    <>
      {activeStep === 0 && <SelectFile fileType={fileType} />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <UploadStep />}
    </>
  );
}

function SelectFile({ fileType }: { fileType?: string }) {
  const { goToNext, sources, setSources, kbId } = useDatasetImport();
  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>(
    sources.map((source) => ({ isUploading: false, ...source })),
  );
  const uploadControllers = useRef(new Map<string, AbortController>());
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);
  const uploading = selectFiles.some((item) => item.isUploading);

  useEffect(() => {
    return () => {
      uploadControllers.current.forEach((c) => c.abort());
      uploadControllers.current.clear();
    };
  }, []);

  useEffect(() => {
    setSources(successFiles);
  }, [setSources, successFiles]);

  const onclickNext = useCallback(() => {
    setSelectFiles((state) => state.filter((item) => item.dbFileId));
    goToNext();
  }, [goToNext]);

  async function onSelectFiles(files: SelectFileItemType[]) {
    setSelectFiles((state) => [
      ...state,
      ...files.map<ImportSourceItemType>((selectFile) => ({
        id: selectFile.fileId,
        createStatus: "waiting",
        file: selectFile.file,
        sourceName: selectFile.file.name,
        sourceSize: formatFileSize(selectFile.file.size),
        isUploading: true,
        uploadedFileRate: 0,
      })),
    ]);

    await Promise.all(
      files.map(async ({ file, fileId }) => {
        const controller = new AbortController();
        uploadControllers.current.set(fileId, controller);
        try {
          const uploaded = await api.uploadKbFile(kbId, file, controller.signal, (percent) => {
            setSelectFiles((state) =>
              state.map((item) =>
                item.id === fileId
                  ? { ...item, uploadedFileRate: Math.max(item.uploadedFileRate ?? 0, percent) }
                  : item,
              ),
            );
          });
          if (controller.signal.aborted) return;
          setSelectFiles((state) =>
            state.map((item) =>
              item.id === fileId
                ? { ...item, dbFileId: uploaded.id, isUploading: false, uploadedFileRate: 100 }
                : item,
            ),
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          setSelectFiles((state) =>
            state.map((item) =>
              item.id === fileId
                ? {
                    ...item,
                    isUploading: false,
                    errorMsg: err instanceof Error ? err.message : "上传异常",
                  }
                : item,
            ),
          );
        } finally {
          uploadControllers.current.delete(fileId);
        }
      }),
    );
  }

  const cancelUpload = useCallback((fileId: string) => {
    uploadControllers.current.get(fileId)?.abort();
    setSelectFiles((state) => state.filter((file) => file.id !== fileId));
  }, []);

  return (
    <Box>
      <FileSelector fileType={fileType} selectFiles={selectFiles} onSelectFiles={onSelectFiles} />
      <RenderUploadFiles files={selectFiles} setFiles={setSelectFiles} onCancelUpload={cancelUpload} />
      <Box textAlign="right" mt={5}>
        <Button isDisabled={successFiles.length === 0 || uploading} onClick={onclickNext}>
          {selectFiles.length > 0 ? `共 ${selectFiles.length} 个文件 | ` : ""}
          下一步
        </Button>
      </Box>
    </Box>
  );
}

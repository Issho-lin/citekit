import type { ProcessConfig } from "../types";

export type ImportSourceKind = "fileLocal" | "fileLink" | "fileCustom" | "apiDataset" | "imageDataset";

export type ImportSourceItemType = {
  id: string;
  createStatus: "waiting" | "creating" | "finish";
  errorMsg?: string;
  sourceName: string;
  sourceSize?: string;
  isUploading?: boolean;
  uploadedFileRate?: number;
  dbFileId?: string;
  file?: File;
  link?: string;
  rawText?: string;
  icon?: string;
};

export type DatasetImportContextType = {
  importSource: ImportSourceKind;
  parentId: string | undefined;
  kbId: string;
  activeStep: number;
  goToNext: () => void;
  goToPrevious: () => void;
  process: ProcessConfig;
  setProcess: (next: ProcessConfig) => void;
  sources: ImportSourceItemType[];
  setSources: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
};

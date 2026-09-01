/** FastGPT `packages/global/common/file/constants.ts` 内置解析格式 */
export const documentFileType =
  ".txt, .docx, .csv, .xlsx, .pdf, .md, .html, .pptx";

/** FastGPT `packages/global/common/file/tools.ts` */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getNanoid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 21);
}

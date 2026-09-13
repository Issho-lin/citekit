import { FileLocal } from "./FileLocal";
import { imageFileType } from "./fileTools";

export function FileImageDataset() {
  return <FileLocal fileType={imageFileType} />;
}

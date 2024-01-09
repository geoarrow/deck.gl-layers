import * as arrow from "apache-arrow";
import { GetPickingInfoParams } from "@deck.gl/core/typed";
import { GeoArrowPickingInfo } from "./types";

export function getPickingInfo(
  { info, sourceLayer }: GetPickingInfoParams,
  table: arrow.Table,
): GeoArrowPickingInfo {
  // Geometry index as rendered
  let index = info.index;

  // if a Multi- geometry dataset, map from the rendered index back to the
  // feature index
  // @ts-expect-error `invertedGeomOffsets` is manually set on layer props
  if (sourceLayer.props.invertedGeomOffsets) {
    // @ts-expect-error `invertedGeomOffsets` is manually set on layer props
    index = sourceLayer.props.invertedGeomOffsets[index];
  }

  // @ts-expect-error `recordBatchIdx` is manually set on layer props
  const recordBatchIdx: number = sourceLayer.props.recordBatchIdx;
  // @ts-expect-error `tableOffsets` is manually set on layer props
  const tableOffsets: Uint32Array = sourceLayer.props.tableOffsets;

  const batch = table.batches[recordBatchIdx];
  const row = batch.get(index);
  if (row === null) {
    return info;
  }

  const currentBatchOffset = tableOffsets[recordBatchIdx];

  // Update index to be _global_ index, not within the specific record batch
  index += currentBatchOffset;
  return {
    ...info,
    index,
    object: row,
  };
}

// This is vendored from Arrow JS because it's a private API
export function computeChunkOffsets<T extends arrow.DataType>(
  chunks: ReadonlyArray<arrow.Data<T>>,
) {
  return chunks.reduce(
    (offsets, chunk, index) => {
      offsets[index + 1] = offsets[index] + chunk.length;
      return offsets;
    },
    new Uint32Array(chunks.length + 1),
  );
}

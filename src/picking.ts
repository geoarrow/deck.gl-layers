import * as arrow from "apache-arrow";
import { GetPickingInfoParams } from "@deck.gl/core/typed";
import { GeoArrowPickingInfo } from "./types";

export function getPickingInfo(
  { info, sourceLayer }: GetPickingInfoParams,
  table: arrow.Table,
): GeoArrowPickingInfo {
  // Geometry index as rendered
  let index = info.index;

  // if a MultiPoint dataset, map from the rendered index back to the feature
  // index
  // @ts-expect-error `invertedGeomOffsets` is manually set on layer props
  if (sourceLayer.props.invertedGeomOffsets) {
    // @ts-expect-error `invertedGeomOffsets` is manually set on layer props
    index = sourceLayer.props.invertedGeomOffsets[index];
  }

  // @ts-expect-error `recordBatchIdx` is manually set on layer props
  const recordBatchIdx: number = sourceLayer.props.recordBatchIdx;
  const batch = table.batches[recordBatchIdx];
  const row = batch.get(index);

  // @ts-expect-error hack: using private method to avoid recomputing via
  // batch lengths on each iteration
  const offsets: number[] = table._offsets;
  const currentBatchOffset = offsets[recordBatchIdx];

  // Update index to be _global_ index, not within the specific record batch
  index += currentBatchOffset;
  return {
    ...info,
    index,
    object: row,
  };
}

// deck.gl-community
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type { RecordBatch, Data, DataType } from "apache-arrow";
import { GetPickingInfoParams } from "@deck.gl/core";
import { GeoArrowPickingInfo } from "../types";

export interface GeoArrowExtraPickingProps {
  data: {
    invertedGeomOffsets?: Uint8Array | Uint16Array | Uint32Array;
  };
}

export function getPickingInfo(
  {
    info,
    sourceLayer,
  }: GetPickingInfoParams & {
    sourceLayer: { props: GeoArrowExtraPickingProps };
  },
  batch: RecordBatch,
): GeoArrowPickingInfo {
  // Geometry index as rendered
  let index = info.index;

  // if a Multi- geometry dataset, map from the rendered index back to the
  // feature index
  if (sourceLayer.props.data.invertedGeomOffsets) {
    index = sourceLayer.props.data.invertedGeomOffsets[index];
  }

  const row = batch.get(index);
  if (row === null) {
    return info;
  }

  return {
    ...info,
    index,
    object: row,
  };
}

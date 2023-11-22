import type { Accessor, Color, PickingInfo } from "@deck.gl/core/typed";
import * as arrow from "apache-arrow";

export type GeoArrowPickingInfo = PickingInfo & {
  object?: arrow.StructRowProxy;
};

export type FloatAccessor =
  | arrow.Vector<arrow.Float>
  | Accessor<arrow.Table, number>;
export type ColorAccessor =
  | arrow.Vector<arrow.FixedSizeList<arrow.Uint8>>
  | Accessor<arrow.Table, Color | Color[]>;

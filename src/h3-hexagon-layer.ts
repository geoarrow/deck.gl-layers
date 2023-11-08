import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  Unit,
} from "@deck.gl/core/typed";
import { PolygonLayer } from "@deck.gl/layers/typed";
import { ScatterplotLayer } from "@deck.gl/layers/typed";
import { H3HexagonLayer } from "@deck.gl/geo-layers/typed";
import type { H3HexagonLayerProps } from "@deck.gl/geo-layers/typed";
import type {
  PolygonLayerProps,
  ScatterplotLayerProps,
} from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  getMultiPointChild,
  getPointChild,
  invertOffsets,
  isMultiPointVector,
  isPointVector,
  validateColorVector,
  validateMultiPointType,
  validatePointType,
  validateVectorAccessors,
} from "./utils.js";
import {
  ColorAccessor,
  FloatAccessor,
  GeoArrowPickingInfo,
  MultiPointVector,
  PointVector,
} from "./types.js";
import { EXTENSION_NAME } from "./constants.js";

/** All properties supported by GeoArrowH3HexagonLayer */
export type GeoArrowH3HexagonLayerProps<DataT = unknown> =
  _GeoArrowH3HexagonLayerProps<DataT> & PolygonLayerProps<DataT>;

/** Props added by the GeoArrowH3HexagonLayer */
type _GeoArrowH3HexagonLayerProps<DataT> = Omit<H3HexagonLayerProps, "getHexagon"> & {
  getHexagon: arrow.Vector<arrow.Utf8>;

}

let x: _GeoArrowH3HexagonLayerProps;
function tmp(x: _GeoArrowH3HexagonLayerProps<unknown>) {
  x.gethe
}


{
  /**
   * Whether or not draw hexagons with high precision.
   * @default 'auto'
   */
  highPrecision?: boolean | "auto";
  /**
   * Coverage of hexagon in cell.
   * @default 1
   */
  coverage?: number;
  /**
   * Center hexagon that best represents the shape of the set. If not specified, the hexagon closest to the center of the viewport is used.
   */
  centerHexagon?: string | null; // H3Index | null;
  /**
   * Called for each data object to retrieve the quadkey string identifier.
   *
   * By default, it reads `hexagon` property of data object.
   */
  getHexagon: arrow.Vector<arrow.Utf8>;
  /**
   * Whether to extrude polygons.
   * @default true
   */
  extruded?: boolean;
};

const defaultProps: DefaultProps<GeoArrowH3HexagonLayerProps> = {
  ...PolygonLayer.defaultProps,
  highPrecision: "auto",
  coverage: { type: "number", min: 0, max: 1, value: 1 },
  centerHexagon: null,
  extruded: true,
};

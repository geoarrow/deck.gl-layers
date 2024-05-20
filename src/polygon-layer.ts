import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  GetPickingInfoParams,
  assert,
} from "@deck.gl/core";
import { PolygonLayer } from "@deck.gl/layers";
import type { PolygonLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import { getGeometryVector } from "./utils.js";
import { GeoArrowExtraPickingProps, getPickingInfo } from "./picking.js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { GeoArrowSolidPolygonLayer } from "./solid-polygon-layer.js";
import { GeoArrowPathLayer } from "./path-layer.js";

/**
 * Get the exterior of a PolygonVector or PolygonData as a MultiLineString
 *
 * Note that casting to a MultiLineString is a no-op of the underlying data
 * structure. For the purposes of the PolygonLayer we don't want to cast to a
 * LineString because that would change the number of rows in the table.
 */
export function getPolygonExterior(
  input: ga.vector.PolygonVector,
): ga.vector.MultiLineStringVector;
export function getPolygonExterior(
  input: ga.data.PolygonData,
): ga.data.MultiLineStringData;

export function getPolygonExterior(
  input: ga.vector.PolygonVector | ga.data.PolygonData,
): ga.vector.MultiLineStringVector | ga.data.MultiLineStringData {
  if ("data" in input) {
    return new arrow.Vector(input.data.map((data) => getPolygonExterior(data)));
  }

  return input;
}

/**
 * Get the exterior of a MultiPolygonVector or MultiPolygonData
 *
 * Note that for the purposes of the PolygonLayer, we don't want to change the
 * number of rows in the table. Instead, we convert each MultiPolygon to a
 * single MultiLineString, combining all exteriors of each contained Polygon
 * into a single united MultiLineString.
 *
 * This means that we need to condense both two offset buffers from the
 * MultiPolygonVector/Data (geomOffsets and polygonOffsets) into a single
 * `geomOffsets` for the new MultiLineStringVector/Data.
 */
export function getMultiPolygonExterior(
  input: ga.vector.MultiPolygonVector,
): ga.vector.MultiLineStringVector;
export function getMultiPolygonExterior(
  input: ga.data.MultiPolygonData,
): ga.data.MultiLineStringData;

export function getMultiPolygonExterior(
  input: ga.vector.MultiPolygonVector | ga.data.MultiPolygonData,
): ga.vector.MultiLineStringVector | ga.data.MultiLineStringData {
  if ("data" in input) {
    return new arrow.Vector(
      input.data.map((data) => getMultiPolygonExterior(data)),
    );
  }

  const geomOffsets: Int32Array = input.valueOffsets;
  const polygonData = ga.child.getMultiPolygonChild(input);
  const polygonOffsets: Int32Array = polygonData.valueOffsets;
  const lineStringData = ga.child.getPolygonChild(polygonData);

  const resolvedOffsets = new Int32Array(geomOffsets.length);
  for (let i = 0; i < resolvedOffsets.length; ++i) {
    // Perform the lookup
    resolvedOffsets[i] = polygonOffsets[geomOffsets[i]];
  }

  return arrow.makeData({
    type: new arrow.List(polygonData.type.children[0]),
    length: input.length,
    nullCount: input.nullCount,
    nullBitmap: input.nullBitmap,
    child: lineStringData,
    valueOffsets: resolvedOffsets,
  });
}

/** All properties supported by GeoArrowPolygonLayer */
export type GeoArrowPolygonLayerProps = Omit<
  PolygonLayerProps,
  | "data"
  | "getPolygon"
  | "getFillColor"
  | "getLineColor"
  | "getLineWidth"
  | "getElevation"
> &
  _GeoArrowPolygonLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPolygonLayer */
type _GeoArrowPolygonLayerProps = {
  data: arrow.Table;

  /** Polygon geometry accessor. */
  getPolygon?: ga.vector.PolygonVector | ga.vector.MultiPolygonVector;
  /** Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;
  /** Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;
  /**
   * Line width value of accessor.
   * @default 1
   */
  getLineWidth?: FloatAccessor;
  /**
   * Elevation value of accessor.
   *
   * Only used if `extruded: true`.
   *
   * @default 1000
   */
  getElevation?: FloatAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data and getPolygon from the upstream default props
const {
  data: _data,
  getPolygon: _getPolygon,
  ..._defaultProps
} = PolygonLayer.defaultProps;

// Default props added by us
const ourDefaultProps: Pick<
  GeoArrowPolygonLayerProps,
  "_normalize" | "_windingOrder" | "_validate"
> = {
  // Note: this diverges from upstream, where here we default to no
  // normalization
  _normalize: false,
  // Note: this diverges from upstream, where here we default to CCW
  _windingOrder: "CCW",

  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowPolygonLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

const defaultLineColor: [number, number, number, number] = [0, 0, 0, 255];
const defaultFillColor: [number, number, number, number] = [0, 0, 0, 255];

/** The `GeoArrowPolygonLayer` renders filled, stroked and/or extruded polygons.
 *
 * GeoArrowPolygonLayer is a CompositeLayer that wraps the
 * GeoArrowSolidPolygonLayer and the GeoArrowPathLayer.
 */
export class GeoArrowPolygonLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<Required<GeoArrowPolygonLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPolygonLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    // Propagate the picked info from the SolidPolygonLayer
    return params.info;
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props.getPolygon !== undefined) {
      const geometryColumn = this.props.getPolygon;
      if (ga.vector.isPolygonVector(geometryColumn)) {
        return this._renderLayers(geometryColumn);
      }

      if (ga.vector.isMultiPolygonVector(geometryColumn)) {
        return this._renderLayers(geometryColumn);
      }

      throw new Error(
        "getPolygon should be an arrow Vector of Polygon or MultiPolygon type",
      );
    } else {
      const polygonVector = getGeometryVector(table, EXTENSION_NAME.POLYGON);
      if (polygonVector !== null) {
        return this._renderLayers(polygonVector);
      }

      const multiPolygonVector = getGeometryVector(
        table,
        EXTENSION_NAME.MULTIPOLYGON,
      );
      if (multiPolygonVector !== null) {
        return this._renderLayers(multiPolygonVector);
      }
    }

    throw new Error("geometryColumn not Polygon or MultiPolygon");
  }

  // NOTE: Here we shouldn't need a split for handling both multi- and single-
  // geometries, because the underlying SolidPolygonLayer and PathLayer both
  // support multi-* and single- geometries.
  _renderLayers(
    geometryColumn: ga.vector.PolygonVector | ga.vector.MultiPolygonVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    let getPath: ga.vector.MultiLineStringVector;
    if (ga.vector.isPolygonVector(geometryColumn)) {
      getPath = getPolygonExterior(geometryColumn);
    } else if (ga.vector.isMultiPolygonVector(geometryColumn)) {
      getPath = getMultiPolygonExterior(geometryColumn);
    } else {
      assert(false);
    }

    // Layer composition props
    const {
      data,
      _dataDiff,
      stroked,
      filled,
      extruded,
      wireframe,
      _normalize,
      _windingOrder,
      elevationScale,
      transitions,
      positionFormat,
    } = this.props;

    // Rendering props underlying layer
    const {
      lineWidthUnits,
      lineWidthScale,
      lineWidthMinPixels,
      lineWidthMaxPixels,
      lineJointRounded,
      lineMiterLimit,
      lineDashJustified,
    } = this.props;

    // Accessor props for underlying layers
    const {
      getFillColor,
      getLineColor,
      getLineWidth,
      getElevation,
      getPolygon,
      updateTriggers,
      material,
    } = this.props;

    const FillLayer = this.getSubLayerClass("fill", GeoArrowSolidPolygonLayer);
    const StrokeLayer = this.getSubLayerClass("stroke", GeoArrowPathLayer);

    // Filled Polygon Layer
    const polygonLayer = new FillLayer(
      {
        // _dataDiff,
        extruded,
        elevationScale,

        filled,
        wireframe,
        _normalize,
        _windingOrder,

        getElevation,
        getFillColor,
        getLineColor: extruded && wireframe ? getLineColor : defaultLineColor,

        material,
        transitions,
      },
      this.getSubLayerProps({
        id: "fill",
        updateTriggers: updateTriggers && {
          getPolygon: updateTriggers.getPolygon,
          getElevation: updateTriggers.getElevation,
          getFillColor: updateTriggers.getFillColor,
          getLineColor: updateTriggers.getLineColor,
        },
      }),
      {
        data,
        positionFormat,
        getPolygon,
      },
    );

    // Polygon line layer
    const polygonLineLayer =
      !extruded &&
      stroked &&
      new StrokeLayer(
        {
          // _dataDiff,
          widthUnits: lineWidthUnits,
          widthScale: lineWidthScale,
          widthMinPixels: lineWidthMinPixels,
          widthMaxPixels: lineWidthMaxPixels,
          jointRounded: lineJointRounded,
          miterLimit: lineMiterLimit,
          dashJustified: lineDashJustified,

          // Already normalized, and since they had been polygons, we know that
          // the lines are a loop.
          _pathType: "loop",

          transitions: transitions && {
            getWidth: transitions.getLineWidth,
            getColor: transitions.getLineColor,
            getPath: transitions.getPolygon,
          },

          getColor: this.getSubLayerAccessor(getLineColor),
          getWidth: this.getSubLayerAccessor(getLineWidth),
        },
        this.getSubLayerProps({
          id: "stroke",
          updateTriggers: updateTriggers && {
            getWidth: updateTriggers.getLineWidth,
            getColor: updateTriggers.getLineColor,
            getDashArray: updateTriggers.getLineDashArray,
          },
        }),
        {
          data: table,
          positionFormat,
          getPath,
          // We only pick solid polygon layers, not the path layers
          pickable: false,
        },
      );

    const layers = [
      // If not extruded: flat fill layer is drawn below outlines
      !extruded && polygonLayer,
      polygonLineLayer,
      // If extruded: draw fill layer last for correct blending behavior
      extruded && polygonLayer,
    ];
    return layers;
  }
}

// deck.gl-community
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core";
import type { PolygonLayerProps } from "@deck.gl/layers";
import { PolygonLayer } from "@deck.gl/layers";
import * as ga from "@geoarrow/geoarrow-js";
import * as arrow from "apache-arrow";
import type { FunctionThread, Pool } from "threads";
import { EXTENSION_NAME } from "../constants";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { GeoArrowExtraPickingProps } from "../utils/picking";
import { getGeometryData } from "../utils/utils";
import { GeoArrowPathLayer } from "./path-layer";
import { GeoArrowSolidPolygonLayer } from "./solid-polygon-layer";

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
  data: arrow.RecordBatch;

  /** Polygon geometry accessor. */
  getPolygon?: ga.data.PolygonData | ga.data.MultiPolygonData;
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

  /** A worker pool for earcut triangulation.
   *
   * You can use the `initEarcutPool` helper function to create a pool. This is
   * helpful if you're rendering many Polygon layers and want to share a pool
   * between them.
   *
   * If not provided, a pool will be created automatically.
   *
   * As of v0.4, layers have been refactored to take in a _RecordBatch_ as
   * input, instead of a table. This means that if a worker pool is created as
   * part of this layer, it will only be used once. To take advantage of the
   * pool, ideally you should create it externally and pass it in via this prop.
   */
  earcutWorkerPool?: Pool<FunctionThread> | null;

  /**
   * URL to worker that performs earcut triangulation.
   *
   * By default this loads from the jsdelivr CDN, but end users may want to host
   * this on their own domain.
   */
  earcutWorkerUrl?: string | URL | null;

  /**
   * The number of workers used for the earcut thread pool.
   */
  earcutWorkerPoolSize?: number;

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
    const { data: batch } = this.props;

    if (this.props.getPolygon !== undefined) {
      const geometryColumn = this.props.getPolygon;
      if (ga.data.isPolygonData(geometryColumn)) {
        return this._renderLayers(geometryColumn);
      }

      if (ga.data.isMultiPolygonData(geometryColumn)) {
        return this._renderLayers(geometryColumn);
      }

      throw new Error(
        "getPolygon should be an arrow Data of Polygon or MultiPolygon type",
      );
    } else {
      const polygonData = getGeometryData(batch, EXTENSION_NAME.POLYGON);
      if (polygonData !== null && ga.data.isPolygonData(polygonData)) {
        return this._renderLayers(polygonData);
      }

      const multiPolygonData = getGeometryData(
        batch,
        EXTENSION_NAME.MULTIPOLYGON,
      );
      if (
        multiPolygonData !== null &&
        ga.data.isMultiPolygonData(multiPolygonData)
      ) {
        return this._renderLayers(multiPolygonData);
      }
    }

    throw new Error("geometryColumn not Polygon or MultiPolygon");
  }

  // NOTE: Here we shouldn't need a split for handling both multi- and single-
  // geometries, because the underlying SolidPolygonLayer and PathLayer both
  // support multi-* and single- geometries.
  _renderLayers(
    geometryColumn: ga.data.PolygonData | ga.data.MultiPolygonData,
  ): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    let getPath: ga.data.MultiLineStringData;
    if (ga.data.isPolygonData(geometryColumn)) {
      getPath = getPolygonExterior(geometryColumn);
    } else if (ga.data.isMultiPolygonData(geometryColumn)) {
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
      earcutWorkerPool,
      earcutWorkerPoolSize,
      earcutWorkerUrl,
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

        earcutWorkerPool,
        earcutWorkerPoolSize,
        earcutWorkerUrl,
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
          data: batch,
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

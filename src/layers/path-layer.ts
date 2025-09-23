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
import { PathLayer } from "@deck.gl/layers";
import type { PathLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryData,
  getInterleavedLineString,
  getMultiLineStringResolvedOffsets,
  invertOffsets,
  isGeomSeparate,
} from "../utils/utils";
import {
  GeoArrowExtraPickingProps,
  computeChunkOffsets,
  getPickingInfo,
} from "../utils/picking";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { EXTENSION_NAME } from "../constants";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowPathLayer */
export type GeoArrowPathLayerProps = Omit<
  PathLayerProps<arrow.RecordBatch>,
  "data" | "getPath" | "getColor" | "getWidth"
> &
  _GeoArrowPathLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPathLayer */
type _GeoArrowPathLayerProps = {
  data: arrow.RecordBatch;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Path geometry accessor.
   */
  getPath?: ga.data.LineStringData | ga.data.MultiLineStringData;
  /**
   * Path color accessor.
   * @default [0, 0, 0, 255]
   */
  getColor?: ColorAccessor;
  /**
   * Path width accessor.
   * @default 1
   */
  getWidth?: FloatAccessor;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPath: _getPath,
  ..._defaultProps
} = PathLayer.defaultProps;

// Default props added by us
const ourDefaultProps: Pick<GeoArrowPathLayerProps, "_pathType" | "_validate"> =
  {
    // Note: this diverges from upstream, where here we _default into_ binary
    // rendering
    // This instructs the layer to skip normalization and use the binary
    // as-is
    _pathType: "open",
    _validate: true,
  };

// @ts-expect-error not sure why this is failing
export const defaultProps: DefaultProps<GeoArrowPathLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

/**
 * Render lists of coordinate points as extruded polylines with mitering.
 */
export class GeoArrowPathLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowPathLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPathLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props.getPath !== undefined) {
      const geometryData = this.props.getPath;
      if (
        geometryData !== undefined &&
        ga.data.isLineStringData(geometryData)
      ) {
        return this._renderLineStringLayer(geometryData);
      }

      if (
        geometryData !== undefined &&
        ga.data.isMultiLineStringData(geometryData)
      ) {
        return this._renderMultiLineStringLayer(geometryData);
      }

      throw new Error(
        "getPath should be an arrow Vector of LineString or MultiLineString type",
      );
    } else {
      const lineStringData = getGeometryData(table, EXTENSION_NAME.LINESTRING);
      if (lineStringData !== null && ga.data.isLineStringData(lineStringData)) {
        return this._renderLineStringLayer(lineStringData);
      }

      const multiLineStringData = getGeometryData(
        table,
        EXTENSION_NAME.MULTILINESTRING,
      );
      if (
        multiLineStringData !== null &&
        ga.data.isMultiLineStringData(multiLineStringData)
      ) {
        return this._renderMultiLineStringLayer(multiLineStringData);
      }
    }

    throw new Error("getPath not GeoArrow LineString or MultiLineString");
  }

  _renderLineStringLayer(
    lineStringData: ga.data.LineStringData,
  ): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    // TODO: validate that if nested, accessor props have the same nesting
    // structure as the main geometry column.
    if (this.props._validate) {
      assert(ga.data.isLineStringData(lineStringData));
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPath",
    ]);

    if (isGeomSeparate(lineStringData)) {
      lineStringData = getInterleavedLineString(lineStringData);
    }
    const geomOffsets = lineStringData.valueOffsets;
    const pointData = ga.child.getLineStringChild(lineStringData);
    const nDim = pointData.type.listSize;
    const coordData = ga.child.getPointChild(pointData);
    const flatCoordinateArray = coordData.values;

    const props: PathLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-path`,
      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: table.batches[recordBatchIdx],
        length: lineStringData.length,
        startIndices: geomOffsets,
        attributes: {
          getPath: { value: flatCoordinateArray, size: nDim },
        },
      },
    };

    for (const [propName, propInput] of Object.entries(accessors)) {
      assignAccessor({
        props,
        propName,
        propInput,
        geomCoordOffsets: geomOffsets,
      });
    }

    return new PathLayer(this.getSubLayerProps(props));
  }

  _renderMultiLineStringLayer(
    multiLineStringData: ga.data.MultiLineStringData,
  ): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    // TODO: validate that if nested, accessor props have the same nesting
    // structure as the main geometry column.
    if (this.props._validate) {
      assert(ga.data.isMultiLineStringData(multiLineStringData));
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPath",
    ]);

    let lineStringData = ga.child.getMultiLineStringChild(multiLineStringData);
    if (isGeomSeparate(lineStringData)) {
      lineStringData = getInterleavedLineString(lineStringData);
    }
    const pointData = ga.child.getLineStringChild(lineStringData);
    const coordData = ga.child.getPointChild(pointData);

    const geomOffsets = multiLineStringData.valueOffsets;
    const ringOffsets = lineStringData.valueOffsets;

    const nDim = pointData.type.listSize;
    const flatCoordinateArray = coordData.values;
    const multiLineStringToCoordOffsets =
      getMultiLineStringResolvedOffsets(multiLineStringData);

    const props: PathLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-path`,
      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: table.batches[recordBatchIdx],
        // Map from expanded multi-geometry index to original index
        // Used both in picking and for function callbacks
        invertedGeomOffsets: invertOffsets(geomOffsets),
        // Note: this needs to be the length one level down.
        length: lineStringData.length,
        // Offsets into coordinateArray where each single-line string starts
        //
        // Note: this is ringOffsets, not geomOffsets because we're rendering
        // the individual paths on the map.
        startIndices: ringOffsets,
        attributes: {
          getPath: { value: flatCoordinateArray, size: nDim },
        },
      },
    };

    // Note: here we use multiLineStringToCoordOffsets, not ringOffsets,
    // because we want the mapping from the _feature_ to the vertex
    for (const [propName, propInput] of Object.entries(accessors)) {
      assignAccessor({
        props,
        propName,
        propInput,
        geomCoordOffsets: multiLineStringToCoordOffsets,
      });
    }

    return new PathLayer(this.getSubLayerProps(props));
  }
}

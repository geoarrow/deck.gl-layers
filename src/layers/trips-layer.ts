// deck.gl-community
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core";
import { TripsLayer, TripsLayerProps } from "@deck.gl/geo-layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryData,
  getInterleavedLineString,
  isGeomSeparate,
} from "../utils/utils";
import { TimestampAccessor, ColorAccessor, FloatAccessor } from "../types";
import { defaultProps as pathLayerDefaultProps } from "./path-layer";
import { validateAccessors } from "../utils/validate";
import { EXTENSION_NAME } from "../constants";

/** All properties supported by GeoArrowTripsLayer */
export type GeoArrowTripsLayerProps = Omit<
  TripsLayerProps<arrow.RecordBatch>,
  "data" | "getPath" | "getColor" | "getWidth" | "getTimestamps"
> &
  _GeoArrowTripsLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowTripsLayer */
type _GeoArrowTripsLayerProps = {
  data: arrow.RecordBatch;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Path geometry accessor.
   */
  getPath?: ga.data.LineStringData;
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
  /**
   * Timestamp accessor.
   */
  getTimestamps: TimestampAccessor;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPath: _getPath,
  ..._defaultProps
} = pathLayerDefaultProps;

// Default props added by us
const ourDefaultProps: Pick<
  GeoArrowTripsLayerProps,
  "_pathType" | "_validate"
> = {
  // Note: this diverges from upstream, where here we _default into_ binary
  // rendering
  // This instructs the layer to skip normalization and use the binary
  // as-is
  _pathType: "open",
  _validate: true,
};

const defaultProps: DefaultProps<GeoArrowTripsLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

/** Render animated paths that represent vehicle trips. */
export class GeoArrowTripsLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowTripsLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowTripsLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: batch, getTimestamps } = this.props;

    if (this.props.getPath !== undefined) {
      const geometryColumn = this.props.getPath;
      if (
        geometryColumn !== undefined &&
        ga.data.isLineStringData(geometryColumn)
      ) {
        return this._renderLineStringLayer(geometryColumn, getTimestamps);
      }

      throw new Error("getPath should be an arrow Data of LineString type");
    } else {
      const lineStringData = getGeometryData(batch, EXTENSION_NAME.LINESTRING);
      if (lineStringData !== null && ga.data.isLineStringData(lineStringData)) {
        return this._renderLineStringLayer(lineStringData, getTimestamps);
      }
    }

    throw new Error("getPath not GeoArrow LineString");
  }

  _renderLineStringLayer(
    lineStringData: ga.data.LineStringData,
    timestampData: TimestampAccessor,
  ): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    if (this.props._validate) {
      assert(ga.data.isLineStringData(lineStringData));
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPath",
      "getTimestamps",
    ]);

    if (isGeomSeparate(lineStringData)) {
      lineStringData = getInterleavedLineString(lineStringData);
    }
    const geomOffsets = lineStringData.valueOffsets;
    const pointData = ga.child.getLineStringChild(lineStringData);
    const nDim = pointData.type.listSize;
    const coordData = ga.child.getPointChild(pointData);
    const flatCoordinateArray = coordData.values;

    const timestampValues = timestampData.children[0].values;

    const props: TripsLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-trip`,
      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: table.batches[recordBatchIdx],
        length: lineStringData.length,
        startIndices: geomOffsets,
        attributes: {
          getPath: { value: flatCoordinateArray, size: nDim },
          getTimestamps: { value: timestampValues, size: 1 },
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

    return new TripsLayer(props);
  }
}

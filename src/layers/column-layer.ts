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
import { ColumnLayer } from "@deck.gl/layers";
import type { ColumnLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import type { RecordBatch } from "apache-arrow";
import {
  assignAccessor,
  convertStructToFixedSizeList,
  extractAccessorsFromProps,
  getGeometryData,
  isGeomSeparate,
} from "../utils/utils";
import * as ga from "@geoarrow/geoarrow-js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { EXTENSION_NAME } from "../constants";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowColumnLayer */
export type GeoArrowColumnLayerProps = Omit<
  ColumnLayerProps<arrow.RecordBatch>,
  | "data"
  | "getPosition"
  | "getFillColor"
  | "getLineColor"
  | "getElevation"
  | "getLineWidth"
> &
  _GeoArrowColumnLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowColumnLayer */
type _GeoArrowColumnLayerProps = {
  data: RecordBatch;

  /**
   * Method called to retrieve the position of each column.
   */
  getPosition?: ga.data.PointData;

  /**
   * Fill color value or accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;

  /**
   * Line color value or accessor.
   *
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;

  /**
   * The elevation of each cell in meters.
   * @default 1000
   */
  getElevation?: FloatAccessor;

  /**
   * The width of the outline of the column, in units specified by `lineWidthUnits`.
   *
   * @default 1
   */
  getLineWidth?: FloatAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._defaultProps
} = ColumnLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowColumnLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

/**
 * Render extruded cylinders (tessellated regular polygons) at given
 * coordinates.
 */
export class GeoArrowColumnLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowColumnLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowColumnLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    const geometryData = getGeometryData(batch, EXTENSION_NAME.POINT);
    if (geometryData !== null && ga.data.isPointData(geometryData)) {
      return this._renderPointLayer(geometryData);
    }

    const geometryColumn = this.props.getPosition;
    if (geometryColumn !== undefined && ga.data.isPointData(geometryColumn)) {
      return this._renderPointLayer(geometryColumn);
    }

    throw new Error("getPosition not GeoArrow point");
  }

  _renderPointLayer(
    geometryData: ga.data.PointData,
  ): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    if (this.props._validate) {
      assert(ga.data.isPointData(geometryData));
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
    ]);

    if (isGeomSeparate(geometryData)) {
      geometryData = convertStructToFixedSizeList(geometryData);
    }
    const flatCoordsData = ga.child.getPointChild(geometryData);
    const flatCoordinateArray = flatCoordsData.values;

    const props: ColumnLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-column`,
      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: batch,
        length: geometryData.length,
        attributes: {
          getPosition: {
            value: flatCoordinateArray,
            size: geometryData.type.listSize,
          },
        },
      },
    };

    for (const [propName, propInput] of Object.entries(accessors)) {
      assignAccessor({
        props,
        propName,
        propInput,
      });
    }

    return new ColumnLayer(this.getSubLayerProps(props));
  }
}

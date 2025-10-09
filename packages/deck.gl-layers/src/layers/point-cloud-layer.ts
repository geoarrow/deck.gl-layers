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
import { PointCloudLayer } from "@deck.gl/layers";
import type { PointCloudLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  convertStructToFixedSizeList,
  extractAccessorsFromProps,
  getGeometryData,
  isGeomSeparate,
} from "../utils/utils";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { ColorAccessor, GeoArrowPickingInfo, NormalAccessor } from "../types";
import { EXTENSION_NAME } from "../constants";
import { validateAccessors } from "../utils/validate";

/* All properties supported by GeoArrowPointCloudLayer */
export type GeoArrowPointCloudLayerProps = Omit<
  PointCloudLayerProps<arrow.RecordBatch>,
  "data" | "getPosition" | "getNormal" | "getColor"
> &
  _GeoArrowPointCloudLayerProps &
  CompositeLayerProps;

/* All properties added by GeoArrowPointCloudLayer */
type _GeoArrowPointCloudLayerProps = {
  // data
  data: arrow.RecordBatch;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;

  /**
   * Center position accessor.
   * If not provided, will be inferred by finding a column with extension type
   * `"geoarrow.point"`
   */
  getPosition?: ga.data.PointData;

  /**
   * The normal of each object, in `[nx, ny, nz]`.
   * @default [0,0,1]
   */
  getNormal?: NormalAccessor;

  /**
   * The rgba color is in the format of `[r, g, b, [a]]`
   * @default [0,0,0,225]
   */
  getColor?: ColorAccessor;
};

// Remove data nd get Position from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._upstreamDefaultProps
} = PointCloudLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowPointCloudLayerProps> = {
  ..._upstreamDefaultProps,
  ...ourDefaultProps,
};

export class GeoArrowPointCloudLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowPointCloudLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPointCloudLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    if (this.props.getPosition !== undefined) {
      const geometryColumn = this.props.getPosition;
      if (geometryColumn !== undefined && ga.data.isPointData(geometryColumn)) {
        return this._renderPointLayer(geometryColumn);
      }

      throw new Error("getPosition should pass in an arrow Data of Point type");
    } else {
      const pointData = getGeometryData(batch, EXTENSION_NAME.POINT);
      if (pointData !== null && ga.data.isPointData(pointData)) {
        return this._renderPointLayer(pointData);
      }
    }

    throw new Error("getPosition not GeoArrow point");
  }

  _renderPointLayer(
    geometryData: ga.data.PointData,
  ): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    if (this.props._validate) {
      assert(
        ga.data.isPointData(geometryData),
        "The geometry column is not a valid PointVector.",
      );
      assert(
        geometryData.type.listSize === 3,
        "Points of a PointCloudLayer in the geometry column must be three-dimensional.",
      );
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

    const props: PointCloudLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-pointcloud`,
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
    return new PointCloudLayer(this.getSubLayerProps(props));
  }
}

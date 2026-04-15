// deck.gl-community
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type { HeatmapLayerProps } from "@deck.gl/aggregation-layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type {
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
} from "@deck.gl/core";
import { assert, CompositeLayer } from "@deck.gl/core";
import * as ga from "@geoarrow/geoarrow-js";
import type * as arrow from "apache-arrow";
import { EXTENSION_NAME } from "../constants";
import type { FloatAccessor } from "../types";
import {
  assignAccessor,
  convertStructToFixedSizeList,
  extractAccessorsFromProps,
  getGeometryData,
  isGeomSeparate,
} from "../utils/utils";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowHeatmapLayer */
export type GeoArrowHeatmapLayerProps = Omit<
  HeatmapLayerProps,
  "data" | "getPosition" | "getWeight"
> &
  _GeoArrowHeatmapLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowHeatmapLayer */
type _GeoArrowHeatmapLayerProps = {
  data: arrow.RecordBatch;

  /**
   * Method called to retrieve the position of each object.
   *
   * @default d => d.position
   */
  getPosition?: ga.data.PointData;

  /**
   * The weight of each object.
   *
   * @default 1
   */
  getWeight?: FloatAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._defaultProps
} = HeatmapLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowHeatmapLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowHeatmapLayer<
  ExtraProps extends object = Record<string, never>,
> extends CompositeLayer<GeoArrowHeatmapLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowHeatmapLayer";

  renderLayers(): Layer<object> | LayersList | null {
    const { data: batch } = this.props;

    if (this.props.getPosition !== undefined) {
      const geometryData = this.props.getPosition;
      if (geometryData !== undefined && ga.data.isPointData(geometryData)) {
        return this._renderPointLayer(geometryData);
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
  ): Layer<object> | LayersList | null {
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

    const props: HeatmapLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-heatmap`,
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

    return new HeatmapLayer(this.getSubLayerProps(props));
  }
}

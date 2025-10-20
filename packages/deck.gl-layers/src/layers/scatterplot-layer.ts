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
import { ScatterplotLayer } from "@deck.gl/layers";
import type { ScatterplotLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  convertStructToFixedSizeList,
  extractAccessorsFromProps,
  getGeometryData,
  invertOffsets,
  isGeomSeparate,
} from "../utils/utils";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { EXTENSION_NAME } from "../constants";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowScatterplotLayer */
export type GeoArrowScatterplotLayerProps = Omit<
  ScatterplotLayerProps<arrow.RecordBatch>,
  | "data"
  | "getPosition"
  | "getRadius"
  | "getFillColor"
  | "getLineColor"
  | "getLineWidth"
> &
  _GeoArrowScatterplotLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowScatterplotLayer */
type _GeoArrowScatterplotLayerProps = {
  data: arrow.RecordBatch;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Center position accessor.
   * If not provided, will be inferred by finding a column with extension type
   * `"geoarrow.point"` or `"geoarrow.multipoint"`.
   */
  getPosition?: ga.data.PointData | ga.data.MultiPointData;
  /**
   * Radius accessor.
   * @default 1
   */
  getRadius?: FloatAccessor;
  /**
   * Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;
  /**
   * Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;
  /**
   * Stroke width accessor.
   * @default 1
   */
  getLineWidth?: FloatAccessor;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._upstreamDefaultProps
} = ScatterplotLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowScatterplotLayerProps> = {
  ..._upstreamDefaultProps,
  ...ourDefaultProps,
};

export class GeoArrowScatterplotLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowScatterplotLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowScatterplotLayer";

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
      const geometryData = this.props.getPosition;
      if (geometryData !== undefined && ga.data.isPointData(geometryData)) {
        return this._renderPointLayer(geometryData);
      }

      if (
        geometryData !== undefined &&
        ga.data.isMultiPointData(geometryData)
      ) {
        return this._renderMultiPointLayer(geometryData);
      }

      throw new Error(
        "getPosition should pass in an arrow Data of Point or MultiPoint type",
      );
    } else {
      const pointData = getGeometryData(batch, EXTENSION_NAME.POINT);
      if (pointData !== null && ga.data.isPointData(pointData)) {
        return this._renderPointLayer(pointData);
      }

      const multiPointData = getGeometryData(batch, EXTENSION_NAME.MULTIPOINT);
      if (multiPointData !== null && ga.data.isMultiPointData(multiPointData)) {
        return this._renderMultiPointLayer(multiPointData);
      }
    }

    throw new Error("getPosition not GeoArrow point or multipoint");
  }

  _renderPointLayer(geometryData: ga.data.PointData): Layer | null {
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

    const props: ScatterplotLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-scatterplot-point`,
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

    return new ScatterplotLayer(this.getSubLayerProps(props));
  }

  _renderMultiPointLayer(
    multiPointData: ga.data.MultiPointData,
  ): Layer<{}> | null {
    const { data: batch } = this.props;

    // TODO: validate that if nested, accessor props have the same nesting
    // structure as the main geometry column.
    if (this.props._validate) {
      assert(ga.data.isMultiPointData(multiPointData));
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
    ]);

    let pointData = ga.child.getMultiPointChild(multiPointData);
    if (isGeomSeparate(pointData)) {
      pointData = convertStructToFixedSizeList(pointData);
    }
    const geomOffsets = multiPointData.valueOffsets;
    const flatCoordsData = ga.child.getPointChild(pointData);
    const flatCoordinateArray = flatCoordsData.values;

    const props: ScatterplotLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-scatterplot-multipoint`,
      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: batch,
        // Map from expanded multi-geometry index to original index
        // Used both in picking and for function callbacks
        invertedGeomOffsets: invertOffsets(geomOffsets),
        // Note: this needs to be the length one level down.
        length: pointData.length,
        attributes: {
          getPosition: {
            value: flatCoordinateArray,
            size: pointData.type.listSize,
          },
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

    return new ScatterplotLayer(this.getSubLayerProps(props));
  }
}

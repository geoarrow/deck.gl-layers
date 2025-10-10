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
} from "@deck.gl/core";
import type { H3HexagonLayerProps } from "@deck.gl/geo-layers";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import * as arrow from "apache-arrow";

import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { assignAccessor, extractAccessorsFromProps } from "../utils/utils";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowH3HexagonLayer */
export type GeoArrowH3HexagonLayerProps = Omit<
  H3HexagonLayerProps,
  | "data"
  | "getHexagon"
  | "getFillColor"
  | "getLineColor"
  | "getLineWidth"
  | "getElevation"
> &
  _GeoArrowH3HexagonLayerProps &
  // Omit<GeoArrowPolygonLayerProps, "getPolygon"> &
  CompositeLayerProps;

/** Props added by the GeoArrowH3HexagonLayer */
type _GeoArrowH3HexagonLayerProps = {
  data: arrow.RecordBatch;

  /**
   * Called for each data object to retrieve the quadkey string identifier.
   */
  getHexagon: arrow.Data<arrow.Utf8 | arrow.Uint64>;

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

// Remove data from the upstream default props
const {
  data: _data,
  getHexagon: _getHexagon,
  ..._defaultProps
} = H3HexagonLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error getFillColor
const defaultProps: DefaultProps<GeoArrowH3HexagonLayerProps> = {
  // ..._polygonDefaultProps,
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowH3HexagonLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowH3HexagonLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowH3HexagonLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    return this._renderLayer();
  }

  _renderLayer(): Layer<{}> | LayersList | null {
    const { data: batch, getHexagon: hexData } = this.props;

    if (this.props._validate) {
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getHexagon",
    ]);
    const hexVector = new arrow.Vector([hexData]);

    const props: H3HexagonLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-arc`,

      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: batch,
        length: hexData.length,
      },
      // Unfortunately we must load back to pure JS strings
      getHexagon: (_, objectInfo) => {
        const value = hexVector.get(objectInfo.index)!;
        if (typeof value === "string") {
          return value;
        } else {
          return value.toString(16);
        }
      },
    };

    for (const [propName, propInput] of Object.entries(accessors)) {
      assignAccessor({
        props,
        propName,
        propInput,
      });
    }

    return new H3HexagonLayer(this.getSubLayerProps(props));
  }
}

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
import type { A5LayerProps } from "@deck.gl/geo-layers";
import { A5Layer } from "@deck.gl/geo-layers";
import * as arrow from "apache-arrow";

import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { assignAccessor, extractAccessorsFromProps } from "../utils/utils";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowA5Layer */
export type GeoArrowA5LayerProps = Omit<
  A5LayerProps,
  | "data"
  | "getPentagon"
  | "getFillColor"
  | "getLineColor"
  | "getLineWidth"
  | "getElevation"
> &
  _GeoArrowA5LayerProps &
  // Omit<GeoArrowPolygonLayerProps, "getPolygon"> &
  CompositeLayerProps;

/** Props added by the GeoArrowA5Layer */
type _GeoArrowA5LayerProps = {
  data: arrow.RecordBatch;

  /**
   * Called for each data object to retrieve the quadkey string identifier.
   */
  getPentagon: arrow.Data<arrow.Utf8 | arrow.Uint64>;

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
  getPentagon: _getPentagon,
  ..._defaultProps
} = A5Layer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error getFillColor
const defaultProps: DefaultProps<GeoArrowA5LayerProps> = {
  // ..._polygonDefaultProps,
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowA5Layer<ExtraProps extends {} = {}> extends CompositeLayer<
  GeoArrowA5LayerProps & ExtraProps
> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowA5Layer";

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
    const { data: batch, getPentagon } = this.props;

    if (this.props._validate) {
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPentagon",
    ]);
    const pentagonVector = new arrow.Vector([getPentagon]);

    const props: A5LayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-a5`,

      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: batch,
        length: batch.numRows,
      },
      // We must load back to pure JS strings / bigint
      getPentagon: (_, objectInfo) => {
        return pentagonVector.get(objectInfo.index)!;
      },
    };

    for (const [propName, propInput] of Object.entries(accessors)) {
      assignAccessor({
        props,
        propName,
        propInput,
      });
    }

    return new A5Layer(this.getSubLayerProps(props));
  }
}

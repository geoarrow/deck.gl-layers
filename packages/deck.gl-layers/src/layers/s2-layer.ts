import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
} from "@deck.gl/core";
import type { S2LayerProps } from "@deck.gl/geo-layers";
import { S2Layer } from "@deck.gl/geo-layers";
import * as arrow from "apache-arrow";

import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { assignAccessor, extractAccessorsFromProps } from "../utils/utils";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowS2Layer */
export type GeoArrowS2LayerProps = Omit<
  S2LayerProps,
  | "data"
  | "getS2Token"
  | "getFillColor"
  | "getLineColor"
  | "getLineWidth"
  | "getElevation"
> &
  _GeoArrowS2LayerProps &
  // Omit<GeoArrowPolygonLayerProps, "getPolygon"> &
  CompositeLayerProps;

/** Props added by the GeoArrowS2Layer */
type _GeoArrowS2LayerProps = {
  data: arrow.RecordBatch;

  /**
   * Called for each data object to retrieve the quadkey string identifier.
   */
  getS2Token: arrow.Data<arrow.Utf8 | arrow.Uint64>;

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
  getS2Token: _getPentagon,
  ..._defaultProps
} = S2Layer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error getFillColor
const defaultProps: DefaultProps<GeoArrowS2LayerProps> = {
  // ..._polygonDefaultProps,
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowS2Layer<ExtraProps extends {} = {}> extends CompositeLayer<
  GeoArrowS2LayerProps & ExtraProps
> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowS2Layer";

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
    const { data: batch, getS2Token } = this.props;

    if (this.props._validate) {
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getS2Token",
    ]);
    const s2Vector = new arrow.Vector([getS2Token]);

    const props: S2LayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-S2`,

      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: batch,
        length: batch.numRows,
      },
      // We must load back to pure JS strings / bigint
      getS2Token: (_, objectInfo) => {
        const value = s2Vector.get(objectInfo.index)!;
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

    return new S2Layer(this.getSubLayerProps(props));
  }
}

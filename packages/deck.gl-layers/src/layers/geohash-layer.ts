import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
} from "@deck.gl/core";
import type { GeohashLayerProps } from "@deck.gl/geo-layers";
import { GeohashLayer } from "@deck.gl/geo-layers";
import * as arrow from "apache-arrow";

import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { assignAccessor, extractAccessorsFromProps } from "../utils/utils";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowGeohashLayer */
export type GeoArrowGeohashLayerProps = Omit<
  GeohashLayerProps,
  | "data"
  | "getGeohash"
  | "getFillColor"
  | "getLineColor"
  | "getLineWidth"
  | "getElevation"
> &
  _GeoArrowGeohashLayerProps &
  // Omit<GeoArrowPolygonLayerProps, "getPolygon"> &
  CompositeLayerProps;

/** Props added by the GeoArrowGeohashLayer */
type _GeoArrowGeohashLayerProps = {
  data: arrow.RecordBatch;

  /**
   * Called for each data object to retrieve the quadkey string identifier.
   */
  getGeohash: arrow.Data<arrow.Utf8>;

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
  // @ts-expect-error https://github.com/visgl/deck.gl/issues/9854
  data: _data,
  getGeohash: _getGeohash,
  ..._defaultProps
} = GeohashLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// Type errors from https://github.com/visgl/deck.gl/issues/9854
// // @ts-expect-error getFillColor
const defaultProps: DefaultProps<GeoArrowGeohashLayerProps> = {
  // ..._polygonDefaultProps,
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowGeohashLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowGeohashLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowGeohashLayer";

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
    const { data: batch, getGeohash } = this.props;

    if (this.props._validate) {
      validateAccessors(this.props, batch);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getGeohash",
    ]);
    const GeohashVector = new arrow.Vector([getGeohash]);

    const props: GeohashLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      // type errors from https://github.com/visgl/deck.gl/issues/9854
      // @ts-expect-error until above issue fixed.
      id: `${this.props.id}-geoarrow-geohash`,

      data: {
        // type errors from https://github.com/visgl/deck.gl/issues/9854
        // // @ts-expect-error passed through to enable use by function accessors
        data: batch,
        length: batch.numRows,
      },
      // We must load back to pure JS strings / bigint
      getGeohash: (_, objectInfo) => {
        return GeohashVector.get(objectInfo.index)!;
      },
    };

    for (const [propName, propInput] of Object.entries(accessors)) {
      assignAccessor({
        props,
        propName,
        propInput,
      });
    }

    return new GeohashLayer(this.getSubLayerProps(props));
  }
}

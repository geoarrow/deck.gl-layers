import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core";
import { IconLayer } from "@deck.gl/layers";
import type { IconLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
  invertOffsets,
} from "./utils.js";
import {
  GeoArrowExtraPickingProps,
  computeChunkOffsets,
  getPickingInfo,
} from "./picking.js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors } from "./validate.js";

/** All properties supported by GeoArrowScatterplotLayer */
export type GeoArrowIconLayerProps = Omit<
  IconLayerProps<arrow.Table>,
  "data" | "getPosition" | "getRadius" | "getFillColor" | "getLineColor" | "iconAtlas" | "iconMapping"
> &
  _GeoArrowIconLayerPropsProps &
  CompositeLayerProps;

/** Properties added by GeoArrowScatterplotLayer */
type _GeoArrowIconLayerPropsProps = {
  data: arrow.Table;

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
  getPosition?: ga.vector.PointVector | ga.vector.MultiPointVector;
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
} = IconLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowIconLayerProps> = {
  ..._upstreamDefaultProps,
  ...ourDefaultProps,
};

export class GeoArrowIconLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowIconLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowIconLayerProps";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props.getPosition !== undefined) {
      const geometryColumn = this.props.getPosition;
      if (
        geometryColumn !== undefined &&
        ga.vector.isPointVector(geometryColumn)
      ) {
        return this._renderLayersPoint(geometryColumn);
      }

      throw new Error(
        "getPosition should pass in an arrow Vector of Point",
      );

    } else {
      const pointVector = getGeometryVector(table, EXTENSION_NAME.POINT);
      if (pointVector !== null) {
        return this._renderLayersPoint(pointVector);
      }
    }

    throw new Error("getPosition not GeoArrow point");
  }

  _renderLayersPoint(
    geometryColumn: ga.vector.PointVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      assert(ga.vector.isPointVector(geometryColumn));
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
    ]);
    const tableOffsets = computeChunkOffsets(table.data);

    const layers: IconLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = ga.child.getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: IconLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,
        tableOffsets,

        id: `${this.props.id}-geoarrow-iconlayer-${recordBatchIdx}`,
        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
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
          chunkIdx: recordBatchIdx,
        });
      }

      
      // @ts-expect-error iconAtlas is an async prop
      const iconAtlas=this.props.iconAtlasUrlConfig
      // @ts-expect-error iconMapping is an async prop
      const iconMapping=this.props.iconMapping
      const props_={...this.getSubLayerProps(props), iconAtlas, iconMapping }
      const layer = new IconLayer(props_);
      layers.push(layer);
    }

    return layers;
  }
}

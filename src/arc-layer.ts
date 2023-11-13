import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
} from "@deck.gl/core/typed";
import { ArcLayer } from "@deck.gl/layers/typed";
import type { ArcLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getPointChild,
} from "./utils.js";
import { getPickingInfo } from "./picking.js";
import {
  ColorAccessor,
  FloatAccessor,
  GeoArrowPickingInfo,
  PointVector,
} from "./types.js";
import { validateAccessors, validatePointType } from "./validate.js";

/** All properties supported by GeoArrowArcLayer */
export type GeoArrowArcLayerProps = Omit<
  ArcLayerProps,
  | "data"
  | "getSourcePosition"
  | "getTargetPosition"
  | "getSourceColor"
  | "getTargetColor"
  | "getWidth"
  | "getHeight"
  | "getTilt"
> &
  _GeoArrowArcLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowArcLayer */
type _GeoArrowArcLayerProps = {
  data: arrow.Table;

  /**
   * Method called to retrieve the source position of each object.
   */
  getSourcePosition: PointVector;

  /**
   * Method called to retrieve the target position of each object.
   */
  getTargetPosition: PointVector;

  /**
   * The rgba color is in the format of `[r, g, b, [a]]`.
   * @default [0, 0, 0, 255]
   */
  getSourceColor?: ColorAccessor;

  /**
   * The rgba color is in the format of `[r, g, b, [a]]`.
   * @default [0, 0, 0, 255]
   */
  getTargetColor?: ColorAccessor;

  /**
   * The line width of each object, in units specified by `widthUnits`.
   * @default 1
   */
  getWidth?: FloatAccessor;

  /**
   * Multiplier of layer height. `0` will make the layer flat.
   * @default 1
   */
  getHeight?: FloatAccessor;

  /**
   * Use to tilt the arc to the side if you have multiple arcs with the same source and target positions.
   * @default 0
   */
  getTilt?: FloatAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data from the upstream default props
const {
  data: _data,
  getSourcePosition: _getSourcePosition,
  getTargetPosition: _getTargetPosition,
  ..._defaultProps
} = ArcLayer.defaultProps;

const defaultProps: DefaultProps<GeoArrowArcLayerProps> = {
  ..._defaultProps,
  _validate: true,
};

export class GeoArrowArcLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowArcLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowArcLayer";

  getPickingInfo(params: GetPickingInfoParams): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    return this._renderLayersPoint();
  }

  _renderLayersPoint(): Layer<{}> | LayersList | null {
    const {
      data: table,
      getSourcePosition: sourcePosition,
      getTargetPosition: targetPosition,
    } = this.props;

    if (this.props._validate) {
      validateAccessors(this.props, table);

      // Note: below we iterate over table batches anyways, so this layer won't
      // work as-is if data/table is null
      validatePointType(sourcePosition.type);
      validatePointType(targetPosition.type);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getSourcePosition",
      "getTargetPosition",
    ]);

    const layers: ArcLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const sourceData = sourcePosition.data[recordBatchIdx];
      const sourceValues = getPointChild(sourceData).values;
      const targetData = targetPosition.data[recordBatchIdx];
      const targetValues = getPointChild(targetData).values;

      const props: ArcLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in defaultProps as the default in this
        // props object
        ...defaultProps,
        ...otherProps,

        // @ts-expect-error used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-arc-${recordBatchIdx}`,
        data: {
          length: sourceData.length,
          attributes: {
            getSourcePosition: {
              value: sourceValues,
              size: sourceData.type.listSize,
            },
            getTargetPosition: {
              value: targetValues,
              size: targetData.type.listSize,
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

      const layer = new ArcLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

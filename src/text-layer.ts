import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
} from "@deck.gl/core/typed";
import { TextLayer } from "@deck.gl/layers/typed";
import type { TextLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
  getPointChild,
  isPointVector,
} from "./utils.js";
import { getPickingInfo } from "./picking.js";
import {
  ColorAccessor,
  FloatAccessor,
  GeoArrowPickingInfo,
  PointVector,
} from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors, validatePointType } from "./validate.js";

/** All properties supported by GeoArrowTextLayer */
export type GeoArrowTextLayerProps = Omit<
  TextLayerProps<arrow.Table>,
  // We remove background for now because there are special requirements for
  // using binary attributes with background
  // https://deck.gl/docs/api-reference/layers/text-layer#use-binary-attributes-with-background
  | "background"
  | "data"
  | "getBackgroundColor"
  | "getBorderColor"
  | "getBorderWidth"
  | "getText"
  | "getPosition"
  | "getColor"
  | "getSize"
  | "getAngle"
  | "getTextAnchor"
  | "getAlignmentBaseline"
  | "getPixelOffset"
> &
  _GeoArrowTextLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowTextLayer */
type _GeoArrowTextLayerProps = {
  data: arrow.Table;

  /** Background color accessor.
   * @default [255, 255, 255, 255]
   */
  getBackgroundColor?: ColorAccessor;
  /** Border color accessor.
   * @default [0, 0, 0, 255]
   */
  getBorderColor?: ColorAccessor;
  /** Border width accessor.
   * @default 0
   */
  getBorderWidth?: FloatAccessor;
  /**
   * Label text accessor
   */
  getText: arrow.Vector<arrow.Utf8>;
  /**
   * Anchor position accessor
   */
  getPosition?: PointVector;
  /**
   * Label color accessor
   * @default [0, 0, 0, 255]
   */
  getColor?: ColorAccessor;
  /**
   * Label size accessor
   * @default 32
   */
  getSize?: FloatAccessor;
  /**
   * Label rotation accessor, in degrees
   * @default 0
   */
  getAngle?: FloatAccessor;
  /**
   * Horizontal alignment accessor
   * @default 'middle'
   */
  getTextAnchor?: arrow.Vector<arrow.Utf8> | "start" | "middle" | "end";
  /**
   * Vertical alignment accessor
   * @default 'center'
   */
  getAlignmentBaseline?: arrow.Vector<arrow.Utf8> | "top" | "center" | "bottom";
  /**
   * Label offset from the anchor position, [x, y] in pixels
   * @default [0, 0]
   */
  getPixelOffset?:
    | arrow.Vector<arrow.FixedSizeList<arrow.Int>>
    | [number, number];

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
  getText: _getText,
  getTextAnchor: _getTextAnchor,
  getAlignmentBaseline: _getAlignmentBaseline,
  getPixelOffset: _getPixelOffset,
  ..._defaultProps
} = TextLayer.defaultProps;

const defaultProps: DefaultProps<GeoArrowTextLayerProps> = {
  ..._defaultProps,
  getTextAnchor: "middle",
  getAlignmentBaseline: "center",
  getPixelOffset: [0, 0],
  _validate: true,
};

export class GeoArrowTextLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowTextLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowTextLayer";

  getPickingInfo(params: GetPickingInfoParams): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const pointVector = getGeometryVector(table, EXTENSION_NAME.POINT);
    if (pointVector !== null) {
      return this._renderLayersPoint(pointVector);
    }

    const geometryColumn = this.props.getPosition;
    if (isPointVector(geometryColumn)) {
      return this._renderLayersPoint(geometryColumn);
    }

    throw new Error("geometryColumn not point");
  }

  _renderLayersPoint(
    geometryColumn: PointVector
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      validatePointType(geometryColumn.type);
      validateAccessors(this.props, table);
    }

    const layers: TextLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;
      const textData = this.props.getText.data[recordBatchIdx];
      const textValues = textData.values;

      // Exclude manually-set accessors
      const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
        "getPosition",
        "getText",
      ]);

      const props: TextLayerProps = {
        ...otherProps,

        // @ts-expect-error used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-heatmap-${recordBatchIdx}`,
        data: {
          length: geometryData.length,
          attributes: {
            getPosition: {
              value: flatCoordinateArray,
              size: geometryData.type.listSize,
            },
            // TODO: support non-ascii characters
            getText: {
              value: textValues,
              size: 1,
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

      const layer = new TextLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

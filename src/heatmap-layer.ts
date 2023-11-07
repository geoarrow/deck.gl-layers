import {
  Color,
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
} from "@deck.gl/core/typed";
import { HeatmapLayer } from "@deck.gl/aggregation-layers/typed";
import type { HeatmapLayerProps } from "@deck.gl/aggregation-layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  getPointChild,
  isPointVector,
  validatePointType,
  validateVectorAccessors,
} from "./utils.js";
import { FloatAccessor, PointVector } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";

const defaultColorRange: [number, number, number][] = [
  [255, 255, 178],
  [254, 217, 118],
  [254, 178, 76],
  [253, 141, 60],
  [240, 59, 32],
  [189, 0, 38],
];

/** All properties supported by GeoArrowHeatmapLayer */
export type GeoArrowHeatmapLayerProps = _GeoArrowHeatmapLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowHeatmapLayer */
type _GeoArrowHeatmapLayerProps = {
  data?: arrow.Table;

  /**
   * Radius of the circle in pixels, to which the weight of an object is distributed.
   *
   * @default 30
   */
  radiusPixels?: number;

  /**
   * Specified as an array of colors [color1, color2, ...].
   *
   * @default `6-class YlOrRd` - [colorbrewer](http://colorbrewer2.org/#type=sequential&scheme=YlOrRd&n=6)
   */
  colorRange?: Color[];

  /**
   * Value that is multiplied with the total weight at a pixel to obtain the final weight.
   *
   * @default 1
   */
  intensity?: number;

  /**
   * Ratio of the fading weight to the max weight, between `0` and `1`.
   *
   * For example, `0.1` affects all pixels with weight under 10% of the max.
   *
   * Ignored when `colorDomain` is specified.
   * @default 0.05
   */
  threshold?: number;

  /**
   * Controls how weight values are mapped to the `colorRange`, as an array of two numbers [`minValue`, `maxValue`].
   *
   * @default null
   */
  colorDomain?: [number, number] | null;

  /**
   * Defines the type of aggregation operation
   *
   * V valid values are 'SUM', 'MEAN'.
   *
   * @default 'SUM'
   */
  aggregation?: "SUM" | "MEAN";

  /**
   * Specifies the size of weight texture.
   * @default 2048
   */
  weightsTextureSize?: number;

  /**
   * Interval in milliseconds during which changes to the viewport don't trigger aggregation.
   *
   * @default 500
   */
  debounceTimeout?: number;

  /**
   * Method called to retrieve the position of each object.
   *
   * @default d => d.position
   */
  getPosition?: PointVector;

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

const defaultProps: DefaultProps<GeoArrowHeatmapLayerProps> = {
  _validate: true,

  getWeight: { type: "accessor", value: 1 },
  intensity: { type: "number", min: 0, value: 1 },
  radiusPixels: { type: "number", min: 1, max: 100, value: 50 },
  colorRange: defaultColorRange,
  threshold: { type: "number", min: 0, max: 1, value: 0.05 },
  colorDomain: { type: "array", value: null, optional: true },
  // 'SUM' or 'MEAN'
  aggregation: "SUM",
  weightsTextureSize: { type: "number", min: 128, max: 2048, value: 2048 },
  debounceTimeout: { type: "number", min: 0, max: 1000, value: 500 },
};

export class GeoArrowHeatmapLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowHeatmapLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowHeatmapLayer";

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
      const vectorAccessors: arrow.Vector[] = [geometryColumn];
      for (const accessor of [this.props.getWeight]) {
        if (accessor instanceof arrow.Vector) {
          vectorAccessors.push(accessor);
        }
      }

      validatePointType(geometryColumn.type);
      validateVectorAccessors(table, vectorAccessors);
    }

    const layers: HeatmapLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: HeatmapLayerProps = {
        // @ts-expect-error used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-heatmap-${recordBatchIdx}`,

        radiusPixels: this.props.radiusPixels,
        colorRange: this.props.colorRange,
        intensity: this.props.intensity,
        threshold: this.props.threshold,
        colorDomain: this.props.colorDomain,
        aggregation: this.props.aggregation,
        weightsTextureSize: this.props.weightsTextureSize,
        debounceTimeout: this.props.debounceTimeout,
        data: {
          length: geometryData.length,
          attributes: {
            getPosition: {
              value: flatCoordinateArray,
              size: geometryData.type.listSize,
            },
          },
        },
      };

      assignAccessor({
        props,
        propName: "getWeight",
        propInput: this.props.getWeight,
        chunkIdx: recordBatchIdx,
      });

      const layer = new HeatmapLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

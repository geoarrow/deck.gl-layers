import {
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

/** All properties supported by GeoArrowHeatmapLayer */
export type GeoArrowHeatmapLayerProps = Omit<
  HeatmapLayerProps,
  "getPosition" | "getWeight"
> &
  _GeoArrowHeatmapLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowHeatmapLayer */
type _GeoArrowHeatmapLayerProps = {
  data?: arrow.Table;

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

// Remove data from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._defaultProps
} = HeatmapLayer.defaultProps;

const defaultProps: DefaultProps<GeoArrowHeatmapLayerProps> = {
  ..._defaultProps,
  _validate: true,
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

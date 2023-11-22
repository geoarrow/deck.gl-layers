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
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
} from "./utils.js";
import { FloatAccessor } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors, validatePointType } from "./validate.js";

/** All properties supported by GeoArrowHeatmapLayer */
export type GeoArrowHeatmapLayerProps = Omit<
  HeatmapLayerProps,
  "data" | "getPosition" | "getWeight"
> &
  _GeoArrowHeatmapLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowHeatmapLayer */
type _GeoArrowHeatmapLayerProps = {
  data: arrow.Table;

  /**
   * Method called to retrieve the position of each object.
   *
   * @default d => d.position
   */
  getPosition?: ga.vector.PointVector;

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

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

const defaultProps: DefaultProps<GeoArrowHeatmapLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowHeatmapLayer<
  ExtraProps extends {} = {},
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
    if (ga.vector.isPointVector(geometryColumn)) {
      return this._renderLayersPoint(geometryColumn);
    }

    throw new Error("geometryColumn not point");
  }

  _renderLayersPoint(
    geometryColumn: ga.vector.PointVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      validatePointType(geometryColumn.type);
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
    ]);

    const layers: HeatmapLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = ga.child.getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: HeatmapLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
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

      const layer = new HeatmapLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

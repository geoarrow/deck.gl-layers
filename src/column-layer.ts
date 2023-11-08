import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
} from "@deck.gl/core/typed";
import { ColumnLayer } from "@deck.gl/layers/typed";
import type { ColumnLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  getPointChild,
  isPointVector,
  validateColorVector,
  validatePointType,
  validateVectorAccessors,
} from "./utils.js";
import {
  ColorAccessor,
  FloatAccessor,
  GeoArrowPickingInfo,
  PointVector,
} from "./types.js";
import { EXTENSION_NAME } from "./constants.js";

/** All properties supported by GeoArrowColumnLayer */
export type GeoArrowColumnLayerProps = Omit<
  ColumnLayerProps<arrow.Table>,
  | "getPosition"
  | "getFillColor"
  | "getLineColor"
  | "getElevation"
  | "getLineWidth"
> &
  _GeoArrowColumnLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowColumnLayer */
type _GeoArrowColumnLayerProps = {
  data: arrow.Table;

  /**
   * Method called to retrieve the position of each column.
   * @default object => object.position
   */
  getPosition?: PointVector;

  /**
   * Fill color value or accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;

  /**
   * Line color value or accessor.
   *
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;

  /**
   * The elevation of each cell in meters.
   * @default 1000
   */
  getElevation?: FloatAccessor;

  /**
   * The width of the outline of the column, in units specified by `lineWidthUnits`.
   *
   * @default 1
   */
  getLineWidth?: FloatAccessor;

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
  ..._defaultProps
} = ColumnLayer.defaultProps;

const defaultProps: DefaultProps<GeoArrowColumnLayerProps> = {
  ..._defaultProps,
  _validate: true,
};

/**
 * Render extruded cylinders (tessellated regular polygons) at given
 * coordinates.
 */
export class GeoArrowColumnLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowColumnLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowColumnLayer";

  getPickingInfo({
    info,
    sourceLayer,
  }: GetPickingInfoParams): GeoArrowPickingInfo {
    const { data: table } = this.props;

    // Geometry index as rendered
    let index = info.index;

    // @ts-expect-error `recordBatchIdx` is manually set on layer props
    const recordBatchIdx: number = sourceLayer.props.recordBatchIdx;
    const batch = table.batches[recordBatchIdx];
    const row = batch.get(index);

    // @ts-expect-error hack: using private method to avoid recomputing via
    // batch lengths on each iteration
    const offsets: number[] = table._offsets;
    const currentBatchOffset = offsets[recordBatchIdx];

    // Update index to be _global_ index, not within the specific record batch
    index += currentBatchOffset;
    return {
      ...info,
      index,
      object: row,
    };
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
      const vectorAccessors: arrow.Vector[] = [geometryColumn];
      for (const accessor of [
        this.props.getFillColor,
        this.props.getLineColor,
        this.props.getLineWidth,
        this.props.getElevation,
      ]) {
        if (accessor instanceof arrow.Vector) {
          vectorAccessors.push(accessor);
        }
      }

      validatePointType(geometryColumn.type);
      validateVectorAccessors(table, vectorAccessors);

      if (this.props.getFillColor instanceof arrow.Vector) {
        validateColorVector(this.props.getFillColor);
      }
      if (this.props.getLineColor instanceof arrow.Vector) {
        validateColorVector(this.props.getLineColor);
      }
    }

    const layers: ColumnLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: ColumnLayerProps = {
        // @ts-expect-error used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-column-${recordBatchIdx}`,

        diskResolution: this.props.diskResolution,
        radius: this.props.radius,
        angle: this.props.angle,
        vertices: this.props.vertices,
        offset: this.props.offset,
        coverage: this.props.coverage,
        elevationScale: this.props.elevationScale,
        filled: this.props.filled,
        stroked: this.props.stroked,
        extruded: this.props.extruded,
        wireframe: this.props.wireframe,
        flatShading: this.props.flatShading,
        radiusUnits: this.props.radiusUnits,
        lineWidthUnits: this.props.lineWidthUnits,
        lineWidthScale: this.props.lineWidthScale,
        lineWidthMinPixels: this.props.lineWidthMinPixels,
        lineWidthMaxPixels: this.props.lineWidthMaxPixels,
        material: this.props.material,

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
        propName: "getFillColor",
        propInput: this.props.getFillColor,
        chunkIdx: recordBatchIdx,
      });
      assignAccessor({
        props,
        propName: "getLineColor",
        propInput: this.props.getLineColor,
        chunkIdx: recordBatchIdx,
      });
      assignAccessor({
        props,
        propName: "getElevation",
        propInput: this.props.getElevation,
        chunkIdx: recordBatchIdx,
      });
      assignAccessor({
        props,
        propName: "getLineWidth",
        propInput: this.props.getLineWidth,
        chunkIdx: recordBatchIdx,
      });

      const layer = new ColumnLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  Material,
  Position,
  Unit,
} from "@deck.gl/core/typed";
import { ColumnLayer } from "@deck.gl/layers/typed";
import type { ColumnLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  getMultiPointChild,
  getPointChild,
  invertOffsets,
  isMultiPointVector,
  isPointVector,
  validateColorVector,
  validateMultiPointType,
  validatePointType,
  validateVectorAccessors,
} from "./utils.js";
import {
  ColorAccessor,
  FloatAccessor,
  GeoArrowPickingInfo,
  MultiPointVector,
  PointVector,
} from "./types.js";
import { EXTENSION_NAME } from "./constants.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowColumnLayer */
export type GeoArrowColumnLayerProps = _GeoArrowColumnLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowColumnLayer */
type _GeoArrowColumnLayerProps = {
  data: arrow.Table;

  /**
   * The number of sides to render the disk as.
   * @default 20
   */
  diskResolution?: number;

  /**
   * isk size in units specified by `radiusUnits`.
   * @default 1000
   */
  radius?: number;

  /**
   * Disk rotation, counter-clockwise in degrees.
   * @default 0
   */
  angle?: number;

  /**
   * Replace the default geometry (regular polygon that fits inside the unit circle) with a custom one.
   * @default null
   */
  vertices: Position[] | null;

  /**
   * Disk offset from the position, relative to the radius.
   * @default [0,0]
   */
  offset?: [number, number];

  /**
   * Radius multiplier, between 0 - 1
   * @default 1
   */
  coverage?: number;

  /**
   * Column elevation multiplier.
   * @default 1
   */
  elevationScale?: number;

  /**
   * Whether to draw a filled column (solid fill).
   * @default true
   */
  filled?: boolean;

  /**
   * Whether to draw an outline around the disks.
   * @default false
   */
  stroked?: boolean;

  /**
   * Whether to extrude the columns. If set to `false`, all columns will be rendered as flat polygons.
   * @default true
   */
  extruded?: boolean;

  /**
   * Whether to generate a line wireframe of the column.
   * @default false
   */
  wireframe?: boolean;

  /**
   * If `true`, the vertical surfaces of the columns use [flat shading](https://en.wikipedia.org/wiki/Shading#Flat_vs._smooth_shading).
   * @default false
   */
  flatShading?: boolean;

  /**
   * The units of the radius.
   * @default 'meters'
   */
  radiusUnits?: Unit;

  /**
   * The units of the line width.
   * @default 'meters'
   */
  lineWidthUnits?: Unit;

  /**
   * The line width multiplier that multiplied to all outlines.
   * @default 1
   */
  lineWidthScale?: number;

  /**
   * The minimum outline width in pixels.
   * @default 0
   */
  lineWidthMinPixels?: number;

  /**
   * The maximum outline width in pixels.
   * @default Number.MAX_SAFE_INTEGER
   */
  lineWidthMaxPixels?: number;

  /**
   * Material settings for lighting effect. Applies if `extruded: true`.
   *
   * @default true
   * @see https://deck.gl/docs/developer-guide/using-lighting
   */
  material?: Material;

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

const defaultProps: DefaultProps<GeoArrowColumnLayerProps> = {
  diskResolution: { type: "number", min: 4, value: 20 },
  vertices: null,
  radius: { type: "number", min: 0, value: 1000 },
  angle: { type: "number", value: 0 },
  offset: { type: "array", value: [0, 0] },
  coverage: { type: "number", min: 0, max: 1, value: 1 },
  elevationScale: { type: "number", min: 0, value: 1 },
  radiusUnits: "meters",
  lineWidthUnits: "meters",
  lineWidthScale: 1,
  lineWidthMinPixels: 0,
  lineWidthMaxPixels: Number.MAX_SAFE_INTEGER,

  extruded: true,
  wireframe: false,
  filled: true,
  stroked: false,
  flatShading: false,

  getFillColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineWidth: { type: "accessor", value: 1 },
  getElevation: { type: "accessor", value: 1000 },
  material: true,

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

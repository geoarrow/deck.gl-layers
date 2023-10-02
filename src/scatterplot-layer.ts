import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  Unit,
} from "@deck.gl/core/typed";
import { ScatterplotLayer } from "@deck.gl/layers/typed";
import type { ScatterplotLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  validateColorVector,
  validatePointType,
  validateVectorAccessors,
} from "./utils.js";
import { PointVector } from "./types.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowScatterplotLayer */
export type GeoArrowScatterplotLayerProps = _GeoArrowScatterplotLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowScatterplotLayer */
type _GeoArrowScatterplotLayerProps = {
  data: arrow.Table;

  /**
   * The units of the radius, one of `'meters'`, `'common'`, and `'pixels'`.
   * @default 'meters'
   */
  radiusUnits?: Unit;
  /**
   * Radius multiplier.
   * @default 1
   */
  radiusScale?: number;
  /**
   * The minimum radius in pixels. This prop can be used to prevent the circle from getting too small when zoomed out.
   * @default 0
   */
  radiusMinPixels?: number;
  /**
   * The maximum radius in pixels. This prop can be used to prevent the circle from getting too big when zoomed in.
   * @default Number.MAX_SAFE_INTEGER
   */
  radiusMaxPixels?: number;

  /**
   * The units of the stroke width, one of `'meters'`, `'common'`, and `'pixels'`.
   * @default 'meters'
   */
  lineWidthUnits?: Unit;
  /**
   * Stroke width multiplier.
   * @default 1
   */
  lineWidthScale?: number;
  /**
   * The minimum stroke width in pixels. This prop can be used to prevent the line from getting too thin when zoomed out.
   * @default 0
   */
  lineWidthMinPixels?: number;
  /**
   * The maximum stroke width in pixels. This prop can be used to prevent the circle from getting too thick when zoomed in.
   * @default Number.MAX_SAFE_INTEGER
   */
  lineWidthMaxPixels?: number;

  /**
   * Draw the outline of points.
   * @default false
   */
  stroked?: boolean;
  /**
   * Draw the filled area of points.
   * @default true
   */
  filled?: boolean;
  /**
   * If `true`, rendered circles always face the camera. If `false` circles face up (i.e. are parallel with the ground plane).
   * @default false
   */
  billboard?: boolean;
  /**
   * If `true`, circles are rendered with smoothed edges. If `false`, circles are rendered with rough edges. Antialiasing can cause artifacts on edges of overlapping circles.
   * @default true
   */
  antialiasing?: boolean;
  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Center position accessor.
   * If not provided, will be inferred by finding a column with extension type
   * `"geoarrow.point"`
   */
  getPosition?: PointVector;
  /**
   * Radius accessor.
   * @default 1
   */
  getRadius?: arrow.Vector<arrow.Float> | Accessor<arrow.Table, number>;
  /**
   * Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?:
    | arrow.Vector<arrow.FixedSizeList<arrow.Uint8>>
    | Accessor<arrow.Table, Color>;
  /**
   * Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?:
    | arrow.Vector<arrow.FixedSizeList<arrow.Uint8>>
    | Accessor<arrow.Table, Color>;
  /**
   * Stroke width accessor.
   * @default 1
   */
  getLineWidth?: arrow.Vector<arrow.Float> | Accessor<arrow.Table, number>;
};

const defaultProps: DefaultProps<GeoArrowScatterplotLayerProps> = {
  radiusUnits: "meters",
  radiusScale: { type: "number", min: 0, value: 1 },
  radiusMinPixels: { type: "number", min: 0, value: 0 }, //  min point radius in pixels
  radiusMaxPixels: { type: "number", min: 0, value: Number.MAX_SAFE_INTEGER }, // max point radius in pixels

  lineWidthUnits: "meters",
  lineWidthScale: { type: "number", min: 0, value: 1 },
  lineWidthMinPixels: { type: "number", min: 0, value: 0 },
  lineWidthMaxPixels: {
    type: "number",
    min: 0,
    value: Number.MAX_SAFE_INTEGER,
  },

  stroked: false,
  filled: true,
  billboard: false,
  antialiasing: true,
  _validate: true,

  getRadius: { type: "accessor", value: 1 },
  getFillColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineWidth: { type: "accessor", value: 1 },
};

export class GeoArrowScatterplotLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowScatterplotLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowScatterplotLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const geometryColumn =
      this.props.getPosition || getGeometryVector(table, "geoarrow.point");

    if (this.props._validate) {
      const vectorAccessors: arrow.Vector[] = [geometryColumn];
      for (const accessor of [
        this.props.getRadius,
        this.props.getFillColor,
        this.props.getLineColor,
        this.props.getLineWidth,
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

    const layers: ScatterplotLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const coordsArray = geometryData.children[0].values;

      const props: ScatterplotLayerProps = {
        id: `${this.props.id}-geoarrow-scatterplot-${recordBatchIdx}`,
        radiusUnits: this.props.radiusUnits,
        radiusScale: this.props.radiusScale,
        radiusMinPixels: this.props.radiusMinPixels,
        radiusMaxPixels: this.props.radiusMaxPixels,
        lineWidthUnits: this.props.lineWidthUnits,
        lineWidthScale: this.props.lineWidthScale,
        lineWidthMinPixels: this.props.lineWidthMinPixels,
        lineWidthMaxPixels: this.props.lineWidthMaxPixels,
        stroked: this.props.stroked,
        filled: this.props.filled,
        billboard: this.props.billboard,
        antialiasing: this.props.antialiasing,
        data: {
          length: geometryData.length,
          attributes: {
            getPosition: { value: coordsArray, size: 2 },
          },
        },
      };

      assignAccessor({
        props,
        propName: "getRadius",
        propInput: this.props.getRadius,
        chunkIdx: recordBatchIdx,
      });
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
        propName: "getLineWidth",
        propInput: this.props.getLineWidth,
        chunkIdx: recordBatchIdx,
      });

      const layer = new ScatterplotLayer(props);
      layers.push(layer);
    }

    return layers;
  }
}

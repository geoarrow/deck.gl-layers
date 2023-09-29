import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  Unit,
  assert,
} from "@deck.gl/core/typed";
import { ScatterplotLayer, ScatterplotLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import { assignAccessor, findGeometryColumnIndex } from "./utils.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowPointLayer */
export type GeoArrowPointLayerProps = _GeoArrowPointLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPointLayer */
export type _GeoArrowPointLayerProps = {
  data: arrow.Table;

  /**
   * The name of the geometry column in the Arrow table. If not passed, expects
   * the geometry column to have the extension type `geoarrow.point`.
   */
  geometryColumnName?: string;

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
   * Radius accessor.
   * @default 1
   */
  getRadius?: string | Accessor<arrow.Table, number>;
  /**
   * Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: string | Accessor<arrow.Table, Color>;
  /**
   * Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: string | Accessor<arrow.Table, Color>;
  /**
   * Stroke width accessor.
   * @default 1
   */
  getLineWidth?: string | Accessor<arrow.Table, number>;
};

const defaultProps: DefaultProps<GeoArrowPointLayerProps> = {
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

  getRadius: { type: "accessor", value: 1 },
  getFillColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineWidth: { type: "accessor", value: 1 },
};

export class GeoArrowPointLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowPointLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPointLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data } = this.props;

    // TODO: add validation before the loop

    const geometryColumnIdx = findGeometryColumnIndex(
      data.schema,
      "geoarrow.point",
      this.props.geometryColumnName
    );
    if (geometryColumnIdx === null) {
      console.warn("No geoarrow.point column found; pass geometryColumnName.");
      return null;
    }

    const layers: ScatterplotLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < data.batches.length;
      recordBatchIdx++
    ) {
      const recordBatch = data.batches[recordBatchIdx];

      const geometryColumn = recordBatch.getChildAt(geometryColumnIdx);
      assert(geometryColumn.data.length === 1);

      const geometryData = geometryColumn.data[0];
      assert(arrow.DataType.isFixedSizeList(geometryData));
      assert(geometryData.children.length === 1);

      const coordsArray = geometryData.children[0].values;

      const props: ScatterplotLayerProps = {
        id: `${this.props.id}-geoarrow-point-${recordBatchIdx}`,
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
          length: recordBatch.numRows,
          attributes: {
            getPosition: { value: coordsArray, size: 2 },
          },
        },
      };

      assignAccessor({
        props,
        propName: "getRadius",
        propInput: this.props.getRadius,
        recordBatch,
      });
      assignAccessor({
        props,
        propName: "getFillColor",
        propInput: this.props.getFillColor,
        recordBatch,
      });
      assignAccessor({
        props,
        propName: "getLineColor",
        propInput: this.props.getLineColor,
        recordBatch,
      });
      assignAccessor({
        props,
        propName: "getLineWidth",
        propInput: this.props.getLineWidth,
        recordBatch,
      });

      const layer = new ScatterplotLayer(props);
      layers.push(layer);
    }

    return layers;
  }
}

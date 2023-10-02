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
import { PathLayer, PathLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  validateColorVector,
  validateLineStringType,
  validateVectorAccessors,
} from "./utils.js";
import { LineStringVector } from "./types.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowPathLayer */
export type GeoArrowPathLayerProps = _GeoArrowPathLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPathLayer */
export type _GeoArrowPathLayerProps = {
  data: arrow.Table;

  /** The units of the line width, one of `'meters'`, `'common'`, and `'pixels'`
   * @default 'meters'
   */
  widthUnits?: Unit;
  /**
   * Path width multiplier.
   * @default 1
   */
  widthScale?: number;
  /**
   * The minimum path width in pixels. This prop can be used to prevent the path from getting too thin when zoomed out.
   * @default 0
   */
  widthMinPixels?: number;
  /**
   * The maximum path width in pixels. This prop can be used to prevent the path from getting too thick when zoomed in.
   * @default Number.MAX_SAFE_INTEGER
   */
  widthMaxPixels?: number;
  /**
   * Type of joint. If `true`, draw round joints. Otherwise draw miter joints.
   * @default false
   */
  jointRounded?: boolean;
  /**
   * Type of caps. If `true`, draw round caps. Otherwise draw square caps.
   * @default false
   */
  capRounded?: boolean;
  /**
   * The maximum extent of a joint in ratio to the stroke width. Only works if `jointRounded` is `false`.
   * @default 4
   */
  miterLimit?: number;
  /**
   * If `true`, extrude the path in screen space (width always faces the camera).
   * If `false`, the width always faces up (z).
   * @default false
   */
  billboard?: boolean;
  /**
   * (Experimental) If `'loop'` or `'open'`, will skip normalizing the coordinates returned by `getPath` and instead assume all paths are to be loops or open paths.
   * When normalization is disabled, paths must be specified in the format of flat array. Open paths must contain at least 2 vertices and closed paths must contain at least 3 vertices.
   * @default null
   */
  _pathType?: null | "loop" | "open";
  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Path geometry accessor.
   */
  getPath?: LineStringVector;
  /**
   * Path color accessor.
   * @default [0, 0, 0, 255]
   */
  getColor?: string | Accessor<arrow.Table, Color | Color[]>;
  /**
   * Path width accessor.
   * @default 1
   */
  getWidth?: string | Accessor<arrow.Table, number | number[]>;
};

const defaultProps: DefaultProps<GeoArrowPathLayerProps> = {
  widthUnits: "meters",
  widthScale: { type: "number", min: 0, value: 1 },
  widthMinPixels: { type: "number", min: 0, value: 0 },
  widthMaxPixels: { type: "number", min: 0, value: Number.MAX_SAFE_INTEGER },
  jointRounded: false,
  capRounded: false,
  miterLimit: { type: "number", min: 0, value: 4 },
  billboard: false,
  // Note: this diverges from upstream, where here we _default into_ binary
  // rendering
  // This instructs the layer to skip normalization and use the binary
  // as-is
  _pathType: "open",

  getColor: { type: "accessor", value: DEFAULT_COLOR },
  getWidth: { type: "accessor", value: 1 },
};

/**
 * Render lists of coordinate points as extruded polylines with mitering.
 */
export class GeoArrowPathLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowPathLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPathLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const geometryColumn =
      this.props.getPath || getGeometryVector(table, "geoarrow.linestring");

    if (this.props._validate) {
      const vectorAccessors: arrow.Vector[] = [geometryColumn];
      for (const accessor of [this.props.getColor, this.props.getWidth]) {
        if (accessor instanceof arrow.Vector) {
          vectorAccessors.push(accessor);
        }
      }

      validateLineStringType(geometryColumn.type);
      validateVectorAccessors(table, vectorAccessors);

      if (this.props.getColor instanceof arrow.Vector) {
        validateColorVector(this.props.getColor);
      }
    }

    const layers: PathLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[0];
      const geomOffsets = geometryData.valueOffsets;
      const coordsArray = geometryData.children[0].children[0].values;

      const props: PathLayerProps = {
        id: `${this.props.id}-geoarrow-linestring-${recordBatchIdx}`,
        widthUnits: this.props.widthUnits,
        widthScale: this.props.widthScale,
        widthMinPixels: this.props.widthMinPixels,
        widthMaxPixels: this.props.widthMaxPixels,
        jointRounded: this.props.jointRounded,
        capRounded: this.props.capRounded,
        miterLimit: this.props.miterLimit,
        billboard: this.props.billboard,
        _pathType: this.props._pathType,
        data: {
          length: geometryData.length,
          // @ts-ignore
          startIndices: geomOffsets,
          attributes: {
            getPath: { value: coordsArray, size: 2 },
          },
        },
      };

      assignAccessor({
        props,
        propName: "getColor",
        propInput: this.props.getColor,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: geomOffsets,
      });
      assignAccessor({
        props,
        propName: "getWidth",
        propInput: this.props.getWidth,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: geomOffsets,
      });

      const layer = new PathLayer(props);
      layers.push(layer);
    }

    return layers;
  }
}

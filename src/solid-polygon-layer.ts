import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  Material,
  DefaultProps,
  Layer,
  LayersList,
} from "@deck.gl/core/typed";
import { SolidPolygonLayer } from "@deck.gl/layers/typed";
import type { SolidPolygonLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  validateColorVector,
  validatePolygonType,
  validateVectorAccessors,
} from "./utils.js";
import { PolygonVector } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowSolidPolygonLayer */
export type GeoArrowSolidPolygonLayerProps = _GeoArrowSolidPolygonLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowSolidPolygonLayer */
type _GeoArrowSolidPolygonLayerProps = {
  data: arrow.Table;

  /** Whether to fill the polygons
   * @default true
   */
  filled?: boolean;
  /** Whether to extrude the polygons
   * @default false
   */
  extruded?: boolean;
  /** Whether to generate a line wireframe of the polygon.
   * @default false
   */
  wireframe?: boolean;
  /**
   * (Experimental) If `false`, will skip normalizing the coordinates returned by `getPolygon`.
   * @default true
   */
  _normalize?: boolean;
  /**
   * (Experimental) This prop is only effective with `_normalize: false`.
   * It specifies the winding order of rings in the polygon data, one of 'CW' (clockwise) and 'CCW' (counter-clockwise)
   */
  _windingOrder?: "CW" | "CCW";

  /**
   * (Experimental) This prop is only effective with `XYZ` data.
   * When true, polygon tesselation will be performed on the plane with the largest area, instead of the xy plane.
   * @default false
   */
  _full3d?: boolean;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;

  /** Elevation multiplier.
   * @default 1
   */
  elevationScale?: number;

  /** Polygon geometry accessor. */
  getPolygon?: PolygonVector;

  /** Extrusion height accessor.
   * @default 1000
   */
  getElevation?: arrow.Vector<arrow.Float> | Accessor<arrow.Table, number>;
  /** Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?:
    | arrow.Vector<arrow.FixedSizeList<arrow.Uint8>>
    | Accessor<arrow.Table, Color>;
  /** Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?:
    | arrow.Vector<arrow.FixedSizeList<arrow.Uint8>>
    | Accessor<arrow.Table, Color>;

  /**
   * Material settings for lighting effect. Applies if `extruded: true`
   *
   * @default true
   * @see https://deck.gl/docs/developer-guide/using-lighting
   */
  material?: Material;
};

const defaultProps: DefaultProps<GeoArrowSolidPolygonLayerProps> = {
  filled: true,
  extruded: false,
  wireframe: false,
  // Note: this diverges from upstream, where here we default to no
  // normalization
  _normalize: false,
  // Note: this diverges from upstream, where here we default to CCW
  _windingOrder: "CCW",
  _full3d: false,
  _validate: true,

  elevationScale: { type: "number", min: 0, value: 1 },

  getElevation: { type: "accessor", value: 1000 },
  getFillColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineColor: { type: "accessor", value: DEFAULT_COLOR },

  material: true,
};

export class GeoArrowSolidPolygonLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<
  Required<GeoArrowSolidPolygonLayerProps> & ExtraProps
> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowSolidPolygonLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const geometryColumn: PolygonVector =
      this.props.getPolygon || getGeometryVector(table, EXTENSION_NAME.POLYGON);

    if (this.props._validate) {
      const vectorAccessors: arrow.Vector[] = [geometryColumn];
      for (const accessor of [
        this.props.getElevation,
        this.props.getFillColor,
        this.props.getLineColor,
      ]) {
        if (accessor instanceof arrow.Vector) {
          vectorAccessors.push(accessor);
        }
      }

      validatePolygonType(geometryColumn.type);
      validateVectorAccessors(table, vectorAccessors);

      if (this.props.getFillColor instanceof arrow.Vector) {
        validateColorVector(this.props.getFillColor);
      }
      if (this.props.getLineColor instanceof arrow.Vector) {
        validateColorVector(this.props.getLineColor);
      }
    }

    const layers: SolidPolygonLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const nDim = geometryData.type.children[0].type.children[0].type.listSize;
      const geomOffsets = geometryData.valueOffsets;
      const ringOffsets = geometryData.children[0].valueOffsets;
      const flatCoordinateArray =
        geometryData.children[0].children[0].children[0].values;

      const resolvedRingOffsets = new Int32Array(geomOffsets.length);
      for (let i = 0; i < resolvedRingOffsets.length; ++i) {
        // Perform the lookup into the ringIndices array using the geomOffsets
        // array
        resolvedRingOffsets[i] = ringOffsets[geomOffsets[i]];
      }

      const props: SolidPolygonLayerProps = {
        id: `${this.props.id}-geoarrow-point-${recordBatchIdx}`,
        filled: this.props.filled,
        extruded: this.props.extruded,
        wireframe: this.props.wireframe,
        _normalize: this.props._normalize,
        _windingOrder: this.props._windingOrder,
        _full3d: this.props._full3d,
        elevationScale: this.props.elevationScale,
        material: this.props.material,
        data: {
          // Number of geometries
          length: geometryData.length,
          // Offsets into coordinateArray where each polygon starts
          // @ts-ignore
          startIndices: resolvedRingOffsets,
          attributes: {
            getPolygon: { value: flatCoordinateArray, size: nDim },
          },
        },
      };

      assignAccessor({
        props,
        propName: "getElevation",
        propInput: this.props.getElevation,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: resolvedRingOffsets,
      });
      assignAccessor({
        props,
        propName: "getFillColor",
        propInput: this.props.getFillColor,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: resolvedRingOffsets,
      });
      assignAccessor({
        props,
        propName: "getLineColor",
        propInput: this.props.getLineColor,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: resolvedRingOffsets,
      });

      const layer = new SolidPolygonLayer(props);
      layers.push(layer);
    }

    return layers;
  }
}

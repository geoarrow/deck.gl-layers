import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  Material,
  DefaultProps,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core/typed";
import {
  SolidPolygonLayer,
  SolidPolygonLayerProps,
} from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import { assignAccessor, findGeometryColumnIndex } from "./utils.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowPolygonLayer */
export type GeoArrowPolygonLayerProps = _GeoArrowPolygonLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPolygonLayer */
export type _GeoArrowPolygonLayerProps = {
  data: arrow.Table;

  /**
   * The name of the geometry column in the Arrow table. If not passed, expects
   * the geometry column to have the extension type `geoarrow.polygon`.
   */
  geometryColumnName?: string;

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

  /** Elevation multiplier.
   * @default 1
   */
  elevationScale?: number;

  /** Extrusion height accessor.
   * @default 1000
   */
  getElevation?: string | Accessor<arrow.Table, number>;
  /** Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: string | Accessor<arrow.Table, Color>;
  /** Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: string | Accessor<arrow.Table, Color>;

  /**
   * Material settings for lighting effect. Applies if `extruded: true`
   *
   * @default true
   * @see https://deck.gl/docs/developer-guide/using-lighting
   */
  material?: Material;
};

const defaultProps: DefaultProps<GeoArrowPolygonLayerProps> = {
  filled: true,
  extruded: false,
  wireframe: false,
  // Note: this diverges from upstream, where here we default to no
  // normalization
  _normalize: false,
  // Note: this diverges from upstream, where here we default to CCW
  _windingOrder: "CCW",
  _full3d: false,

  elevationScale: { type: "number", min: 0, value: 1 },

  // getPolygon: { type: "accessor", value: (f) => f.polygon },
  getElevation: { type: "accessor", value: 1000 },
  getFillColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineColor: { type: "accessor", value: DEFAULT_COLOR },

  material: true,
};

export class GeoArrowPolygonLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowPolygonLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPolygonLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data } = this.props;

    const geometryColumnIdx = findGeometryColumnIndex(
      data.schema,
      "geoarrow.polygon"
    );
    if (geometryColumnIdx === null) {
      console.warn("No geoarrow.polygon column found.");
      return null;
    }

    const layers: SolidPolygonLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < data.batches.length;
      recordBatchIdx++
    ) {
      const recordBatch = data.batches[recordBatchIdx];

      const geometryColumn = recordBatch.getChildAt(geometryColumnIdx);
      assert(geometryColumn.data.length === 1);

      // TODO: only make assertions once on schema, not on data
      const geometryData = geometryColumn.data[0];
      assert(arrow.DataType.isList(geometryData));

      const geomOffsets = geometryData.valueOffsets;
      assert(geometryData.children.length === 1);
      assert(arrow.DataType.isList(geometryData.children[0]));

      const ringOffsets = geometryData.children[0].valueOffsets;
      assert(geometryData.children[0].children.length === 1);
      assert(
        arrow.DataType.isFixedSizeList(geometryData.children[0].children[0])
      );

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
          length: recordBatch.numRows,
          // Offsets into coordinateArray where each polygon starts
          // @ts-ignore
          startIndices: resolvedRingOffsets,
          attributes: {
            getPolygon: { value: flatCoordinateArray, size: 2 },
          },
        },
      };

      assignAccessor({
        props,
        propName: "getElevation",
        propInput: this.props.getElevation,
        recordBatch,
        geomCoordOffsets: resolvedRingOffsets,
      });
      assignAccessor({
        props,
        propName: "getFillColor",
        propInput: this.props.getFillColor,
        recordBatch,
        geomCoordOffsets: resolvedRingOffsets,
      });
      assignAccessor({
        props,
        propName: "getLineColor",
        propInput: this.props.getLineColor,
        recordBatch,
        geomCoordOffsets: resolvedRingOffsets,
      });

      const layer = new SolidPolygonLayer(props);
      layers.push(layer);
    }

    return layers;
  }
}

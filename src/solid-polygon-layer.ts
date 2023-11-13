import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  GetPickingInfoParams,
} from "@deck.gl/core/typed";
import { SolidPolygonLayer } from "@deck.gl/layers/typed";
import type { SolidPolygonLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
  getLineStringChild,
  getMultiPolygonChild,
  getMultiPolygonResolvedOffsets,
  getPointChild,
  getPolygonChild,
  getPolygonResolvedOffsets,
  invertOffsets,
  isMultiPolygonVector,
  isPolygonVector,
} from "./utils.js";
import { getPickingInfo } from "./picking.js";
import {
  ColorAccessor,
  FloatAccessor,
  GeoArrowPickingInfo,
  MultiPolygonVector,
  PolygonVector,
} from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { earcutPolygonArray } from "./earcut.js";
import {
  validateAccessors,
  validateMultiPolygonType,
  validatePolygonType,
} from "./validate.js";

/** All properties supported by GeoArrowSolidPolygonLayer */
export type GeoArrowSolidPolygonLayerProps = Omit<
  SolidPolygonLayerProps,
  "data" | "getPolygon" | "getElevation" | "getFillColor" | "getLineColor"
> &
  _GeoArrowSolidPolygonLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowSolidPolygonLayer */
type _GeoArrowSolidPolygonLayerProps = {
  data: arrow.Table;

  /** Polygon geometry accessor. */
  getPolygon?: PolygonVector | MultiPolygonVector;

  /** Extrusion height accessor.
   * @default 1000
   */
  getElevation?: FloatAccessor;
  /** Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;
  /** Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data from the upstream default props
const {
  data: _data,
  getPolygon: _getPolygon,
  ..._defaultProps
} = SolidPolygonLayer.defaultProps;

// Default props added by us
const ourDefaultProps: Pick<
  GeoArrowSolidPolygonLayerProps,
  "_normalize" | "_windingOrder" | "_validate"
> = {
  // Note: this diverges from upstream, where here we default to no
  // normalization
  _normalize: false,
  // Note: this diverges from upstream, where here we default to CCW
  _windingOrder: "CCW",

  _validate: true,
};

const defaultProps: DefaultProps<GeoArrowSolidPolygonLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowSolidPolygonLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<
  Required<GeoArrowSolidPolygonLayerProps> & ExtraProps
> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowSolidPolygonLayer";

  getPickingInfo(params: GetPickingInfoParams): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const polygonVector = getGeometryVector(table, EXTENSION_NAME.POLYGON);
    if (polygonVector !== null) {
      return this._renderLayersPolygon(polygonVector);
    }

    const MultiPolygonVector = getGeometryVector(
      table,
      EXTENSION_NAME.MULTIPOLYGON
    );
    if (MultiPolygonVector !== null) {
      return this._renderLayersMultiPolygon(MultiPolygonVector);
    }

    const geometryColumn = this.props.getPolygon;
    if (isPolygonVector(geometryColumn)) {
      return this._renderLayersPolygon(geometryColumn);
    }

    if (isMultiPolygonVector(geometryColumn)) {
      return this._renderLayersMultiPolygon(geometryColumn);
    }

    throw new Error("geometryColumn not Polygon or MultiPolygon");
  }

  _renderLayersPolygon(
    geometryColumn: PolygonVector
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      validatePolygonType(geometryColumn.type);
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPolygon",
    ]);

    const layers: SolidPolygonLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const polygonData = geometryColumn.data[recordBatchIdx];
      const ringData = getPolygonChild(polygonData);
      const pointData = getLineStringChild(ringData);
      const coordData = getPointChild(pointData);

      const nDim = pointData.type.listSize;

      // const geomOffsets = polygonData.valueOffsets;
      // const ringOffsets = ringData.valueOffsets;
      const flatCoordinateArray = coordData.values;

      const resolvedRingOffsets = getPolygonResolvedOffsets(polygonData);

      const earcutTriangles = earcutPolygonArray(polygonData);

      const props: SolidPolygonLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-point-${recordBatchIdx}`,
        data: {
          // Number of geometries
          length: polygonData.length,
          // Offsets into coordinateArray where each polygon starts
          // @ts-ignore
          startIndices: resolvedRingOffsets,
          attributes: {
            getPolygon: { value: flatCoordinateArray, size: nDim },
            indices: { value: earcutTriangles, size: 1 },
          },
        },
      };

      for (const [propName, propInput] of Object.entries(accessors)) {
        assignAccessor({
          props,
          propName,
          propInput,
          chunkIdx: recordBatchIdx,
          geomCoordOffsets: resolvedRingOffsets,
        });
      }

      const layer = new SolidPolygonLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }

  _renderLayersMultiPolygon(
    geometryColumn: MultiPolygonVector
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      validateMultiPolygonType(geometryColumn.type);
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPolygon",
    ]);

    const layers: SolidPolygonLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const multiPolygonData = geometryColumn.data[recordBatchIdx];
      const polygonData = getMultiPolygonChild(multiPolygonData);
      const ringData = getPolygonChild(polygonData);
      const pointData = getLineStringChild(ringData);
      const coordData = getPointChild(pointData);

      const nDim = pointData.type.listSize;

      const geomOffsets = multiPolygonData.valueOffsets;
      // const polygonOffsets = polygonData.valueOffsets;
      // const ringOffsets = ringData.valueOffsets;
      const flatCoordinateArray = coordData.values;

      const earcutTriangles = earcutPolygonArray(polygonData);

      // NOTE: we have two different uses of offsets. One is for _rendering_
      // each polygon. The other is for mapping _accessor attributes_ from one
      // value per feature to one value per vertex. And for that we need to use
      // these offsets in two different ways.
      //
      // TODO: Don't construct the offsets twice from scratch? I.e. from the
      // polygon-to-coord offsets you should be able to infer the
      // multi-polygon-to-coord offsets? Or something like that
      const resolvedPolygonToCoordOffsets =
        getPolygonResolvedOffsets(polygonData);

      const resolvedMultiPolygonToCoordOffsets =
        getMultiPolygonResolvedOffsets(multiPolygonData);

      const props: SolidPolygonLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,
        invertedGeomOffsets: invertOffsets(geomOffsets),

        id: `${this.props.id}-geoarrow-point-${recordBatchIdx}`,
        data: {
          // Number of polygons
          // Note: this needs to be the length one level down, because we're
          // rendering the polygons, not the multipolygons
          length: polygonData.length,
          // Offsets into coordinateArray where each single-polygon starts
          //
          // Note that this is polygonToCoordOffsets and not geomToCoordOffsets
          // because we're rendering each part of the MultiPolygon individually
          // @ts-expect-error
          startIndices: resolvedPolygonToCoordOffsets,
          attributes: {
            getPolygon: { value: flatCoordinateArray, size: nDim },
            indices: { value: earcutTriangles, size: 1 },
            // instancePickingColors: {
            //   value: encodePickingColors(
            //     resolvedMultiPolygonToCoordOffsets,
            //     this.encodePickingColor
            //   ),
            //   size: 3,
            // },
          },
        },
      };

      for (const [propName, propInput] of Object.entries(accessors)) {
        assignAccessor({
          props,
          propName,
          propInput,
          chunkIdx: recordBatchIdx,
          geomCoordOffsets: resolvedMultiPolygonToCoordOffsets,
        });
      }

      const layer = new SolidPolygonLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

function encodePickingColors(
  geomToCoordOffsets: Int32Array,
  encodePickingColor: (id: number, result: number[]) => void
): Uint8ClampedArray {
  const largestOffset = geomToCoordOffsets[geomToCoordOffsets.length - 1];
  const pickingColors = new Uint8ClampedArray(largestOffset);

  const pickingColor = [];
  for (let arrayIdx = 0; arrayIdx < geomToCoordOffsets.length - 1; arrayIdx++) {
    const thisOffset = geomToCoordOffsets[arrayIdx];
    const nextOffset = geomToCoordOffsets[arrayIdx + 1];

    // Note: we encode the picking color once per _feature_, but then assign it
    // to the color array once per _vertex_
    encodePickingColor(arrayIdx, pickingColor);
    for (let offset = thisOffset; offset < nextOffset; offset++) {
      pickingColors[offset * 3] = pickingColor[0];
      pickingColors[offset * 3 + 1] = pickingColor[1];
      pickingColors[offset * 3 + 2] = pickingColor[2];
    }
  }

  return pickingColors;
}

import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  GetPickingInfoParams,
  assert,
  LayerContext,
  UpdateParameters,
} from "@deck.gl/core/typed";
import { SolidPolygonLayer } from "@deck.gl/layers/typed";
import type { SolidPolygonLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
  getMultiPolygonResolvedOffsets,
  getPolygonResolvedOffsets,
  invertOffsets,
} from "./utils.js";
import { getPickingInfo } from "./picking.js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { DEFAULT_COLOR, EXTENSION_NAME } from "./constants.js";
import { validateAccessors } from "./validate.js";
import { spawn, Transfer, BlobWorker, Pool } from "threads";
import type { EarcutOnWorker } from "./workers/earcut-worker.js";

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
  getPolygon?: ga.vector.PolygonVector | ga.vector.MultiPolygonVector;

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

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowSolidPolygonLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowSolidPolygonLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<
  Required<GeoArrowSolidPolygonLayerProps> & ExtraProps
> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowSolidPolygonLayer";

  declare state: CompositeLayer["state"] & {
    table: arrow.Table | null;
    triangles: Uint32Array[] | null;
  };

  initializeState(_context: LayerContext): void {
    this.state = {
      table: null,
      triangles: null,
    };
  }

  async updateData() {
    const { data: table } = this.props;
    const earcutTriangles = await this._updateEarcut(table);
    this.setState({ table: this.props.data, triangles: earcutTriangles });
  }

  async _updateEarcut(table: arrow.Table): Promise<Uint32Array[]> {
    const polygonVector = getGeometryVector(table, EXTENSION_NAME.POLYGON);
    if (polygonVector !== null) {
      return this._earcutPolygonVector(polygonVector);
    }

    const MultiPolygonVector = getGeometryVector(
      table,
      EXTENSION_NAME.MULTIPOLYGON,
    );
    if (MultiPolygonVector !== null) {
      return this._earcutMultiPolygonVector(MultiPolygonVector);
    }

    const geometryColumn = this.props.getPolygon;
    if (ga.vector.isPolygonVector(geometryColumn)) {
      return this._earcutPolygonVector(geometryColumn);
    }

    if (ga.vector.isMultiPolygonVector(geometryColumn)) {
      return this._earcutMultiPolygonVector(geometryColumn);
    }

    throw new Error("geometryColumn not Polygon or MultiPolygon");
  }

  async _earcutPolygonVector(
    geometryColumn: ga.vector.PolygonVector,
  ): Promise<Uint32Array[]> {
    console.log("spawning worker");

    const workerTextResp = await fetch(
      this.props.workerUrl || "http://localhost:8082/earcut-worker.js",
    );
    const workerText = await workerTextResp.text();
    const worker =  BlobWorker.fromText(workerText);

    const pool = Pool(
      () => spawn(BlobWorker.fromText(workerText)),
      8 /* optional size */,
    );


    // const earcutWorker = await spawn(worker);
    console.log("spawned worker");
    console.log(pool);
    // console.log(earcutWorker);
    // if (!earcutWorker) return;

    const resultPromises = new Array(geometryColumn.data.length);
    const result: Uint32Array[] = new Array(geometryColumn.data.length);

    for (
      let recordBatchIdx = 0;
      recordBatchIdx < geometryColumn.data.length;
      recordBatchIdx++
    ) {
      const polygonData = geometryColumn.data[recordBatchIdx];
      const [preparedPolygonData, arrayBuffers] = ga.worker.preparePostMessage(
        polygonData,
        true,
      );
      pool.queue(async earcutWorker => {
        const earcutTriangles = await earcutWorker(
          Transfer(preparedPolygonData, arrayBuffers),
        );
        result[recordBatchIdx] = earcutTriangles;
      })
      // const earcutTriangles = await earcutWorker(
      //   Transfer(preparedPolygonData, arrayBuffers),
      // );
      // result[recordBatchIdx] = earcutTriangles;
    }
    console.log(result);

    await pool.completed();
    await pool.terminate();

    return result;
  }

  async _earcutMultiPolygonVector(
    geometryColumn: ga.vector.MultiPolygonVector,
  ): Promise<Uint32Array[]> {
    throw new Error("tmp");
  }

  updateState({ props, changeFlags }: UpdateParameters<this>): void {
    console.log("updateState");
    if (changeFlags.dataChanged) {
      this.updateData();
    }
  }

  getPickingInfo(params: GetPickingInfoParams): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { table } = this.state;
    if (!table) return null;

    const polygonVector = getGeometryVector(table, EXTENSION_NAME.POLYGON);
    if (polygonVector !== null) {
      return this._renderLayersPolygon(polygonVector);
    }

    const MultiPolygonVector = getGeometryVector(
      table,
      EXTENSION_NAME.MULTIPOLYGON,
    );
    if (MultiPolygonVector !== null) {
      return this._renderLayersMultiPolygon(MultiPolygonVector);
    }

    const geometryColumn = this.props.getPolygon;
    if (ga.vector.isPolygonVector(geometryColumn)) {
      return this._renderLayersPolygon(geometryColumn);
    }

    if (ga.vector.isMultiPolygonVector(geometryColumn)) {
      return this._renderLayersMultiPolygon(geometryColumn);
    }

    throw new Error("geometryColumn not Polygon or MultiPolygon");
  }

  _renderLayersPolygon(
    geometryColumn: ga.vector.PolygonVector,
  ): Layer<{}> | LayersList | null {
    const { table } = this.state;
    if (!table) return null;

    if (this.props._validate) {
      assert(ga.vector.isPolygonVector(geometryColumn));
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
      const ringData = ga.child.getPolygonChild(polygonData);
      const pointData = ga.child.getLineStringChild(ringData);
      const coordData = ga.child.getPointChild(pointData);

      const nDim = pointData.type.listSize;

      // const geomOffsets = polygonData.valueOffsets;
      // const ringOffsets = ringData.valueOffsets;
      const flatCoordinateArray = coordData.values;

      const resolvedRingOffsets = getPolygonResolvedOffsets(polygonData);

      // const earcutTriangles = ga.algorithm.earcut(polygonData);
      if (!this.state.triangles) {
        return null;
      }

      const earcutTriangles = this.state.triangles[recordBatchIdx];

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
    geometryColumn: ga.vector.MultiPolygonVector,
  ): Layer<{}> | LayersList | null {
    const { table } = this.state;
    if (!table) return null;

    if (this.props._validate) {
      assert(ga.vector.isMultiPolygonVector(geometryColumn));
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
      const polygonData = ga.child.getMultiPolygonChild(multiPolygonData);
      const ringData = ga.child.getPolygonChild(polygonData);
      const pointData = ga.child.getLineStringChild(ringData);
      const coordData = ga.child.getPointChild(pointData);

      const nDim = pointData.type.listSize;

      const geomOffsets = multiPolygonData.valueOffsets;
      // const polygonOffsets = polygonData.valueOffsets;
      // const ringOffsets = ringData.valueOffsets;
      const flatCoordinateArray = coordData.values;

      // const earcutTriangles = ga.algorithm.earcut(polygonData);
      if (!this.state.triangles) {
        return null;
      }

      const earcutTriangles = this.state.triangles[recordBatchIdx];

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
  encodePickingColor: (id: number, result: number[]) => void,
): Uint8ClampedArray {
  const largestOffset = geomToCoordOffsets[geomToCoordOffsets.length - 1];
  const pickingColors = new Uint8ClampedArray(largestOffset);

  const pickingColor: number[] = [];
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

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
} from "@deck.gl/core";
import { SolidPolygonLayer } from "@deck.gl/layers";
import type { SolidPolygonLayerProps } from "@deck.gl/layers";
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
import {
  GeoArrowExtraPickingProps,
  computeChunkOffsets,
  getPickingInfo,
} from "./picking.js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors } from "./validate.js";
import { spawn, Transfer, BlobWorker, Pool } from "threads";
import type { FunctionThread } from "threads";

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

  /**
   * URL to worker that performs earcut triangulation.
   *
   * By default this loads from the jsdelivr CDN, but end users may want to host
   * this on their own domain.
   */
  earcutWorkerUrl?: string | URL | null;

  /**
   * The number of workers used for the earcut thread pool.
   */
  earcutWorkerPoolSize?: number;
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
  | "_normalize"
  | "_windingOrder"
  | "_validate"
  | "earcutWorkerUrl"
  | "earcutWorkerPoolSize"
> = {
  // Note: this diverges from upstream, where here we default to no
  // normalization
  _normalize: false,
  // Note: this diverges from upstream, where here we default to CCW
  _windingOrder: "CCW",

  _validate: true,

  // TODO: set this to current version
  earcutWorkerUrl:
    "https://cdn.jsdelivr.net/npm/@geoarrow/geoarrow-js@0.3.0-beta.1/dist/earcut-worker.min.js",

  earcutWorkerPoolSize: 8,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowSolidPolygonLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowSolidPolygonLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowSolidPolygonLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowSolidPolygonLayer";

  declare state: CompositeLayer["state"] & {
    table: arrow.Table | null;
    tableOffsets: Uint16Array | null;
    triangles: Uint32Array[] | null;
    earcutWorkerPool: Pool<FunctionThread> | null;
    earcutWorkerRequest: Promise<string> | null;
  };

  initializeState(_context: LayerContext): void {
    this.state = {
      table: null,
      tableOffsets: null,
      triangles: null,
      earcutWorkerRequest:
        this.props.earcutWorkerUrl === null ||
        this.props.earcutWorkerUrl === undefined
          ? null
          : fetch(this.props.earcutWorkerUrl).then((resp) => resp.text()),
      earcutWorkerPool: null,
    };
  }

  // NOTE: I'm not 100% on the race condition implications of this; can we make
  // sure we never construct two pools?
  async initEarcutPool(): Promise<Pool<FunctionThread> | null> {
    if (this.state.earcutWorkerPool) return this.state.earcutWorkerPool;

    const workerText = await this.state.earcutWorkerRequest;
    if (!workerText) {
      return null;
    }

    // Some environments are not able to execute `importScripts`
    // E.g. on a non-served HTML file (e.g. from lonboard export) you get
    // Uncaught DOMException: Failed to execute 'importScripts' on
    // 'WorkerGlobalScope': The script at
    // 'blob:null/4ffb0b98-d1bd-4d9e-be52-998f50829723' failed to load.
    //
    // Additionally, it appears impossible to _catch_ this exception (at least
    // on Chrome), so we'll hack around this by additionally checking if the
    // current file is served from file://
    if (window?.location?.href.startsWith("file://")) {
      return null;
    }

    try {
      const pool = Pool<FunctionThread>(
        () => spawn(BlobWorker.fromText(workerText)),
        8,
      );
      this.state.earcutWorkerPool = pool;
      return this.state.earcutWorkerPool;
    } catch (err) {
      return null;
    }
  }

  async finalizeState(context: LayerContext): Promise<void> {
    await this.state?.earcutWorkerPool?.terminate();
    console.log("terminated");
  }

  async updateData() {
    const { data: table } = this.props;
    const earcutTriangles = await this._updateEarcut(table);
    const tableOffsets = computeChunkOffsets(table.data);
    this.setState({
      table: this.props.data,
      triangles: earcutTriangles,
      tableOffsets,
    });
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
    if (
      geometryColumn !== undefined &&
      ga.vector.isPolygonVector(geometryColumn)
    ) {
      return this._earcutPolygonVector(geometryColumn);
    }

    if (
      geometryColumn !== undefined &&
      ga.vector.isMultiPolygonVector(geometryColumn)
    ) {
      return this._earcutMultiPolygonVector(geometryColumn);
    }

    throw new Error("geometryColumn not Polygon or MultiPolygon");
  }

  async _earcutPolygonVector(
    geometryColumn: ga.vector.PolygonVector,
  ): Promise<Uint32Array[]> {
    const pool = await this.initEarcutPool();
    // Fallback if pool couldn't be created
    if (!pool) {
      return this._earcutPolygonVectorMainThread(geometryColumn);
    }

    const result: Uint32Array[] = new Array(geometryColumn.data.length);
    console.time("earcut");

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
      pool.queue(async (earcutWorker) => {
        const earcutTriangles = await earcutWorker(
          Transfer(preparedPolygonData, arrayBuffers),
        );
        result[recordBatchIdx] = earcutTriangles;
      });
    }

    await pool.completed();
    console.timeEnd("earcut");

    return result;
  }

  _earcutPolygonVectorMainThread(
    geometryColumn: ga.vector.PolygonVector,
  ): Uint32Array[] {
    const result: Uint32Array[] = new Array(geometryColumn.data.length);

    for (
      let recordBatchIdx = 0;
      recordBatchIdx < geometryColumn.data.length;
      recordBatchIdx++
    ) {
      const polygonData = geometryColumn.data[recordBatchIdx];
      result[recordBatchIdx] = ga.algorithm.earcut(polygonData);
    }

    return result;
  }

  async _earcutMultiPolygonVector(
    geometryColumn: ga.vector.MultiPolygonVector,
  ): Promise<Uint32Array[]> {
    const pool = await this.initEarcutPool();
    // Fallback if pool couldn't be created
    if (!pool) {
      return this._earcutMultiPolygonVectorMainThread(geometryColumn);
    }

    const result: Uint32Array[] = new Array(geometryColumn.data.length);
    console.time("earcut");

    for (
      let recordBatchIdx = 0;
      recordBatchIdx < geometryColumn.data.length;
      recordBatchIdx++
    ) {
      const multiPolygonData = geometryColumn.data[recordBatchIdx];
      const polygonData = ga.child.getMultiPolygonChild(multiPolygonData);
      const [preparedPolygonData, arrayBuffers] = ga.worker.preparePostMessage(
        polygonData,
        true,
      );
      pool.queue(async (earcutWorker) => {
        const earcutTriangles = await earcutWorker(
          Transfer(preparedPolygonData, arrayBuffers),
        );
        result[recordBatchIdx] = earcutTriangles;
      });
    }

    await pool.completed();
    console.timeEnd("earcut");

    return result;
  }

  _earcutMultiPolygonVectorMainThread(
    geometryColumn: ga.vector.MultiPolygonVector,
  ): Uint32Array[] {
    const result: Uint32Array[] = new Array(geometryColumn.data.length);

    for (
      let recordBatchIdx = 0;
      recordBatchIdx < geometryColumn.data.length;
      recordBatchIdx++
    ) {
      const multiPolygonData = geometryColumn.data[recordBatchIdx];
      const polygonData = ga.child.getMultiPolygonChild(multiPolygonData);
      result[recordBatchIdx] = ga.algorithm.earcut(polygonData);
    }

    return result;
  }

  updateState({ props, changeFlags }: UpdateParameters<this>): void {
    if (changeFlags.dataChanged) {
      this.updateData();
    }
  }

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { table } = this.state;
    if (!table) return null;

    if (this.props.getPolygon !== undefined) {
      const geometryColumn = this.props.getPolygon;
      if (
        geometryColumn !== undefined &&
        ga.vector.isPolygonVector(geometryColumn)
      ) {
        return this._renderLayersPolygon(geometryColumn);
      }

      if (
        geometryColumn !== undefined &&
        ga.vector.isMultiPolygonVector(geometryColumn)
      ) {
        return this._renderLayersMultiPolygon(geometryColumn);
      }

      throw new Error(
        "getPolygon should be an arrow Vector of Polygon or MultiPolygon type",
      );
    } else {
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
    }

    throw new Error("getPolygon not GeoArrow Polygon or MultiPolygon");
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

      const flatCoordinateArray = coordData.values;

      const resolvedRingOffsets = getPolygonResolvedOffsets(polygonData);

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
        tableOffsets: this.state.tableOffsets,

        id: `${this.props.id}-geoarrow-point-${recordBatchIdx}`,
        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
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
      const flatCoordinateArray = coordData.values;

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
        tableOffsets: this.state.tableOffsets,

        id: `${this.props.id}-geoarrow-solid-polygon-multi-${recordBatchIdx}`,
        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
          // Map from expanded multi-geometry index to original index
          // Used both in picking and for function callbacks
          invertedGeomOffsets: invertOffsets(geomOffsets),
          // Number of polygons
          // Note: this needs to be the length one level down, because we're
          // rendering the polygons, not the multipolygons
          length: polygonData.length,
          // Offsets into coordinateArray where each single-polygon starts
          //
          // Note that this is polygonToCoordOffsets and not geomToCoordOffsets
          // because we're rendering each part of the MultiPolygon individually
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

      const finalProps = this.getSubLayerProps(props);
      const layer = new SolidPolygonLayer(finalProps);
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

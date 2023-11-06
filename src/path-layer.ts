import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  Unit,
} from "@deck.gl/core/typed";
import { PathLayer } from "@deck.gl/layers/typed";
import type { PathLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  getLineStringChild,
  getMultiLineStringChild,
  getMultiLineStringResolvedOffsets,
  getPointChild,
  invertOffsets,
  isLineStringVector,
  isMultiLineStringVector,
  validateColorVector,
  validateLineStringType,
  validateMultiLineStringType,
  validateVectorAccessors,
} from "./utils.js";
import {
  ColorAccessor,
  FloatAccessor,
  GeoArrowPickingInfo,
  LineStringVector,
  MultiLineStringVector,
} from "./types.js";
import { EXTENSION_NAME } from "./constants.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowPathLayer */
export type GeoArrowPathLayerProps = _GeoArrowPathLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPathLayer */
type _GeoArrowPathLayerProps = {
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
  getPath?: LineStringVector | MultiLineStringVector;
  /**
   * Path color accessor.
   * @default [0, 0, 0, 255]
   */
  getColor?: ColorAccessor;
  /**
   * Path width accessor.
   * @default 1
   */
  getWidth?: FloatAccessor;
};

export const defaultProps: DefaultProps<GeoArrowPathLayerProps> = {
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
  _validate: true,

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

  getPickingInfo({
    info,
    sourceLayer,
  }: GetPickingInfoParams): GeoArrowPickingInfo {
    const { data: table } = this.props;

    // Geometry index as rendered
    let index = info.index;

    // if a MultiLineString dataset, map from the rendered index back to the
    // feature index
    // @ts-expect-error `invertedGeomOffsets` is manually set on layer props
    if (sourceLayer.props.invertedGeomOffsets) {
      // @ts-expect-error `invertedGeomOffsets` is manually set on layer props
      index = sourceLayer.props.invertedGeomOffsets[index];
    }

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

    const lineStringVector = getGeometryVector(
      table,
      EXTENSION_NAME.LINESTRING
    );
    if (lineStringVector !== null) {
      return this._renderLayersLineString(lineStringVector);
    }

    const multiLineStringVector = getGeometryVector(
      table,
      EXTENSION_NAME.MULTILINESTRING
    );
    if (multiLineStringVector !== null) {
      return this._renderLayersMultiLineString(multiLineStringVector);
    }

    const geometryColumn = this.props.getPath;
    if (isLineStringVector(geometryColumn)) {
      return this._renderLayersLineString(geometryColumn);
    }

    if (isMultiLineStringVector(geometryColumn)) {
      return this._renderLayersMultiLineString(geometryColumn);
    }

    throw new Error("geometryColumn not LineString or MultiLineString");
  }

  _renderLayersLineString(
    geometryColumn: LineStringVector
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    // TODO: validate that if nested, accessor props have the same nesting
    // structure as the main geometry column.
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
      const lineStringData = geometryColumn.data[recordBatchIdx];
      const geomOffsets = lineStringData.valueOffsets;
      const pointData = getLineStringChild(lineStringData);
      const nDim = pointData.type.listSize;
      const coordData = getPointChild(pointData);
      const flatCoordinateArray = coordData.values;

      const props: PathLayerProps = {
        // used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-path-${recordBatchIdx}`,
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
          length: lineStringData.length,
          // @ts-expect-error
          startIndices: geomOffsets,
          attributes: {
            getPath: { value: flatCoordinateArray, size: nDim },
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

      const layer = new PathLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }

  _renderLayersMultiLineString(
    geometryColumn: MultiLineStringVector
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    // TODO: validate that if nested, accessor props have the same nesting
    // structure as the main geometry column.
    if (this.props._validate) {
      const vectorAccessors: arrow.Vector[] = [geometryColumn];
      for (const accessor of [this.props.getColor, this.props.getWidth]) {
        if (accessor instanceof arrow.Vector) {
          vectorAccessors.push(accessor);
        }
      }

      validateMultiLineStringType(geometryColumn.type);
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
      const multiLineStringData = geometryColumn.data[recordBatchIdx];
      const lineStringData = getMultiLineStringChild(multiLineStringData);
      const pointData = getLineStringChild(lineStringData);
      const coordData = getPointChild(pointData);

      const geomOffsets = multiLineStringData.valueOffsets;
      const ringOffsets = lineStringData.valueOffsets;

      const nDim = pointData.type.listSize;
      const flatCoordinateArray = coordData.values;
      const multiLineStringToCoordOffsets =
        getMultiLineStringResolvedOffsets(multiLineStringData);

      const props: PathLayerProps = {
        // used for picking purposes
        recordBatchIdx,
        invertedGeomOffsets: invertOffsets(geomOffsets),

        id: `${this.props.id}-geoarrow-path-${recordBatchIdx}`,
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
          // Note: this needs to be the length one level down.
          length: lineStringData.length,
          // Offsets into coordinateArray where each single-line string starts
          //
          // Note: this is ringOffsets, not geomOffsets because we're rendering
          // the individual paths on the map.
          // @ts-ignore
          startIndices: ringOffsets,
          attributes: {
            getPath: { value: flatCoordinateArray, size: nDim },
          },
        },
      };

      // Note: here we use multiLineStringToCoordOffsets, not ringOffsets,
      // because we want the mapping from the _feature_ to the vertex
      assignAccessor({
        props,
        propName: "getColor",
        propInput: this.props.getColor,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: multiLineStringToCoordOffsets,
      });
      assignAccessor({
        props,
        propName: "getWidth",
        propInput: this.props.getWidth,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: multiLineStringToCoordOffsets,
      });

      const layer = new PathLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

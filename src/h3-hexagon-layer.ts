import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  Unit,
} from "@deck.gl/core/typed";
import { PolygonLayer } from "@deck.gl/layers/typed";
import { ScatterplotLayer } from "@deck.gl/layers/typed";
import { H3HexagonLayer } from "@deck.gl/geo-layers/typed";
import type { H3HexagonLayerProps } from "@deck.gl/geo-layers/typed";
import type {
  PolygonLayerProps,
  ScatterplotLayerProps,
} from "@deck.gl/layers/typed";
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

/** All properties supported by GeoArrowH3HexagonLayer */
export type GeoArrowH3HexagonLayerProps = Omit<
  H3HexagonLayerProps,
  "data" | "getHexagon"
> &
  _GeoArrowH3HexagonLayerProps &
  CompositeLayerProps;

/** Props added by the GeoArrowH3HexagonLayer */
type _GeoArrowH3HexagonLayerProps = {
  data?: arrow.Table;

  /**
   * Called for each data object to retrieve the quadkey string identifier.
   */
  getHexagon: arrow.Vector<arrow.Utf8>;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data from the upstream default props
const {
  data: _data,
  getHexagon: _getHexagon,
  ..._defaultProps
} = H3HexagonLayer.defaultProps;

const defaultProps: DefaultProps<GeoArrowH3HexagonLayerProps> = {
  ..._defaultProps,
  _validate: true,
};

// export class GeoArrowArcLayer<
//   ExtraProps extends {} = {}
// > extends CompositeLayer<Required<GeoArrowArcLayerProps> & ExtraProps> {
//   static defaultProps = defaultProps;
//   static layerName = "GeoArrowArcLayer";

//   getPickingInfo({
//     info,
//     sourceLayer,
//   }: GetPickingInfoParams): GeoArrowPickingInfo {
//     const { data: table } = this.props;

//     // Geometry index as rendered
//     let index = info.index;

//     // @ts-expect-error `recordBatchIdx` is manually set on layer props
//     const recordBatchIdx: number = sourceLayer.props.recordBatchIdx;
//     const batch = table.batches[recordBatchIdx];
//     const row = batch.get(index);

//     // @ts-expect-error hack: using private method to avoid recomputing via
//     // batch lengths on each iteration
//     const offsets: number[] = table._offsets;
//     const currentBatchOffset = offsets[recordBatchIdx];

//     // Update index to be _global_ index, not within the specific record batch
//     index += currentBatchOffset;
//     return {
//       ...info,
//       index,
//       object: row,
//     };
//   }

//   renderLayers(): Layer<{}> | LayersList | null {
//     return this._renderLayersPoint();
//   }

//   _renderLayersPoint(): Layer<{}> | LayersList | null {
//     const {
//       data: table,
//       getSourcePosition: sourcePosition,
//       getTargetPosition: targetPosition,
//     } = this.props;

//     if (this.props._validate) {
//       const vectorAccessors: arrow.Vector[] = [sourcePosition, targetPosition];
//       for (const accessor of [
//         this.props.getSourceColor,
//         this.props.getTargetColor,
//         this.props.getWidth,
//         this.props.getHeight,
//         this.props.getTilt,
//       ]) {
//         if (accessor instanceof arrow.Vector) {
//           vectorAccessors.push(accessor);
//         }
//       }

//       validatePointType(sourcePosition.type);
//       validatePointType(targetPosition.type);
//       if (table) {
//         validateVectorAccessors(table, vectorAccessors);
//       } else {
//         const validationTable = new arrow.Table({
//           source: sourcePosition,
//           target: targetPosition,
//         });
//         validateVectorAccessors(validationTable, vectorAccessors);
//       }

//       if (this.props.getSourceColor instanceof arrow.Vector) {
//         validateColorVector(this.props.getSourceColor);
//       }
//       if (this.props.getTargetColor instanceof arrow.Vector) {
//         validateColorVector(this.props.getTargetColor);
//       }
//     }

//     const layers: H3HexagonLayer[] = [];
//     for (
//       let recordBatchIdx = 0;
//       recordBatchIdx < table.batches.length;
//       recordBatchIdx++
//     ) {
//       const sourceData = sourcePosition.data[recordBatchIdx];
//       const sourceValues = getPointChild(sourceData).values;
//       const targetData = targetPosition.data[recordBatchIdx];
//       const targetValues = getPointChild(targetData).values;

//       const props: H3HexagonLayerProps = {
//         // @ts-expect-error used for picking purposes
//         recordBatchIdx,

//         id: `${this.props.id}-geoarrow-arc-${recordBatchIdx}`,

//         greatCircle: this.props.greatCircle,
//         numSegments: this.props.numSegments,
//         widthUnits: this.props.widthUnits,
//         widthScale: this.props.widthScale,
//         widthMinPixels: this.props.widthMinPixels,
//         widthMaxPixels: this.props.widthMaxPixels,

//         data: {
//           length: sourceData.length,
//           attributes: {
//             getSourcePosition: {
//               value: sourceValues,
//               size: sourceData.type.listSize,
//             },
//             getTargetPosition: {
//               value: targetValues,
//               size: targetData.type.listSize,
//             },
//           },
//         },
//       };

//       assignAccessor({
//         props,
//         propName: "getSourceColor",
//         propInput: this.props.getSourceColor,
//         chunkIdx: recordBatchIdx,
//       });
//       assignAccessor({
//         props,
//         propName: "getTargetColor",
//         propInput: this.props.getTargetColor,
//         chunkIdx: recordBatchIdx,
//       });
//       assignAccessor({
//         props,
//         propName: "getWidth",
//         propInput: this.props.getWidth,
//         chunkIdx: recordBatchIdx,
//       });
//       assignAccessor({
//         props,
//         propName: "getHeight",
//         propInput: this.props.getHeight,
//         chunkIdx: recordBatchIdx,
//       });
//       assignAccessor({
//         props,
//         propName: "getTilt",
//         propInput: this.props.getTilt,
//         chunkIdx: recordBatchIdx,
//       });

//       const layer = new H3HexagonLayer(this.getSubLayerProps(props));
//       layers.push(layer);
//     }

//     return layers;
//   }
// }

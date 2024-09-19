import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  assert,
  Unit,
  Material,
} from "@deck.gl/core";
import { PointCloudLayer } from "@deck.gl/layers";
import type { PointCloudLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
} from "./utils.js";
import {
  GeoArrowExtraPickingProps,
  computeChunkOffsets,
  getPickingInfo,
} from "./picking.js";
import { ColorAccessor, GeoArrowPickingInfo, NormalAccessor } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors } from "./validate.js";

/* All properties supported by GeoArrowPointCloudLayer */
export type GeoArrowPointCloudLayerProps = Omit<
  PointCloudLayerProps<arrow.Table>,
  "data" | "getPosition" | "getNormal" | "getColor"
> &
  _GeoArrowPointCloudLayerProps &
  CompositeLayerProps;

/* All properties added by GeoArrowPointCloudLayer */
type _GeoArrowPointCloudLayerProps = {
  // data
  data: arrow.Table;

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
  getPosition?: ga.vector.PointVector;

  /**
   * The normal of each object, in `[nx, ny, nz]`.
   * @default [0,0,1]
   */
  getNormal?: NormalAccessor;

  /**
   * The rgba color is in the format of `[r, g, b, [a]]`
   * @default [0,0,0,225]
   */
  getColor?: ColorAccessor;
};

// Remove data nd get Position from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._upstreamDefaultProps
} = PointCloudLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowPointCloudLayerProps> = {
  ..._upstreamDefaultProps,
  ...ourDefaultProps,
};

export class GeoArrowPointCloudLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowPointCloudLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPointCloudLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props.getPosition !== undefined) {
      const geometryColumn = this.props.getPosition;
      if (
        geometryColumn !== undefined &&
        ga.vector.isPointVector(geometryColumn)
      ) {
        return this._renderLayersPoint(geometryColumn);
      }

      throw new Error(
        "getPosition should pass in an arrow Vector of Point type",
      );
    } else {
      const pointVector = getGeometryVector(table, EXTENSION_NAME.POINT);
      if (pointVector !== null) {
        return this._renderLayersPoint(pointVector);
      }
    }

    throw new Error("getPosition not GeoArrow point");
  }

  _renderLayersPoint(
    geometryColumn: ga.vector.PointVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      assert(
        ga.vector.isPointVector(geometryColumn),
        "The geometry column is not a valid PointVector.",
      );
      assert(
        geometryColumn.type.listSize === 3,
        "Points of a PointCloudLayer in the geometry column must be three-dimensional.",
      );
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
    ]);
    const tableOffsets = computeChunkOffsets(table.data);

    const layers: PointCloudLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = ga.child.getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: PointCloudLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,
        tableOffsets,

        id: `${this.props.id}-geoarrow-pointcloud-${recordBatchIdx}`,
        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
          length: geometryData.length,
          attributes: {
            getPosition: {
              value: flatCoordinateArray,
              size: geometryData.type.listSize,
            },
          },
        },
      };
      for (const [propName, propInput] of Object.entries(accessors)) {
        assignAccessor({
          props,
          propName,
          propInput,
          chunkIdx: recordBatchIdx,
        });
      }
      const layer = new PointCloudLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }
    return layers;
  }
}

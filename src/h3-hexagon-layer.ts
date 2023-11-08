import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
} from "@deck.gl/core/typed";
import { H3HexagonLayer } from "@deck.gl/geo-layers/typed";
import type { H3HexagonLayerProps } from "@deck.gl/geo-layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  extractAccessorsFromProps,
  validateColorVector,
  validateVectorAccessors,
} from "./utils.js";
import { GeoArrowPickingInfo } from "./types.js";
import { getPickingInfo } from "./picking.js";

/** All properties supported by GeoArrowH3HexagonLayer */
export type GeoArrowH3HexagonLayerProps = Omit<
  H3HexagonLayerProps,
  "data" | "getHexagon"
> &
  _GeoArrowH3HexagonLayerProps &
  CompositeLayerProps;

/** Props added by the GeoArrowH3HexagonLayer */
type _GeoArrowH3HexagonLayerProps = {
  data: arrow.Table;

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

export class GeoArrowH3HexagonLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowH3HexagonLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowH3HexagonLayer";

  getPickingInfo(params: GetPickingInfoParams): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    return this._renderLayersPoint();
  }

  _renderLayersPoint(): Layer<{}> | LayersList | null {
    const { data: table, getHexagon: hexagonColumn } = this.props;

    if (this.props._validate) {
      const vectorAccessors: arrow.Vector[] = [];
      const colorVectorAccessors: arrow.Vector[] = [];
      for (const [accessorName, accessorValue] of Object.entries(this.props)) {
        // Is it an accessor
        if (accessorName.startsWith("get")) {
          // Is it a vector accessor
          if (accessorValue instanceof arrow.Vector) {
            vectorAccessors.push(accessorValue);

            // Is it a color vector accessor
            if (accessorName.endsWith("Color")) {
              colorVectorAccessors.push(accessorValue);
            }
          }
        }
      }

      validateVectorAccessors(table, vectorAccessors);
      for (const colorVectorAccessor of colorVectorAccessors) {
        validateColorVector(colorVectorAccessor);
      }
    }

    const layers: H3HexagonLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const hexData = hexagonColumn.data[recordBatchIdx];
      const hexValues = hexData.values;

      // Exclude manually-set accessors
      const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
        "getHexagon",
      ]);

      const props: H3HexagonLayerProps = {
        ...otherProps,

        // @ts-expect-error used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-arc-${recordBatchIdx}`,

        data: {
          length: hexData.length,
          attributes: {
            getHexagon: {
              value: hexValues,
              // h3 cells should always be 15 characters...?
              size: 15,
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

      const layer = new H3HexagonLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}

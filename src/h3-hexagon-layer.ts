import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
} from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import type { H3HexagonLayerProps } from "@deck.gl/geo-layers";
import * as arrow from "apache-arrow";
import { assignAccessor, extractAccessorsFromProps } from "./utils.js";
import { GeoArrowPickingInfo } from "./types.js";
import {
  GeoArrowExtraPickingProps,
  computeChunkOffsets,
  getPickingInfo,
} from "./picking.js";
import { validateAccessors } from "./validate.js";

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

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

const defaultProps: DefaultProps<GeoArrowH3HexagonLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowH3HexagonLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowH3HexagonLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowH3HexagonLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    return this._renderLayersPoint();
  }

  _renderLayersPoint(): Layer<{}> | LayersList | null {
    const { data: table, getHexagon: hexagonColumn } = this.props;

    if (this.props._validate) {
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getHexagon",
    ]);
    const tableOffsets = computeChunkOffsets(table.data);

    const layers: H3HexagonLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const hexData = hexagonColumn.data[recordBatchIdx];
      const hexValues = hexData.values;

      const props: H3HexagonLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,
        tableOffsets,

        id: `${this.props.id}-geoarrow-arc-${recordBatchIdx}`,

        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
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

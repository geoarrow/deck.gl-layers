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


export class GeoArrowPolygonLayer<ExtraProps extends {} = {}> extends CompositeLayer<
  GeoArrowPolygonLayerProps & ExtraProps
> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPolygonLayer";

  declare state: CompositeLayer["state"] & {
    table: arrow.Table | null;
  };

  initializeState(_context: LayerContext): void {
    this.state = {
      table: null,
    };
  }

  async updateData() {
    const { data: table } = this.props;
    this.setState({
      table: this.props.data,
    });
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

}

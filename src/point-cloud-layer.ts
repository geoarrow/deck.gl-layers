import {
    CompositeLayer,
    CompositeLayerProps,
    DefaultProps,
    GetPickingInfoParams,
    Layer,
    LayersList,
    assert,
  } from "@deck.gl/core/typed";
import { PointCloudLayer } from "@deck.gl/layers/typed";
import type { PointCloudLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow"
import * as ga from "@geoarrow/geoarrow-js"
import {
    assignAccessor,
    extractAccessorsFromProps,
    getGeometryVector,
    invertOffsets,
} from "./utils.js"
// TODO which accessors are actually needed for a pointcloud layer
import {
    GeoArrowExtraPickingProps,
    computeChunkOffsets,
    getPickingInfo,
} from "./picking.js"
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors } from "./validate.js";
import { defaultPoolSize } from "threads/dist/master/implementation.browser.js";
import { defaultProps } from "./path-layer.js";

/* All properties supported by GeoArrowPointCloudLayer */
export type GeoArrowPointCloudLayerProps = Omit<
    PointCloudLayerProps<arrow.Table>, // TODO is this still an Arrow Table or is it another datatype? An arrow table is a vector/array like value so is it the same?
    | "omitted properties here"
    > &
    _GeoArrowPointCloudLayerProps &
    CompositeLayerProps;
    
// TODO # see line of getSizeUnits
export type Unit = 'meters' | 'common' | 'pixels';

/* All properties added by GeoArrowPointCloudLayer */
type _GeoArrowPointCloudLayerProps = {
    // data
    data: arrow.Table,

    /**
     * If `true`, validate the arrays provided (e.g. chunk lengths)
     * @default true
     */
    _validate?: boolean;
    /**
     * The units of the point size, one of `'meters'`, `'common'`, and `'pixels'`.
     * @default 'pixels'
     */
    getSizeUnits?: Unit; // TODO do we need a unit type here?
    /** 
    * Center position accessor.
    * If not provided, will be inferred by finding a column with extension type
    * `"geoarrow.point"` or `"geoarrow.multipoint"`.
    */
    getPosition?: ga.vector.PointVector | ga.vector.MultiPointVector;


    //getProperties here
}

export class GeoArrowPointCloudLayer<
    ExtraProps extends {} = {},
    > extends CompositeLayer<Required<GeoArrowPointCloudLayerProps> & ExtraProps>{
        static defaultProps = defaultProps
        static layerName = "GeoArrowPointCloudLayer"

        // picking info method


        // render layers methods, determine geometry types

        // renderlayerpoints method, determine point types

        // accessors logic


        /// props

        /// assign accessor(s)


        // render multipoint layers

        // final logic

        // return
    }
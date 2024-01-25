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
import { Point } from "@geoarrow/geoarrow-js/dist/type.js";
import { getPointChild } from "@geoarrow/geoarrow-js/dist/child.js";

/* All properties supported by GeoArrowPointCloudLayer */
export type GeoArrowPointCloudLayerProps = Omit<
    PointCloudLayerProps<arrow.Table>, // TODO is this still an Arrow Table or is it another datatype? An arrow table is a vector/array like value so is it the same?
    | "omitted properties here"
    > &
    _GeoArrowPointCloudLayerProps &
    CompositeLayerProps;

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
     * 
     * The units of the point size, one of `'meters'`, `'common'`, and `'pixels'`.
     * @default 'pixels'
     */
    sizeUnits?: Unit;

    /**
     * Global radius of all points, in units specified by `sizeUnits`
     * @default 10
     */
    pointSize: number;

    /**
     * Material settings for lighting effect.
     *
     * @default true
     * @see https://deck.gl/docs/developer-guide/using-lighting
     */
    material?: Material;

    /** 
    * Center position accessor.
    * If not provided, will be inferred by finding a column with extension type
    * `"geoarrow.point"`
    */
    getPosition?: ga.vector.PointVector

    /**
     * The normal of each object, in `[nx, ny, nz]`.
     * @default [0,0,1]
     */
    getNormal?: 10 // TODO normalAccessor
    
    /**
     * The rgba color is in the format of `[r, g, b, [a]]`
     * @default [0,0,0,225] 
     */
    getColor?: ColorAccessor
}

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
}

export class GeoArrowPointCloudLayer<
    ExtraProps extends {} = {},
    > extends CompositeLayer<GeoArrowPointCloudLayerProps & ExtraProps>{
        static defaultProps = defaultProps;
        static layerName = "GeoArrowPointCloudLayer";

        getPickingInfo(
            params: GetPickingInfoParams & {
                sourceLayer: { props: GeoArrowExtraPickingProps }
            },
        ): GeoArrowPickingInfo { 
            return getPickingInfo(params, this.props.data);
        }

        renderLayers(): Layer<{}> | LayersList | null {
            const { data: table } = this.props;
        
            const pointVector = getGeometryVector(table, EXTENSION_NAME.POINT);
            if (pointVector !== null) {
              return this._renderLayersPoint(pointVector);
            }
        
            const geometryColumn = this.props.getPosition;
            if (
                geometryColumn !== undefined &&
                ga.vector.isPointVector(geometryColumn)
            ) {
              return this._renderLayersPoint(geometryColumn);
            }
        
            throw new Error("geometryColumn not GeoArrow point");
        }

        _renderLayersPoint(
            geometryColumn: ga.vector.PointVector,
        ): Layer<{}> | LayersList | null {
            const { data: table } = this.props;
            
            if (this.props._validate) {
                assert(ga.vector.isPointVector(geometryColumn),"The geometry column is not a valid PointVector.");
                assert(geometryColumn.type.listSize === 3,"Points of a PointCloudLayer in the geometry column must be three-dimensional.");
                validateAccessors(this.props, table);
            }

            // Exclude manually-set accessors
            const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
                "getPosition"
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

                    // @ts-expect-error used for picking purposes
                    recordBatchIdx,
                    tableOffsets,

                    id: `${this.props.id}-geoarrow-pointcloud-${recordBatchIdx}`,
                    data: {
                        length: geometryData.length,
                        attributes: {
                            getPosition: {
                                value: flatCoordinateArray,
                                size: geometryData.type.listSize,
                            }
                        },
                    },
                };
                for (const [propName,propInput] of Object.entries(accessors)) {
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

        


    
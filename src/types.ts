import type { Accessor, Color, PickingInfo } from "@deck.gl/core/typed";
import * as arrow from "apache-arrow";

export type InterleavedCoord = arrow.FixedSizeList<arrow.Float64>;
export type SeparatedCoord = arrow.Struct<{
  x: arrow.Float64;
  y: arrow.Float64;
}>;
// TODO: support separated coords
export type Coord = InterleavedCoord; // | SeparatedCoord;
export type Point = Coord;
export type LineString = arrow.List<Coord>;
export type Polygon = arrow.List<arrow.List<Coord>>;
export type MultiPoint = arrow.List<Coord>;
export type MultiLineString = arrow.List<arrow.List<Coord>>;
export type MultiPolygon = arrow.List<arrow.List<arrow.List<Coord>>>;

export type PointVector = arrow.Vector<Coord>;
export type LineStringVector = arrow.Vector<LineString>;
export type PolygonVector = arrow.Vector<Polygon>;
export type MultiPointVector = arrow.Vector<MultiPoint>;
export type MultiLineStringVector = arrow.Vector<MultiLineString>;
export type MultiPolygonVector = arrow.Vector<MultiPolygon>;

export type PointData = arrow.Data<Point>;
export type LineStringData = arrow.Data<LineString>;
export type PolygonData = arrow.Data<Polygon>;
export type MultiPointData = arrow.Data<MultiPoint>;
export type MultiLineStringData = arrow.Data<MultiLineString>;
export type MultiPolygonData = arrow.Data<MultiPolygon>;

export type GeoArrowPickingInfo = PickingInfo & {
  object: arrow.StructRowProxy
}

export type FloatAccessor =
  | arrow.Vector<arrow.Float>
  | Accessor<arrow.Table, number>;
export type TimestampAccessor =
  | arrow.Vector<arrow.List<arrow.Uint32>>;
export type ColorAccessor =
  | arrow.Vector<arrow.FixedSizeList<arrow.Uint8>>
  | Accessor<arrow.Table, Color | Color[]>;

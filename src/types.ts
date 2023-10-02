import * as arrow from "apache-arrow";

export type InterleavedCoord = arrow.FixedSizeList<arrow.Float>;
export type SeparatedCoord = arrow.Struct<{
  x: arrow.Float;
  y: arrow.Float;
}>;
export type Coord = InterleavedCoord | SeparatedCoord;
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

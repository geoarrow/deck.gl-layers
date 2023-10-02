import * as arrow from "apache-arrow";

export type InterleavedCoord = arrow.FixedSizeList<arrow.Float>;
export type SeparatedCoord = arrow.Struct<{
  x: arrow.Float;
  y: arrow.Float;
}>;
export type Coord = InterleavedCoord | SeparatedCoord;

export type PointVector = arrow.Vector<Coord>;
export type LineStringVector = arrow.Vector<arrow.List<Coord>>;
export type PolygonVector = arrow.Vector<arrow.List<arrow.List<Coord>>>;
export type MultiPointVector = arrow.Vector<arrow.List<Coord>>;
export type MultiLineStringVector = arrow.Vector<arrow.List<arrow.List<Coord>>>;
export type MultiPolygonVector = arrow.Vector<
  arrow.List<arrow.List<arrow.List<Coord>>>
>;

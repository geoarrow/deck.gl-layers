import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";

/**
 * Get the exterior of a PolygonVector
 */
export function exteriorPolygon(
  vector: ga.vector.PolygonVector,
): ga.vector.LineStringVector {
  const exteriorData: ga.data.LineStringData[] = [];
  for (const polygonData of vector.data) {
    exteriorData.push(ga.child.getPolygonChild(polygonData));
  }
  return new arrow.Vector(exteriorData);
}

/**
 * Get the exterior of a MultiPolygonVector
 */
export function exteriorMultiPolygon(
  vector: ga.vector.MultiPolygonVector,
): ga.vector.MultiLineStringVector {
  const exteriorData: ga.data.MultiLineStringData[] = [];
  for (const multiPolygonData of vector.data) {
    exteriorData.push(ga.child.getMultiPolygonChild(multiPolygonData));
  }
  return new arrow.Vector(exteriorData);
}

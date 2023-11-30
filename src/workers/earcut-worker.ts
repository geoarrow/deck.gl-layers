import * as ga from "@geoarrow/geoarrow-js";
import type { TransferDescriptor } from "threads";
import { expose, Transfer } from "threads/worker";

function earcutWorker(polygonData: ga.data.PolygonData): TransferDescriptor {
  const rehydratedData: ga.data.PolygonData =
    ga.worker.rehydrateData(polygonData);
  const earcutTriangles = ga.algorithm.earcut(rehydratedData);
  return Transfer(earcutTriangles, [earcutTriangles.buffer]);
}

export type EarcutOnWorker = typeof earcutWorker;

expose(earcutWorker);

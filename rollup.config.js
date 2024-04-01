import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const input = "./src/index.ts";
const sourcemap = true;
const external = [
  "@deck.gl/aggregation-layers/typed",
  "@deck.gl/core/typed",
  "@deck.gl/geo-layers/typed",
  "@deck.gl/layers/typed",
  "@geoarrow/geoarrow-js",
  "apache-arrow",
  "threads",
];

export default [
  {
    input,
    output: {
      file: "dist/dist.es.mjs",
      format: "es",
      sourcemap,
    },
    plugins: [nodeResolve(), typescript()],
    external,
  },
  {
    input,
    output: {
      file: "dist/index.d.ts",
      format: "es",
    },
    plugins: [dts()],
    external,
  },
  {
    input,
    output: {
      file: "dist/dist.cjs",
      format: "cjs",
      sourcemap,
    },
    plugins: [nodeResolve(), typescript()],
    external,
  },
  {
    input,
    output: {
      file: "dist/dist.umd.js",
      format: "umd",
      name: "@geoarrow/deck.gl-layers",
      sourcemap,
      globals: {
        "@deck.gl/aggregation-layers/typed": "deck",
        "@deck.gl/core/typed": "deck",
        "@deck.gl/geo-layers/typed": "deck",
        "@deck.gl/layers/typed": "deck",
        "@geoarrow/geoarrow-js": "geoarrow",
        "apache-arrow": "arrow",
      },
    },
    plugins: [typescript(), terser()],
    external,
  },
];

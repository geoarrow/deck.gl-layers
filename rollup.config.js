import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const input = "./src/index.ts";
const sourcemap = true;
const external = ["apache-arrow", "@deck.gl/core", "@deck.gl/layers"];

export default [
  {
    input,
    output: {
      file: "dist/dist.es.mjs",
      format: "es",
      sourcemap,
    },
    plugins: [typescript()],
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
    plugins: [typescript()],
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
        "@deck.gl/aggregation-layers": "deck",
        "@deck.gl/core": "deck",
        "@deck.gl/geo-layers": "deck",
        "@deck.gl/layers": "deck",
        "apache-arrow": "arrow",
      },
    },
    plugins: [typescript(), terser()],
    external,
  },
];

import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const input = "./src/index.ts";
const sourcemap = true;

export default [
  {
    input,
    output: {
      file: "dist/deck.gl-geoarrow.es.mjs",
      format: "es",
      sourcemap,
    },
    plugins: [typescript()],
  },
  {
    input,
    output: {
      file: "dist/index.d.ts",
      format: "es",
    },
    plugins: [dts()],
  },
  {
    input,
    output: {
      file: "dist/deck.gl-geoarrow.cjs",
      format: "cjs",
      sourcemap,
    },
    plugins: [typescript()],
  },
  {
    input,
    output: {
      file: "dist/deck.gl-geoarrow.umd.js",
      format: "umd",
      name: "arrowJsFFI",
      sourcemap,
    },
    plugins: [typescript(), terser()],
  },
];

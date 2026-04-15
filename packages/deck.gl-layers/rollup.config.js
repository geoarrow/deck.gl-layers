import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const input = "./src/index.ts";
const sourcemap = true;
const external = [
  "@deck.gl/aggregation-layers",
  "@deck.gl/core",
  "@deck.gl/geo-layers",
  "@deck.gl/layers",
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
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        compilerOptions: {
          composite: false,
          declaration: false,
          declarationMap: false,
        },
      }),
    ],
    external,
  },
  {
    input,
    output: {
      file: "dist/index.d.ts",
      format: "es",
    },
    plugins: [dts({ compilerOptions: { composite: false } })],
    external,
  },
  {
    input,
    output: {
      file: "dist/dist.cjs",
      format: "cjs",
      sourcemap,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        compilerOptions: {
          composite: false,
          declaration: false,
          declarationMap: false,
        },
      }),
    ],
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
        "@geoarrow/geoarrow-js": "geoarrow",
        "apache-arrow": "Arrow",
      },
    },
    plugins: [
      typescript({
        compilerOptions: {
          composite: false,
          declaration: false,
          declarationMap: false,
        },
      }),
      terser(),
    ],
    external,
  },
];

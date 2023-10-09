# Developer Documentation

This project uses [Volta](https://volta.sh/) to manage the JavaScript toolchain. After installing Volta, you should be able to just run

```
npm install
```

and Volta will automatically install the pinned versions of Node and NPM and install dependencies. If you need to change the pinned version of Node or NPM, you can do that in the `"volta"` section of `package.json`.

## Building/Bundling

First, let me state that JavaScript bundling is hard, so if you aren't able to use the generated bundle for some reason, open an issue or make a PR! It probably doesn't work out of ignorance, not intent.

This project uses `tsc` to generate ES-module JS code from the TypeScript source. It also uses rollup to generate other bundle formats.

After running `npm install`, you can run

```
npm run build
```

to perform both the tsc-based and rollup-based build steps. Or you can run `build:tsc` to run just `tsc` or `build:rollup` to run just rollup.

## Examples

It's hard to test deck.gl-based code (or at least involved to set up the test harness), so for now this project is primarily "tested through examples" :sweat_smile:. (In the future it would be nice to implement full testing).

The examples are not yet fully reproducible because they rely on specific data files whose generation is not 100% reproducible. This is planned work for the future.

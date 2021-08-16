# vl-animation

install `parcel-bundler` and `typescript` globally or have a bad time

`yarn add global parcel-bundler typescript`

must use vega-lite@4 (version 5 broke typescript)

install files with `yarn`

run with `yarn start`. this launches a webapp that is hosted by
default on `localhost:1234`

**Note: `yarn start` must be run twice the first time. This is because `parcel` expects a `.js` file, but `tsc` hasn't created it yet**

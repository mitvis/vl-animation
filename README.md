# vl-animation

install `parcel-bundler` and `typescript` globally or have a bad time

`yarn add global parcel-bundler typescript`

must use vega-lite@4 (version 5 broke typescript)

run with `yarn start`. you may need to run this command twice on startup since `parcel` expects a
`js` file, which `tsc` needs to generate the first time. this launches a webapp that is hosted by
default on `localhost:1234`

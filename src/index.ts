import * as vega from 'vega';
import { TopLevelUnitSpec } from 'vega-lite/build/src/spec/unit';
import { UnitSpec } from 'vega-lite/build/src/spec/unit';
import { Encoding } from 'vega-lite/build/src/encoding';
import { Predicate } from 'vega-lite/build/src/predicate';
import { Transform } from 'vega-lite/build/src/transform';
import { LayerSpec, TopLevel} from 'vega-lite/build/src/spec';
import { LogicalComposition } from 'vega-lite/build/src/logical';

import compileVla from './scripts/compile';
import elaborateVla from './scripts/elaboration';

// Types specific to Vega-Lite Animation
type VlAnimationTimeEncoding = {
  "field": string,
  "scale": {
    "type": "band",
    "range": {"step": number} // TODO: generalize 'step' to vega.RangeBand
  } | {
    "type": "linear",
    "range": [number, number]
  }
  "continuity"?: { "field": string },
  "rescale"?: boolean,
  "interpolateLoop"?: boolean
};

// time-specific filter predicate
type TimePredicate = {
  time: TimeFieldComparisonPredicate | TimeFieldComparisonPredicate[]
}

type TimeFieldComparisonPredicate = {"equal": string} |
  {"lt": string} |
  {"gt": string} |
  {"lte": string} |
  {"gte": string};

type VlaFilterTransform = {
  "filter": LogicalComposition<Predicate | TimePredicate>
};

// actual unit spec, is either top level or is top level
type VlAnimationUnitSpec = TopLevelUnitSpec & {
  "transform"?: (Transform | VlaFilterTransform)[],
  "encoding": { "time": VlAnimationTimeEncoding },
  "enter"?: Encoding<any>,
  "exit"?: Encoding<any>,
};

/////////////////////////// Initial Specs  ///////////////////////////
type TopLevelLayeredAnimationSpec = Override<TopLevel<LayerSpec>,{
  layer: (LayerSpec | VlAnimationLayerSpec)[]
}>

type VlAnimationLayerSpec = Override<LayerSpec,{
  "transform"?: (Transform | VlaFilterTransform)[], // this may have been provided in top layer
  "encoding"?: { "time": ElaboratedVlAnimationTimeEncoding }, // this may have been provided in top layer
  "enter"?: Encoding<any>, 
  "exit"?: Encoding<any>,
}>;


// This is the type of an initial input json spec, can be either unit or have layers (written by the user)
// type VlAnimationSpec = vl.TopLevelSpec | VlAnimationUnitSpec | (TopLevel<LayerSpec> & {
export type VlAnimationSpec = VlAnimationUnitSpec | TopLevelLayeredAnimationSpec;


/////////////////////////// Elaborated Specs  ///////////////////////////
type ElaboratedVlAnimationTimeEncoding = {
  "field": string,
  "scale": {
    "type": "band",
    "range": {"step": number} // TODO: generalize 'step' to vega.RangeBand
  } | {
    "type": "linear",
    "range": [number, number]
  }
  "continuity"?: { "field": string },
  "rescale": boolean,
  "interpolateLoop": boolean,
};

type ElaboratedVlAnimationUnitSpec = Override<UnitSpec,{
  "transform": (Transform | VlaFilterTransform)[],
  "encoding": { "time": ElaboratedVlAnimationTimeEncoding },
  "enter"?: Encoding<any>, // TODO ask josh about this
  "exit"?: Encoding<any>,
}>;

// As suggested: https://dev.to/vborodulin/ts-how-to-override-properties-with-type-intersection-554l
// I don't think '&' does what we want for conflicting property names: https://www.typescriptlang.org/play?noLib=true#code/PTAEAEDsHsBkEsBGAuUAXATgVwKYCg0BPABx1AENjiAbMgXlAG89RRJyBbHVAZ03kgBzANx4AvngIkypchlANmrdl1SQsHRDgyiJU0qABm2eGgUUqtUADJQsnZLy0zAN3LVQqY1lPnGK7gBWMVE8IA
type Override<T1, T2> = Omit<T1, keyof T2> & T2;

type ElaboratedVlAnimationLayerSpec = Override<LayerSpec,{
  "transform"?: (Transform | VlaFilterTransform)[], // this may have been provided in top layer
  "encoding"?: { "time": ElaboratedVlAnimationTimeEncoding }, // this may have been provided in top layer
  "enter"?: Encoding<any>, 
  "exit"?: Encoding<any>,
}>;

type ElaboratedTopLevelLayeredAnimationSpec = Override<TopLevel<LayerSpec>,{
  layer: (LayerSpec | ElaboratedVlAnimationLayerSpec)[]
}>

// the elaborated type we create from the input and pass to the compiler
export type ElaboratedVlAnimationSpec = ElaboratedVlAnimationUnitSpec | ElaboratedTopLevelLayeredAnimationSpec


/**
 * Renders vega spec into DOM
 * @param vgSpec Vega spec
 * @param id id for container div
 */
 const initVega = (vgSpec: vega.Spec, id = 'view') => {
  const newDiv = document.createElement('div');
  newDiv.setAttribute('id', id);
  document.body.insertBefore(newDiv, document.getElementById('year'));

  const runtime = vega.parse(vgSpec);
  (window as any).view = new vega.View(runtime)
    .logLevel(vega.Warn) // Set view logging level
    .initialize(newDiv) // Set parent DOM element
    .renderer('svg') // Set render type (defaults to 'canvas')
    .hover() // Enable hover event processing
    .run(); // Update and render the view
}

/**
 *
 * @param vlaSpec Vega-Lite animation spec
 * @param id id for a container to append to DOM and attach vega embed
 */
const renderSpec = (vlaSpec: VlAnimationSpec, id: string): void => {
  const elaboratedVlaSpec = elaborateVla(vlaSpec);
  const injectedVgSpec = compileVla(elaboratedVlaSpec);
  console.log('injected vega',injectedVgSpec)
  initVega(injectedVgSpec, id);
}

// This is too much!
/* Object.entries(exampleSpecs).forEach(
  ([specId, spec]) => renderSpec(spec as VlAnimationSpec, specId)
); */

import * as gapminder from './gapminder.json';
import * as barchartrace from './bar-chart-race.json';
import * as walmart from './walmart.json';
import * as dunkins from './dunkins_opening_closing_updated_syntax.json'
import * as barley from './barley.json';
import * as covidtrends from './covid-trends.json';
import * as connectedScatterplot from './connected-scatterplot.json';
import * as birds from './birds.json';

const exampleSpecs = {
  gapminder,
  barchartrace,
  walmart,
  barley,
  covidtrends,
  connectedScatterplot,
  birds,
  dunkins
}

// casts are bad!
renderSpec(exampleSpecs.gapminder as VlAnimationSpec, "connectedScatterplot");

(window as any).view.addSignalListener('anim_val_curr', (_: any, value: string) => {
  document.getElementById('year').innerHTML = (new Date(parseInt(value)*1000)).toISOString();
})


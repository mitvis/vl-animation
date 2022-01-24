import * as vega from 'vega';
import { Encoding } from 'vega-lite/build/src/encoding';
import { LayerSpec, UnitSpec} from 'vega-lite/build/src/spec';

import compileVla from "./scripts/compile";
import elaborateVla from "./scripts/elaboration";

// As suggested: https://dev.to/vborodulin/ts-how-to-override-properties-with-type-intersection-554l
type Override<T1, T2> = Omit<T1, keyof T2> & T2;

// Types specific to Vega-Lite Animation
interface VlAnimationTimeScale {
  "type": string;
  "range": {"step": number} | number[];
};

export type VlAnimationTimeEncoding = {
  "field": string,
  "scale": VlAnimationTimeScale,
  "interpolate"?: {
    "field": string,
    "loop"?: boolean
  },
  "rescale"?: boolean
};

// actual unit spec, is either top level or is top level
export type VlAnimationUnitSpec = Override<UnitSpec<any>, {
  "encoding": { "time"?: VlAnimationTimeEncoding },
  "enter"?: Encoding<any>,
  "exit"?: Encoding<any>,
}>;

export type VlAnimationLayerSpec = Override<LayerSpec<any>, {
  layer: (VlAnimationLayerSpec | VlAnimationUnitSpec)[],
  encoding?: { "time"?: VlAnimationTimeEncoding }
}>;

// This is the type of an initial input json spec, can be either unit or have layers (written by the user)
export type VlAnimationSpec = VlAnimationUnitSpec | VlAnimationLayerSpec;

/////////////////////////// Elaborated Specs  ///////////////////////////
type ElaboratedVlAnimationTimeEncoding = {
  "field": string,
  "scale": VlAnimationTimeScale,
  "interpolate": {
    "field": string,
    "loop": boolean
  },
  "rescale": boolean,
};

export type ElaboratedVlAnimationUnitSpec = Override<UnitSpec<any>, {
  "encoding": { "time"?: ElaboratedVlAnimationTimeEncoding },
  "enter"?: Encoding<any>,
  "exit"?: Encoding<any>,
}>;

export type ElaboratedVlAnimationLayerSpec = Override<LayerSpec<any>, {
  layer: (ElaboratedVlAnimationLayerSpec | ElaboratedVlAnimationUnitSpec)[],
  encoding?: { "time"?: VlAnimationTimeEncoding }
}>;

// the elaborated type we create from the input and pass to the compiler
export type ElaboratedVlAnimationSpec = ElaboratedVlAnimationUnitSpec | ElaboratedVlAnimationLayerSpec;

/**
 * Renders vega spec into DOM
 * @param vgSpec Vega spec
 * @param id id for container div
 */
const initVega = (vgSpec: vega.Spec, id = "view") => {
	const newDiv = document.createElement("div");
	newDiv.setAttribute("id", id);
	document.body.insertBefore(newDiv, document.getElementById("year"));

	const runtime = vega.parse(vgSpec);
	(window as any).view = new vega.View(runtime)
		.logLevel(vega.Warn) // Set view logging level
		.initialize(newDiv) // Set parent DOM element
		.renderer("svg") // Set render type (defaults to 'canvas')
		.hover() // Enable hover event processing
		.run(); // Update and render the view
};

/**
 *
 * @param vlaSpec Vega-Lite animation spec
 * @param id id for a container to append to DOM and attach vega embed
 */
const renderSpec = (vlaSpec: VlAnimationSpec, id: string): void => {
	const elaboratedVlaSpec = elaborateVla(vlaSpec);
  console.log('vlaSpec', vlaSpec);
  console.log('elaboratedVlaSpec', elaboratedVlaSpec);
	const injectedVgSpec = compileVla(elaboratedVlaSpec);
	console.log("injected vega", injectedVgSpec);
	initVega(injectedVgSpec, id);
};

// This is too much!
/* Object.entries(exampleSpecs).forEach(
  ([specId, spec]) => renderSpec(spec as VlAnimationSpec, specId)
); */

import * as gapminder from "./gapminder.json";
import * as barchartrace from "./bar-chart-race.json";
import * as walmart from "./walmart.json";
import * as dunkins from "./dunkins_opening_closing_updated_syntax.json";
import * as barley from "./barley.json";
import * as covidtrends from "./covid-trends.json";
import * as connectedScatterplot from "./connected-scatterplot.json";
import * as birds from "./birds.json";

const exampleSpecs = {
	gapminder,
	barchartrace,
	walmart,
	barley,
	covidtrends,
	connectedScatterplot,
	birds,
	dunkins,
};

// casts are bad!
renderSpec(exampleSpecs.gapminder as VlAnimationSpec, "connectedScatterplot");

(window as any).view.addSignalListener("anim_val_curr", (_: any, value: string) => {
	document.getElementById("year").innerHTML = new Date(parseInt(value) * 1000).toISOString();
});

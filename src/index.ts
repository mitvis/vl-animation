import * as vega from 'vega';
import { Encoding } from 'vega-lite/build/src/encoding';
import { LayerSpec, TopLevel, UnitSpec} from 'vega-lite/build/src/spec';
import { PointSelectionConfig, SelectionParameter } from 'vega-lite/build/src/selection';
import { VariableParameter } from 'vega-lite/build/src/parameter';
import { Datum, Expr } from 'vega';
import { FieldPredicate } from 'vega-lite/build/src/predicate';
import { LogicalAnd } from 'vega-lite/build/src/logical';

import compileVla from "./scripts/compile";
import elaborateVla from "./scripts/elaboration";

// As suggested: https://dev.to/vborodulin/ts-how-to-override-properties-with-type-intersection-554l
type Override<T1, T2> = Omit<T1, keyof T2> & T2;

// Types specific to Vega-Lite Animation
export type VlAnimationTimeScale = ({
  "type"?: "band";
  "range"?: number[] | {"step": number};
} | {
  "type"?: "linear";
  "zero"?: boolean;
  "range"?: number[];
}) & {
  "domain"?: any[];
  "pause"?: {"value": Datum, "duration": number}[]
};

export type ElaboratedVlAnimationTimeScale = ({
  "type": "band";
  "range": number[] | {"step": number};
} | {
  "type": "linear";
  "zero"?: boolean; // optional, default false
  "range": number[];
}) & {
  "domain"?: any[]; // undefined domain means use data/field domain
  "pause"?: {"value": Datum, "duration": number}[]
};

export type VlAnimationSelection = Override<SelectionParameter, {
  "select": Override<PointSelectionConfig, {
    "on": "timer" | {
      "type": "timer",
      "filter"?: Expr | Expr[];
    }
    // "predicate"?: LogicalComposition<Predicate>;
    "predicate"?: LogicalAnd<FieldPredicate> | FieldPredicate;
  }>
}>;

export type VlAnimationTimeEncoding = {
  "field": string,
  "scale"?: VlAnimationTimeScale,
  "interpolate"?: {
    "field": string,
    "loop"?: boolean
  },
  "rescale"?: boolean
};

// actual unit spec, is either top level or is top level
export type VlAnimationUnitSpec = Override<UnitSpec<any>, {
  "params": (VariableParameter | SelectionParameter | VlAnimationSelection)[];
  "encoding": Encoding<any> & { "time"?: VlAnimationTimeEncoding },
  "enter"?: Encoding<any>,
  "exit"?: Encoding<any>,
}>;

export type VlAnimationLayerSpec = Override<LayerSpec<any>, {
  layer: (VlAnimationLayerSpec | VlAnimationUnitSpec)[],
  encoding?: Encoding<any> & { "time"?: VlAnimationTimeEncoding }
}>;

// This is the type of an initial input json spec, can be either unit or have layers (written by the user)
export type VlAnimationSpec = VlAnimationUnitSpec | TopLevel<VlAnimationLayerSpec>;

/////////////////////////// Elaborated Specs  ///////////////////////////
export type ElaboratedVlAnimationSelection = Override<SelectionParameter, {
  "select": Override<PointSelectionConfig, {
    "on": {
      "type": "timer",
      "filter": Expr | Expr[];
    },
    // "predicate"?: LogicalComposition<Predicate>;
    "predicate"?: LogicalAnd<FieldPredicate> | FieldPredicate;
  }>
}>;

export type ElaboratedVlAnimationTimeEncoding = {
  "field": string,
  "scale": ElaboratedVlAnimationTimeScale,
  "interpolate": {
    "field": string,
    "loop": boolean
  } | false,
  "rescale": boolean,
};

export type ElaboratedVlAnimationUnitSpec = Override<UnitSpec<any>, {
  "params": (VariableParameter | SelectionParameter | ElaboratedVlAnimationSelection)[];
  "encoding": Encoding<any> & { "time"?: ElaboratedVlAnimationTimeEncoding },
  "enter"?: Encoding<any>,
  "exit"?: Encoding<any>,
}>;

export type ElaboratedVlAnimationLayerSpec = Override<LayerSpec<any>, {
  layer: (ElaboratedVlAnimationLayerSpec | ElaboratedVlAnimationUnitSpec)[],
  encoding?: Encoding<any> & { "time"?: VlAnimationTimeEncoding }
}>;

// the elaborated type we create from the input and pass to the compiler
export type ElaboratedVlAnimationSpec = ElaboratedVlAnimationUnitSpec | TopLevel<ElaboratedVlAnimationLayerSpec>;

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
	console.log(JSON.stringify(injectedVgSpec, null, 2));
	initVega(injectedVgSpec, id);
};

// This is too much!
/* Object.entries(exampleSpecs).forEach(
  ([specId, spec]) => renderSpec(spec as VlAnimationSpec, specId)
); */

import * as gapminder from "./gapminder.json";
import * as gapminderPause from "./gapminder_pause.json";
import * as barchartrace from "./bar-chart-race.json";
import * as walmart from "./walmart.json";
import * as dunkins from "./dunkin_selection.json";
import * as barley from "./barley.json";
import * as covidtrends from "./covid-trends.json";
import * as connectedScatterplot from "./connected-scatterplot.json";
import * as birds from "./birds.json";

const exampleSpecs = {
	gapminder,
  gapminderPause,
	barchartrace,
	walmart,
	barley,
	covidtrends,
	connectedScatterplot,
	birds,
	dunkins,
};

renderSpec(exampleSpecs.gapminderPause as VlAnimationSpec, "connectedScatterplot");

(window as any).view.addSignalListener("anim_val_curr", (_: any, value: string) => {
	document.getElementById("year").innerHTML = new Date(parseInt(value) * 1000).toISOString();
});

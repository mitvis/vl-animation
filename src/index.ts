import compileVla from "./scripts/compile";
import elaborateVla from "./scripts/elaboration";

export {compileVla, elaborateVla};

// import * as vega from 'vega';

// import {VlAnimationSpec} from './scripts/types';

// /**
//  * Renders vega spec into DOM
//  * @param vgSpec Vega spec
//  * @param id id for container div
//  */
//  const initVega = (vgSpec: vega.Spec, id = "view") => {
// 	const newDiv = document.createElement("div");
// 	newDiv.setAttribute("id", id);
// 	document.body.insertBefore(newDiv, document.getElementById("year"));

// 	const runtime = vega.parse(vgSpec);
// 	(window as any).view = new vega.View(runtime)
// 		.logLevel(vega.Warn) // Set view logging level
// 		.initialize(newDiv) // Set parent DOM element
// 		.renderer("svg") // Set render type (defaults to 'canvas')
// 		.hover() // Enable hover event processing
// 		.run(); // Update and render the view
// };

// /**
//  *
//  * @param vlaSpec Vega-Lite animation spec
//  * @param id id for a container to append to DOM and attach vega embed
//  */
// const renderSpec = (vlaSpec: VlAnimationSpec, id: string): void => {
// 	const elaboratedVlaSpec = elaborateVla(vlaSpec);
//   console.log('vlaSpec', vlaSpec);
//   console.log('elaboratedVlaSpec', elaboratedVlaSpec);
// 	const injectedVgSpec = compileVla(elaboratedVlaSpec);
// 	console.log(JSON.stringify(injectedVgSpec, null, 2));
// 	initVega(injectedVgSpec, id);
// };

// // This is too much!
// /* Object.entries(exampleSpecs).forEach(
//   ([specId, spec]) => renderSpec(spec as VlAnimationSpec, specId)
// ); */

// import * as gapminder from "./gapminder.json";
// import * as gapminderPause from "./gapminder_pause.json";
// import * as barchartrace from "./bar-chart-race.json";
// import * as walmart from "./walmart.json";
// import * as dunkins from "./dunkin_selection.json";
// import * as barley from "./barley.json";
// import * as covidtrends from "./covid-trends.json";
// import * as connectedScatterplot from "./connected-scatterplot.json";
// import * as birds from "./birds.json";

// const exampleSpecs = {
// 	gapminder,
//   gapminderPause,
// 	barchartrace,
// 	walmart,
// 	barley,
// 	covidtrends,
// 	connectedScatterplot,
// 	birds,
// 	dunkins,
// };

// renderSpec(exampleSpecs.dunkins as VlAnimationSpec, "connectedScatterplot");

// (window as any).view.addSignalListener("anim_val_curr", (_: any, value: string) => {
// 	document.getElementById("year").innerHTML = new Date(parseInt(value) * 1000).toISOString();
// });

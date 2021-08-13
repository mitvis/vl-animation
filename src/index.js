"use strict";
exports.__esModule = true;
var vega = require("vega");
var vl = require("vega-lite");
var scatterplot = require("./scatterplot.json");
var initVega = function (vgSpec) {
    var runtime = vega.parse(vgSpec);
    window.view = new vega.View(runtime)
        .logLevel(vega.Warn) // Set view logging level
        .initialize(document.getElementById('view')) // Set parent DOM element
        .renderer('svg') // Set render type (defaults to 'canvas')
        .hover() // Enable hover event processing
        .run(); // Update and render the view
};
var vlaSpec = scatterplot;
var vlaToVl = function (vlaSpec) {
    return { vlSpec: vlaSpec, vlaComp: vlaSpec.time };
};
var injectVlaInVega = function (vlaComp, vgSpec) {
    var newVgSpec = Object.assign({}, vgSpec);
    var dataset = newVgSpec.data[0];
    console.log(dataset);
    var newDataset = {
        "name": dataset.name + "_1",
        "source": dataset.name,
        "transform": [
            {
                "type": "filter",
                "expr": "(datum[\"" + vlaComp.field + "\"]) == fyear"
            }
        ]
    };
    var newSignal = {
        "name": "fyear",
        "init": "(extent(domain('time'))[0])",
        "on": [
            {
                "events": { "type": "timer", "throttle": 1000 },
                "update": "fyear < (extent(domain('time'))[1]) ? fyear + 5 : extent(domain('time'))[0]"
            }
        ]
    };
    var newScale = {
        "name": "time",
        "type": "ordinal",
        "domain": { "data": dataset.name, "field": vlaComp.field }
    };
    newVgSpec.data.push(newDataset);
    newVgSpec.signals = newVgSpec.signals || [];
    newVgSpec.signals.push(newSignal);
    newVgSpec.marks[0].from.data = newDataset.name;
    newVgSpec.scales.push(newScale);
    console.log(JSON.stringify(newVgSpec, null, 2));
    return newVgSpec;
};
var vlaStuff = vlaToVl(vlaSpec);
var vgSpec = vl.compile(vlaStuff.vlSpec).spec;
var injectedVgSpec = injectVlaInVega(vlaStuff.vlaComp, vgSpec);
initVega(injectedVgSpec);
window.view.addSignalListener('fyear', function (_, value) {
    document.getElementById('year').innerHTML = value;
});
// const vlSpec: vl.TopLevelSpec = {
//   "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
//   "description": "A simple bar chart with embedded data.",
//   "data": {
//     "values": [
//       {"a": "A", "b": 28}, {"a": "B", "b": 55}, {"a": "C", "b": 43},
//       {"a": "D", "b": 91}, {"a": "E", "b": 81}, {"a": "F", "b": 53},
//       {"a": "G", "b": 19}, {"a": "H", "b": 87}, {"a": "I", "b": 52}
//     ]
//   },
//   "mark": "bar",
//   "encoding": {
//     "x": {"field": "a", "type": "nominal", "axis": {"labelAngle": 0}},
//     "y": {"field": "b", "type": "quantitative"}
//   }
// };
initVega(vgSpec);

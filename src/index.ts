import * as vega from 'vega';
import * as vl from 'vega-lite';
import * as scatterplot from './scatterplot.json';

const initVega = (vgSpec: vega.Spec) => {
  const runtime = vega.parse(vgSpec);
  (window as any).view = new vega.View(runtime)
    .logLevel(vega.Warn) // Set view logging level
    .initialize(document.getElementById('view')) // Set parent DOM element
    .renderer('svg') // Set render type (defaults to 'canvas')
    .hover() // Enable hover event processing
    .run(); // Update and render the view
}

type VlAnimationComponent = {
  "field": string,
  "scale": {
    "type": "linear",
    "range": [number, number]
  },
  "continuity": { "field": string }
};

type VlAnimationSpec = vl.TopLevelSpec & { "time": VlAnimationComponent };

const vlaSpec: VlAnimationSpec = scatterplot;

const vlaToVl = (vlaSpec: VlAnimationSpec): { vlSpec: vl.TopLevelSpec, vlaComp: VlAnimationComponent } => {
  return { vlSpec: vlaSpec, vlaComp: vlaSpec.time };
}

const injectVlaInVega = (vlaComp: VlAnimationComponent, vgSpec: vega.Spec): vega.Spec => {
  const newVgSpec = Object.assign({}, vgSpec);
  const dataset = newVgSpec.data[0];
  console.log(dataset);

  const newDataset: vega.Data = {
    "name": dataset.name + "_1",
    "source": dataset.name,
    "transform": [
      {
        "type": "filter",
        "expr": `(datum["${vlaComp.field}"]) == fyear`
      }
    ]
  };

  const newSignal: vega.Signal = {
    "name": "fyear",
    "init": "(extent(domain('time'))[0])",
    "on": [
      {
        "events": { "type": "timer", "throttle": 1000 },
        "update": "fyear < (extent(domain('time'))[1]) ? fyear + 5 : extent(domain('time'))[0]"
      }
    ]
  };

  const newScale: vega.Scale =
  {
    "name": "time",
    "type": "ordinal", // lol
    "domain": { "data": dataset.name, "field": vlaComp.field }
  };

  newVgSpec.data.push(newDataset);
  newVgSpec.signals = newVgSpec.signals || [];
  newVgSpec.signals.push(newSignal);

  newVgSpec.marks[0].from.data = newDataset.name;

  newVgSpec.scales.push(newScale);

  console.log(JSON.stringify(newVgSpec, null, 2));

  return newVgSpec;
}

const vlaStuff = vlaToVl(vlaSpec);

const vgSpec = vl.compile(vlaStuff.vlSpec).spec;

const injectedVgSpec = injectVlaInVega(vlaStuff.vlaComp, vgSpec);

initVega(injectedVgSpec);

(window as any).view.addSignalListener('fyear', (_, value: string) => {
  document.getElementById('year').innerHTML = value;
})


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
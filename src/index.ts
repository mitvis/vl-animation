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

const vlaSpec: VlAnimationSpec = scatterplot as VlAnimationSpec; // rip type safety on input file

const injectVlaInVega = (vlaComp: VlAnimationComponent, vgSpec: vega.Spec): vega.Spec => {
  const newVgSpec = Object.assign({}, vgSpec);
  const dataset = newVgSpec.data[0];
  const scales = newVgSpec.scales;

  const formulaTransforms: vega.FormulaTransform[] = scales.filter(s => (s.domain as vega.ScaleDataRef)?.field).map(s => {
    const field = (s.domain as vega.ScaleDataRef).field;
    return {
      "type": "formula",
      "as": `lerp_${field}`,
      "expr": `lerp([datum.${field}, datum.next.${field}], fyear_tween)`
    };
  })

  const newDatasets: vega.Data[] = [
    {
      "name": dataset.name + "_1",
      "source": dataset.name,
      "transform": [
        {
          "type": "filter",
          "expr": `(datum["${vlaComp.field}"]) == fyear`
        }
      ]
    },
    {
      "name": dataset.name + "_2",
      "source": dataset.name,
      "transform": [
        {
          "type": "filter",
          "expr": `(datum["${vlaComp.field}"]) == fyear2`
        }
      ]
    },
    {
      "name": dataset.name + "_3",
      "source": dataset.name + "_1",
      "transform": [
        {
          "type": "lookup",
          "from": dataset.name + "_2",
          "key": vlaComp.continuity.field,
          "fields": [vlaComp.continuity.field],
          "as": ["next"]
        },
        ...formulaTransforms
      ]
    }
  ]



  const newSignals: vega.Signal[] = [
    {
      "name": "increment",
      "value": 5
    },
    {
      "name": "fyear",
      "init": "(extent(domain('time'))[0])",
      "on": [
        {
          "events": { "type": "timer", "throttle": 1000 },
          "update": "fyear < (extent(domain('time'))[1]) ? fyear + increment : extent(domain('time'))[0]"
        }
      ]
    },
    {
      "name": "fyear2",
      "init": "fyear + increment",
      "on": [
        {
          "events": {"signal": "fyear"},
          "update": "min(extent(domain('time'))[1], fyear + increment)"
        }
      ]
    },
    {
      "name": "fyear_tween",
      "init": "0",
      "on": [
        {
          "events": {
            "type": "timer",
            "throttle": 100
          },
          "update": "fyear_tween + 1/10"
        },
        {
          "events": {"signal": "fyear"},
          "update": "0"
        }
      ]
    }
  ];

  const newScale: vega.Scale =
  {
    "name": "time",
    "type": "ordinal", // lol
    "domain": { "data": dataset.name, "field": vlaComp.field }
  };

  newVgSpec.data.push(...newDatasets);
  newVgSpec.signals = newVgSpec.signals || [];
  newVgSpec.signals.push(...newSignals);

  newVgSpec.marks[0].from.data = dataset.name + '_3';
  Object.keys(newVgSpec.marks[0].encode.update).forEach(key => {
    const maybeField = (newVgSpec.marks[0].encode.update[key] as any).field;
    if (maybeField) {
      (newVgSpec.marks[0].encode.update[key] as any).field = 'lerp_' + maybeField;
    }
  });

  newVgSpec.scales.push(newScale);

  console.log(JSON.stringify(newVgSpec, null, 2));

  return newVgSpec;
}

const vgSpec = vl.compile(vlaSpec).spec;
const injectedVgSpec = injectVlaInVega(vlaSpec.time, vgSpec);

initVega(injectedVgSpec);

(window as any).view.addSignalListener('fyear', (_: any, value: string) => {
  document.getElementById('year').innerHTML = value;
})

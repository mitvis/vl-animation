import * as vega from 'vega';
import * as vl from 'vega-lite';
import clone from 'lodash.clonedeep';
import { TopLevelUnitSpec } from 'vega-lite/build/src/spec/unit';
import * as gapminder from './gapminder.json';
// import * as barchartrace from './bar-chart-race.json';

const initVega = (vgSpec: vega.Spec) => {
  const runtime = vega.parse(vgSpec);
  (window as any).view = new vega.View(runtime)
    .logLevel(vega.Warn) // Set view logging level
    .initialize(document.getElementById('view')) // Set parent DOM element
    .renderer('svg') // Set render type (defaults to 'canvas')
    .hover() // Enable hover event processing
    .run(); // Update and render the view
}

type VlAnimationTimeEncoding = {
  "field": string,
  "scale": {
    "type": "linear",
    "range": [number, number]
  },
  "continuity": { "field": string },
  "rescale"?: boolean
};

type VlAnimationSpec = vl.TopLevelSpec & { "encoding": { "time": VlAnimationTimeEncoding } };

// rip type safety on input file. (still get some structural typechecking!)
const vlaSpec: VlAnimationSpec = gapminder as VlAnimationSpec;
// const vlaSpec: VlAnimationSpec = barchartrace as VlAnimationSpec;

const injectVlaInVega = (vlaSpec: VlAnimationSpec, vgSpec: vega.Spec): vega.Spec => {
  const newVgSpec = clone(vgSpec);
  // const dataset = newVgSpec.marks[0].from.data;
  const dataset = newVgSpec.data[0].name;
  const timeEncoding = vlaSpec.encoding.time;

  let stackTransform: vega.Transforms[] = [];
  if ((vlaSpec as TopLevelUnitSpec).mark === 'bar') {
    stackTransform = [...newVgSpec.data[1].transform];
  }

  const newDatasets: vega.Data[] = [
    {
      "name": dataset + "_1",
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": `toString(isNumber(datum["${timeEncoding.field}"]) ? datum["${timeEncoding.field}"] : utcyear(datum["${timeEncoding.field}"])) == toString(fyear)`
        },
        ...stackTransform
      ]
    },
    {
      "name": dataset + "_2",
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": `toString(isNumber(datum["${timeEncoding.field}"]) ? datum["${timeEncoding.field}"] : utcyear(datum["${timeEncoding.field}"])) == toString(fyear2)`
        },
        ...stackTransform
      ]
    },
    {
      "name": dataset + "_3",
      "source": dataset + "_1",
      "transform": [
        {
          "type": "lookup",
          "from": dataset + "_2",
          "key": timeEncoding.continuity.field,
          "fields": [timeEncoding.continuity.field],
          "as": ["next"]
        },
        {
          "type": "filter",
          "expr": "isValid(datum.next)"
        }
      ]
    }
  ]

  const newSignals: vega.Signal[] = [
    {
      "name": "increment",
      "init": "(max_extent - min_extent) / (length(domain('time')) - 1)"
    },
    {
      "name": "min_extent",
      "init": "isNumber(extent(domain('time'))[0]) ? extent(domain('time'))[0] : utcyear(extent(domain('time'))[0])"
    },
    {
      "name": "max_extent",
      "init": "isNumber(extent(domain('time'))[1]) ? extent(domain('time'))[1] : utcyear(extent(domain('time'))[1])"
    },
    {
      "name": "fyear",
      "init": "min_extent",
      "on": [
        {
          "events": { "type": "timer", "throttle": 1000 },
          "update": "fyear < (max_extent) ? fyear + increment : min_extent"
        }
      ]
    },
    {
      "name": "fyear2",
      "init": "fyear + increment",
      "on": [
        {
          "events": {"signal": "fyear"},
          "update": "min(max_extent, fyear + increment)"
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
    "domain": { "data": dataset, "field": timeEncoding.field }
  };

  newVgSpec.data.push(...newDatasets);
  newVgSpec.signals = newVgSpec.signals || [];
  newVgSpec.signals.push(...newSignals);

  // if (timeEncoding.rescale) {
  //   newVgSpec.scales.forEach(scale => {
  //     if ((scale.name === 'x' || scale.name === 'y') && (scale.domain as vega.ScaleDataRef)?.data === newVgSpec.marks[0].from.data || (scale.domain as vega.ScaleDataRef)?.data === dataset) {
  //       (scale.domain as vega.ScaleDataRef).data = dataset + '_3';
  //     }
  //   })
  // }

  newVgSpec.marks[0].from.data = dataset + '_3';

  type ScaleFieldValueRef = {scale: vega.Field, field: vega.Field};
  Object.entries(newVgSpec.marks[0].encode.update).forEach(([k, v]) => {
    if ((newVgSpec.marks[0].encode.update[k] as ScaleFieldValueRef).scale &&
        (newVgSpec.marks[0].encode.update[k] as ScaleFieldValueRef).field) {
      const {scale, field} = newVgSpec.marks[0].encode.update[k] as ScaleFieldValueRef;

      const scaleType = newVgSpec.scales.find(s => s.name === scale).type;
      switch (scaleType) {
        case 'ordinal':
        case 'bin-ordinal':
        case 'quantile':
        case 'quantize':
        case 'threshold':
          return; // if the scale has a discrete output range, don't lerp with it
      }

      newVgSpec.marks[0].encode.update[k] = {
        "signal": `lerp([scale('${scale}', datum.${field}), scale('${timeEncoding.rescale ? scale + '_next' : scale}', datum.next.${field})], fyear_tween)`
      }
    }
  })

  newVgSpec.marks.push({
    "type": "text",
    "encode": {
      "update": {
        "text": {
          "signal" : "fyear"
        },
        "x": {
          "signal": "width"
        },
        "fontWeight": {"value": "bold"},
        "fontSize": {"value": 16}
      }
    }
  })

  newVgSpec.scales.push(newScale);

  console.log(JSON.stringify(newVgSpec, null, 2));

  return newVgSpec;
}

const vgSpec = vl.compile(vlaSpec).spec;
const injectedVgSpec = injectVlaInVega(vlaSpec, vgSpec);

initVega(injectedVgSpec);

// (window as any).view.addSignalListener('fyear', (_: any, value: string) => {
//   document.getElementById('year').innerHTML = value;
// })

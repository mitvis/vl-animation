import * as vega from 'vega';
import * as vl from 'vega-lite';
import clone from 'lodash.clonedeep';
import { TopLevelUnitSpec } from 'vega-lite/build/src/spec/unit';

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
  "continuity"?: { "field": string },
  "rescale"?: boolean,
  "persist"?: "cumulative"
};

type VlAnimationSpec = vl.TopLevelSpec & { "encoding": { "time": VlAnimationTimeEncoding } };

import * as gapminder from './gapminder.json';
import * as barchartrace from './bar-chart-race.json';
import * as walmart from './walmart.json';
import * as barley from './barley.json';
import * as covidtrends from './covid-trends.json';

const exampleSpecs = {
  gapminder,
  barchartrace,
  walmart,
  barley,
  covidtrends
}

// rip type safety on input file. (still get some structural typechecking!)
const vlaSpec: VlAnimationSpec = exampleSpecs.gapminder as VlAnimationSpec;

const injectVlaInVega = (vlaSpec: VlAnimationSpec, vgSpec: vega.Spec): vega.Spec => {
  const newVgSpec = clone(vgSpec);
  const dataset = newVgSpec.marks[0].from.data;
  const timeEncoding = vlaSpec.encoding.time;

  const datasetSpec = newVgSpec.data.find(d => d.name === dataset);
  datasetSpec.transform.push({
    "type": "identifier",
    "as": "_id_"
  });

  let stackTransform: vega.Transforms[] = [];
  if ((vlaSpec as TopLevelUnitSpec).mark === 'bar') {
    stackTransform = [...newVgSpec.data[1].transform];
  }

  const dataset_persist = dataset + "_persist";
  const dataset_curr = dataset + "_curr";
  const dataset_next = dataset + "_next";
  const dataset_continuity = dataset + "_continuity";

  const newDatasets: vega.Data[] = [
    {
      "name": dataset_persist,
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": `datum['${timeEncoding.field}'] < anim_val_curr`
        },
        ...stackTransform
      ]
    },
    {
      "name": dataset_curr,
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": `datum['${timeEncoding.field}'] == anim_val_curr`
        },
        ...stackTransform
      ]
    },
    {
      "name": dataset_next,
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": `datum['${timeEncoding.field}'] == anim_val_next`
        },
        ...stackTransform
      ]
    }
  ]

  if (timeEncoding.continuity) {
    newDatasets.push({
      "name": dataset_continuity,
      "source": dataset_curr,
      "transform": [
        {
          "type": "lookup",
          "from": dataset_next,
          "key": timeEncoding.continuity.field,
          "fields": [timeEncoding.continuity.field],
          "as": ["next"]
        },
        {
          "type": "filter",
          "expr": "isValid(datum.next)"
        }
      ]
    });
  }

  const msPerTick = 500;
  const msPerFrame = 1000/60;

  const newSignals: vega.Signal[] = [
    {
      "name": "t_index",
      "init": "0",
      "on": [
        {
          "events": { "type": "timer", "throttle": msPerTick },
          "update": "t_index < length(domain('time')) - 1 ? t_index + 1 : 0"
        }
      ]
    },
    {
      "name": "min_extent",
      "init": "extent(domain('time'))[0]"
    },
    {
      "name": "max_extent",
      "init": "extent(domain('time'))[1]"
    },
    {
      "name": "anim_val_curr",
      "update": "domain('time')[t_index]"
    },
    {
      "name": "anim_val_next",
      "update": "t_index < length(domain('time')) - 1 ? domain('time')[t_index + 1] : max_extent"
    },
    {
      "name": "anim_tween",
      "init": "0",
      "on": [
        {
          "events": {
            "type": "timer",
            "throttle": msPerFrame
          },
          "update": `anim_tween + ${msPerFrame / msPerTick}`
        },
        {
          "events": {"signal": "anim_val_curr"},
          "update": "0"
        }
      ]
    }
  ];

  const newScale: vega.Scale =
  {
    "name": "time",
    "type": "ordinal",
    "domain": { "data": dataset, "field": timeEncoding.field, "sort": true }
  };

  newVgSpec.data.push(...newDatasets);
  newVgSpec.signals = newVgSpec.signals || [];
  newVgSpec.signals.push(...newSignals);

  if (timeEncoding.continuity) {
    newVgSpec.marks[0].from.data = dataset_continuity;
  }
  else {
    newVgSpec.marks[0].from.data = dataset_curr;
  }

  if (timeEncoding.persist === 'cumulative') {
    const newMark = clone(newVgSpec.marks[0]);
    newMark.name = newMark.name + '_persist';
    newMark.from.data = dataset_persist;
    newMark.encode.update.opacity = {"value": 0.3}
    // newMark.encode.update.size = {"value": 1}
    // newMark.encode.update.fill = {"value": "#0000ff"}
    newVgSpec.marks.push(newMark)
  }

  type ScaleFieldValueRef = {scale: vega.Field, field: vega.Field};
  Object.entries(newVgSpec.marks[0].encode.update).forEach(([k, v]) => {
    if ((newVgSpec.marks[0].encode.update[k] as ScaleFieldValueRef).scale &&
        (newVgSpec.marks[0].encode.update[k] as ScaleFieldValueRef).field) {
      const {scale, field} = newVgSpec.marks[0].encode.update[k] as ScaleFieldValueRef;

      const scaleSpec = newVgSpec.scales.find(s => s.name === scale);
      switch (scaleSpec.type) {
        case 'ordinal':
        case 'bin-ordinal':
        case 'quantile':
        case 'quantize':
        case 'threshold':
          return; // if the scale has a discrete output range, don't lerp with it
      }

      if (timeEncoding.rescale) {
        (scaleSpec.domain as vega.ScaleDataRef).data = dataset_curr;

        if (!newVgSpec.scales.find(s => s.name === scaleSpec.name + '_next')) {
          const scaleSpecNext = clone(scaleSpec);
          scaleSpecNext.name = scaleSpec.name + '_next';
          (scaleSpecNext.domain as vega.ScaleDataRef).data = dataset_next;
          newVgSpec.scales.push(scaleSpecNext);
        }
      }

      if (scale === 'color') {
        // color scales map numbers to strings, so lerp before scale
        newVgSpec.marks[0].encode.update[k] = {
          "signal": `isValid(datum.next) ? scale('${scale}', lerp([datum.${field}, datum.next.${field}], anim_tween)) : scale('${scale}', datum.${field})`
        }
      }
      else {
        // e.g. position scales map anything to numbers, so scale before lerp
        newVgSpec.marks[0].encode.update[k] = {
          "signal": `isValid(datum.next) ? lerp([scale('${scale}', datum.${field}), scale('${timeEncoding.rescale ? scale + '_next' : scale}', datum.next.${field})], anim_tween) : scale('${scale}', datum.${field})`
        }
      }
    }
  })

  newVgSpec.marks.push({
    "type": "text",
    "encode": {
      "update": {
        "text": {
          "signal" : "anim_val_curr"
        },
        "x": {
          "signal": "width"
        },
        "fontWeight": {"value": "bold"},
        "fontSize": {"value": 16}
      }
    }
  })

  newVgSpec.scales = newVgSpec.scales || [];
  newVgSpec.scales.push(newScale);

  console.log(JSON.stringify(newVgSpec, null, 2));

  return newVgSpec;
}

const vgSpec = vl.compile(vlaSpec).spec;
const injectedVgSpec = injectVlaInVega(vlaSpec, vgSpec);

initVega(injectedVgSpec);

// (window as any).view.addSignalListener('anim_val_curr', (_: any, value: string) => {
//   document.getElementById('year').innerHTML = value;
// })

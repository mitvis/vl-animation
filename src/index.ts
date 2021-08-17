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

// import * as gapminder from './gapminder.json';
import * as barchartrace from './bar-chart-race.json';
// import * as walmart from './walmart.json';

// rip type safety on input file. (still get some structural typechecking!)
// const vlaSpec: VlAnimationSpec = gapminder as VlAnimationSpec;
const vlaSpec: VlAnimationSpec = barchartrace as VlAnimationSpec;
// const vlaSpec: VlAnimationSpec = walmart as VlAnimationSpec;

const injectVlaInVega = (vlaSpec: VlAnimationSpec, vgSpec: vega.Spec): vega.Spec => {
  const newVgSpec = clone(vgSpec);
  const dataset = newVgSpec.marks[0].from.data;
  const timeEncoding = vlaSpec.encoding.time;

  const datasetSpec = newVgSpec.data.find(d => d.name === dataset);
  datasetSpec.transform.push({
    "type": "formula",
    "as": "clean_year",
    "expr": `isNumber(datum['${timeEncoding.field}']) ? datum['${timeEncoding.field}'] : utcyear(datum['${timeEncoding.field}'])`
  });

  let stackTransform: vega.Transforms[] = [];
  if ((vlaSpec as TopLevelUnitSpec).mark === 'bar') {
    stackTransform = [...newVgSpec.data[1].transform];
  }

  const newDatasets: vega.Data[] = [
    {
      "name": dataset + "_0",
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": "datum.clean_year < fyear"
        },
        ...stackTransform
      ]
    },
    {
      "name": dataset + "_1",
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": "datum.clean_year == fyear"
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
          "expr": "datum.clean_year == fyear2"
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
      "init": "extent(domain('time'))[0]"
    },
    {
      "name": "max_extent",
      "init": "extent(domain('time'))[1]"
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
    "type": "ordinal",
    "domain": { "data": dataset, "field": "clean_year" }
  };

  newVgSpec.data.push(...newDatasets);
  newVgSpec.signals = newVgSpec.signals || [];
  newVgSpec.signals.push(...newSignals);

  if (timeEncoding.persist === 'cumulative') {
    const newMark = clone(newVgSpec.marks[0]);
    newMark.name = newMark.name + '_persist';
    newMark.from.data = dataset + '_0';
    // newMark.encode.update.opacity = {"value": 0.3}
    // newMark.encode.update.size = {"value": 1}
    newVgSpec.marks.push(newMark)
  }

  newVgSpec.marks[0].from.data = dataset + '_3';

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
        (scaleSpec.domain as vega.ScaleDataRef).data = dataset + '_1';

        if (!newVgSpec.scales.find(s => s.name === scaleSpec.name + '_next')) {
          const scaleSpecNext = clone(scaleSpec);
          scaleSpecNext.name = scaleSpec.name + '_next';
          (scaleSpecNext.domain as vega.ScaleDataRef).data = dataset + '_2';
          newVgSpec.scales.push(scaleSpecNext);
        }
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

  newVgSpec.scales = newVgSpec.scales || [];
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

import * as vega from 'vega';
import * as vl from 'vega-lite';
import clone from 'lodash.clonedeep';
import { TopLevelUnitSpec } from 'vega-lite/build/src/spec/unit';
import { Encoding } from 'vega-lite/build/src/encoding';

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
    .runAsync(); // Update and render the view
}

type BandRangeStep = {"step": number};
type VlaPastEncoding = {
  "mark"?: "point" | "line",
  "encoding"?: Encoding<any>,
  "filter"?: string // predicate expr
};
type VlAnimationTimeEncoding = {
  "field": string,
  "scale": {
    "type": "linear" | "band",
    "range": [number, number] | BandRangeStep
  },
  "continuity"?: { "field": string },
  "rescale"?: boolean,
  "interpolateLoop"?: boolean,
  "past"?: boolean | VlaPastEncoding
};

type VlAnimationSpec = vl.TopLevelSpec & { "encoding": { "time": VlAnimationTimeEncoding } };

import * as gapminder from './gapminder.json';
import * as barchartrace from './bar-chart-race.json';
import * as walmart from './walmart.json';
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
}

const injectVlaInVega = (vlaSpec: VlAnimationSpec, vgSpec: vega.Spec): vega.Spec => {
  const newVgSpec = clone(vgSpec);
  const dataset = newVgSpec.marks[0].from.data;
  const timeEncoding = vlaSpec.encoding.time;

  const datasetSpec = newVgSpec.data.find(d => d.name === dataset);
  datasetSpec.transform = datasetSpec.transform ?? [];
  datasetSpec.transform.push({
    "type": "identifier",
    "as": "_id_"
  });

  let stackTransform: vega.Transforms[] = [];
  if ((vlaSpec as TopLevelUnitSpec).mark === 'bar') {
    stackTransform = [...newVgSpec.data[1].transform];
  }

  const dataset_past = dataset + "_past";
  const dataset_curr = dataset + "_curr";
  const dataset_next = dataset + "_next";
  const dataset_continuity = dataset + "_continuity";

  const newDatasets: vega.Data[] = [
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

  const continuityTransforms: vega.Transforms[] = [
    {
      "type": "lookup",
      "from": dataset_next,
      "key": timeEncoding.continuity?.field,
      "fields": [timeEncoding.continuity?.field],
      "as": ["next"]
    },
    {
      "type": "filter",
      "expr": "isValid(datum.next)"
    }
  ];

  const msPerTick = timeEncoding.scale.type === 'band' ?
    (timeEncoding.scale.range as BandRangeStep).step : 500;
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
      "update": `t_index < length(domain('time')) - 1 ? domain('time')[t_index + 1] : ${timeEncoding.interpolateLoop ? 'min_extent' : 'max_extent'}`
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

  if (timeEncoding.past) {
    const datasetPastSpec: vega.Data = {
      "name": dataset_past,
      "source": dataset,
      "transform": [
        {
          "type": "filter",
          "expr": `datum['${timeEncoding.field}'] < anim_val_curr`
        },
        ...stackTransform
      ]
    };

    let newMark = clone(newVgSpec.marks[0]);
    if (timeEncoding.past !== true) {
      const pastEncoding = timeEncoding.past as VlaPastEncoding;
      const vlEncodingSpec: TopLevelUnitSpec = {
        data: vlaSpec.data,
        mark: pastEncoding.mark ?? (vlaSpec as TopLevelUnitSpec).mark,
        encoding: {...(vlaSpec as TopLevelUnitSpec).encoding, ...(pastEncoding.encoding ?? {})}
      }
      if (vlEncodingSpec.mark === 'line') {
        vlEncodingSpec.encoding.order = {field: timeEncoding.field};
        (datasetPastSpec.transform[0] as vega.FilterTransform).expr = `datum['${timeEncoding.field}'] <= anim_val_curr`; // make the line connect to the current point
        continuityTransforms.push({
          "type": "formula",
          "as": "tween",
          "expr": `sequence(0, 1, ${msPerFrame / msPerTick})`
        })
      }
      newMark = vl.compile(vlEncodingSpec).spec.marks[0];

      if (pastEncoding.filter) {
        (datasetPastSpec.transform[0] as vega.FilterTransform).expr += ` && (${pastEncoding.filter})`;
      }
    }
    newMark.name = newMark.name + '_past';
    if ((newMark.from as any).facet) {
      // newMark is a faceted line mark
      (newMark.from as any).facet.data = dataset_past;
    }
    else {
      newMark.from.data = dataset_past;
    }
    newVgSpec.marks.push(newMark)
    newDatasets.push(datasetPastSpec);

    if (timeEncoding.continuity) {
      if (newMark.type === 'line' || newMark.type === 'group') {
        const pastContinuityMark = clone(newMark);
        newMark.name = newMark.name + '_continuity';
        if ((newMark.from as any).facet) {
          // newMark is a faceted line mark
          (newMark.from as any).facet.data = dataset_continuity;
        }
        else {
          newMark.from.data = dataset_continuity;
        }
        newVgSpec.marks.push(pastContinuityMark)
      }
    }
  }

  const lineContinuityTweenFields = ["tween"];

  type ScaleFieldValueRef = {scale: vega.Field, field: vega.Field};
  Object.entries(newVgSpec.marks[0].encode.update).forEach(([k, v]) => {
    let encodingDef = newVgSpec.marks[0].encode.update[k];
    if (Array.isArray(encodingDef)) {
      encodingDef = encodingDef[encodingDef.length - 1];
    }
    if ((encodingDef as ScaleFieldValueRef).scale &&
        (encodingDef as ScaleFieldValueRef).field) {
      const {scale, field} = encodingDef as ScaleFieldValueRef;

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

      const pastContinuityLineMark = newVgSpec.marks.find(mark => mark.name.endsWith('_continuity'));
      const pastContinuityLineMarkSignal = {
        "signal": `isValid(datum.tween_${field}) && datum.tween <= anim_tween ? scale('${scale}', datum.tween_${field}) : (isValid(datum.next) ? lerp([scale('${scale}', datum.${field}), scale('${scale}', datum.next.${field})], anim_tween) : scale('${scale}', datum.${field}))`
      };
      if (pastContinuityLineMark && pastContinuityLineMark.type === 'line') {
        pastContinuityLineMark.encode.update[k] = pastContinuityLineMarkSignal
      }
      else if (pastContinuityLineMark && pastContinuityLineMark.type === 'group' && Array.isArray(pastContinuityLineMark.marks)) {
        pastContinuityLineMark.marks[0].encode.update[k] = pastContinuityLineMarkSignal
      }
      if (pastContinuityLineMark) {
        continuityTransforms.push({
          "type": "formula",
          "as": `tween_${field}`,
          "expr": `sequence(datum.${field}, datum.next.${field}, (datum.next.${field} - datum.${field}) * ${msPerFrame / msPerTick})`
        });
        lineContinuityTweenFields.push('tween_' + field);
      }
    }
  })

  if (lineContinuityTweenFields.length > 1) {
    continuityTransforms.push({"type": "flatten", "fields": lineContinuityTweenFields});
  }

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

  if (timeEncoding.continuity) {
    newDatasets.push({
      "name": dataset_continuity,
      "source": dataset_curr,
      "transform": continuityTransforms
    });
  }

  newVgSpec.data.push(...newDatasets);
  newVgSpec.signals = newVgSpec.signals ?? [];
  newVgSpec.signals.push(...newSignals);

  if (timeEncoding.continuity) {
    newVgSpec.marks[0].from.data = dataset_continuity;
  }
  else {
    newVgSpec.marks[0].from.data = dataset_curr;
  }

  newVgSpec.scales = newVgSpec.scales ?? [];
  newVgSpec.scales.push(newScale);

  console.log(JSON.stringify(newVgSpec, null, 2));

  return newVgSpec;
}

// const vgSpec = vl.compile(vlaSpec).spec;
// const injectedVgSpec = injectVlaInVega(vlaSpec, vgSpec);

// initVega(injectedVgSpec);

const renderSpec = (vlaSpec: VlAnimationSpec, id: string): void => {
  const vgSpec = vl.compile(vlaSpec).spec;
  const injectedVgSpec = injectVlaInVega(vlaSpec, vgSpec);
  initVega(injectedVgSpec, id);
}

// This is too much!
/* Object.entries(exampleSpecs).forEach(
  ([specId, spec]) => renderSpec(spec as VlAnimationSpec, specId)
); */

// TODO: casts are bad!
renderSpec(exampleSpecs.gapminder as VlAnimationSpec, "gapminder");

// (window as any).view.addSignalListener('anim_val_curr', (_: any, value: string) => {
//   document.getElementById('year').innerHTML = value;
// })

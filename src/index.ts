import * as vega from 'vega';
import * as vl from 'vega-lite';
import clone from 'lodash.clonedeep';
import { TopLevelUnitSpec } from 'vega-lite/build/src/spec/unit';
import { Encoding } from 'vega-lite/build/src/encoding';
import { AnyMark } from 'vega-lite/build/src/mark';

// Types specific to Vega-Lite Animation

type VlaPastEncoding = {
  "mark"?: AnyMark,
  "encoding"?: Encoding<any>,
  "filter"?: vega.Expr // predicate expr
};

type VlAnimationTimeEncoding = {
  "field": string,
  "scale": {
    "type": "band",
    "range": {"step": number} // TODO: generalize 'step' to vega.RangeBand
  } | {
    "type": "linear",
    "range": [number, number]
  }
  "continuity"?: { "field": string },
  "rescale"?: boolean,
  "interpolateLoop"?: boolean,
  "past"?: boolean | VlaPastEncoding
};

type VlAnimationSpec = TopLevelUnitSpec & { "encoding": { "time": VlAnimationTimeEncoding } };

type ElaboratedVlaPastEncoding = {
  "mark": AnyMark,
  "encoding": Encoding<any>,
  "filter": vega.Expr // predicate expr
};

type ElaboratedVlAnimationTimeEncoding = {
  "field": string,
  "scale": {
    "type": "band",
    "range": {"step": number} // TODO: generalize 'step' to vega.RangeBand
  } | {
    "type": "linear",
    "range": [number, number]
  }
  "continuity"?: { "field": string },
  "rescale": boolean,
  "interpolateLoop": boolean,
  "past": false | ElaboratedVlaPastEncoding
};

type ElaboratedVlAnimationSpec = TopLevelUnitSpec & { "encoding": { "time": ElaboratedVlAnimationTimeEncoding } };

/**
 * fills in implicit values in the vla spec
 * @param vlaSpec 
 * @returns 
 */
const elaborateVla = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {
  // const newVlaSpec = clone(vlaSpec);
  const timeEncoding = vlaSpec.encoding.time;
  // return newVlaSpec;

  let past: ElaboratedVlaPastEncoding;
  if (timeEncoding.past === true) {
    past = {
      "mark": vlaSpec.mark,
      "encoding": vlaSpec.encoding,
      "filter": "true"
    }
  }
  else if (timeEncoding.past) {
    past = {
      "mark": vlaSpec.mark,
      "filter": "true",
      ...timeEncoding.past,
      "encoding": {...vlaSpec.encoding, ...timeEncoding.past.encoding}
    }
  }

  return {
    ...vlaSpec,
    "encoding": {
      ...vlaSpec.encoding,
      "time": {
        ...timeEncoding,
        "rescale": timeEncoding.rescale ?? false,
        "interpolateLoop": timeEncoding.interpolateLoop ?? false,
        past
      }
    }
  }
}

/**
 * Lowers Vega-Lite animation spec to Vega
 * @param vlaSpec 
 * @returns Vega spec
 */
const compileVla = (vlaSpec: ElaboratedVlAnimationSpec): vega.Spec => {
  const newVgSpec = vl.compile(vlaSpec).spec;
  const dataset = newVgSpec.marks[0].from.data; // TODO assumes mark[0] is the main mark
  const timeEncoding = vlaSpec.encoding.time;

  newVgSpec.marks[0].zindex = 999;

  console.log(newVgSpec);

  /* 
  * stack transform controls the layout of bar charts. if it exists, we need to copy
  * the transform into derived animation datasets so that layout still works :(
  * 
  * this works on the bar chart race example and might not generalize, sue me
  */
  let stackTransform: vega.Transforms[] = [];
  if (vlaSpec.mark === 'bar') {
    stackTransform = [...newVgSpec.data[1].transform];
  }

  // dataset stuff

  const datasetSpec = newVgSpec.data.find(d => d.name === dataset);
  datasetSpec.transform = datasetSpec.transform ?? [];

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

  // signal stuff

  const msPerTick = timeEncoding.scale.type === 'band' ?
    timeEncoding.scale.range.step : 500;
  const msPerFrame = 1000/60;

  const newSignals: vega.Signal[] = [
    {
      "name": "t_index", // index of current keyframe in the time field's domain
      "init": "0",
      "on": [
        {
          "events": { "type": "timer", "throttle": msPerTick },
          "update": "t_index < length(domain('time')) - 1 ? t_index + 1 : 0" // goes from 0 to len(domain) - 1 and wraps
        }
      ]
    },
    {
      "name": "min_extent", // min value of time domain
      "init": "extent(domain('time'))[0]"
    },
    {
      "name": "max_extent", // max value of time domain
      "init": "extent(domain('time'))[1]"
    },
    {
      "name": "anim_val_curr", // current keyframe's value in time domain
      "update": "domain('time')[t_index]"
    },
    {
      "name": "anim_val_next", // next keyframe's value in time domain
      // if interpolateLoop is true, we want to tween between last and first keyframes. therefore, next of last is first
      "update": `t_index < length(domain('time')) - 1 ? domain('time')[t_index + 1] : ${timeEncoding.interpolateLoop ? 'min_extent' : 'max_extent'}`
    },
    {
      "name": "anim_tween", // tween signal between keyframes
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

  // scale

  const newScale: vega.Scale =
  {
    "name": "time",
    "type": "ordinal",
    "domain": { "data": dataset, "field": timeEncoding.field, "sort": true }
  };

  if (timeEncoding.past) {
    /* 
    * we create a new mark based on the past encoding. this mark shows the past data
    * we generate the vega for this mark by creating a vega-lite spec and compiling it down
    */
    const pastEncoding = timeEncoding.past as VlaPastEncoding;
    const vlPastEncodingSpec: TopLevelUnitSpec = {
      data: vlaSpec.data,
      mark: pastEncoding.mark,
      encoding: pastEncoding.encoding,
    }
    if (vlPastEncodingSpec.mark === 'line') {
      vlPastEncodingSpec.encoding.order = {field: timeEncoding.field};
    }
    const pastMark = vl.compile(vlPastEncodingSpec).spec.marks[0];

    if (vlPastEncodingSpec.mark === 'line') {
      // make the line connect to the current point
      (datasetPastSpec.transform[0] as vega.FilterTransform).expr = `datum['${timeEncoding.field}'] <= anim_val_curr`;
    }

    if (pastEncoding.filter) {
      (datasetPastSpec.transform[0] as vega.FilterTransform).expr += ` && (${pastEncoding.filter})`;
    }

    pastMark.name = pastMark.name + '_past';
    if ((pastMark.from as any).facet) {
      // newMark is a faceted line mark
      (pastMark.from as any).facet.data = dataset_past;
    }
    else {
      pastMark.from.data = dataset_past;
    }
    newVgSpec.marks.push(pastMark)
    newDatasets.push(datasetPastSpec);

    // 
    if (timeEncoding.continuity) {
      if (pastMark.type === 'line' || pastMark.type === 'group') {
        // create a third mark to tween the line to follow the current point
        const pastContinuityMark = clone(pastMark);
        pastMark.name = pastMark.name + '_continuity';
        if ((pastMark.from as any).facet) {
          // newMark is a faceted line mark
          (pastMark.from as any).facet.data = dataset_continuity;
        }
        else {
          pastMark.from.data = dataset_continuity;
        }
        newVgSpec.marks.push(pastContinuityMark)

        // transforms to generate tween data for the continuity mark
        continuityTransforms.push({
          "type": "formula",
          "as": "tween",
          "expr": `sequence(0, 1, ${msPerFrame / msPerTick})`
        }, {
          "type": "flatten",
          "fields": ["tween"]
        })
      }
    }
  }

  type ScaleFieldValueRef = {scale: vega.Field, field: vega.Field}; // ScaledValueRef

  // this part is for adding tween / lerp signals to mark encoding
  Object.entries(newVgSpec.marks[0].encode.update).forEach(([k, v]) => {
    let encodingDef = newVgSpec.marks[0].encode.update[k];
    if (Array.isArray(encodingDef)) {
      // i don't remember why but i think if there's a conditional encoding it will be an array
      encodingDef = encodingDef[encodingDef.length - 1];
    }
    if ((encodingDef as ScaleFieldValueRef).field) {
      const {scale, field} = encodingDef as ScaleFieldValueRef;

      if (scale) {
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
          // rescale: the scale updates based on the animation frame
          (scaleSpec.domain as vega.ScaleDataRef).data = dataset_curr;
          if (!newVgSpec.scales.find(s => s.name === scaleSpec.name + '_next')) {
            // if it doesn't already exist, create a "next" scale for the current scale
            const scaleSpecNext = clone(scaleSpec);
            scaleSpecNext.name = scaleSpec.name + '_next';
            (scaleSpecNext.domain as vega.ScaleDataRef).data = dataset_next;
            newVgSpec.scales.push(scaleSpecNext);
          }
        }
      }

      const lerp_term = scale === 'color' ? // color scales map numbers to strings, so lerp before scale
        `isValid(datum.next) ? scale('${scale}', lerp([datum.${field}, datum.next.${field}], anim_tween)) : scale('${scale}', datum.${field})` :
        scale ? // e.g. position scales map anything to numbers, so scale before lerp
          `isValid(datum.next) ? lerp([scale('${scale}', datum.${field}), scale('${timeEncoding.rescale ? scale + '_next' : scale}', datum.next.${field})], anim_tween) : scale('${scale}', datum.${field})` :
          // e.g. map projections have field but no scale. you can directly lerp the field
          `isValid(datum.next) ? lerp([datum.${field}, datum.next.${field}], anim_tween) : datum.${field}`

      newVgSpec.marks[0].encode.update[k] = {
        "signal": lerp_term
      }

      const pastContinuityLineMark = newVgSpec.marks.find(mark => mark.name.endsWith('_continuity'));
      // if there is a past mark that is a line and continuity is enabled
      if (pastContinuityLineMark) {
        // this signal tweens the end of the line to the current point
        const pastContinuityLineMarkSignal = {
          "signal": `isValid(datum.tween_${field}) && datum.tween <= anim_tween ? ${scale ? `scale('${scale}', datum.tween_${field})` : `datum.tween_${field}`} : (${lerp_term})`
        };

        // set the update signal on the past mark
        if (pastContinuityLineMark.type === 'line') {
          pastContinuityLineMark.encode.update[k] = pastContinuityLineMarkSignal
        }
        else if (pastContinuityLineMark.type === 'group' && Array.isArray(pastContinuityLineMark.marks)) {
          pastContinuityLineMark.marks[0].encode.update[k] = pastContinuityLineMarkSignal
        }

        continuityTransforms.push({
          "type": "formula",
          "as": `tween_${field}`,
          "expr": `lerp([toNumber(datum.${field}), toNumber(datum.next.${field})], datum.tween)`
        });
      }
    }
  })

  // show the keyframe's current value in time domain
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
    // do not move this higher up in the file
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

////////////////////////////////////////////////////

/**
 * Renders vega spec into DOM
 * @param vgSpec Vega spec
 * @param id id for container div
 */
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

/**
 * 
 * @param vlaSpec Vega-Lite animation spec
 * @param id id for a container to append to DOM and attach vega embed
 */
const renderSpec = (vlaSpec: VlAnimationSpec, id: string): void => {
  const elaboratedVlaSpec = elaborateVla(vlaSpec);
  console.log(elaboratedVlaSpec)
  const injectedVgSpec = compileVla(elaboratedVlaSpec);
  initVega(injectedVgSpec, id);
}

// This is too much!
/* Object.entries(exampleSpecs).forEach(
  ([specId, spec]) => renderSpec(spec as VlAnimationSpec, specId)
); */

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

// casts are bad!
renderSpec(exampleSpecs.connectedScatterplot as VlAnimationSpec, "connectedScatterplot");

// (window as any).view.addSignalListener('anim_val_curr', (_: any, value: string) => {
//   document.getElementById('year').innerHTML = value;
// })

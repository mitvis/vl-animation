import * as vega from 'vega';
import * as vl from 'vega-lite';
import clone from 'lodash.clonedeep';
import { ElaboratedVlAnimationSelection, ElaboratedVlAnimationSpec, ElaboratedVlAnimationTimeEncoding, ElaboratedVlAnimationUnitSpec, VlAnimationSelection, VlAnimationSpec } from '..';
import { EventStream, isArray } from 'vega';
import { VariableParameter } from 'vega-lite/build/src/parameter';
import { SelectionParameter, isSelectionParameter, PointSelectionConfig } from 'vega-lite/build/src/selection';
import { Transform, FilterTransform } from 'vega-lite/build/src/transform';
import { ParameterPredicate } from 'vega-lite/build/src/predicate';
import { FieldDef } from 'vega-lite/build/src/channeldef';
// Types specific to Vega-Lite Animation

export const isParamAnimationSelection = (param: any): param is VlAnimationSelection => {
  if (!isSelectionParameter(param)) {
    return false;
  }
  const pointSelect = param.select as PointSelectionConfig;
  if (pointSelect.type !== 'point') {
    return false;
  }
  if (pointSelect.on === 'timer' || (pointSelect.on as EventStream).type === 'timer') {
    return true;
  }
  return false;
}

export const getAnimationSelectionFromParams = (params: (VariableParameter | SelectionParameter)[]): VlAnimationSelection[] => {
  return params.filter(param => {
    return isParamAnimationSelection(param);
  }) as VlAnimationSelection[];
}

const getAnimationFilterTransforms = (transform: Transform[], animSelections: VlAnimationSelection[]): FilterTransform[] => {
  return (transform ?? []).filter(transform => {
    return (transform as FilterTransform).filter && animSelections.some(s => ((transform as FilterTransform).filter as ParameterPredicate).param.includes(s.name));
  }) as FilterTransform[];
}

const sanitizeVlaSpec = (vlaSpec: ElaboratedVlAnimationSpec): ElaboratedVlAnimationSpec => {
  // remove the animation selections (we will compile them down manually into signals and datasets)
  const animationSelections = getAnimationSelectionFromParams(vlaSpec.params);
  const animationFilterTransforms = getAnimationFilterTransforms(vlaSpec.transform, animationSelections);
  //
  return {
    ...vlaSpec,
    "params": [...vlaSpec.params.filter(param => !(animationSelections.includes(param as VlAnimationSelection)))],
    "transform": [...(vlaSpec.transform ?? []).filter(t => !animationFilterTransforms.includes(t as FilterTransform))]
  }
}

const createAnimationClock = (animSelection: ElaboratedVlAnimationSelection): Partial<vega.Spec> => {
  const throttleMs = 500;

  const signals: vega.Signal[] = [
    {
      "name": "anim_clock", // ms elapsed in animation
      "init": "0",
      "on": [
        {
          "events": {"type": "timer", "throttle": throttleMs},
          "update": `anim_clock > max_range_extent ? 0 : (${animSelection.select.on.filter} ? anim_clock + ${throttleMs} : anim_clock)`
        }
      ]
    },
    {
      "name": "max_range_extent", // max value of time range
      "init": "extent(range('time'))[1]"
    }
  ];

  return {
    signals
  }
}

const compileTimeScale = (timeEncoding: ElaboratedVlAnimationTimeEncoding, dataset: string, stackTransform: vega.Transforms[]): Partial<vega.Spec> => {

  let scales: vega.Scale[] = [
    {
      // a continuous scale for mapping values into time
      // the fact that we need both suggests to me we probably want to make a new scale type that goes discrete -> continuous?
      "name": "time",
      "type": "linear",
      "zero": false,
      "domain": timeEncoding.scale.domain ?? { "data": dataset, "field": timeEncoding.field },
      "range": timeEncoding.scale.range ?? [0, 60000]
    }
  ];

  let signals: vega.Signal[] = [];

  let data: vega.Data[] = [];

  if (!timeEncoding.scale.domain) {
    // if there's no explicit domain, it's a field domain. therefore, there are discrete data values to match
    scales = [
      ...scales,
      {
        // an ordinal scale for getting the individual values in the discrete data domain
        "name": `${timeEncoding.field}_ordinal`,
        "type": "ordinal",
        "domain": { "data": dataset, "field": timeEncoding.field, "sort": true }
      },
    ];

    signals = [
      ...signals,
      {
        "name": `${timeEncoding.field}_domain`,
        "init": `domain('${timeEncoding.field}_ordinal')`
      },
      {
        "name": "t_index", // index of current keyframe in the time field's domain
        "init": "0",
        "on": [
          {
            "events": { "signal": "anim_clock" },
            // increment index if anim_clock passes the scale value of the next item. if incrementing, wrap to 0 if out of bounds.
            "update": `scale('time', anim_val_next) <= anim_clock ? (t_index < length(${timeEncoding.field}_domain) - 1 ? t_index + 1 : 0) : t_index`
          }
        ]
      },
      {
        "name": "min_extent", // min value of time field domain
        "init": `extent(${timeEncoding.field}_domain)[0]`
      },
      {
        "name": "max_extent", // max value of time field domain
        "init": `extent(${timeEncoding.field}_domain)[1]`
      },
      {
        "name": "anim_val_curr", // current keyframe's value in time field domain
        "update": `${timeEncoding.field}_domain[t_index]`
      },
      {
        "name": "anim_val_next", // next keyframe's value in time domain
        // if interpolate.loop is true, we want to tween between last and first keyframes. therefore, next of last is first
        "update": `t_index < length(${timeEncoding.field}_domain) - 1 ? ${timeEncoding.field}_domain[t_index + 1] : ${timeEncoding.interpolate.loop ? 'min_extent' : 'max_extent'}`
      },
      {
        "name": "anim_tween", // tween signal between keyframes
        "init": "0",
        "on": [
          {
            "events": { "signal": "anim_clock" },
            "update": `(anim_clock - scale('time', anim_val_curr)) / (scale('time', anim_val_next) - scale('time', anim_val_curr))`
          },
          {
            "events": { "signal": "anim_val_curr" },
            "update": "0"
          }
        ]
      }
    ];

    data = [
      ...data,
      {
        "name": `${dataset}_next`,
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
  }
  else {
    // otherwise, we're dealing with a continuous domain and want to use the scale directly
    signals = [
      ...signals,
      {
        "name": "anim_val_curr", // current keyframe's value in time field domain
        "update": "invert('time', anim_clock)"
      }
      // TODO
    ]
  }

  return {
    scales,
    signals
  };
}

const compileAnimationSelections = (animationSelections: ElaboratedVlAnimationSelection[], dataset: string, field: string, stackTransform: vega.Transforms[]): Partial<vega.Spec> => {
  return animationSelections.map(animSelection => {
    // const signals: vega.Signal[] = [
    //   {
    //     "name": `${animSelection.name}_toggle`,
    //     "value": false
    //   },
    //   {
    //     "name": `${animSelection.name}_tuple_fields`,
    //     "value": [
    //       {
    //         "type": "E",
    //         "field": field
    //       }
    //     ]
    //   },
    //   {
    //     "name": `${animSelection.name}_tuple`,
    //     "on": [
    //       {
    ////         "events": { "signal": "anim_clock" },
    //         "events": { "signal": "anim_val_curr" },
    //         "update": `{unit: "", fields: ${animSelection.name}_tuple_fields, values: [anim_val_curr]}`,
    //         "force": true
    //       },
    //       {
    //         "events": [
    //           {
    //             "source": "view",
    //             "type": "dblclick"
    //           }
    //         ],
    //         "update": "null"
    //       }
    //     ]
    //   }
    // ];

    // TODO think about what happens if there's more than one animSelection

    let predicateExpr = `datum['${field}'] == anim_val_curr`;
    if (animSelection.select.predicate) {
      const vlPredSpec = {
        "mark": "circle",
        "transform": [
          {
            "filter": animSelection.select.predicate
          }
        ]
      };
      predicateExpr = (vl.compile(vlPredSpec as any).spec as any).data[1].transform[0].expr;
    }

    const dataset_curr = dataset + "_curr";

    const data: vega.Data[] = [
      {
        "name": dataset_curr,
        "source": dataset,
        "transform": [
          {
            "type": "filter",
            "expr": predicateExpr
          },
          ...stackTransform
        ]
      }
    ]

    return {
      data
    }
  }).reduce((prev, curr) => {
    return mergeSpecs(curr as any, prev as any) as any; // lmao
  });
}

const compileInterpolation = (timeEncoding: ElaboratedVlAnimationTimeEncoding, dataset: string): Partial<vega.Spec> => {
  if (timeEncoding.interpolate !== false) {
    const dataset_curr = dataset + "_curr";
    const dataset_next = dataset + "_next";
    const dataset_interpolate = dataset + "_interpolate";

    // TODO line interpolation special case
    const data: vega.Data[] = [
      {
        "name": dataset_interpolate,
        "source": dataset_curr,
        "transform": [
          {
            "type": "lookup",
            "from": dataset_next,
            "key": timeEncoding.interpolate.field,
            "fields": [timeEncoding.interpolate.field],
            "as": ["next"]
          },
          {
            "type": "filter",
            "expr": "isValid(datum.next)"
          }
        ]
      }
    ];

    // TODO add all the lerp shit to the mark encodings

    return {
      data
    };
  }

  return {};
}

const mergeSpecs = (vgSpec: vega.Spec, vgPartialSpec: Partial<vega.Spec>): vega.Spec => {
  if (vgPartialSpec.scales) {
    const newScaleNames = vgPartialSpec.scales.map(s => s.name);
    vgSpec = {
      ...vgSpec,
      scales: (vgSpec.scales ?? []).filter(s => !newScaleNames.includes(s.name)).concat(vgPartialSpec.scales)
    }
  }
  if (vgPartialSpec.signals) {
    const newSignalNames = vgPartialSpec.signals.map(s => s.name);
    vgSpec = {
      ...vgSpec,
      signals: (vgSpec.signals ?? []).filter(s => !newSignalNames.includes(s.name)).concat(vgPartialSpec.signals)
    }
  }
  if (vgPartialSpec.data) {
    const newDatasetNames = vgPartialSpec.data.map(s => s.name);
    vgSpec = {
      ...vgSpec,
      data: (vgSpec.data ?? []).filter(s => !newDatasetNames.includes(s.name)).concat(vgPartialSpec.data)
    }
  }
  return vgSpec;
}

const compileUnitVla = (vlaSpec: ElaboratedVlAnimationUnitSpec): vega.Spec => {
  const sanitizedVlaSpec = sanitizeVlaSpec(vlaSpec);
  console.log('sanitized', sanitizedVlaSpec)

  let vgSpec = vl.compile(sanitizedVlaSpec as vl.TopLevelSpec).spec;
  console.log('compiled', vgSpec)
  const timeEncoding = vlaSpec.encoding.time;
  const dataset = vgSpec.marks[0].from.data; // TODO assumes mark[0] is the main mark

  const animationSelections = getAnimationSelectionFromParams(vlaSpec.params) as ElaboratedVlAnimationSelection[];
  const animationFilters = getAnimationFilterTransforms(vlaSpec.transform, animationSelections);

  /*
  * stack transform controls the layout of bar charts. if it exists, we need to copy
  * the transform into derived animation datasets so that layout still works :(
  */
  let stackTransform: vega.Transforms[] = [];
  if (vlaSpec.mark === 'bar') {
    stackTransform = [...vgSpec.data[1].transform];
  }


  vgSpec = mergeSpecs(vgSpec,
    createAnimationClock(animationSelections[0])); // TODO think about what happens if there's more than one animSelection
  vgSpec = mergeSpecs(vgSpec,
    compileTimeScale(timeEncoding, dataset, stackTransform));
  vgSpec = mergeSpecs(vgSpec,
    compileAnimationSelections(animationSelections, dataset, timeEncoding.field, stackTransform));

  // apply filter transform
  if (animationFilters.length) {
    if (timeEncoding.interpolate) {
      vgSpec.marks[0].from.data = dataset + '_interpolate'; // TODO assumes mark[0]
    }
    else {
      vgSpec.marks[0].from.data = dataset + '_curr'; // TODO assumes mark[0]
    }
  }

  // apply conditional encodes


  vgSpec = mergeSpecs(vgSpec,
    compileInterpolation(timeEncoding, dataset));


  return vgSpec;
}


/**
* Lowers Vega-Lite animation spec to Vega
* @param vlaSpec
* @returns Vega spec
*/
const oldCompileVla = (vlaSpec: ElaboratedVlAnimationSpec): vega.Spec => {
  const newVgSpec = vl.compile(vlaSpec).spec;
  const dataset = newVgSpec.marks[0].from.data; // TODO assumes mark[0] is the main mark
  const timeEncoding = vlaSpec.encoding.time;

  const selections : SelectionTypes[] = ['enter','exit']


  // for each mark and each property, add the exit and update properties to enter
  // NOTE: BROKEN
  for(const selection of selections){
    const encoding = vlaSpec[selection];
    if(!encoding) continue;

    for(let markCounter = 0; markCounter < newVgSpec.marks.length; markCounter++){
      for(const [propertyName,propertyValue] of Object.entries(encoding.encoding)){
        if(!newVgSpec.marks[markCounter]['encode'][selection]){
          newVgSpec.marks[markCounter]['encode'][selection] = {};
        }

        newVgSpec.marks[markCounter]['encode'][selection][propertyName] = {"value":propertyValue}
      }
    }
  }


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




  //old dataset start
  const datasetSpec = newVgSpec.data.find(d => d.name === dataset);
  datasetSpec.transform = datasetSpec.transform ?? [];

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

  // Question: what does the lookup do? What's "as":["next"]?
  const continuityTransforms: vega.Transforms[] = [
    {
      "type": "lookup",
      "from": dataset_next,
      "key": timeEncoding.interpolate?.field,
      "fields": [timeEncoding.interpolate?.field],
      "as": ["next"]
    },
    {
      "type": "filter",
      "expr": "isValid(datum.next)"
    }
  ];


  /*
  * signal stuff
  */
  const msPerTick = timeEncoding.scale.type === 'band' ?
  timeEncoding.scale.range.step : 500;
  const msPerFrame = 1000/60;

  const newSignals: vega.Signal[] = [
    // Question: is this signal how we "move through" the time? Our event is just every msPerTick and then we run update?
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
    // Question: how do I know what functions (ie "domian" or "extent") exist?
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
      "name": "anim_val_previous", // next keyframe's value in time domain
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

  /*
  * scale stuff
  */
  // Question: does this need to become something that is calculated?
  // Question: if so, where do I find the "scale" in the google doc?
  const newScale: vega.Scale =
  {
    "name": "time",
    "type": "ordinal",
    "domain": { "data": dataset, "field": timeEncoding.field, "sort": true }
  };



  /*
  * past

  if (timeEncoding.past) {
    // Question: is this how you make a mark present? Is there a doc that goes into what the zIndex of various chart elements is?
    newVgSpec.marks[0].zindex = 999;



    // we create a new mark based on the past encoding. this mark shows the past data
    // we generate the vega for this mark by creating a vega-lite spec and compiling it down

    // Question: Can we go through what this change would look like? Is it just we calculate past via time window.
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

    // Question
    if (pastEncoding.filter) {
      (datasetPastSpec.transform[0] as vega.FilterTransform).expr += ` && (${pastEncoding.filter})`;
    }

    // Question why is the .name property important?
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

    // Question: what is contintity?
    // past and continuity
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

  {
    "type": "geojson",
    "fields": ["longitude", "latitude"],
    "signal": "geojson_0"
  },
  {
    "type": "geopoint",
    "projection": "projection",
    "fields": ["longitude", "latitude"],
    "as": ["x", "y"]
  }

  */

  type ScaleFieldValueRef = {scale: vega.Field, field: vega.Field}; // ScaledValueRef


  /*
  * adding tween / lerp signals to mark encodings
  */
  Object.entries(newVgSpec.marks[0].encode.update).forEach(([k, v]) => {
    let encodingDef = newVgSpec.marks[0].encode.update[k];
    if (Array.isArray(encodingDef)) {
      // for production rule encodings, the encoding is an array. the last entry is the default def
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

  if (timeEncoding.interpolate) {
    // do not move this higher up in the file
    newDatasets.push({
      "name": dataset_continuity,
      "source": dataset_curr,
      "transform": continuityTransforms
    });
  }

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

  newVgSpec.data.push(...newDatasets);
  newVgSpec.signals = newVgSpec.signals ?? [];
  newVgSpec.signals.push(...newSignals);

  if (timeEncoding.interpolate) {
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

export default compileUnitVla;
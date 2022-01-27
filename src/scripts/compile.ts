import * as vega from 'vega';
import * as vl from 'vega-lite';
import clone from 'lodash.clonedeep';
import { ElaboratedVlAnimationSelection, ElaboratedVlAnimationSpec, ElaboratedVlAnimationTimeEncoding, ElaboratedVlAnimationUnitSpec, VlAnimationSelection, VlAnimationSpec, VlAnimationTimeScale } from '..';
import { EventStream } from 'vega';
import { VariableParameter } from 'vega-lite/build/src/parameter';
import { SelectionParameter, isSelectionParameter, PointSelectionConfig } from 'vega-lite/build/src/selection';
import { Transform, FilterTransform } from 'vega-lite/build/src/transform';
import { FieldEqualPredicate, FieldGTEPredicate, FieldGTPredicate, FieldLTEPredicate, FieldLTPredicate, FieldOneOfPredicate, FieldPredicate, FieldRangePredicate, FieldValidPredicate, ParameterPredicate, Predicate } from 'vega-lite/build/src/predicate';
import { LogicalAnd } from 'vega-lite/build/src/logical';
import { Encoding } from 'vega-lite/build/src/encoding';

type ScaleFieldValueRef = {scale: vega.Field, field: vega.Field}; // ScaledValueRef

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
  if (vgPartialSpec.marks) {
    const newMarkNames = vgPartialSpec.marks.map(s => s.name);
    vgSpec = {
      ...vgSpec,
      marks: (vgSpec.marks ?? []).filter(s => !newMarkNames.includes(s.name)).concat(vgPartialSpec.marks)
    }
  }
  if (vgPartialSpec.scales) {
    const newScaleNames = vgPartialSpec.scales.map(s => s.name);
    vgSpec = {
      ...vgSpec,
      scales: (vgSpec.scales ?? []).filter(s => !newScaleNames.includes(s.name)).concat(vgPartialSpec.scales)
    }
  }
  return vgSpec;
}

const createAnimationClock = (animSelection: ElaboratedVlAnimationSelection): Partial<vega.Spec> => {
  const throttleMs = 1000/60;

  const signals: vega.Signal[] = [
    {
      "name": "anim_clock", // ms elapsed in animation
      "init": "0",
      "on": [
        {
          "events": {"type": "timer", "throttle": throttleMs},
          "update": `${animSelection.select.on.filter} ? (anim_clock + (now() - last_tick_at) > max_range_extent ? 0 : anim_clock + (now() - last_tick_at)) : anim_clock`
        }
      ]
    },
    {
      "name": "last_tick_at",
      "init": "now()",
      "on": [
        {
          "events": {"signal": "anim_clock"},
          "update": "now()"
        }
      ]
    }
  ];

  return {
    signals
  }
}

const compileTimeScale = (timeEncoding: ElaboratedVlAnimationTimeEncoding, dataset: string, stackTransform: vega.Transforms[]): Partial<vega.Spec> => {

  let scales: vega.Scale[] = [];
  let data: vega.Data[] = [];
  let signals: vega.Signal[] = [];


  if (timeEncoding.scale.type === 'linear') {
    scales = [
      ...scales,
      {
        // a continuous scale for mapping values into time
        "name": "time",
        "type": "linear",
        "zero": (timeEncoding.scale as any).zero ?? false,
        "domain": timeEncoding.scale.domain ?? { "data": dataset, "field": timeEncoding.field },
        "range": timeEncoding.scale.range
      } as vega.LinearScale
    ]
    signals = [
      ...signals,
      {
        "name": "anim_val_curr", // current keyframe's value in time field domain
        "update": "invert('time', anim_clock)"
      },
      {
        "name": "max_range_extent", // max value of time range
        "init": "extent(range('time'))[1]"
      }
    ]
  }
  else {
    // if there's no explicit domain, it's a field domain. therefore, there are discrete data values to match
    scales = [
      ...scales,
      {
        // a band scale for getting the individual values in the discrete data domain
        "name": `time_${timeEncoding.field}`,
        "type": "band",
        "domain": timeEncoding.scale.domain ?? { "data": dataset, "field": timeEncoding.field },
        "range": timeEncoding.scale.range,
        "align": 0
      } as vega.BandScale
    ];

    signals = [
      ...signals,
      {
        "name": `${timeEncoding.field}_domain`,
        "init": `domain('time_${timeEncoding.field}')`
      },
      {
        "name": "t_index", // index of current keyframe in the time field's domain
        "init": "0",
        "on": [
          {
            "events": { "signal": "anim_clock" },
            "update": `indexof(${timeEncoding.field}_domain, invert('time_${timeEncoding.field}', anim_clock))`
          }
        ]
      },
      {
        "name": "max_range_extent", // max value of time range
        "init": `extent(range('time_${timeEncoding.field}'))[1]`
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
        "update": `invert('time_${timeEncoding.field}', anim_clock)`
      }
    ]

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

  return {
    data,
    scales,
    signals
  };
}

const compileAnimationSelections = (animationSelections: ElaboratedVlAnimationSelection[], field: string, next?: boolean): Partial<vega.Spec> => {
  let anim_signal = 'anim_val_curr';
  if (next) {
    anim_signal = 'anim_val_next';
  }
  const predicateToTupleType = (predicate: FieldPredicate) => {
    if ((predicate as FieldEqualPredicate).equal) {
      return "E";
    }
    else if ((predicate as FieldLTPredicate).lt) {
      return "E-LT";
    }
    else if ((predicate as FieldGTPredicate).gt) {
      return "E-GT";
    }
    else if ((predicate as FieldLTEPredicate).lte) {
      return "E-LTE";
    }
    else if ((predicate as FieldGTEPredicate).gte) {
      return "E-GTE";
    }
    else if ((predicate as FieldRangePredicate).range) {
      return "R";
    }
    else if ((predicate as FieldOneOfPredicate).oneOf) {
      return "E";
    }
    else if ((predicate as FieldValidPredicate).valid) {
      return "E-VALID";
    }
    return "E"; // shrug
  }

  return animationSelections.map(animSelection => {
    let signals: vega.Signal[] = [
      {
        "name": `${animSelection.name}_toggle`,
        "value": false
      }
    ];

    if (animSelection.select.predicate) {
      const predicate = animSelection.select.predicate;
      const and = (predicate as LogicalAnd<FieldPredicate>).and;
      // TODO: this will currently only support a non-nested "and" composition or a single pred because i do not want to deal
      signals = [
        ...signals,
        {
          "name": `${animSelection.name}_tuple_fields`,
          "value": and ? and.map(p => {
            const pred = p as FieldPredicate; // no nesting haha
            return {
              "type": predicateToTupleType(pred),
              "field": pred.field
            }
          }) : [{
            "type": predicateToTupleType(predicate as FieldPredicate),
            "field": (predicate as FieldPredicate).field
          }]
        },
        {
          "name": `${animSelection.name}_tuple`,
          "on": [
            {
              "events": { "signal": anim_signal },
              "update": `{unit: "", fields: ${animSelection.name}_tuple_fields, values: [${Array(and ? and.length : 1).fill(anim_signal).join(', ')}]}`,
              "force": true
            }
          ]
        }
      ]
    }
    else {
      signals = [
        ...signals,
        {
          "name": `${animSelection.name}_tuple_fields`,
          "value": [
            {
              "type": "E",
              "field": field
            }
          ]
        },
        {
          "name": `${animSelection.name}_tuple`,
          "on": [
            {
              "events": { "signal": "anim_clock" },
              "update": `{unit: "", fields: ${animSelection.name}_tuple_fields, values: [${anim_signal}]}`,
              "force": true
            }
          ]
        }
      ];
    }

    // TODO think about what happens if there's more than one animSelection

    return {
      signals
    }
  }).reduce((prev, curr) => {
    return mergeSpecs(curr as any, prev as any) as any; // lmao
  });
}

const compileFilterTransforms = (animationFilters: FilterTransform[], animationSelections: ElaboratedVlAnimationSelection[], dataset: string, markSpecs: vega.Mark[], next?: boolean): Partial<vega.Spec> => {
  if (animationFilters.length) {

    let dataset_name = `${dataset}_curr`;
    if (next) {
      dataset_name = `${dataset}_next`
    }

    const vlSpec = {
      "mark": "circle",
      "params": animationSelections,
      "transform": animationFilters
    };
    const datasetSpec = {
      ...((vl.compile(vlSpec as any).spec as any).data as any[]).find(d => d.name === 'data_0'),
      "name": dataset_name,
      "source": dataset
    };

    let marks = [];

    marks = markSpecs.map(markSpec => {
      if (markSpec.from.data === dataset) {
        markSpec.from.data = `${dataset}_curr`;
      }
      return markSpec;
    });

    return {
      data: [datasetSpec],
      marks
    };
  }
  return {};
}

const compileInterpolation = (animationSelections: ElaboratedVlAnimationSelection[], animationFilters: FilterTransform[], timeEncoding: ElaboratedVlAnimationTimeEncoding, dataset: string, markSpecs: vega.Mark[], scaleSpecs: vega.Scale[]): Partial<vega.Spec> => {
  if (timeEncoding.interpolate !== false) {

    const animSelectionsNext = animationSelections.map(s => {
      return {...s, "name": s.name + '_next'}
    })
    const animationFiltersNext = animationFilters.map(f => {
      return {
        ...f,
        "filter": {
          ...(f.filter as any),
          "param": (f.filter as ParameterPredicate).param + '_next'
        }
      }
    })

    const vlAnimSelSpec = {
      "mark": "circle",
      "params": animSelectionsNext
    }
    const vgAnimSelSpec = vl.compile(vlAnimSelSpec as any).spec
    const compiledAnimSelections = mergeSpecs({signals: vgAnimSelSpec.signals, data: [vgAnimSelSpec.data[0]]}, compileAnimationSelections(animSelectionsNext, timeEncoding.field, true));
    const compiledFilterTransforms = compileFilterTransforms(animationFiltersNext, animSelectionsNext, dataset, [], true);

    const dataset_curr = `${dataset}_curr`;
    const dataset_next = `${dataset}_next`;
    const dataset_interpolate = `${dataset}_interpolate`;

    const signals: vega.Signal[] = [
      {
        "name": "anim_val_next", // next keyframe's value in time domain
        // if interpolate.loop is true, we want to tween between last and first keyframes. therefore, next of last is first
        "update": `t_index < length(${timeEncoding.field}_domain) - 1 ? ${timeEncoding.field}_domain[t_index + 1] : ${timeEncoding.interpolate && timeEncoding.interpolate.loop ? 'min_extent' : 'max_extent'}`
      },
      {
        "name": "anim_tween", // tween signal between keyframes
        "init": "0",
        "on": [
          {
            "events": { "signal": "anim_clock" },
            "update": `anim_val_next != anim_val_curr ? (anim_clock - scale('time_${timeEncoding.field}', anim_val_curr)) / (scale('time_${timeEncoding.field}', anim_val_next) - scale('time_${timeEncoding.field}', anim_val_curr)) : 0`
          },
          {
            "events": { "signal": "anim_val_curr" },
            "update": "0"
          }
        ]
      }
    ]

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

    let scales: vega.Scale[] = [];

    const marks = markSpecs.map(markSpec => {
      if (markSpec.from?.data == dataset_curr) {
        markSpec.from.data = dataset_interpolate;

        Object.keys(markSpec.encode.update).forEach((k) => {
          let encodingDef = markSpec.encode.update[k];
          if (Array.isArray(encodingDef)) {
            // for production rule encodings, the encoding is an array. the last entry is the default def
            encodingDef = encodingDef[encodingDef.length - 1];
          }
          if ((encodingDef as ScaleFieldValueRef).field) {
            const {scale, field} = encodingDef as ScaleFieldValueRef;

            if (scale) {
              const scaleSpec = scaleSpecs.find(s => s.name === scale);
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
                scales = scales.filter(s => s.name !== scaleSpec.name).concat([scaleSpec]);
                if (!scaleSpecs.find(s => s.name === scaleSpec.name + '_next')) {
                  // if it doesn't already exist, create a "next" scale for the current scale
                  const scaleSpecNext = clone(scaleSpec);
                  scaleSpecNext.name = scaleSpec.name + '_next';
                  (scaleSpecNext.domain as vega.ScaleDataRef).data = dataset_next;
                  scales = [...scales, scaleSpecNext];
                }
              }
            }

            const lerp_term = scale === 'color' ? // color scales map numbers to strings, so lerp before scale
            `isValid(datum.next) ? scale('${scale}', lerp([datum.${field}, datum.next.${field}], anim_tween)) : scale('${scale}', datum.${field})` :
            scale ? // e.g. position scales map anything to numbers, so scale before lerp
            `isValid(datum.next) ? lerp([scale('${scale}', datum.${field}), scale('${timeEncoding.rescale ? scale + '_next' : scale}', datum.next.${field})], anim_tween) : scale('${scale}', datum.${field})` :
            // e.g. map projections have field but no scale. you can directly lerp the field
            `isValid(datum.next) ? lerp([datum.${field}, datum.next.${field}], anim_tween) : datum.${field}`

            markSpec.encode.update[k] = {
              "signal": lerp_term
            }
          }
        });
      }
      return markSpec;
    });

    const spec = {
      data,
      signals,
      marks,
      scales
    };

    return mergeSpecs(mergeSpecs(compiledAnimSelections, compiledFilterTransforms), spec);
  }

  return {};
}

const compileEnterExit = (vlaSpec: ElaboratedVlAnimationUnitSpec, markSpecs: vega.Mark[], dataset: string, enter: Encoding<any>, exit: Encoding<any>): Partial<vega.Spec> => {
  let marks = markSpecs;

  if (enter) {
    const vlEnterSpec = {
      ...vlaSpec,
      "encoding": enter
    };
    const enterKeys = Object.keys(enter);
    const vgEnterSpec = vl.compile(vlEnterSpec as any).spec;

    marks = markSpecs.map(markSpec => {
      if (markSpec.from.data === dataset || markSpec.from.data.startsWith(dataset + "_")) {
        const vgUpdate = vgEnterSpec.marks.find(mark => mark.name === markSpec.name).encode.update;
        const filtered = Object.keys(vgUpdate)
          .filter(key => enterKeys.includes(key))
          .reduce((obj, key) => {
            (obj as any)[key] = vgUpdate[key];
            return obj;
          }, {});
        markSpec.encode.enter = filtered;
      }
      return markSpec;
    })
  }

  if (exit) {
    const vlExitSpec = {
      ...vlaSpec,
      "encoding": exit
    };
    const exitKeys = Object.keys(exit);
    const vgExitSpec = vl.compile(vlExitSpec as any).spec;

    marks = markSpecs.map(markSpec => {
      if (markSpec.from.data === dataset || markSpec.from.data.startsWith(dataset + "_")) {
        const vgUpdate = vgExitSpec.marks.find(mark => mark.name === markSpec.name).encode.update;
        const filtered = Object.keys(vgUpdate)
          .filter(key => exitKeys.includes(key))
          .reduce((obj, key) => {
            (obj as any)[key] = vgUpdate[key];
            return obj;
          }, {});
        markSpec.encode.exit = filtered;
      }
      return markSpec;
    })
  }

  return {
    marks
  }
}


const sanitizeVlaSpec = (vlaSpec: ElaboratedVlAnimationSpec, animationFilterTransforms: FilterTransform[]): ElaboratedVlAnimationSpec => {
  delete (vlaSpec as any).default;
  // remove the animation filter transforms. we want to manually compile them because they apply directly
  // to the source dataset by default. this messes up scales, which always need the unfiltered domain.
  // the solution is to compile them into a derived dataset instead.
  //
  return {
    ...vlaSpec,
    // "params": [...vlaSpec.params.filter(param => !(animationSelections.includes(param as VlAnimationSelection)))],
    "transform": [...(vlaSpec.transform ?? []).filter(t => !animationFilterTransforms.includes(t as FilterTransform))]
  }
}

const compileUnitVla = (vlaSpec: ElaboratedVlAnimationUnitSpec): vega.Spec => {
  const animationSelections = getAnimationSelectionFromParams(vlaSpec.params) as ElaboratedVlAnimationSelection[];
  const animationFilters = getAnimationFilterTransforms(vlaSpec.transform, animationSelections);

  const sanitizedVlaSpec = sanitizeVlaSpec(vlaSpec, animationFilters);
  console.log('sanitized', sanitizedVlaSpec)

  let vgSpec = vl.compile(sanitizedVlaSpec as vl.TopLevelSpec).spec;
  console.log('compiled', vgSpec)
  const timeEncoding = vlaSpec.encoding.time;
  const dataset = vgSpec.marks[0].from.data;  // TODO assumes mark[0] is the main mark


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
    compileAnimationSelections(animationSelections, timeEncoding.field));
  vgSpec = mergeSpecs(vgSpec,
    compileFilterTransforms(animationFilters, animationSelections, dataset, vgSpec.marks));
  vgSpec = mergeSpecs(vgSpec,
    compileInterpolation(animationSelections, animationFilters, timeEncoding, dataset, vgSpec.marks, vgSpec.scales));
  vgSpec = mergeSpecs(vgSpec,
    compileEnterExit(vlaSpec, vgSpec.marks, dataset, vlaSpec.enter, vlaSpec.exit)); // TODO need examples that actually use this to verify it works

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

  // type ScaleFieldValueRef = {scale: vega.Field, field: vega.Field}; // ScaledValueRef


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
import * as vega from 'vega';
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
  "past": ElaboratedVlaPastEncoding
};

type ElaboratedVlAnimationSpec = TopLevelUnitSpec & { "encoding": { "time": ElaboratedVlAnimationTimeEncoding } };

/**
/**
 * fills in implicit values in the vla spec
 * @param vlaSpec 
 * @returns 
 */
 const elaborateVla = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {
  
    const timeEncoding = vlaSpec.encoding.time;
  
    let past: ElaboratedVlaPastEncoding;
    if (timeEncoding.past === true) { // refactor this
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
  
  
  ////////////////////////////////////////////////////
  
  export default elaborateVla;
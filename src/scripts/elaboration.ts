import * as vega from 'vega';
import { TopLevelUnitSpec } from 'vega-lite/build/src/spec/unit';
import { Encoding } from 'vega-lite/build/src/encoding';
import { AnyMark } from 'vega-lite/build/src/mark';
import { VlAnimationSpec, ElaboratedVlAnimationSpec } from '..';

/**
/**
 * fills in implicit values in the vla spec
 * @param vlaSpec
 * @returns
 */
 const elaborateVla = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {

    const timeEncoding = vlaSpec.encoding.time;

    // if no transforms are provided, implicitly set it to only show data that is at the current time
    if (!vlaSpec.transform || vlaSpec.transform?.length === 0) { // refactor this
      vlaSpec.transform = [{"filter":`datum.${timeEncoding.field} == anim_val_curr`}]
      // note: this may need to be moved to only apply to the curr data set, not to all data sets (causes cycle)
    }


    return {
      ...vlaSpec,
      "encoding": {
        ...vlaSpec.encoding,
        "time": {
          ...timeEncoding,
          "rescale": timeEncoding.rescale ?? false,
          "interpolateLoop": timeEncoding.interpolateLoop ?? false
        }
      }
    }
  }


  ////////////////////////////////////////////////////

  export default elaborateVla;
//import * as vega from 'vega';
import { isSelectionParameter, PointSelectionConfig } from 'vega-lite/build/src/selection';
import { EventStream } from 'vega-typings/types';
import { VlAnimationSpec, ElaboratedVlAnimationSpec, VlAnimationUnitSpec, ElaboratedVlAnimationUnitSpec, VlAnimationLayerSpec } from '..';

/**
/**
* fills in implicit values in the vla spec
* @param vlaSpec
* @returns
*/
const elaborateUnitVla = (vlaUnitSpec: VlAnimationUnitSpec): ElaboratedVlAnimationUnitSpec => {

  const timeEncoding = vlaUnitSpec.encoding.time;

  const elaboratedSpec = {
    ...vlaUnitSpec,
    "encoding": {
      ...vlaUnitSpec.encoding,
      "time": {
        ...timeEncoding,
        "interpolate": {
          ...timeEncoding.interpolate,
          "field": timeEncoding.interpolate?.field ?? "_vgsid_",
          "loop": timeEncoding.interpolate?.loop ?? false
        },
        "rescale": timeEncoding.rescale ?? false,
      }
    }
  };

  // elaborate encoding into a default selection
  if (!specContainsAnimationSelection(vlaUnitSpec)) {
    elaboratedSpec.params = [
      ...(elaboratedSpec.params ?? []),
      {
        "name": "current_frame",
        "select": {
          "type": "point",
          "on": "timer"
        }
      }
    ];
    elaboratedSpec.transform = [
      ...(elaboratedSpec.transform ?? []),
      {"filter": {"param": "current_frame"}}
    ]
  }

  return elaboratedSpec;
}

const specContainsAnimationSelection = (vlaUnitSpec: VlAnimationUnitSpec): boolean => {
  if (vlaUnitSpec.params) {
    vlaUnitSpec.params.find(param => {
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
    })
  }
  return false;
}

const elaborateVla = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {
  if ((vlaSpec as VlAnimationLayerSpec).layer) {
    return null; // TODO
  }
  else {
    return elaborateUnitVla(vlaSpec as VlAnimationUnitSpec);
  }
}


////////////////////////////////////////////////////

export default elaborateVla;
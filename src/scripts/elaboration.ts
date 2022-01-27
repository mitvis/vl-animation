import { VlAnimationSpec, ElaboratedVlAnimationSpec, VlAnimationUnitSpec, ElaboratedVlAnimationUnitSpec, VlAnimationLayerSpec, VlAnimationTimeEncoding, VlAnimationSelection, ElaboratedVlAnimationSelection, ElaboratedVlAnimationTimeScale } from '..';
import { getAnimationSelectionFromParams, isParamAnimationSelection } from './compile';

/**
/**
* fills in implicit values in the vla spec
* @param vlaSpec
* @returns
*/
const elaborateUnitVla = (vlaUnitSpec: VlAnimationUnitSpec): ElaboratedVlAnimationUnitSpec => {

  const timeEncoding = vlaUnitSpec.encoding.time;

  const scale = timeEncoding.scale ?? {};

  const elaboratedScaleType = scale.type ?? ((scale.range as any)?.step ? "band" : (scale.domain ? "linear" : "band"));
  const elaboratedScale = {
    ...scale,
    "type": elaboratedScaleType,
    "range": scale.range ?? (elaboratedScaleType === 'linear' ? [0, 5000] : {"step": 500})
  } as ElaboratedVlAnimationTimeScale;

  const elaboratedSpec = {
    ...vlaUnitSpec,
    "encoding": {
      ...vlaUnitSpec.encoding,
      "time": {
        ...timeEncoding,
        "scale": elaboratedScale,
        "interpolate": timeEncoding.interpolate ? {
          "field": timeEncoding.interpolate.field,
          "loop": timeEncoding.interpolate?.loop ?? false
        } : (false as false),
        "rescale": timeEncoding.rescale ?? false,
      }
    }
  };

  // elaborate encoding into a default selection
  if (!specContainsAnimationSelection(vlaUnitSpec)) {
    const param: ElaboratedVlAnimationSelection = {
      "name": "current_frame",
      "select": {
        "type": "point",
        "on": {
          "type": "timer",
          "filter": "true"
        }
      }
    };
    const filter = {"filter": {"param": "current_frame"}};
    elaboratedSpec.params = [
      ...(elaboratedSpec.params ?? []),
      param
    ];
    elaboratedSpec.transform = [
      ...(elaboratedSpec.transform ?? []),
      filter
    ]
  }
  else {
    elaboratedSpec.params = vlaUnitSpec.params.map(param => {
      if (isParamAnimationSelection(param)) {
        return {
          ...param,
          "select": {
            ...param.select,
            "on": {
              "type": "timer",
              "filter": (param.select.on !== "timer") ? param.select.on.filter ?? "true" : "true"
            }
          }
        }
      }
      else {
        return param;
      }
    })
  }

  return elaboratedSpec;
}

const specContainsAnimationSelection = (vlaUnitSpec: VlAnimationUnitSpec): boolean => {
  if (vlaUnitSpec.params) {
    return getAnimationSelectionFromParams(vlaUnitSpec.params).length > 0;
  }
  return false;
}

const elaborateVla = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {
  if ((vlaSpec as VlAnimationLayerSpec).layer) {
    return null; // TODO connect this back to dylan's traverseTree function (sorry!)
  }
  else {
    return elaborateUnitVla(vlaSpec as VlAnimationUnitSpec);
  }
}

////////////////////////////////////////////////////
// dylan wip below

function traverseTree(unitSpec: VlAnimationSpec, parentTimeEncoding: VlAnimationTimeEncoding): ElaboratedVlAnimationSpec {
	let timeEncoding = JSON.parse(JSON.stringify(parentTimeEncoding));
	if (unitSpec?.encoding?.time) {
		// if this unit has a time encoding, overwrite the baseTimeEncoding
		timeEncoding = Object.assign(timeEncoding, unitSpec.encoding.time);
	}

	// elaborates the current spec, to be called recusively on
	const changedLayerSpec = elaborateUnitRecursive(unitSpec, timeEncoding);

	if (changedLayerSpec.layer) {
		changedLayerSpec.layer = changedLayerSpec.layer.map((layerUnit) => traverseTree(layerUnit, timeEncoding));
	}

	return changedLayerSpec;
}

function elaborateUnitRecursive(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding): VlAnimationSpec {
	// Step 0: Populate each layer with time encoding
	unitSpec = validateOrAddTimeEncoding(unitSpec, timeEncoding);

	// Step 1: Add the time transform if it doesn't exist
	unitSpec = validateOrAddTimeTransform(unitSpec, timeEncoding);

	return unitSpec;
}

function validateOrAddTimeEncoding(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding) {
	// if no mark present, then no data is encoded in this unit, skip it
	if (!unitSpec.mark || !unitSpec.encoding) {
		return unitSpec;
	}

	if (!unitSpec.encoding.time) {
		unitSpec.encoding.time = {};
	}

	unitSpec.encoding.time = Object.assign(unitSpec.encoding.time, timeEncoding);
	return unitSpec;
}

function validateOrAddTimeTransform(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding) {
	if (!unitSpec.mark || !timeEncoding.field) {
		return unitSpec;
	}

	// if a mark is present, then
	if (!unitSpec.transform) {
		unitSpec.transform = [];
	}

	const timeTransformExists = unitSpec.transform.find((transform) => transform?.filter?.time);

	if (!timeTransformExists) {
		// without a time transform, add it to this spec
		unitSpec.transform.push({filter: {time: [{equal: `datum.${timeEncoding.field}`}]}});
	}
	return unitSpec;
}

////////////////////////////////////////////////////

export default elaborateVla;

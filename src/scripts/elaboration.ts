//@ts-nocheck
import {TopLevelUnitSpec} from "vega-lite/build/src/spec/unit";
import {Encoding} from "vega-lite/build/src/encoding";
import {AnyMark} from "vega-lite/build/src/mark";
import {VlAnimationSpec, ElaboratedVlAnimationSpec, VlAnimationLayerSpec} from "..";

/**
/**
 * fills in implicit values in the vla spec
 * @param vlaSpec
 * @returns
 */
const elaborateVlaOLD = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {
	const timeEncoding = vlaSpec.encoding.time;

	// if no transforms are provided, implicitly set it to only show data that is at the current time
	if (!vlaSpec.transform || vlaSpec.transform?.length === 0) {
		// refactor this
		vlaSpec.transform = [{filter: `datum.${timeEncoding.field} == anim_val_curr`}];
		// note: this may need to be moved to only apply to the curr data set, not to all data sets (causes cycle)
	}

	return {
		...vlaSpec,
		encoding: {
			...vlaSpec.encoding,
			time: {
				...timeEncoding,
				rescale: timeEncoding.rescale ?? false,
				interpolateLoop: timeEncoding.interpolateLoop ?? false,
			},
		},
	};
};

function elaborateVla(vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec {
	vlaSpec = elaborateUnit(vlaSpec);
	return vlaSpec;
}

function elaborateUnit(unitSpec: VlAnimationSpec): ElaboratedVlAnimationSpec {
	// elaborates the current spec, to be called recusively on
	const changedLayerSpec = elaborateUnitRecursive(unitSpec);

	if (changedLayerSpec.layer) {
		changedLayerSpec.layer = changedLayerSpec.layer.map(elaborateUnit);
	}

	return changedLayerSpec;
}

function elaborateUnitRecursive(unitSpec: VlAnimationLayerSpec): VlAnimationSpec {
	unitSpec.hi = "hi";
	return unitSpec;
}

/*function getTimeFieldForUnit(unitSpec){
  let timeEncoding = null;
  if(unitSpec.encoding.time){
    timeEncoding = 
  }
  const timeEncoding = unitSpec.encoding.time;

}*/

////////////////////////////////////////////////////

export default elaborateVla;

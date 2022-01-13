//@ts-nocheck
import {TopLevelUnitSpec} from "vega-lite/build/src/spec/unit";
import {Encoding} from "vega-lite/build/src/encoding";
import {AnyMark} from "vega-lite/build/src/mark";
import {VlAnimationSpec, ElaboratedVlAnimationSpec, VlAnimationLayerSpec, VlAnimationTimeEncoding} from "..";

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
	let defaultTimeEncoding = {
		field: null,
		scale: null,
		continuity: null,
		rescale: false,
		interpolateLoop: false,
	};

	vlaSpec = traverseTree(vlaSpec, defaultTimeEncoding);
	return vlaSpec;
}

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

import {
	VlAnimationSpec,
	ElaboratedVlAnimationSpec,
	ElaboratedVlAnimationLayerSpec,
	VlAnimationUnitSpec,
	ElaboratedVlAnimationUnitSpec,
	VlAnimationLayerSpec,
	ElaboratedVlAnimationSelection,
	ElaboratedVlAnimationTimeScale,
	VlAnimationTimeEncoding,
} from "./types";
import {getAnimationSelectionFromParams, isParamAnimationSelection} from "./compile";

/**
/**
* fills in implicit values in the vla spec
* @param vlaSpec
* @returns
*/
const elaborateUnitVla = (vlaUnitSpec: VlAnimationUnitSpec): ElaboratedVlAnimationUnitSpec => {
	const timeEncoding = vlaUnitSpec.encoding.time;

	const scale = timeEncoding.scale ?? {};

	const elaboratedScaleType = scale.type ?? ((scale.range as any)?.step ? "band" : scale.domain ? "linear" : "band");
	const elaboratedScale = {
		...scale,
		type: elaboratedScaleType,
		range: scale.range ?? (elaboratedScaleType === "linear" ? [0, 5000] : {step: 500}),
	} as ElaboratedVlAnimationTimeScale;

	const elaboratedSpec = {
		...vlaUnitSpec,
		encoding: {
			...vlaUnitSpec.encoding,
			time: {
				...timeEncoding,
				scale: elaboratedScale,
				interpolate: timeEncoding.interpolate
					? {
							field: timeEncoding.interpolate.field,
							loop: timeEncoding.interpolate?.loop ?? false,
					  }
					: (false as false),
				rescale: timeEncoding.rescale ?? false,
			},
		},
	};

	// elaborate encoding into a default selection
	if (!specContainsAnimationSelection(vlaUnitSpec)) {
		const param: ElaboratedVlAnimationSelection = {
			name: "current_frame",
			select: {
				type: "point",
				on: {
					type: "timer",
					filter: "true",
				},
				easing: "easeLinear",
			},
		};
		const filter = {filter: {param: "current_frame"}};
		elaboratedSpec.params = [...(elaboratedSpec.params ?? []), param];
		elaboratedSpec.transform = [...(elaboratedSpec.transform ?? []), filter];
	} else {
		elaboratedSpec.params = vlaUnitSpec.params.map((param) => {
			if (isParamAnimationSelection(param)) {
				return {
					...param,
					select: {
						...param.select,
						on: {
							type: "timer",
							filter: param.select.on !== "timer" ? param.select.on.filter ?? "true" : "true",
						},
						easing: param.select.easing ?? "easeLinear",
					},
				};
			} else {
				return param;
			}
		});
	}

	return elaboratedSpec;
};

const specContainsAnimationSelection = (vlaUnitSpec: VlAnimationUnitSpec): boolean => {
	if (vlaUnitSpec.params) {
		return getAnimationSelectionFromParams(vlaUnitSpec.params).length > 0;
	}
	return false;
};

const elaborateVla = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {
	console.log("in elaborate!");
	if ((vlaSpec as VlAnimationLayerSpec).layer) {
		return traverseTree(vlaSpec); // TODO connect this back to dylan's traverseTree function (sorry!)
	} else {
		return elaborateUnitVla(vlaSpec as VlAnimationUnitSpec);
	}
};

////////////////////////////////////////////////////
// dylan wip below

function traverseTree(vlaSpec: VlAnimationSpec, parentTimeEncoding: VlAnimationTimeEncoding = {field: null}): ElaboratedVlAnimationSpec {
	let timeEncoding = JSON.parse(JSON.stringify(parentTimeEncoding));

	if (vlaSpec?.encoding?.time) {
		// if this unit has a time encoding, overwrite the baseTimeEncoding
		timeEncoding = Object.assign(timeEncoding, vlaSpec.encoding.time);
	}

	const changedUnitOrLayerSpec = elaborateUnitRecursive(vlaSpec as VlAnimationLayerSpec, timeEncoding);

	if ((vlaSpec as VlAnimationLayerSpec).layer) {
		// elaborates the current spec, to be called recusively on

		if ((changedUnitOrLayerSpec as VlAnimationLayerSpec).layer) {
			const newLayer = (changedUnitOrLayerSpec as VlAnimationLayerSpec).layer.map((layerUnit) => traverseTree(layerUnit, timeEncoding));

			(changedUnitOrLayerSpec as ElaboratedVlAnimationLayerSpec).layer = newLayer;
		}

		return changedUnitOrLayerSpec as ElaboratedVlAnimationSpec;
	} else {
		return elaborateUnitVla(changedUnitOrLayerSpec as VlAnimationUnitSpec);
	}
}

function elaborateUnitRecursive(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding): VlAnimationSpec {
	// Step 0: Populate each layer with time encoding
	unitSpec = addParentTimeEncoding(unitSpec, timeEncoding);

	// Step 1: Add the time transform if it doesn't exist
	//unitSpec = validateOrAddTimeTransform(unitSpec, timeEncoding);

	return unitSpec;
}

function addParentTimeEncoding(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding): VlAnimationLayerSpec {
	if (!unitSpec.encoding) {
		unitSpec.encoding = {};
	}

	const existingTimeSpec = unitSpec?.encoding?.time ? unitSpec.encoding.time : {};

	unitSpec.encoding.time = Object.assign(existingTimeSpec, timeEncoding);
	return unitSpec;
}

/*

function validateOrAddTimeTransform(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding) : VlAnimationLayerSpec {
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
*/
////////////////////////////////////////////////////

export default elaborateVla;

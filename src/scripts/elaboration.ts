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
const elaborateUnitVla = (vlaUnitSpec: VlAnimationUnitSpec, layerId: string = "0"): ElaboratedVlAnimationUnitSpec => {
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
				key: timeEncoding.key
					? {
							field: timeEncoding.key.field,
							loop: timeEncoding.key?.loop ?? false,
					  }
					: (false as false),
				rescale: timeEncoding.rescale ?? false,
			},
		},
	};

	// elaborate encoding into a default selection
	if (!specContainsAnimationSelection(vlaUnitSpec)) {
		const param: ElaboratedVlAnimationSelection = {
			name: `current_frame_${layerId}`,
			select: {
				type: "point",
				on: {
					type: "timer",
				},
				easing: "easeLinear",
			},
		};
		const filter = {filter: {param: `current_frame_${layerId}`}};
		elaboratedSpec.params = [...(elaboratedSpec.params ?? []), param];
		elaboratedSpec.transform = [...(elaboratedSpec.transform ?? []), filter];
	} else {
		elaboratedSpec.params = vlaUnitSpec.params.map((param) => {
			if (isParamAnimationSelection(param)) {
				return {
					...param,
					select: {
						...param.select,
						on: param.select.on === "timer" ? {
							type: "timer"
						} : param.select.on,
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
		const elaborated = traverseTree(vlaSpec, {field: null}, 0);
		console.log("elaborated", elaborated);
		return elaborated;
	} else {
		return elaborateUnitVla(vlaSpec as VlAnimationUnitSpec);
	}
};

////////////////////////////////////////////////////

function traverseTree(vlaSpec: VlAnimationSpec, parentTimeEncoding: VlAnimationTimeEncoding = {field: null}, index: number): ElaboratedVlAnimationSpec {
	let timeEncoding = JSON.parse(JSON.stringify(parentTimeEncoding));

	if (vlaSpec?.encoding?.time) {
		// if this unit has a time encoding, overwrite the baseTimeEncoding
		timeEncoding = Object.assign(timeEncoding, vlaSpec.encoding.time);
	}

	const changedUnitOrLayerSpec = elaborateUnitRecursive(vlaSpec as VlAnimationLayerSpec, timeEncoding);

	if ((vlaSpec as VlAnimationLayerSpec).layer) {
		// elaborates the current spec, to be called recusively on

		if ((changedUnitOrLayerSpec as VlAnimationLayerSpec).layer) {
			const newLayer = (changedUnitOrLayerSpec as VlAnimationLayerSpec).layer.map((layerUnit) => traverseTree(layerUnit, timeEncoding, ++index));

			(changedUnitOrLayerSpec as ElaboratedVlAnimationLayerSpec).layer = newLayer;
		}

		return changedUnitOrLayerSpec as ElaboratedVlAnimationSpec;
	} else {
		return elaborateUnitVla(changedUnitOrLayerSpec as VlAnimationUnitSpec, `${index + 1}`);
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

export default elaborateVla;

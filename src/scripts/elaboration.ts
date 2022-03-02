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
	ElaboratedVlAnimationTimeEncoding,
	VlAnimationVConcatSpec,
	ElaboratedVlAnimationVConcatSpec,
	ElaboratedVlAnimationKey,
} from "./types";
import {getAnimationSelectionFromParams, isParamAnimationSelection, selectionBindsSlider} from "./compile";
import {isArray} from "vega";
import {VariableParameter} from "vega-lite/build/src/parameter";
import {SelectionParameter} from "vega-lite/build/src/selection";
import {isLayerSpec, isVConcatSpec} from "vega-lite/build/src/spec";
import { ScaleFieldDef } from "vega-lite/build/src/channeldef";

const mergeVlaSpecs = (
	vlaSpec: ElaboratedVlAnimationUnitSpec | ElaboratedVlAnimationLayerSpec,
	vlaPartialSpec: Partial<ElaboratedVlAnimationUnitSpec | ElaboratedVlAnimationLayerSpec>
): ElaboratedVlAnimationSpec => {
	if (vlaPartialSpec.params) {
		const newParamNames = vlaPartialSpec.params.map((s) => s.name);
		vlaSpec = {
			...vlaSpec,
			params: (vlaSpec.params ?? []).filter((s) => !newParamNames.includes(s.name)).concat(vlaPartialSpec.params),
		};
	}
	if (vlaPartialSpec.transform) {
		vlaSpec = {
			...vlaSpec,
			transform: (vlaSpec.transform ?? []).concat(vlaPartialSpec.transform),
		};
	}
	return vlaSpec;
};

const paramsContainAnimationSelection = (params: any[]): boolean => {
	return isArray(params) && getAnimationSelectionFromParams(params as any).length > 0;
};

const elaborateTimeEncoding = (timeEncoding: VlAnimationTimeEncoding, vlaSpec?: VlAnimationSpec): ElaboratedVlAnimationTimeEncoding => {
	const scale = timeEncoding.scale ?? {};

	const elaboratedScaleType = scale.type ?? ((scale.range as any)?.step ? "band" : scale.domain ? "linear" : "band");
	const elaboratedScale = {
		...scale,
		type: elaboratedScaleType,
		range: scale.range ?? (elaboratedScaleType === "linear" ? [0, 5000] : {step: 500}),
	} as ElaboratedVlAnimationTimeScale;

	let elaboratedKey: ElaboratedVlAnimationKey | false = timeEncoding.key
		? {
				field: timeEncoding.key.field,
				loop: timeEncoding.key?.loop ?? false,
			}
		: (false as false);
	if (vlaSpec) {
		elaboratedKey = elaborateKey(elaboratedKey, vlaSpec);
	}

	return {
		...timeEncoding,
		scale: elaboratedScale,
		key: elaboratedKey,
		rescale: timeEncoding.rescale ?? false,
	};
};

const elaborateKey = (key: ElaboratedVlAnimationKey | false, vlaSpec: VlAnimationSpec) => {
	if (!key) {
		const vlaUnitSpec = vlaSpec as VlAnimationUnitSpec;
		const vlaLayerSpec = vlaSpec as VlAnimationLayerSpec;
		if (vlaUnitSpec.mark === 'bar' || vlaLayerSpec.layer && vlaLayerSpec.layer.some(x => x.mark === 'bar')) { // this is super overfitted sue me
			const x = (vlaUnitSpec.encoding.x as ScaleFieldDef<any>);
			const y = (vlaUnitSpec.encoding.y as ScaleFieldDef<any>);
			if (x.type && x.field && x.type === 'nominal') {
				return {
					field: x.field,
					loop: false
				}
			}
			if (y.type && y.field && y.type === 'nominal') {
				return {
					field: y.field,
					loop: false
				}
			}
		}
		if (vlaUnitSpec.encoding?.color) {
			const colorSF = vlaUnitSpec.encoding.color as ScaleFieldDef<any>;
			if (colorSF.field) {
				return {
					field: colorSF.field,
					loop: false
				}
			}
			const colorCond = vlaUnitSpec.encoding.color.condition;
			if (colorCond && (colorCond as any).field) {
				return {
					field: (colorCond as any).field,
					loop: false
				}
			}
		}
		if (vlaUnitSpec.encoding?.detail) {
			const detail = vlaUnitSpec.encoding.detail as ScaleFieldDef<any>;
			if (detail.field) {
				return {
					field: detail.field,
					loop: false
				}
			}
		}
	}
	return key;
}

const elaborateDefaultSelection = (layerId: string = "0"): Partial<ElaboratedVlAnimationSpec> => {
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
	return {
		params: [param],
		transform: [filter],
	};
};

const elaborateParams = (params: (VariableParameter | SelectionParameter)[]): (VariableParameter | SelectionParameter | ElaboratedVlAnimationSelection)[] => {
	const elaboratedParams = params.map((param) => {
		if (isParamAnimationSelection(param)) {
			const sel: ElaboratedVlAnimationSelection = {
				...param,
				select: {
					...param.select,
					on:
						param.select.on === "timer"
							? {
									type: "timer",
							  }
							: param.select.on,
					easing: param.select.easing ?? "easeLinear",
				},
			};
			if (selectionBindsSlider(param.bind)) {
				// if there's a slider bound, compiler will also create a pause checkbox
				sel.select.on.filter = sel.select.on.filter ? (isArray(sel.select.on.filter) ? [...sel.select.on.filter, "is_playing"] : [sel.select.on.filter, "is_playing"]) : "is_playing";
			}
			return sel;
		}
		return param;
	});
	return elaboratedParams;
};

/**
/**
* fills in implicit values in the vla spec
* @param vlaSpec
* @returns
*/
const elaborateUnitVla = (vlaUnitSpec: VlAnimationUnitSpec, vconcatIndex: string = "0"): ElaboratedVlAnimationUnitSpec => {
	if (!vlaUnitSpec.encoding.time) return vlaUnitSpec as ElaboratedVlAnimationUnitSpec;
	let elaboratedSpec: ElaboratedVlAnimationUnitSpec = {
		...vlaUnitSpec,
		encoding: {
			...vlaUnitSpec.encoding,
			time: elaborateTimeEncoding(vlaUnitSpec.encoding.time, vlaUnitSpec),
		},
	};

	// elaborate encoding into a default selection
	if (!paramsContainAnimationSelection(vlaUnitSpec.params)) {
		elaboratedSpec = mergeVlaSpecs(elaboratedSpec, elaborateDefaultSelection(vconcatIndex)) as ElaboratedVlAnimationUnitSpec;
	} else {
		elaboratedSpec.params = elaborateParams(vlaUnitSpec.params);
	}

	return elaboratedSpec;
};

const elaborateLayerVla = (vlaLayerSpec: VlAnimationLayerSpec): ElaboratedVlAnimationLayerSpec => {
	const elaboratedLayer: ElaboratedVlAnimationUnitSpec[] = vlaLayerSpec.layer.map((layerSpec, idx) => {
		const elaboratedTimeEncoding: ElaboratedVlAnimationTimeEncoding = layerSpec.encoding?.time
			? elaborateTimeEncoding({
					...vlaLayerSpec.encoding?.time,
					...layerSpec.encoding?.time,
			  }, layerSpec)
			: undefined;

		let elaboratedLayerSpec: ElaboratedVlAnimationUnitSpec = {
			...layerSpec,
			encoding: layerSpec.encoding
				? {
						...layerSpec.encoding,
						time: elaboratedTimeEncoding,
				  }
				: undefined,
			params: layerSpec.params ? elaborateParams(layerSpec.params) : undefined,
		};
		return elaboratedLayerSpec;
	});

	let elaboratedSpec: ElaboratedVlAnimationLayerSpec = {
		...vlaLayerSpec,
		layer: elaboratedLayer,
		encoding: vlaLayerSpec.encoding
			? {
					...vlaLayerSpec.encoding,
					time: vlaLayerSpec.encoding?.time && vlaLayerSpec.layer.every((layerSpec) => !layerSpec.encoding?.time) ? elaborateTimeEncoding(vlaLayerSpec.encoding?.time, vlaLayerSpec) : undefined,
			  }
			: undefined,
		params: vlaLayerSpec.params ? elaborateParams(vlaLayerSpec.params) : undefined,
	};

	if (elaboratedSpec.encoding?.time && !paramsContainAnimationSelection(vlaLayerSpec.params) && vlaLayerSpec.layer.every((layerSpec) => !layerSpec.params)) {
		elaboratedSpec = mergeVlaSpecs(elaboratedSpec, elaborateDefaultSelection()) as ElaboratedVlAnimationLayerSpec;
	}
	// TODO when do you elaborate out default selections when the time encodings are inside layers?

	return elaboratedSpec;
};

const elaborateVConcatVla = (vlaSpec: VlAnimationVConcatSpec): ElaboratedVlAnimationVConcatSpec => {
	return {
		...vlaSpec,
		vconcat: vlaSpec.vconcat.map((unitVla, index) => {
			return elaborateUnitVla(unitVla, String(index));
		}),
	};
};

const elaborateVla = (vlaSpec: VlAnimationSpec): ElaboratedVlAnimationSpec => {
	if (isLayerSpec(vlaSpec)) {
		return elaborateLayerVla(vlaSpec as VlAnimationLayerSpec);
	} else if (isVConcatSpec(vlaSpec)) {
		return elaborateVConcatVla(vlaSpec as VlAnimationVConcatSpec);
	} else {
		return elaborateUnitVla(vlaSpec as VlAnimationUnitSpec);
	}
};

////////////////////////////////////////////////////

// function traverseTree(vlaSpec: VlAnimationSpec, parentTimeEncoding: VlAnimationTimeEncoding = {field: null}, index: number): ElaboratedVlAnimationSpec {
// 	let timeEncoding = JSON.parse(JSON.stringify(parentTimeEncoding));

// 	if (vlaSpec?.encoding?.time) {
// 		// if this unit has a time encoding, overwrite the baseTimeEncoding
// 		timeEncoding = Object.assign(timeEncoding, vlaSpec.encoding.time);
// 	}

// 	const changedUnitOrLayerSpec = elaborateUnitRecursive(vlaSpec as VlAnimationLayerSpec, timeEncoding);

// 	if ((vlaSpec as VlAnimationLayerSpec).layer) {
// 		// elaborates the current spec, to be called recusively on

// 		if ((changedUnitOrLayerSpec as VlAnimationLayerSpec).layer) {
// 			const newLayer = (changedUnitOrLayerSpec as VlAnimationLayerSpec).layer.map((layerUnit) => traverseTree(layerUnit, timeEncoding, ++index));

// 			(changedUnitOrLayerSpec as ElaboratedVlAnimationLayerSpec).layer = newLayer;
// 		}

// 		return changedUnitOrLayerSpec as ElaboratedVlAnimationSpec;
// 	} else {
// 		return elaborateUnitVla(changedUnitOrLayerSpec as VlAnimationUnitSpec, `${index + 1}`);
// 	}
// }

// function elaborateUnitRecursive(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding): VlAnimationSpec {
// 	// Step 0: Populate each layer with time encoding
// 	unitSpec = addParentTimeEncoding(unitSpec, timeEncoding);

// 	// Step 1: Add the time transform if it doesn't exist
// 	//unitSpec = validateOrAddTimeTransform(unitSpec, timeEncoding);

// 	return unitSpec;
// }

// function addParentTimeEncoding(unitSpec: VlAnimationLayerSpec, timeEncoding: VlAnimationTimeEncoding): VlAnimationLayerSpec {
// 	if (!unitSpec.encoding) {
// 		unitSpec.encoding = {};
// 	}

// 	const existingTimeSpec = unitSpec?.encoding?.time ? unitSpec.encoding.time : {};

// 	unitSpec.encoding.time = Object.assign(existingTimeSpec, timeEncoding);
// 	return unitSpec;
// }

export default elaborateVla;

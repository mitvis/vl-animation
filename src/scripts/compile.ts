import * as vega from "vega";
import * as vl from "vega-lite";
import {
	ElaboratedVlAnimationInterpolate,
	ElaboratedVlAnimationSelection,
	ElaboratedVlAnimationSpec,
	ElaboratedVlAnimationTimeEncoding,
	ElaboratedVlAnimationUnitSpec,
	VlAnimationSelection,
	ElaboratedVlAnimationLayerSpec,
} from "./types";
import {EventStream, isArray, isString} from "vega";
import {VariableParameter} from "vega-lite/build/src/parameter";
import {SelectionParameter, isSelectionParameter, PointSelectionConfig} from "vega-lite/build/src/selection";
import {Transform, FilterTransform} from "vega-lite/build/src/transform";
import {
	FieldEqualPredicate,
	FieldGTEPredicate,
	FieldGTPredicate,
	FieldLTEPredicate,
	FieldLTPredicate,
	FieldOneOfPredicate,
	FieldPredicate,
	FieldRangePredicate,
	FieldValidPredicate,
	ParameterPredicate,
} from "vega-lite/build/src/predicate";
import {LogicalAnd} from "vega-lite/build/src/logical";
import {Encoding} from "vega-lite/build/src/encoding";

type ScaleFieldValueRef = {scale: vega.Field; field: vega.Field}; // ScaledValueRef

export const isParamAnimationSelection = (param: any): param is VlAnimationSelection => {
	if (!isSelectionParameter(param)) {
		return false;
	}
	const pointSelect = param.select as PointSelectionConfig;
	if (pointSelect.type !== "point") {
		return false;
	}
	if (pointSelect.on === "timer" || (pointSelect.on as EventStream).type === "timer") {
		return true;
	}
	return false;
};

export const getAnimationSelectionFromParams = (params: (VariableParameter | SelectionParameter)[]): VlAnimationSelection[] => {
	return params.filter(isParamAnimationSelection) as VlAnimationSelection[];
};

const getAnimationFilterTransforms = (transform: Transform[], animSelections: VlAnimationSelection[]): FilterTransform[] => {
	return (transform ?? []).filter((transform) => {
		return (transform as FilterTransform).filter && animSelections.some((s) => ((transform as FilterTransform).filter as ParameterPredicate).param?.includes(s.name));
	}) as FilterTransform[];
};

const getMarkDataset = (markSpec: vega.Mark): string => {
	if ("facet" in markSpec.from) {
		// mark is a faceted line mark
		return markSpec.from.facet.data;
	} else {
		return markSpec.from?.data;
	}
};

const setMarkDataset = (markSpec: vega.Mark, dataset: string): vega.Mark => {
	if ("facet" in markSpec.from) {
		// mark is a faceted line mark
		markSpec.from.facet.data = dataset;
	} else {
		markSpec.from.data = dataset;
	}
	return markSpec;
};

const markHasDataset = (markSpec: vega.Mark, dataset: string): boolean => {
	const m_dataset = getMarkDataset(markSpec);
	return m_dataset === dataset || m_dataset === `${dataset}_curr`;
};

const getMarkEncoding = (markSpec: vega.Mark): vega.EncodeEntry => {
	if ("facet" in markSpec.from && markSpec.type === "group") {
		// mark is a faceted line mark
		return markSpec.marks[0].encode.update;
	} else {
		return markSpec.encode.update;
	}
};

const setMarkEncoding = (markSpec: vega.Mark, key: string, value: any): vega.Mark => {
	if ("facet" in markSpec.from && markSpec.type === "group") {
		// mark is a faceted line mark
		markSpec.marks[0].encode.update[key] = value;
	} else {
		markSpec.encode.update[key] = value;
	}
	return markSpec;
};

const predicateToTupleType = (predicate: FieldPredicate) => {
	if ((predicate as FieldEqualPredicate).equal) {
		return "E";
	} else if ((predicate as FieldLTPredicate).lt) {
		return "E-LT";
	} else if ((predicate as FieldGTPredicate).gt) {
		return "E-GT";
	} else if ((predicate as FieldLTEPredicate).lte) {
		return "E-LTE";
	} else if ((predicate as FieldGTEPredicate).gte) {
		return "E-GTE";
	} else if ((predicate as FieldRangePredicate).range) {
		return "R";
	} else if ((predicate as FieldOneOfPredicate).oneOf) {
		return "E";
	} else if ((predicate as FieldValidPredicate).valid) {
		return "E-VALID";
	}
	return "E"; // shrug
};

const mergeSpecs = (vgSpec: vega.Spec, vgPartialSpec: Partial<vega.Spec>): vega.Spec => {
	if (vgPartialSpec.scales) {
		const newScaleNames = vgPartialSpec.scales.map((s) => s.name);
		vgSpec = {
			...vgSpec,
			scales: (vgSpec.scales ?? []).filter((s) => !newScaleNames.includes(s.name)).concat(vgPartialSpec.scales),
		};
	}
	if (vgPartialSpec.signals) {
		const newSignalNames = vgPartialSpec.signals.map((s) => s.name);
		vgSpec = {
			...vgSpec,
			signals: (vgSpec.signals ?? []).filter((s) => !newSignalNames.includes(s.name)).concat(vgPartialSpec.signals),
		};
	}
	if (vgPartialSpec.data) {
		const newDatasetNames = vgPartialSpec.data.map((s) => s.name);
		vgSpec = {
			...vgSpec,
			data: (vgSpec.data ?? []).filter((s) => !newDatasetNames.includes(s.name)).concat(vgPartialSpec.data),
		};
	}
	if (vgPartialSpec.marks) {
		const newMarkNames = vgPartialSpec.marks.map((s) => s.name);
		vgSpec = {
			...vgSpec,
			marks: (vgSpec.marks ?? []).filter((s) => !newMarkNames.includes(s.name)).concat(vgPartialSpec.marks),
		};
	}
	if (vgPartialSpec.scales) {
		const newScaleNames = vgPartialSpec.scales.map((s) => s.name);
		vgSpec = {
			...vgSpec,
			scales: (vgSpec.scales ?? []).filter((s) => !newScaleNames.includes(s.name)).concat(vgPartialSpec.scales),
		};
	}
	return vgSpec;
};

const throttleMs = 1000 / 60;

const createAnimationClock = (animSelection: ElaboratedVlAnimationSelection): Partial<vega.Spec> => {
	const pauseExpr = animSelection.select.on.filter ? (isArray(animSelection.select.on.filter) ? animSelection.select.on.filter.join(" && ") : animSelection.select.on.filter) : "true";

	const pauseEventStreams = animSelection.select.on.filter
		? isArray(animSelection.select.on.filter)
			? animSelection.select.on.filter.map((s) => ({signal: s}))
			: [{signal: animSelection.select.on.filter}]
		: [];

	const easeExpr = isString(animSelection.select.easing)
		? `${animSelection.select.easing}(anim_clock / max_range_extent)`
		: `interpolateCatmullRom(${animSelection.select.easing}, anim_clock / max_range_extent)`; // if easing is a number[], use it to construct an easing function

	const signals: vega.Signal[] = [
		{
			name: "anim_clock", // ms elapsed in animation
			init: "0",
			on: [
				{
					events: {type: "timer", throttle: throttleMs},
					update: `${pauseExpr} && is_playing_datum_pause ? (anim_clock + (now() - last_tick_at) > max_range_extent ? 0 : anim_clock + (now() - last_tick_at)) : anim_clock`,
				},
			],
		},
		{
			name: "last_tick_at",
			init: "now()",
			on: [
				{
					events: [{signal: "anim_clock"}].concat(pauseEventStreams).concat([{signal: "is_playing_datum_pause"}]),
					update: "now()",
				},
			],
		},
		{
			name: "eased_anim_clock",
			update: `${easeExpr} * max_range_extent`,
		},
	];

	return {
		signals,
	};
};

const compileTimeScale = (
	timeEncoding: ElaboratedVlAnimationTimeEncoding,
	dataset: string,
	markSpecs: vega.Mark[],
	scaleSpecs: vega.Scale[],
	stackTransform: vega.Transforms[]
): Partial<vega.Spec> => {
	let scales: vega.Scale[] = [];
	let data: vega.Data[] = [];
	let signals: vega.Signal[] = [];

	if (timeEncoding.scale.type === "linear") {
		scales = [
			...scales,
			{
				// a continuous scale for mapping values into time
				name: "time",
				type: "linear",
				zero: timeEncoding.scale.zero ?? false,
				domain: timeEncoding.scale.domain ?? {data: dataset, field: timeEncoding.field},
				range: timeEncoding.scale.range,
			} as vega.LinearScale,
		];
		signals = [
			...signals,
			{
				name: "anim_val_curr", // current keyframe's value in time field domain
				update: "invert('time', eased_anim_clock)",
			},
			{
				name: "max_range_extent", // max value of time range
				init: "extent(range('time'))[1]",
			},
		];
	} else {
		// if there's no explicit domain, it's a field domain. therefore, there are discrete data values to match
		scales = [
			...scales,
			{
				// a band scale for getting the individual values in the discrete data domain
				name: `time_${timeEncoding.field}`,
				type: "band",
				domain: timeEncoding.scale.domain ?? {data: dataset, field: timeEncoding.field},
				range: timeEncoding.scale.range,
				align: 0,
			} as vega.BandScale,
		];

		signals = [
			...signals,
			{
				name: `${timeEncoding.field}_domain`,
				init: `domain('time_${timeEncoding.field}')`,
			},
			{
				name: "t_index", // index of current keyframe in the time field's domain
				init: "0",
				on: [
					{
						events: {signal: "eased_anim_clock"},
						update: `indexof(${timeEncoding.field}_domain, invert('time_${timeEncoding.field}', eased_anim_clock))`,
					},
				],
			},
			{
				name: "max_range_extent", // max value of time range
				init: `extent(range('time_${timeEncoding.field}'))[1]`,
			},
			{
				name: "min_extent", // min value of time field domain
				init: `extent(${timeEncoding.field}_domain)[0]`,
			},
			{
				name: "max_extent", // max value of time field domain
				init: `extent(${timeEncoding.field}_domain)[1]`,
			},
			{
				name: "anim_val_curr", // current keyframe's value in time field domain
				update: `invert('time_${timeEncoding.field}', eased_anim_clock)`,
			},
		];
	}

	const dataset_curr = `${dataset}_curr`;

	if (timeEncoding.rescale) {
		markSpecs.forEach((markSpec) => {
			if (getMarkDataset(markSpec) == dataset_curr) {
				const encoding = getMarkEncoding(markSpec);

				Object.keys(encoding).forEach((k) => {
					let encodingDef = encoding[k];
					if (Array.isArray(encodingDef)) {
						// for production rule encodings, the encoding is an array. the last entry is the default def
						encodingDef = encodingDef[encodingDef.length - 1];
					}
					if ((encodingDef as ScaleFieldValueRef).field) {
						const {scale} = encodingDef as ScaleFieldValueRef;

						if (scale) {
							const scaleSpec = scaleSpecs.find((s) => s.name === scale);

							// rescale: the scale updates based on the animation frame
							(scaleSpec.domain as vega.ScaleDataRef).data = dataset_curr;
							scales = scales.filter((s) => s.name !== scaleSpec.name).concat([scaleSpec]);
						}
					}
				});
			}
		});
	}

	return {
		data,
		scales,
		signals,
	};
};

const compileDatumPause = (animSelection: ElaboratedVlAnimationSelection): Partial<vega.Spec> => {
	let data: vega.Data[] = [];
	let signals: vega.Signal[] = [];

	if (animSelection.select.pause) {
		data = [
			...data,
			{
				name: "time_pause",
				values: animSelection.select.pause,
				transform: [
					{
						type: "filter",
						expr: "datum.value == anim_val_curr",
					},
				],
			},
		];

		signals = [
			...signals,
			{
				name: "datum_pause_duration",
				update: "length(data('time_pause')) ? data('time_pause')[0].duration : null",
			},
			{
				name: "is_playing_datum_pause",
				on: [
					{
						events: {type: "timer", throttle: throttleMs},
						update: "datum_pause_duration ? (now() - last_datum_pause_at > datum_pause_duration) : true",
					},
				],
			},
			{
				name: "last_datum_pause_at",
				on: [
					{
						events: [{signal: "datum_pause_duration"}],
						update: "now()",
					},
				],
			},
		];
	} else {
		signals = [
			...signals,
			{
				name: "is_playing_datum_pause",
				init: "true",
			},
		];
	}
	return {
		data,
		signals,
	};
};

const compileAnimationSelections = (animationSelections: ElaboratedVlAnimationSelection[], field: string): Partial<vega.Spec> => {
	return animationSelections
		.map((animSelection) => {
			let signals: vega.Signal[] = [
				{
					name: `${animSelection.name}_toggle`,
					value: false,
				},
			];

			if (animSelection.select.predicate) {
				const predicate = animSelection.select.predicate;
				const and = (predicate as LogicalAnd<FieldPredicate>).and;
				// TODO: this will currently only support a non-nested "and" composition or a single pred because i do not want to deal
				signals = [
					...signals,
					{
						name: `${animSelection.name}_tuple_fields`,
						value: and
							? and.map((p) => {
									const pred = p as FieldPredicate; // no nesting haha
									return {
										type: predicateToTupleType(pred),
										field: pred.field,
									};
							  })
							: [
									{
										type: predicateToTupleType(predicate as FieldPredicate),
										field: (predicate as FieldPredicate).field,
									},
							  ],
					},
					{
						name: `${animSelection.name}_tuple`,
						on: [
							{
								events: {signal: "anim_val_curr"},
								update: `{unit: "", fields: ${animSelection.name}_tuple_fields, values: [${Array(and ? and.length : 1)
									.fill("anim_val_curr")
									.join(", ")}]}`,
								force: true,
							},
						],
					},
				];
			} else {
				signals = [
					...signals,
					{
						name: `${animSelection.name}_tuple_fields`,
						value: [
							{
								type: "E",
								field: field,
							},
						],
					},
					{
						name: `${animSelection.name}_tuple`,
						on: [
							{
								events: [{signal: "eased_anim_clock"}, {signal: "anim_val_curr"}],
								update: `{unit: "", fields: ${animSelection.name}_tuple_fields, values: [anim_val_curr]}`,
								force: true,
							},
						],
					},
				];
			}

			if (animSelection.bind) {
				signals = [
					...signals,
					{
						name: `${animSelection.name}__vgsid_`,
						init: "0",
						bind: {input: "range"},
					},
				];
			}

			// TODO think about what happens if there's more than one animSelection

			const datumPauseSpec = compileDatumPause(animSelection);

			return mergeSpecs(datumPauseSpec, {signals});
		})
		.reduce((prev, curr) => mergeSpecs(curr, prev), {});
};

const compileFilterTransforms = (animationFilters: FilterTransform[], animationSelections: ElaboratedVlAnimationSelection[], dataset: string, markSpecs: vega.Mark[]): Partial<vega.Spec> => {
	if (animationFilters.length) {
		const dataset_curr = `${dataset}_curr`;

		const vlSpec = {
			mark: "circle",
			params: animationSelections,
			transform: animationFilters,
		};
		const datasetSpec = {
			...((vl.compile(vlSpec as any).spec as any).data as any[]).find((d) => d.name === "data_0"),
			name: dataset_curr,
			source: dataset,
		};

		let marks = [];

		marks = markSpecs.map((markSpec) => {
			if (markHasDataset(markSpec, dataset)) {
				return setMarkDataset(markSpec, dataset_curr);
			}
			return markSpec;
		});

		return {
			data: [datasetSpec],
			marks,
		};
	}
	return {};
};

const compileInterpolation = (timeEncoding: ElaboratedVlAnimationTimeEncoding, dataset: string, markSpecs: vega.Mark[], scaleSpecs: vega.Scale[]): Partial<vega.Spec> => {
	if (timeEncoding.interpolate !== false) {
		const dataset_curr = `${dataset}_curr`;
		const interpolate = timeEncoding.interpolate as ElaboratedVlAnimationInterpolate;

		// TODO line interpolation special case

		let scales: vega.Scale[] = [];

		const marks = markSpecs.map((markSpec) => {
			if (getMarkDataset(markSpec) == dataset_curr) {
				const encoding = getMarkEncoding(markSpec);

				Object.keys(encoding).forEach((k) => {
					let encodingDef = encoding[k];
					if (Array.isArray(encodingDef)) {
						// for production rule encodings, the encoding is an array. the last entry is the default def
						encodingDef = encodingDef[encodingDef.length - 1];
					}
					if ((encodingDef as ScaleFieldValueRef).field) {
						const {scale, field} = encodingDef as ScaleFieldValueRef;

						if (scale) {
							const scaleSpec = scaleSpecs.find((s) => s.name === scale);
							switch (scaleSpec.type) {
								case "ordinal":
								case "bin-ordinal":
								case "quantile":
								case "quantize":
								case "threshold":
									return; // if the scale has a discrete output range, don't lerp with it
							}

							const lerp_term =
								scale === "color" // color scales map numbers to strings, so lerp before scale
									? `datum.${timeEncoding.field} == anim_val_curr ? scale('${scale}', interpolateCatmullRom(fieldvaluesforkey('${dataset}', '${field}', '${interpolate.field}', datum.${interpolate.field}), eased_anim_clock / max_range_extent)) : scale('${scale}', datum.${field})`
									: scale // e.g. position scales map anything to numbers, so scale before lerp
									? `datum.${timeEncoding.field} == anim_val_curr ? scale('${scale}', interpolateCatmullRom(fieldvaluesforkey('${dataset}', '${field}', '${interpolate.field}', datum.${interpolate.field}), eased_anim_clock / max_range_extent)) : scale('${scale}', datum.${field})`
									: // e.g. map projections have field but no scale. you can directly lerp the field
									  `datum.${timeEncoding.field} == anim_val_curr ? interpolateCatmullRom(fieldvaluesforkey('${dataset}', '${field}', '${interpolate.field}', datum.${interpolate.field}), eased_anim_clock / max_range_extent) : datum.${field}`;

							markSpec = setMarkEncoding(markSpec, k, {
								signal: lerp_term,
							});
						}
					}
				});
			}
			return markSpec;
		});

		const spec = {
			marks,
			scales,
		};

		return spec;
	}

	return {};
};

const compileEnterExit = (vlaSpec: ElaboratedVlAnimationUnitSpec, markSpecs: vega.Mark[], dataset: string, enter: Encoding<any>, exit: Encoding<any>): Partial<vega.Spec> => {
	let marks = markSpecs;

	if (enter) {
		const vlEnterSpec = {
			...vlaSpec,
			encoding: enter,
		};
		const enterKeys = Object.keys(enter);
		const vgEnterSpec = vl.compile(vlEnterSpec as any).spec;

		marks = markSpecs.map((markSpec) => {
			if (markHasDataset(markSpec, dataset)) {
				const vgUpdate = vgEnterSpec.marks.find((mark) => mark.name === markSpec.name).encode.update;
				const filtered = Object.keys(vgUpdate)
					.filter((key) => enterKeys.includes(key))
					.reduce((obj, key) => {
						(obj as any)[key] = vgUpdate[key];
						return obj;
					}, {});
				markSpec.encode.enter = filtered;
			}
			return markSpec;
		});
	}

	if (exit) {
		const vlExitSpec = {
			...vlaSpec,
			encoding: exit,
		};
		const exitKeys = Object.keys(exit);
		const vgExitSpec = vl.compile(vlExitSpec as any).spec;

		marks = markSpecs.map((markSpec) => {
			if (markHasDataset(markSpec, dataset)) {
				const vgUpdate = vgExitSpec.marks.find((mark) => mark.name === markSpec.name).encode.update;
				const filtered = Object.keys(vgUpdate)
					.filter((key) => exitKeys.includes(key))
					.reduce((obj, key) => {
						(obj as any)[key] = vgUpdate[key];
						return obj;
					}, {});
				markSpec.encode.exit = filtered;
			}
			return markSpec;
		});
	}

	return {
		marks,
	};
};

const sanitizeVlaSpec = (vlaSpec: ElaboratedVlAnimationSpec, animationFilterTransforms: FilterTransform[]): ElaboratedVlAnimationSpec => {
	delete (vlaSpec as any).default;
	// remove the animation filter transforms. we want to manually compile them because they apply directly
	// to the source dataset by default. this messes up scales, which always need the unfiltered domain.
	// the solution is to compile them into a derived dataset instead.
	return {
		...vlaSpec,
		transform: [...(vlaSpec.transform ?? []).filter((t) => !animationFilterTransforms?.includes(t as FilterTransform))],
	};
};

const compileUnitVla = (vlaSpec: ElaboratedVlAnimationUnitSpec): vega.Spec => {
	const animationSelections = getAnimationSelectionFromParams(vlaSpec.params) as ElaboratedVlAnimationSelection[];
	const animationFilters = getAnimationFilterTransforms(vlaSpec.transform, animationSelections);

	const sanitizedVlaSpec = sanitizeVlaSpec(vlaSpec, animationFilters);
	console.log("sanitized", sanitizedVlaSpec);

	let vgSpec = vl.compile(sanitizedVlaSpec as vl.TopLevelSpec).spec;
	console.log("compiled", vgSpec);
	const timeEncoding = vlaSpec.encoding.time;
	const dataset = getMarkDataset(vgSpec.marks[0]);

	/*
	 * stack transform controls the layout of bar charts. if it exists, we need to copy
	 * the transform into derived animation datasets so that layout still works :(
	 */
	let stackTransform: vega.Transforms[] = [];
	if (vlaSpec.mark === "bar") {
		stackTransform = [...vgSpec.data[1].transform];
	}

	vgSpec = mergeSpecs(vgSpec, createAnimationClock(animationSelections[0])); // TODO think about what happens if there's more than one animSelection
	vgSpec = mergeSpecs(vgSpec, compileTimeScale(timeEncoding, dataset, vgSpec.marks, vgSpec.scales, stackTransform));
	vgSpec = mergeSpecs(vgSpec, compileAnimationSelections(animationSelections, timeEncoding.field));
	vgSpec = mergeSpecs(vgSpec, compileFilterTransforms(animationFilters, animationSelections, dataset, vgSpec.marks));
	vgSpec = mergeSpecs(vgSpec, compileInterpolation(timeEncoding, dataset, vgSpec.marks, vgSpec.scales));
	vgSpec = mergeSpecs(vgSpec, compileEnterExit(vlaSpec, vgSpec.marks, dataset, vlaSpec.enter, vlaSpec.exit)); // TODO need examples that actually use this to verify it works

	return vgSpec;
};

const compileVla = (vlaSpec: ElaboratedVlAnimationSpec): vega.Spec => {
	console.log("in compile VLA!");
	if ((vlaSpec as ElaboratedVlAnimationLayerSpec).layer) {
		return compileLayerVla(vlaSpec as ElaboratedVlAnimationLayerSpec); // TODO connect this back to dylan's traverseTree function (sorry!)
	} else {
		return compileUnitVla(vlaSpec as ElaboratedVlAnimationUnitSpec);
	}
};

function compileLayerVla(vlaSpec: ElaboratedVlAnimationLayerSpec): vega.Spec {
	const {returnedSelections, returnedFilters, sanitizedVlaSpec} = recurseThroughLayers(vlaSpec);
	console.log("sanitiezed layer", returnedSelections, returnedFilters, sanitizedVlaSpec);
	let vgSpec = vl.compile(sanitizedVlaSpec as vl.TopLevelSpec).spec;
	console.log("compiled", vgSpec);
	const timeEncoding = vlaSpec.encoding.time;
	const dataset = getMarkDataset(vgSpec.marks[0]);

	/*
	 * stack transform controls the layout of bar charts. if it exists, we need to copy
	 * the transform into derived animation datasets so that layout still works :(
	 */
	let stackTransform: vega.Transforms[] = [];
	//@ts-ignore
	if (vlaSpec.mark === "bar") {
		stackTransform = [...vgSpec.data[1].transform];
	}

	const animationSelections = [].concat(...returnedSelections);
	const animationFilters = [].concat(...returnedFilters);

	vgSpec = mergeSpecs(vgSpec, createAnimationClock(animationSelections[0])); // TODO think about what happens if there's more than one animSelection
	vgSpec = mergeSpecs(vgSpec, compileTimeScale(timeEncoding, dataset, vgSpec.marks, vgSpec.scales, stackTransform));
	vgSpec = mergeSpecs(vgSpec, compileAnimationSelections(animationSelections, timeEncoding.field));
	vgSpec = mergeSpecs(vgSpec, compileFilterTransforms(animationFilters, animationSelections, dataset, vgSpec.marks));
	vgSpec = mergeSpecs(vgSpec, compileInterpolation(timeEncoding, dataset, vgSpec.marks, vgSpec.scales));
	//vgSpec = mergeSpecs(vgSpec, compileEnterExit(vlaSpec, vgSpec.marks, dataset, vlaSpec.enter, vlaSpec.exit)); // TODO need examples that actually use this to verify it works

	return vgSpec;
}

function recurseThroughLayers(vlaSpec: any): any {
	const returnedSelections = [];
	const returnedFilters = [];
	let animationSelections = null,
		animationFilters = null,
		sanitizedVlaSpec = null;

	if (vlaSpec.params) {
		animationSelections = getAnimationSelectionFromParams(vlaSpec.params) as ElaboratedVlAnimationSelection[];
	}

	if (vlaSpec.transform && animationSelections) {
		animationFilters = getAnimationFilterTransforms(vlaSpec.transform, animationSelections);
	}

	sanitizedVlaSpec = sanitizeVlaSpec(vlaSpec, animationFilters);

	returnedSelections.push(animationSelections);
	returnedFilters.push(animationFilters);

	if ((sanitizedVlaSpec as ElaboratedVlAnimationLayerSpec).layer) {
		//@ts-ignore
		const {newReturnedSelections, newReturnedFilters, newSanitizedVlaSpecs} = (sanitizedVlaSpec as ElaboratedVlAnimationLayerSpec).layer.map((layerUnit) => recurseThroughLayers(layerUnit));
		returnedSelections.concat(newReturnedSelections);
		returnedFilters.concat(newReturnedFilters);

		(sanitizedVlaSpec as ElaboratedVlAnimationLayerSpec).layer = newSanitizedVlaSpecs;
	}

	return {returnedSelections, returnedFilters, sanitizedVlaSpec};
}

function traverseTreeWithFunction(vlaSpec: ElaboratedVlAnimationSpec) {
	// Option 1: compile each layer/unit separately and see if we can add each one together?
	// Option 2: recurse
}

////////////////////////////////////////////////////
// dylan wip below
/*
function traverseTree(vlaSpec: ElaboratedVlAnimationSpec): vega.Spec {
	const changedUnitOrLayerSpec = compileUnitVla(vlaSpec as ElaboratedVlAnimationUnitSpec);

	if ((vlaSpec as ElaboratedVlAnimationLayerSpec).layer) {
		// elaborates the current spec, to be called recusively on

		if ((vlaSpec as ElaboratedVlAnimationLayerSpec).layer) {
			changedUnitOrLayerSpec.layer = (vlaSpec as ElaboratedVlAnimationLayerSpec).layer.map((layerUnit) => traverseTree(layerUnit));

			(changedUnitOrLayerSpec as ElaboratedVlAnimationLayerSpec).layer = newLayer;
		}

		return traverseTree(changedUnitOrLayerSpec);
	} else {
		return elaborateUnitVla(changedUnitOrLayerSpec as VlAnimationUnitSpec);
	}
}
*/

export default compileVla;

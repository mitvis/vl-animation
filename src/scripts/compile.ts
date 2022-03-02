import * as vega from "vega";
import * as vl from "vega-lite";
import {
	ElaboratedVlAnimationKey,
	ElaboratedVlAnimationSelection,
	ElaboratedVlAnimationSpec,
	ElaboratedVlAnimationTimeEncoding,
	ElaboratedVlAnimationUnitSpec,
	VlAnimationSelection,
	ElaboratedVlAnimationLayerSpec,
	ElaboratedVlAnimationVConcatSpec,
} from "./types";
import {EventStream, ExprRef, isArray, isObject, isString} from "vega";
import {VariableParameter} from "vega-lite/build/src/parameter";
import {SelectionParameter, isSelectionParameter, PointSelectionConfig, BaseSelectionConfig} from "vega-lite/build/src/selection";
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
import {cloneDeep} from "lodash";
import {isLayerSpec, isVConcatSpec} from "vega-lite/build/src/spec";

type ScaleFieldValueRef = {scale: vega.Field; field: vega.Field}; // ScaledValueRef

export const isParamAnimationSelection = (param: any): param is VlAnimationSelection => {
	if (!isSelectionParameter(param)) {
		return false;
	}
	const select = param.select as BaseSelectionConfig;
	if (select.on === "timer" || (select.on as EventStream).type === "timer") {
		return true;
	}
	return false;
};

export const getAnimationSelectionFromParams = (params: (VariableParameter | SelectionParameter)[]): VlAnimationSelection[] => {
	return params && isArray(params) ? (params.filter(isParamAnimationSelection) as VlAnimationSelection[]) : [];
};

const getAnimationFilterTransforms = (transform: Transform[], animSelections: VlAnimationSelection[]): FilterTransform[] => {
	return (transform ?? []).filter((t) => {
		return (t as FilterTransform).filter && animSelections.some((s) => ((t as FilterTransform).filter as ParameterPredicate).param?.includes(s.name));
	}) as FilterTransform[];
};

const getMarkDataset = (markSpec: vega.Mark): string => {
	if (!markSpec.from) return null;
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

const setScaleDomainDataset = (scaleSpec: vega.Scale, dataset: string): vega.Scale => {
	const fields = (scaleSpec.domain as vega.ScaleMultiDataRef).fields;
	if (fields) {
		if ((scaleSpec.domain as vega.ScaleMultiFieldsRef).data) {
			(scaleSpec.domain as vega.ScaleMultiFieldsRef).data = dataset;
		}
		else {
			(scaleSpec.domain as vega.ScaleMultiDataRef).fields = fields.map(dataRef => {
				(dataRef as vega.ScaleDataRef).data = dataset;
				return dataRef;
			})
		}
	}
	else {
		(scaleSpec.domain as vega.ScaleDataRef).data = dataset;
	}
	return scaleSpec;
}

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

export const selectionBindsSlider = (bind: vega.BindRange | "scales"): bind is vega.BindRange => {
	return bind !== "scales" && isObject(bind) && bind.input === "range";
};

const scaleHasDiscreteRange = (scaleSpec: vega.Scale): boolean => {
	switch (scaleSpec.type) {
		case "ordinal":
		case "bin-ordinal":
		case "quantile":
		case "quantize":
		case "threshold":
			return true; // if the scale has a discrete output range, don't lerp with it
	}
	return false;
}

const mergeSpecs = (vgSpec: vega.Spec, vgPartialSpec: Partial<vega.Spec>): vega.Spec => {
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

const mergeVConcatSpecs = (vgSpec: vega.Spec, vgGroupSpec: vega.GroupMark, vgPartialSpec: Partial<vega.Spec>, topLevelSignals?: boolean) => {
	let {scales, data, signals, ...vgPartialGroupSpec} = vgPartialSpec;
	if (scales) {
		vgSpec = mergeSpecs(vgSpec, {scales});
	}
	if (data) {
		vgSpec = mergeSpecs(vgSpec, {data});
	}
	if (topLevelSignals) {
		if (signals) {
			vgSpec = mergeSpecs(vgSpec, {signals});
		}
		vgGroupSpec = mergeSpecs(vgGroupSpec, vgPartialGroupSpec) as vega.GroupMark;
	}
	else {
		vgGroupSpec = mergeSpecs(vgGroupSpec, {...vgPartialGroupSpec, signals}) as vega.GroupMark;
	}

	vgSpec = {
		...vgSpec,
		marks: (vgSpec.marks ?? []).filter((s) => s.name !== vgGroupSpec.name).concat(vgGroupSpec)
	}
	return {
		vgSpec,
		vgGroupSpec
	};
}

const throttleMs = 1000 / 60;

const createAnimationClock = (animSelection: ElaboratedVlAnimationSelection, timeEncoding: ElaboratedVlAnimationTimeEncoding): Partial<vega.Spec> => {
	let pauseExpr = animSelection.select.on.filter ? (isArray(animSelection.select.on.filter) ? animSelection.select.on.filter.join(" && ") : animSelection.select.on.filter) : "true";
	if (animSelection.select.pause) {
		pauseExpr += " && is_playing_datum_pause"
	}

	const pauseEventStreams = animSelection.select.on.filter
		? isArray(animSelection.select.on.filter)
			? animSelection.select.on.filter.map((s) => ({signal: s}))
			: [{signal: animSelection.select.on.filter}]
		: [];

	const easeExpr = isString(animSelection.select.easing)
		? `${animSelection.select.easing}(anim_clock / max_range_extent)`
		: `interpolateCatmullRom(${animSelection.select.easing}, anim_clock / max_range_extent)`; // if easing is a number[], use it to construct an easing function

	const bindStream = selectionBindsSlider(animSelection.bind)
		? [
				{
					events: {signal: `${animSelection.name}__vgsid_`},
					update: `scale('${timeEncoding.scale.type === "band" ? `time_${timeEncoding.field}` : "time"}', ${animSelection.name}__vgsid_)`,
				},
		  ]
		: [];

	const signals: vega.Signal[] = [
		{
			name: "anim_clock", // ms elapsed in animation
			init: "0",
			on: [
				{
					events: {type: "timer", throttle: throttleMs},
					update: `${pauseExpr} ? (anim_clock + (now() - last_tick_at) > max_range_extent ? 0 : anim_clock + (now() - last_tick_at)) : anim_clock`,
				},
				...bindStream,
			],
		},
		{
			name: "last_tick_at",
			init: "now()",
			on: [
				{
					events: [{signal: "anim_clock"}, ...pauseEventStreams, ...(animSelection.select.pause ? [{signal: "is_playing_datum_pause"}] : [])],
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
						expr: "datum.value == anim_value",
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
	}
	return {
		data,
		signals,
	};
};

const compileAnimationSelections = (animationSelections: ElaboratedVlAnimationSelection[], field: string, markSpecs: vega.Mark[], scaleSpecs: vega.Scale[], vconcatIndex?: string): Partial<vega.Spec> => {
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
				const getPredValue = (p: FieldPredicate): string => {
					const pred = p as any;
					const key = Object.keys(pred).find((k) => k !== "field"); // find the value key e.g. 'eq', 'lte'
					const value = pred[key];
					if (isString(value)) {
						return value;
					}
					if ((value as ExprRef).expr) {
						return value.expr;
					}
					return String(value);
				};
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
								events: {signal: "anim_value"},
								update: `{unit: "${vconcatIndex ? `concat_${vconcatIndex}` : ''}", fields: ${animSelection.name}_tuple_fields, values: [${and ? and.map(getPredValue).join(", ") : getPredValue(predicate as FieldPredicate)}]}`,
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
								events: [{signal: "eased_anim_clock"}, {signal: "anim_value"}],
								update: `{unit: "${vconcatIndex ? `concat_${vconcatIndex}` : ''}", fields: ${animSelection.name}_tuple_fields, values: [anim_value ? anim_value : min_extent]}`,
								force: true,
							},
						],
					},
				];
			}

			// this is for overview + detail example with a brush
			if (animSelection.select.type === 'interval' && vconcatIndex) {
				signals = [
					...signals,
					{
						name: `${animSelection.name}_x`,
						update: `data('${animSelection.name}_store').length ? [scale('concat_${vconcatIndex}_x', brush['${field}'][0]), scale('concat_${vconcatIndex}_x', brush['${field}'][1])] : [0, 0]`
					}
				]
			}

			let marks: vega.Mark[] = [];
			let scales: vega.Scale[] = [];

			if (selectionBindsSlider(animSelection.bind)) {
				// BindRange
				signals = [
					...signals,
					{
						name: `${animSelection.name}__vgsid_`,
						bind: animSelection.bind,
					},
					{
						name: `${animSelection.name}__vgsid__modify`,
						init: "true",
					},
					{
						name: "is_playing",
						init: "true",
						bind: {input: "checkbox"},
						on: [
							{
								events: {signal: `${animSelection.name}__vgsid_`},
								update: `${animSelection.name}__vgsid__modify ? false : is_playing`,
								force: true,
							},
						],
					},
				];
			} else if (animSelection.bind === "scales") {
				marks = markSpecs.map((markSpec) => {
					const encoding = getMarkEncoding(markSpec);

					Object.keys(encoding).forEach((k) => {
						let encodingDef = encoding[k];
						if (Array.isArray(encodingDef)) {
							// for production rule encodings, the encoding is an array. the last entry is the default def
							encodingDef = encodingDef[encodingDef.length - 1];
						}
						if ((encodingDef as ScaleFieldValueRef).field) {
							const {scale, field: _field} = encodingDef as ScaleFieldValueRef;
							if (_field !== field) return;

							markSpec.clip = true;

							if (scale) {
								const scaleSpec = scaleSpecs.find((s) => s.name === scale);
								scaleSpec.domainRaw = {signal: `${animSelection.name}["${field}"]`};
								scales = [...scales, scaleSpec];
							}
						}
					});

					return markSpec;
				});
			}

			const datumPauseSpec = compileDatumPause(animSelection);

			return mergeSpecs(datumPauseSpec, {
				signals,
				marks,
				scales,
			});
		})
		.reduce((prev, curr) => mergeSpecs(curr, prev), {});
};

const compileKey = (timeEncoding: ElaboratedVlAnimationTimeEncoding, dataset: string, markSpecs: vega.Mark[], scaleSpecs: vega.Scale[], stackTransform: vega.Transforms[]): Partial<vega.Spec> => {
	if (timeEncoding.key !== false && timeEncoding.scale.type === "band") {
		const dataset_curr = `${dataset}_curr`;
		const dataset_eq = `${dataset}_eq`;
		const dataset_next = `${dataset}_next`;
		const dataset_eq_next = `${dataset}_eq_next`;
		const dataset_interpolate = `${dataset}_interpolate`;

		const key = timeEncoding.key as ElaboratedVlAnimationKey;

		const signals: vega.Signal[] = [
			{
				name: "anim_val_next", // next keyframe's value in time domain
				// if interpolate.loop is true, we want to tween between last and first keyframes. therefore, next of last is first
				update: `t_index < length(${timeEncoding.field}_domain) - 1 ? ${timeEncoding.field}_domain[t_index + 1] : ${key && key.loop ? "min_extent" : "max_extent"}`,
			},
			{
				name: "anim_tween", // tween signal between keyframes
				init: "0",
				on: [
					{
						events: [{signal: "eased_anim_clock"}, {signal: "anim_val_next"}, {signal: "anim_value"}],
						update: `anim_val_next != anim_value ? (eased_anim_clock - scale('time_${timeEncoding.field}', anim_value)) / (scale('time_${timeEncoding.field}', anim_val_next) - scale('time_${timeEncoding.field}', anim_value)) : 0`,
					},
				],
			},
		];

		const data: vega.Data[] = [
			{
				name: dataset_eq,
				source: dataset,
				transform: [
					{
						type: "filter",
						expr: `datum.${timeEncoding.field} == anim_value`,
					},
					...stackTransform,
				],
			},
			{
				name: dataset_next,
				source: dataset,
				transform: [
					{
						type: "filter",
						expr: `datum.${timeEncoding.field} == anim_val_next`,
					},
					...stackTransform,
				],
			},
			{
				name: dataset_eq_next,
				source: dataset_eq,
				transform: [
					{
						type: "lookup",
						from: dataset_next,
						key: key.field,
						fields: [key.field],
						as: ["next"],
					},
					{
						type: "filter",
						expr: "isValid(datum.next)",
					},
				],
			},
			{
				name: dataset_interpolate,
				source: [dataset_curr, dataset_eq_next],
				transform: [
					{
						type: "filter",
						expr: `datum.${timeEncoding.field} == anim_value && isValid(datum.next) || datum.${timeEncoding.field} != anim_value`,
					},
				],
			},
		];

		// TODO line interpolation special case

		let scales: vega.Scale[] = [];

		const marks = markSpecs.map((markSpec) => {
			if (getMarkDataset(markSpec) == dataset_curr) {
				markSpec = setMarkDataset(markSpec, dataset_interpolate);

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
							if (scaleHasDiscreteRange(scaleSpec)) return;

							if (timeEncoding.rescale) {
								// rescale: the scale updates based on the animation frame
								const scaleNextName = scaleSpec.name + "_next";
								if (!scaleSpecs.find((s) => s.name === scaleNextName) && !scales.find((s) => s.name === scaleNextName)) {
									// if it doesn't already exist, create a "next" scale for the current scale
									let scaleSpecNext = cloneDeep(scaleSpec);
									scaleSpecNext.name = scaleNextName;
									scaleSpecNext = setScaleDomainDataset(scaleSpecNext, dataset_next) as any;
									scales = [...scales, scaleSpecNext];
								}
							}
							const eq_next_lerp = `isValid(datum.next) ? lerp([scale('${scale}', datum.${field}), scale('${
								timeEncoding.rescale ? scale + "_next" : scale
							}', datum.next.${field})], anim_tween) : scale('${scale}', datum.${field})`;

							const lerp_term =
								scale === "color" // color scales map numbers to strings, so lerp before scale
									? `datum.${timeEncoding.field} == anim_value ? scale('${scale}', interpolateCatmullRom(fieldvaluesforkey('${dataset}', '${field}', '${key.field}', datum.${key.field}), eased_anim_clock / max_range_extent)) : scale('${scale}', datum.${field})`
									: scale // e.g. position scales map anything to numbers
									? stackTransform.length
										? eq_next_lerp // if there's a stack transform, lerp the eq/next way because stack transform operates on keyframe instead of whole dataset
										: // if scale maps numbers to numbers, then do it the interpolateCatmullRom way. otherwise, do it the eq/next way because e.g. nominal to position will likely use scale driven by keyframe domain
										  `isNumber(datum.${timeEncoding.field}) ? (datum.${timeEncoding.field} == anim_value ? scale('${scale}', interpolateCatmullRom(fieldvaluesforkey('${dataset}', '${field}', '${key.field}', datum.${key.field}), eased_anim_clock / max_range_extent)) : scale('${scale}', datum.${field})) : (${eq_next_lerp})`
									: // e.g. map projections have field but no scale. you can directly lerp the field
									  `datum.${timeEncoding.field} == anim_value ? interpolateCatmullRom(fieldvaluesforkey('${dataset}', '${field}', '${key.field}', datum.${key.field}), eased_anim_clock / max_range_extent) : datum.${field}`;

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
			signals,
			data,
			marks,
			scales,
		};

		return spec;
	}

	return {};
};

const compileTimeScale = (timeEncoding: ElaboratedVlAnimationTimeEncoding, dataset: string, markSpecs: vega.Mark[], scaleSpecs: vega.Scale[]): Partial<vega.Spec> => {
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
				name: "anim_value", // current keyframe's value in time field domain
				update: "invert('time', eased_anim_clock)",
			},
			{
				name: "max_range_extent", // max value of time range
				init: "extent(range('time'))[1]",
			},
			{
				name: `time_domain`,
				init: `domain('time')`,
			},
			{
				name: "min_extent", // min value of time field domain
				init: `extent(time_domain)[0]`,
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
				domain: timeEncoding.scale.domain ?? {data: dataset, field: timeEncoding.field, sort: true},
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
				update: `indexof(${timeEncoding.field}_domain, anim_value)`,
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
				name: "anim_value", // current keyframe's value in time field domain
				update: `invert('time_${timeEncoding.field}', eased_anim_clock)`,
			},
		];
	}

	if (timeEncoding.rescale) {
		markSpecs.forEach((markSpec) => {
			if (markHasDataset(markSpec, dataset)) {
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
							// rescale: the scale updates based on the animation frame
							let scaleSpec = scaleSpecs.find((s) => s.name === scale);
							if (scaleHasDiscreteRange(scaleSpec)) return;
							scaleSpec = setScaleDomainDataset(scaleSpec, `${dataset}_curr`);;
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

const compileFilterTransforms = (
	animationFilters: FilterTransform[],
	animationSelections: ElaboratedVlAnimationSelection[],
	dataset: string,
	markSpecs: vega.Mark[],
	stackTransform: vega.Transforms[]
): Partial<vega.Spec> => {
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

		datasetSpec.transform = [...datasetSpec.transform, ...stackTransform];

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

const compileEnterExit = (vlaSpec: ElaboratedVlAnimationSpec, markSpecs: vega.Mark[], dataset: string, enter: Encoding<any>, exit: Encoding<any>): Partial<vega.Spec> => {
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

	let vgSpec = vl.compile(sanitizedVlaSpec as vl.TopLevelSpec).spec;

	const timeEncoding = vlaSpec.encoding.time;
	const dataset = getMarkDataset(vgSpec.marks.find((mark) => getMarkDataset(mark)));

	/*
	 * stack transform controls the layout of bar charts. if it exists, we need to copy
	 * the transform into derived animation datasets so that layout still works :(
	 */
	let stackTransform: vega.Transforms[] = [];
	if (vlaSpec.mark === "bar") {
		stackTransform = [...vgSpec.data.find((d) => d.name === dataset).transform];
	}

	vgSpec = mergeSpecs(vgSpec, createAnimationClock(animationSelections[0], timeEncoding));
	vgSpec = mergeSpecs(vgSpec, compileTimeScale(timeEncoding, dataset, vgSpec.marks, vgSpec.scales));
	vgSpec = mergeSpecs(vgSpec, compileAnimationSelections(animationSelections, timeEncoding.field, vgSpec.marks, vgSpec.scales));
	vgSpec = mergeSpecs(vgSpec, compileFilterTransforms(animationFilters, animationSelections, dataset, vgSpec.marks, stackTransform));
	vgSpec = mergeSpecs(vgSpec, compileKey(timeEncoding, dataset, vgSpec.marks, vgSpec.scales, stackTransform));
	vgSpec = mergeSpecs(vgSpec, compileEnterExit(vlaSpec, vgSpec.marks, dataset, vlaSpec.enter, vlaSpec.exit));

	return vgSpec;
};

function compileLayerVla(vlaSpec: ElaboratedVlAnimationLayerSpec): vega.Spec {
	let allAnimationSelections: any[] = [];
	const animationSelections = getAnimationSelectionFromParams(vlaSpec.params) as ElaboratedVlAnimationSelection[];
	allAnimationSelections = allAnimationSelections.concat(animationSelections);
	vlaSpec.layer.forEach((layerSpec) => {
		const animationSelections = getAnimationSelectionFromParams(layerSpec.params) as ElaboratedVlAnimationSelection[];
		allAnimationSelections = allAnimationSelections.concat(animationSelections);
	});
	//
	const animationFilters = getAnimationFilterTransforms(vlaSpec.transform, allAnimationSelections);
	console.log(animationFilters);
	let sanitizedVlaSpec = sanitizeVlaSpec(vlaSpec, animationFilters) as ElaboratedVlAnimationLayerSpec;
	sanitizedVlaSpec.layer = sanitizedVlaSpec.layer.map((layerSpec) => {
		const animationFilters = getAnimationFilterTransforms(layerSpec.transform, allAnimationSelections);
		console.log(animationFilters);
		return sanitizeVlaSpec(layerSpec, animationFilters) as ElaboratedVlAnimationUnitSpec;
	});

	let vgSpec = vl.compile(sanitizedVlaSpec as vl.TopLevelSpec).spec;
	// for some reason vl will compile duplicate signal names for the top level param in bar chart race example
	vgSpec.signals = vgSpec.signals
		.map((signal) => {
			if (signal === vgSpec.signals.find((s) => s.name === signal.name)) {
				return signal;
			}
			return null;
		})
		.filter((x) => x);

	if (vlaSpec.encoding?.time) {
		const timeEncoding = vlaSpec.encoding.time;
		const dataset = getMarkDataset(vgSpec.marks.find((mark) => getMarkDataset(mark)));

		vgSpec = mergeSpecs(vgSpec, createAnimationClock(allAnimationSelections[0], timeEncoding));

		vgSpec = mergeSpecs(vgSpec, compileTimeScale(timeEncoding, dataset, vgSpec.marks, vgSpec.scales));

		if (vlaSpec.params) {
			const animationSelections = getAnimationSelectionFromParams(vlaSpec.params) as ElaboratedVlAnimationSelection[];
			if (animationSelections.length) {
				vgSpec = mergeSpecs(vgSpec, compileAnimationSelections(animationSelections, timeEncoding.field, vgSpec.marks, vgSpec.scales));
			}
		}

		if (vlaSpec.transform) {
			const animationFilters = getAnimationFilterTransforms(vlaSpec.transform, allAnimationSelections);
			let stackTransform: vega.Transforms[] = [];
			let hasBar = false;
			vlaSpec.layer.forEach((layerSpec) => {
				if (layerSpec.mark === "bar") {
					stackTransform = stackTransform.concat(vgSpec.data.find((d) => d.name === dataset).transform);
					hasBar = true;
				}
			});
			if (hasBar) {
				// this is kind of a gross hardcode but needed to make text mark layer work with racing bar chart
				vgSpec.marks = vgSpec.marks.map(markSpec => {
					return setMarkDataset(markSpec, dataset);
				})
				if ((vlaSpec.encoding?.y as any)?.sort) {
					vgSpec.scales = vgSpec.scales.map(scaleSpec => {
						if (scaleSpec.name === 'y') {
							if ((scaleSpec.domain as any).sort) {
								(scaleSpec.domain as any).sort = { ...(vlaSpec.encoding.y as any).sort, "op": "sum"}
							}
						}
						return scaleSpec;
					})
				}
			}
			vgSpec = mergeSpecs(vgSpec, compileFilterTransforms(animationFilters, allAnimationSelections, dataset, vgSpec.marks, stackTransform));
			vgSpec = mergeSpecs(vgSpec, compileKey(timeEncoding, dataset, vgSpec.marks, vgSpec.scales, stackTransform));
		}
	}

	const dataset = getMarkDataset(vgSpec.marks.find((mark) => getMarkDataset(mark)));
	vgSpec = mergeSpecs(vgSpec, compileEnterExit(vlaSpec, vgSpec.marks, dataset, vlaSpec.enter, vlaSpec.exit));

	vlaSpec.layer.forEach((layerSpec, idx) => {
		const mark = vgSpec.marks[idx];
		const dataset = getMarkDataset(mark);

		const timeEncoding = layerSpec.encoding?.time;

		if (timeEncoding) {
			vgSpec = mergeSpecs(vgSpec, compileTimeScale(timeEncoding, dataset, vgSpec.marks, vgSpec.scales));
			vgSpec = mergeSpecs(vgSpec, createAnimationClock(allAnimationSelections[0], timeEncoding));

			if (vlaSpec.params) {
				const animationSelections = getAnimationSelectionFromParams(vlaSpec.params) as ElaboratedVlAnimationSelection[];

				if (animationSelections.length) {
					vgSpec = mergeSpecs(vgSpec, compileAnimationSelections(animationSelections, timeEncoding.field, vgSpec.marks, vgSpec.scales));
				}
			}
		}

		if (layerSpec.params) {
			const animationSelections = getAnimationSelectionFromParams(layerSpec.params) as ElaboratedVlAnimationSelection[];

			if (animationSelections.length) {
				const nearestTimeEncoding = timeEncoding ?? vlaSpec.encoding?.time;
				vgSpec = mergeSpecs(vgSpec, compileAnimationSelections(animationSelections, nearestTimeEncoding.field, vgSpec.marks, vgSpec.scales));
			}
		}

		if (layerSpec.transform) {
			const nearestTimeEncoding = timeEncoding ?? vlaSpec.encoding?.time;

			let stackTransform: vega.Transforms[] = [];
			if (layerSpec.mark === "bar") {
				stackTransform = [...vgSpec.data.find((d) => d.name === dataset).transform];
			}

			const animationFilters = getAnimationFilterTransforms(layerSpec.transform, allAnimationSelections);
			vgSpec = mergeSpecs(vgSpec, compileFilterTransforms(animationFilters, allAnimationSelections, dataset, vgSpec.marks, stackTransform));
			vgSpec = mergeSpecs(vgSpec, compileKey(nearestTimeEncoding, dataset, vgSpec.marks, vgSpec.scales, stackTransform));
		}

		vgSpec = mergeSpecs(vgSpec, compileEnterExit(layerSpec, vgSpec.marks, dataset, layerSpec.enter, layerSpec.exit));
	});
	return vgSpec;
}

const compileVConcatVla = (vlaSpec: ElaboratedVlAnimationVConcatSpec): vega.Spec => {
	let vgSpec = vl.compile(vlaSpec as vl.TopLevelSpec).spec;

	vlaSpec.vconcat.forEach((unitVla, index) => {
		const animationSelections = getAnimationSelectionFromParams(unitVla.params) as ElaboratedVlAnimationSelection[];
		if (!animationSelections.length) {
			return;
		}
		const animationFilters = getAnimationFilterTransforms(unitVla.transform, animationSelections);

		// const sanitizedVlaSpec = sanitizeVlaSpec(unitVla, animationFilters);

		let vgGroupSpec = vgSpec.marks[index] as vega.GroupMark;

		const timeEncoding = unitVla.encoding.time;
		if (timeEncoding) {
			const dataset = getMarkDataset(vgGroupSpec.marks.find((mark) => getMarkDataset(mark)));

			/*
			* stack transform controls the layout of bar charts. if it exists, we need to copy
			* the transform into derived animation datasets so that layout still works :(
			*/
			let stackTransform: vega.Transforms[] = [];
			if (unitVla.mark === "bar") {
				stackTransform = [...vgSpec.data.find((d) => d.name === dataset).transform];
			}

			({vgSpec, vgGroupSpec} = mergeVConcatSpecs(vgSpec, vgGroupSpec, createAnimationClock(animationSelections[0], timeEncoding), true));
			({vgSpec, vgGroupSpec} = mergeVConcatSpecs(vgSpec, vgGroupSpec, compileTimeScale(timeEncoding, dataset, vgGroupSpec.marks, vgSpec.scales), true));
			({vgSpec, vgGroupSpec} = mergeVConcatSpecs(vgSpec, vgGroupSpec, compileAnimationSelections(animationSelections, timeEncoding.field, vgGroupSpec.marks, vgSpec.scales, String(index))));
			({vgSpec, vgGroupSpec} = mergeVConcatSpecs(vgSpec, vgGroupSpec, compileFilterTransforms(animationFilters, animationSelections, dataset, vgGroupSpec.marks, stackTransform)));
			({vgSpec, vgGroupSpec} = mergeVConcatSpecs(vgSpec, vgGroupSpec, compileKey(timeEncoding, dataset, vgGroupSpec.marks, vgSpec.scales, stackTransform), true));
		}

	});

	return vgSpec;
};

const compileVla = (vlaSpec: ElaboratedVlAnimationSpec): vega.Spec => {
	if (isLayerSpec(vlaSpec)) {
		return compileLayerVla(vlaSpec as ElaboratedVlAnimationLayerSpec);
	} else if (isVConcatSpec(vlaSpec)) {
		return compileVConcatVla(vlaSpec as ElaboratedVlAnimationVConcatSpec);
	} else {
		return compileUnitVla(vlaSpec as ElaboratedVlAnimationUnitSpec);
	}
};

export default compileVla;

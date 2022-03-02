import * as vega from "vega";
import {Encoding} from "vega-lite/build/src/encoding";
import {GenericVConcatSpec, LayerSpec, TopLevel, UnitSpec} from "vega-lite/build/src/spec";
import {BaseSelectionConfig, PointSelectionConfig, SelectionParameter} from "vega-lite/build/src/selection";
import {VariableParameter} from "vega-lite/build/src/parameter";
import {FieldPredicate} from "vega-lite/build/src/predicate";
import {LogicalAnd} from "vega-lite/build/src/logical";

// As suggested: https://dev.to/vborodulin/ts-how-to-override-properties-with-type-intersection-554l
type Override<T1, T2> = Omit<T1, keyof T2> & T2;

// Types specific to Vega-Lite Animation
type VlAnimationTimeScale = (
	| {
			type?: "band";
			range?: number[] | {step: number};
	  }
	| {
			type?: "linear";
			zero?: boolean;
			range?: number[];
	  }
) & {
	domain?: any[];
};

export type VlAnimationSelection = Override<
	SelectionParameter,
	{
		select: Override<
			BaseSelectionConfig,
			{
				on:
					| "timer"
					| {
							type: "timer";
							filter?: vega.Expr | vega.Expr[];
					  };
				// "predicate"?: LogicalComposition<Predicate>;
				predicate?: LogicalAnd<FieldPredicate> | FieldPredicate;
				easing?: string | number[]; // string name of d3-ease function, or a number[] with ascending values in [0, 1] to construct a custom interpolator
				pause?: {value: vega.Datum; duration: number}[];
			}
		>;
		bind?: vega.BindRange | "scales";
	}
>;

type VlAnimationKey = {
	field: string;
	loop?: boolean;
};

export type VlAnimationTimeEncoding = {
	field: string;
	scale?: VlAnimationTimeScale;
	key?: VlAnimationKey;
	rescale?: boolean;
};

// actual unit spec, is either top level or is top level
export type VlAnimationUnitSpec = Override<
	UnitSpec<any>,
	{
		params?: (VariableParameter | SelectionParameter | VlAnimationSelection)[];
		encoding?: Encoding<any> & {time?: VlAnimationTimeEncoding};
		enter?: Encoding<any>;
		exit?: Encoding<any>;
	}
>;

export type VlAnimationLayerSpec = Override<
	LayerSpec<any>,
	{
		layer: VlAnimationUnitSpec[];
		encoding?: Encoding<any> & {time?: VlAnimationTimeEncoding};
		params?: (VariableParameter | SelectionParameter | VlAnimationSelection)[];
	}
>;

export type VlAnimationVConcatSpec = GenericVConcatSpec<VlAnimationUnitSpec>;

// This is the type of an initial input json spec, can be either unit or have layers (written by the user)
export type VlAnimationSpec = VlAnimationLayerSpec | VlAnimationUnitSpec | VlAnimationVConcatSpec;

/////////////////////////// Elaborated Specs  ///////////////////////////
export type ElaboratedVlAnimationTimeScale = (
	| {
			type: "band";
			range: number[] | {step: number};
	  }
	| {
			type: "linear";
			zero?: boolean; // optional, default false
			range: number[];
	  }
) & {
	domain?: any[]; // undefined domain means use data/field domain
};

export type ElaboratedVlAnimationSelection = Override<
	SelectionParameter,
	{
		select: Override<
			BaseSelectionConfig,
			{
				on: {
					type: "timer";
					filter?: vega.Expr | vega.Expr[];
				};
				// "predicate"?: LogicalComposition<Predicate>;
				predicate?: LogicalAnd<FieldPredicate> | FieldPredicate;
				easing: string | number[];
				pause?: {value: vega.Datum; duration: number}[];
			}
		>;
		bind?: vega.BindRange | "scales";
	}
>;

export type ElaboratedVlAnimationKey = {
	field: string;
	loop: boolean;
};

export type ElaboratedVlAnimationTimeEncoding = {
	field: string;
	scale: ElaboratedVlAnimationTimeScale;
	key: ElaboratedVlAnimationKey | false;
	rescale: boolean;
};

export type ElaboratedVlAnimationUnitSpec = Override<
	UnitSpec<any>,
	{
		params?: (VariableParameter | SelectionParameter | ElaboratedVlAnimationSelection)[];
		encoding?: Encoding<any> & {time?: ElaboratedVlAnimationTimeEncoding};
		enter?: Encoding<any>;
		exit?: Encoding<any>;
	}
>;

export type ElaboratedVlAnimationLayerSpec = Override<
	LayerSpec<any> | UnitSpec<any>,
	{
		layer: ElaboratedVlAnimationUnitSpec[];
		encoding?: Encoding<any> & {time?: ElaboratedVlAnimationTimeEncoding};
		params?: (VariableParameter | SelectionParameter | ElaboratedVlAnimationSelection)[];
		enter?: Encoding<any>;
		exit?: Encoding<any>;
	}
>;

export type ElaboratedVlAnimationVConcatSpec = GenericVConcatSpec<ElaboratedVlAnimationUnitSpec>;

// the elaborated type we create from the input and pass to the compiler
export type ElaboratedVlAnimationSpec = ElaboratedVlAnimationUnitSpec | TopLevel<ElaboratedVlAnimationLayerSpec> | ElaboratedVlAnimationVConcatSpec;

import * as vega from 'vega';
import { Encoding } from 'vega-lite/build/src/encoding';
import { LayerSpec, TopLevel, UnitSpec} from 'vega-lite/build/src/spec';
import { PointSelectionConfig, SelectionParameter } from 'vega-lite/build/src/selection';
import { VariableParameter } from 'vega-lite/build/src/parameter';
import { FieldPredicate } from 'vega-lite/build/src/predicate';
import { LogicalAnd } from 'vega-lite/build/src/logical';

// As suggested: https://dev.to/vborodulin/ts-how-to-override-properties-with-type-intersection-554l
type Override<T1, T2> = Omit<T1, keyof T2> & T2;

// Types specific to Vega-Lite Animation
type VlAnimationTimeScale = ({
  "type"?: "band";
  "range"?: number[] | {"step": number};
} | {
  "type"?: "linear";
  "zero"?: boolean;
  "range"?: number[];
}) & {
  "domain"?: any[];
  "pause"?: {"value": vega.Datum, "duration": number}[]
};

export type VlAnimationSelection = Override<SelectionParameter, {
  "select": Override<PointSelectionConfig, {
    "on": "timer" | {
      "type": "timer",
      "filter"?: vega.Expr | vega.Expr[];
    }
    // "predicate"?: LogicalComposition<Predicate>;
    "predicate"?: LogicalAnd<FieldPredicate> | FieldPredicate;
    "easing"?: string;
  }>;
  "bind"?: vega.BindRange;
}>;

type VlAnimationTimeEncoding = {
  "field": string,
  "scale"?: VlAnimationTimeScale,
  "interpolate"?: {
    "field": string,
    "loop"?: boolean
  },
  "rescale"?: boolean
};

// actual unit spec, is either top level or is top level
export type VlAnimationUnitSpec = Override<UnitSpec<any>, {
  "params": (VariableParameter | SelectionParameter | VlAnimationSelection)[];
  "encoding": Encoding<any> & { "time"?: VlAnimationTimeEncoding },
  "enter"?: Encoding<any>,
  "exit"?: Encoding<any>,
}>;

export type VlAnimationLayerSpec = Override<LayerSpec<any>, {
  layer: (VlAnimationLayerSpec | VlAnimationUnitSpec)[],
  encoding?: Encoding<any> & { "time"?: VlAnimationTimeEncoding }
}>;

// This is the type of an initial input json spec, can be either unit or have layers (written by the user)
export type VlAnimationSpec = VlAnimationUnitSpec | TopLevel<VlAnimationLayerSpec>;

/////////////////////////// Elaborated Specs  ///////////////////////////
export type ElaboratedVlAnimationTimeScale = ({
  "type": "band";
  "range": number[] | {"step": number};
} | {
  "type": "linear";
  "zero"?: boolean; // optional, default false
  "range": number[];
}) & {
  "domain"?: any[]; // undefined domain means use data/field domain
  "pause"?: {"value": vega.Datum, "duration": number}[]
};

export type ElaboratedVlAnimationSelection = Override<SelectionParameter, {
  "select": Override<PointSelectionConfig, {
    "on": {
      "type": "timer",
      "filter": vega.Expr | vega.Expr[];
    },
    // "predicate"?: LogicalComposition<Predicate>;
    "predicate"?: LogicalAnd<FieldPredicate> | FieldPredicate;
    "easing": string;
  }>;
  "bind"?: vega.BindRange;
}>;

export type ElaboratedVlAnimationTimeEncoding = {
  "field": string,
  "scale": ElaboratedVlAnimationTimeScale,
  "interpolate": {
    "field": string,
    "loop": boolean
  } | false,
  "rescale": boolean,
};

export type ElaboratedVlAnimationUnitSpec = Override<UnitSpec<any>, {
  "params": (VariableParameter | SelectionParameter | ElaboratedVlAnimationSelection)[];
  "encoding": Encoding<any> & { "time"?: ElaboratedVlAnimationTimeEncoding },
  "enter"?: Encoding<any>,
  "exit"?: Encoding<any>,
}>;

export type ElaboratedVlAnimationLayerSpec = Override<LayerSpec<any>, {
  layer: (ElaboratedVlAnimationLayerSpec | ElaboratedVlAnimationUnitSpec)[],
  encoding?: Encoding<any> & { "time"?: VlAnimationTimeEncoding }
}>;

// the elaborated type we create from the input and pass to the compiler
export type ElaboratedVlAnimationSpec = ElaboratedVlAnimationUnitSpec | TopLevel<ElaboratedVlAnimationLayerSpec>;

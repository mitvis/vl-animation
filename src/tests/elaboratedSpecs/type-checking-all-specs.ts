import {VlAnimationSpec, ElaboratedVlAnimationSpec} from "../..";

const elaboratedBirdsSpec: ElaboratedVlAnimationSpec = {
	width: 1000,
	height: 600,
	data: {
		url: "https://gist.githubusercontent.com/jonathanzong/5f4fa36e8c2cd04639bc550540264dc6/raw/6cb2070b6ffdd2d4bc1a91fdd635737048414881/bird_data.csv",
	},
	transform: [{calculate: "toNumber(datum.day)", as: "n_day"}],
	projection: {
		type: "mercator",
	},
	encoding: {
		longitude: {
			field: "lon",
			type: "quantitative",
		},
		latitude: {
			field: "lat",
			type: "quantitative",
		},
		color: {
			field: "species",
		},
		time: {
			field: "n_day",
			scale: {
				type: "band",
				range: {step: 100},
			},
			continuity: {
				field: "species",
			},
			rescale: false,
			interpolateLoop: false,
		},
	},
	layer: [
		{
			mark: "circle",
			transform: [
				{calculate: "toNumber(datum.day)", as: "n_day"},
				{
					filter: {
						time: [{equal: "datum.day"}],
					},
				},
			],
			encoding: {
				opacity: {value: 1},
				time: {
					field: null,
					scale: null,
					rescale: false,
					interpolateLoop: false,
				},
			},
		},
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								gt: "datum.day-10",
							},
							{
								lt: "datum.day",
							},
						],
					},
				},
			],
			encoding: {
				opacity: {value: 0.5},
				time: {
					field: null,
					scale: null,
					rescale: false,
					interpolateLoop: false,
				},
			},
		},
	],
};

// Step 0: populate each layer with the time encoding (e.g. field:"year") if its in the base
// if that layer doesn't change the top level spec, put that property as null
// Step 1: add transform->filter if it doesn't exist ( add it in at the end of the array)
// We need to ensure each layer has at least one time encoding
// Note: we may need to do this in data.
// Step 2: add rescale:false, interpolateLoop:false to the time encoding

const elaboratedGapminderSpec: ElaboratedVlAnimationSpec = {
	data: {
		url: "https://raw.githubusercontent.com/vega/vega-datasets/master/data/gapminder.json",
	},
	mark: "point",
	transform: [
		{
			filter: {
				time: [{equal: "datum.year"}],
			},
		},
	],
	encoding: {
		color: {
			field: "country",
		},
		x: {
			field: "fertility",
			type: "quantitative",
		},
		y: {
			field: "life_expect",
			type: "quantitative",
		},
		time: {
			field: "year",
			scale: {
				type: "linear",
				range: [0, 50000],
			},
			continuity: {
				field: "country",
			},
			rescale: false,
			interpolateLoop: false,
		},
	},
};

// instead of using past:true, we've changed it to use a layer and have one of the layers
const initialScatterplotSpec: VlAnimationSpec = {
	width: 1000,
	height: 1000,
	data: {url: "https://raw.githubusercontent.com/vega/vega-datasets/master/data/driving.json"},
	transform: [
		{
			calculate: "':)'",
			as: "key",
		},
	],
	encoding: {
		x: {
			field: "miles",
			type: "quantitative",
			scale: {zero: false},
		},
		y: {
			field: "gas",
			type: "quantitative",
			scale: {zero: false},
		},
		time: {
			field: "year",
			scale: {
				type: "band",
				range: {step: 200},
			},
			continuity: {field: "key"},
		},
	},
	layer: [
		{
			mark: "line",
			transform: [
				{
					filter: {
						time: [{lte: "datum.year"}],
					},
				},
			],
			encoding: {
				opacity: {value: 0.5},
			},
		},
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.year",
							},
						],
					},
				},
			],
			encoding: {
				order: {field: "year"},
			},
		},
	],
};

const elaboratedScatterplotSpec: ElaboratedVlAnimationSpec = {
	width: 1000,
	height: 1000,
	data: {url: "https://raw.githubusercontent.com/vega/vega-datasets/master/data/driving.json"},
	transform: [
		{
			calculate: "':)'",
			as: "key",
		},
	],
	encoding: {
		x: {
			field: "miles",
			type: "quantitative",
			scale: {zero: false},
		},
		y: {
			field: "gas",
			type: "quantitative",
			scale: {zero: false},
		},
		time: {
			field: "year",
			scale: {
				type: "band",
				range: {step: 200},
			},
			continuity: {field: "key"},
			rescale: false,
			interpolateLoop: false,
		},
	},
	layer: [
		{
			mark: "line",
			transform: [
				{
					filter: {
						time: [{lte: "datum.year"}],
					},
				},
			],
			encoding: {
				opacity: {value: 0.5},
				time: {
					field: null,
					scale: null,
					continuity: null,
					rescale: false,
					interpolateLoop: false,
				},
			},
		},
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.year",
							},
						],
					},
				},
			],
			encoding: {
				order: {field: "year"},
				time: {
					field: null,
					scale: null,
					continuity: null,
					rescale: false,
					interpolateLoop: false,
				},
			},
		},
	],
};

const initialCovidTrendsSpec: VlAnimationSpec = {
	width: 1000,
	height: 1000,
	data: {
		url: "https://gist.githubusercontent.com/jonathanzong/5f4fa36e8c2cd04639bc550540264dc6/raw/3acfc06e88d2f26ca797be116a813dcc0225bc70/tidy_covid19_global_data.csv",
	},
	transform: [
		{
			window: [
				{
					op: "mean",
					field: "new_daily",
					as: "new_weekly_avg",
				},
			],
			groupby: ["country"],
			sort: [{field: "date", order: "ascending"}],
			ignorePeers: false,
			frame: [-7, 0],
		},
		{
			filter: "datum.cases > 0 && datum.new_daily > 0",
		},
	],
	encoding: {
		x: {field: "cases", type: "quantitative", scale: {type: "log"}, axis: {grid: false}},
		y: {field: "new_weekly_avg", type: "quantitative", scale: {type: "log"}, axis: {grid: false}},
		color: {field: "country"},
		time: {
			field: "date",
			scale: {
				type: "band",
				range: {step: 50},
			},
			continuity: {
				field: "country",
			},
		},
	},
	layer: [
		{
			mark: "point",
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.date",
							},
						],
					},
				},
			],
		},
		{
			mark: "line",
			transform: [
				{
					filter: {
						time: [{lte: "datum.date"}],
					},
				},
			],
		},
	],
};

const elaboratedCovidTrendsSpec: ElaboratedVlAnimationSpec = {
	width: 1000,
	height: 1000,
	data: {
		url: "https://gist.githubusercontent.com/jonathanzong/5f4fa36e8c2cd04639bc550540264dc6/raw/3acfc06e88d2f26ca797be116a813dcc0225bc70/tidy_covid19_global_data.csv",
	},
	transform: [
		{
			window: [
				{
					op: "mean",
					field: "new_daily",
					as: "new_weekly_avg",
				},
			],
			groupby: ["country"],
			sort: [{field: "date", order: "ascending"}],
			ignorePeers: false,
			frame: [-7, 0],
		},
		{
			filter: "datum.cases > 0 && datum.new_daily > 0",
		},
	],
	encoding: {
		x: {field: "cases", type: "quantitative", scale: {type: "log"}, axis: {grid: false}},
		y: {field: "new_weekly_avg", type: "quantitative", scale: {type: "log"}, axis: {grid: false}},
		color: {field: "country"},
		time: {
			field: "date",
			scale: {
				type: "band",
				range: {step: 50},
			},
			continuity: {
				field: "country",
			},
			interpolateLoop: false,
			rescale: false,
		},
	},
	layer: [
		{
			mark: "point",
			encoding: {
				time: {
					field: null,
					scale: null,
					continuity: null,
					interpolateLoop: false,
					rescale: false,
				},
			},
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.date",
							},
						],
					},
				},
			],
		},
		{
			mark: "line",
			encoding: {
				time: {
					field: null,
					scale: null,
					continuity: null,
					interpolateLoop: false,
					rescale: false,
				},
			},
			transform: [
				{
					filter: {
						time: [{lte: "datum.year"}],
					},
				},
			],
		},
	],
};

const initialDunkinsSpec: VlAnimationSpec = {
	width: 500,
	height: 300,
	data: {
		url: "https://gist.githubusercontent.com/dwootton/a3c02e0f170d0b84638e014c63d1f908/raw/6a9504ac7ba878f18799e2e3777ca766e4953ddc/dunkins_no_24_hr.csv",
	},
	projection: {
		type: "albersUsa",
	},
	encoding: {
		longitude: {
			field: "longitude",
			type: "quantitative",
		},
		latitude: {
			field: "latitude",
			type: "quantitative",
		},
		color: {
			value: "#FFFAA0",
		},
		time: {
			field: "open_datetime",
			scale: {
				type: "linear",
				range: [0.0, 24.0],
			},
		},
	},
	layer: [
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.closed_datetime",
							},
						],
					},
				},
			],
			encoding: {
				color: {value: "#FFFAA0"},
			},
		},
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.open_datetime",
							},
						],
					},
				},
			],
			encoding: {
				color: {value: "black"},
			},
		},
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								gt: "datum.open_datetime",
							},
							{
								lt: "datum.closed_datetime",
							},
						],
					},
				},
			],
			encoding: {
				color: {
					value: "#A7C7E7",
				},
			},
		},
	],
};

const elaboratedDunkinsSpec: ElaboratedVlAnimationSpec = {
	width: 500,
	height: 300,
	data: {
		url: "https://gist.githubusercontent.com/dwootton/a3c02e0f170d0b84638e014c63d1f908/raw/6a9504ac7ba878f18799e2e3777ca766e4953ddc/dunkins_no_24_hr.csv",
	},
	projection: {
		type: "albersUsa",
	},
	encoding: {
		longitude: {
			field: "longitude",
			type: "quantitative",
		},
		latitude: {
			field: "latitude",
			type: "quantitative",
		},
		color: {
			value: "#FFFAA0",
		},
		time: {
			field: "open_datetime",
			scale: {
				type: "linear",
				range: [0.0, 24.0],
			},
			rescale: false,
			interpolateLoop: false,
		},
	},
	layer: [
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.closed_datetime",
							},
						],
					},
				},
			],
			encoding: {
				color: {value: "#FFFAA0"},
				time: {
					field: null,
					scale: null,
					rescale: false,
					interpolateLoop: false,
				},
			},
		},
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								equal: "datum.open_datetime",
							},
						],
					},
				},
			],
			encoding: {
				color: {value: "black"},
				time: {
					field: null,
					scale: null,
					rescale: false,
					interpolateLoop: false,
				},
			},
		},
		{
			mark: "circle",
			transform: [
				{
					filter: {
						time: [
							{
								gt: "datum.open_datetime",
							},
							{
								lt: "datum.closed_datetime",
							},
						],
					},
				},
			],
			encoding: {
				color: {
					value: "#A7C7E7",
				},
				time: {
					field: null,
					scale: null,
					rescale: false,
					interpolateLoop: false,
				},
			},
		},
	],
};

const initialBarChartRaceSpec: VlAnimationSpec = {
	data: {
		url: "https://gist.githubusercontent.com/jonathanzong/5f4fa36e8c2cd04639bc550540264dc6/raw/fcc1e69167289e4e3c78b8a86ae258b14cc83a2d/category-brands.csv",
	},
	mark: "bar",
	encoding: {
		color: {
			field: "category",
		},
		x: {
			field: "value",
			type: "quantitative",
		},
		y: {
			field: "name",
			type: "nominal",
			sort: {field: "value", order: "descending"},
		},
		time: {
			field: "date",
			scale: {
				type: "linear",
				range: [0, 50000],
			},
			continuity: {
				field: "name",
			},
			rescale: true,
		},
	},
};

const elaboratedBarChartRaceSpec: ElaboratedVlAnimationSpec = {
	data: {
		url: "https://gist.githubusercontent.com/jonathanzong/5f4fa36e8c2cd04639bc550540264dc6/raw/fcc1e69167289e4e3c78b8a86ae258b14cc83a2d/category-brands.csv",
	},
	mark: "bar",
	transform: [
		{
			filter: {
				time: [{equal: "datum.date"}],
			},
		},
	],
	encoding: {
		color: {
			field: "category",
		},
		x: {
			field: "value",
			type: "quantitative",
		},
		y: {
			field: "name",
			type: "nominal",
			sort: {field: "value", order: "descending"},
		},
		time: {
			field: "date",
			scale: {
				type: "linear",
				range: [0, 50000],
			},
			continuity: {
				field: "name",
			},
			interpolateLoop: false,
			rescale: true,
		},
	},
};

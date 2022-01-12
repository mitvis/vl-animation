//@ts-nocheck
import elaborateVla from "../scripts/elaboration";
import compileVla from "../scripts/compile";
import gapminderSpec from "../gapminder.json";
import birdsSpec from "../birds.json";
import dunkinsSpec from "../dunkins_opening_closing_updated_syntax.json";
import {VlAnimationSpec, ElaboratedVlAnimationSpec} from "..";

test("adds 1 + 2 to equal 3", () => {
	expect(1 + 2).toBe(3);
});

const initialBirdsSpec = birdsSpec as VlAnimationSpec;

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
	mark: "circle",
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

/*
const dunkinsCompiledOutput = {
  "$schema": "https://vega.github.io/schema/vega/v5.json",
  "background": "white",
  "padding": 5,
  "width": 500,
  "height": 300,
  "style": "cell",
  "data": [ // all of the data transformations, handled internally in vega
    {
      "name": "source_0",
      "url": "https://gist.githubusercontent.com/dwootton/a3c02e0f170d0b84638e014c63d1f908/raw/6a9504ac7ba878f18799e2e3777ca766e4953ddc/dunkins_no_24_hr.csv",
      "format": {
        "type": "csv"
      },
      "transform": [
        {
          "type": "geojson",
          "fields": [
            "longitude",
            "latitude"
          ],
          "signal": "geojson_0"
        },
        {
          "type": "geopoint",
          "projection": "projection",
          "fields": [
            "longitude",
            "latitude"
          ],
          "as": [
            "x",
            "y"
          ]
        }
      ]
    },
    {
      "name": "source_0_curr",
      "source": "source_0",
      "transform": [
        {
          "type": "filter",
          "expr": "datum['open_datetime'] == anim_val_curr"
        }
      ]
    },
    {
      "name": "source_0_next",
      "source": "source_0",
      "transform": [
        {
          "type": "filter",
          "expr": "datum['open_datetime'] == anim_val_next"
        }
      ]
    },
    {
      "name": "source_0_past",
      "source": "source_0",
      "transform": [
        {
          "type": "filter",
          "expr": "datum['open_datetime'] < anim_val_curr && (true)"
        }
      ]
    }
  ],
  "projections": [
    {
      "name": "projection",
      "size": {
        "signal": "[width, height]"
      },
      "fit": {
        "signal": "geojson_0"
      },
      "type": "albersUsa"
    }
  ],
  "marks": [
    {
      "name": "marks",
      "type": "symbol",
      "style": [
        "circle"
      ],
      "from": {
        "data": "source_0_curr"
      },
      "encode": {
        "update": {
          "opacity": {
            "value": 0.7
          },
          "fill": {
            "value": "#FFFAA0"
          },
          "ariaRoleDescription": {
            "value": "circle"
          },
          "description": {
            "signal": "\"longitude: \" + (format(datum[\"longitude\"], \"\")) + \"; latitude: \" + (format(datum[\"latitude\"], \"\"))"
          },
          "x": {
            "signal": "isValid(datum.next) ? lerp([datum.x, datum.next.x], anim_tween) : datum.x"
          },
          "y": {
            "signal": "isValid(datum.next) ? lerp([datum.y, datum.next.y], anim_tween) : datum.y"
          },
          "shape": {
            "value": "circle"
          }
        }
      },
      "zindex": 999
    },
    {
      "name": "marks_past",
      "type": "symbol",
      "style": [
        "circle"
      ],
      "from": {
        "data": "source_0_past"
      },
      "encode": {
        "update": {
          "opacity": {
            "value": 0.7
          },
          "fill": [
            {
              "test": "anim_val_curr <= datum.closed_datetime && anim_val_curr >= datum.open_datetime",
              "value": "#A7C7E7"
            },
            {
              "value": "black"
            }
          ],
          "ariaRoleDescription": {
            "value": "circle"
          },
          "description": {
            "signal": "\"longitude: \" + (format(datum[\"longitude\"], \"\")) + \"; latitude: \" + (format(datum[\"latitude\"], \"\"))"
          },
          "x": {
            "field": "x"
          },
          "y": {
            "field": "y"
          },
          "shape": {
            "value": "circle"
          }
        }
      }
    },
    {
      "type": "text",
      "encode": {
        "update": {
          "text": {
            "signal": "anim_val_curr"
          },
          "x": {
            "signal": "width"
          },
          "fontWeight": {
            "value": "bold"
          },
          "fontSize": {
            "value": 16
          }
        }
      }
    }
  ],
  "signals": [
    {
      "name": "t_index",
      "init": "0",
      "on": [
        {
          "events": {
            "type": "timer",
            "throttle": 500
          },
          "update": "t_index < length(domain('time')) - 1 ? t_index + 1 : 0"
        }
      ]
    },
    {
      "name": "min_extent",
      "init": "extent(domain('time'))[0]"
    },
    {
      "name": "max_extent",
      "init": "extent(domain('time'))[1]"
    },
    {
      "name": "anim_val_curr",
      "update": "domain('time')[t_index]"
    },
    {
      "name": "anim_val_next",
      "update": "t_index < length(domain('time')) - 1 ? domain('time')[t_index + 1] : max_extent"
    },
    {
      "name": "anim_tween",
      "init": "0",
      "on": [
        {
          "events": {
            "type": "timer",
            "throttle": 16.666666666666668
          },
          "update": "anim_tween + 0.03333333333333333"
        },
        {
          "events": {
            "signal": "anim_val_curr"
          },
          "update": "0"
        }
      ]
    }
  ],
  "scales": [
    {
      "name": "time",
      "type": "ordinal",
      "domain": {
        "data": "source_0",
        "field": "open_datetime",
        "sort": true
      }
    }
  ]
}

test('Dunkins Correctly elaborates + compiles', () => {
  const elaborated = elaborateVla(dunkinsSpec);
  const compiled = compileVla(elaborated)
  console.log(compiled);
  expect(compiled).toMatchObject(dunkinsOutput);
});

*/

test("elaboration initial", () => {
	const elaborated = elaborateVla(gapminderSpec);
	const elabGap = {
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
		hi: "hi",
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
	expect(elaborated).toMatchObject(elabGap);
});

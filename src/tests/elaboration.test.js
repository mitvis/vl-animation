import elaborateVla from '../scripts/elaboration';
import compileVla from '../scripts/compile';

import dunkinsSpec from '../dunkins_opening_closing.json';
test('adds 1 + 2 to equal 3', () => {
  expect(1+2).toBe(3);
});

const dunkinsOutput = {
    "$schema": "https://vega.github.io/schema/vega/v5.json",
    "background": "white",
    "padding": 5,
    "width": 500,
    "height": 300,
    "style": "cell",
    "data": [
        {
            "name": "source_0",
            "url": "https://gist.githubusercontent.com/dwootton/a3c02e0f170d0b84638e014c63d1f908/raw/6a9504ac7ba878f18799e2e3777ca766e4953ddc/dunkins_no_24_hr.csv",
            "format": {
                "type": "csv",
                "delimiter": ","
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
test('Dunkins Correctly elaborates', () => {
    expect(compileVla(elaborateVla(dunkinsSpec))).toBe(dunkinsOutput);
  });

/*

*/
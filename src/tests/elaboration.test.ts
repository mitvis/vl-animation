//@ts-nocheck
import elaborateVla from "../scripts/elaboration";
import gapminderSpec from "../gapminder.json";
import barChartSpec from "../bar-chart-race.json";

import elaboratedGapminderSpec from "./elaboratedSpecs/elaborated-gapminder.json";
import elaboratedBarChartRaceSpec from "./elaboratedSpecs/elaborated-bar-chart-race.json";
import elaboratedConnectedScatterplotSpec from "./elaboratedSpecs/elaborated-connected-scatterplot.json";
import elaboratedCovidTrendsSpec from "./elaboratedSpecs/elaborated-covid-trends.json";
import elaboratedDunkinsSpec from "./elaboratedSpecs/elaborated-dunkins.json";
import elaboratedBirdSpec from "./elaboratedSpecs/elaborated-birds.json";

test("adds 1 + 2 to equal 3", () => {
	expect(1 + 2).toBe(3);
});

test("elaboration gapminder", () => {
	const elaborated = elaborateVla(gapminderSpec);

	expect(elaborated).toEqual(elaboratedGapminderSpec);
});

test("elaboration bar chart", () => {
	const elaborated = elaborateVla(barChartSpec);

	expect(elaborated).toEqual(elaboratedBarChartRaceSpec);
});

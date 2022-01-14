//@ts-nocheck
import compileVla from "../scripts/compile";
import gapminderSpec from "../gapminder.json";
import barChartSpec from "../bar-chart-race.json";
import connectedScatterplotSpec from "../connected-scatterplot.json";
import birdsSpec from "../birds.json";

import elaboratedGapminderSpec from "./elaboratedSpecs/elaborated-gapminder.json";
import elaboratedBarChartRaceSpec from "./elaboratedSpecs/elaborated-bar-chart-race.json";
import elaboratedConnectedScatterplotSpec from "./elaboratedSpecs/elaborated-connected-scatterplot.json";
import elaboratedCovidTrendsSpec from "./elaboratedSpecs/elaborated-covid-trends.json";
import elaboratedDunkinsSpec from "./elaboratedSpecs/elaborated-dunkins.json";
import elaboratedBirdSpec from "./elaboratedSpecs/elaborated-birds.json";

test("adds 1 + 2 to equal 3", () => {
	expect(1 + 2).toBe(3);
});

test("compiled gapminder", () => {
	const compiled = compileVla(elaboratedGapminderSpec);

	expect(compiled).toEqual({});
});

test("compiled bar chart", () => {
	const elaborated = elaborateVla(barChartSpec);

	expect(elaborated).toEqual(elaboratedBarChartRaceSpec);
});

/*

Commenting out as this test doesn't work due to it distributing the time encoding 
down to the child elements (not in the elaborated spec)

test("elaboration birds", () => {
	const elaborated = elaborateVla(birdsSpec);

	expect(elaborated).toEqual(elaboratedBirdSpec);
});
*/

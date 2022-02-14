//@ts-nocheck
import elaborateVla from "../scripts/elaboration";
import gapminderSpec from "../gapminder.json";
import birdsSpec from "../birds.json";

test("elaboration initial", () => {
	const elaborated = elaborateVla(gapminderSpec);

	expect(elaborated).toEqual(elabGap);
});

test("elaboration birds", () => {
	const elaborated = elaborateVla(birdsSpec);
	debugger;

	expect(elaborated).toEqual(elabGap);
});

import { withBackgroundFixtures, runFixtureScript } from "../background/fixtures.mjs";
await withBackgroundFixtures((env) =>
  runFixtureScript("scripts/search/controls-acceptance.mts", env),
);

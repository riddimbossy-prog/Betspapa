import test from "node:test";
import assert from "node:assert/strict";

import {
  hydrateProfilesForFixtures
} from "../src/services/historyHydrationService.js";

test("targeted hydration accepts targetTeamIds without ReferenceError", async () => {
  const result = await hydrateProfilesForFixtures(
    {},
    [],
    new Map(),
    {
      force: false,
      targetTeamIds: [101]
    }
  );

  assert.equal(result.teamsChecked, 0);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.importedFixtures, 0);
  assert.deepEqual(result.audits, []);
});

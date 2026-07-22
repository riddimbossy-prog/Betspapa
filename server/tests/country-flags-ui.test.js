import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(here, "../../assets/js/country-flags.v1175.js");
const source = fs.readFileSync(scriptPath, "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const flags = context.window.BetsPapaFlags;

test("resolves standard football countries", () => {
  assert.equal(flags.countryFlag("USA"), "🇺🇸");
  assert.equal(flags.countryFlag("Ghana"), "🇬🇭");
  assert.equal(flags.countryFlag("Czech Republic"), "🇨🇿");
  assert.equal(flags.countryFlag("Kosovo"), "🇽🇰");
});

test("handles football nations and international competitions", () => {
  assert.ok(flags.countryFlag("England").startsWith("🏴"));
  assert.equal(flags.countryFlag("World"), "🌍");
  assert.equal(flags.countryFlag("Europe"), "🇪🇺");
});

test("formats league labels with a flag", () => {
  assert.equal(flags.leagueText({ country: "Ghana", name: "Premier League" }), "🇬🇭 Ghana · Premier League");
  assert.equal(flags.leagueNameText({ country: "USA", name: "Major League Soccer" }), "🇺🇸 Major League Soccer");
});

import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAthenaSeparationV2 } from "../src/engine/athenaSeparationEngineV2.js";

function result({ww=.1,dw=.1,ht=.3,o25=.65,avg=3.1}={}) { return {routes:{homeWW:{adjusted:ww},awayWW:{adjusted:ww},homeDW:{adjusted:dw},awayDW:{adjusted:dw},homeLW:{adjusted:0},awayLW:{adjusted:0}},metrics:{home:{htDrawRate:ht},away:{htDrawRate:ht}},classification:{combinedOver25:o25,combinedAvgGoals:avg}};}
test("early separation",()=>assert.equal(evaluateAthenaSeparationV2(result({ww:.18,dw:.04,ht:.25})).type,"EARLY_SEPARATION"));
test("late separation",()=>assert.equal(evaluateAthenaSeparationV2(result({ww:.04,dw:.12,ht:.55})).type,"LATE_SEPARATION"));
test("mixed separation",()=>assert.equal(evaluateAthenaSeparationV2(result({ww:.10,dw:.08,ht:.35})).type,"MIXED_SEPARATION"));
test("goal-only high event",()=>assert.equal(evaluateAthenaSeparationV2(result({ww:.03,dw:.03,ht:.3})).type,"GOAL_ONLY_HIGH_EVENT"));

const profile = (matches, values) => ({ matches, ...values });
const goals = (matches, values) => ({ matches, ...values });

export const demoFixtures = [
  {
    fixtureId: "arg-itu-smb-001",
    competition: "Argentina · Primera B",
    kickoff: "2026-07-14T23:00:00Z",
    home: {
      name: "Ituzaingó",
      short: "ITU",
      htft: {
        overall: profile(26, { WW: 1, WD: 2, WL: 1, DW: 2, DD: 7, DL: 3, LW: 1, LD: 1, LL: 8 }),
        venue: profile(13, { WW: 0, WD: 1, WL: 0, DW: 1, DD: 4, DL: 1, LW: 0, LD: 0, LL: 6 }),
        recent: profile(6, { WW: 0, WD: 1, WL: 0, DW: 0, DD: 2, DL: 1, LW: 0, LD: 0, LL: 2 })
      },
      goals: {
        overall: goals(26, { scoreRate: 0.58, concedeRate: 0.73, bttsRate: 0.46, over15Rate: 0.69, over25Rate: 0.42, under35Rate: 0.81, scored2PlusRate: 0.27, conceded2PlusRate: 0.46, failedToScoreRate: 0.42, cleanSheetRate: 0.23, secondHalfScoringRate: 0.5 }),
        venue: goals(13, { scoreRate: 0.54, concedeRate: 0.77, bttsRate: 0.46, over15Rate: 0.69, over25Rate: 0.38, under35Rate: 0.85, scored2PlusRate: 0.23, conceded2PlusRate: 0.46, failedToScoreRate: 0.46, cleanSheetRate: 0.15, secondHalfScoringRate: 0.54 }),
        recent: goals(6, { scoreRate: 0.5, concedeRate: 0.83, bttsRate: 0.5, over15Rate: 0.67, over25Rate: 0.5, under35Rate: 0.83, scored2PlusRate: 0.17, conceded2PlusRate: 0.5, failedToScoreRate: 0.5, cleanSheetRate: 0.17, secondHalfScoringRate: 0.5 })
      }
    },
    away: {
      name: "San Martín Burzaco",
      short: "SMB",
      htft: {
        overall: profile(26, { WW: 8, WD: 1, WL: 0, DW: 4, DD: 7, DL: 1, LW: 0, LD: 0, LL: 5 }),
        venue: profile(13, { WW: 4, WD: 0, WL: 0, DW: 2, DD: 5, DL: 0, LW: 0, LD: 0, LL: 2 }),
        recent: profile(6, { WW: 2, WD: 0, WL: 0, DW: 1, DD: 2, DL: 0, LW: 0, LD: 0, LL: 1 })
      },
      goals: {
        overall: goals(26, { scoreRate: 0.73, concedeRate: 0.5, bttsRate: 0.42, over15Rate: 0.65, over25Rate: 0.38, under35Rate: 0.85, scored2PlusRate: 0.38, conceded2PlusRate: 0.23, failedToScoreRate: 0.27, cleanSheetRate: 0.42, secondHalfScoringRate: 0.58 }),
        venue: goals(13, { scoreRate: 0.77, concedeRate: 0.54, bttsRate: 0.46, over15Rate: 0.69, over25Rate: 0.38, under35Rate: 0.85, scored2PlusRate: 0.38, conceded2PlusRate: 0.23, failedToScoreRate: 0.23, cleanSheetRate: 0.38, secondHalfScoringRate: 0.62 }),
        recent: goals(6, { scoreRate: 0.83, concedeRate: 0.5, bttsRate: 0.5, over15Rate: 0.67, over25Rate: 0.33, under35Rate: 1, scored2PlusRate: 0.33, conceded2PlusRate: 0.17, failedToScoreRate: 0.17, cleanSheetRate: 0.5, secondHalfScoringRate: 0.67 })
      }
    },
    league: {
      goals: { bttsRate: 0.48, under35Rate: 0.79 }
    }
  },
  {
    fixtureId: "arg-merlo-pilar-002",
    competition: "Argentina · Primera B",
    kickoff: "2026-07-14T23:00:00Z",
    home: {
      name: "Deportivo Merlo",
      short: "MER",
      htft: {
        overall: profile(26, { WW: 5, WD: 1, WL: 0, DW: 4, DD: 4, DL: 3, LW: 3, LD: 3, LL: 3 }),
        venue: profile(13, { WW: 2, WD: 0, WL: 0, DW: 2, DD: 2, DL: 2, LW: 2, LD: 2, LL: 1 }),
        recent: profile(6, { WW: 1, WD: 0, WL: 0, DW: 1, DD: 1, DL: 1, LW: 1, LD: 1, LL: 0 })
      },
      goals: {
        overall: goals(26, { scoreRate: 0.77, concedeRate: 0.69, bttsRate: 0.62, over15Rate: 0.77, over25Rate: 0.58, under35Rate: 0.69, scored2PlusRate: 0.42, conceded2PlusRate: 0.38, failedToScoreRate: 0.23, cleanSheetRate: 0.31, secondHalfScoringRate: 0.65 }),
        venue: goals(13, { scoreRate: 0.85, concedeRate: 0.77, bttsRate: 0.69, over15Rate: 0.85, over25Rate: 0.62, under35Rate: 0.62, scored2PlusRate: 0.46, conceded2PlusRate: 0.46, failedToScoreRate: 0.15, cleanSheetRate: 0.23, secondHalfScoringRate: 0.69 }),
        recent: goals(6, { scoreRate: 0.83, concedeRate: 0.83, bttsRate: 0.67, over15Rate: 0.83, over25Rate: 0.67, under35Rate: 0.67, scored2PlusRate: 0.5, conceded2PlusRate: 0.5, failedToScoreRate: 0.17, cleanSheetRate: 0.17, secondHalfScoringRate: 0.67 })
      }
    },
    away: {
      name: "Real Pilar",
      short: "RPI",
      htft: {
        overall: profile(26, { WW: 5, WD: 3, WL: 2, DW: 4, DD: 3, DL: 2, LW: 2, LD: 2, LL: 3 }),
        venue: profile(13, { WW: 2, WD: 2, WL: 1, DW: 2, DD: 1, DL: 1, LW: 1, LD: 1, LL: 2 }),
        recent: profile(6, { WW: 1, WD: 1, WL: 0, DW: 1, DD: 0, DL: 1, LW: 1, LD: 0, LL: 1 })
      },
      goals: {
        overall: goals(26, { scoreRate: 0.73, concedeRate: 0.73, bttsRate: 0.62, over15Rate: 0.77, over25Rate: 0.58, under35Rate: 0.69, scored2PlusRate: 0.38, conceded2PlusRate: 0.42, failedToScoreRate: 0.27, cleanSheetRate: 0.27, secondHalfScoringRate: 0.62 }),
        venue: goals(13, { scoreRate: 0.77, concedeRate: 0.77, bttsRate: 0.69, over15Rate: 0.85, over25Rate: 0.62, under35Rate: 0.62, scored2PlusRate: 0.38, conceded2PlusRate: 0.46, failedToScoreRate: 0.23, cleanSheetRate: 0.23, secondHalfScoringRate: 0.62 }),
        recent: goals(6, { scoreRate: 0.83, concedeRate: 0.83, bttsRate: 0.67, over15Rate: 0.83, over25Rate: 0.67, under35Rate: 0.67, scored2PlusRate: 0.5, conceded2PlusRate: 0.5, failedToScoreRate: 0.17, cleanSheetRate: 0.17, secondHalfScoringRate: 0.67 })
      }
    },
    league: { goals: { bttsRate: 0.51, under35Rate: 0.76 } }
  },
  {
    fixtureId: "arg-juv-prov-003",
    competition: "Argentina · Torneo Promocional Amateur",
    kickoff: "2026-07-14T17:00:00Z",
    home: {
      name: "Juventud de Bernal",
      short: "JDB",
      htft: {
        overall: profile(7, { WW: 0, WD: 0, WL: 0, DW: 0, DD: 0, DL: 2, LW: 1, LD: 0, LL: 4 }),
        venue: profile(3, { WW: 0, WD: 0, WL: 0, DW: 0, DD: 0, DL: 1, LW: 0, LD: 0, LL: 2 }),
        recent: profile(6, { WW: 0, WD: 0, WL: 0, DW: 0, DD: 0, DL: 2, LW: 1, LD: 0, LL: 3 })
      },
      goals: {
        overall: goals(7, { scoreRate: 0.43, concedeRate: 1, bttsRate: 0.43, over15Rate: 0.71, over25Rate: 0.57, under35Rate: 0.57, scored2PlusRate: 0.14, conceded2PlusRate: 0.71, failedToScoreRate: 0.57, cleanSheetRate: 0, secondHalfScoringRate: 0.43 }),
        venue: goals(3, { scoreRate: 0.33, concedeRate: 1, bttsRate: 0.33, over15Rate: 0.67, over25Rate: 0.67, under35Rate: 0.33, scored2PlusRate: 0, conceded2PlusRate: 1, failedToScoreRate: 0.67, cleanSheetRate: 0, secondHalfScoringRate: 0.33 }),
        recent: goals(6, { scoreRate: 0.5, concedeRate: 1, bttsRate: 0.5, over15Rate: 0.83, over25Rate: 0.67, under35Rate: 0.5, scored2PlusRate: 0.17, conceded2PlusRate: 0.83, failedToScoreRate: 0.5, cleanSheetRate: 0, secondHalfScoringRate: 0.5 })
      }
    },
    away: {
      name: "Provincial",
      short: "PRO",
      htft: {
        overall: profile(7, { WW: 2, WD: 0, WL: 0, DW: 0, DD: 0, DL: 2, LW: 0, LD: 0, LL: 3 }),
        venue: profile(3, { WW: 1, WD: 0, WL: 0, DW: 0, DD: 0, DL: 0, LW: 0, LD: 0, LL: 2 }),
        recent: profile(6, { WW: 2, WD: 0, WL: 0, DW: 0, DD: 0, DL: 1, LW: 0, LD: 0, LL: 3 })
      },
      goals: {
        overall: goals(7, { scoreRate: 0.71, concedeRate: 0.71, bttsRate: 0.43, over15Rate: 0.86, over25Rate: 0.71, under35Rate: 0.57, scored2PlusRate: 0.57, conceded2PlusRate: 0.43, failedToScoreRate: 0.29, cleanSheetRate: 0.29, secondHalfScoringRate: 0.71 }),
        venue: goals(3, { scoreRate: 0.67, concedeRate: 0.67, bttsRate: 0.33, over15Rate: 1, over25Rate: 0.67, under35Rate: 0.33, scored2PlusRate: 0.67, conceded2PlusRate: 0.33, failedToScoreRate: 0.33, cleanSheetRate: 0.33, secondHalfScoringRate: 0.67 }),
        recent: goals(6, { scoreRate: 0.83, concedeRate: 0.67, bttsRate: 0.5, over15Rate: 1, over25Rate: 0.83, under35Rate: 0.5, scored2PlusRate: 0.67, conceded2PlusRate: 0.33, failedToScoreRate: 0.17, cleanSheetRate: 0.33, secondHalfScoringRate: 0.83 })
      }
    },
    league: { goals: { bttsRate: 0.46, under35Rate: 0.68 } }
  }
];

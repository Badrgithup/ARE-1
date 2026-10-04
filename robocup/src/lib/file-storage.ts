/**
 * Backwards-compatibility wrapper delegating to the high-performance
 * Local Tournament Repository (in-memory write-through cache + atomic indexed persistence).
 */
export {
  saveTournament,
  loadTournament,
  listTournaments,
  deleteTournament,
  exportTournamentToCsv,
  getLocalDiagnostics,
} from './tournament-repository'

import type { ReactNode } from "react";
import "./activity-settings.css";

export type LeaderboardRow = { rank: number; name: string; paternalSurname: string; grade: number; attempts: number };
const medals = ["🥇", "🥈", "🥉"];

export default function ActivityLeaderboard({ rows, children }: { rows: LeaderboardRow[]; children?: ReactNode }) {
  return <section className="activity-leaderboard" aria-label="Tabla de posiciones">
    <h2>Tabla de posiciones</h2>
    {children}
    {rows.length ? <ol>{rows.slice(0, 35).map(row => <li key={`${row.rank}-${row.name}-${row.paternalSurname}`} className={row.rank <= 3 ? `podium podium-${row.rank}` : ""}>
      <span className={`leader-rank ${row.rank <= 3 ? "leader-medal" : "leader-number"}`}>{row.rank <= 3 ? medals[row.rank - 1] : row.rank}</span>
      <span className="leader-student">{row.name} {row.paternalSurname}</span>
      <strong>{Number(row.grade).toFixed(1)} / 10</strong>
      <small>{row.attempts} {row.attempts === 1 ? "intento" : "intentos"}</small>
    </li>)}</ol> : <p>Aún no hay resultados para esta actividad.</p>}
  </section>;
}

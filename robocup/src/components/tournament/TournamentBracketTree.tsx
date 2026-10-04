'use client'

import React, { useMemo } from 'react'
import clsx from 'clsx'
import { Trophy, Check, Swords, ShieldCheck, ChevronRight } from 'lucide-react'
import type { Tournament } from '@/lib/types'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import {
  buildTournamentTree,
  TournamentTreeData,
  TreeStageColumn,
  TreeMatchNode,
  TreeGroupNode,
  TreeQualifierNode,
} from '@/lib/bracket-tree-builder'

export interface TournamentBracketTreeProps {
  tournament: Tournament
  onSelectMatch?: (matchId: string) => void
  isProjector?: boolean
  className?: string
}

export function TournamentBracketTree({
  tournament,
  onSelectMatch,
  isProjector = false,
  className,
}: TournamentBracketTreeProps) {
  const treeData: TournamentTreeData = useMemo(() => {
    return buildTournamentTree(tournament)
  }, [tournament])

  // Helper for orthogonal connector path with smooth rounded corners
  const buildConnectorPath = (x1: number, y1: number, x2: number, y2: number) => {
    const xmid = x1 + (x2 - x1) / 2
    const r = Math.min(8, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 4)

    if (Math.abs(y1 - y2) < 2) {
      return `M ${x1} ${y1} L ${x2} ${y2}`
    }

    if (y2 > y1) {
      // Downwards turn
      return `M ${x1} ${y1} L ${xmid - r} ${y1} Q ${xmid} ${y1} ${xmid} ${y1 + r} L ${xmid} ${y2 - r} Q ${xmid} ${y2} ${xmid + r} ${y2} L ${x2} ${y2}`
    } else {
      // Upwards turn
      return `M ${x1} ${y1} L ${xmid - r} ${y1} Q ${xmid} ${y1} ${xmid} ${y1 - r} L ${xmid} ${y2 + r} Q ${xmid} ${y2} ${xmid + r} ${y2} L ${x2} ${y2}`
    }
  }

  return (
    <div
      className={clsx(
        'w-full overflow-x-auto overflow-y-auto relative rounded border border-border bg-[#0B0D12]',
        isProjector ? 'p-4 sm:p-6' : 'p-3 sm:p-5',
        className
      )}
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#262933 #0B0D12',
      }}
    >
      <div
        className="relative"
        style={{
          width: treeData.canvasWidth,
          height: treeData.canvasHeight,
          minHeight: '520px',
        }}
      >
        {/* SVG Connector Layer */}
        <svg
          className="absolute inset-0 pointer-events-none z-10"
          width={treeData.canvasWidth}
          height={treeData.canvasHeight}
        >
          <defs>
            <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#F5A524" floodOpacity="0.5" />
            </filter>
            <filter id="blueGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#3B82F6" floodOpacity="0.5" />
            </filter>
          </defs>

          {treeData.connectors.map((conn) => {
            const pathData = buildConnectorPath(conn.startX, conn.startY, conn.endX, conn.endY)

            const strokeColor = conn.isAdvancing
              ? '#F5A524' // Confirmed advancing winner (Gold)
              : conn.isLive
              ? '#3B82F6' // Live active duel path (Cyan Blue)
              : 'rgba(255, 255, 255, 0.16)' // Pending / Future path

            const strokeWidth = conn.isAdvancing ? 2.5 : conn.isLive ? 2 : 1.5
            const filter = conn.isAdvancing ? 'url(#goldGlow)' : conn.isLive ? 'url(#blueGlow)' : undefined
            const strokeDasharray = !conn.isAdvancing && !conn.isLive ? '4 3' : undefined

            return (
              <g key={conn.id}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={filter}
                />
                {/* Node Junction Dots */}
                <circle cx={conn.startX} cy={conn.startY} r={conn.isAdvancing ? 3.5 : 2.5} fill={strokeColor} />
                <circle cx={conn.endX} cy={conn.endY} r={conn.isAdvancing ? 3.5 : 2.5} fill={strokeColor} />
              </g>
            )
          })}
        </svg>

        {/* Stage Columns & Cards */}
        {treeData.stages.map((stage) => {
          return (
            <React.Fragment key={stage.id}>
              {/* Stage Header */}
              <div
                className={clsx(
                  'absolute p-2.5 rounded border text-left z-20 flex items-center justify-between',
                  stage.isCurrent
                    ? 'bg-bg-card border-accent-gold/40 shadow-sm shadow-amber-500/5'
                    : stage.status === 'completed'
                    ? 'bg-bg-surface border-border'
                    : 'bg-bg-surface/50 border-border/50 opacity-70'
                )}
                style={{
                  left: stage.x,
                  top: 16,
                  width: stage.width,
                  height: 48,
                }}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-accent-gold/20 text-accent-gold font-bold">
                      PHASE {stage.phaseNumber}
                    </span>
                    <h3 className="text-xs font-bold font-mono text-text-primary tracking-wider uppercase truncate max-w-[170px]">
                      {stage.title}
                    </h3>
                  </div>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">
                    {stage.stageType === 'group_stage'
                      ? 'Standings & Round-Robin'
                      : stage.stageType === 'qualifiers'
                      ? 'Playoff Advancers'
                      : `${stage.matches?.length || 0} Knockout Matches`}
                  </p>
                </div>
                <Badge variant={stage.status === 'completed' ? 'green' : stage.isCurrent ? 'gold' : 'gray'}>
                  {stage.status === 'completed' ? 'Done' : stage.isCurrent ? 'Live' : 'Pending'}
                </Badge>
              </div>

              {/* 1. Group Stage Cards */}
              {stage.stageType === 'group_stage' &&
                stage.groups?.map((group) => (
                  <div
                    key={group.id}
                    className="absolute z-20"
                    style={{
                      left: group.x,
                      top: group.y - group.height / 2,
                      width: group.width,
                      height: group.height,
                    }}
                  >
                    <GroupStageCard group={group} isProjector={isProjector} />
                  </div>
                ))}

              {/* 2. Qualifiers Cards */}
              {stage.stageType === 'qualifiers' &&
                stage.qualifiers?.map((qualifier) => (
                  <div
                    key={qualifier.id}
                    className="absolute z-20"
                    style={{
                      left: qualifier.x,
                      top: qualifier.y - qualifier.height / 2,
                      width: qualifier.width,
                      height: qualifier.height,
                    }}
                  >
                    <QualifierNodeCard qualifier={qualifier} />
                  </div>
                ))}

              {/* 3. Knockout Match Cards */}
              {stage.matches &&
                stage.matches.map((match) => (
                  <div
                    key={match.id}
                    className="absolute z-20"
                    style={{
                      left: match.x,
                      top: match.y - match.height / 2,
                      width: match.width,
                      height: match.height,
                    }}
                  >
                    <KnockoutMatchCard
                      match={match}
                      onSelectMatch={onSelectMatch}
                      isProjector={isProjector}
                    />
                  </div>
                ))}
            </React.Fragment>
          )
        })}

        {/* Champion Pod Column */}
        {treeData.champion && (
          <React.Fragment>
            {/* Champion Header */}
            <div
              className="absolute p-2.5 rounded border border-accent-gold/40 bg-accent-gold/10 text-left z-20 flex items-center justify-between"
              style={{
                left: treeData.champion.x,
                top: 16,
                width: treeData.champion.width,
                height: 48,
              }}
            >
              <div>
                <h3 className="text-xs font-bold font-mono text-accent-gold tracking-wider uppercase flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 shrink-0" />
                  Championship
                </h3>
                <p className="text-[10px] text-text-muted font-mono mt-0.5">Grand Arena Victor</p>
              </div>
              <Badge variant="gold">Winner</Badge>
            </div>

            {/* Champion Box */}
            <div
              className="absolute z-20"
              style={{
                left: treeData.champion.x,
                top: treeData.champion.y - treeData.champion.height / 2,
                width: treeData.champion.width,
                height: treeData.champion.height,
              }}
            >
              <ChampionNodeCard champion={treeData.champion} isProjector={isProjector} />
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  )
}

/**
 * Visual Group Stage Card for the competition tree.
 * Renders:
 * 1. Group Standings Leaderboard with rank numbers, points, W-L record, and qualifier indicator.
 * 2. Group Round-Robin Matches with real-time completed match winners (✓) and results.
 */
function GroupStageCard({ group, isProjector }: { group: TreeGroupNode; isProjector: boolean }) {
  return (
    <Card padding="none" className="w-full h-full border-border bg-bg-surface overflow-hidden flex flex-col justify-between">
      {/* Group Card Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-gold" />
          <h4 className="text-xs font-bold font-mono text-text-primary uppercase tracking-wide">
            {group.name}
          </h4>
        </div>
        <span className="text-[10px] font-mono text-text-muted">{group.robotCount} Combatants</span>
      </div>

      {/* 1. Standings Leaderboard Table */}
      <div className="p-2 flex flex-col gap-1 font-mono text-xs border-b border-border/60">
        <div className="flex items-center justify-between px-2 text-[9px] text-text-muted uppercase font-bold tracking-wider">
          <span>Rank & Combatant</span>
          <span>Record · Pts</span>
        </div>
        {group.standings.map((s) => {
          return (
            <div
              key={s.robot.id}
              className={clsx(
                'flex items-center justify-between px-2 py-1 rounded transition-colors relative',
                s.isAdvancing
                  ? 'bg-accent-gold/[0.08] border border-accent-gold/30 text-text-primary font-bold'
                  : 'bg-bg-card/40 border border-border/40 text-text-secondary opacity-70'
              )}
            >
              {/* Left: Rank & Name */}
              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                <span
                  className={clsx(
                    'w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0',
                    s.rank === 1
                      ? 'bg-accent-gold text-black'
                      : s.isAdvancing
                      ? 'bg-accent-gold/20 text-accent-gold'
                      : 'bg-bg-surface text-text-muted'
                  )}
                >
                  {s.rank}
                </span>
                <span className="text-xs truncate text-text-primary" title={s.robot.name}>
                  {s.robot.name}
                </span>
              </div>

              {/* Right: Record & Cutoff Anchor */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-text-muted tabular-nums">
                  {s.wins}W-{s.losses}L · <strong className="text-accent-gold">{s.points}p</strong>
                </span>

                {s.isAdvancing ? (
                  <span className="text-[8px] uppercase tracking-wider font-bold px-1 py-0.2 rounded bg-accent-gold/20 text-accent-gold border border-accent-gold/40">
                    Qualify
                  </span>
                ) : (
                  <span className="text-[8px] text-text-muted opacity-40 uppercase">Cut</span>
                )}

                {/* Visual Anchor Dot on advancing row */}
                {s.isAdvancing && (
                  <div
                    className="w-2 h-2 rounded-full bg-accent-gold border border-black shrink-0 shadow-sm"
                    title={`Qualifier Out: ${s.robot.name}`}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 2. Group Round-Robin Matches & Results List */}
      <div className="p-2 flex-1 flex flex-col justify-between overflow-y-auto font-mono text-[11px] bg-bg-surface/60">
        <span className="text-[9px] uppercase font-bold text-text-muted px-1 mb-1 block">
          Group Pairings & Match Results ({group.groupMatches.length})
        </span>

        <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1">
          {group.groupMatches.map((m) => {
            const isDone = m.status === 'recorded' || m.status === 'locked'
            const isWinner1 = isDone && m.winnerName === m.robot1Name
            const isWinner2 = isDone && m.winnerName === m.robot2Name

            return (
              <div
                key={m.id}
                className={clsx(
                  'flex items-center justify-between px-2 py-0.5 rounded text-[10px] border',
                  m.isLive
                    ? 'bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan'
                    : isDone
                    ? 'bg-bg-card/60 border-border/50 text-text-secondary'
                    : 'bg-bg-card/20 border-border/30 text-text-muted opacity-60'
                )}
              >
                <span className="text-[9px] text-text-muted shrink-0 w-6">
                  M{String(m.matchNumber).padStart(2, '0')}
                </span>

                <div className="flex items-center gap-1 min-w-0 flex-1 justify-center truncate px-1">
                  <span
                    className={clsx(
                      'truncate max-w-[80px]',
                      isWinner1 ? 'text-accent-gold font-bold' : ''
                    )}
                  >
                    {m.robot1Name} {isWinner1 && '✓'}
                  </span>
                  <span className="text-text-muted text-[8px]">vs</span>
                  <span
                    className={clsx(
                      'truncate max-w-[80px]',
                      isWinner2 ? 'text-accent-gold font-bold' : ''
                    )}
                  >
                    {m.robot2Name} {isWinner2 && '✓'}
                  </span>
                </div>

                <div className="shrink-0 text-[8px]">
                  {m.isLive ? (
                    <span className="text-accent-cyan font-bold">LIVE</span>
                  ) : isDone ? (
                    <span className="text-emerald-400 font-semibold">FINAL</span>
                  ) : (
                    <span className="text-text-muted">SCHED</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

/**
 * Qualifier Card rendered in Phase 2 bridging Group Stage to Knockout Playoff rounds.
 */
function QualifierNodeCard({ qualifier }: { qualifier: TreeQualifierNode }) {
  return (
    <div className="w-full h-full p-2 rounded border border-accent-gold/30 bg-accent-gold/[0.06] flex items-center justify-between font-mono relative shadow-sm">
      <div className="flex items-center gap-2 min-w-0 pr-1">
        <span className="w-6 h-6 rounded bg-accent-gold text-black flex items-center justify-center text-[10px] font-black shrink-0">
          {qualifier.seedLabel}
        </span>
        <div className="min-w-0">
          <h5 className="text-xs font-bold text-text-primary truncate" title={qualifier.robot.name}>
            {qualifier.robot.name}
          </h5>
          <p className="text-[9px] text-accent-gold truncate">
            {qualifier.groupName} · {qualifier.rank === 1 ? '1st Place' : `${qualifier.rank}nd Place`} ({qualifier.points}p)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <ShieldCheck className="w-4 h-4 text-accent-gold shrink-0" />
        <div
          className="w-2.5 h-2.5 rounded-full bg-accent-gold border border-black shrink-0 shadow-sm"
          title={`Advancing to Knockout: ${qualifier.robot.name}`}
        />
      </div>
    </div>
  )
}

/**
 * Visual Knockout Match Node Card for the tree.
 * Renders combatant slots, winner checkmarks, active LIVE badge, and connection ports.
 * COMPLETED ROUND MATCHES REMAIN VISIBLE WITH RESULTS PERMANENTLY PRESERVED.
 */
function KnockoutMatchCard({
  match,
  onSelectMatch,
  isProjector,
}: {
  match: TreeMatchNode
  onSelectMatch?: (matchId: string) => void
  isProjector: boolean
}) {
  const isRecorded = match.status === 'recorded' || match.status === 'locked'
  const isClickable = Boolean(onSelectMatch && !isProjector && match.status !== 'locked')

  return (
    <div
      onClick={() => isClickable && onSelectMatch && onSelectMatch(match.id)}
      className={clsx(
        'w-full h-full rounded border font-mono text-xs transition-all relative flex flex-col justify-between overflow-hidden',
        match.isLive
          ? 'bg-bg-card border-accent-cyan ring-1 ring-accent-cyan/50 shadow-md shadow-blue-500/10'
          : isRecorded
          ? 'bg-bg-card border-border shadow-sm'
          : 'bg-bg-surface/80 border-border/60',
        isClickable ? 'cursor-pointer hover:border-accent-cyan/60' : 'cursor-default'
      )}
    >
      {/* Match Header Bar */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-border/60 text-[10px] text-text-muted bg-bg-surface/50 shrink-0">
        <span className="font-semibold text-text-secondary">
          Match {String(match.matchNumber).padStart(2, '0')}
        </span>

        {match.isLive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent-cyan">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-ping" />
            LIVE
          </span>
        ) : isRecorded ? (
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            FINAL
          </span>
        ) : (
          <span className="text-text-muted opacity-70">SCHEDULED</span>
        )}
      </div>

      {/* Match Combatant Slots */}
      <div className="p-1.5 flex-1 flex flex-col justify-around gap-1 relative">
        {/* Slot 1: Top Participant */}
        <div
          className={clsx(
            'flex items-center justify-between px-2 py-1 rounded transition-colors relative',
            match.topSlot.participant?.isWinner
              ? 'bg-accent-gold/15 text-accent-gold font-bold border border-accent-gold/40'
              : match.topSlot.participant?.isLoser
              ? 'text-text-muted opacity-55'
              : 'text-text-primary'
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <span className="w-2.5 text-center text-[10px] text-accent-gold shrink-0">
              {match.topSlot.participant?.isWinner ? '▶' : ''}
            </span>
            <span className="truncate" title={match.topSlot.participant?.name || 'TBD'}>
              {match.topSlot.participant?.name || (
                <span className="italic text-text-muted">{match.topSlot.placeholderText || 'TBD'}</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-[10px]">
            {match.topSlot.participant?.club && (
              <span className="text-text-muted truncate max-w-[65px]">
                {match.topSlot.participant.club}
              </span>
            )}
            {match.topSlot.participant?.isWinner && (
              <Check className="w-3.5 h-3.5 text-accent-gold shrink-0 stroke-[3]" />
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/30" />

        {/* Slot 2: Bottom Participant */}
        <div
          className={clsx(
            'flex items-center justify-between px-2 py-1 rounded transition-colors relative',
            match.bottomSlot.participant?.isWinner
              ? 'bg-accent-gold/15 text-accent-gold font-bold border border-accent-gold/40'
              : match.bottomSlot.participant?.isLoser
              ? 'text-text-muted opacity-55'
              : 'text-text-primary'
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <span className="w-2.5 text-center text-[10px] text-accent-gold shrink-0">
              {match.bottomSlot.participant?.isWinner ? '▶' : ''}
            </span>
            <span className="truncate" title={match.bottomSlot.participant?.name || 'TBD'}>
              {match.bottomSlot.participant?.name || (
                <span className="italic text-text-muted">
                  {match.isBye ? 'BYE (Auto-Advance)' : match.bottomSlot.placeholderText || 'TBD'}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-[10px]">
            {match.bottomSlot.participant?.club && (
              <span className="text-text-muted truncate max-w-[65px]">
                {match.bottomSlot.participant.club}
              </span>
            )}
            {match.bottomSlot.participant?.isWinner && (
              <Check className="w-3.5 h-3.5 text-accent-gold shrink-0 stroke-[3]" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Champion Pod Node Card rendered at the culmination of the tournament tree.
 */
function ChampionNodeCard({
  champion,
  isProjector,
}: {
  champion: TournamentTreeData['champion']
  isProjector: boolean
}) {
  if (!champion) return null
  const isCrowned = champion.robot.id !== 'tbd'

  return (
    <div
      className={clsx(
        'w-full h-full p-4 rounded border flex flex-col items-center justify-center text-center font-mono relative transition-all',
        isCrowned
          ? 'bg-gradient-to-b from-accent-gold/15 to-bg-card border-accent-gold shadow-lg shadow-amber-500/10'
          : 'bg-bg-surface/50 border-accent-gold/30 border-dashed text-text-muted'
      )}
    >
      <div
        className={clsx(
          'w-10 h-10 rounded-full border flex items-center justify-center mb-2',
          isCrowned
            ? 'border-accent-gold bg-accent-gold/20 text-accent-gold'
            : 'border-border bg-bg-surface text-text-muted'
        )}
      >
        <Trophy className="w-5 h-5" />
      </div>

      <span className="text-[10px] uppercase font-bold tracking-widest text-accent-gold mb-0.5">
        {isCrowned ? 'Official Champion' : 'Pending Champion'}
      </span>

      <h4
        className={clsx(
          'text-base sm:text-lg font-bold tracking-tight mb-1 truncate max-w-[240px]',
          isCrowned ? 'text-white' : 'text-text-muted'
        )}
      >
        {champion.robot.name}
      </h4>

      <p className="text-[11px] text-text-secondary truncate max-w-[240px]">
        {champion.robot.club}
        {champion.robot.institution && ` (${champion.robot.institution})`}
      </p>

      {isCrowned && (
        <div className="pt-2 mt-2 border-t border-border/50 w-full flex items-center justify-between text-[10px] text-text-muted">
          <span>Final Record</span>
          <span className="font-bold text-accent-gold">{champion.wins} Won</span>
        </div>
      )}
    </div>
  )
}

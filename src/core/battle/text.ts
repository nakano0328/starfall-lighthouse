import type { RewardOutcome } from './rewards';
import type { BattleEvent, BattleStatus } from './types';
import { STATUS_NAMES } from './types';

/**
 * Turns engine events into the Japanese lines the battle scene shows one at a
 * time in its message window (DQ style, with a space between particles).
 * Pure: the scene supplies the names so this module never touches Phaser.
 */
export interface BattleTextContext {
  /** Display name of a battler key (p0.. / e0..). */
  name(key: string): string;
  /** True for enemy keys (e*), false for party keys (p*). */
  isEnemy(key: string): boolean;
}

/** Name lookups for the result screen (§5.10). */
export interface ResultNames {
  member(index: number): string;
  item(id: string): string;
  skill(id: string): string;
}

/** `{n}` in a template is the battler's display name. */
const NAME_PLACEHOLDER = '{n}';

/** Per-status line on application; `charging` has its own engine message, so it is silent. */
const STATUS_APPLIED_LINES: Record<BattleStatus, string> = {
  poison: '{n}は 毒に おかされた！',
  paralyze: '{n}は しびれて うごけなくなった！',
  blind: '{n}は 暗闇に つつまれた！',
  def_down: '{n}の 防御が さがった！',
  atk_up: '{n}の 攻撃が あがった！',
  taunt: '{n}は 敵の 注意を ひきつけた！',
  harden: '{n}の 体が 黒く かたまった！',
  cracked: '{n}の 体に ひびが はいった！',
  water_veil: '{n}は 水の とばりに つつまれた！',
  charging: '',
};

/** Per-status line on natural expiry; `charging` is consumed by the payoff, so it is silent. */
const STATUS_EXPIRED_LINES: Record<BattleStatus, string> = {
  poison: '{n}の 毒が きえた。',
  paralyze: '{n}の しびれが とれた。',
  blind: '{n}の 目が 見えるようになった。',
  def_down: '{n}の 防御が もとに もどった。',
  atk_up: '{n}の 攻撃が もとに もどった。',
  taunt: '{n}の ちょうはつが きれた。',
  harden: '{n}の 硬化が とけた。',
  cracked: '{n}の ひびが ふさがった。',
  water_veil: '{n}の 水の とばりが きえた。',
  charging: '',
};

/** Fills `{n}`; an empty template yields no line at all. */
function fill(template: string, name: string): string[] {
  if (template === '') return [];
  // A replacer function keeps `$` sequences in names from being interpreted.
  return [template.replace(NAME_PLACEHOLDER, () => name)];
}

/** Lines for one event, in display order. Empty when the event needs no text. */
export function battleEventLines(event: BattleEvent, ctx: BattleTextContext): string[] {
  switch (event.type) {
    case 'round_start':
      return [];
    case 'message':
      return [event.text];
    case 'action': {
      // The engine emits its own flavour message for a charge step.
      if (event.skillId === 'charge') return [];
      const n = ctx.name(event.actor);
      if (event.skillId !== undefined) return [`${n}の ${event.label}！`];
      if (event.itemId !== undefined) return [`${n}は ${event.label}を つかった！`];
      return [`${n}の こうげき！`];
    }
    case 'damage': {
      const n = ctx.name(event.target);
      if (event.immune) return [`カキン！ ${n}には きかない！`];
      const lines: string[] = [];
      if (event.crit) lines.push('かいしんの いちげき！');
      if (event.weak) lines.push('こうかは ばつぐんだ！');
      lines.push(`${n}に ${event.amount} のダメージ！`);
      return lines;
    }
    case 'heal':
      return [`${ctx.name(event.target)}の HP が ${event.amount} かいふくした！`];
    case 'mp_heal':
      return [`${ctx.name(event.target)}の MP が ${event.amount} かいふくした！`];
    case 'mp_drain':
      return [`${ctx.name(event.target)}の MP が ${event.amount} うばわれた！`];
    case 'miss':
      return [`ミス！ ${ctx.name(event.target)}には あたらない！`];
    case 'no_mp':
      return [`しかし ${ctx.name(event.actor)}の MP が たりない！`];
    case 'status_applied':
      return fill(STATUS_APPLIED_LINES[event.status], ctx.name(event.target));
    case 'status_resisted':
      return [`${ctx.name(event.target)}には きかなかった！`];
    case 'status_expired':
      return fill(STATUS_EXPIRED_LINES[event.status], ctx.name(event.target));
    case 'status_cured':
      return [`${ctx.name(event.target)}の ${STATUS_NAMES[event.status]}が なおった！`];
    case 'revive':
      return [`${ctx.name(event.target)}は たちあがった！`];
    case 'ko': {
      const n = ctx.name(event.target);
      return ctx.isEnemy(event.target) ? [`${n}を たおした！`] : [`${n}は たおれてしまった！`];
    }
    case 'guard':
      return [`${ctx.name(event.actor)}は 身を まもっている。`];
    case 'paralyzed':
      return [`${ctx.name(event.actor)}は しびれて うごけない！`];
    case 'charge':
      // Progress is narrated by the engine's own `message` event.
      return [];
    case 'charge_broken':
      return [`${ctx.name(event.actor)}の 充填が 中断された！`];
    case 'escape':
      // The engine follows this with a `message` carrying the result text.
      return [];
    case 'phase_change':
      return [`${ctx.name(event.actor)}の 仮面が われた！`];
    case 'victory':
      return ['敵を すべて たおした！'];
    case 'defeat':
      return ['パーティは 全滅した……'];
  }
}

/** Lines for the result screen after a victory (§5.10). */
export function resultLines(outcome: RewardOutcome, names: ResultNames): string[] {
  const lines: string[] = [];
  const { exp, gold, drops } = outcome.rewards;
  if (exp > 0) lines.push(`${exp} の経験値を 手に入れた！`);
  if (gold > 0) lines.push(`${gold}G を 手に入れた！`);
  for (const drop of drops) {
    const item = names.item(drop.itemId);
    lines.push(drop.qty > 1 ? `${item}を ${drop.qty}こ 手に入れた！` : `${item}を 手に入れた！`);
  }
  for (const up of outcome.levelUps) {
    const g = up.gains;
    lines.push(`${names.member(up.memberIndex)}は レベル ${up.to} に あがった！`);
    lines.push(
      `最大HP +${g.hp}  最大MP +${g.mp}  攻撃 +${g.atk}  防御 +${g.def}  素早さ +${g.spd}  運 +${g.luk}`,
    );
    for (const skillId of up.newSkills) lines.push(`${names.skill(skillId)}を おぼえた！`);
  }
  return lines;
}

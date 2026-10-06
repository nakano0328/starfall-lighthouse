import type { Element, ItemDef, SkillDef, StatusEffectApply, StatusKey } from '@data/types';

import type { AiContext, AiDecision } from './ai';
import { chooseAction } from './ai';
import type { AttackSpec, DamageResult } from './damage';
import {
  BASIC_ATTACK,
  attackSpecFromSkill,
  computeDamage,
  computeHeal,
  computeItemDamage,
  escapeChance,
  hitChance,
} from './damage';
import { chance, pick, rand } from './rng';
import type { Rng } from './rng';
import {
  clearAllStatuses,
  clearStatus,
  hasStatus,
  setStatus,
  tickStatuses,
  tryApplyStatus,
} from './status';
import type {
  BattleEvent,
  BattleOptions,
  BattleStatus,
  Battler,
  Command,
  Outcome,
  RoundInput,
} from './types';
import { STATUS_TURNS } from './types';

/** Light damage taken while charging that breaks ノクス's 充填 (§8.4). */
export const CHARGE_BREAK_LIGHT_DAMAGE = 250;
/** Turns of 防御ダウン inflicted when a charge is broken (§8.4). */
export const CHARGE_BREAK_DEF_DOWN_TURNS = 2;
/** Statuses an item with `cure: 'all'` removes (攻撃アップ is not an ailment). */
export const CURABLE_AILMENTS: readonly StatusKey[] = ['poison', 'paralyze', 'blind', 'def_down'];
const PRIORITY_BONUS = 1000;
const SECOND_ACT_PENALTY = 500;

interface Action {
  actor: Battler;
  initiative: number;
  command: Command;
  /** Enemy decisions carry the AI rule's chosen targets / message. */
  ai?: AiDecision;
}

/**
 * Round-based resolver for one battle (docs/GAME_DESIGN.md §5). Pure: the scene
 * feeds `RoundInput`, receives `BattleEvent[]` to animate, and reads `outcome`.
 *
 * Enemy pseudo-actions from the AI tables (§8.4): `double_act` flips the
 * two-actions-per-round flag without spending the action; `charge` spends it and
 * advances the charge counter. A skill that applies the `charging` status
 * (番人の予兆) also counts one step. Any other action by a charging enemy resets
 * the counter, which is how `charge:n` payoffs consume it.
 */
export class BattleEngine {
  readonly party: Battler[];
  readonly enemies: Battler[];
  readonly group: BattleOptions['group'];
  round = 0;
  outcome: Outcome = 'ongoing';
  escapeFailures = 0;
  private preemptive: boolean;
  private readonly rng: Rng;
  private readonly data: BattleOptions['data'];
  private readonly inventory: BattleOptions['inventory'];
  private events: BattleEvent[] = [];

  constructor(options: BattleOptions) {
    this.party = options.party;
    this.enemies = options.enemies;
    this.group = options.group;
    this.rng = options.rng;
    this.data = options.data;
    this.inventory = options.inventory;
    this.preemptive = options.preemptive ?? false;
  }

  get all(): Battler[] {
    return [...this.party, ...this.enemies];
  }

  find(key: string): Battler | undefined {
    return this.all.find((b) => b.key === key);
  }

  get canEscape(): boolean {
    return this.group.canEscape;
  }

  /** True until the enemies have had their first (skipped) round. */
  get isPreemptive(): boolean {
    return this.preemptive;
  }

  /** Party members that must enter a command this round (alive and not paralysed). */
  get commandableParty(): Battler[] {
    return this.party.filter((p) => !p.ko && !hasStatus(p, 'paralyze'));
  }

  /** Skills the member can pick (learned; MP shortage is the UI's grey-out). */
  skillsOf(b: Battler): SkillDef[] {
    return b.skills.map((id) => this.data.skill(id));
  }

  /** Battle-usable items currently held. */
  battleItems(): { item: ItemDef; qty: number }[] {
    const usable: { item: ItemDef; qty: number }[] = [];
    for (const e of this.inventory.entries()) {
      const item = this.data.item(e.itemId);
      if (item?.usableInBattle) usable.push({ item, qty: e.qty });
    }
    return usable;
  }

  // ---------------------------------------------------------------------
  // Round resolution
  // ---------------------------------------------------------------------

  resolveRound(input: RoundInput): BattleEvent[] {
    if (this.outcome !== 'ongoing') return [];
    this.events = [];
    this.round += 1;
    this.emit({ type: 'round_start', round: this.round });
    for (const b of this.all) b.guarding = false;

    if (input.kind === 'escape') {
      this.resolveEscape();
      if (this.outcome === 'ongoing') {
        if (this.consumePreemptive()) this.runActions(this.collectEnemyActions());
        this.endRound();
      }
      return this.events;
    }

    const actions = this.collectPartyActions(input.commands);
    if (this.consumePreemptive()) actions.push(...this.collectEnemyActions());
    this.runActions(actions);
    this.endRound();
    return this.events;
  }

  /** Returns whether enemies act this round; announces the skipped round once. */
  private consumePreemptive(): boolean {
    if (!this.preemptive) return true;
    this.preemptive = false;
    this.emit({ type: 'message', text: '先制攻撃！ 敵は動けない。' });
    return false;
  }

  private resolveEscape(): void {
    const chanceValue = escapeChance(this.party, this.enemies, this.escapeFailures);
    const success = this.canEscape && chance(this.rng, chanceValue / 100);
    this.emit({ type: 'escape', success, chance: chanceValue });
    if (success) {
      this.emit({ type: 'message', text: 'うまく逃げ切れた！' });
      this.outcome = 'escaped';
      this.finish();
    } else {
      this.escapeFailures += 1;
      this.emit({ type: 'message', text: 'しかし回り込まれてしまった！' });
    }
  }

  private collectPartyActions(commands: Record<string, Command>): Action[] {
    const actions: Action[] = [];
    for (const p of this.party) {
      if (p.ko) continue;
      const paralysed = hasStatus(p, 'paralyze');
      const command: Command = paralysed
        ? { type: 'guard' }
        : (commands[p.key] ?? { type: 'guard' });
      let initiative = this.initiative(p);
      if (!paralysed && this.isPriorityCommand(command)) initiative += PRIORITY_BONUS;
      actions.push({ actor: p, initiative, command });
    }
    return actions;
  }

  private collectEnemyActions(): Action[] {
    const actions: Action[] = [];
    const ctx: AiContext = { round: this.round, party: this.party, enemies: this.enemies };
    for (const e of this.enemies) {
      if (e.ko) continue;
      const first = this.decideEnemy(e, ctx);
      if (first) actions.push(first);
      if (e.extraActs > 0) {
        const second = this.decideEnemy(e, ctx);
        if (second) actions.push({ ...second, initiative: second.initiative - SECOND_ACT_PENALTY });
      }
    }
    return actions;
  }

  private decideEnemy(e: Battler, ctx: AiContext): Action | null {
    let decision = chooseAction(e, ctx, this.rng);
    if (decision?.action === 'double_act') {
      e.extraActs = 1;
      this.emit({
        type: 'message',
        text: decision.rule.message ?? `${e.name}の動きが速くなった！`,
      });
      decision = chooseAction(e, ctx, this.rng);
    }
    if (!decision) return null;
    const first = decision.targetKeys[0];
    let command: Command;
    switch (decision.action) {
      case 'attack':
        command = { type: 'attack', target: first ?? '' };
        break;
      case 'guard':
        command = { type: 'guard' };
        break;
      default:
        command =
          first === undefined
            ? { type: 'skill', skillId: decision.action }
            : { type: 'skill', skillId: decision.action, target: first };
    }
    let initiative = this.initiative(e);
    if (this.isPriorityCommand(command)) initiative += PRIORITY_BONUS;
    return { actor: e, initiative, command, ai: decision };
  }

  private isPriorityCommand(command: Command): boolean {
    if (command.type === 'item' || command.type === 'guard') return true;
    if (command.type === 'skill') {
      if (command.skillId === 'charge' || command.skillId === 'double_act') return false;
      return this.data.skill(command.skillId).priority === true;
    }
    return false;
  }

  /** initiative = SPD × rand(0.85, 1.15) (§5.2). */
  private initiative(b: Battler): number {
    return b.stats.spd * rand(this.rng, 0.85, 1.15);
  }

  private runActions(actions: Action[]): void {
    actions.sort((a, b) => b.initiative - a.initiative);
    for (const action of actions) {
      if (this.outcome !== 'ongoing') return;
      const actor = action.actor;
      if (actor.ko) continue;
      if (hasStatus(actor, 'paralyze')) {
        this.emit({ type: 'paralyzed', actor: actor.key });
      } else {
        this.perform(action);
      }
      this.tickActor(actor);
      this.checkOutcome();
    }
  }

  private endRound(): void {
    if (this.outcome !== 'ongoing') return;
    for (const b of this.all) b.guarding = false;
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  private perform(action: Action): void {
    const { actor, command } = action;
    const chargeBefore = actor.charge;
    if (this.chargeWasBroken(action)) {
      this.emit({ type: 'message', text: `${actor.name}はひるんで動けない！` });
      return;
    }
    switch (command.type) {
      case 'guard':
        actor.guarding = true;
        this.emit({ type: 'guard', actor: actor.key });
        break;
      case 'attack':
        this.performAttack(actor, command.target);
        break;
      case 'skill':
        this.performSkill(actor, command.skillId, command.target, action.ai);
        break;
      case 'item':
        this.performItem(actor, command.itemId, command.target);
        break;
    }
    // A charging enemy that did something other than charge has unleashed the payoff.
    if (actor.side === 'enemy' && chargeBefore > 0 && actor.charge === chargeBefore) {
      actor.charge = 0;
      actor.lightDamageWhileCharging = 0;
    }
  }

  /** A `charge:n` decision made at round start is void once the charge was interrupted. */
  private chargeWasBroken(action: Action): boolean {
    const cond = action.ai?.rule.cond;
    return cond?.type === 'charge' && cond.n > 0 && action.actor.charge !== cond.n;
  }

  private performAttack(actor: Battler, targetKey: string): void {
    const target = this.retargetEnemyOf(actor, targetKey);
    if (!target) return;
    this.emit({ type: 'action', actor: actor.key, label: 'こうげき' });
    this.strike(actor, target, { ...BASIC_ATTACK, element: actor.weaponElement });
  }

  private performSkill(
    actor: Battler,
    skillId: string,
    targetKey: string | undefined,
    ai: AiDecision | undefined,
  ): void {
    if (skillId === 'charge') {
      this.chargeStep(actor, ai?.rule.message);
      return;
    }
    const skill = this.data.skill(skillId);
    if (actor.mp < skill.mpCost) {
      this.emit({ type: 'no_mp', actor: actor.key });
      return;
    }
    const targets = this.skillTargets(actor, skill, targetKey, ai);
    if (targets.length === 0 && skill.scope !== 'none') return;
    actor.mp -= skill.mpCost;
    this.emit({ type: 'action', actor: actor.key, label: skill.name, skillId: skill.id });
    if (ai?.rule.message) this.emit({ type: 'message', text: ai.rule.message });

    switch (skill.kind) {
      case 'physical':
      case 'magic':
        this.performDamageSkill(actor, skill, targets);
        return;
      case 'heal':
        for (const target of targets) {
          if (target.ko) continue;
          const amount = this.healBattler(target, this.healAmount(actor, skill));
          this.emit({ type: 'heal', target: target.key, amount });
          this.cure(target, skill.cures ?? []);
        }
        return;
      case 'buff':
      case 'debuff':
      case 'special':
        for (const target of targets) {
          if (!target.ko) this.cure(target, skill.cures ?? []);
        }
        this.applyStatuses(actor, targets, skill.statuses ?? []);
        return;
    }
  }

  /** Boss self-heals are flat (§8.3 "HP 固定回復"); others roll ±5% (§5.3). */
  private healAmount(actor: Battler, skill: SkillDef): number {
    if (skill.scope === 'self') return Math.max(0, skill.add + actor.level * (skill.lvMult ?? 0));
    return computeHeal(actor, skill, this.rng);
  }

  private performDamageSkill(actor: Battler, skill: SkillDef, targets: Battler[]): void {
    const spec = attackSpecFromSkill(skill, actor.weaponElement);
    const hits = skill.hits ?? 1;
    if (skill.scope === 'enemy_random') {
      for (let i = 0; i < hits; i += 1) {
        const target = this.retargetEnemyOf(actor, undefined);
        if (!target) break;
        this.strike(actor, target, spec, skill);
      }
    } else {
      for (const target of targets) {
        for (let i = 0; i < hits && !target.ko; i += 1) {
          this.strike(actor, target, spec, skill);
        }
      }
    }
    if (skill.mpDrain) {
      for (const target of targets) {
        if (target.ko) continue;
        const drained = Math.min(target.mp, skill.mpDrain);
        target.mp -= drained;
        this.emit({ type: 'mp_drain', target: target.key, amount: drained });
      }
    }
  }

  private chargeStep(actor: Battler, message: string | undefined): void {
    actor.charge += 1;
    if (actor.charge === 1) actor.lightDamageWhileCharging = 0;
    this.emit({ type: 'action', actor: actor.key, label: '充填', skillId: 'charge' });
    this.emit({ type: 'charge', actor: actor.key, step: actor.charge });
    this.emit({ type: 'message', text: message ?? `${actor.name}は力をためている……` });
  }

  private performItem(actor: Battler, itemId: string, targetKey: string | undefined): void {
    const item = this.data.item(itemId);
    if (!item || !this.inventory.has(itemId)) return;
    const effect = item.effect;
    const targets = this.itemTargets(actor, item, targetKey);
    if (targets.length === 0) return;
    this.inventory.remove(itemId, 1);
    this.emit({ type: 'action', actor: actor.key, label: item.name, itemId: item.id });
    for (const target of targets) {
      switch (effect.type) {
        case 'heal_hp': {
          if (target.ko) break;
          const want = effect.amount === 'full' ? target.stats.hp : effect.amount;
          const amount = this.healBattler(target, want);
          this.emit({ type: 'heal', target: target.key, amount });
          break;
        }
        case 'heal_mp': {
          if (target.ko) break;
          const want = effect.amount === 'full' ? target.stats.mp : effect.amount;
          const amount = Math.min(want, target.stats.mp - target.mp);
          target.mp += amount;
          this.emit({ type: 'mp_heal', target: target.key, amount });
          break;
        }
        case 'cure':
          if (!target.ko) {
            this.cure(target, effect.statuses === 'all' ? CURABLE_AILMENTS : effect.statuses);
          }
          break;
        case 'revive': {
          if (!target.ko) break;
          target.ko = false;
          target.hp = Math.max(1, Math.floor(target.stats.hp * effect.hpRatio));
          this.emit({ type: 'revive', target: target.key });
          this.emit({ type: 'heal', target: target.key, amount: target.hp });
          break;
        }
        case 'damage': {
          if (target.ko) break;
          const result = computeItemDamage(target, effect.power, effect.element, this.rng);
          this.dealDamage(target, result);
          break;
        }
        case 'escape_dungeon':
        case 'none':
          break;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Damage / status helpers
  // ---------------------------------------------------------------------

  private strike(actor: Battler, target: Battler, spec: AttackSpec, skill?: SkillDef): void {
    if (spec.kind === 'physical') {
      const hit = hitChance(actor, target, spec.accuracy);
      if (!chance(this.rng, hit / 100)) {
        this.emit({ type: 'miss', target: target.key });
        return;
      }
    }
    const result = computeDamage(actor, target, spec, this.rng);
    this.dealDamage(target, result);
    if (!target.ko && skill) this.applyStatuses(actor, [target], skill.statuses ?? []);
  }

  /** Applies a computed hit: HP, KO, charge interruption, and the events for them. */
  private dealDamage(target: Battler, result: DamageResult): void {
    target.hp = Math.max(0, target.hp - result.amount);
    this.emit({ type: 'damage', target: target.key, ...result });
    if (target.hp === 0) {
      target.ko = true;
      this.emit({ type: 'ko', target: target.key });
      return;
    }
    this.trackChargeBreak(target, result.amount, result.element);
  }

  private trackChargeBreak(target: Battler, amount: number, element: Element): void {
    if (target.charge === 0 || element !== 'light') return;
    target.lightDamageWhileCharging += amount;
    if (target.lightDamageWhileCharging < CHARGE_BREAK_LIGHT_DAMAGE) return;
    target.charge = 0;
    target.lightDamageWhileCharging = 0;
    setStatus(target, 'def_down', CHARGE_BREAK_DEF_DOWN_TURNS);
    this.emit({ type: 'charge_broken', actor: target.key });
    this.emit({ type: 'status_applied', target: target.key, status: 'def_down' });
  }

  private healBattler(target: Battler, amount: number): number {
    const healed = Math.max(0, Math.min(amount, target.stats.hp - target.hp));
    target.hp += healed;
    return healed;
  }

  private cure(target: Battler, statuses: readonly StatusKey[]): void {
    for (const s of statuses) {
      if (clearStatus(target, s))
        this.emit({ type: 'status_cured', target: target.key, status: s });
    }
  }

  private applyStatuses(
    actor: Battler,
    targets: readonly Battler[],
    effects: readonly StatusEffectApply[],
  ): void {
    for (const effect of effects) {
      if (effect.status === 'charging') {
        this.chargeStep(actor, undefined);
        continue;
      }
      const receivers = effect.target === 'self' ? [actor] : targets;
      for (const target of receivers) {
        if (target.ko) continue;
        const status: BattleStatus = effect.status;
        const turns = effect.turns > 0 ? effect.turns : STATUS_TURNS[status];
        const result = tryApplyStatus(target, status, effect.chance, turns, this.rng);
        if (result === 'applied') {
          this.emit({ type: 'status_applied', target: target.key, status });
        } else if (result === 'immune') {
          this.emit({ type: 'status_resisted', target: target.key, status });
        }
      }
    }
  }

  private tickActor(actor: Battler): void {
    if (actor.ko) return;
    const tick = tickStatuses(actor);
    if (tick.poisonDamage > 0) {
      this.emit({ type: 'message', text: `${actor.name}は 毒に むしばまれている！` });
      this.dealDamage(actor, {
        amount: tick.poisonDamage,
        crit: false,
        weak: false,
        immune: false,
        element: 'none',
      });
    }
    for (const status of tick.expired) {
      this.emit({ type: 'status_expired', target: actor.key, status });
    }
  }

  // ---------------------------------------------------------------------
  // Targeting
  // ---------------------------------------------------------------------

  private opponentsOf(actor: Battler): Battler[] {
    return (actor.side === 'party' ? this.enemies : this.party).filter((b) => !b.ko);
  }

  private alliesOf(actor: Battler): Battler[] {
    return actor.side === 'party' ? this.party : this.enemies;
  }

  /** Live opponent by key, or a random live opponent when the chosen one is gone (§5.1). */
  private retargetEnemyOf(actor: Battler, key: string | undefined): Battler | undefined {
    const candidates = this.opponentsOf(actor);
    const chosen = key === undefined ? undefined : candidates.find((b) => b.key === key);
    if (chosen) return chosen;
    if (actor.side === 'enemy') {
      const taunter = candidates.find((p) => hasStatus(p, 'taunt'));
      if (taunter) return taunter;
    }
    return pick(this.rng, candidates);
  }

  /** Live ally by key, or the live ally with the lowest HP ratio (§5.1). */
  private retargetAllyOf(
    actor: Battler,
    key: string | undefined,
    wantKo: boolean,
  ): Battler | undefined {
    const allies = this.alliesOf(actor).filter((b) => b.ko === wantKo);
    const chosen = key === undefined ? undefined : allies.find((b) => b.key === key);
    if (chosen) return chosen;
    return [...allies].sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp)[0];
  }

  private skillTargets(
    actor: Battler,
    skill: SkillDef,
    targetKey: string | undefined,
    ai: AiDecision | undefined,
  ): Battler[] {
    switch (skill.scope) {
      case 'enemy_single': {
        const t = this.retargetEnemyOf(actor, targetKey);
        return t ? [t] : [];
      }
      case 'enemy_all':
      case 'enemy_random': {
        if (ai) {
          const live = ai.targetKeys
            .map((k) => this.find(k))
            .filter((b): b is Battler => b !== undefined && !b.ko);
          if (live.length > 0) return live;
        }
        return this.opponentsOf(actor);
      }
      case 'ally_single': {
        const t = this.retargetAllyOf(actor, targetKey, false);
        return t ? [t] : [];
      }
      case 'ally_all':
        return this.alliesOf(actor).filter((b) => !b.ko);
      case 'self':
        return [actor];
      case 'none':
        return [];
    }
  }

  private itemTargets(actor: Battler, item: ItemDef, targetKey: string | undefined): Battler[] {
    const revive = item.effect.type === 'revive';
    switch (item.scope) {
      case 'enemy_single': {
        const t = this.retargetEnemyOf(actor, targetKey);
        return t ? [t] : [];
      }
      case 'enemy_all':
      case 'enemy_random':
        return this.opponentsOf(actor);
      case 'ally_single': {
        const t = this.retargetAllyOf(actor, targetKey, revive);
        return t ? [t] : [];
      }
      case 'ally_all':
        return this.alliesOf(actor).filter((b) => b.ko === revive);
      case 'self':
        return [actor];
      case 'none':
        return [];
    }
  }

  // ---------------------------------------------------------------------
  // Outcome
  // ---------------------------------------------------------------------

  private checkOutcome(): void {
    if (this.outcome !== 'ongoing') return;
    if (this.party.every((p) => p.ko)) {
      this.outcome = 'defeat';
      this.emit({ type: 'defeat' });
      this.finish();
      return;
    }
    if (!this.enemies.every((e) => e.ko)) return;
    const phaseBoss = this.enemies.find((e) => e.phaseNext !== undefined);
    if (phaseBoss?.phaseNext !== undefined) {
      this.outcome = 'phase_change';
      this.emit({ type: 'phase_change', actor: phaseBoss.key, next: phaseBoss.phaseNext });
      // Party keeps HP/MP and buffs; ailments and taunt are cleared (§8.4).
      for (const p of this.party) {
        p.statuses = p.statuses.filter((s) => s.status === 'atk_up');
        p.guarding = false;
      }
      return;
    }
    this.outcome = 'victory';
    this.emit({ type: 'victory' });
    this.finish();
  }

  /** Statuses never carry over to the field (§5.6). */
  private finish(): void {
    for (const b of this.all) clearAllStatuses(b);
  }

  /**
   * Replaces the enemy line-up (ノクス第 2 形態) and reopens the battle. Round
   * numbering continues so `turn_every` rules stay aligned with the fight.
   */
  nextPhase(enemies: Battler[]): void {
    this.enemies.splice(0, this.enemies.length, ...enemies);
    this.outcome = 'ongoing';
  }

  private emit(event: BattleEvent): void {
    this.events.push(event);
  }
}

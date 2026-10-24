/* Hero-mode profile and weapon/skill progression. No account writes, currency or save calls.
 * Upgrade rows come from upgradeMap: current levels 1..14 use
 * 100/100/100/70/60/40/25/15/10/100/8/5/4/3 percent.
 * Ordinary levels 1..9 gain +2 percentage points per failure, cleared on success.
 * Current level 10 and above use the fixed row rate; 11..15 are true levels 1..5.
 */
(function () {
  'use strict';

  const CONFIG = Object.freeze({
    initialCount: 3, startLevel: 5, normalLimit: GData.wsLimit(90), eliteLearnChance: 0.30,
    base: Object.freeze({ power: 80, agility: 65, speed: 60, maxHp: 900 }),
  });
  const integer = (v, fallback, min, max) => {
    const n = Math.floor(Number(v));
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
  };
  const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const mapOf = (kind) => kind === 'weapon' ? weaponsMap : skillsMap;
  const prefix = (kind) => kind === 'weapon' ? 'w' : 's';
  const listOf = (hero, kind) => hero[kind === 'weapon' ? 'weapons' : 'skills'];
  const failKey = (kind, id) => prefix(kind) + Number(id);
  const refOf = (kind, id) => prefix(kind) + ':' + Number(id);
  const levelLabel = (level) => level > 10 ? '真' + (level - 10) : level + '级';
  const error = (msg) => ({ ok: false, msg, label: msg });
  function roll(rng) {
    const n = Number((typeof rng === 'function' ? rng : Math.random)());
    return Number.isFinite(n) ? Math.max(0, Math.min(1 - Number.EPSILON, n)) : 0;
  }
  const pick = (pool, rng) => pool.length ? pool[Math.floor(roll(rng) * pool.length)] : null;

  function catalog() {
    const out = [];
    for (const kind of ['weapon', 'skill']) {
      mapOf(kind).each((key, def) => {
        const id = Number(def && def.id || key);
        if (!(id > 0) || !def || !GData.canLearn(kind, id, 90)) return;
        out.push({ kind, id, name: String(def.name || ''), desc: String(def.remark || '') });
      });
    }
    return out;
  }
  function infoOf(kind, id) {
    if (kind !== 'weapon' && kind !== 'skill') return null;
    return catalog().find((it) => it.kind === kind && it.id === Number(id)) || null;
  }
  function parseRef(ref) {
    const hit = /^([ws]):(\d+)$/.exec(String(ref || ''));
    if (!hit) return null;
    const kind = hit[1] === 'w' ? 'weapon' : 'skill', id = Number(hit[2]);
    const info = infoOf(kind, id);
    return info ? Object.assign({ ref: refOf(kind, id) }, info) : null;
  }
  function owned(hero) {
    const out = [];
    for (const kind of ['weapon', 'skill']) for (const raw of listOf(hero, kind) || []) {
      const pair = String(raw).split(':').map(Number), info = infoOf(kind, pair[0]);
      if (info) out.push(Object.assign({ level: pair[1], ref: refOf(kind, pair[0]) }, info));
    }
    return out;
  }
  const owns = (hero, it) => listOf(hero, it.kind).some((raw) => Number(String(raw).split(':')[0]) === it.id);
  const count = (hero) => hero.weapons.length + hero.skills.length;
  function setLevel(hero, it, level) {
    const arr = listOf(hero, it.kind), at = arr.findIndex((raw) => Number(String(raw).split(':')[0]) === it.id);
    if (at >= 0) arr[at] = it.id + ':' + level;
  }
  function cleanAppearance(raw) {
    const out = [], parts = new Set();
    for (const value of Array.isArray(raw) ? raw : []) {
      const item = object(value) ? value : { id: value }, id = Number(item.id);
      const def = gearMap.getValue(id);
      if (!def) continue;
      const type = Number(def.type);
      if (type < 0 || type > 3 || parts.has(type)) continue;
      const set = gearSetMap.getValue(def.setId);
      const ext = (Array.isArray(item.ext) ? item.ext : []).filter(object).map((e) => ({
        id: integer(e.id, 0, 0, 100000), level: integer(e.level, 1, 1, 3),
      })).filter((e) => e.id > 0).slice(0, 3);
      const clean = { id, type, ext, quality: Number(set && set.quality) || 0, used: true };
      if (item.orange === true) { clean.orange = true; clean.quality = 4; }
      out.push(clean); parts.add(type);
    }
    return out;
  }
  function normalize(raw) {
    if (!object(raw)) return null;
    const hero = Object.assign({}, raw, { version: 1, base: Object.assign({}, CONFIG.base),
      weapons: [], skills: [], appearance: cleanAppearance(raw.appearance), upgradeFails: {},
      wins: integer(raw.wins, 0, 0, Number.MAX_SAFE_INTEGER),
      eliteWins: integer(raw.eliteWins, 0, 0, Number.MAX_SAFE_INTEGER),
      log: (Array.isArray(raw.log) ? raw.log : []).filter((s) => typeof s === 'string').slice(-20),
    });
    for (const kind of ['weapon', 'skill']) {
      const levels = new Map();
      for (const value of Array.isArray(listOf(raw, kind)) ? listOf(raw, kind) : []) {
        const hit = /^(\d+):(\d+)$/.exec(String(value));
        if (!hit) continue;
        const id = Number(hit[1]);
        if (!infoOf(kind, id)) continue;
        levels.set(id, Math.max(levels.get(id) || 1, integer(hit[2], 1, 1, 15)));
      }
      for (const [id, level] of levels) {
        listOf(hero, kind).push(id + ':' + level);
        const key = failKey(kind, id);
        if (level < 10 && !(kind === 'skill' && [6, 13].includes(id))) {
          const fails = integer(object(raw.upgradeFails) ? raw.upgradeFails[key] : 0, 0, 0, 999);
          if (fails > 0) hero.upgradeFails[key] = fails;
        }
      }
    }
    return count(hero) > 0 ? hero : null;
  }
  function repair(hero) {
    const clean = normalize(hero);
    if (!clean) return false;
    Object.assign(hero, clean);
    return true;
  }
  function create(options) {
    const opts = options || {}, picks = opts.picks;
    if (!Array.isArray(picks) || picks.length !== CONFIG.initialCount) return error('请选择恰好3个初始武器或技能。');
    const hero = { version: 1, base: Object.assign({}, CONFIG.base), weapons: [], skills: [],
      appearance: cleanAppearance(opts.appearance), upgradeFails: {}, wins: 0, eliteWins: 0, log: [] };
    for (const value of picks) {
      const info = value && infoOf(value.kind, value.id);
      if (!info) return error('初始选择中包含不可学习的武器或技能。');
      if (owns(hero, info)) return error('初始武器或技能不能重复。');
      listOf(hero, info.kind).push(info.id + ':' + CONFIG.startLevel);
    }
    const label = '英雄已准备就绪：3个5级武技。';
    return { ok: true, hero, msg: label, label };
  }
  function fighter(raw) {
    const hero = normalize(raw);
    if (!hero) return null;
    const me = { name: '勇者', level: 90, power: hero.base.power, agility: hero.base.agility,
      speed: hero.base.speed, hp: hero.base.maxHp, maxHp: hero.base.maxHp,
      weapons: hero.weapons.map((s) => State.weaponInst(s)).filter(Boolean),
      skills: hero.skills.map((s) => State.skillInst(s)).filter(Boolean),
      effects: {}, masterLevel: 0, pets: [], npcType: null,
      gears: hero.appearance.map((g) => Object.assign({}, g, { ext: g.ext.map((e) => Object.assign({}, e)) })),
    };
    for (const skill of me.skills) {
      const key = { 1: 'power', 2: 'agility', 3: 'speed', 4: 'maxHp' }[skill.id];
      if (key) me[key] += Number(GData.passiveBonus(skill.id, skill.level)) || 0;
    }
    me.hp = me.maxHp;
    me.baseStats = { power: me.power, agility: me.agility, speed: me.speed };
    me.wears = Engine.wearsFor(me.gears);
    return me;
  }
  function upgrade(hero, ref, options) {
    if (!repair(hero)) return error('英雄数据无效。');
    const item = parseRef(ref), opts = options || {};
    if (!item || !owns(hero, item)) return error('英雄尚未掌握这个武技。');
    if (item.kind === 'skill' && [6, 13].includes(item.id)) return error('该技能不能升级。');
    const current = () => Number(listOf(hero, item.kind).find((s) => Number(s.split(':')[0]) === item.id).split(':')[1]);
    const before = current();
    if (before >= 15) return error(item.name + '已达到真5上限。');
    const wanted = integer(opts.attempts, 1, 1, 100), results = [];
    let successes = 0;
    for (let n = 0; n < wanted && current() < 15; n++) {
      const level = current(), row = upgradeMap.getValue(level);
      if (!row) break;
      const key = failKey(item.kind, item.id), isTrue = level >= 10;
      const fails = isTrue ? 0 : integer(hero.upgradeFails[key], 0, 0, 999);
      const rate = Math.min(100, Math.max(0, Number(row.rate) || 0) + (isTrue ? 0 : fails * 2));
      const success = opts.guaranteed === true || roll(opts.rng) * 100 < rate;
      if (success) { setLevel(hero, item, level + 1); delete hero.upgradeFails[key]; successes++; }
      else if (!isTrue) hero.upgradeFails[key] = Math.min(999, fails + 1);
      else delete hero.upgradeFails[key];
      results.push({ level, rate, success, isTrue });
    }
    if (!results.length) return error('当前没有可用的升级规则。');
    const level = current(), last = results[results.length - 1];
    const label = successes > 0 ? item.name + '升级至' + levelLabel(level) +
      (results.length > 1 ? '（成功' + successes + '/' + results.length + '次）' : '')
      : item.name + '升级失败（成功率' + last.rate + '%）。';
    return { ok: true, ref: item.ref, name: item.name, before, level, successes,
      attempts: results.length, success: last.success, rate: last.rate, results, msg: label, label };
  }
  function learn(hero, options) {
    if (!repair(hero)) return error('英雄数据无效。');
    const opts = options || {}, atCap = count(hero) >= CONFIG.normalLimit;
    if (atCap && opts.special !== true) return Object.assign(error('已达到普通学习上限，仅特殊途径可以继续学习。'), { atCap: true });
    const pool = catalog().filter((it) => !owns(hero, it)), item = pick(pool, opts.rng);
    if (!item) return error('已经掌握所有可学习的武技。');
    const level = integer(opts.level, 1, 1, 15);
    listOf(hero, item.kind).push(item.id + ':' + level);
    const label = '领悟' + item.name + '（' + levelLabel(level) + '）。';
    return { ok: true, kind: item.kind, id: item.id, ref: refOf(item.kind, item.id), name: item.name,
      level, total: count(hero), atCap: count(hero) >= CONFIG.normalLimit, special: opts.special === true,
      msg: label, label };
  }
  function replace(hero, ref, options) {
    if (!repair(hero)) return error('英雄数据无效。');
    const old = parseRef(ref), opts = options || {};
    if (!old || !owns(hero, old)) return error('英雄尚未掌握这个武技。');
    // Choose before removal: replacement cannot randomly grant the item just forgotten.
    const next = pick(catalog().filter((it) => !owns(hero, it)), opts.rng);
    if (!next) return error('没有尚未掌握的武技可以替换。');
    const arr = listOf(hero, old.kind), at = arr.findIndex((s) => Number(s.split(':')[0]) === old.id);
    arr.splice(at, 1);
    delete hero.upgradeFails[failKey(old.kind, old.id)];
    listOf(hero, next.kind).push(next.id + ':' + CONFIG.startLevel);
    const label = old.name + '已替换为' + next.name + '（5级）。';
    return { ok: true, removed: old.ref, kind: next.kind, id: next.id, ref: refOf(next.kind, next.id),
      name: next.name, level: CONFIG.startLevel, total: count(hero), msg: label, label };
  }
  function grow(hero, options) {
    if (!repair(hero)) return error('英雄数据无效。');
    const opts = options || {}, candidates = owned(hero).filter((it) => it.level < 15 &&
      !(it.kind === 'skill' && [6, 13].includes(it.id)));
    hero.wins++;
    if (opts.elite) hero.eliteWins++;
    const selected = pick(candidates, opts.rng);
    const upgraded = selected ? upgrade(hero, selected.ref, { rng: opts.rng }) : null;
    let learned = null;
    if (opts.elite && count(hero) < CONFIG.normalLimit && roll(opts.rng) < CONFIG.eliteLearnChance) {
      learned = learn(hero, { rng: opts.rng });
    }
    const pieces = [upgraded && upgraded.label, learned && learned.label].filter(Boolean);
    const label = pieces.length ? pieces.join(' ') : '所有可升级武技均已满级。';
    const layer = integer(opts.layer, 0, 0, Number.MAX_SAFE_INTEGER);
    hero.log.push((layer > 0 ? '第' + layer + '层：' : '') + label);
    hero.log = hero.log.slice(-20);
    return { ok: true, upgrade: upgraded, learn: learned, atCap: count(hero) >= CONFIG.normalLimit,
      msg: label, label };
  }

  window.TowerHero = { CONFIG, catalog, create, normalize, fighter, grow, upgrade, replace, learn };
})();

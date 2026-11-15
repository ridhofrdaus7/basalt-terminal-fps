// Tactical HUD, live canvas radar/minimap, dynamic spread crosshair, killfeed, and buy menu.
import { WEAPONS, GRENADES, ECONOMY, PALETTE } from './config.js';

export function createHud() {
  const el = {
    vScore: document.getElementById('score-vanguard'),
    sScore: document.getElementById('score-sentinel'),
    vPips: document.getElementById('pips-vanguard'),
    sPips: document.getElementById('pips-sentinel'),
    timer: document.getElementById('round-timer'),
    phaseBadge: document.getElementById('phase-badge'),
    callout: document.getElementById('callout'),
    hp: document.getElementById('hp-val'),
    armor: document.getElementById('armor-val'),
    cash: document.getElementById('cash-val'),
    mag: document.getElementById('ammo-mag'),
    reserve: document.getElementById('ammo-reserve'),
    weaponName: document.getElementById('weapon-name'),
    slots: document.getElementById('weapon-slots'),
    prompt: document.getElementById('action-prompt'),
    progressWrap: document.getElementById('channel-wrap'),
    progressFill: document.getElementById('channel-fill'),
    progressLabel: document.getElementById('channel-label'),
    killfeed: document.getElementById('killfeed'),
    crosshair: document.getElementById('crosshair'),
    crossArms: document.querySelectorAll('#crosshair i'),
    hitmarker: document.getElementById('hitmarker'),
    scopeOverlay: document.getElementById('scope-overlay'),
    flashOverlay: document.getElementById('flash-overlay'),
    hurtOverlay: document.getElementById('hurt-overlay'),
    radar: document.getElementById('radar'),
    buyMenu: document.getElementById('buy-menu'),
    buyCash: document.getElementById('buy-cash'),
    buyClose: document.getElementById('buy-close'),
    roundBanner: document.getElementById('round-banner'),
    bannerTitle: document.getElementById('banner-title'),
    bannerSub: document.getElementById('banner-sub'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayCopy: document.getElementById('overlay-copy'),
    playBtn: document.getElementById('play-btn'),
  };

  const radarCtx = el.radar.getContext('2d');
  let hitTimer = 0;
  let hurtTimer = 0;
  const feedItems = [];
  let onBuyHandler = null;
  let onPlayHandler = null;
  let onBuyCloseHandler = null;

  el.playBtn.addEventListener('click', () => {
    if (onPlayHandler) onPlayHandler();
  });

  if (el.buyClose) {
    el.buyClose.addEventListener('click', () => {
      if (onBuyCloseHandler) onBuyCloseHandler();
    });
  }

  document.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (onBuyHandler) onBuyHandler(btn.dataset.buy);
    });
  });

  function setRoundHeader(vWins, sWins, vAlive, sAlive, secondsLeft, phaseLabel, isPlanted) {
    el.vScore.textContent = String(vWins);
    el.sScore.textContent = String(sWins);
    const totalSec = Math.max(0, Math.ceil(secondsLeft));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    el.timer.textContent = isPlanted ? `DETONATE ${totalSec}s` : `${min}:${sec < 10 ? '0' : ''}${sec}`;
    el.timer.classList.toggle('planted', Boolean(isPlanted));
    el.phaseBadge.textContent = phaseLabel;
    el.vPips.innerHTML = renderPips(vAlive, 4, 'v');
    el.sPips.innerHTML = renderPips(sAlive, 4, 's');
  }

  function renderPips(alive, max, cls) {
    let html = '';
    for (let i = 0; i < max; i++) {
      html += `<span class="pip ${cls} ${i < alive ? 'up' : 'down'}"></span>`;
    }
    return html;
  }

  function setVitals(hp, armor, hasHelmet, cash, callout) {
    el.hp.textContent = String(hp);
    el.hp.classList.toggle('low', hp <= 30);
    el.armor.textContent = `${armor}${hasHelmet ? '+' : ''}`;
    el.cash.textContent = `$${cash.toLocaleString('en-US')}`;
    el.callout.textContent = callout;
  }

  function setWeaponHud(weaponSystem) {
    const ws = weaponSystem.state;
    const def = weaponSystem.currentWeaponDef();
    const nade = weaponSystem.currentGrenadeKind();
    if (def) {
      el.weaponName.textContent = ws.reloadTimer > 0 ? `${def.name} (RELOADING)` : def.name;
      if (def.category === 'melee') {
        el.mag.textContent = '--';
        el.reserve.textContent = '';
      } else {
        el.mag.textContent = String(ws.mag[def.id] ?? 0);
        el.reserve.textContent = `/ ${ws.reserve[def.id] ?? 0}`;
      }
    } else if (nade) {
      el.weaponName.textContent = GRENADES[nade].name;
      el.mag.textContent = String(ws.grenades[nade]);
      el.reserve.textContent = 'THROW';
    }

    const slotLabels = [
      ws.slots[0] ? `1 ${WEAPONS[ws.slots[0]].name}` : '1 —',
      '2 Kestrel-9',
      '3 Blade',
      ws.grenades.frag > 0 ? '4 HE-4' : '4 —',
      ws.grenades.smoke > 0 ? '5 Smoke-X' : ws.grenades.flash > 0 ? '5 Flash-B' : '5 —',
    ];
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="slot ${ws.activeSlot === i ? 'active' : ''}">${slotLabels[i]}</span>`;
    }
    el.slots.innerHTML = html;
  }

  function setCrosshairSpread(spreadRad, scoped) {
    el.scopeOverlay.hidden = !scoped;
    el.crosshair.hidden = scoped;
    if (scoped) return;
    const gap = Math.min(34, Math.max(4, Math.round(spreadRad * 460)));
    el.crossArms[0].style.transform = `translate(-50%, ${-gap - 8}px)`;
    el.crossArms[1].style.transform = `translate(-50%, ${gap}px)`;
    el.crossArms[2].style.transform = `translate(${-gap - 8}px, -50%)`;
    el.crossArms[3].style.transform = `translate(${gap}px, -50%)`;
  }

  function triggerHitmarker(isHead, isKill, holdMs = 130) {
    el.hitmarker.classList.toggle('head', Boolean(isHead || isKill));
    el.hitmarker.classList.add('on');
    hitTimer = holdMs / 1000;
  }

  function triggerHurt(holdMs = 220) {
    el.hurtOverlay.style.opacity = '0.65';
    hurtTimer = holdMs / 1000;
  }

  function setFlashAlpha(alpha) {
    el.flashOverlay.style.opacity = String(Math.max(0, Math.min(1, alpha)));
  }

  function setActionPrompt(text, progress = -1, label = '') {
    el.prompt.textContent = text;
    el.prompt.hidden = !text;
    el.progressWrap.hidden = progress < 0;
    if (progress >= 0) {
      el.progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
      el.progressLabel.textContent = label;
    }
  }

  function pushKill(killer, victim, weaponName, isHead, killerTeam) {
    feedItems.unshift({ killer, victim, weaponName, isHead, killerTeam, life: 5.5 });
    if (feedItems.length > 4) feedItems.length = 4;
    renderFeed();
  }

  function renderFeed() {
    el.killfeed.innerHTML = feedItems
      .map(
        (f) =>
          `<div class="kf-row"><span class="${f.killerTeam === 'vanguard' ? 't-v' : 't-s'}">${f.killer}</span><span class="kf-wpn">[${f.weaponName}${f.isHead ? ' · HS' : ''}]</span><span class="${f.killerTeam === 'vanguard' ? 't-s' : 't-v'}">${f.victim}</span></div>`
      )
      .join('');
  }

  function updateRadar(player, bots, bombState, smokes) {
    const ctx = radarCtx;
    const w = el.radar.width;
    const h = el.radar.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(18, 21, 27, 0.86)';
    ctx.fillRect(0, 0, w, h);

    // Map coordinates: x in [-25..25], z in [-23..23] -> 144x144
    const toX = (wx) => ((wx + 25) / 50) * w;
    const toY = (wz) => ((wz + 23) / 46) * h;

    // Site A & Site B pads
    ctx.fillStyle = 'rgba(240, 168, 48, 0.22)';
    ctx.fillRect(toX(-19.5), toY(-11.5), (9 / 50) * w, (9 / 46) * h);
    ctx.fillStyle = 'rgba(99, 210, 255, 0.22)';
    ctx.fillRect(toX(10.5), toY(-11.5), (9 / 50) * w, (9 / 46) * h);

    // Lane dividers & Mid platform
    ctx.fillStyle = 'rgba(185, 175, 160, 0.45)';
    ctx.fillRect(toX(-8), toY(-22), (1 / 50) * w, (7 / 46) * h);
    ctx.fillRect(toX(-8), toY(-7), (1 / 50) * w, (11.5 / 46) * h);
    ctx.fillRect(toX(-8), toY(10), (1 / 50) * w, (4.5 / 46) * h);
    ctx.fillRect(toX(7), toY(-22), (1 / 50) * w, (7 / 46) * h);
    ctx.fillRect(toX(7), toY(-7), (1 / 50) * w, (11.5 / 46) * h);
    ctx.fillRect(toX(7), toY(10), (1 / 50) * w, (4.5 / 46) * h);
    ctx.fillRect(toX(-2.6), toY(-3), (5.2 / 50) * w, (3.6 / 46) * h);

    ctx.fillStyle = PALETTE.hazardAmber;
    ctx.font = 'bold 10px monospace';
    ctx.fillText('A', toX(-15) - 3, toY(-7) + 3);
    ctx.fillStyle = PALETTE.sentinelTrim;
    ctx.fillText('B', toX(15) - 3, toY(-7) + 3);

    // Active smoke circles
    ctx.fillStyle = 'rgba(210, 218, 226, 0.55)';
    for (let i = 0; i < smokes.length; i++) {
      ctx.beginPath();
      ctx.arc(toX(smokes[i].center.x), toY(smokes[i].center.z), 9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bots (allies always shown, enemies shown when alerted/spotted)
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.alive) continue;
      if (b.team === 'sentinel' && b.alertTimer <= 0 && bombState.mode !== 'planted') continue;
      ctx.fillStyle = b.team === 'vanguard' ? PALETTE.vanguardTrim : '#ff5f56';
      ctx.beginPath();
      ctx.arc(toX(b.position.x), toY(b.position.z), 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Planted charge pulse
    if (bombState.mode === 'planted') {
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(bombState.position.x), toY(bombState.position.z), 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player arrow
    const px = toX(player.position.x);
    const py = toY(player.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.2, 4.5);
    ctx.lineTo(-4.2, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function showBuyMenu(show, cash, weaponSystem, playerState) {
    el.buyMenu.hidden = !show;
    if (!show) return;
    el.buyCash.textContent = `$${cash.toLocaleString('en-US')}`;
    const items = {
      vektor: WEAPONS.vektor.price,
      ar17: WEAPONS.ar17.price,
      dmr7: WEAPONS.dmr7.price,
      kevlar: ECONOMY.kevlarCost,
      helmet: ECONOMY.helmetCost,
      frag: GRENADES.frag.price,
      smoke: GRENADES.smoke.price,
      flash: GRENADES.flash.price,
    };
    document.querySelectorAll('[data-buy]').forEach((btn) => {
      const id = btn.dataset.buy;
      const cost = items[id] ?? 0;
      const owned =
        weaponSystem.state.slots[0] === id ||
        (id === 'kevlar' && playerState.armor >= 95) ||
        (id === 'helmet' && playerState.hasHelmet) ||
        (GRENADES[id] && weaponSystem.state.grenades[id] >= 1);
      btn.disabled = owned || cash < cost;
      btn.classList.toggle('owned', Boolean(owned));
    });
  }

  function showBanner(title, sub) {
    if (!title) {
      el.roundBanner.hidden = true;
      return;
    }
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub;
    el.roundBanner.hidden = false;
  }

  function showOverlay(mode, summaryText = '') {
    if (!mode) {
      el.overlay.hidden = true;
      return;
    }
    el.overlay.hidden = false;
    if (mode === 'start') {
      el.overlayTitle.textContent = 'BASALT TERMINAL';
      el.overlayCopy.textContent =
        '4v4 round-based tactical defusal. Stop moving to stabilize shots, plant the Core Charge at Site A or B, and buy gear with [B] between rounds.';
      el.playBtn.textContent = 'Deploy Round 1';
    } else if (mode === 'paused') {
      el.overlayTitle.textContent = 'TACTICAL PAUSE';
      el.overlayCopy.textContent = 'Click below to re-lock pointer and resume the round.';
      el.playBtn.textContent = 'Resume Match';
    } else {
      el.overlayTitle.textContent = mode === 'victory' ? 'VANGUARD VICTORY' : 'SENTINEL VICTORY';
      el.overlayCopy.textContent = summaryText;
      el.playBtn.textContent = 'Play New Match';
    }
  }

  function step(dt) {
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) el.hitmarker.classList.remove('on');
    }
    if (hurtTimer > 0) {
      hurtTimer -= dt;
      if (hurtTimer <= 0) el.hurtOverlay.style.opacity = '0';
    }
    let changed = false;
    for (let i = feedItems.length - 1; i >= 0; i--) {
      feedItems[i].life -= dt;
      if (feedItems[i].life <= 0) {
        feedItems.splice(i, 1);
        changed = true;
      }
    }
    if (changed) renderFeed();
  }

  return {
    setRoundHeader,
    setVitals,
    setWeaponHud,
    setCrosshairSpread,
    triggerHitmarker,
    triggerHurt,
    setFlashAlpha,
    setActionPrompt,
    pushKill,
    updateRadar,
    showBuyMenu,
    showBanner,
    showOverlay,
    step,
    onBuy(fn) { onBuyHandler = fn; },
    onPlay(fn) { onPlayHandler = fn; },
    onBuyClose(fn) { onBuyCloseHandler = fn; },
    isBuyOpen() { return !el.buyMenu.hidden; },
  };
}

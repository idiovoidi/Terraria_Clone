// Player animation system (simple, code-drawn)
// States: idle, run, jump, fall, mine

(function () {
  function determineState(player) {
    if (!player.onGround) {
      return player.vy < -0.5 ? 'jump' : 'fall';
    }
    if (Math.abs(player.vx) > 0.25) return 'run';
    return 'idle';
  }

  function update(player, dt) {
    if (!player.anim) {
      player.anim = { time: 0, walk: 0, state: 'idle' };
    }
    player.anim.state = determineState(player);
    player.anim.time += dt;
    // advance walk cycle based on horizontal speed
    const walkSpeed = Math.min(1.5, Math.abs(player.vx) / 4.5) * 0.35; // tuned factor
    player.anim.walk += walkSpeed * dt * (player.onGround ? 1 : 0.3);
  }

  function draw(ctx, player, camera) {
    const px = Math.floor(player.x - camera.x);
    const py = Math.floor(player.y - camera.y);

    const facing = player.facing || 1; // 1 right, -1 left
    const state = player.anim?.state || 'idle';
    const cycle = player.anim?.walk || 0;

    const bodyWidth = player.width;
    const bodyHeight = player.height - 6;
    const headRadius = 6;

    const runAmp = 10; // degrees
    const t = cycle * Math.PI * 2;
    const legSwing = state === 'run' ? Math.sin(t) * runAmp : 0;
    const armSwing = state === 'run' ? Math.sin(t + Math.PI) * runAmp : 0;

    const idleBob = state === 'idle' ? Math.sin((player.anim?.time || 0) * 0.5) * 1.0 : 0;
    const airBob = !player.onGround ? -2 : 0;

    ctx.save();
    ctx.translate(px, py + idleBob + airBob);
    ctx.scale(facing, 1);

    // Local origin at player center
    // Draw legs
    drawLimb(ctx, -bodyWidth * 0.2, bodyHeight * 0.3, bodyWidth * 0.12, bodyHeight * 0.6, legSwing);
    drawLimb(ctx, bodyWidth * 0.2, bodyHeight * 0.3, bodyWidth * 0.12, bodyHeight * 0.6, -legSwing);

    // Body
    ctx.fillStyle = '#3b6cff';
    ctx.fillRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);

    // Head
    ctx.fillStyle = '#f2d6b3';
    ctx.beginPath();
    ctx.arc(0, -bodyHeight / 2 - headRadius + 2, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#222';
    const eyeOffsetX = 3;
    const eyeY = -bodyHeight / 2 - headRadius + 2;
    ctx.fillRect(eyeOffsetX - 1, eyeY - 1, 2, 2);
    ctx.fillRect(eyeOffsetX + 4, eyeY - 1, 2, 2);

    // Arms over body
    drawArm(ctx, -bodyWidth * 0.35, -bodyHeight * 0.2, bodyWidth * 0.1, bodyHeight * 0.55, armSwing);
    drawArm(ctx, bodyWidth * 0.35, -bodyHeight * 0.2, bodyWidth * 0.1, bodyHeight * 0.55, -armSwing);

    ctx.restore();
  }

  function drawLimb(ctx, x, y, w, h, deg) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.fillStyle = '#2a4dbf';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawArm(ctx, x, y, w, h, deg) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.fillStyle = '#2a4dbf';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // simple hand
    ctx.fillStyle = '#f2d6b3';
    ctx.fillRect(-w / 2, h / 2 - 2, w, 4);
    ctx.restore();
  }

  window.PlayerAnim = { update, draw };
})();



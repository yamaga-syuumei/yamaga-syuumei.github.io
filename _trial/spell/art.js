// 描画の部品。画像は使わず、形と色から毎フレーム描く。
//
//  drawFoe … 敵。t は経過秒で、待機の揺れに使う。hurt は 0〜1 で白く飛ばす。
//  drawOrb … 手元の魔素。属性の色で光らせ、威力を中に出す。
window.SPART = (function () {
  'use strict';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function eyes(ctx, x, y, d, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x - d, y, r, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + d, y, r, 0, 7); ctx.fill();
  }

  // 泥人形。下が広い雫。待機でとろりと形が変わる
  function mud(ctx, s, t) {
    const w = s * (.52 + Math.sin(t * 1.6) * .02);
    const h = s * (.48 - Math.sin(t * 1.6) * .02);
    ctx.fillStyle = '#8a7a5c';
    ctx.beginPath();
    ctx.moveTo(0, -h * 1.5);
    ctx.bezierCurveTo(w, -h * 1.2, w * 1.15, h * .6, 0, h);
    ctx.bezierCurveTo(-w * 1.15, h * .6, -w, -h * 1.2, 0, -h * 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.ellipse(-w * .3, -h * .5, w * .22, h * .3, -.4, 0, 7); ctx.fill();
    eyes(ctx, 0, -h * .2, s * .14, s * .055, '#2b2417');
  }

  // 石の番人。角張った胴に厚い板。板が防壁の見た目になる
  function stone(ctx, s, t) {
    const sway = Math.sin(t * 1.1) * s * .012;
    ctx.save();
    ctx.translate(sway, 0);
    ctx.fillStyle = '#7d8590';
    roundRect(ctx, -s * .42, -s * .5, s * .84, s * .95, s * .12); ctx.fill();
    ctx.fillStyle = '#9aa3ad';
    roundRect(ctx, -s * .5, -s * .28, s * .18, s * .5, s * .07); ctx.fill();
    roundRect(ctx, s * .32, -s * .28, s * .18, s * .5, s * .07); ctx.fill();
    ctx.strokeStyle = '#5d646d';
    ctx.lineWidth = s * .035;
    ctx.beginPath();
    ctx.moveTo(-s * .2, -s * .5); ctx.lineTo(-s * .05, -s * .1); ctx.lineTo(-s * .24, s * .2);
    ctx.stroke();
    eyes(ctx, 0, -s * .22, s * .15, s * .05, '#f0e2a8');
    ctx.restore();
  }

  // 氷の蝙蝠。羽ばたきで横幅が変わる
  function bat(ctx, s, t) {
    const f = Math.sin(t * 5) * .5 + .5;
    const wing = s * (.42 + f * .22);
    ctx.fillStyle = '#6fa8d8';
    ctx.beginPath();
    ctx.moveTo(0, -s * .1);
    ctx.quadraticCurveTo(-wing, -s * (.34 + f * .12), -wing * 1.08, s * .16);
    ctx.quadraticCurveTo(-wing * .5, s * .02, 0, s * .2);
    ctx.quadraticCurveTo(wing * .5, s * .02, wing * 1.08, s * .16);
    ctx.quadraticCurveTo(wing, -s * (.34 + f * .12), 0, -s * .1);
    ctx.fill();
    ctx.fillStyle = '#48789f';
    ctx.beginPath(); ctx.ellipse(0, 0, s * .17, s * .24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfeaff';
    ctx.beginPath();
    ctx.moveTo(-s * .16, -s * .18); ctx.lineTo(-s * .06, -s * .34); ctx.lineTo(-s * .02, -s * .16);
    ctx.moveTo(s * .16, -s * .18); ctx.lineTo(s * .06, -s * .34); ctx.lineTo(s * .02, -s * .16);
    ctx.fill();
    eyes(ctx, 0, -s * .02, s * .07, s * .035, '#ffe9a8');
  }

  // 炎鬼。角と揺れる炎
  function oni(ctx, s, t) {
    const f = Math.sin(t * 3.4) * .5 + .5;
    ctx.fillStyle = 'rgba(240,120,58,' + (.22 + f * .12) + ')';
    ctx.beginPath();
    ctx.moveTo(0, -s * (.72 + f * .16));
    ctx.quadraticCurveTo(s * .42, -s * .1, 0, s * .42);
    ctx.quadraticCurveTo(-s * .42, -s * .1, 0, -s * (.72 + f * .16));
    ctx.fill();
    ctx.fillStyle = '#c4452c';
    ctx.beginPath(); ctx.ellipse(0, 0, s * .3, s * .34, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#efe0c4';
    ctx.beginPath();
    ctx.moveTo(-s * .3, -s * .24); ctx.lineTo(-s * .4, -s * .52); ctx.lineTo(-s * .16, -s * .32);
    ctx.moveTo(s * .3, -s * .24); ctx.lineTo(s * .4, -s * .52); ctx.lineTo(s * .16, -s * .32);
    ctx.fill();
    eyes(ctx, 0, -s * .04, s * .12, s * .045, '#ffe15c');
    ctx.fillStyle = '#efe0c4';
    ctx.fillRect(-s * .12, s * .12, s * .24, s * .05);
  }

  const FOE = { mud, stone, bat, oni };

  function drawFoe(ctx, art, x, y, s, t, hurt) {
    ctx.save();
    ctx.translate(x, y);
    if (hurt > 0) {
      ctx.translate((Math.random() - .5) * s * .12 * hurt, 0);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = s * .5 * hurt;
    }
    (FOE[art] || mud)(ctx, s, t);
    if (hurt > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,' + (hurt * .75) + ')';
      ctx.fillRect(-s, -s, s * 2, s * 2);
    }
    ctx.restore();
  }

  // 魔素。貫通が付いていれば外側に輪を描く
  function drawOrb(ctx, orb, x, y, r, t, elems) {
    const e = elems[orb.el] || elems.mana;
    const pulse = 1 + Math.sin(t * 3 + x) * .04;
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, 0, r * .1, 0, 0, r * pulse);
    g.addColorStop(0, e.glow);
    g.addColorStop(.55, e.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * pulse, 0, 7); ctx.fill();
    if (orb.pierce) {
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = Math.max(1.4, r * .09);
      ctx.setLineDash([r * .5, r * .34]);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.18, t * 1.6, t * 1.6 + 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#2a2035';
    ctx.font = '700 ' + Math.round(r * .78) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(orb.power, 0, r * .04);
    ctx.restore();
  }

  // 放った魔素が飛ぶ軌跡
  function drawBolt(ctx, orb, x, y, r, t, elems) {
    const e = elems[orb.el] || elems.mana;
    ctx.save();
    ctx.globalAlpha = .5;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = r * .7;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - r * 2.4, y); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
    drawOrb(ctx, orb, x, y, r, t, elems);
  }

  return { roundRect, drawFoe, drawOrb, drawBolt };
})();

(function(){'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d'),W=540,H=960;
let player,enemy,score,hp,turn,ended,inStory=true,slashAnim=0;
const scenes={
  start:{speaker:'ผู้บรรยาย',text:'คุณพบดาบพลังงานลึกลับปักอยู่ จะดึงมันขึ้นมาหรือไม่?',choices:[{label:'ดึงดาบและออกเดินทาง',next:'letter'},{label:'เดินเลี่ยงไป',next:'end'}]},
  letter:{speaker:'เสียงลึกลับ',text:'วิญญาณแห่งดาบยอมรับคุณ จงใช้มันฟาดฟันศัตรูในกาแล็กซีให้สิ้นซาก',choices:[{label:'เริ่มต่อสู้เทิร์นเบส',next:'game'}]},
  end:{speaker:'ผู้บรรยาย',text:'คุณเดินผ่านมันไปอย่างไร้จุดหมาย และถูกความมืดกลืนกิน…',choices:[{label:'ย้อนเวลากลับมาเลือกใหม่',next:'start'}]}
};
const stars=Array.from({length:95},(_,i)=>({x:(i*167)%W,y:(i*311)%H,s:1+i%3}));

function showScene(id){
  if(id==='game'){
    document.getElementById('story').style.display='none';
    resetGame();
    return;
  }
  const sc=scenes[id];
  document.getElementById('speaker').textContent=sc.speaker;
  document.getElementById('text').textContent=sc.text;
  const chDiv=document.getElementById('choices');
  chDiv.innerHTML='';
  sc.choices.forEach(c=>{
    const btn=document.createElement('button');
    btn.textContent=c.label;
    btn.onclick=()=>showScene(c.next);
    chDiv.appendChild(btn);
  });
}

function resetGame(){
  player={hp:5,maxHp:5,atk:12};
  enemy={name:'จักรกลเถื่อน',hp:40,maxHp:40,atk:8,intent:'attack'};
  score=0;hp=player.hp;turn='player';ended=false;slashAnim=0;
  inStory=false;
  document.getElementById('end').style.display='none';
}

document.getElementById('retry').onclick=()=>{
  inStory=true;
  showScene('start');
};showScene('start');

let touchStartX=0,touchStartY=0;
window.addEventListener('pointerdown',e=>{
  touchStartX=e.clientX;touchStartY=e.clientY;
});
window.addEventListener('pointerup',e=>{
  if(inStory||ended||turn!=='player')return;
  const dx=e.clientX-touchStartX;
  const dy=e.clientY-touchStartY;
  if(Math.hypot(dx,dy)>30||(window.StudioInput&&window.StudioInput.fire)){
    // Player Slash Action
    slashAnim=1;
    const dmg=player.atk+Math.floor(Math.random()*5);
    enemy.hp-=dmg;
    score+=dmg*10;
    if(enemy.hp<=0){
      score+=100;
      enemy={name:'บอสจักรกลพิฆาต',hp:70,maxHp:70,atk:15,intent:'charge'};
    }else{
      turn='enemy';
      setTimeout(enemyTurn,700);
    }
  }
});

function enemyTurn(){
  if(ended)return;
  const dmg=enemy.atk+Math.floor(Math.random()*4);
  hp-=dmg;
  if(hp<=0){
    hp=0;
    ended=true;
    document.getElementById('outcome').textContent='พ่ายแพ้ในศึกดาบ';
    document.getElementById('summary').textContent='คะแนนรวม '+score+' แต้ม';
    document.getElementById('end').style.display='grid';
  }else{
    turn='player';
  }
}

let last=performance.now();
function frame(now){
  const dt=Math.min(.04,(now-last)/1000);last=now;
  if(slashAnim>0)slashAnim-=dt*3;

  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#061220');bg.addColorStop(1,'#132a3e');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  for(const s of stars){
    ctx.fillStyle=s.s===3?'#86d9e8':'#a8c1d4';
    ctx.globalAlpha=.3+s.s*.18;
    ctx.fillRect(s.x,(s.y+now*0.02*s.s)%H,s.s,s.s);
  }
  ctx.globalAlpha=1;

  // Draw Enemy
  ctx.save();ctx.translate(W/2,280);
  ctx.fillStyle='#fa7f91';ctx.beginPath();ctx.arc(0,0,70,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#3a1018';ctx.fillRect(-35,-10,70,20);
  // Enemy HP bar
  ctx.fillStyle='#333';ctx.fillRect(-60,-95,120,10);
  ctx.fillStyle='#fa7f91';ctx.fillRect(-60,-95,120*(Math.max(0,enemy.hp)/enemy.maxHp),10);
  ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.textAlign='center';
  ctx.fillText(enemy.name+' (HP: '+Math.max(0,enemy.hp)+')',0,-110);
  ctx.restore();

  // Draw Player Slash Effect
  if(slashAnim>0){
    ctx.strokeStyle='#83f5b2';ctx.lineWidth=8;
    ctx.beginPath();ctx.arc(W/2,280,100,-Math.PI/2,Math.PI/2);ctx.stroke();
  }

  // Draw Player Status / UI
  ctx.save();ctx.translate(W/2,750);
  ctx.fillStyle='#83f5b2';ctx.beginPath();ctx.arc(0,-40,40,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#122c29';ctx.font='20px sans-serif';ctx.textAlign='center';ctx.fillText('⚔️',0,-32);
  // Player HP bar
  ctx.fillStyle='#333';ctx.fillRect(-80,20,160,14);
  ctx.fillStyle='#83f5b2';ctx.fillRect(-80,20,160*(Math.max(0,hp)/player.maxHp),14);
  ctx.fillStyle='#fff';ctx.font='14px sans-serif';
  ctx.fillText('พลังชีวิตผู้กล้า: '+Math.max(0,hp)+'/'+player.maxHp,0,10);
  ctx.restore();

  document.getElementById('readout').textContent='✦ '+score+'    เทิร์น: '+(turn==='player'?'ตาคุณ (ปัดหน้าจอเพื่อฟัน!)':'ศัตรูกำลังโจมตี');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
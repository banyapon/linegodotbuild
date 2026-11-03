(function(){'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d'),W=540,H=960;
let p,shots,enemies,boss,items,score,hp,time,shotClock,spawnClock,ended,inStory=true,currentSceneId='start';
const scenes={
  start:{speaker:'ผู้บรรยาย',text:'คุณพบจดหมายหนึ่งฉบับใต้แสงดาว จะเปิดอ่านหรือไม่?',choices:[{label:'เปิดจดหมาย',next:'letter'},{label:'เดินทางต่อ',next:'end'}]},
  letter:{speaker:'เสียงจากจดหมาย',text:'ทุกการเดินทางเริ่มต้นจากตัวเลือกเล็ก ๆ ขอบคุณที่เปิดใจรับเรื่องราวของเรา',choices:[{label:'ออกเดินทาง',next:'end'}]},
  end:{speaker:'ผู้บรรยาย',text:'และการผจญภัยบทใหม่ก็กำลังจะเริ่มต้น…',choices:[{label:'เริ่มภารกิจ',next:'game'}]}
};
const stars=Array.from({length:95},(_,i)=>({x:(i*167)%W,y:(i*311)%H,s:1+i%3}));

function showScene(id){
  currentSceneId=id;
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
  p={x:270,y:730,power:1};
  shots=[];enemies=[];boss=null;items=[];score=0;hp=3;time=0;shotClock=0;spawnClock=0;ended=false;
  inStory=false;
  document.getElementById('end').style.display='none';
}

document.getElementById('retry').onclick=()=>{
  inStory=true;
  showScene('start');
};showScene('start');

let last=performance.now();
function frame(now){
  const dt=Math.min(.04,(now-last)/1000);last=now;
  const input=window.StudioInput||{x:0,y:0};
  if(!inStory&&!ended&&!input.paused){
    time+=dt;
    const length=Math.max(1,Math.hypot(input.x,input.y));
    p.x=Math.max(25,Math.min(W-25,p.x+input.x/length*310*dt));
    p.y=Math.max(70,Math.min(H-110,p.y+input.y/length*310*dt));
    shotClock-=dt;spawnClock-=dt;
    if(shotClock<=0){
      if(p.power===1){
        shots.push({x:p.x,y:p.y-25,vx:0});
      }else{
        shots.push({x:p.x-10,y:p.y-20,vx:0},{x:p.x+10,y:p.y-20,vx:0},{x:p.x,y:p.y-25,vx:-40},{x:p.x,y:p.y-25,vx:40});
      }
      shotClock=input.fire?.1:.18;
    }
    if(time>35&&!boss&&score<25){
      boss={x:W/2,y:-100,vx:100,hp:45,maxHp:45,r:45};
    }
    if(!boss&&spawnClock<=0){
      enemies.push({x:40+Math.random()*(W-80),y:-30,r:17+Math.random()*10,v:130+time*1.5});
      spawnClock=.65;
    }
    if(boss){
      boss.x+=boss.vx*dt;
      if(boss.x<60||boss.x>W-60)boss.vx*=-1;
      if(boss.y<120)boss.y+=50*dt;
    }
    for(const b of shots){b.x+=(b.vx||0)*dt;b.y-=600*dt;}
    for(const e of enemies)e.y+=e.v*dt;
    for(const it of items)it.y+=120*dt;
    for(const e of enemies){
      for(const b of shots){
        if(!e.dead&&!b.dead&&Math.hypot(e.x-b.x,e.y-b.y)<e.r+5){
          e.dead=true;b.dead=true;score++;
          if(Math.random()<0.25)items.push({x:e.x,y:e.y,type:'power'});
        }
      }
      if(!e.dead&&Math.hypot(e.x-p.x,e.y-p.y)<e.r+17){
        e.dead=true;hp--;
      }
    }
    if(boss){
      for(const b of shots){
        if(b.y>0&&Math.hypot(boss.x-b.x,boss.y-b.y)<boss.r+5){
          b.dead=true;boss.hp--;
          if(boss.hp<=0){score+=15;boss=null;items.push({x:W/2,y:150,type:'power'});}
        }
      }
    }
    for(const it of items){
      if(Math.hypot(it.x-p.x,it.y-p.y)<25){
        it.collected=true;p.power=2;hp=Math.min(5,hp+1);
      }
    }
    shots=shots.filter(b=>!b.dead&&b.y>-20);
    enemies=enemies.filter(e=>!e.dead&&e.y<H+40);
    items=items.filter(it=>!it.collected&&it.y<H+40);
    if(hp<=0||score>=35){
      ended=true;
      document.getElementById('outcome').textContent=score>=35?'ภารกิจสมบูรณ์!':'ยานเสียหายหนัก';
      document.getElementById('summary').textContent='คะแนนรวม '+score+' แต้ม';
      document.getElementById('end').style.display='grid';
    }
  }
  
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#061220');bg.addColorStop(1,'#132a3e');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  for(const s of stars){
    ctx.fillStyle=s.s===3?'#86d9e8':'#a8c1d4';
    ctx.globalAlpha=.3+s.s*.18;
    ctx.fillRect(s.x,(s.y+time*20*s.s)%H,s.s,s.s);
  }
  ctx.globalAlpha=1;
  ctx.strokeStyle='#1e4b58';ctx.lineWidth=1;
  for(let y=0;y<H;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  for(const b of shots){
    ctx.fillStyle='#b9ffee';ctx.shadowColor='#91ffe0';ctx.shadowBlur=12;
    ctx.fillRect(b.x-2,b.y,4,18);
  }
  ctx.shadowBlur=0;
  for(const it of items){
    ctx.fillStyle='#ffd277';ctx.beginPath();ctx.arc(it.x,it.y,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='10px sans-serif';ctx.fillText('★',it.x-4,it.y+3);
  }
  if(boss){
    ctx.save();ctx.translate(boss.x,boss.y);
    ctx.fillStyle='#fa7f91';ctx.beginPath();ctx.arc(0,0,boss.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3a1018';ctx.fillRect(-25,-6,50,12);
    ctx.fillStyle='#ffc779';ctx.fillRect(-boss.r*(boss.hp/boss.maxHp),-boss.r-12,boss.r*2*(boss.hp/boss.maxHp),4);
    ctx.restore();
  }
  for(const e of enemies){
    ctx.save();ctx.translate(e.x,e.y);
    ctx.fillStyle='#e59a83';ctx.beginPath();
    ctx.moveTo(0,e.r);ctx.lineTo(-e.r,-e.r*.55);ctx.lineTo(0,-e.r*.2);ctx.lineTo(e.r,-e.r*.55);ctx.closePath();
    ctx.fill();ctx.restore();
  }
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#b9f4df';ctx.beginPath();
  ctx.moveTo(0,-28);ctx.lineTo(-23,22);ctx.lineTo(0,12);ctx.lineTo(23,22);ctx.closePath();
  ctx.fill();
  ctx.fillStyle='#ffc779';ctx.beginPath();
  ctx.moveTo(-7,24);ctx.lineTo(0,35+Math.sin(now/70)*7);ctx.lineTo(7,24);ctx.fill();
  ctx.restore();
  
  document.getElementById('readout').textContent='✦ '+score+'    ♥ '+Math.max(0,hp)+'    PWR '+p.power;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
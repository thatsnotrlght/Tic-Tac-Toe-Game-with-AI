// Minimal Tic-Tac-Toe implementation (cleaned)
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const timeEl = document.getElementById('time');
const nodesEl = document.getElementById('nodes');
const prunedEl = document.getElementById('pruned');
const logEl = document.getElementById('log');

const modeSel = document.getElementById('mode');
const algSel = document.getElementById('alg');
const p1AlgSel = document.getElementById('p1Alg');
const p2AlgSel = document.getElementById('p2Alg');
const playerSideSel = document.getElementById('playerSide');
const speedSel = document.getElementById('speed');
const restartBtn = document.getElementById('restart');
const toggleBtn = document.getElementById('toggle');
const aiIndicator = document.getElementById('aiIndicator');

let board = Array(9).fill(null);
let current = 'X';
let playing = false; // whether game is active
let aiThinking = false; // true while AI is computing or waiting
let autoPlay = false; // AI vs AI playing
// Totals for metrics
let totalDecisionTime = 0;
let totalNodes = 0;
let totalPruned = 0;
let pendingTimeoutId = null;

function updateTotalsUI(){
  const tEl = document.getElementById('totalTime');
  const nEl = document.getElementById('totalNodes');
  const pEl = document.getElementById('totalPruned');
  if(tEl) tEl.textContent = Math.round(totalDecisionTime) + ' ms';
  if(nEl) nEl.textContent = totalNodes;
  if(pEl) pEl.textContent = totalPruned;
}

function updateAiIndicator(){
  if(!aiIndicator) return;
  if(aiThinking) aiIndicator.classList.add('visible'); else aiIndicator.classList.remove('visible');
}

function getAlgForPlayer(player){
  if(modeSel.value === 'AI_AI'){
    return player === 'X' ? (p1AlgSel ? p1AlgSel.value : algSel.value) : (p2AlgSel ? p2AlgSel.value : algSel.value);
  }
  return algSel.value;
}

// show/hide per-side alg selectors when mode changes
modeSel.addEventListener('change', ()=>{
  const isAIvsAI = modeSel.value === 'AI_AI';
  document.querySelectorAll('.ai-ai-only').forEach(el=> el.style.display = isAIvsAI ? '' : 'none');
  document.querySelectorAll('.single-alg').forEach(el=> el.style.display = isAIvsAI ? 'none' : '');
  reset();
});

const winningLines = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function isTerminal(b){
  for(const line of winningLines){
    const [a,c,d] = line;
    if(b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a], line };
  }
  if(b.every(x=>x!==null)) return { winner: null };
  return null;
}

function legalMoves(b){ return b.map((v,i)=>v===null?i:null).filter(x=>x!==null); }

function applyMove(i, player){ board[i]=player; }
function undoMove(i){ board[i]=null; }

// Draw board and attach handlers
function render(){
  boardEl.innerHTML = '';
  // safety: if not AI-thinking and game seems inactive but it should be human's turn, re-enable
  const termNow = isTerminal(board);
  if(!aiThinking && !playing && !termNow && modeSel.value === 'HUMAN_AI'){
    const playerSide = playerSideSel ? playerSideSel.value : 'X';
    if(current === playerSide){
      console.debug('[render] Safety re-enable playing=true (current matches playerSide)', {current, playerSide, playing, aiThinking});
      playing = true;
    }
  }
  for(let i=0;i<9;i++){
    const v = board[i];
    const c = document.createElement('div');
    c.className = 'cell';
    if(!playing || aiThinking) c.classList.add('disabled');
    c.dataset.index = i;
    c.textContent = v||'';
    c.addEventListener('click', ()=> onCellClick(i));
    boardEl.appendChild(c);
  }
  console.debug('[render] playing, aiThinking, current, board:', { playing, aiThinking, current, board });
}

// Create/clear SVG overlay for win line
function clearWinLine(){ const svg = document.querySelector('.win-line-svg'); if(svg) svg.remove(); }
function drawWinLine(line){
  clearWinLine();
  if(!line) return;
  // Ensure board is the positioned container for the SVG
  boardEl.style.position = boardEl.style.position || 'relative';
  const boardRect = boardEl.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','win-line-svg');
  // Make SVG fill the board container and position absolutely inside it
  svg.style.position='absolute';
  svg.style.left = '0px';
  svg.style.top = '0px';
  svg.style.pointerEvents = 'none';
  svg.setAttribute('width', Math.round(boardRect.width));
  svg.setAttribute('height', Math.round(boardRect.height));
  svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
  // Compute centers of the cells relative to boardRect
  const cells = boardEl.querySelectorAll('.cell');
  const getCenter = (el)=>{
    const r = el.getBoundingClientRect();
    return { x: (r.left - boardRect.left) + r.width/2, y: (r.top - boardRect.top) + r.height/2 };
  };
  const s = getCenter(cells[line[0]]);
  const e = getCenter(cells[line[2]]);
  const ln = document.createElementNS(svg.namespaceURI,'line');
  ln.setAttribute('x1', s.x); ln.setAttribute('y1', s.y);
  ln.setAttribute('x2', e.x); ln.setAttribute('y2', e.y);
  ln.setAttribute('stroke','#e74c3c'); ln.setAttribute('stroke-width','6'); ln.setAttribute('stroke-linecap','round');
  svg.appendChild(ln);
  // Append inside board so it's aligned with cells
  boardEl.appendChild(svg);
}

function reset(){
  board = Array(9).fill(null);
  // Set current based on player side selector: X always starts first
  const playerSide = playerSideSel ? playerSideSel.value : 'X';
  current = 'X';
  playing = true;
  autoPlay = false;
  toggleBtn.textContent = 'Play';
  timeEl.textContent = '-'; nodesEl.textContent='-'; prunedEl.textContent='-';
  // reset totals
  totalDecisionTime = 0; totalNodes = 0; totalPruned = 0;
  updateTotalsUI();
  logEl.innerHTML = '';
  clearWinLine();
  render();
  statusEl.textContent = `Status: ${current} to move`;
  // If mode is Human vs AI and player chose to be O (second), trigger AI to play first
  if(modeSel.value === 'HUMAN_AI' && playerSideSel && playerSideSel.value === 'O'){
    // AI is X and should move
    current = 'X';
    // clear any pending AI timeouts (leftover) and schedule the AI move after a short delay
    if(pendingTimeoutId){ clearTimeout(pendingTimeoutId); pendingTimeoutId = null; }
    setTimeout(()=>{ console.debug('[reset] scheduling initial AI move'); triggerSingleAI(); }, 120);
  }
}

function appendMoveToLog(player, index){
  // remove recent highlight
  const prev = logEl.querySelector('.move-chip.recent'); if(prev) prev.classList.remove('recent');
  const chip = document.createElement('div'); chip.className = 'move-chip recent';
  const p = document.createElement('span'); p.className='player'; p.textContent = player;
  const pos = document.createElement('span'); pos.className='pos'; pos.textContent = `->${index}`;
  chip.appendChild(p); chip.appendChild(pos);
  logEl.appendChild(chip);
}

function onCellClick(i){
  console.debug('[onCellClick] start', {i, playing, aiThinking, current});
  const mode = modeSel.value;
  const alg = algSel.value;
  // Determine if current side is human
  const playerSide = playerSideSel ? playerSideSel.value : 'X';
  // Determine if current side is human (in HUMAN_AI mode, human plays the selected side)
  const isHuman = (mode === 'HUMAN_HUMAN') || (mode === 'HUMAN_AI' && current === playerSide);
  // (In HUMAN_AI we assume X is human, O is AI for simplicity)
  if(!isHuman) return;
  if(board[i]) return;
  if(!playing || aiThinking) return; // prevent clicks after game end or while AI thinking
  applyMove(i, current);
  appendMoveToLog(current, i);
  render();
  const term = isTerminal(board);
  if(term){ finish(term); return; }
  current = current === 'X' ? 'O' : 'X';
  statusEl.textContent = `Status: ${current} to move`;
  // If next player is AI and mode allows, trigger AI move
  if(mode === 'HUMAN_AI'){
    const playerSide = playerSideSel ? playerSideSel.value : 'X';
    if(current !== playerSide) triggerSingleAI();
  }
  console.debug('[onCellClick] end', {i, playing, aiThinking, current, board});
}

// Evaluation function
function evaluate(b, player, depth=0){
  const t = isTerminal(b);
  if(t){
    if(t.winner === player) return 10 - depth;
    if(t.winner === null) return 0;
    return depth - 10;
  }
  return 0;
}

// Minimax (no aggressive optimizations for simplicity)
function minimaxRoot(b, player, depthLimit=5){
  let nodes=0; const start = performance.now();
  const moves = legalMoves(b);
  let best=-Infinity; let bestMoves = [];
  for(const m of moves){
    b[m]=player;
    nodes++;
    const v = minimax(b, player, false, 1, depthLimit);
    b[m]=null;
    if(v>best){ best = v; bestMoves = [m]; }
    else if(v === best){ bestMoves.push(m); }
  }
  // choose among equals at random to avoid deterministic first-move bias
  const choice = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  return { moveIndex: choice, stats: { decisionTimeMs: performance.now()-start, nodesExplored: nodes, nodesPruned:0 }};
}
function minimax(b, player, isMax, depth, depthLimit){ const t=isTerminal(b); if(t) return evaluate(b, player, depth); if(depth>=depthLimit) return evaluate(b, player, depth); let best = isMax? -Infinity: Infinity; const moves=legalMoves(b); for(const m of moves){ b[m] = isMax? player: (player==='X'?'O':'X'); const v = minimax(b, player, !isMax, depth+1, depthLimit); b[m]=null; best = isMax? Math.max(best,v): Math.min(best,v); } return best; }

// Alpha-beta
function alphaBetaRoot(b, player, depthLimit=5){
  let nodes=0, pruned=0;
  const start = performance.now();
  const moves = legalMoves(b);
  let best = -Infinity;
  let bestMoves = [];
  let alpha = -Infinity, beta = Infinity;
  for(const m of moves){
    b[m] = player; nodes++;
    const v = alphaBeta(b, player, false, 1, alpha, beta, depthLimit, {incNode:()=>nodes++, incPrune:()=>pruned++});
    b[m] = null;
    if(v > best){ best = v; bestMoves = [m]; }
    else if(v === best){ bestMoves.push(m); }
    alpha = Math.max(alpha, best);
  }
  const choice = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  return { moveIndex: choice, stats: { decisionTimeMs: performance.now()-start, nodesExplored: nodes, nodesPruned: pruned }};
}
function alphaBeta(b, player, isMax, depth, alpha, beta, depthLimit, counters){ const t=isTerminal(b); if(t) return evaluate(b, player, depth); if(depth>=depthLimit) return evaluate(b, player, depth); const moves=legalMoves(b); if(isMax){ let value=-Infinity; for(const m of moves){ b[m]=player; counters.incNode(); const v = alphaBeta(b, player, false, depth+1, alpha, beta, depthLimit, counters); b[m]=null; value = Math.max(value,v); alpha=Math.max(alpha,value); if(alpha>=beta){ counters.incPrune(); break; } } return value; } else { let value=Infinity; for(const m of moves){ b[m]=(player==='X'?'O':'X'); counters.incNode(); const v = alphaBeta(b, player, true, depth+1, alpha, beta, depthLimit, counters); b[m]=null; value = Math.min(value,v); beta=Math.min(beta,value); if(alpha>=beta){ counters.incPrune(); break; } } return value; } }

// AI triggers
function triggerSingleAI(){
  // invert speed slider so left=slower (bigger delay), right=faster (smaller delay)
  const sliderVal = Number(speedSel.value);
  const minV = Number(speedSel.min || 50);
  const maxV = Number(speedSel.max || 800);
  const delay = (maxV + minV) - sliderVal; // invert mapping
  // mark AI thinking while scheduled
  aiThinking = true;
  updateAiIndicator();
  console.debug('[triggerSingleAI] scheduling AI move', { current, playing });
  pendingTimeoutId = setTimeout(()=>{
    try {
      const algToUse = getAlgForPlayer(current);
      const res = (algToUse==='MINIMAX')? minimaxRoot(board, current, 5) : alphaBetaRoot(board, current, 5);
      applyMove(res.moveIndex, current);
      appendMoveToLog(current, res.moveIndex);
      timeEl.textContent = Math.round(res.stats.decisionTimeMs)+" ms";
      nodesEl.textContent = res.stats.nodesExplored;
      prunedEl.textContent = res.stats.nodesPruned;
      // update totals
      totalDecisionTime += res.stats.decisionTimeMs;
      totalNodes += res.stats.nodesExplored;
      totalPruned += res.stats.nodesPruned || 0;
      updateTotalsUI();
      render();
      const term = isTerminal(board);
      if(term){ finish(term); return; }
      current = current==='X'?'O':'X';
      statusEl.textContent = `Status: ${current} to move`;
      // re-enable clicks only if next player is human
      if(modeSel.value === 'HUMAN_AI'){
        const playerSide = playerSideSel ? playerSideSel.value : 'X';
        if(current === playerSide) playing = true; // human's turn
      } else {
        playing = true;
      }
      // re-render so disabled classes update immediately
      render();
      if(modeSel.value === 'AI_AI' && autoPlay) tickAI();
    } finally {
      aiThinking = false;
      pendingTimeoutId = null;
      console.debug('[triggerSingleAI] AI move completed', { current, playing, aiThinking });
      // ensure UI updates after AI thinking flag cleared
      render();
      updateAiIndicator();
    }
  }, delay);
}

function tickAI(){
  if(!autoPlay) return;
  const sliderVal = Number(speedSel.value);
  const minV = Number(speedSel.min || 50);
  const maxV = Number(speedSel.max || 800);
  const delay = (maxV + minV) - sliderVal;
  // mark AI as thinking while scheduled and disable human input until step completes
  aiThinking = true;
  updateAiIndicator();
  playing = false;
  pendingTimeoutId = setTimeout(()=>{
    try {
  const algToUse = getAlgForPlayer(current);
  const res = (algToUse==='MINIMAX')? minimaxRoot(board, current,5): alphaBetaRoot(board,current,5);
      applyMove(res.moveIndex, current);
      appendMoveToLog(current, res.moveIndex);
      timeEl.textContent = Math.round(res.stats.decisionTimeMs)+" ms";
      nodesEl.textContent = res.stats.nodesExplored;
      prunedEl.textContent = res.stats.nodesPruned;
      totalDecisionTime += res.stats.decisionTimeMs;
      totalNodes += res.stats.nodesExplored;
      totalPruned += res.stats.nodesPruned || 0;
      updateTotalsUI();
      render();
      const term = isTerminal(board);
      if(term){ finish(term); stopAuto(); return; }
      current = current==='X'?'O':'X';
      statusEl.textContent = `Status: ${current} to move`;
      if(autoPlay) tickAI();
    } finally {
      aiThinking = false;
      pendingTimeoutId = null;
      updateAiIndicator();
    }
  }, delay);
}

function startAuto(){ autoPlay=true; toggleBtn.textContent='Pause'; tickAI(); }
function stopAuto(){ autoPlay=false; toggleBtn.textContent='Play'; }

function finish(term){ if(term.line) drawWinLine(term.line); if(term.winner) statusEl.textContent = `Winner: ${term.winner}`; else statusEl.textContent = 'Draw'; playing=false; }

restartBtn.addEventListener('click', ()=>{ reset(); });
toggleBtn.addEventListener('click', ()=>{
  // Auto-play only allowed for AI vs AI mode. Prevent accidental start in HUMAN modes.
  if(modeSel.value !== 'AI_AI'){
    console.debug('[toggle] Auto-play only available in AI vs AI mode; ignoring');
    alert('Auto-play is only available in AI vs AI mode. Switch mode to "AI vs AI" to use Play.');
    return;
  }
  if(autoPlay) stopAuto(); else { startAuto(); }
});

// initialize
reset(); render();

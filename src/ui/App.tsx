import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, Check, CircleHelp, ImagePlus, LockKeyhole, RotateCcw, X } from "lucide-react";

type Question = { id: string; function: string; kind: string };
type Piece = { id: string; questionId: string; imageIndex: number; unlocked: boolean; solveOrder: number | null };
type PhotoSelection = { src: string; label: string };
type Run = { size: number; mode: "auto" | "manual"; questions: Question[]; pieces: Piece[]; placements: (string | null)[]; completed: boolean; completedByCode?: boolean; photo: string; photoLabel: string };
type AnswerKeyItem = Question & { roots: string[] };
type CodewordItem = { label: string; code: string };
type Screen = "home" | "game" | "finish";

const PHOTO_OPTIONS: PhotoSelection[] = [
  { src: "/flower-puzzle.png", label: "Golden garden" },
  { src: "/study-images/flower-study-02.png", label: "Pink and white blooms" },
  { src: "/study-images/flower-study-03.png", label: "Garden bed" },
  { src: "/study-images/flower-study-04.png", label: "Globe-shaped blooms" },
  { src: "/study-images/flower-study-05.png", label: "Yellow bloom" },
  { src: "/study-images/flower-study-06.png", label: "Pink close-up" },
  { src: "/study-images/flower-study-07.png", label: "Red bloom" },
];
const MAX_LOCAL_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_LOCAL_PHOTO_DATA_LENGTH = 1_500_000;
const STORAGE = "roots-petals-session-v2";
const AUTO_MODE_STORAGE = "roots-petals-auto-unlocked";
const LEVELS = [
  { size: 12, name: "Easy", note: "A few roots to find", shape: "4 × 3" },
  { size: 16, name: "Medium", note: "A little more to untangle", shape: "4 × 4" },
  { size: 32, name: "Hard", note: "Keep your eye on the details", shape: "8 × 4" },
  { size: 64, name: "Harder", note: "64 functions · Manual only", shape: "8 × 8" },
  { size: 128, name: "Impossible", note: "128 functions · long run · Manual only", shape: "16 × 8" },
];
// The first letters form a quiet reading trail; the small rust rule marks each note in order.
const FIELD_NOTES = [
  "Late light catches on the smallest petals.", "In damp soil, the roots keep their own map.",
  "Leaves turn toward whatever warmth remains.", "Yellow flowers gather where the path bends.",
  "Only patient eyes find the garden’s pattern.", "Footsteps fade; the seed heads stay.",
  "The narrow stem leans into the morning.", "Here, violet blooms interrupt the gold.",
  "Each fallen petal marks a passing hour.", "Vines wander farther than the eye expects.",
  "After rain, every color deepens.", "Look beneath the leaves for new growth.",
  "Little things make a place feel familiar.", "Evening settles softly over the beds.",
  "You can find the whole in its fragments.",
];

function loadSavedRun(): Run | null {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return null;
    const run = JSON.parse(raw) as Partial<Run>;
    if (![12,16,32,64,128].includes(run.size as number) || run.pieces?.length !== run.size) return null;
    return { ...run, photo: typeof run.photo === "string" ? run.photo : PHOTO_OPTIONS[0].src, photoLabel: typeof run.photoLabel === "string" ? run.photoLabel : PHOTO_OPTIONS[0].label } as Run;
  }
  catch { return null; }
}
function shuffle<T>(items: T[]): T[] { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function randomPhoto(excludeSrc?:string):PhotoSelection{const options=PHOTO_OPTIONS.filter(photo=>photo.src!==excludeSrc);return options[Math.floor(Math.random()*options.length)]??PHOTO_OPTIONS[0];}
function displayMath(v: string) { return v.replace(/\^2\b/g,"²").replace(/\^3\b/g,"³").replace(/\*/g,"·").replace(/sqrt\s*\(/gi,"√("); }
function gridShape(n: number): [number,number] { return n===12?[4,3]:n===16?[4,4]:n===32?[8,4]:n===64?[8,8]:[16,8]; }
function cellStyle(index: number, size: number, photo: string): React.CSSProperties { const [cols,rows]=gridShape(size); return {backgroundImage:`url("${photo}")`,backgroundSize:`${cols*100}% ${rows*100}%`,backgroundPosition:`${(index%cols)/(cols-1)*100}% ${Math.floor(index/cols)/(rows-1)*100}%`}; }
function errorText(e: unknown, fallback: string) { return e instanceof Error?e.message:fallback; }
async function request<T>(url:string, init?:RequestInit):Promise<T>{const res=await fetch(url,{...init,headers:{"Content-Type":"application/json",...init?.headers}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||"Couldn’t reach the puzzle server.");return data as T;}

async function compressLocalPhoto(file: File): Promise<PhotoSelection> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > MAX_LOCAL_PHOTO_BYTES) throw new Error("Choose an image smaller than 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser couldn’t prepare that image.");
    context.fillStyle = "#f4f1e8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const src = canvas.toDataURL("image/jpeg", 0.84);
    if (src.length > MAX_LOCAL_PHOTO_DATA_LENGTH) throw new Error("That image is still too large after resizing. Try a smaller photo.");
    return { src, label: file.name.slice(0, 100) || "Your photograph" };
  } finally {
    bitmap.close();
  }
}

export default function App() {
  const initial=loadSavedRun();
  const [screen,setScreen]=useState<Screen>(initial?.completed?"finish":initial?"game":"home");
  const [run,setRun]=useState<Run|null>(initial);
  const [mode,setMode]=useState<"auto"|"manual">("manual");
  const [autoModeUnlocked,setAutoModeUnlocked]=useState(()=>sessionStorage.getItem(AUTO_MODE_STORAGE)==="yes");
  const [mobilePane,setMobilePane]=useState<"board"|"pieces">("board");
  const [modalPiece,setModalPiece]=useState<string|null>(null),[answer,setAnswer]=useState(""),[answerMessage,setAnswerMessage]=useState("");
  const [codewords,setCodewords]=useState<CodewordItem[]|null>(null),[screenEffectText,setScreenEffectText]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[selectedPiece,setSelectedPiece]=useState<string|null>(null),[dragPiece,setDragPiece]=useState<string|null>(null),[boardMessage,setBoardMessage]=useState("");
  const [answerKey,setAnswerKey]=useState<AnswerKeyItem[]|null>(null),[helpOpen,setHelpOpen]=useState(false);
  const [customPhoto,setCustomPhoto]=useState<PhotoSelection|null>(null),[photoMessage,setPhotoMessage]=useState(""),[photoBusy,setPhotoBusy]=useState(false);
  useEffect(()=>{if(run)sessionStorage.setItem(STORAGE,JSON.stringify(run));else sessionStorage.removeItem(STORAGE);},[run]);
  useEffect(()=>{if(!screenEffectText)return;const timeout=window.setTimeout(()=>setScreenEffectText(null),5000);return()=>window.clearTimeout(timeout);},[screenEffectText]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(run&&!run.completed){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[run]);
  const pieces=run?.pieces??[]; const unlocked=pieces.filter(p=>p.unlocked).length; const placed=run?.placements.filter(Boolean).length??0;
  const question=useMemo(()=>{if(!run||!modalPiece)return null;const p=run.pieces.find(x=>x.id===modalPiece);return p?run.questions.find(q=>q.id===p.questionId)??null:null;},[run,modalPiece]);
  const cols=run?gridShape(run.size)[0]:4;

  async function beginRun(size:number, selectedMode=mode, photoOverride?:PhotoSelection){setBusy(true);setBoardMessage("");try{const {questions}=await request<{questions:Question[]}>(`/api/start?count=${size}`);if(questions.length!==size)throw new Error("The question bank returned the wrong number of problems.");const slots=shuffle(Array.from({length:size},(_,i)=>i));const next:Piece[]=shuffle(questions.map(q=>({id:q.id,questionId:q.id,imageIndex:slots[questions.indexOf(q)],unlocked:false,solveOrder:null})));const actualMode=size>=64?"manual":selectedMode;const photo=photoOverride??customPhoto??randomPhoto(run?.photo);setRun({size,mode:actualMode,questions,pieces:next,placements:Array(size).fill(null),completed:false,photo:photo.src,photoLabel:photo.label});if(size>=64&&selectedMode==="auto")setMode("manual");setSelectedPiece(null);setModalPiece(null);setMobilePane("board");setScreen("game");}catch(e){setBoardMessage(errorText(e,"Couldn’t start the puzzle."));}finally{setBusy(false);}}
  async function handlePhotoChange(event:ChangeEvent<HTMLInputElement>){const input=event.currentTarget;const file=input.files?.[0];if(!file)return;setPhotoBusy(true);setPhotoMessage("");try{const photo=await compressLocalPhoto(file);setCustomPhoto(photo);setPhotoMessage("Your photo is ready for the next study.");}catch(e){setPhotoMessage(errorText(e,"Couldn’t use that photo."));}finally{setPhotoBusy(false);input.value="";}}
  function changePlacement(slot:number,id:string|null){if(!run||run.completed)return;if(id&&!run.pieces.some(p=>p.id===id&&p.unlocked))return;setRun(cur=>{if(!cur)return cur;const next=[...cur.placements];const existing=next.indexOf(id??"");if(existing>=0)next[existing]=null;next[slot]=id;return {...cur,placements:next};});setSelectedPiece(null);setBoardMessage("");}
  function trayClick(piece:Piece){if(!run)return;if(!piece.unlocked){setAnswer("");setAnswerMessage("");setModalPiece(piece.id);return;}if(run.mode==="manual"){setSelectedPiece(cur=>cur===piece.id?null:piece.id);setBoardMessage("");}}
  async function submitAnswer(e:FormEvent){e.preventDefault();if(!question||!modalPiece||!run)return;setBusy(true);setAnswerMessage("");try{
    const result=await request<{correct?:boolean;questionSolved?:boolean;keyUnlocked?:boolean;answerKey?:AnswerKeyItem[];autoModeUnlocked?:boolean;puzzleCompleted?:boolean;puzzleRestarted?:boolean;codewords?:CodewordItem[];screenEffectText?:string}>("/api/answer",{method:"POST",body:JSON.stringify({questionId:question.id,answer})});
    if(result.puzzleCompleted){const pieces=run.pieces.map((piece,index)=>({...piece,unlocked:true,solveOrder:index+1}));const placements:Array<string|null>=Array(run.size).fill(null);for(const piece of pieces)placements[piece.imageIndex]=piece.id;setRun({...run,pieces,placements,completed:true,completedByCode:true});setModalPiece(null);setAnswer("");setSelectedPiece(null);setBoardMessage("");setScreen("finish");return;}
    if(result.puzzleRestarted){setModalPiece(null);setAnswer("");setAnswerMessage("");await beginRun(run.size,run.mode,{src:run.photo,label:run.photoLabel});return;}
    if(result.codewords){setCodewords(result.codewords);setModalPiece(null);setAnswer("");return;}
    if(result.screenEffectText){setScreenEffectText(result.screenEffectText);setModalPiece(null);setAnswer("");return;}
    if(result.autoModeUnlocked){sessionStorage.setItem(AUTO_MODE_STORAGE,"yes");setAutoModeUnlocked(true);setModalPiece(null);setAnswer("");setAnswerMessage("");setBoardMessage("A new placement method is now available for future studies.");return;}
    if(result.keyUnlocked&&result.answerKey){setAnswerKey(result.answerKey);setModalPiece(null);setAnswer("");return;}
    if(result.correct||result.questionSolved){const order=run.pieces.filter(p=>p.unlocked).length+1;setRun(cur=>{if(!cur)return cur;const updated=cur.pieces.map(p=>p.id===modalPiece?{...p,unlocked:true,solveOrder:order}:p);const target=updated.find(p=>p.id===modalPiece);const placements=[...cur.placements];if(cur.mode==="auto"&&target)placements[target.imageIndex]=target.id;return {...cur,pieces:updated,placements};});if(run.mode==="manual")setSelectedPiece(modalPiece);setModalPiece(null);setAnswer("");}
    else setAnswerMessage("Not quite yet. Check both zeros and try again.");
  }catch(e){setAnswerMessage(errorText(e,"Couldn’t check that answer."));}finally{setBusy(false);}}
  function submitBoard(){if(!run||run.placements.some(x=>!x))return;const solved=run.placements.every((id,slot)=>run.pieces.find(p=>p.id===id)?.imageIndex===slot);if(solved){const next={...run,completed:true};setRun(next);setBoardMessage("");setScreen("finish");}else setBoardMessage("Not quite assembled. Compare the larger shapes and color flow, then try again; no individual positions are identified.");}
  function drop(e:DragEvent<HTMLButtonElement>,slot:number){e.preventDefault();const id=e.dataTransfer.getData("text/plain")||dragPiece;if(id)changePlacement(slot,id);setDragPiece(null);}
  function closeRun(){if(confirm("Leave this puzzle? Your progress will be lost when this tab closes.")){setRun(null);setScreen("home");setAnswerKey(null);}}

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={()=>setScreen("home")}><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 42 42"><path d="M21 5c4 5 5 8 0 12-5-4-4-7 0-12Zm16 16c-5 4-8 5-12 0 4-5 7-4 12 0ZM21 37c-4-5-5-8 0-12 5 4 4 7 0 12ZM5 21c5-4 8-5 12 0-4 5-7 4-12 0Z"/><circle cx="21" cy="21" r="3"/></svg></span><span>fieldnotes <i>/</i> 04</span></button>
      <div className="header-right"><button className="icon-button" aria-label="How to play" onClick={()=>setHelpOpen(true)}><CircleHelp size={19}/></button></div>
    </header>

    {screen==="home"&&<main className="home-view">
      <section className="home-hero"><div className="hero-copy"><p className="overline"><span className="rule"/> BOTANICAL STUDY · NO. 04</p><h1>Roots beneath<br/><em>the petals.</em></h1><p className="hero-lede">A field puzzle in two parts: solve a quadratic, then find where its fragment belongs in the garden.</p><a className="text-link" href="#specimens">Choose your field study <ArrowDownRight size={17}/></a><p className="field-quote"><span className="note-rule"/>{FIELD_NOTES[0]}<small>— Field note, late spring</small></p></div>
        <figure className="hero-plate"><div className="plate-index">PLATE <b>04</b><span>·</span> IMAGE HELD IN RESERVE</div><div className="sealed-plate" role="img" aria-label="The puzzle photograph is concealed until the image is reconstructed"><svg viewBox="0 0 72 72" aria-hidden="true"><rect x="15" y="9" width="42" height="54"/><path d="M23 22h26M23 30h26M23 38h17M23 50h26M23 56h18"/><circle cx="50" cy="47" r="7"/></svg><span>THE IMAGE STAYS HIDDEN</span><small>Reveal it by solving the equations</small></div><figcaption><span>Study image · 01</span></figcaption><span className="plate-side-note">The record opens when the work is complete</span></figure></section>
      <section className="game-setup" id="specimens"><div className="setup-title"><p className="overline"><span className="rule"/> SELECT A STUDY</p><h2>Can you bring this flower study back into focus?</h2><p>Every fragment is earned with a different function.</p></div><div className="setup-options">
        <div className="photo-source"><div className="photo-source-copy"><span className="small-label">IMAGE SOURCE</span><p>{customPhoto?`Your photo · ${customPhoto.label}`:`Random garden photo · ${PHOTO_OPTIONS.length} images`}</p><small>{photoBusy?"Preparing your image locally…":"JPEG, PNG, or WebP · up to 12 MB · never uploaded."}</small></div><div className="photo-source-actions"><label className={`photo-picker-button ${photoBusy?"is-busy":""}`}><ImagePlus size={15}/>{customPhoto?"Change photo":"Choose a photo"}<input className="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} disabled={busy||photoBusy}/></label>{customPhoto&&<button className="photo-random-button" type="button" onClick={()=>{setCustomPhoto(null);setPhotoMessage("New studies will use a random garden photo.");}} disabled={busy||photoBusy}>Use random set</button>}</div>{photoMessage&&<p className="photo-status" role="status">{photoMessage}</p>}</div>
        <div className="mode-select"><span className="small-label">PLACEMENT METHOD</span>{autoModeUnlocked?<div className="mode-buttons"><button className={mode==="auto"?"active":""} onClick={()=>setMode("auto")} disabled={busy}>Auto <small>Image assembles as you solve</small></button><button className={mode==="manual"?"active":""} onClick={()=>setMode("manual")} disabled={busy}>Manual <small>Place fragments yourself</small></button></div>:<div className="mode-buttons manual-only"><button className="active" onClick={()=>setMode("manual")} disabled={busy}>Manual <small>Place fragments yourself</small></button></div>}<p className="mode-footnote">64- and 128-piece studies require Manual.{autoModeUnlocked?"":" A second method may be found in the field."}</p></div>
        <div className="difficulty-list"><div className="difficulty-head"><span className="small-label">DIFFICULTY</span><span className="small-label">QUESTIONS · BOARD</span></div>{LEVELS.map((level,i)=><button className="difficulty-row" key={level.name} onClick={()=>beginRun(level.size,mode)} disabled={busy||photoBusy}><span className="difficulty-index">0{i+1}</span><span className="difficulty-name">{level.name}<small>{level.note}</small></span><span className="difficulty-size">{level.size}<small>{level.shape}</small></span><ArrowRight size={18}/></button>)}</div>
        {busy&&<p className="inline-note">Preparing the questions…</p>}{boardMessage&&<p className="inline-error">{boardMessage}</p>}{run&&!run.completed&&<button className="resume-button" onClick={()=>setScreen("game")}>Return to your {LEVELS.find(x=>x.size===run.size)?.name} study <ArrowRight size={15}/></button>}
      </div></section><footer className="site-footer"><span className="maker-credit">Made by Slopey Boys · 6 students · SPE11</span></footer>
    </main>}

    {screen==="game"&&run&&<main className="game-view"><div className="game-heading"><button className="back-link" onClick={closeRun}><ArrowLeft size={16}/> End study</button><div><p className="overline"><span className="rule"/> {LEVELS.find(x=>x.size===run.size)?.name.toUpperCase()} STUDY · {run.size} FRAGMENTS · {run.mode.toUpperCase()} MODE</p><h1>Reconstruct the garden.</h1></div><button className="reset-link" onClick={()=>{if(confirm("Start a fresh study? Current progress will be replaced."))beginRun(run.size,run.mode,{src:run.photo,label:run.photoLabel});}}><RotateCcw size={15}/> Start over</button></div>
      <div className="mobile-pane-switch" role="group" aria-label="Puzzle workspace"><button aria-pressed={mobilePane==="board"} className={mobilePane==="board"?"active":""} onClick={()=>setMobilePane("board")}>Board <small>{placed}/{run.size}</small></button><button aria-pressed={mobilePane==="pieces"} className={mobilePane==="pieces"?"active":""} onClick={()=>setMobilePane("pieces")}>Pieces <small>{unlocked}/{run.size}</small></button></div><div className={`game-layout mobile-pane-${mobilePane}`}><section className="board-panel"><div className="panel-heading"><div><p className="small-label">FIELD CANVAS</p><h2>Image reconstruction</h2></div><span className="quiet-count">{placed} <i>/</i> {run.size}</span></div>{unlocked>0&&<p className="field-note-line"><span className="note-rule"/> {FIELD_NOTES[Math.min(unlocked,FIELD_NOTES.length-1)]}</p>}{run.size>=64&&<p className="wide-board-note">Scroll sideways across the board to reach each column.</p>}<div className={`board-viewport ${run.size>=64?"wide-board":""}`}><div className="puzzle-board" data-size={run.size} style={{gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`}}>{run.placements.map((id,slot)=>{const p=run.pieces.find(x=>x.id===id);return <button key={slot} className={`board-slot ${p?"filled":""} ${selectedPiece?"can-place":""}`} aria-label={p?"Placed image fragment; click to remove":"Empty image position"} onClick={()=>p?changePlacement(slot,null):selectedPiece&&changePlacement(slot,selectedPiece)} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,slot)}>{p&&<span className="photo-fragment" style={cellStyle(p.imageIndex,run.size,run.photo)}/>}</button>;})}</div></div><div className="board-caption"><span>{run.mode==="auto"?"Fragments reveal in their original positions.":selectedPiece?"Fragment selected · choose a space":"Select a fragment, then choose a space."}</span><span>Position feedback withheld until submission.</span></div>{boardMessage&&<div className="board-feedback" role="status">{boardMessage}</div>}<button className="check-board" disabled={placed!==run.size} onClick={submitBoard}>Submit reconstruction <ArrowRight size={17}/></button></section>
      <aside className="pieces-panel"><div className="panel-heading"><div><p className="small-label">SPECIMEN DRAWER</p><h2>Question fragments</h2></div><span className="quiet-count">{unlocked}<i> / </i>{run.size}</span></div><div className="piece-progress"><i style={{width:`${unlocked/run.size*100}%`}}/></div><p className="pieces-instruction">Find the factors of each quadratic function to release its photographic fragment. In manual mode, a small number records when you found them.</p><div className={`piece-tray ${run.size>=64?"tray-dense":""}`}>{pieces.map(p=>{const isPlaced=run.placements.includes(p.id);return <button key={p.id} className={`tray-piece ${p.unlocked?"unlocked":"locked"} ${selectedPiece===p.id?"selected":""} ${isPlaced?"is-placed":""}`} aria-label={p.unlocked?`Fragment solved ${p.solveOrder}`:"Locked fragment; open function"} draggable={p.unlocked&&run.mode==="manual"} onDragStart={e=>{e.dataTransfer.setData("text/plain",p.id);e.dataTransfer.effectAllowed="move";setDragPiece(p.id);}} onDragEnd={()=>setDragPiece(null)} onClick={()=>trayClick(p)}>{p.unlocked?<><span className="photo-fragment" style={cellStyle(p.imageIndex,run.size,run.photo)}/>{run.mode==="manual"&&<span className="solve-order">{p.solveOrder}</span>}</>:<LockKeyhole size={run.size>=64?12:15} strokeWidth={1.5}/>}</button>;})}</div><div className="drawer-legend"><span><LockKeyhole size={12}/> SEALED</span><span><i/> RELEASED</span><span className="no-hints">No position labels</span></div></aside></div></main>}

    {screen==="finish"&&run&&<main className="finish-view"><p className="overline"><span className="rule"/> FIELD STUDY COMPLETE</p><h1>The garden <em>has been reassembled!</em></h1>{!run.completedByCode&&<p className="finish-lede">{run.size} quadratic functions solved. {run.size} fragments returned to their place.</p>}<figure className="finished-photo"><img src={run.photo} alt={`Completed image: ${run.photoLabel}`}/><figcaption>Plate 04 · {run.photoLabel} reconstructed</figcaption></figure><div className="finish-actions"><button className="primary-button" onClick={()=>beginRun(run.size,run.mode,{src:run.photo,label:run.photoLabel})}>Repeat this study <RotateCcw size={16}/></button><button className="subtle-button" onClick={()=>{setRun(null);setScreen("home");}}>Choose another study <ArrowRight size={16}/></button></div><p className="finish-note">The daylily keeps time; the meadow keeps its secrets.</p><section className="credits-block" aria-labelledby="credits-title"><p className="credits-kicker">PROJECT CREDITS</p><h2 id="credits-title">Slopey Boys</h2><dl className="credits-details"><div><dt>Section</dt><dd>SPE11</dd></div><div><dt>Teacher</dt><dd>Sir Ronald Aguila</dd></div></dl><div className="credits-members"><p>Group members</p><ul><li>Kurt Abejuela</li><li>David Caseres</li><li>Justin Eria</li><li>Dave Martinez</li><li>Hernan Reyes</li><li>Sachiel Rivera</li></ul></div></section></main>}

    {codewords&&<div className="modal-backdrop"><section className="solve-modal key-modal codeword-modal" role="dialog" aria-modal="true" aria-labelledby="codeword-title"><button className="modal-close" onClick={()=>setCodewords(null)} aria-label="Close codeword list"><X size={20}/></button><p className="overline"><span className="rule"/> FIELD INDEX</p><h2 id="codeword-title">Available codewords</h2><p className="key-count">A handful of shortcuts and surprises.</p><div className="codeword-list">{codewords.map((item,index)=><article key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.code}</strong></article>)}</div></section></div>}
    {answerKey&&<div className="modal-backdrop"><section className="solve-modal key-modal" role="dialog" aria-modal="true" aria-labelledby="key-title"><button className="modal-close" onClick={()=>setAnswerKey(null)} aria-label="Close answer key"><X size={20}/></button><p className="overline"><span className="rule"/> MAKER’S INDEX</p><h2 id="key-title">Answer key</h2><p className="key-count">{answerKey.length} functions · solutions</p><div className="key-list">{answerKey.map((item,i)=><article className="key-row" key={item.id}><span>{String(i+1).padStart(3,"0")}</span><strong>{displayMath(item.function)}</strong><small>x = {item.roots.join(" · ")}</small></article>)}</div></section></div>}
    {modalPiece&&question&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setModalPiece(null);}}><section className="solve-modal" role="dialog" aria-modal="true" aria-labelledby="solve-title"><button className="modal-close" onClick={()=>setModalPiece(null)} aria-label="Close question"><X size={20}/></button><p className="overline"><span className="rule"/> QUADRATIC FUNCTION · {question.kind.toUpperCase()}</p><h2 id="solve-title">Find both factors.</h2><div className="equation-card"><span>FUNCTION OF <i>x</i></span><strong>{displayMath(question.function)}</strong></div><form onSubmit={submitAnswer} className="solve-form"><label htmlFor="root-answer">Enter both factors <small>Separate with a comma</small></label><input id="root-answer" value={answer} onChange={e=>{setAnswer(e.target.value);setAnswerMessage("");}} placeholder="e.g. −2 + 3i, −2 − 3i" autoComplete="off" autoFocus/>{answer&&<div className="answer-preview"><span>PREVIEW</span><strong>{displayMath(answer)}</strong></div>}{answerMessage&&<p className="answer-feedback" role="status">{answerMessage}</p>}<div className="answer-example"><span>ANSWER FORMAT</span><p>For <b>f(x) = x² + 5x</b>, enter <b>0, −5</b>.</p><p>Repeated zeros are entered twice: <b>f(x) = x² + 4x + 4</b> → <b>−2, −2</b>.</p></div><p className="answer-hint">Fractions, radicals, and complex zeros are accepted. Either zero order is fine.</p><button className="primary-button solve-submit" disabled={busy||!answer.trim()}>{busy?"Checking…":"Check & release fragment"}<ArrowRight size={16}/></button></form></section></div>}
    {helpOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setHelpOpen(false);}}><section className="solve-modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="modal-close" onClick={()=>setHelpOpen(false)} aria-label="Close instructions"><X size={20}/></button><p className="overline"><span className="rule"/> FIELD GUIDE</p><h2 id="help-title">A note on the method</h2><ol className="help-steps"><li><b>01 / Solve</b><span>Open a sealed tile and enter both zeros of its quadratic function.</span></li><li><b>02 / Release</b><span>A correct answer reveals a fragment of the garden photograph.</span></li><li><b>03 / Reconstruct</b><span>Auto mode restores the original image as you find zeros. Manual mode lets you drag or select and place fragments.</span></li><li><b>04 / Submit</b><span>Only the completed arrangement is checked. Incorrect submissions do not identify misplaced tiles.</span></li></ol><button className="primary-button help-done" onClick={()=>setHelpOpen(false)}>Return to the study <Check size={15}/></button></section></div>}
    {screenEffectText&&<div className="word-rain-overlay" role="status" aria-live="polite"><button className="word-rain-close" onClick={()=>setScreenEffectText(null)} aria-label="Dismiss screen effect"><X size={18}/></button><div className="word-rain" aria-hidden="true">{Array.from({length:18},(_,index)=><span key={index} style={{left:`${(index*37)%100}%`,animationDelay:`${(index%7)*.22}s`,animationDuration:`${3+(index%5)*.45}s`}}>{screenEffectText}</span>)}</div><p>{screenEffectText}</p></div>}
    <footer className="mobile-footer"><span>FIELDNOTES / 04</span><span>“Follow the quiet stem.”</span></footer>
  </div>;
}

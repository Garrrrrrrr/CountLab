/// <reference lib="webworker" />
import {solve, type UTHState} from "@/lib/uth/engine";
type Request={id:number;state:UTHState;samples:number};
self.onmessage=(event:MessageEvent<Request>)=>{const{id,state,samples}=event.data;try{const exposed=solve(state,samples),normal=state.dealerVisible===undefined?exposed:solve({player:state.player,board:state.board},samples),best=Math.max(...Object.values(exposed.evs)),normalConditional=exposed.evs[normal.action]??best;self.postMessage({id,exposed,normal,informationValue:best-normalConditional,actionChanged:exposed.action!==normal.action});}catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}};
export{};

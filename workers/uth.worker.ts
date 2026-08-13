/// <reference lib="webworker" />
import {policyImprovement,referenceOpening,solve, type UTHState} from "@/lib/uth/engine";
type Request={id:number;state:UTHState;samples:number};
self.onmessage=(event:MessageEvent<Request>)=>{const{id,state,samples}=event.data;try{const normalState={player:state.player,board:state.board},normal=state.board.length===0?referenceOpening(normalState):state.dealerVisible===undefined?solve(state,samples):solve(normalState,samples),exposed=state.dealerVisible===undefined?normal:solve(state,samples),informationValue=policyImprovement(exposed,normal),actionChanged=normal.status==="CONFIRMED"&&exposed.status==="CONFIRMED"?exposed.action!==normal.action:null;self.postMessage({id,exposed,normal,informationValue,actionChanged});}catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}};
export{};

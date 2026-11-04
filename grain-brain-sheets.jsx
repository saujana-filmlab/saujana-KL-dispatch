const grainBrainSheetRecovery={
 async transact(mode,operation){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('grainbrain-kl-sheet-recovery',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not open the local publishing recovery store.'))});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('pending',mode),request=operation(tx.objectStore('pending'));tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(Error('Could not save publishing recovery. Keep this tab open.'))})}finally{db.close()}
 },
 get(){return this.transact('readonly',s=>s.get('publication'))},
 put(value){return this.transact('readwrite',s=>s.put(value,'publication'))},
 clear(){return this.transact('readwrite',s=>s.delete('publication'))},
 async dismiss(expectedAttemptKey){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('grainbrain-kl-sheet-recovery',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not open saved upload.'))});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending'),request=store.get('publication');let removed=false;
   request.onsuccess=()=>{const saved=request.result;if(!saved)return;if(saved.attempt?.key!==expectedAttemptKey){tx.abort();return;}store.put({...saved,archivedAt:new Date().toISOString()},'archived:'+expectedAttemptKey);store.delete('publication');removed=true;};
   tx.oncomplete=()=>resolve(removed);tx.onerror=tx.onabort=()=>reject(Error('Saved upload changed. Refresh before dismissing it.'));
  })}finally{db.close()}
 }
};
async function grainBrainPublishSheets({payload,sheets,attemptRef,api,onProgress,recovery=grainBrainSheetRecovery,uploadHeaders=()=>({})}){
 const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
 const manifest=[];for(const s of sheets)manifest.push({rollIndex:s.rollIndex,filmName:s.filmName,frameCount:s.frameCount,frameFormat:s.format==='half'?'half-frame':'full-frame',numbered:s.numbered??true,deliveryHash:await digest(s.deliveryBlob),storyHash:await digest(s.storyBlob)});
 const fingerprint=JSON.stringify({manifest,payload}),pending=await recovery.get();
 if(pending&&pending.attempt.fingerprint!==fingerprint)throw Error('An unfinished publication is saved on this computer. Use Resume saved publication first.');
 if(pending)attemptRef.current=pending.attempt;
 if(attemptRef.current?.fingerprint!==fingerprint)attemptRef.current={fingerprint,key:'sheets_'+crypto.randomUUID().replaceAll('-','')};
 const attempt=attemptRef.current;
 await recovery.put({payload,sheets,attempt});
 try{
 onProgress('Preparing publishing session');
 const session=await api('prepareContactSheetPublish',{order:payload,requestKey:payload.requestKey,attemptKey:attempt.key,contactSheets:manifest});if(session.error)throw Error(session.error);attempt.session=session;
 await recovery.put({payload,sheets,attempt});
 if(session.status!=='ready'){
  const requests=manifest.flatMap(s=>['delivery','story'].map(variant=>({rollIndex:s.rollIndex,variant})));
  const ticketResponse=await api('createContactSheetUploadTickets',{orderId:session.orderId,uploadNonce:session.uploadNonce,requests});if(ticketResponse.error)throw Error(ticketResponse.error);
  for(const ticket of ticketResponse.tickets){const sheet=sheets.find(s=>s.rollIndex===ticket.rollIndex),blob=ticket.variant==='story'?sheet.storyBlob:sheet.deliveryBlob;onProgress(`Uploading roll ${ticket.rollIndex+1}, ${ticket.variant==='story'?'portrait':'landscape'}`);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);let response;
   try{response=await fetch(ticket.uploadUrl,{method:'PUT',headers:{'Content-Type':'image/jpeg',...uploadHeaders(ticket.uploadUrl)},body:blob,signal:controller.signal})}finally{clearTimeout(timer)}
   if(!response.ok)throw Error('Sheet upload failed. Use Resume saved publication to retry this same order.');
  }
 }
 onProgress('Verifying all sheets before publication');const result=await api('completeContactSheetUpload',{orderId:session.orderId,uploadNonce:session.uploadNonce});if(result.error)throw Error(result.error);await recovery.clear();return result;
 }catch(error){await recovery.put({payload,sheets,attempt,lastError:error.message}).catch(()=>{});throw error;}
}
